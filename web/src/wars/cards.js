// Tokin Wars card rules: Plot conditions, abilities, the free starter deck,
// and how a Toker or Tokin NFT's traits turn into a card.
//
// Power budget: a plain card has Potency = 2 x Cost - 1. Every ability "costs"
// some Potency (its tax), so cards with better abilities are weaker on paper.
// Rare traits upgrade the ability but take 1 more Potency (the catch).

export const BOARD = { plots: 3, turns: 6, capacity: 4, handStart: 4, handMax: 7, deckSize: 12 };

// Plot conditions. One is revealed per Plot on turns 1, 2 and 3.
export const CONDITIONS = {
  lights: { name: 'Grow Lights', icon: '💡', text: 'Tokins here get +1.' },
  drought: { name: 'Drought', icon: '🏜️', text: 'Tokins here get -1.', bad: true },
  pests: { name: 'Pest Outbreak', icon: '🐛', text: 'Tokins here get -2. Bug buddies are immune.', bad: true },
  powercut: { name: 'Power Cut', icon: '🔌', text: 'Sativas here get -2. LED Tokins are immune.', bad: true },
  hotbox: { name: 'Hotbox', icon: '💨', text: 'Tokers here get +2.' },
  bust: { name: 'The Narcs', icon: '🚨', text: 'Nobody can play here after turn 4.' },
  smallpot: { name: 'Small Pot', icon: '🪴', text: 'Only 2 cards per side fit here.' },
  greenhouse: { name: 'Greenhouse', icon: '🏡', text: 'Nothing special. Just good vibes.' }
};

// Abilities. `tax` is the Potency it costs; `up` is the bonus when the card is rare.
export const ABILITIES = {
  none: { name: '', tax: 0, text: () => '' },
  // Tokins
  steady: { name: 'Steady', tax: 1, text: (r) => `Indica. Ignores bad Plot conditions.${r ? ' +1 Potency.' : ''}` },
  sprint: { name: 'Sprint', tax: 1, text: (r) => `Sativa. +${r ? 3 : 2} if played on turns 1–3.` },
  adaptable: { name: 'Adaptable', tax: 0, text: (r) => `50/50. +${r ? 2 : 1} once this Plot's condition is showing.` },
  pollinate: { name: 'Pollinate', tax: 2, text: (r) => `Male. Your other Tokins here get +${r ? 2 : 1}.` },
  sprout: { name: 'Sprout', tax: 0, text: () => '+1 for every turn after the one it was planted.' },
  // Tokers
  feeder: { name: 'Feeder', tax: 2, text: (r) => `Your Tokins here get +${r ? 2 : 1}.` },
  trainer: { name: 'Trainer', tax: 2, text: (r) => `Your strongest Tokin here gets +${r ? 3 : 2}.` },
  nightowl: { name: 'Night Owl', tax: 2, text: (r) => `+${r ? 4 : 3} if played on turn 5 or 6.` },
  pesthunter: { name: 'Pest Hunter', tax: 1, text: (r) => `Your cards here ignore bad conditions.${r ? ' +1 Potency.' : ''}` },
  thirdeye: { name: 'Third Eye', tax: 1, text: () => 'When played, every Plot condition is revealed.' }
};

// Extra protection some Tokin add-ins give.
export const ADDINS = {
  bug: { name: 'Bug buddy', text: 'Immune to Pest Outbreak.' },
  led: { name: 'LED', text: 'Immune to Power Cut.' }
};

const TOKER_ABILITIES = ['feeder', 'trainer', 'nightowl', 'pesthunter'];

// Potency from the budget, never below 0.
export function budget(cost, ability, rare = false) {
  return Math.max(0, 2 * cost - 1 - (ABILITIES[ability]?.tax || 0) - (rare ? 1 : 0));
}

function make(o) {
  const ability = o.ability || 'none';
  return {
    key: o.key,
    kind: o.kind,
    name: o.name,
    cost: o.cost,
    potency: o.potency ?? budget(o.cost, ability, o.rare),
    ability,
    rare: !!o.rare,
    strain: o.strain || null, // 'indica' | 'sativa' | '5050' (Tokins)
    male: !!o.male,
    addin: o.addin || null, // 'bug' | 'led'
    art: o.art || null, // emoji for starter cards
    image: o.image || null, // NFT image
    nft: o.nft || null, // { kind, id, traits: [{type, value, pct}] }
    flavour: o.flavour || ''
  };
}

// ---------- free starter deck ----------
const STARTER = [
  { key: 's-backyard', kind: 'toker', name: 'Backyard Bazza', cost: 2, ability: 'feeder', art: '🧑‍🌾', flavour: 'Feeds them Weet-Bix water. It works, somehow.' },
  { key: 's-hippie', kind: 'toker', name: 'Old Hippie', cost: 2, ability: 'pesthunter', art: '🧔', flavour: 'Talks the mites out of it.' },
  { key: 's-nightshift', kind: 'toker', name: 'Night Shift', cost: 3, ability: 'nightowl', art: '🦉', flavour: 'Does his best work at 3am.' },
  { key: 's-lst', kind: 'toker', name: 'LST Larry', cost: 3, ability: 'trainer', art: '🪢', flavour: 'Ties everything down. Everything.' },
  { key: 's-couchlock', kind: 'tokin', name: 'Couch Lock Kush', cost: 3, ability: 'steady', strain: 'indica', art: '🛋️', flavour: 'Not going anywhere. Neither are you.' },
  { key: 's-purple', kind: 'tokin', name: 'Purple Haze Daze', cost: 2, ability: 'steady', strain: 'indica', art: '🟣' },
  { key: 's-sunrise', kind: 'tokin', name: 'Sunrise Haze', cost: 2, ability: 'sprint', strain: 'sativa', art: '🌅', flavour: 'Up before the alarm.' },
  { key: 's-rocket', kind: 'tokin', name: 'Rocket Fuel', cost: 3, ability: 'sprint', strain: 'sativa', art: '🚀' },
  { key: 's-fence', kind: 'tokin', name: 'Fence Sitter', cost: 3, ability: 'adaptable', strain: '5050', art: '⚖️', flavour: "Can't decide. Doesn't need to." },
  { key: 's-bigbud', kind: 'tokin', name: 'Big Bud Energy', cost: 4, strain: 'indica', art: '🌳', flavour: 'No tricks. Just big.' },
  { key: 's-dusty', kind: 'tokin', name: 'Dusty Dave', cost: 3, ability: 'pollinate', strain: 'indica', male: true, art: '🌼', flavour: 'Gets pollen on everything.' },
  { key: 's-ladybird', kind: 'tokin', name: 'Ladybird Lemon', cost: 1, strain: 'sativa', addin: 'bug', art: '🐞' }
];

// Earned on a free player's first win. Plays in Tokin Wars; the real grow needs a Toker and a Tokin.
export const SEED_CARD = make({
  key: 's-seed', kind: 'tokin', name: 'Mystery Seed', cost: 1, potency: 0, ability: 'sprout', strain: '5050', art: '🌱',
  flavour: 'The real grow needs a Toker and a Tokin.'
});

export const STARTER_DECK = STARTER.map(make);
export const STARTER_BY_KEY = Object.fromEntries([...STARTER_DECK, SEED_CARD].map((c) => [c.key, c]));

// Bots play these. Never NFT cards.
export const BOT_DECK = STARTER_DECK;

// ---------- NFT traits -> card ----------
// The mapping reads trait values by pattern so it keeps working if trait names
// differ slightly. Tweak the patterns here as the real trait sheet firms up.
const RARE_PCT = 5; // a trait held by 5% or fewer counts as rare

// Small deterministic hash so the same NFT always makes the same card.
function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const valOf = (traits, re) => traits.find((t) => re.test(t.type))?.value;
const anyVal = (traits, re) => traits.some((t) => re.test(String(t.value)));
const rarest = (traits) => traits.filter((t) => t.pct != null && !/^(none|common)$/i.test(t.value)).sort((a, b) => a.pct - b.pct)[0];

export function tokinCard(n) {
  const traits = n.traits || [];
  const all = traits.map((t) => `${t.type}:${t.value}`).join('|');
  const strainV = String(valOf(traits, /strain|type|genetic|dominan/i) || traits.map((t) => t.value).find((v) => /indica|sativa|50|hybrid/i.test(v)) || '');
  const strain = /50|hybrid/i.test(strainV) ? '5050' : /sativa/i.test(strainV) ? 'sativa' : /indica/i.test(strainV) ? 'indica' : ['indica', 'sativa', '5050'][hash(n.id) % 3];
  const gender = String(valOf(traits, /gender|sex/i) || '');
  const male = /^male$/i.test(gender.trim()); // no Gender trait = female (grow comp rule)
  const addin = anyVal(traits, /lady ?bug|mantis/i) ? 'bug' : anyVal(traits, /\bled\b/i) ? 'led' : null;
  const r = rarest(traits);
  const rare = !!r && r.pct <= RARE_PCT;
  const cost = 1 + (hash(all || n.id) % 4); // 1–4
  const ability = male ? 'pollinate' : { indica: 'steady', sativa: 'sprint', '5050': 'adaptable' }[strain];
  return make({
    key: `tokin-${n.id}`, kind: 'tokin', name: n.name || `Tokin #${n.id}`, cost, ability, rare, strain, male, addin,
    image: n.image, nft: { kind: 'tokin', id: n.id, traits }, flavour: rare ? `Rare: ${r.type} ${r.value} (${r.pct}%)` : ''
  });
}

export function tokerCard(n) {
  const traits = n.traits || [];
  const eyes = String(valOf(traits, /eye/i) || '');
  const noEyes = /no eyes/i.test(eyes);
  const r = rarest(traits);
  const rare = !!r && r.pct <= RARE_PCT;
  const sig = traits.filter((t) => !/background|skin/i.test(t.type)).map((t) => t.value).join('|') || n.id;
  const ability = noEyes ? 'thirdeye' : TOKER_ABILITIES[hash(sig) % TOKER_ABILITIES.length];
  // No Eyes: the catch is +1 Water on top of the normal rare penalty.
  const cost = 1 + (hash(n.id + sig) % 3) + (noEyes ? 1 : 0); // 1–3 (+1)
  return make({
    key: `toker-${n.id}`, kind: 'toker', name: n.name || `Toker #${n.id}`, cost, ability, rare: rare && !noEyes,
    potency: noEyes ? budget(cost - 1, ability) : undefined,
    image: n.image, nft: { kind: 'toker', id: n.id, traits },
    flavour: noEyes ? 'No Eyes: sees everything, costs 1 more Water.' : rare ? `Rare: ${r.type} ${r.value} (${r.pct}%)` : ''
  });
}

export const OPENSEA = {
  toker: (id) => `https://opensea.io/assets/ethereum/0x80a4b80c653112b789517eb28ac111519b608b19/${id}`,
  tokin: (id) => `https://opensea.io/assets/matic/0x58530e43b89234fe08fd20ed06ef536233b6dd69/${id}`,
  tokers: 'https://opensea.io/collection/cryptocannabisclub',
  tokins: 'https://opensea.io/collection/nftokins'
};
