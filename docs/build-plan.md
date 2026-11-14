# Koti — first-home financial trainer

Status: first prototype implemented and merged to main; goal-led onboarding and team work packages prepared for the next iteration.
Date: 14 November 2026. Working name: Koti (Finnish for home).
Repository: https://github.com/WizardOfAus/JunctionHack2
Source brief: https://chatgpt.com/space/page_61975f138de08191a3bbbf0533cc05d5

## Product promise
Make progress towards your first home while protecting everyday life.
A standalone, mobile-first product compatible with S-Pankki's visual and integration context.
Serve a financially stable first-home saver. The demo uses synthetic customer CUST04859.
English first; keep copy separate from calculation logic for future Finnish translation.

## Confirmed product decisions
- Standalone identity; do not imply an official bank product or endorsement.
- Use S-Pankki-compatible greens with a warmer, more playful learning experience.
- Brilliant-inspired visual learning, short quests, immediate feedback and visible mastery.
- Learn-to-earn inspiration from RabbitHole and Earn: learn, demonstrate understanding, earn progress.
- Initial rewards are non-monetary XP, completed lessons and milestones. No cash/token rewards,
  commercial partner rewards, financial return guarantees or invented reward funding.
- Explain the financial answer first. Learning is optional and contextual, never a gate to account access.
- No punitive streaks, pressure to save beyond capacity, or celebrations for merely forecast savings.
- Select practical tools freely. The first target is a working end-to-end browser demo.
- The original brief assumes 24 hours. Exact judging deadline remains unconfirmed; use elapsed stages.

## Experience
Navigation: Today, Coach, Plan. Data and connection controls in a reachable drawer.

### First run
Offer a clearly labelled synthetic demo. Confirm/edit the home price or deposit target, home savings,
ASP opening date and verified history, emergency reserve, obligations and account coverage.
Unknown is a valid answer; show what cannot yet be estimated. Goal defaults are fictional inputs.

### Today
One primary next step, estimated spending capacity, freshness date and reason.
Three inspectable baskets: regular essentials, irregular essentials and flexible everyday spending.
A short next lesson and home-goal preview. Use a compact path of learning milestones.

### Coach
A persistent question composer with suggested starting points, fresh free-text questions,
short explanations, interactive scenario cards and inspectable transaction evidence.
The model selects constrained tools; code computes money and dates.
If credentials are absent or a model fails, explicitly label deterministic demo responses.

### Plan
Home-saving progress and ASP qualifying-month progress shown separately.
Editable assumptions and one adjustable 28-day challenge.
Separate estimated savings, observed spending reductions and simulated completed transfers.
Add an unexpected essential expense and adapt or pause the challenge.

### Learning and rewards
Three initial lessons: balance versus spending room; protecting an emergency reserve;
what a spending change actually contributes towards a home.
Each lesson has an interactive visual, a short comprehension check, explanatory retry feedback,
and an idempotent XP reward. Progress persists locally for the demo and can be reset/exported.
Illustrations and progress should feel playful yet adult. A small home evolves with learning milestones.
No separate top-level learning dashboard; lessons appear in Today, Coach and Plan context.
Future cash rewards need a separately agreed sponsor, eligibility, budget and redemption design.

## Design system
Warm light backgrounds, deep forest text, green primary actions, lime learning accents and restrained
peach/lilac secondary illustrations. Clear type hierarchy, large useful controls and generous whitespace.
Use original lightweight illustrations; do not copy Brilliant or S-Pankki assets.
Prioritize one action per state and progressively reveal calculations and evidence.
Desktop uses a persistent navigation rail and a useful goal sidebar; phone uses a bottom navigation.
Test at 390 px, keyboard-only, visible focus, accessible labels, sufficient contrast and reduced motion.
Handle loading, empty, disconnected, stale, invalid-input and failed-action states.
Use official Impeccable guidance with a pinned revision: product/design context, critique, audit,
adapt and polish. Record the applied version and review results. Preserve normal execution controls.

## Data and provenance
Source: https://github.com/hackjunction/Junction-2026-S-pankki
Pinned revision: fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f
Demo clock: 1 September 2026.
Main customer: CUST04859, synthetic age 28.
Coaching can see history only through 31 August 2026. September is a separate holdout.
The source contains 3,626,755 transactions for 5,100 customers according to the source brief;
reproduce the audit during import. The transaction CSV uses Git LFS and is approximately 346 MB.
Import server-side; never ship the full CSV to the browser. Preserve original rows and row references.
Store user corrections, goals and second-account fixtures separately, with provenance.
Never combine unrelated source customers into one multi-bank persona.

Historical acceptance targets from the brief, to be independently verified:
- Closing balance 31 August: EUR 6,059.33.
- Median monthly salary September 2025–August 2026: EUR 2,700.99.
- Median monthly surplus before saving transfers: EUR 583.38.
- Median monthly saving outflows: EUR 246.33.
- June–August mean monthly restaurant spend: EUR 114.32.
- A 20% reduction in that baseline: EUR 22.86/month.
- Recognised August taxi/rideshare MCC 4121: EUR 50.47.
These are descriptive statistics, not a recommendation or evidence of ASP deposits.

## Calculation contracts
Use integer euro cents and a single deterministic engine.
Forecast at least 35 days, extending for reliable income and relevant known commitments.
Include essential spending, dated obligations and existing recurring saving transfers.
Protect emergency and irregular-expense reserves.
Available immediate optional allocation = max(0, lowest projected unrestricted balance - protected floor).
Forecast future income never becomes cash already received.
Spending and extra saving share one pool: EUR 50 of extra saving reduces optional spending by EUR 50.
Check account-level liquidity. Restricted savings are excluded from spending cash.
Unknown obligations, incomplete coverage and stale data visibly reduce certainty or block confident advice.
Negative balances and delayed income have explicit recovery states.
Own-account transfers are neither earned income nor consumption. Unmatched transfers remain unresolved.
Every result carries period, accounts, freshness, assumptions, evidence and calculation version.

ASP: implement the post-1-June-2026 monthly path using official, effective-dated rules.
Use actual user-supplied opening date and verified deposit totals. Do not invent qualifying months.
Legacy accounts receive a transition explanation rather than an unsupported exact result.
Keep deposit-ready date distinct from mortgage approval and purchase costs.
Source: https://www.valtiokonttori.fi/en/services/financing-and-loans/asp-saving-and-asp-loans/

## Architecture
Initial stack: TypeScript, React, a Vite/Vinext App Router server, CSS design tokens, schema-validated
API boundaries and a pure finance domain module. Use the supported Sites build for a private hosted
preview and keep the source portable in this GitHub repository.
Extract the demo customer's actual rows into a compact server-side data artifact; keep raw downloads
ignored. An import script reproduces it from the pinned upstream source.
A constrained transaction tool supports allowlisted filters and one server-selected demo identity.
No arbitrary SQL, no client-selected cross-customer access, no transaction-text instructions.
Use server-side model credentials when available; never put secrets in Git or browser bundles.
Persist demo preferences/progress in browser storage; recompute financial results on the server.
Production identity, persistent personal records and regulated actions are future integration work.
Expose a provider-neutral bank adapter. Do not make a sandbox prerequisite for the core journey.

Suggested tools:
- queryTransactions(filters)
- summariseSpending(period, groupBy)
- forecastCashflow(asOf, assumptions)
- simulateScenario(baseVersion, changes)
- evaluateAspProgress(openedOn, verifiedMonthlyDeposits, rulesVersion)
- proposeChallenge(goalId, constraints)
- prepareTransfer(amount, source, destination, forecastVersion)

Simulated transfers: prepare -> review -> confirm -> explicitly simulated completion.
Recheck current forecast before confirmation and make repeated confirmation idempotent.

## Optional bank integration
Timebox Enable Banking sandbox setup to 90 minutes once credentials are available.
Institution selection -> consent redirect -> accounts/balances/paginated transactions -> refresh,
expiry and disconnect. Server-side keys only.
Keep supplied dataset, coherent fixture and provider sandbox modes distinct.
An unrelated sandbox customer demonstrates connectivity only.
The coherent second-account fixture adds an obligation and a verified own-account transfer.
Disconnect distinguishes local access stopped from provider revocation confirmed.
Real payment initiation, production onboarding and real account experiments are out of initial scope.

## Delivery stages
1. Commit this plan, initialize project and record design context.
2. Import/audit actual persona data, implement finance contracts and meaningful domain tests.
3. Build Today, Coach and Plan with responsive layout and playable learning moments.
4. Integrate scenarios, category corrections, challenge adaptation, evidence and data controls.
5. Wire live model access when available; clearly distinguish fallback demo behavior.
6. Add optional bank adapter only after the core is coherent.
7. Browser QA, arithmetic/edge-case tests, production build, private preview and demo rehearsal.
8. Commit implementation and update this plan/status with implemented, simulated and unavailable features.

## Acceptance checklist
- Historical answers reconcile to source rows; baseline and taxi values match the audit.
- A 20% scenario modifies forecasts, not history, and does not claim completed saving.
- No double allocation; new essential costs and income delays change the dated projection.
- Saving transfers included; investment withdrawals not earned income; internal transfers excluded.
- Unknown, negative and stale states are visible and do not emit unjustified saving recommendations.
- ASP uses versioned rules and verified months; skipped months preserve history.
- September holdout cannot enter the main forecast; evaluation reports error and floor breaches.
- Bank pagination/retries/pending transitions cannot double count; unpaired transfers stay unresolved.
- Corrections, evidence, export and local disconnect work; tools enforce customer isolation.
- Full journey usable at 390 px and by keyboard; error recovery and reduced motion supported.
- Live model handles a fresh question through tools when configured; fallback is explicitly labelled.
- Fixture goals, sandbox data and simulated actions stay identifiable.
- Lesson checks explain answers; repeated completion cannot farm XP.
- A protective pause preserves learning progress and is not framed as failure.

## Four-minute demo
Today -> inspect a spending answer -> try a 20% restaurant scenario -> complete a short lesson ->
agree a challenge -> introduce an essential expense -> see the adaptive plan -> inspect calculations.
Show second-bank behavior only if implemented, with its mode visible.

## Open decisions and dependencies
- Exact judging deadline and other team members' ownership.
- Final name/trademark review beyond the hackathon working name.
- Live model credentials and optional Enable Banking credentials.
- Whether future rewards should have actual monetary value.
- Production authentication, data retention, compliance review and bank integration are separate work.

## References
- Brilliant: https://brilliant.org/
- Impeccable: https://github.com/pbakaus/impeccable and https://impeccable.style/
- S-Pankki: https://www.s-pankki.fi/
- Enable Banking: https://enablebanking.com/docs/markets/fi


## Implementation update — 14 November 2026

Koti is now implemented as an independent prototype under `app/`. See [verification](verification.md), [data audit](data-audit.md), and [design workflow](design-workflow.md). The user explicitly deferred model credentials until the UI review: the current coach is a labelled deterministic demo. OpenAI or Gemini will be selected and configured server-side later. Rewards are noncash XP; sponsored benefits, real bank connectivity and payment execution remain future integration work.

## Collaboration and onboarding update

The complete prototype was merged in PR #1 (`d56feea8b03173f84b7860c907e6719a6354dbbc`). Read [CONTRIBUTING.md](../CONTRIBUTING.md) and [work packages](workstreams.md) before parallel work. The current shared UI component is still a coordination point; component extraction is the integration owner's first task, not work for every branch to duplicate.

The user proposed choosing a goal and demo situation before entering the home journey. The [onboarding plan](onboarding.md) recommends spending understanding, a safety cushion and first-home saving as distinct choices. This expands the original first-home-only direction and is not implemented yet. Keep the existing home journey as one selected path. Multiple source personas need audited data and server-side identity changes before they can affect calculations.
