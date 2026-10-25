# CCC Games

Two Crypto Cannabis Club games on one site:
- **Grow room** (`/`): weekly grow competition for holders, 1 Toker + 1 Tokin per wallet per week.
- **Tokin Wars** (`/wars/`): free-to-play card battler. Anyone can play with the starter deck; holders sign in and
  their Tokers and Tokins become cards. Concept doc: https://claude.ai/artifact/2rRuFusrhqdNdKYHSyPLRo

## Layout
- `web/` — game site (Vite). Deploys to Azure Static Web App `ccc-game-web` on push.
- `api/` — back end (Azure Functions, Node 20). Deploys to `ccc-game-api-6147` on push.
- `api/src/lib/config.js` — contract addresses, windows, points, POC switches.
- `web/src/wars/cards.js` — Tokin Wars rules: Plot conditions, abilities, power budget, starter deck, NFT trait → card mapping.
- `web/src/wars/engine.js` — Tokin Wars match engine and bot (pure functions; can move server-side for PvP).
- Tests: `cd api && npm test`, `cd web && npm test` (both run in the deploy workflows).

## Azure (resource group `ccc-game-rg`, East US 2)
| Resource | Name |
|---|---|
| Static Web App (Free) | ccc-game-web |
| Function App (Flex Consumption) | ccc-game-api-6147 |
| Cosmos DB (free tier) | ccc-game-db-6147 — database `ccc` |
| Key Vault | ccc-game-kv-6147 — `cosmos-conn`, `alchemy-key`, `opensea-key` |

Function App settings `COSMOS_CONN`, `ALCHEMY_KEY`, `OPENSEA_KEY` are Key Vault references.

## GitHub secrets
- `AZURE_CREDENTIALS` — service principal `ccc-game-github` (Contributor on ccc-game-rg), used by both workflows

## Tokin Wars POC (25 Oct 2026)
1v1 against labelled bots: 3 Plots, 6 turns, Water = turn number, simultaneous turns with a 30-second timer, win 2 of 3
Plots (total Potency breaks ties). 12-card starter deck; holder cards from `GET /api/wars/cards` (owned Tokers/Tokins
with traits and trait rarity from Alchemy). Same power budget for every card; rare traits change the ability and cost
1 Potency; No Eyes Tokers get Third Eye and cost 1 more Water. XP, Seeds, card frames and the Mystery Seed card are
stored in the browser for now. First 3 matches use an easy bot.

Card cost and Toker ability are picked deterministically from the NFT's traits until the Tokin_Master and Grower
Profile mappings are wired in (see `tokinCard` / `tokerCard`).

## Build 2 (19 Oct 2026)
Grow room (tent scene with Toker + Tokin images), 1 Tokin per entry, server-side plant (moisture, nutrients,
health, size, pests) ticking hourly, read-the-plant signs, check-in actions (water/feed dose 1–5, pest check,
talk, light timer) scored per v1.3, weekly water/feed stock, day-visit hover risk, last-week summary.
Tuning in `api/src/lib/config.js` (PLANT).

## Build 1 (Oct 2026)
Wallet sign-in (signed message, no gas), Toker/Tokin ownership check via Alchemy, entry rules
(1 Toker + up to 3 Tokins, permanent pairing rule, time zone locked on first entry), morning/evening/day
check-ins in the player's local time, care points (morning 6, evening 4, perfect week +2).
Day check-ins are recorded but don't score until plant reading lands.

POC switch: `ALLOW_CURRENT_WEEK_ENTRY` (api + web config) lets you enter the running week for testing.
