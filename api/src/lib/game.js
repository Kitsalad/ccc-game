const { db, readItem, query } = require('./db');
const { WINDOWS, PERFECT_WEEK_BONUS } = require('./config');
const { weekId, nextWeekId, gameDay, windowAt } = require('./time');

async function entryFor(wallet, week) {
  const { entries } = await db();
  const r = await query(entries, 'SELECT * FROM c WHERE c.week = @week AND c.wallet = @wallet', { week, wallet });
  return r[0] || null;
}

async function checkinsFor(entryId) {
  const { checkins } = await db();
  return query(checkins, 'SELECT * FROM c WHERE c.entryId = @entryId ORDER BY c.at', { entryId });
}

// Care points so far. Day check-ins are recorded but score 0 until plant reading
// (pest checks, talking) is built — they shouldn't be free points.
function care(list) {
  const n = { morning: 0, day: 0, evening: 0 };
  for (const c of list) n[c.window]++;
  const mornings = Math.min(n.morning, 7);
  const evenings = Math.min(n.evening, 7);
  const perfect = mornings === 7 && evenings === 7;
  const points = mornings * WINDOWS.morning.points + evenings * WINDOWS.evening.points + (perfect ? PERFECT_WEEK_BONUS : 0);
  return { mornings, evenings, dayCheckins: n.day, perfect, points, max: 100 };
}

async function stateFor(wallet) {
  const { players } = await db();
  const player = await readItem(players, wallet, wallet);
  const week = weekId();
  const entry = await entryFor(wallet, week);
  const nextEntry = await entryFor(wallet, nextWeekId());
  const list = entry ? await checkinsFor(entry.id) : [];
  return {
    wallet,
    timezone: player?.timezone || null,
    week,
    nextWeek: nextWeekId(),
    gameDay: gameDay(),
    now: player ? windowAt(player.timezone) : null,
    entry,
    nextEntry,
    checkins: list.map(({ window, localDate, at }) => ({ window, localDate, at })),
    care: care(list)
  };
}

module.exports = { entryFor, checkinsFor, care, stateFor };
