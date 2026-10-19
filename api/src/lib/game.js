const { db, readItem, query } = require('./db');
const { WINDOWS } = require('./config');
const { weekId, nextWeekId, windowAt, addDays } = require('./time');
const { newPlant, tick, view, careTotal } = require('./plant');
const { meta } = require('./nft');

async function entryFor(wallet, week) {
  const { entries } = await db();
  const r = await query(entries, 'SELECT * FROM c WHERE c.week = @week AND c.wallet = @wallet', { week, wallet });
  return r[0] || null;
}

async function checkinsFor(entryId) {
  const { checkins } = await db();
  return query(checkins, 'SELECT * FROM c WHERE c.entryId = @entryId ORDER BY c.at', { entryId });
}

function counts(list) {
  const n = { morning: 0, day: 0, evening: 0 };
  for (const c of list) n[c.window]++;
  return n;
}

// Build-1 entries have no plant; score them the old way.
function legacyCare(list) {
  const n = counts(list);
  const m = Math.min(n.morning, 7);
  const e = Math.min(n.evening, 7);
  return m * 6 + e * 4 + (m === 7 && e === 7 ? 2 : 0);
}

// Fetch and keep the Toker/Tokin names + images on the entry.
async function withImages(entry) {
  if (entry.toker && entry.tokin) return entry;
  try {
    const [toker, tokin] = await Promise.all([meta('toker', entry.tokerId), meta('tokin', entry.tokinIds[0])]);
    Object.assign(entry, { toker, tokin });
    const { entries } = await db();
    await entries.items.upsert(entry);
  } catch {
    entry.toker ||= { id: entry.tokerId, name: `Toker #${entry.tokerId}`, image: null };
    entry.tokin ||= { id: entry.tokinIds[0], name: `Tokin #${entry.tokinIds[0]}`, image: null };
  }
  return entry;
}

function plantOf(entry, now) {
  return tick(entry.plant || newPlant(now), entry.id, now);
}

const brief = (e) => e && { week: e.week, tokerId: e.tokerId, tokinIds: e.tokinIds, toker: e.toker, tokin: e.tokin };

async function stateFor(wallet) {
  const now = new Date();
  const { players } = await db();
  const player = await readItem(players, wallet, wallet);
  const week = weekId(now);
  const w = player ? windowAt(player.timezone, now) : null;

  let entry = await entryFor(wallet, week);
  let grow = null;
  if (entry) {
    entry = await withImages(entry);
    const list = await checkinsFor(entry.id);
    const plant = plantOf(entry, now);
    const today = w?.window ? list.filter((x) => x.window === w.window && x.localDate === w.localDate) : [];
    const done = w?.window ? today.length >= (w.window === 'day' ? WINDOWS.day.maxPerDay : 1) : false;
    grow = { ...view(plant, entry.id, now), counts: counts(list), care: careTotal(plant, list), done };
  }

  const nextEntry = await entryFor(wallet, nextWeekId(now));
  const last = await entryFor(wallet, addDays(week, -7));
  let lastWeek = null;
  if (last) {
    const list = await checkinsFor(last.id);
    lastWeek = { ...brief(last), care: last.plant ? careTotal(last.plant, list) : legacyCare(list), checkins: list.length };
  }

  return {
    wallet,
    timezone: player?.timezone || null,
    week,
    nextWeek: nextWeekId(now),
    now: w,
    entry: brief(entry),
    grow,
    nextEntry: brief(nextEntry),
    lastWeek
  };
}

module.exports = { entryFor, checkinsFor, stateFor, plantOf, withImages };
