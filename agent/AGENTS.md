# AGENTS.md

This is a [Flue](https://flueframework.com) project: agents are TypeScript functions.
Read the repository `AGENTS.md` first. Setup and environment variables are in `README.md`.

## Layout

- `src/agents/koti.ts` — the Koti agent (`'use agent'`). `initialData.customerId` locks a conversation to one customer.
- `src/tools/` — Flue tools: `query_transactions`, `forecast_cashflow`, `project_goal`, `find_customers`.
- `src/finance/` — pure finance code (integer cents, dates, dataset vocabulary). No I/O.
  `forecast.ts` is the Monte Carlo engine, `goal.ts` the goal projection, `history.ts` the shared
  statistics both use (`RECENT_MONTHS` = 6).
- `src/data/store.ts` — read-only SQLite access (`node:sqlite`). Every query stops at the data cutoff.
- `scripts/import-data.ts` — builds `data/koti.db` from the pinned upstream dataset.
- `src/app.ts` — the route map (`/health`, `/agents/koti`). `src/db.ts` — conversation storage.
- The app calls this server from `app/lib/coach/agent.ts`, never from the browser.

## Rules

- Money is integer cents. Tools calculate; the model never does arithmetic.
- Never let data after `KOTI_DATA_CUTOFF` (default 2026-08-31) reach the agent, the forecast or the goal projection.
- No arbitrary SQL. Add new filters or groupings as fixed, parameterised SQL.
- Never commit `.env` or keys. Add new variables to `.env.example` and `README.md`.

## Commands

- `npm run import-data` — download and import the dataset.
- `npm test` — engine unit tests, and dataset and tool tests.
- `npx flue run src/agents/koti.ts --message "..."` — run the agent locally (needs a key in `.env`).
- `npm run dev` — start the dev server on 127.0.0.1:5180. `npm run build` — build `dist/server.mjs`.
- `npm run check:types` — typecheck.
- `npx flue docs search <query>` — search the Flue docs.
