// Server-side plant: state lives on the entry, time moves it on hour by hour,
// and check-ins are scored against it (v1.3 care rules).
const crypto = require('crypto');
const { gameDay } = require('./time');
const { PLANT } = require('./config');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MOIST_BAND = [40, 80];
const nutrBand = (day) => (day <= 2 ? [15, 40] : day <= 4 ? [35, 70] : [40, 75]);
const lightsTarget = (day) => (day <= 4 ? '18/6' : '12/12');
const stage = (day) => (day <= 2 ? 'Seedling' : day <= 4 ? 'Veg' : 'Flower');
const word = (v, lo, hi) => (v < lo ? 'Low' : v > hi ? 'High' : 'OK');

// Deterministic 0–1 roll so reading the state never changes it.
const roll = (seed, k) => crypto.createHash('sha256').update(`${seed}:${k}`).digest().readUInt32BE(0) / 2 ** 32;

function newPlant(now = new Date()) {
  return {
    moist: 55, nutr: 25, health: 100, size: 0.5, pests: false,
    water: PLANT.waterStock, feed: PLANT.feedStock,
    care: 0, extras: 0, penalties: 0,
    start: now.toISOString(), t: now.toISOString(), log: []
  };
}

// Move the plant forward to `now`, one hour at a time.
function tick(plant, seed, now = new Date()) {
  const p = { ...plant, log: [...(plant.log || [])] };
  const start = new Date(p.start).getTime();
  let t = new Date(p.t).getTime();
  const end = Math.min(now.getTime(), t + 9 * 24 * 3600e3);
  while (t + 3600e3 <= end) {
    t += 3600e3;
    const day = gameDay(new Date(t));
    p.moist = clamp(p.moist - (1.5 + p.size * 0.05), 0, 120);
    p.nutr = clamp(p.nutr - 0.8, 0, 120);
    let dmg = 0;
    if (p.moist < 15 || p.moist > 90) dmg += 0.4;
    if (p.nutr > 90) dmg += 0.3;
    if (p.nutr < 8 && day > 2) dmg += 0.2;
    if (p.pests) dmg += 0.3;
    p.health = clamp(p.health - dmg + (dmg ? 0 : 0.05), 0, 100);
    p.size = clamp(p.size + 0.04 * (day <= 2 ? 0.6 : day <= 4 ? 1.2 : 0.7) * (p.health / 100), 0, 9);
    const h = Math.round((t - start) / 3600e3);
    if (!p.pests && h % 6 === 0 && roll(seed, 'pest' + h) < PLANT.pestChance) p.pests = true;
  }
  p.t = new Date(t).toISOString();
  return p;
}

function pestsVisible(p, seed, now) {
  if (!p.pests) return false;
  return p.health < 85 || roll(seed, 'see' + Math.floor(now.getTime() / (3 * 3600e3))) < 0.5;
}

function signs(p, seed, now) {
  const [nl] = nutrBand(gameDay(now));
  const s = [];
  if (p.moist < 28) s.push('leaves drooping, soil pale and dry');
  if (p.moist > 85) s.push('leaves drooping but dark and heavy, soil black');
  if (p.nutr < nl - 8) s.push('lower leaves yellowing');
  if (p.nutr > 80) s.push('brown crispy leaf tips');
  if (pestsVisible(p, seed, now)) s.push('tiny white specks on the leaves');
  return s.length ? s.join('; ') + '.' : 'Looks happy and perky.';
}

// What the player gets to see. Reading is Low/OK/High for now; Toker traits
// will sharpen or blur it later.
function view(p, seed, now = new Date()) {
  const day = gameDay(now);
  const [nl, nh] = nutrBand(day);
  return {
    day,
    stage: stage(day),
    lightsTarget: lightsTarget(day),
    reading: { moisture: word(p.moist, ...MOIST_BAND), nutrients: word(p.nutr, nl, nh) },
    signs: signs(p, seed, now),
    visual: {
      size: Math.round(p.size * 100) / 100,
      health: Math.round(p.health),
      dry: p.moist < 28,
      soggy: p.moist > 85,
      hungry: p.nutr < nl - 8,
      burn: p.nutr > 80,
      pests: pestsVisible(p, seed, now)
    },
    stock: { water: p.water, feed: p.feed },
    log: p.log.slice(0, 14)
  };
}

const TALK = [
  '"You\'re doing great, little mate."',
  '"Grow, you beautiful thing."',
  'Played her some reggae.',
  'Told her about the Tokers. She seemed into it.',
  '"Don\'t stress, it\'s only Tuesday somewhere."',
  'Blew a little smoke her way. Purely for morale.'
];

// Apply one check-in's actions and score it. Mutates and returns p.
function applyCheckin(p, seed, now, window, a, rand = Math.random) {
  const day = gameDay(now);
  const [nl, nh] = nutrBand(day);
  const notes = [];
  const msgs = [];
  let pts = 0;
  let pen = 0;

  if (a.water) {
    if (a.water > p.water) throw new Error('Not enough water stock.');
    p.water -= a.water;
    p.moist = clamp(p.moist + a.water * 10, 0, 120);
    msgs.push(`Watered ${a.water}.`);
    if (p.moist > 85) { pen += 2; notes.push('overwatered'); }
  }
  if (a.feed) {
    if (a.feed > p.feed) throw new Error('Not enough feed stock.');
    p.feed -= a.feed;
    p.nutr = clamp(p.nutr + a.feed * 8, 0, 120);
    msgs.push(`Fed ${a.feed}.`);
    if (p.nutr > 85) { pen += 2; notes.push('nute burn'); }
  }
  if (a.pest) {
    if (p.pests) { p.pests = false; msgs.push('Pest check: spider mites found and wiped.'); }
    else msgs.push('Pest check: all clear.');
  }
  if (a.talk) msgs.push(TALK[Math.floor(rand() * TALK.length)]);
  if (a.lights && window === 'evening') msgs.push(`Timer set to ${a.lights}.`);

  const mOk = p.moist >= MOIST_BAND[0] && p.moist <= MOIST_BAND[1];
  const nOk = p.nutr >= nl && p.nutr <= nh;
  let summary;

  if (window === 'morning') {
    if (mOk) pts += 2; else notes.push(p.moist < MOIST_BAND[0] ? 'too dry' : 'too wet');
    if (nOk) pts += 2; else notes.push(p.nutr < nl ? 'underfed' : 'overfed');
    if (a.pest) pts += 2; else notes.push('skipped pest check');
    p.care += pts;
    if (a.talk) p.extras += 1;
    summary = `Morning scored ${pts}/6`;
  } else if (window === 'evening') {
    const target = lightsTarget(day);
    if (a.lights === target) pts += 2;
    else if (a.lights) { pen += 2; notes.push('wrong light cycle'); }
    else notes.push('lights not set');
    if (nOk) pts += 1; else notes.push(p.nutr < nl ? 'underfed' : 'overfed');
    if (a.pest) pts += 1; else notes.push('skipped pest check');
    p.care += pts;
    if (a.talk) p.extras += 1;
    summary = `Evening scored ${pts}/4`;
  } else {
    const acted = a.talk || a.pest || a.water || a.feed;
    const ex = (a.talk ? 1 : 0) + (a.pest ? 2 : 0);
    if (acted && rand() < PLANT.hoverChance) { pen += 3; notes.push("hovered too much, she's stressed"); }
    p.extras += ex;
    pts = ex;
    summary = acted ? `Day visit +${ex}` : 'Popped in, left her alone';
  }

  if (pen) { p.penalties += pen; p.health = clamp(p.health - pen * 3, 0, 100); }
  const line = `${summary}${pen ? `, −${pen} penalty` : ''}${notes.length ? ` (${notes.join(', ')})` : ''}.`;
  const kind = pen ? 'bad' : notes.length ? '' : 'good';
  p.log = [{ t: line, c: kind, day, window }, ...msgs.reverse().map((m) => ({ t: m, c: '', day, window })), ...p.log].slice(0, 30);
  return { pts, pen, notes, msgs, summary: line, kind };
}

// Care score out of 100: required check-ins (max 70) + extras (max 28) + perfect week (2) − penalties.
function careTotal(p, checkins) {
  const n = { morning: 0, evening: 0 };
  for (const c of checkins) if (n[c.window] != null) n[c.window]++;
  const perfect = n.morning >= 7 && n.evening >= 7;
  return clamp(Math.round(p.care + Math.min(28, p.extras) - p.penalties + (perfect ? 2 : 0)), 0, 100);
}

module.exports = { newPlant, tick, view, applyCheckin, careTotal, nutrBand, lightsTarget, MOIST_BAND };
