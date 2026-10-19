const assert = require('assert');
const { weekId, nextWeekId, gameDay, windowAt } = require('../src/lib/time');
const { newPlant, tick, view, applyCheckin, careTotal } = require('../src/lib/plant');

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

// Plant: a day of neglect dries it out and shows signs.
const t0 = new Date('2026-10-20T00:00:00Z'); // Mon 8pm EDT, game day 1
let p = newPlant(t0);
p = tick(p, 'seed', new Date(t0.getTime() + 20 * 3600e3));
assert.ok(p.moist < 28, 'dries out after 20h: ' + p.moist);
assert.strictEqual(view(p, 'seed', new Date(t0.getTime() + 20 * 3600e3)).reading.moisture, 'Low');
assert.strictEqual(tick(p, 'seed', new Date(p.t)).moist, p.moist, 'reading does not change state');

// Morning: water 3 + feed 1 + pest check on a dry plant = full 6.
const morning = new Date('2026-10-20T20:00:00Z'); // Wed 6am Brisbane, Tue 4pm EDT (day 2)
let q = newPlant(morning);
q.moist = 20; q.nutr = 18;
const r = applyCheckin(q, 'seed', morning, 'morning', { water: 3, feed: 1, pest: true, talk: true }, () => 0.5);
assert.strictEqual(r.pts, 6);
assert.strictEqual(r.pen, 0);
assert.strictEqual(q.water, 32);
assert.strictEqual(q.extras, 1);

// Overwatering is penalised.
let o = newPlant(morning); o.moist = 70;
const ro = applyCheckin(o, 'seed', morning, 'morning', { water: 3 }, () => 0.5);
assert.strictEqual(ro.pen, 2);
assert.ok(ro.notes.includes('overwatered'));

// Evening on day 2 wants 18/6; wrong cycle is penalised.
let e = newPlant(morning); e.nutr = 25;
assert.strictEqual(applyCheckin(e, 's', morning, 'evening', { lights: '18/6', pest: true }, () => 0.5).pts, 4);
let e2 = newPlant(morning);
assert.strictEqual(applyCheckin(e2, 's', morning, 'evening', { lights: '12/12' }, () => 0.5).pen, 2);

// Day visit: hover risk.
let d = newPlant(morning);
assert.strictEqual(applyCheckin(d, 's', morning, 'day', { pest: true }, () => 0.1).pen, 3);
let d2 = newPlant(morning);
assert.strictEqual(applyCheckin(d2, 's', morning, 'day', { pest: true, talk: true }, () => 0.9).pts, 3);

// Not enough stock.
let s0 = newPlant(morning); s0.water = 1;
assert.throws(() => applyCheckin(s0, 's', morning, 'morning', { water: 2 }));

// Care total caps extras at 28 and adds perfect-week bonus.
const cp = { care: 70, extras: 40, penalties: 5 };
const full = [...Array(7)].flatMap(() => [{ window: 'morning' }, { window: 'evening' }]);
assert.strictEqual(careTotal(cp, full), 95);

console.log('time + plant tests passed');
