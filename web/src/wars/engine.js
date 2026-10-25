// Tokin Wars match engine. Pure functions over a plain state object, so the same
// code can later run on the server for PvP.
import { BOARD, CONDITIONS } from './cards.js';

// Seedable random numbers (mulberry32) so matches can be replayed in tests.
export function rngFrom(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Plot conditions for a match: three different ones.
function pickConditions(rng) {
  return shuffle(Object.keys(CONDITIONS), rng).slice(0, BOARD.plots);
}

export function newMatch({ deckA, deckB, seed }) {
  const rng = rngFrom(seed);
  let n = 0;
  const prep = (deck, side) => shuffle(deck, rng).map((c) => ({ ...c, uid: `${side}${n++}` }));
  const players = [prep(deckA, 0), prep(deckB, 1)].map((deck) => ({
    deck: deck.slice(BOARD.handStart),
    hand: deck.slice(0, BOARD.handStart),
    water: 0
  }));
  const state = {
    turn: 0,
    plots: pickConditions(rng).map((cond) => ({ cond, shown: false, cards: [[], []] })),
    players,
    over: false,
    log: []
  };
  startTurn(state);
  return state;
}

// Start of each turn: reveal the next Plot condition, draw a card, refill Water.
export function startTurn(s) {
  s.turn += 1;
  const p = s.plots[s.turn - 1];
  if (p && !p.shown) {
    p.shown = true;
    s.log.push({ turn: s.turn, text: `${CONDITIONS[p.cond].name} revealed on Plot ${s.turn}.` });
  }
  for (const pl of s.players) {
    if (s.turn > 1 && pl.deck.length && pl.hand.length < BOARD.handMax) pl.hand.push(pl.deck.shift());
    pl.water = s.turn;
  }
}

const capacity = (plot) => (plot.shown && plot.cond === 'smallpot' ? 2 : BOARD.capacity);
const locked = (s, plot) => plot.shown && plot.cond === 'bust' && s.turn > 4;

// Can `side` play this card on this Plot, given cards already staged this turn?
export function canPlay(s, side, card, plotIdx, staged = []) {
  if (s.over) return 'The match is over.';
  const plot = s.plots[plotIdx];
  if (!plot) return 'No such Plot.';
  if (locked(s, plot)) return 'The narcs are watching that Plot.';
  const spent = staged.reduce((t, x) => t + x.card.cost, 0);
  if (spent + card.cost > s.players[side].water) return 'Not enough Water.';
  const here = plot.cards[side].length + staged.filter((x) => x.plot === plotIdx).length;
  if (here >= capacity(plot)) return 'That Plot is full.';
  return null;
}

// Both sides' plays are revealed together. plays = [{ uid, plot }].
export function resolveTurn(s, playsA, playsB) {
  [playsA, playsB].forEach((plays, side) => {
    const pl = s.players[side];
    const staged = [];
    for (const { uid, plot } of plays) {
      const card = pl.hand.find((c) => c.uid === uid);
      if (!card || canPlay(s, side, card, plot, staged)) continue; // ignore anything illegal
      staged.push({ card, plot });
    }
    for (const { card, plot } of staged) {
      pl.hand = pl.hand.filter((c) => c.uid !== card.uid);
      s.plots[plot].cards[side].push({ ...card, side, played: s.turn });
      if (card.ability === 'thirdeye') {
        s.plots.forEach((p) => (p.shown = true));
        s.log.push({ turn: s.turn, text: `${card.name} opened the Third Eye. Every Plot is revealed.` });
      }
    }
    s.log.push({ turn: s.turn, side, text: staged.length ? `${side ? 'Opponent' : 'You'} played ${staged.map((x) => x.card.name).join(', ')}.` : `${side ? 'Opponent' : 'You'} passed.` });
  });

  if (s.turn >= BOARD.turns) {
    s.over = true;
    s.result = result(s);
  } else startTurn(s);
  return s;
}

// ---------- scoring ----------
const isTokin = (c) => c.kind === 'tokin';

// Potency of one card where it sits, with conditions and allies applied.
export function power(s, plotIdx, card) {
  const plot = s.plots[plotIdx];
  const mine = plot.cards[card.side];
  const r = card.rare;
  let p = card.potency;

  // Plot condition.
  if (plot.shown) {
    const c = plot.cond;
    const shielded = card.ability === 'steady' || mine.some((x) => x.ability === 'pesthunter');
    if (c === 'lights' && isTokin(card)) p += 1;
    if (c === 'hotbox' && !isTokin(card)) p += 2;
    if (!shielded) {
      if (c === 'drought' && isTokin(card)) p -= 1;
      if (c === 'pests' && isTokin(card) && card.addin !== 'bug') p -= 2;
      if (c === 'powercut' && card.strain === 'sativa' && card.addin !== 'led') p -= 2;
    }
  }

  // The card's own ability.
  const a = card.ability;
  if (a === 'steady' && r) p += 1;
  if (a === 'pesthunter' && r) p += 1;
  if (a === 'sprint' && card.played <= 3) p += r ? 3 : 2;
  if (a === 'nightowl' && card.played >= 5) p += r ? 4 : 3;
  if (a === 'adaptable' && plot.shown) p += r ? 2 : 1;
  if (a === 'sprout') p += Math.max(0, Math.min(s.turn, BOARD.turns) - card.played);

  // Help from your other cards in the same Plot.
  if (isTokin(card)) {
    for (const x of mine) {
      if (x.uid === card.uid) continue;
      if (x.ability === 'feeder') p += x.rare ? 2 : 1;
      if (x.ability === 'pollinate') p += x.rare ? 2 : 1;
    }
    const strongest = mine.filter(isTokin).sort((a, b) => b.potency - a.potency)[0];
    if (strongest?.uid === card.uid) for (const x of mine) if (x.ability === 'trainer') p += x.rare ? 3 : 2;
  }
  return Math.max(0, p);
}

export function plotTotals(s, plotIdx) {
  const [a, b] = [0, 1].map((side) => s.plots[plotIdx].cards[side].reduce((t, c) => t + power(s, plotIdx, c), 0));
  return { a, b, lead: a > b ? 0 : b > a ? 1 : null };
}

// Win 2 of 3 Plots. If Plots are even, total Potency breaks the tie.
export function result(s) {
  const totals = s.plots.map((_, i) => plotTotals(s, i));
  const won = [0, 1].map((side) => totals.filter((t) => t.lead === side).length);
  let winner = won[0] > won[1] ? 0 : won[1] > won[0] ? 1 : null;
  let tiebreak = false;
  if (winner === null) {
    const sum = [0, 1].map((side) => totals.reduce((t, x) => t + (side ? x.b : x.a), 0));
    winner = sum[0] > sum[1] ? 0 : sum[1] > sum[0] ? 1 : null;
    tiebreak = winner !== null;
  }
  return { winner, won, totals, tiebreak };
}

// ---------- bot ----------
// How good the board looks for `side`: winning Plots count most, margins a little.
function evaluate(s, side) {
  let v = 0;
  s.plots.forEach((plot, i) => {
    const t = plotTotals(s, i);
    const m = side ? t.b - t.a : t.a - t.b;
    v += Math.max(-8, Math.min(8, m)) * 0.4 + (m > 0 ? 4 : m < 0 ? -4 : 0);
  });
  return v;
}

// Bot: builds several greedy plans (adding the play that helps most per Water each step)
// and keeps the one that leaves the board looking best. `skill` 0–1: more skill means more
// plans and less randomness in each.
export function botPlays(s, side, { skill = 0.8, rng = Math.random } = {}) {
  const tries = 1 + Math.round(skill * 11);
  let best = { value: -Infinity, plays: [] };
  for (let i = 0; i < tries; i++) {
    const noise = i === 0 ? 1 - skill : 0.6 + (1 - skill);
    const plan = greedyPlan(s, side, noise * 3, rng);
    if (plan.value > best.value) best = plan;
  }
  return best.plays;
}

function greedyPlan(s, side, noise, rng) {
  const sim = structuredClone(s);
  const pl = sim.players[side];
  const plays = [];
  const staged = [];
  for (let guard = 0; guard < 8; guard++) {
    const base = evaluate(sim, side);
    const options = [];
    for (const card of pl.hand) {
      for (let p = 0; p < sim.plots.length; p++) {
        if (canPlay(sim, side, card, p, staged)) continue;
        sim.plots[p].cards[side].push({ ...card, side, played: sim.turn });
        // Sprouts and late bloomers are worth more than they look right now.
        const future = card.ability === 'sprout' ? (BOARD.turns - sim.turn) * 0.4 : 0;
        const gain = evaluate(sim, side) - base + future;
        sim.plots[p].cards[side].pop();
        options.push({ card, plot: p, score: gain / Math.max(1, card.cost) + rng() * noise });
      }
    }
    options.sort((a, b) => b.score - a.score);
    const pick = options[0];
    if (!pick || pick.score <= 0) break;
    staged.push({ card: pick.card, plot: -1 }); // Water only: the card is already on the sim board
    plays.push({ uid: pick.card.uid, plot: pick.plot });
    sim.plots[pick.plot].cards[side].push({ ...pick.card, side, played: sim.turn });
    pl.hand = pl.hand.filter((c) => c.uid !== pick.card.uid);
  }
  return { plays, value: evaluate(sim, side) };
}
