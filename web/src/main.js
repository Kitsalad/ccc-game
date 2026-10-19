import { BrowserProvider } from 'ethers';
import { API, ALLOW_CURRENT_WEEK_ENTRY } from './config.js';
import { sceneSVG } from './scene.js';
import './style.css';

const $app = document.getElementById('app');
const $who = document.getElementById('who');
const $toast = document.getElementById('toast');

// ---------- small helpers ----------
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
const fmtWeek = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Monday 12am US Eastern for a week id, shown in the viewer's own time.
function startLocal(week) {
  const [y, m, d] = week.split('-').map(Number);
  for (const off of [4, 5]) {
    const t = new Date(Date.UTC(y, m - 1, d, off));
    const h = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(t);
    if (+h === 0) return t.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }
  return 'Monday';
}

let toastTimer;
function toast(msg, bad = false) {
  $toast.textContent = msg;
  $toast.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($toast.className = ''), 4500);
}

async function api(path, { method = 'GET', body } = {}) {
  const token = store.get('ccc.token');
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token) {
    store.set('ccc.token', null);
    render();
  }
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

function busy(btn, on, label) {
  if (!btn) return;
  btn.disabled = on;
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Working…'; }
  else if (btn.dataset.label) btn.textContent = btn.dataset.label;
}

// ---------- sign in ----------
async function signIn(btn) {
  if (!window.ethereum) {
    toast('No wallet found. Open this page in the MetaMask app, or install MetaMask.', true);
    return;
  }
  busy(btn, true, 'Check your wallet…');
  try {
    const provider = new BrowserProvider(window.ethereum);
    const [address] = await provider.send('eth_requestAccounts', []);
    const { message } = await api('/auth/nonce', { method: 'POST', body: { address } });
    const signer = await provider.getSigner();
    const signature = await signer.signMessage(message);
    const { token } = await api('/auth/verify', { method: 'POST', body: { address, signature } });
    store.set('ccc.token', token);
    await render();
  } catch (e) {
    toast(e.shortMessage || e.message, true);
  } finally {
    busy(btn, false);
  }
}

function signOut() {
  store.set('ccc.token', null);
  render();
}

// ---------- screens ----------
function landing() {
  $who.innerHTML = '';
  $app.innerHTML = `
    <section class="hero">
      <h1>Tokin <span>Grow Week</span></h1>
      <p>Pair your Toker with a Tokin, tend the grow morning and evening, and read the plant.
      Category winners mint a brand-new Tokin.</p>
      <button class="btn primary big" id="connect">Connect wallet</button>
      <p class="fine">Signing in just proves you own the wallet. No gas, no transactions, no approvals.</p>
    </section>`;
  document.getElementById('connect').onclick = (e) => signIn(e.currentTarget);
}

function nftCard(n, kind, name) {
  const img = n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<label class="nft">
    <input type="radio" name="${name}" value="${esc(n.id)}">
    <span class="pic">${img}<span class="ph">${kind}</span></span>
    <span class="nm">${esc(n.name)}</span>
  </label>`;
}

function lastWeekCard(s) {
  const l = s.lastWeek;
  if (!l) return '';
  return `<div class="card last">
    <h2>Last week's grow is done</h2>
    <p>Toker <b>#${esc(l.tokerId)}</b> + Tokin <b>#${esc(l.tokinIds[0])}</b> finished on <b>${l.care}</b> care points
    from ${l.checkins} check-ins. Results and harvest come in a later build.</p>
    <p class="fine">A new game week started ${esc(startLocal(s.week))} your time. Plant a new grow below.</p>
  </div>`;
}

async function entryForm(state) {
  $app.innerHTML = `${lastWeekCard(state)}<div class="card"><h2>Loading your Tokers and Tokins…</h2></div>`;
  let nfts;
  try {
    nfts = await api('/nfts');
  } catch (e) {
    $app.innerHTML = `${lastWeekCard(state)}<div class="card"><h2>Couldn't load your NFTs</h2><p>${esc(e.message)}</p>
      <button class="btn" id="retry">Try again</button></div>`;
    document.getElementById('retry').onclick = () => render();
    return;
  }
  const tz = state.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const weekPick = ALLOW_CURRENT_WEEK_ENTRY
    ? `<div class="seg">
        <label><input type="radio" name="week" value="current" checked> This week (test mode)</label>
        <label><input type="radio" name="week" value="next"> Next week (from ${fmtWeek(state.nextWeek)})</label>
      </div>`
    : '';

  $app.innerHTML = `
    ${lastWeekCard(state)}
    <div class="card">
      <h2>1 · Enter your Toker <span class="muted">(${nfts.tokers.length} in this wallet)</span></h2>
      <div class="grid">${nfts.tokers.map((n) => nftCard(n, 'Toker', 'toker')).join('') || '<p class="muted">No Tokers in this wallet.</p>'}</div>
    </div>
    <div class="card">
      <h2>2 · Pair one Tokin <span class="muted">(${nfts.tokins.length} in this wallet · never the same pairing twice)</span></h2>
      <div class="grid">${nfts.tokins.map((n) => nftCard(n, 'Tokin', 'tokin')).join('') || '<p class="muted">No Tokins in this wallet.</p>'}</div>
    </div>
    <div class="card row between">
      <div>
        ${weekPick}
        <p class="fine">Check-in times use <b>${esc(tz)}</b>${state.timezone ? '' : ' (locks in on your first entry)'}.</p>
      </div>
      <button class="btn primary big" id="enter">Plant it ›</button>
    </div>`;

  document.getElementById('enter').onclick = async (e) => {
    const toker = $app.querySelector('input[name=toker]:checked')?.value;
    const tokin = $app.querySelector('input[name=tokin]:checked')?.value;
    const week = $app.querySelector('input[name=week]:checked')?.value || 'next';
    if (!toker) return toast('Pick a Toker first.', true);
    if (!tokin) return toast('Pick a Tokin.', true);
    busy(e.currentTarget, true, 'Checking ownership…');
    try {
      await api('/entries', { method: 'POST', body: { tokerId: toker, tokinIds: [tokin], timezone: tz, week } });
      toast('Planted. 🌱');
      render();
    } catch (err) {
      toast(err.message, true);
      busy(e.currentTarget, false);
    }
  };
}

function booked(s) {
  const e = s.nextEntry;
  $app.innerHTML = `
    ${lastWeekCard(s)}
    <div class="card">
      <h2>You're in for the week of ${fmtWeek(e.week)}</h2>
      <p>Toker <b>#${esc(e.tokerId)}</b> with Tokin <b>#${esc(e.tokinIds[0])}</b>.</p>
      <p>The grow starts Monday 12am US Eastern, which is <b>${esc(startLocal(e.week))}</b> your time.</p>
      ${ALLOW_CURRENT_WEEK_ENTRY ? `<button class="btn primary" id="move">Start it now (test mode)</button>` : ''}
    </div>`;
  const mv = document.getElementById('move');
  if (mv) mv.onclick = async () => {
    busy(mv, true);
    try {
      await api('/entries/move-to-current', { method: 'POST' });
      toast('Grow started. 🌱');
      render();
    } catch (err) {
      toast(err.message, true);
      busy(mv, false);
    }
  };
}

// ---------- the grow room ----------
const WIN = {
  morning: { label: 'Morning check-in', hours: '5–11am', tasks: ['Water', 'Feed', 'Pest check', 'Talk'] },
  day: { label: 'Day visit (optional)', hours: '11am–5pm', tasks: ['Pest check', 'Talk'] },
  evening: { label: 'Evening check-in', hours: '5–11pm', tasks: ['Lights', 'Light feed', 'Water', 'Pest check', 'Talk'] }
};
let draft, pending, S;
const blank = () => ({ water: 0, feed: 0, pest: false, talk: false, lights: null });

function grow(s) {
  S = s;
  const g = s.grow, e = s.entry, win = s.now?.window || null;
  const open = !!win && !g.done;
  if (!draft) draft = blank();

  const word = (w) => `<span class="lvl ${w.toLowerCase()}">${w}</span>`;
  const task = (t) => {
    const done = { Water: draft.water > 0, Feed: draft.feed > 0, 'Light feed': draft.feed > 0, 'Pest check': draft.pest, Talk: draft.talk, Lights: !!draft.lights }[t];
    return `<span class="${done ? 'ok' : ''}">${t}${t === 'Water' && draft.water ? ' ' + draft.water : ''}${(t === 'Feed' || t === 'Light feed') && draft.feed ? ' ' + draft.feed : ''}</span>`;
  };
  const doseRow = pending
    ? `<div class="dose"><b>${pending === 'water' ? 'Water' : 'Feed'} dose</b>${[1, 2, 3, 4, 5]
        .map((d) => `<button class="btn sq ${draft[pending] === d ? 'primary' : ''}" data-dose="${d}" ${g.stock[pending] < d ? 'disabled' : ''}>${d}</button>`)
        .join('')}<button class="btn" data-dose="0">None</button></div>`
    : '';

  let status;
  if (!win) status = `💤 Lights out. Check-ins open 5am your time (${esc(s.timezone)}).`;
  else if (g.done) status = win === 'day' ? `You've done your day visits. Evening check-in opens 5pm.` : `${WIN[win].label} done. ${win === 'morning' ? 'Day visits open 11am, evening 5pm.' : 'Back in the morning from 5am.'}`;
  else status = `${WIN[win].label} is open (${WIN[win].hours} your time). Use the tools in the tent, then hit <b>End check-in</b>.`;

  $who.innerHTML = `<span>${short(s.wallet)}</span> <button class="link" id="out">Sign out</button>`;
  document.getElementById('out').onclick = signOut;

  $app.innerHTML = `
    <div class="hud">
      <span class="chip"><b>Day</b>${g.day}/7</span>
      <span class="chip ${open ? 'hot' : ''}">${win ? WIN[win].label.replace(' (optional)', '') : 'Lights out'}</span>
      <span class="chip"><b>Stage</b>${g.stage}</span>
      <span class="chip"><b>Water</b>${g.stock.water}</span>
      <span class="chip"><b>Feed</b>${g.stock.feed}</span>
      <span class="chip hot"><b>Care</b>${g.care}/100</span>
    </div>
    <div class="scene"><svg id="svg" viewBox="0 0 400 260" role="img" aria-label="Grow tent"></svg></div>
    <p class="status">${status}</p>
    <div class="grid2">
      <div class="card">
        <h2>Read the plant</h2>
        <h3>${esc(e.tokin?.name || 'Tokin #' + e.tokinIds[0])}</h3>
        <p class="fx">Grown by ${esc(e.toker?.name || 'Toker #' + e.tokerId)} · ${g.stage} · lights should be ${g.lightsTarget}</p>
        <div class="levels"><div>Moisture ${word(g.reading.moisture)}</div><div>Nutrients ${word(g.reading.nutrients)}</div></div>
        <p class="read">${esc(g.signs)}</p>
        ${open ? `<div class="done">${WIN[win].tasks.map(task).join('')}</div>${doseRow}
        <div class="row" style="margin-top:10px"><button class="btn primary" id="endBtn">End check-in ›</button>
        <button class="btn" id="clearBtn">Reset</button></div>` : ''}
        <p class="fine">Mornings ${g.counts.morning}/7 · Evenings ${g.counts.evening}/7 · Day visits ${g.counts.day}</p>
      </div>
      <div class="card">
        <h2>Grow journal</h2>
        <ul class="log">${g.log.length ? g.log.map((l) => `<li class="${l.c}">${l.day ? `<i>D${l.day}</i> ` : ''}${esc(l.t)}</li>`).join('') : '<li>Seed planted. Fresh soil, full stock.</li>'}</ul>
      </div>
    </div>
    <p class="help"><b>Morning:</b> water, feed, pest check. <b>Evening:</b> set the light timer, light feed, pest check.
    <b>Day visits</b> earn bonus points, but hovering can stress her. Too much water or feed is penalised, so read the plant first.
    Stock has to last the week.</p>`;

  const svg = document.getElementById('svg');
  svg.innerHTML = sceneSVG(g, e, draft, win, open);
  const act = (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const a = el.dataset.act;
    if (a === 'plant') return toast('Plant: ' + g.signs);
    if (el.classList.contains('off')) {
      if (!open) return toast(g.done ? 'This check-in is done.' : 'Lights out — check-ins are 5am to 11pm your time.', true);
      if (a === 'lights') return toast('The light timer is set in the evening check-in.', true);
      if (a === 'water' || a === 'feed') return toast('Water and feed happen morning and evening.', true);
      return;
    }
    if (a === 'water' || a === 'feed') pending = pending === a ? null : a;
    else if (a === 'pest') draft.pest = !draft.pest;
    else if (a === 'talk') draft.talk = !draft.talk;
    else if (a === 'lights') draft.lights = draft.lights === '18/6' ? '12/12' : '18/6';
    else if (a === 'end') return endCheckin();
    grow(S);
  };
  svg.onclick = act;
  svg.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); act(ev); } };
  $app.querySelectorAll('[data-dose]').forEach((b) => (b.onclick = () => {
    draft[pending] = +b.dataset.dose;
    pending = null;
    grow(S);
  }));
  const end = document.getElementById('endBtn');
  if (end) end.onclick = endCheckin;
  const clr = document.getElementById('clearBtn');
  if (clr) clr.onclick = () => { draft = blank(); pending = null; grow(S); };
}

async function endCheckin() {
  const btn = document.getElementById('endBtn');
  busy(btn, true, 'Checking in…');
  try {
    const r = await api('/checkins', { method: 'POST', body: draft });
    draft = blank();
    pending = null;
    grow(r);
    toast(r.result.summary, r.result.kind === 'bad');
  } catch (err) {
    toast(err.message, true);
    busy(btn, false);
  }
}

// ---------- router ----------
async function render() {
  if (!store.get('ccc.token')) return landing();
  $app.innerHTML = `<div class="card"><h2>Loading…</h2></div>`;
  let s;
  try {
    s = await api('/state');
  } catch (e) {
    if (!store.get('ccc.token')) return;
    $app.innerHTML = `<div class="card"><h2>Can't reach the grow room</h2><p>${esc(e.message)}</p>
      <button class="btn" id="retry">Try again</button></div>`;
    document.getElementById('retry').onclick = () => render();
    return;
  }
  $who.innerHTML = `<span>${short(s.wallet)}</span> <button class="link" id="out">Sign out</button>`;
  document.getElementById('out').onclick = signOut;
  if (s.grow) grow(s);
  else if (s.nextEntry) booked(s);
  else entryForm(s);
}

render();
