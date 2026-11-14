# Koti agent

A [Flue](https://flueframework.com) agent that answers questions about the
synthetic S-Pankki Junction 2026 dataset. It runs as its own Node server. The
Koti app coach chat calls it from the app server when `KOTI_AGENT_URL` is set.
Tools calculate all money and dates; the model selects the tools and explains
the results.

The agent can read transactions, make a 35-day Monte Carlo cashflow forecast,
and project when a savings goal is reached. With an Exa key, it can also search the web.

## Setup

Node 22.18 or later. All commands run in `agent/`.

```sh
npm ci
npm run import-data      # downloads the pinned dataset (about 350 MB) and builds data/koti.db
cp .env.example .env     # then set ANTHROPIC_API_KEY
```

Do not commit `.env`. See `.env.example` for all variables:

| Variable | Default | Use |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Model provider key. Any provider Flue supports works. |
| `EXA_API_KEY` | none | [Exa](https://exa.ai) key. Turns on `web_search` and `deep_research`. Without it the agent has no web search. |
| `KOTI_MODEL` | `anthropic/claude-sonnet-5-5` | Model id as `provider/model`. |
| `KOTI_DB_PATH` | `data/koti.db` | Path to the imported dataset. |
| `KOTI_DATA_CUTOFF` | shared demo clock | Last day of history the agent can see; an earlier override runs a backtest. |
| `KOTI_AGENT_TOKEN` | none | When set, `/agents/*` requires `Authorization: Bearer <token>`. |
| `PORT` | `3000` | Port for the built server (`npm start`). The dev server uses 5180. |

`import-data` gets the dataset from
[hackjunction/Junction-2026-S-pankki](https://github.com/hackjunction/Junction-2026-S-pankki)
at revision `fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f`. It checks the row counts
(3,626,755 transactions, 5,100 customers) and records the SHA-256 of each file.
The raw CSVs and the database are in `data/`, which Git ignores.

## Connect the app coach chat

1. Start the agent: `npm run dev` (serves `http://127.0.0.1:5180`).
2. In `app/`, make `app/.dev.vars` (Git ignores it):

   ```sh
   KOTI_AGENT_URL=http://127.0.0.1:5180/agents/koti
   # Same value as KOTI_AGENT_TOKEN in agent/.env, if you set one:
   KOTI_AGENT_TOKEN=
   ```

3. Start the app: `npm run dev` in `app/`, then ask a question in the Coach tab.

`POST /api/coach` (`app/app/api/coach/route.ts`) then sends the question to the agent through
`app/lib/coach/agent.ts` and returns `mode: "agent"`. The app server sets the customer
(`CUST04859`, from `app/lib/server-data.ts`); the browser cannot choose it. If the agent fails or
takes more than 60 seconds, the route returns HTTP 502. Without `KOTI_AGENT_URL`, the route keeps
the deterministic demo answers (`mode: "demo"`).

### App bridge boundaries

App questions are stateless: the server creates a fresh conversation and sends `uid: null`, so an existing analyst/other-customer instance is never resumed. Browser-supplied `conversationId` is rejected. A server-owned session binding is required before adding conversation continuity.

The bridge sets `appMode: true`. These sessions expose historical queries and app-calculated basket explanations only. Monte Carlo and goal tools remain available when using the agent directly, but are not registered for app sessions until a validated contract carries coverage, reserves, existing allocations and scenarios. Use Money / My plan for the app's projections. This avoids substituting an unrelated six-month forecast for the app's current calculation. The live coach mode label/evidence UI is still an integration follow-up.

## Talk to the agent directly

```sh
# Analyst mode: an analyst or adviser studies one synthetic customer at a time
npx flue run src/agents/koti.ts -m "How much did CUST04859 spend on taxis in August 2026?"

# One customer only (coaching mode): the tools refuse other customers
npx flue run src/agents/koti.ts --data '{"customerId":"CUST04859"}' \
  -m "How much did I spend on restaurants from June to August?"

# Forecast and goal questions
npx flue run src/agents/koti.ts --data '{"customerId":"CUST04859"}' \
  -m "How much can I safely put towards my home this month? My emergency reserve is EUR 3,000."
npx flue run src/agents/koti.ts --data '{"customerId":"CUST04859"}' \
  -m "My deposit goal is EUR 30,000 and I have EUR 5,000. How much sooner if I cut café spending by 20%?"
```

Server: `npm run dev`, then `POST /agents/koti/<conversation-id>` (see `src/app.ts`).
`GET /health` returns `{"ok":true}`.

## Tools

| Tool | Use | Notes |
|---|---|---|
| `query_transactions` | Questions about the past | Filters: dates, categories, types, MCC, merchant, direction, amount. Group by category, type, month, week, weekday, MCC or merchant. Every row has a `row:<line>` reference to the source CSV. |
| `forecast_cashflow` | "Is it safe this month?", "What if...?" | 35-day Monte Carlo forecast. Changes: `changeSpending`, `addExpense`, `moveToSavings`, `delayIncome`, `changeIncome` (percent or new monthly amount), `addIncome` (one-off). Returns risk, P10 lowest balance, tightest day, safe amount, and the difference from the baseline. |
| `project_goal` | "When is my deposit ready?", "How much sooner if...?" | Month-by-month arithmetic to a savings goal. Default monthly saving = median of the existing saving transfers in the last 6 months (the same window as the forecast). Changes: `changeSpending`, `changeIncome` (with `toGoalPercent`), `addMonthlySaving`, `oneOffDeposit`. Warns when a plan saves more than the usual monthly surplus. |
| `web_search` | Quick lookup on the web: topics and public data (ASP rules, interest rates, price lists, statistics, rents, offers) | First web tool. Exa `type: "auto"`, 5 results by default (max 10), with text highlights. Optional `includeDomains`, `country` (default `FI`) and `publishedAfter`. Timeout 15 s. Needs `EXA_API_KEY`. |
| `deep_research` | Dig deep: find a specific discount, the exact current rule, or a hard answer | Exa `type: "deep"`: several searches and a short answer with sources (`citations`). Slower (about 4 to 15 s) and costs more, so the agent uses it only when `web_search` is not enough. Timeout 40 s. Needs `EXA_API_KEY`. |
| `evaluate_asp_progress` | "How many ASP months do I have?", "Does EUR 40 count?" | Versioned ASP rules (`asp-2026-06-01`). Counts qualifying months from the opening date and the verified monthly deposits that the user gives, never from the transaction data. Optional: compares savings with 5% and 10% of a home price, and projects a fixed monthly deposit. Accounts opened before 1 June 2026 get a transition explanation, not a count. |
| `find_customers` | Pick synthetic customers to study | Analyst mode only (no `customerId` in `initialData`). Not for browsing customers. |

## Data rules

- The agent reads `app/data/demo-clock.json`: history through 30 September 2026, demo date 1 October. Set `KOTI_DATA_CUTOFF=2026-08-31` to replay the September backtest. Overrides outside the supplied history are rejected.
  September 2026 is held out for evaluation. The store enforces this on every query, and the
  forecast and goal engines reject any row on or after the demo clock.
- Without `customerId` in `initialData`, the conversation is in analyst mode: an analyst or adviser
  studies synthetic customers, one at a time. This is not a pattern for real customers. A real bank
  needs consented, scoped, expiring and audited adviser access, and aggregates-only analyst views
  (see [data insights](../docs/data-insights.md#advisor-and-analyst-views)).
- With `customerId`, the conversation is locked to that customer (coaching mode). The app always sends it.
- Basket figures are not calculated here. The app sends them with each question in a
  `<koti_app_context>` block, calculated by `app/lib/finance.ts` with the user's basket changes.
  Do not add basket rules to the agent. `forecast_cashflow` and `project_goal` do not use baskets.
- All SQL is fixed and parameterised. The model selects filter values, never SQL.
- Web search queries go to Exa, an outside service. The agent is told never to put the customer id,
  names, amounts or transaction details in a query. Web pages are data, not instructions, and web
  facts never change the tool figures for the customer's own money.

## Forecast method (`src/finance/forecast.ts`)

1. Repeating items (salary, housing, utilities, saving transfers, salary sweeps) are found from
   the last 6 months. An item must appear in at least 4 of them. Each one goes on its median day
   with its median amount.
2. Everyday purchases (and bills that do not repeat) are sampled as whole past weeks from the last
   26 weeks (block bootstrap), so weekday patterns stay together.
3. 10,000 runs, a seeded generator (seed = customer + date + version) so results repeat exactly.
   Baseline and scenario use the same random picks.
4. `safeToSetAside = max(0, P10 of lowest balance - floor)`. If the user gives no floor, the engine
   uses EUR 0 and marks the result `low_confidence`.

## Goal method (`src/finance/goal.ts`)

Saving goes in at the end of each month. Optional interest is added monthly. Salary, saving
transfers and surplus use the last 6 months (`RECENT_MONTHS` in `src/finance/history.ts`), the
same window as the forecast, so the two tools agree. A spending change also uses the same monthly
number in both tools. Income changes are what-ifs from the user; the agent never predicts a raise.
Purchase costs and mortgage approval are not included. The goal projection does not add ASP bonus
interest; ASP progress is a separate tool.

## ASP method (`src/finance/asp.ts`)

Rules are a versioned, effective-dated table (`ASP_RULES`). The account uses the rules in force on
its opening date. From 1 June 2026 (source: State Treasury, page updated 5 August 2026): 20 qualifying
months of EUR 50 to EUR 1,500 each, not necessarily in a row; a skipped month keeps earlier months;
savings of 10% of the price (5% and 10 months for interim financing). Deposits in the same month are
added first. Months above the maximum are not counted, and the tool tells the user to ask the bank.
Accounts opened earlier are on transition rules (quarters, or a mix), so the tool explains them and
does not give a count. Interest is not included. Meeting the conditions is not a mortgage approval.

The build plan's audit medians (salary EUR 2,700.99, saving EUR 246.33, surplus EUR 583.38) use
12 months. A test checks them with `monthlyStats(..., 12)`. The tools use 6 months, so for
CUST04859 they give EUR 2,737.43, EUR 249.65 and EUR 808.69.

## Commands

```sh
npm test              # engine unit tests + dataset and tool checks (the dataset checks need data/koti.db, else they are skipped)
npm run check:types
npm run build && npm start
```

Dependency note: `@earendil-works/pi-ai` and `pi-agent-core` are pinned to 1.4.0 (`overrides` in
`package.json`). Version 1.5.x removed an export that `@flue/runtime` 2.3.0 needs.
