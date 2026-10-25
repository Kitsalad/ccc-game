const { TOKERS, TOKINS } = require('./config');
const { HttpError } = require('./http');

function base(network) {
  const key = process.env.ALCHEMY_KEY;
  if (!key) throw new HttpError(503, 'NFT lookups are not configured yet (missing Alchemy key).');
  return `https://${network}.g.alchemy.com/nft/v3/${key}`;
}

function collection(kind) {
  const c = kind === 'toker' ? TOKERS : TOKINS;
  if (!c.address) throw new HttpError(503, `The ${kind === 'toker' ? 'Tokers' : 'Tokins'} contract isn't set up yet.`);
  return c;
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Alchemy ${r.status}: ${await r.text()}`);
  return r.json();
}

// All NFTs of one collection held by a wallet.
async function ownedBy(kind, wallet) {
  const c = collection(kind);
  const out = [];
  let pageKey = '';
  for (let i = 0; i < 20; i++) {
    const u = new URL(`${base(c.network)}/getNFTsForOwner`);
    u.searchParams.set('owner', wallet);
    u.searchParams.append('contractAddresses[]', c.address);
    u.searchParams.set('withMetadata', 'true');
    u.searchParams.set('pageSize', '100');
    if (pageKey) u.searchParams.set('pageKey', pageKey);
    const j = await getJson(u);
    for (const n of j.ownedNfts || []) {
      out.push({
        id: n.tokenId,
        name: n.name || n.raw?.metadata?.name || `#${n.tokenId}`,
        image: n.image?.thumbnailUrl || n.image?.cachedUrl || n.image?.originalUrl || null,
        attributes: attrs(n)
      });
    }
    pageKey = j.pageKey;
    if (!pageKey) break;
  }
  return out;
}

// Traits as [{ type, value }], whatever shape the metadata uses.
function attrs(n) {
  const a = n.raw?.metadata?.attributes;
  if (Array.isArray(a))
    return a.filter((x) => x && x.value != null).map((x) => ({ type: String(x.trait_type ?? x.type ?? 'Trait'), value: String(x.value) }));
  if (a && typeof a === 'object') return Object.entries(a).map(([type, value]) => ({ type, value: String(value) }));
  return [];
}

// How common each trait value is across the collection, as a percentage.
// Cached for 6 hours per collection; null if Alchemy can't summarise it.
const rarityCache = {};
async function traitRarity(kind) {
  const hit = rarityCache[kind];
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.data;
  const c = collection(kind);
  let data = null;
  try {
    const u = new URL(`${base(c.network)}/summarizeNFTAttributes`);
    u.searchParams.set('contractAddress', c.address);
    const j = await getJson(u);
    const total = Number(j.totalSupply) || 0;
    if (total && j.summary) {
      data = {};
      for (const [type, values] of Object.entries(j.summary))
        for (const [value, count] of Object.entries(values)) data[`${type}\u0000${value}`] = Math.round((count / total) * 10000) / 100;
    }
  } catch {
    data = null;
  }
  rarityCache[kind] = { at: Date.now(), data };
  return data;
}

// True if `wallet` currently owns token `id` of the collection.
async function owns(kind, wallet, id) {
  const c = collection(kind);
  const u = new URL(`${base(c.network)}/getOwnersForNFT`);
  u.searchParams.set('contractAddress', c.address);
  u.searchParams.set('tokenId', String(id));
  const j = await getJson(u);
  return (j.owners || []).some((o) => o.toLowerCase() === wallet.toLowerCase());
}

// Name and image for one NFT.
async function meta(kind, id) {
  const c = collection(kind);
  const u = new URL(`${base(c.network)}/getNFTMetadata`);
  u.searchParams.set('contractAddress', c.address);
  u.searchParams.set('tokenId', String(id));
  const n = await getJson(u);
  return {
    id: String(id),
    name: n.name || n.raw?.metadata?.name || `#${id}`,
    image: n.image?.cachedUrl || n.image?.thumbnailUrl || n.image?.originalUrl || null
  };
}

module.exports = { ownedBy, owns, meta, traitRarity };
