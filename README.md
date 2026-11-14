# Koti — little steps, closer to home

An independent financial learning prototype for the S-Pankki challenge. Brilliant-inspired interactive lessons turn synthetic transaction evidence into understandable choices. XP rewards learning; it has no cash value.

- [Product and build plan](docs/build-plan.md)
- [Data audit](docs/data-audit.md)
- [Supabase copy of the demo data](supabase/README.md)
- [Verification and limitations](docs/verification.md)
- [Design workflow](docs/design-workflow.md)
- [Contributor setup and Claude Code handoff](CONTRIBUTING.md)
- [Work packages and file ownership](docs/workstreams.md)
- [Goal-led first slice and contributor boundary](docs/slices/goal-led-first-slice.md)
- [Onboarding and future persona plan](docs/onboarding.md)
- [Palette and brand provenance](docs/brand-provenance.md)

The complete first prototype is on `main`, merged through [PR #1](https://github.com/WizardOfAus/JunctionHack2/pull/1). Goal-led onboarding now offers spending clarity, a safety net or a first home. Choose among eight allowlisted synthetic demo situations. The goal, lessons, assumptions and current scenario are shared across the workspace; see [the shared journey contract](docs/shared-journey-context.md). Start collaborator branches from current `main` and follow the work-package boundaries above.

## Run locally

Node 24 recommended (minimum 22.13).

```sh
cd app
npm ci
npm run dev
```

Open the URL printed by the development server, normally http://localhost:5173. No API key is needed. The app uses an explicitly labelled deterministic demo coach. Preferences and lesson progress are stored in this browser.

## Checks

```sh
cd app
npm test
npm run typecheck
npm run test:api # with the development server running
npm run build
```

The application uses React, TypeScript, server routes, and Vinext's Cloudflare-compatible build. The deployment manifest is `app/.openai/hosting.json`. Original illustration and font licensing are recorded in [asset provenance](docs/asset-provenance.md).

## Scope

Money, Learn, Coach and My plan are implemented, including a redesigned balance lesson and two existing lessons, evidence inspection and classification corrections, reserves, spending scenarios, salary delays, a home goal, ASP inputs, and simulated transfers. The supplied ledger is synthetic and fixed at 1 October 2026 (history through 30 September); it is not a live bank account.

Live AI, actual S-Pankki connectivity, authentication for real customer data, cash rewards and money movement are later integration work. The coach agent in `agent/` uses only OpenAI GPT-6.1 Sol (`openai/gpt-6.1-sol`) through the OpenAI API, on the server; see [agent model](agent/README.md#model). Never put model keys in browser code or commit them.
