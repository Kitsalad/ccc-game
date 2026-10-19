const { app } = require('@azure/functions');
const crypto = require('crypto');
const { db, readItem, query } = require('../lib/db');
const { HttpError, handler } = require('../lib/http');
const { ownedBy, owns } = require('../lib/nft');
const { isValidTz, weekId, nextWeekId, gameDay, windowAt } = require('../lib/time');
const { entryFor, checkinsFor, stateFor, plantOf, withImages } = require('../lib/game');
const { newPlant, applyCheckin } = require('../lib/plant');
const { MAX_TOKINS_PER_ENTRY, ALLOW_CURRENT_WEEK_ENTRY, WINDOWS } = require('../lib/config');

app.http('health', {
  route: 'health',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: handler(async () => ({ ok: true, week: weekId(), gameDay: gameDay() }), { auth: false })
});

app.http('state', {
  route: 'state',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: handler(({ wallet }) => stateFor(wallet))
});

// The wallet's Tokers and Tokins.
app.http('nfts', {
  route: 'nfts',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: handler(async ({ wallet }) => {
    const [tokers, tokins] = await Promise.all([ownedBy('toker', wallet), ownedBy('tokin', wallet)]);
    return { tokers, tokins };
  })
});

const isId = (v) => typeof v === 'string' && /^\d{1,10}$/.test(v);

// Toker and Tokins must not already be in someone else's entry that week.
async function assertFree(c, week, tokerId, tokinIds) {
  const taken = await query(
    c.entries,
    'SELECT c.tokerId, c.tokinIds FROM c WHERE c.week = @week AND (c.tokerId = @tokerId OR ARRAY_LENGTH(SetIntersect(c.tokinIds, @tokinIds)) > 0)',
    { week, tokerId, tokinIds }
  );
  if (taken.some((e) => e.tokerId === tokerId)) throw new HttpError(409, `Toker #${tokerId} is already entered that week.`);
  if (taken.length) throw new HttpError(409, 'One of those Tokins is already entered that week.');
}

// POC only: move next week's entry into the running week so it can be tested now.
app.http('moveEntryToCurrent', {
  route: 'entries/move-to-current',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: handler(async ({ wallet }) => {
    if (!ALLOW_CURRENT_WEEK_ENTRY) throw new HttpError(403, 'Test mode is off.');
    const c = await db();
    const week = weekId();
    if (await entryFor(wallet, week)) throw new HttpError(409, 'You already have a grow running this week.');
    const e = await entryFor(wallet, nextWeekId());
    if (!e) throw new HttpError(400, "You don't have an entry for next week.");
    await assertFree(c, week, e.tokerId, e.tokinIds);
    const { _rid, _self, _etag, _attachments, _ts, ...rest } = e;
    await c.entries.items.create({ ...rest, id: crypto.randomUUID(), week, movedFrom: e.week, plant: newPlant(new Date()) });
    await c.entries.item(e.id, e.week).delete();
    return stateFor(wallet);
  })
});

// Enter 1 Toker + up to 3 Tokins for a game week.
app.http('enter', {
  route: 'entries',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: handler(async ({ wallet, body }) => {
    const tokerId = String(body.tokerId ?? '');
    const tokinIds = [...new Set((body.tokinIds || []).map(String))];
    if (!isId(tokerId)) throw new HttpError(400, 'Pick a Toker.');
    if (tokinIds.length < 1 || tokinIds.length > MAX_TOKINS_PER_ENTRY || !tokinIds.every(isId))
      throw new HttpError(400, `Pick 1 to ${MAX_TOKINS_PER_ENTRY} Tokins.`);

    const c = await db();

    // Time zone is locked the first time a wallet enters.
    let player = await readItem(c.players, wallet, wallet);
    if (!player) {
      if (!isValidTz(body.timezone || '')) throw new HttpError(400, 'Missing or unknown time zone.');
      player = { id: wallet, timezone: body.timezone, createdAt: new Date().toISOString() };
      await c.players.items.create(player);
    }

    const week = body.week === 'current' && ALLOW_CURRENT_WEEK_ENTRY ? weekId() : nextWeekId();
    if (await entryFor(wallet, week)) throw new HttpError(409, 'This wallet already has an entry for that week.');

    await assertFree(c, week, tokerId, tokinIds);

    // A Tokin can never grow with the same Toker twice.
    for (const t of tokinIds) {
      if (await readItem(c.pairings, `${tokerId}:${t}`, tokerId))
        throw new HttpError(409, `Tokin #${t} has already grown with Toker #${tokerId}. Pick a different Tokin.`);
    }

    if (!(await owns('toker', wallet, tokerId))) throw new HttpError(403, `This wallet doesn't own Toker #${tokerId}.`);
    for (const t of tokinIds) {
      if (!(await owns('tokin', wallet, t))) throw new HttpError(403, `This wallet doesn't own Tokin #${t}.`);
    }

    const now = new Date();
    const entry = {
      id: crypto.randomUUID(), week, wallet, tokerId, tokinIds, timezone: player.timezone,
      createdAt: now.toISOString(), plant: newPlant(now)
    };
    await c.entries.items.create(entry);
    await withImages(entry);
    for (const t of tokinIds) {
      await c.pairings.items.create({ id: `${tokerId}:${t}`, tokerId, tokinId: t, week, wallet });
    }
    return stateFor(wallet);
  })
});

const hhmm = (d, tz) => new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d);

// Check in on the grow. Window is worked out from the player's locked time zone.
app.http('checkin', {
  route: 'checkins',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: handler(async ({ wallet, body }) => {
    const c = await db();
    const player = await readItem(c.players, wallet, wallet);
    const entry = player && (await entryFor(wallet, weekId()));
    if (!entry) throw new HttpError(400, "You don't have a grow running this week.");

    const now = new Date();
    const w = windowAt(player.timezone, now);
    if (!w.window) throw new HttpError(400, 'Lights out — check-ins are 5am to 11pm your time.');

    const list = await checkinsFor(entry.id);
    const today = list.filter((x) => x.window === w.window && x.localDate === w.localDate);
    if (w.window === 'day') {
      const rule = WINDOWS.day;
      if (today.length >= rule.maxPerDay) throw new HttpError(409, `You've done your ${rule.maxPerDay} day check-ins today.`);
      const last = today.length ? new Date(today[today.length - 1].at) : null;
      const next = last && new Date(last.getTime() + rule.minGapHours * 3600e3);
      if (next && next > now) throw new HttpError(409, `Give it a breather — next day check-in from ${hhmm(next, player.timezone)}.`);
    } else {
      if (today.length) throw new HttpError(409, `Already done your ${w.window} check-in today.`);
      if (list.filter((x) => x.window === w.window).length >= 7)
        throw new HttpError(409, `All 7 ${w.window} check-ins are done this week.`);
    }

    // What the player did this check-in.
    const dose = (v) => (Number.isInteger(v) && v >= 0 && v <= 5 ? v : 0);
    const actions = {
      water: dose(body.water),
      feed: dose(body.feed),
      pest: body.pest === true,
      talk: body.talk === true,
      lights: ['18/6', '12/12'].includes(body.lights) ? body.lights : null
    };
    if (w.window === 'day' && (actions.water || actions.feed))
      throw new HttpError(400, 'Water and feed happen in the morning and evening. Day visits are for pest checks and a chat.');

    const plant = plantOf(entry, now);
    let result;
    try {
      result = applyCheckin(plant, entry.id, now, w.window, actions);
    } catch (e) {
      throw new HttpError(400, e.message);
    }
    entry.plant = plant;
    await c.entries.items.upsert(entry);

    await c.checkins.items.create({
      actions,
      points: result.pts,
      penalty: result.pen,
      id: crypto.randomUUID(),
      entryId: entry.id,
      wallet,
      week: entry.week,
      window: w.window,
      localDate: w.localDate,
      gameDay: gameDay(now),
      at: now.toISOString()
    });
    return { ...(await stateFor(wallet)), result };
  })
});
