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
        image: n.image?.thumbnailUrl || n.image?.cachedUrl || n.image?.originalUrl || null
      });
    }
    pageKey = j.pageKey;
    if (!pageKey) break;
  }
  return out;
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

module.exports = { ownedBy, owns };
