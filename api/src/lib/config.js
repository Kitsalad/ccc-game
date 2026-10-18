// Game settings in one place. Change values here, push, and the API redeploys.

module.exports = {
  // NFT collections checked for ownership (via Alchemy).
  TOKERS: {
    network: 'eth-mainnet',
    address: '0x80a4b80c653112b789517eb28ac111519b608b19' // Crypto Cannabis Club (Tokers), Ethereum
  },
  TOKINS: {
    network: 'polygon-mainnet',
    address: '0x58530e43b89234fe08fd20ed06ef536233b6dd69' // NFTokins, Polygon
  },

  // Game week runs Mon 12am – Sun 11:59pm in this zone.
  GAME_TZ: 'America/New_York',

  // Entry limits (v1.3 rules).
  MAX_TOKINS_PER_ENTRY: 3,

  // POC only: lets you enter the week that's already running so you can test
  // check-ins straight away. Set to false before going live.
  ALLOW_CURRENT_WEEK_ENTRY: true,

  // Check-in windows in the player's local time (hours, 24h, start inclusive).
  WINDOWS: {
    morning: { start: 5, end: 11, points: 6 },
    day: { start: 11, end: 17, points: 2, maxPerDay: 2, minGapHours: 2 },
    evening: { start: 17, end: 23, points: 4 }
  },
  PERFECT_WEEK_BONUS: 2
};
