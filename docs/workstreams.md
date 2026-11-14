# Work packages for the next iteration

Updated 14 November 2026. Codex owns onboarding, money overview, the first interactive lesson and shell integration for [the first slice](slices/goal-led-first-slice.md). Claude owns coaching, Research/Exa and EDA/basket-classifier proposals. Other packages remain unassigned.

The current shell, screens and lesson dialog live together in `app/components/koti-app.tsx`. The new onboarding, overview and first lesson are modular under `app/features/`; the remaining existing screens are **not yet fully modular**. Separate worktrees alone do not solve that shared-file bottleneck. Use the boundaries below, with one integration owner; extract existing screen components in a small behavior-preserving PR before multiple contributors change existing UI.

| ID | Package | Owned paths | Shared dependency / done condition |
| --- | --- | --- | --- |
| I | Integration and component extraction | `app/components/koti-app.tsx`, `app/app/page.tsx`, `app/app/globals.css`; shared primitives under `app/components/shared/` | Extract existing screens into the feature folders below before assigning edits to those screens. Preserve state, semantics and visuals; run tests, build and browser checks. Own package/lock/deployment changes. |
| O | Onboarding and journey selection | New `app/features/onboarding/`, its CSS Modules and `app/tests/onboarding.test.mjs` | Follow `onboarding.md`. Return a validated goal/profile selection via a callback. I integrates the entry gate and storage migration. D supplies approved persona options. No invented user histories. |
| L | Interactive learning | `app/lib/learning.ts`, new `app/features/learning/`, `app/tests/learning.test.mjs` | After I extracts the existing lesson component, improve reusable lessons and goal-relevant recommendations. Preserve no-pressure progression and one-time XP. |
| D | Dataset and demo personas | `app/scripts/import-data.py`, `app/data/`, `app/lib/server-data.ts`, `app/app/api/transactions/`, new `app/lib/personas/`, `app/tests/personas.test.mjs` | Audit additional source customers using history through the shared demo clock cutoff. Produce a server-side allowlisted catalogue. Coordinate the customer-scope contract with F before switching runtime personas. |
| F | Finance and goal calculations | `app/lib/finance.ts`, `app/lib/contracts.ts`, `app/app/api/finance/`, `app/tests/finance.test.mjs`; new goal calculation modules if needed | Remove hard-coded customer scope only alongside D's explicit server-owned identity. Preserve current baseline answers. Add reserve/understanding goals without weakening liquidity safeguards. |
| C | Coaching | `app/app/api/coach/`, new `app/lib/coach/`, `app/features/coach/`, `app/tests/coach.test.mjs` | Keep demo mode usable. Provider integration waits for keys. All numeric answers use F's tools and D's scoped rows; preserve evidence, errors and explicit mode. I integrates the UI after extraction. |
| H | Home plan and ASP presentation | New `app/features/home-plan/` and local styles | Begin after I extracts the existing plan. Make the home journey conditional on the selected goal; preserve sourced ASP explanations. F owns the calculations. |

Paths marked “new” are reserved module locations to create during that package; they do not exist in the shipped baseline yet. Shared UI state, request dispatch and persistence stay in the shell until a single owner deliberately moves them. Do not have every branch perform its own extraction.

## Integration order

1. I extracts reusable Button/Modal/MoneyInput/CashChart and the existing screen/lesson views without behavior changes; merges that small PR.
2. O can build an isolated onboarding component while D audits personas and F designs the explicit identity/goal contract. L and C can work on their already separate domain modules now.
3. Merge D/F's agreed catalogue and request contract together or in coordinated prerequisite PRs. Update API smoke tests once, with a named owner.
4. I wires O into the shell and removes unconditional home copy/sidebars for other goals. H adapts the home view, and L/C consume the selected goal.
5. Run cross-persona isolation, refresh/back/reset, unknown coverage, XP persistence, narrow-screen and keyboard checks. Publish one integrated preview.

## Interface expectations

- Goal selection, data persona and scenario are different fields. A goal change must not swap someone's transactions.
- O emits onboarding state; it does not compute spending room. The proposed shape is in `onboarding.md` and must be validated by the shared contract owner before integration.
- A persona ID is an allowlisted demo catalogue key, not an arbitrary `customer_id` passed through from the browser. Runtime endpoints resolve it on the server. Switching personas must cancel stale requests and clear old evidence/chat/scenario state.
- Feature components receive minimal props and callbacks, not another feature's internal state setters. Never import the full source data into client components.
- Prefer new tests per package to editing one central test file. The integration owner updates `app/tests/api-smoke.mjs` when shared response contracts change.

## PR acceptance

State the package ID, actual owner, owned paths, dependencies, observed behavior, test results and remaining limitations. Keep refactors separate from behavior changes. No one should need to read the chat to understand how to run or review a PR.
