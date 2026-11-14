# Goal-led onboarding and demo personas

Status: proposed next iteration, not implemented. The current app opens the single first-home journey immediately. The user requested that housing become an explicit option and that different situations can be simulated.

## Recommended first run

Keep the opening short: three steps, Back on every step, with no account creation or real bank connection required for the demo.

1. **What would you like to work on?** Offer “Understand my spending”, “Build a safety cushion” and “Save for my first home”. Start with no goal preselected. “Just explore” chooses a neutral overview, never silently the home flow.
2. **Choose a demo situation.** Clearly label the synthetic data and explain which account is being used. Offer only audited personas that actually exist. Keep extra-expense and late-payday simulations as separate scenario controls, not fictional new customers.
3. **Make it yours.** Show only relevant editable assumptions, each with its source: recorded, demo assumption, user-entered or unknown. Allow “I don't know”; show what that prevents us estimating. Review and start, with the goal changeable later.

No date of birth, exact address or sensitive questionnaire is needed for this prototype. Do not imply selecting a demo persona is bank sign-in or consent.

## What each choice changes

| Choice | First useful screen | Learning | Home-specific UI |
| --- | --- | --- | --- |
| Understand spending / Just explore | Three baskets, source evidence and one explanation of spending room | Balance versus available room | Hide home-fund target, housing hero, ASP and home-transfer destination |
| Build a safety cushion | Reserve target and a clear view of cash available after essentials | Reserve trade-offs and when to pause | Hide ASP and house-purchase estimates; use a cushion goal |
| Save for my first home | Current home journey, after target/reserve confirmation | Shared foundations, then home/ASP lessons | Show home fund, housing illustration and separate ASP milestones |

Use neutral welcome copy until a goal is selected. Coach suggestions, plan labels, challenge destination, illustration and sidebars must follow the selection—not just the welcome heading. Shared learning progress survives a goal change. No XP is granted merely for selecting a goal or persona.

## Goal, persona and scenario are independent

The proposed onboarding state has `schemaVersion`, `goalId` (`understand`, `buffer`, `first-home`), `personaId`, `scenarioId` and completion state. This is a design contract to implement, not a current API schema. Store goal-specific assumptions separately and represent unknown values explicitly rather than coercing them to zero.

- **Goal:** what the user wants to learn or achieve. It does not determine their financial capacity.
- **Persona:** one coherent source customer with provenance. Today only CUST04859 is wired in; do not advertise a functioning multi-persona selector yet.
- **Scenario:** a labelled change to a persona's forecast, such as an extra essential expense, late salary or unknown account coverage. Never rewrite their ledger to manufacture the scenario.

Candidate future personas include someone with a smaller cash cushion or more variable recorded income. Select and audit those using the actual pre-September data. Do not infer age, employment status, dependants, occupation or home ownership from transaction patterns. A tight-budget example should prioritise understanding and reserves, without a forced saving challenge.

## Implementation dependencies

The current single-persona assumption appears in `historyOnly`, server data loading, coach response metadata, the import script and visible copy. Changing only the frontend selector would be misleading and unsafe. The data/finance owners must add a server-resolved persona catalogue and scope every endpoint to it before the selector affects calculations.

Each persona keeps its own goals, corrections, chat/evidence and scenario state. Version browser storage; define migration from `koti-demo-v1`. Existing users see a one-time explicit journey choice while their saved learning remains intact. Changing goals preserves appropriate shared state; changing personas must never display the previous person's rows, forecasts or pending response. Invalid or removed catalogue IDs recover to selection rather than silently using another account.

The default coverage assumption must be visibly confirmed or left unknown during onboarding. Unknown coverage keeps confident extra-saving estimates paused. Price and savings defaults remain clearly labelled demo inputs. Any later production onboarding will need separate identity and provider-consent work.

## Acceptance cases

- A fresh visitor chooses among the three goals; no home goal is automatically chosen.
- Neutral and cushion journeys contain no irrelevant ASP, home-deposit estimate or fictional home transfer.
- First-home selection reaches the existing working flow with its audited baseline intact.
- Back, skip/explore, refresh, reset and later goal changes behave predictably on desktop, 390 px and keyboard.
- Only audited catalogue personas can be queried. An arbitrary customer ID fails server validation.
- Switching personas clears old evidence and prevents stale request results from crossing profiles.
- Scenario overlays change forecasts while original rows remain identical; September stays held out.
- Unknown inputs, insufficient cash and delayed income preserve a useful learning path and pause inappropriate saving challenges.

Koti remains a working name. Broader goals can fit as foundations for financial confidence, but a general money-learning product may warrant a naming review after the expanded journey is validated.
