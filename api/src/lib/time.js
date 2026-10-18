const { GAME_TZ, WINDOWS } = require('./config');

const DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function isValidTz(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Calendar parts of `date` as seen in time zone `tz`.
function partsIn(tz, date = new Date()) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23'
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    y: +p.year,
    m: +p.month,
    d: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    dow: DOW[p.weekday],
    date: `${p.year}-${p.month}-${p.day}`
  };
}

function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Game week id = the Monday (US Eastern date) the week starts on, e.g. "2026-10-19".
function weekId(date = new Date()) {
  const p = partsIn(GAME_TZ, date);
  return addDays(p.date, -(p.dow - 1));
}

function nextWeekId(date = new Date()) {
  return addDays(weekId(date), 7);
}

// Day 1–7 of the game week (US Eastern).
function gameDay(date = new Date()) {
  return partsIn(GAME_TZ, date).dow;
}

// Which check-in window the player is in right now, in their own time zone.
function windowAt(tz, date = new Date()) {
  const p = partsIn(tz, date);
  for (const [name, w] of Object.entries(WINDOWS)) {
    if (p.hour >= w.start && p.hour < w.end) return { window: name, localDate: p.date, localHour: p.hour };
  }
  return { window: null, localDate: p.date, localHour: p.hour };
}

module.exports = { isValidTz, partsIn, weekId, nextWeekId, gameDay, windowAt, addDays };
