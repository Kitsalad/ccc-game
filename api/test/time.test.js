const assert = require('assert');
const { weekId, nextWeekId, gameDay, windowAt } = require('../src/lib/time');
const { care } = require('../src/lib/game');

// Sun 18 Oct 2026 20:31 AEST = Sun 18 Oct 06:31 EDT → week started Mon 12 Oct.
const t1 = new Date('2026-10-18T10:31:00Z');
assert.strictEqual(weekId(t1), '2026-10-12');
assert.strictEqual(nextWeekId(t1), '2026-10-19');
assert.strictEqual(gameDay(t1), 7);
assert.deepStrictEqual(windowAt('Australia/Brisbane', t1).window, 'evening');

// Mon 19 Oct 00:00 EDT = 04:00Z → new week, day 1.
assert.strictEqual(weekId(new Date('2026-10-19T04:00:00Z')), '2026-10-19');
assert.strictEqual(weekId(new Date('2026-10-19T03:59:00Z')), '2026-10-12');
assert.strictEqual(gameDay(new Date('2026-10-19T04:00:00Z')), 1);

// DST end (1 Nov 2026) doesn't break week boundaries: Mon 2 Nov 00:00 EST = 05:00Z.
assert.strictEqual(weekId(new Date('2026-11-02T05:00:00Z')), '2026-11-02');
assert.strictEqual(weekId(new Date('2026-11-02T04:30:00Z')), '2026-10-26');

// Windows: 04:59 none, 05:00 morning, 11:00 day, 17:00 evening, 23:00 none (Brisbane = UTC+10).
const at = (h, m = 0) => new Date(Date.UTC(2026, 9, 20, h - 10, m));
assert.strictEqual(windowAt('Australia/Brisbane', at(4, 59)).window, null);
assert.strictEqual(windowAt('Australia/Brisbane', at(5)).window, 'morning');
assert.strictEqual(windowAt('Australia/Brisbane', at(11)).window, 'day');
assert.strictEqual(windowAt('Australia/Brisbane', at(17)).window, 'evening');
assert.strictEqual(windowAt('Australia/Brisbane', at(23)).window, null);

// Care: 7 mornings + 7 evenings = 70 + perfect week 2.
const full = [...Array(7)].flatMap(() => [{ window: 'morning' }, { window: 'evening' }, { window: 'day' }]);
assert.deepStrictEqual(care(full), { mornings: 7, evenings: 7, dayCheckins: 7, perfect: true, points: 72, max: 100 });
assert.strictEqual(care([{ window: 'morning' }, { window: 'evening' }]).points, 10);

console.log('time + care tests passed');
