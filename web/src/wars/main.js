// Tokin Wars: screens, wallet sign-in (shared with the grow room), rewards.
import { BrowserProvider } from 'ethers';
import { API } from '../config.js';
import { BOARD, CONDITIONS, ABILITIES, ADDINS, STARTER_DECK, STARTER_BY_KEY, SEED_CARD, BOT_DECK, tokerCard, tokinCard, OPENSEA } from './cards.js';
import { newMatch, resolveTurn, botPlays, canPlay, power, plotTotals } from './engine.js';
import '../style.css';
import './wars.css';

const $app = document.getElementById('app');
const $who = document.getElementById('who');
const $toast = document.getElementById('toast');

// ---------- helpers ----------
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
const today = () => new Date().toISOString().slice(0, 10);

let toastTimer;
function toast(msg, bad = false) {
  $toast.textContent = msg;
  $toast.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($toast.className = ''), 4000);
}

async function api(path, { method = 'GET', body } = {}) {
  const token = store.get('ccc.token');
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { store.set('ccc.token', null); store.set('ccc.wallet', null); }
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

// ---------- wallet (same sign-in as the grow room) ----------
const wallet = () => (store.get('ccc.token') ? store.get('ccc.wallet') : null);
let nftCards = null; // holder cards, loaded once per visit

async function signIn(btn) {
  if (!window.ethereum) return toast('No wallet found. Open this page in the MetaMask app, or install MetaMask.', true);
  btn.disabled = true;
  try {
    const provider = new BrowserProvider(window.ethereum);
    const [address] = await provider.send('eth_requestAccounts', []);
    const { message } = await api('/auth/nonce', { method: 'POST', body: { address } });
    const signature = await (await provider.getSigner()).signMessage(message);
    const { token, wallet: w } = await api('/auth/verify', { method: 'POST', body: { address, signature } });
    store.set('ccc.token', token);
    store.set('ccc.wallet', w);
    nftCards = null;
    await loadNftCards();
    toast(nftCards.length ? `Loaded ${nftCards.length} of your Tokers and Tokins as cards.` : 'Signed in. No Tokers or Tokins in this wallet yet.');
  } catch (e) {
    toast(e.shortMessage || e.message, true);
  } finally {
    btn.disabled = false;
    home();
  }
}

function signOut() {
  store.set('ccc.token', null);
  store.set('ccc.wallet', null);
  nftCards = null;
  home();
}

async function loadNftCards() {
  if (nftCards || !store.get('ccc.token')) return nftCards || [];
  try {
    const j = await api('/wars/cards');
    if (j.wallet) store.set('ccc.wallet', j.wallet);
    nftCards = [...j.tokers.map(tokerCard), ...j.tokins.map(tokinCard)];
  } catch (e) {
    toast(`Couldn't load your NFT cards: ${e.message}`, true);
    nftCards = [];
  }
  return nftCards;
}

// ---------- profile: XP, Seeds, cosmetics (stored on this device for the POC) ----------
const FRAMES = [
  { id: 'plain', name: 'Plain', level: 1 },
  { id: 'leaf', name: 'Leaf', level: 2 },
  { id: 'smoke', name: 'Smoke', level: 3 },
  { id: 'gold', name: 'Gold', level: 5 },
  { id: 'neon', name: 'Neon', level: 8 }
];
const XP_PER_LEVEL = 100;
const pkey = () => 'tw.profile.' + (wallet() || 'guest');
function profile() {
  try {
    return { xp: 0, seeds: 0, wins: 0, losses: 0, draws: 0, matches: 0, lastWinDay: null, seedCard: false, frame: 'plain', deck: [], ...JSON.parse(store.get(pkey()) || '{}') };
  } catch {
    return { xp: 0, seeds: 0, wins: 0, losses: 0, draws: 0, matches: 0, lastWinDay: null, seedCard: false, frame: 'plain', deck: [] };
  }
}
const saveProfile = (p) => store.set(pkey(), JSON.stringify(p));
const levelOf = (xp) => Math.floor(xp / XP_PER_LEVEL) + 1;

// Every match pays out, win or lose. Bot matches give no rank points.
function award(outcome) {
  const p = profile();
  const before = levelOf(p.xp);
  const r = { xp: 10, seeds: 3, notes: [] };
  if (outcome === 'win') {
    r.xp += 15;
    r.seeds += 7;
    if (p.lastWinDay !== today()) { r.seeds += 20; r.notes.push('First win of the day: +20 Seeds'); p.lastWinDay = today(); }
    if (!p.seedCard) { p.seedCard = true; r.seedCard = true; }
    p.wins++;
  } else if (outcome === 'draw') { r.xp += 5; p.draws++; } else p.losses++;
  p.matches++;
  p.xp += r.xp;
  p.seeds += r.seeds;
  const after = levelOf(p.xp);
  if (after > before) {
    r.levelUp = after;
    const unlocked = FRAMES.filter((f) => f.level > before && f.level <= after);
    if (unlocked.length) r.notes.push(`Unlocked card frame: ${unlocked.map((f) => f.name).join(', ')}`);
  }
  saveProfile(p);
  return r;
}

function whoBar() {
  const w = wallet();
  const p = profile();
  $who.innerHTML = `<span class="chip"><b>Lvl</b>${levelOf(p.xp)}</span><span class="chip"><b>Seeds</b>${p.seeds}</span>` +
    (w ? `<button class="link" id="out" title="Sign out">${esc(short(w))}</button>` : '');
  const out = document.getElementById('out');
  if (out) out.onclick = signOut;
}

// ---------- cards on screen ----------
function art(c) {
  const img = c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<span class="art">${img}<span class="emo">${esc(c.art || (c.kind === 'toker' ? '🧑‍🌾' : '🌿'))}</span></span>`;
}
function tags(c) {
  const t = [];
  t.push(c.kind === 'toker' ? 'Toker' : c.male ? 'Male' : { indica: 'Indica', sativa: 'Sativa', '5050': '50/50' }[c.strain] || 'Tokin');
  if (c.addin) t.push(ADDINS[c.addin].name);
  if (c.rare) t.push('Rare');
  if (c.nft) t.push('NFT');
  return t.map((x) => `<i class="tg ${x === 'Rare' ? 'rare' : x === 'NFT' ? 'nft' : ''}">${x}</i>`).join('');
}
function abilityText(c) {
  const a = ABILITIES[c.ability];
  return a && a.name ? `<b>${a.name}.</b> ${esc(a.text(c.rare))}` : '';
}
function bigCard(c, { cls = '', attrs = '', live } = {}) {
  const pot = live ?? c.potency;
  const frame = profile().frame;
  return `<button class="tcard f-${frame} ${c.kind} ${cls}" ${attrs}>
    <span class="cost" title="Water cost">${c.cost}</span>
    <span class="pot ${pot > c.potency ? 'up' : pot < c.potency ? 'down' : ''}" title="Potency">${pot}</span>
    ${art(c)}
    <span class="nm">${esc(c.name)}</span>
    <span class="tags">${tags(c)}</span>
    <span class="ab">${abilityText(c)}${c.addin ? ` ${esc(ADDINS[c.addin].text)}` : ''}</span>
  </button>`;
}
function miniCard(c, live, attrs = '', cls = '') {
  return `<button class="mini ${c.kind} ${cls}" ${attrs} title="${esc(c.name)}">${art(c)}<span class="mp ${live > c.potency ? 'up' : live < c.potency ? 'down' : ''}">${live}</span></button>`;
}

// ---------- home ----------
async function home() {
  stopTimer();
  whoBar();
  // Signed in from the grow room too: the token is shared, the wallet comes back with the cards.
  const nfts = store.get('ccc.token') ? await loadNftCards() : [];
  const w = wallet();
  const p = profile();
  whoBar();
  $app.innerHTML = `
    <section class="hero tw">
      <h1>Tokin <span>Wars</span></h1>
      <p>Three grow plots, six turns, one winner. Play Tokers and Tokins, read the conditions, and out-grow your opponent in two plots out of three.</p>
      <div class="row">
        <button class="btn primary big" id="play">Play a match</button>
        <button class="btn big" id="deck">My deck</button>
        <button class="btn big" id="how">How to play</button>
      </div>
    </section>
    <div class="grid2">
      <div class="card">
        <h2>Your record</h2>
        <div class="stats">
          <span><b>${levelOf(p.xp)}</b>Level</span><span><b>${p.xp % XP_PER_LEVEL}/${XP_PER_LEVEL}</b>XP</span>
          <span><b>${p.seeds}</b>Seeds</span><span><b>${p.wins}-${p.losses}${p.draws ? '-' + p.draws : ''}</b>W-L</span>
        </div>
        <div class="xpbar"><i style="width:${p.xp % XP_PER_LEVEL}%"></i></div>
        <p class="fine">Every match pays XP and Seeds, win or lose. Ranked seasons open with live PvP.</p>
      </div>
      <div class="card ${w ? '' : 'holder'}">
        ${w
          ? `<h2>Holder cards</h2><p>${nfts.length ? `<b>${nfts.length}</b> of your Tokers and Tokins are playable cards.` : 'No Tokers or Tokins in this wallet yet.'}</p>
             <p class="fine">NFT cards follow the same power rules as everyone else's. They look better and carry their history.</p>
             ${nfts.length ? '' : `<p><a class="btn" href="${OPENSEA.tokers}" target="_blank" rel="noopener">Get a Toker</a></p>`}`
          : `<h2>Own a Toker?</h2><p>Connect your wallet and your own Tokers and Tokins become playable cards.</p>
             <button class="btn" id="connect">Connect wallet</button>
             <p class="fine">Signing in just proves you own the wallet. No gas, no transactions, no approvals.</p>`}
      </div>
    </div>`;
  document.getElementById('play').onclick = () => startMatch();
  document.getElementById('deck').onclick = () => deckScreen();
  document.getElementById('how').onclick = () => howTo();
  const c = document.getElementById('connect');
  if (c) c.onclick = (e) => signIn(e.currentTarget);
}

function howTo() {
  stopTimer();
  $app.innerHTML = `
    <div class="card prose">
      <h2>How to play</h2>
      <ol>
        <li><b>Three Plots, six turns.</b> Win the most Potency in two of the three Plots. If that's level, total Potency decides it.</li>
        <li><b>Water.</b> You get Water equal to the turn: 1 on turn 1, up to 6 on turn 6. Each card costs Water (the blue drop).</li>
        <li><b>Play at the same time.</b> Tap a card, then tap a Plot. Both players lock in, then everything is revealed together. You've got 30 seconds a turn.</li>
        <li><b>Conditions.</b> Plot 1's condition shows on turn 1, Plot 2's on turn 2 and Plot 3's on turn 3. They can help or hurt what's planted there.</li>
        <li><b>Tokers</b> are growers who help your Tokins. <b>Tokins</b> are the plants and carry most of the Potency.</li>
        <li><b>Rare traits</b> make a card play differently, but every card has the same power budget, so skill beats rarity.</li>
      </ol>
      <h2>Plot conditions</h2>
      <ul class="conds">${Object.values(CONDITIONS).map((c) => `<li><span>${c.icon}</span><b>${c.name}</b> ${esc(c.text)}</li>`).join('')}</ul>
      <button class="btn primary" id="back">Back</button>
    </div>`;
  document.getElementById('back').onclick = home;
}

// ---------- deck ----------
async function collection() {
  const nfts = store.get('ccc.token') ? await loadNftCards() : [];
  const extra = profile().seedCard ? [SEED_CARD] : [];
  return [...nfts, ...STARTER_DECK, ...extra];
}

// The saved deck, topped up with starter cards to 12.
async function myDeck() {
  const all = await collection();
  const byKey = Object.fromEntries(all.map((c) => [c.key, c]));
  const picked = profile().deck.map((k) => byKey[k]).filter(Boolean).slice(0, BOARD.deckSize);
  for (const c of STARTER_DECK) if (picked.length < BOARD.deckSize && !picked.includes(c)) picked.push(c);
  return picked;
}

async function deckScreen() {
  stopTimer();
  const all = await collection();
  const p = profile();
  let picked = new Set((await myDeck()).map((c) => c.key));
  const lvl = levelOf(p.xp);
  const draw = () => {
    $app.innerHTML = `
      <div class="card row between sticky">
        <div><h2>My deck · ${picked.size}/${BOARD.deckSize}</h2><p class="fine">Tap cards to swap them in or out. Missing slots fill with starter cards.</p></div>
        <div class="row"><button class="btn" id="reset">Starter deck</button><button class="btn primary" id="done">Save</button></div>
      </div>
      <div class="card">
        <h2>Card frame</h2>
        <div class="seg">${FRAMES.map((f) => `<label class="${f.level > lvl ? 'lock' : ''}"><input type="radio" name="frame" value="${f.id}" ${p.frame === f.id ? 'checked' : ''} ${f.level > lvl ? 'disabled' : ''}>${f.name}${f.level > lvl ? ` · Lvl ${f.level}` : ''}</label>`).join('')}</div>
      </div>
      <div class="cards">${all.map((c) => bigCard(c, { cls: picked.has(c.key) ? 'in' : 'out', attrs: `data-key="${esc(c.key)}"` })).join('')}</div>`;
    $app.querySelectorAll('.tcard').forEach((el) => (el.onclick = () => {
      const k = el.dataset.key;
      if (picked.has(k)) picked.delete(k);
      else if (picked.size >= BOARD.deckSize) return toast(`Decks hold ${BOARD.deckSize} cards. Take one out first.`, true);
      else picked.add(k);
      draw();
    }));
    $app.querySelectorAll('input[name=frame]').forEach((r) => (r.onchange = () => { p.frame = r.value; saveProfile(p); draw(); }));
    document.getElementById('reset').onclick = () => { picked = new Set(STARTER_DECK.map((c) => c.key)); draw(); };
    document.getElementById('done').onclick = () => {
      const q = profile();
      q.deck = [...picked];
      saveProfile(q);
      toast('Deck saved.');
      home();
    };
  };
  draw();
}

// ---------- match ----------
const BOTS = ['Stoned Steve', 'Couch Potato Kev', 'Aunty Mary Jane', 'Dazed Daz', 'Hazy Hayley', 'Sir Puffs-a-Lot', 'Bong Bong Bev'];
let M = null; // { s, bot, skill, staged, selected, inspect, fresh }
let timer = null;
const TURN_SECONDS = 30;

function stopTimer() {
  clearInterval(timer);
  timer = null;
}

async function startMatch() {
  const deck = await myDeck();
  const p = profile();
  // A gentler bot for the first few matches.
  const skill = p.matches < 3 ? 0 : 0.3 + Math.random() * 0.45; // first 3 matches: an easy bot
  M = {
    s: newMatch({ deckA: deck, deckB: BOT_DECK, seed: (Math.random() * 2 ** 31) | 0 }),
    bot: BOTS[(Math.random() * BOTS.length) | 0],
    skill,
    staged: [],
    selected: null,
    inspect: null,
    fresh: new Set()
  };
  turnStart();
}

function turnStart() {
  M.staged = [];
  M.selected = null;
  M.left = TURN_SECONDS;
  stopTimer();
  timer = setInterval(() => {
    M.left -= 1;
    const t = document.getElementById('clock');
    if (t) { t.style.width = (M.left / TURN_SECONDS) * 100 + '%'; t.parentElement.classList.toggle('low', M.left <= 8); }
    if (M.left <= 0) endTurn();
  }, 1000);
  drawMatch();
}

function stagedWater() {
  return M.staged.reduce((t, x) => t + x.card.cost, 0);
}

function endTurn() {
  if (!M || M.s.over) return;
  stopTimer();
  const s = M.s;
  const before = new Set(s.plots.flatMap((p) => p.cards[1].map((c) => c.uid)));
  const mine = M.staged.map((x) => ({ uid: x.card.uid, plot: x.plot }));
  resolveTurn(s, mine, botPlays(s, 1, { skill: M.skill }));
  M.fresh = new Set(s.plots.flatMap((p) => p.cards[1].map((c) => c.uid)).filter((u) => !before.has(u)));
  if (s.over) return finish();
  turnStart();
}

function drawMatch() {
  const s = M.s;
  whoBar();
  const me = s.players[0];
  const waterLeft = me.water - stagedWater();
  const sel = M.selected ? me.hand.find((c) => c.uid === M.selected) : null;

  // Scores including staged cards, so players see what their plan does.
  const preview = structuredClone(s);
  for (const x of M.staged) preview.plots[x.plot].cards[0].push({ ...x.card, side: 0, played: s.turn });

  const plots = preview.plots.map((plot, i) => {
    const cond = CONDITIONS[plot.cond];
    const t = plotTotals(preview, i);
    const legal = sel && !canPlay(s, 0, sel, i, M.staged.map((x) => ({ card: x.card, plot: x.plot })));
    const row = (side) =>
      plot.cards[side].map((c) => {
        const isStaged = side === 0 && M.staged.some((x) => x.card.uid === c.uid);
        return miniCard(c, power(preview, i, c), `data-uid="${c.uid}" data-plot="${i}" data-side="${side}"`, `${isStaged ? 'staged' : ''} ${M.fresh.has(c.uid) ? 'fresh' : ''}`);
      }).join('') || '<span class="empty">—</span>';
    return `<div class="plot ${legal ? 'legal' : ''} ${t.lead === 0 ? 'mine' : t.lead === 1 ? 'theirs' : ''}" data-plot="${i}">
      <div class="cond ${plot.shown ? (cond.bad ? 'bad' : '') : 'hidden'}" title="${plot.shown ? esc(cond.text) : 'Revealed on turn ' + (i + 1)}">
        ${plot.shown ? `<span>${cond.icon}</span><b>${cond.name}</b><small>${esc(cond.text)}</small>` : `<span>❔</span><b>Plot ${i + 1}</b><small>Revealed on turn ${i + 1}</small>`}
      </div>
      <div class="side them">${row(1)}</div>
      <div class="score"><span class="b">${t.b}</span><i>vs</i><span class="a">${t.a}</span></div>
      <div class="side us">${row(0)}</div>
    </div>`;
  }).join('');

  const insp = M.inspect || sel;
  $app.innerHTML = `
    <div class="mbar">
      <div class="opp"><b>${esc(M.bot)}</b> <i class="tg bot">BOT</i> <span class="muted">${s.players[1].hand.length} in hand</span></div>
      <div class="turn">Turn <b>${s.turn}</b>/${BOARD.turns}</div>
    </div>
    <div class="clock"><i id="clock" style="width:${(M.left / TURN_SECONDS) * 100}%"></i></div>
    <div class="plots">${plots}</div>
    <div class="inspect">${insp ? bigCard(insp, { cls: 'flat' }) : '<p class="fine">Tap a card in your hand, then tap a Plot to plant it. Tap any card on the board to read it.</p>'}</div>
    <div class="handbar">
      <div class="water" title="Water left this turn">${Array.from({ length: me.water }, (_, i) => `<i class="${i < waterLeft ? 'full' : ''}"></i>`).join('')}<b>${waterLeft}</b> water</div>
      <button class="btn primary" id="end">${M.staged.length ? 'Lock in' : 'Pass'} ›</button>
    </div>
    <div class="hand">${me.hand.filter((c) => !M.staged.some((x) => x.card.uid === c.uid)).map((c) =>
      bigCard(c, { cls: `${M.selected === c.uid ? 'sel' : ''} ${c.cost > waterLeft ? 'dim' : ''}`, attrs: `data-hand="${c.uid}"` })).join('') || '<p class="fine">No cards left in hand.</p>'}</div>
    <details class="logbox"><summary>Match log</summary><ul class="log">${[...s.log].reverse().map((l) => `<li><i>T${l.turn}</i> ${esc(l.text)}</li>`).join('')}</ul></details>`;

  $app.querySelectorAll('[data-hand]').forEach((el) => (el.onclick = () => {
    const c = me.hand.find((x) => x.uid === el.dataset.hand);
    if (c.cost > waterLeft) { M.inspect = c; M.selected = null; drawMatch(); return toast('Not enough Water for that one this turn.', true); }
    M.selected = M.selected === c.uid ? null : c.uid;
    M.inspect = null;
    drawMatch();
  }));
  // With a card selected, tapping anywhere on a Plot plants it there.
  $app.querySelectorAll('.plot').forEach((el) => (el.onclick = () => {
    if (!sel) return;
    const i = +el.dataset.plot;
    const why = canPlay(s, 0, sel, i, M.staged.map((x) => ({ card: x.card, plot: x.plot })));
    if (why) return toast(why, true);
    M.staged.push({ card: sel, plot: i });
    M.selected = null;
    drawMatch();
  }));
  $app.querySelectorAll('.mini').forEach((el) => (el.onclick = (e) => {
    if (sel) return; // let the Plot handle it
    e.stopPropagation();
    const uid = el.dataset.uid;
    const st = M.staged.findIndex((x) => x.card.uid === uid);
    if (st >= 0) { M.staged.splice(st, 1); M.inspect = null; return drawMatch(); } // take a staged card back
    M.inspect = s.plots[+el.dataset.plot].cards[+el.dataset.side].find((c) => c.uid === uid);
    M.selected = null;
    drawMatch();
  }));
  document.getElementById('end').onclick = endTurn;
}

function finish() {
  stopTimer();
  const s = M.s;
  const r = s.result;
  const outcome = r.winner === 0 ? 'win' : r.winner === 1 ? 'loss' : 'draw';
  const got = award(outcome);
  M.staged = []; // already on the board
  M.selected = null;
  M.fresh = new Set();
  drawMatch();
  const w = wallet();
  const holder = w && (nftCards || []).length;
  const funnel = holder
    ? `<p>Your Tokers and Tokins are also waiting in the <a href="/">weekly grow</a>. Category winners mint a brand-new Tokin.</p>`
    : `<p>Holders play their own Tokers and Tokins here, and enter them in the <b>weekly grow comp</b>, where category winners mint a brand-new Tokin. You need a Toker and a Tokin to grow.</p>
       <div class="row"><a class="btn" href="${OPENSEA.tokers}" target="_blank" rel="noopener">Get a Toker</a><a class="btn" href="${OPENSEA.tokins}" target="_blank" rel="noopener">Get a Tokin</a>${w ? '' : '<button class="btn" id="connect2">Connect wallet</button>'}</div>`;
  const over = document.createElement('div');
  over.className = 'over';
  over.innerHTML = `<div class="card result ${outcome}">
    <h1>${{ win: 'You out-grew them', loss: `${esc(M.bot)} wins`, draw: 'Dead heat' }[outcome]}</h1>
    <p class="muted">Plots won: you ${r.won[0]}, ${esc(M.bot)} ${r.won[1]}${r.tiebreak ? '. Decided on total Potency' : ''}.</p>
    <div class="stats"><span><b>+${got.xp}</b>XP</span><span><b>+${got.seeds}</b>Seeds</span>${got.levelUp ? `<span><b>${got.levelUp}</b>New level</span>` : ''}</div>
    ${got.notes.map((n) => `<p class="fine">${esc(n)}</p>`).join('')}
    ${got.seedCard ? `<div class="earned"><p><b>You earned a Mystery Seed card.</b> It sprouts a little more every turn it's planted. The real grow needs a Toker and a Tokin.</p>${bigCard(SEED_CARD, { cls: 'flat' })}</div>` : ''}
    <p class="fine">Bot matches don't count towards rank.</p>
    ${funnel}
    <div class="row"><button class="btn primary" id="again">Play again</button><button class="btn" id="board">See the board</button><button class="btn" id="home">Home</button></div>
  </div>`;
  document.body.appendChild(over);
  const close = () => over.remove();
  over.querySelector('#again').onclick = () => { close(); startMatch(); };
  over.querySelector('#board').onclick = close;
  over.querySelector('#home').onclick = () => { close(); home(); };
  const c2 = over.querySelector('#connect2');
  if (c2) c2.onclick = (e) => { close(); signIn(e.currentTarget); };
  // After closing, Lock in becomes "Home".
  const end = document.getElementById('end');
  if (end) { end.textContent = 'Back home ›'; end.onclick = home; }
}

home();
