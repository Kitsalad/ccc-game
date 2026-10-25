// Tokin Wars engine tests. Run: npm test (in web/)
import assert from 'node:assert';
import { STARTER_DECK, SEED_CARD, budget, tokinCard, tokerCard } from '../src/wars/cards.js';
import { newMatch, resolveTurn, botPlays, canPlay, power, rngFrom } from '../src/wars/engine.js';

// Power budget.
assert.strictEqual(budget(3, 'none'), 5);
assert.strictEqual(budget(3, 'steady'), 4);
assert.strictEqual(budget(3, 'steady', true), 3);
assert.strictEqual(STARTER_DECK.length, 12);

// NFT trait mapping: no Gender trait = female; Male pollinates; No Eyes = Third Eye with +1 cost.
const female = tokinCard({ id: '5', traits: [{ type: 'Strain', value: 'Sativa', pct: 40 }] });
assert.strictEqual(female.male, false);
assert.strictEqual(female.ability, 'sprint');
const male = tokinCard({ id: '6', traits: [{ type: 'Gender', value: 'Male', pct: 30 }, { type: 'Strain', value: 'Indica', pct: 40 }] });
assert.strictEqual(male.ability, 'pollinate');
const bugs = tokinCard({ id: '7', traits: [{ type: 'Addin', value: 'Ladybug', pct: 10 }] });
assert.strictEqual(bugs.addin, 'bug');
const rare = tokinCard({ id: '8', traits: [{ type: 'Strain', value: 'Indica', pct: 40 }, { type: 'Background', value: 'Gold', pct: 2 }] });
assert.strictEqual(rare.rare, true);
assert.strictEqual(rare.potency, budget(rare.cost, 'steady', true));
const blind = tokerCard({ id: '9', traits: [{ type: 'Eyes', value: 'No Eyes', pct: 1.26 }] });
assert.strictEqual(blind.ability, 'thirdeye');
assert.ok(blind.cost >= 2);
// Same NFT, same card.
assert.deepStrictEqual(tokerCard({ id: '42', traits: [{ type: 'Hat', value: 'Beanie', pct: 20 }] }), tokerCard({ id: '42', traits: [{ type: 'Hat', value: 'Beanie', pct: 20 }] }));

// A match: water, illegal plays ignored, six turns, a result.
const s = newMatch({ deckA: STARTER_DECK, deckB: STARTER_DECK, seed: 7 });
assert.strictEqual(s.turn, 1);
assert.strictEqual(s.players[0].water, 1);
assert.strictEqual(s.players[0].hand.length, 4);
assert.strictEqual(s.plots[0].shown, true);
assert.strictEqual(s.plots[1].shown, false);
const pricey = s.players[0].hand.find((c) => c.cost > 1);
if (pricey) assert.ok(canPlay(s, 0, pricey, 0));
resolveTurn(s, pricey ? [{ uid: pricey.uid, plot: 0 }] : [], []);
assert.strictEqual(s.plots[0].cards[0].length, 0, 'over-budget play is ignored');
assert.strictEqual(s.turn, 2);
assert.strictEqual(s.players[0].hand.length, 5);
while (!s.over) resolveTurn(s, botPlays(s, 0, { rng: rngFrom(1) }), botPlays(s, 1, { rng: rngFrom(2) }));
assert.ok(s.result);
assert.strictEqual(s.turn, 6);

// Abilities in place.
const t = newMatch({ deckA: STARTER_DECK, deckB: STARTER_DECK, seed: 3 });
t.plots[0] = { cond: 'pests', shown: true, cards: [[], []] };
const kush = { ...STARTER_DECK.find((c) => c.key === 's-couchlock'), uid: 'x1', side: 0, played: 1 };
const haze = { ...STARTER_DECK.find((c) => c.key === 's-sunrise'), uid: 'x2', side: 0, played: 2 };
t.plots[0].cards[0].push(kush, haze);
assert.strictEqual(power(t, 0, kush), kush.potency, 'Indica ignores pests');
assert.strictEqual(power(t, 0, haze), haze.potency + 2 - 2, 'Sativa sprint +2, pests -2');
const hippie = { ...STARTER_DECK.find((c) => c.key === 's-hippie'), uid: 'x3', side: 0, played: 2 };
t.plots[0].cards[0].push(hippie);
assert.strictEqual(power(t, 0, haze), haze.potency + 2, 'Pest Hunter shields allies');
const seed = { ...SEED_CARD, uid: 'x4', side: 0, played: 1 };
t.turn = 4;
t.plots[0].cards[0].push(seed);
assert.strictEqual(power(t, 0, seed), 3, 'Sprout grows each turn');

// Balance check: bots of equal skill with the same deck should split wins roughly evenly,
// and a stronger bot should beat a weak one most of the time.
function series(skillA, skillB, games = 200) {
  const w = [0, 0, 0];
  for (let g = 0; g < games; g++) {
    const m = newMatch({ deckA: STARTER_DECK, deckB: STARTER_DECK, seed: 1000 + g });
    const ra = rngFrom(g * 2 + 1), rb = rngFrom(g * 2 + 2);
    while (!m.over) resolveTurn(m, botPlays(m, 0, { skill: skillA, rng: ra }), botPlays(m, 1, { skill: skillB, rng: rb }));
    w[m.result.winner ?? 2]++;
  }
  return w;
}
const even = series(0.8, 0.8);
assert.ok(Math.abs(even[0] - even[1]) < 40, `even bots split wins: ${even}`);
const lopsided = series(1, 0);
assert.ok(lopsided[0] > lopsided[1], `skill matters: ${lopsided}`);
console.log('even', even, 'skilled vs random', lopsided);

console.log('wars tests passed');
