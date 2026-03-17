# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   ├── crypto-analyst/     # React + Vite crypto dashboard (frontend)
│   └── mockup-sandbox/     # Component preview server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/crypto-analyst` (`@workspace/crypto-analyst`)

**Garong'Space** — a full-featured crypto analysis dashboard with Binance Futures dark theme, served at `/`.

Features:
- Market Overview: global stats (total market cap, 24h volume, BTC/ETH dominance, Fear & Greed index)
- Live Prices Table: sortable/searchable table of top 30 cryptocurrencies
- Price Chart: interactive area chart for any selected coin with 7/30/90 day history
- Trending Coins: card grid showing currently trending/hot coins
- Watchlist: persistent watchlist stored in PostgreSQL
- News Feed: AI-curated news from 13+ RSS sources with Claude sentiment analysis (BULLISH/BEARISH/NEUTRAL)
- Live Trading Signal System: 4-layer scoring (Technical, Derivatives, On-Chain, Macro) with Claude AI analysis
- Dark/light theme toggle + EN/ID language toggle (default: Indonesian, dark mode)

Data sources: CryptoCompare (prices, candles), CoinGecko (market overview, dominance), DefiLlama (TVL), Alternative.me (Fear & Greed), Blockchair (mempool), Mempool.space (mempool count)

**Important**: Binance Spot + Futures APIs are geo-blocked from Replit. Candle data uses CryptoCompare fallback. Derivatives layer gracefully returns score=0/maxPossible=0 with warning when blocked.

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express, WebSocket price stream, scanner scheduler, news sentiment sync
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers
- Services: `src/services/scanner.ts` — 4-layer trading signal scanner
- Depends on: `@workspace/db`

### API Endpoints (all under /api)

- `GET /crypto/prices` — top 30 coins with price, market cap, 24h change
- `GET /crypto/market-overview` — global market stats
- `GET /crypto/:symbol/history?days=7` — price history
- `GET /crypto/trending` — trending coins
- `GET /watchlist` — user watchlist; `POST /watchlist`; `DELETE /watchlist/:symbol`
- `GET /news` — AI-curated news with sentiment
- `GET /signals` — active trading signals
- `GET /signals/history` — historical signals
- `POST /signals/scan` — trigger immediate scan
- `GET /signals/settings` — scanner settings; `PATCH /signals/settings`
- `GET /signals/api-monitor` — API usage & status
- `GET /signals/debug/:coin` — debug single coin scan (scores without saving)
- `GET /ws/prices` (WebSocket) — real-time price stream

### Trading Signal System

Scoring:
- **Technical** (max 2): RSI overbought/oversold (+1), Support/Resistance position (+1)
- **Derivatives** (max 5, blocked on Replit): Funding rate, OI change, L/S ratio, taker ratio
- **On-Chain** (max 4): Mempool congestion, TX volume change, stablecoin flow, TVL change
- **Macro** (max 4): Fear & Greed index, BTC dominance change, news sentiment

Dynamic normalization: `rawScore / totalMaxPossible * 10`. If derivatives are blocked, divisor = 10 instead of 15.
Signal triggers: |normalizedScore| >= 5.0 = RISKY, >= 6.0 = SAFE/MODERATE.

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- Schema: `watchlist` table (id, symbol, name, added_at), `signals` table (full signal with layer scores, levels, AI analysis)

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`).

Run codegen: `pnpm --filter @workspace/api-spec run codegen`
