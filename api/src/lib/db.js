const { CosmosClient } = require('@azure/cosmos');

// Container name -> partition key. All share the database's throughput,
// which keeps us inside the Cosmos DB free tier.
const CONTAINERS = {
  players: '/id', // one per wallet: locked timezone
  sessions: '/id', // sign-in nonces and session tokens (auto-expire)
  entries: '/week', // one per wallet per game week
  checkins: '/entryId',
  pairings: '/tokerId' // permanent Toker<->Tokin pairings
};

let ready = null;

function db() {
  if (!ready) {
    ready = (async () => {
      const client = new CosmosClient(process.env.COSMOS_CONN);
      const { database } = await client.databases.createIfNotExists({ id: 'ccc', throughput: 400 });
      const c = {};
      for (const [id, pk] of Object.entries(CONTAINERS)) {
        const def = { id, partitionKey: { paths: [pk] } };
        if (id === 'sessions') def.defaultTtl = -1; // TTL on, set per item
        c[id] = (await database.containers.createIfNotExists(def)).container;
      }
      return c;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

async function readItem(container, id, pk) {
  try {
    const { resource } = await container.item(id, pk).read();
    return resource || null;
  } catch (e) {
    if (e.code === 404) return null;
    throw e;
  }
}

async function query(container, text, params = {}) {
  const parameters = Object.entries(params).map(([name, value]) => ({ name: '@' + name, value }));
  const { resources } = await container.items.query({ query: text, parameters }).fetchAll();
  return resources;
}

module.exports = { db, readItem, query };
