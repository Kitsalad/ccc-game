const { app } = require('@azure/functions');
const { handler } = require('../lib/http');
const { ownedBy, traitRarity } = require('../lib/nft');

// Tokin Wars: the signed-in wallet's Tokers and Tokins with their traits and how
// rare each trait is. The game turns these into cards (web/src/wars/cards.js).
app.http('warsCards', {
  route: 'wars/cards',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: handler(async ({ wallet }) => {
    const [tokers, tokins, tokerRarity, tokinRarity] = await Promise.all([
      ownedBy('toker', wallet),
      ownedBy('tokin', wallet),
      traitRarity('toker'),
      traitRarity('tokin')
    ]);
    const withPct = (list, rarity) =>
      list.map(({ attributes, ...n }) => ({
        ...n,
        traits: (attributes || []).map((t) => ({ ...t, pct: rarity?.[`${t.type}\u0000${t.value}`] ?? null }))
      }));
    return { wallet, tokers: withPct(tokers, tokerRarity), tokins: withPct(tokins, tokinRarity) };
  })
});
