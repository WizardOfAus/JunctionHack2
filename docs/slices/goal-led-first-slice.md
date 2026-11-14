# Goal-led first slice

Owner: Codex. Branch: `codex/goal-led-first-slice`. Rebased on `f850b59`, including Claude’s category fix (PR #3) and data-insights analysis (PR #4).

## File boundary

This package owns `app/features/onboarding/`, `app/features/money-overview/`, `app/features/learning/`, their tests, and the integration in `app/components/koti-app.tsx`. New styling uses CSS Modules and the existing palette. The shell is reserved for this branch until integration.

Claude owns package C (coach/LLM), Research/Exa under `app/lib/research/`, `app/app/api/research/`, `app/features/research/`, and EDA/basket-classifier proposals. Claude’s category module is shared truth; the evidence filter maps its `categories` export. The money overview consumes baskets from the unchanged forecast instead of hard-coding raw categories. Do not change this slice's folders or shell in parallel. No dependency, global stylesheet, finance engine, API contract, source dataset or deployment identity changes are part of this package.

## Direction contract

Extend Koti's established visual world and the approved interactive design study. Forest, lime, lilac, peach and Manrope remain. The user has selected a narrow implementation slice, so this is not a new visual identity or concept-selection round.

A person checks this on a phone in ordinary daylight: a light, readable money workspace keeps numerical context inspectable; forest anchors navigation and a pale lime learning canvas makes experimentation distinct. The overview leads with the relationship between recorded balance, the lowest forecast and protected money. One contextual lesson invites action. The signature interaction is a hundred-cell money diagram: changing protection reassigns the same €1,000, making the trade-off visible. Feedback explains incorrect answers and completion awards XP once. Short cell-color transitions respect reduced motion.

Onboarding asks for a goal and explicitly confirms the demo assumptions, with an unknown-coverage path. All goals use the same audited account. Home goals and ASP are conditional. Returning users retain existing assumptions and learning history; the journey selection has a separate validated storage version.

## Design guidance

- User reference: https://chaseai.io/blog/claude-code-impeccable-skill-frontend-design
- Official Impeccable: https://github.com/pbakaus/impeccable/tree/1995764b4936f2bfbf4eb719cb37b384a45ceacb
- Existing system: `app/DESIGN.md`; this slice inherits its tokens.
- The context CLI could not load; existing project documents and code were inspected directly. No automated workflow certification is claimed.

## Verification

- TypeScript check and production build pass.
- 22 unit tests pass, including goal-storage validation, diagram conservation, prediction answers and one-time XP.
- API smoke checks pass for finance, allocation, coaching, evidence, dates, customer isolation, validation and disconnect.
- Browser checks at 1440 px and 390 px cover goal selection, confirmed/unknown coverage and recovery, all three goals, reserve keyboard extremes, wrong/correct predictions, replay, refresh, and home allocation clearing on leaving the home goal.
- Independent Impeccable review: both requested hierarchy fixes resolved; final disposition `ship` at fix scope. See `app/.impeccable/review/first-slice/finish-review.md`. The official detector reports advisory-only differences, documented without replacing the incumbent design system.

## Behavior and boundaries

This slice ships three goal choices with one audited synthetic persona, not a persona catalogue. Non-home plans expose reserve/scenario exploration; they do not introduce a new savings-account engine. Existing home values and XP survive goal changes. Leaving the home goal clears its rehearsal allocation and challenge so they cannot invisibly reduce another goal’s headroom. The two existing later lessons remain available; only the first is redesigned here.

The profile is stored separately as validated `koti-journey-v1`; the prior `koti-demo-v1` assumptions and progress are preserved. Reset clears both. Offline or rejected storage still permits in-memory use. Authoritative numbers remain in the finance API. No model key, live bank connection, monetary reward or actual transfer was introduced.


## Next integration handoff

Claude’s upcoming allowlisted persona catalogue should supply selectable demo situations and declared goal/assumption metadata via props. Mortgage status cannot be inferred from housing transactions. Keep raw categories in `app/lib/categories.ts`; consume future basket changes through the existing finance interface. No credit score or approval odds; external survey comparisons must identify their price year. No analyst route or persona catalogue has been started in this slice.
