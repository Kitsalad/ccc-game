# CCC Grow Game

Weekly grow competition for Crypto Cannabis Club holders: 1 Toker + up to 3 Tokins per wallet per week.

## Layout
- `web/` — game site (Vite). Deploys to Azure Static Web App `ccc-game-web` on push.
- `api/` — back end (Azure Functions, Node 20). Deploys to `ccc-game-api-6147` on push.
- `api/src/lib/config.js` — contract addresses, windows, points, POC switches.

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
