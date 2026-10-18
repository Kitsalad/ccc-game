import { BrowserProvider } from 'ethers';
import { API, ALLOW_CURRENT_WEEK_ENTRY, MAX_TOKINS } from './config.js';
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
  if (r.status === 401) {
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
      <h1>Grow week starts Monday.</h1>
      <p>Pair your Toker with up to ${MAX_TOKINS} Tokins, check in morning and evening, and grow a winner.
      Category winners mint a brand-new Tokin.</p>
      <button class="btn big" id="connect">Connect wallet</button>
      <p class="fine">Signing in just proves you own the wallet. No gas, no transactions.</p>
    </section>`;
  document.getElementById('connect').onclick = (e) => signIn(e.currentTarget);
}

function nftCard(n, kind, name, type) {
  const img = n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<label class="nft">
    <input type="${type}" name="${name}" value="${esc(n.id)}">
    <span class="pic">${img}<span class="ph">${kind}</span></span>
    <span class="nm">${esc(n.name)}</span>
  </label>`;
}

async function entryForm(state) {
  $app.innerHTML = `<section class="card"><h2>Loading your Tokers and Tokins…</h2></section>`;
  let nfts;
  try {
    nfts = await api('/nfts');
  } catch (e) {
    $app.innerHTML = `<section class="card"><h2>Couldn't load your NFTs</h2><p>${esc(e.message)}</p>
      <button class="btn" id="retry">Try again</button></section>`;
    document.getElementById('retry').onclick = () => render();
    return;
  }
  const tz = state.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const weekPick = ALLOW_CURRENT_WEEK_ENTRY
    ? `<div class="seg">
        <label><input type="radio" name="week" value="next" checked> Next week (from ${fmtWeek(state.nextWeek)})</label>
        <label><input type="radio" name="week" value="current"> This week — test mode</label>
      </div>`
    : '';

  $app.innerHTML = `
    <section class="card">
      <h2>Set up your grow</h2>
      ${weekPick}
      <h3>1. Pick your Toker <span class="muted">(${nfts.tokers.length} in this wallet)</span></h3>
      <div class="grid">${nfts.tokers.map((n) => nftCard(n, 'Toker', 'toker', 'radio')).join('') || '<p class="muted">No Tokers in this wallet.</p>'}</div>
      <h3>2. Pick up to ${MAX_TOKINS} Tokins <span class="muted">(${nfts.tokins.length} in this wallet)</span></h3>
      <div class="grid">${nfts.tokins.map((n) => nftCard(n, 'Tokin', 'tokin', 'checkbox')).join('') || '<p class="muted">No Tokins in this wallet.</p>'}</div>
      <p class="fine">Your check-in times use <b>${esc(tz)}</b>${state.timezone ? '' : ' — this locks in on your first entry'}.
      A Tokin can only ever grow once with the same Toker.</p>
      <button class="btn big" id="enter">Plant it</button>
    </section>`;

  $app.querySelectorAll('input[name=tokin]').forEach((cb) =>
    cb.addEventListener('change', () => {
      const on = $app.querySelectorAll('input[name=tokin]:checked');
      if (on.length > MAX_TOKINS) { cb.checked = false; toast(`Max ${MAX_TOKINS} Tokins.`, true); }
    })
  );

  document.getElementById('enter').onclick = async (e) => {
    const toker = $app.querySelector('input[name=toker]:checked')?.value;
    const tokins = [...$app.querySelectorAll('input[name=tokin]:checked')].map((x) => x.value);
    const week = $app.querySelector('input[name=week]:checked')?.value || 'next';
    if (!toker) return toast('Pick a Toker first.', true);
    if (!tokins.length) return toast('Pick at least one Tokin.', true);
    busy(e.currentTarget, true, 'Checking ownership…');
    try {
      const s = await api('/entries', { method: 'POST', body: { tokerId: toker, tokinIds: tokins, timezone: tz, week } });
      toast('Planted. 🌱');
      grow(s);
    } catch (err) {
      toast(err.message, true);
      busy(e.currentTarget, false);
    }
  };
}

const WIN = {
  morning: { label: 'Morning check-in', hours: '5–11am', pts: 6, icon: '☀️' },
  day: { label: 'Day check-in', hours: '11am–5pm', pts: 0, icon: '🔍' },
  evening: { label: 'Evening check-in', hours: '5–11pm', pts: 4, icon: '🌙' }
};

function grow(s) {
  const e = s.entry;
  if (!e) {
    $app.innerHTML = `
      <section class="card">
        <h2>You're in for the week of ${fmtWeek(s.nextEntry.week)}</h2>
        <p>Toker <b>#${esc(s.nextEntry.tokerId)}</b> with Tokins ${s.nextEntry.tokinIds.map((t) => `<b>#${esc(t)}</b>`).join(', ')}.</p>
        <p>The grow starts Monday 12am US Eastern. Check-ins run on your time (${esc(s.timezone)}).</p>
      </section>`;
    return;
  }

  const now = s.now?.window;
  const byDate = {};
  for (const c of s.checkins) (byDate[c.localDate] ||= []).push(c.window);
  const days = Object.keys(byDate).sort();
  const pct = Math.round((s.care.points / s.care.max) * 100);

  $app.innerHTML = `
    <section class="card">
      <div class="row">
        <div>
          <h2>Day ${s.gameDay} of 7</h2>
          <p class="muted">Week of ${fmtWeek(e.week)} · Toker #${esc(e.tokerId)} · Tokins ${e.tokinIds.map((t) => '#' + esc(t)).join(', ')}</p>
        </div>
        <div class="score"><b>${s.care.points}</b><span>/ ${s.care.max} care</span></div>
      </div>
      <div class="bar"><i style="width:${pct}%"></i></div>

      <div class="now ${now ? '' : 'off'}">
        ${now ? `<span>${WIN[now].icon} ${WIN[now].label} is open (${WIN[now].hours} your time)</span>
                 <button class="btn" id="checkin">Check in${WIN[now].pts ? ` +${WIN[now].pts}` : ''}</button>`
              : `<span>💤 Lights out. Check-ins open 5am your time.</span>`}
      </div>

      <div class="tally">
        <div>☀️ Mornings <b>${s.care.mornings}/7</b></div>
        <div>🌙 Evenings <b>${s.care.evenings}/7</b></div>
        <div>🔍 Day visits <b>${s.care.dayCheckins}</b></div>
      </div>
      ${days.length ? `<ul class="log">${days.map((d) => `<li><span>${d}</span>${byDate[d].map((w) => WIN[w].icon).join(' ')}</li>`).join('')}</ul>` : ''}
      <p class="fine">Day visits are recorded but don't score yet — reading the plant (pests, talking) comes in the next build.</p>
    </section>`;

  const btn = document.getElementById('checkin');
  if (btn) btn.onclick = async () => {
    busy(btn, true);
    try {
      grow(await api('/checkins', { method: 'POST' }));
      toast('Checked in. Your plants say thanks. 🌿');
    } catch (err) {
      toast(err.message, true);
      busy(btn, false);
    }
  };
}

// ---------- router ----------
async function render() {
  if (!store.get('ccc.token')) return landing();
  $app.innerHTML = `<section class="card"><h2>Loading…</h2></section>`;
  let s;
  try {
    s = await api('/state');
  } catch (e) {
    if (!store.get('ccc.token')) return;
    $app.innerHTML = `<section class="card"><h2>Can't reach the grow room</h2><p>${esc(e.message)}</p>
      <button class="btn" id="retry">Try again</button></section>`;
    document.getElementById('retry').onclick = () => render();
    return;
  }
  $who.innerHTML = `<span>${short(s.wallet)}</span> <button class="link" id="out">Sign out</button>`;
  document.getElementById('out').onclick = signOut;
  if (s.entry || s.nextEntry) grow(s);
  else entryForm(s);
}

render();
