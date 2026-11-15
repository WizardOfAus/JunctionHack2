# Claude UI/UX handoff

The user asked Claude to take over from this work on 15 November 2026. Codex's Money/mobile/shared-component package is released for Claude to continue. The separate integration Codex still coordinates the shared checkout/server; confirm its current ownership before editing that checkout. Use your own branch/worktree from current main.

## Start here

- Shared review app: **http://127.0.0.1:5174/money**. Verified on main **d4fce20**. The canonical checkout is `koti-first-slice`; it is owned by the integration chat, not a scratch checkout.
- Merged UI PRs: [#21](https://github.com/WizardOfAus/JunctionHack2/pull/21) typography/charts; [#29](https://github.com/WizardOfAus/JunctionHack2/pull/29) simplified exploration/contextual help; [#30](https://github.com/WizardOfAus/JunctionHack2/pull/30) integration/benchmarks; [#37](https://github.com/WizardOfAus/JunctionHack2/pull/37) shared buttons/sheets; [#42](https://github.com/WizardOfAus/JunctionHack2/pull/42) mobile Money → scenario → Plan. [#44](https://github.com/WizardOfAus/JunctionHack2/pull/44) includes the final applied-scenario label and the integration owner's Accounts fixes.
- [Before/after screenshots, recording and requirement audit](review/mobile-journey/README.md). [Shared component contract](mobile-components.md).
- This package's temporary previews on **5184 and 5185 are stopped**. Keep canonical 5174 and Claude's existing agent 5180 with their owners; don't start duplicate services.

## What the user wants

The supplied Revolut screenshots demonstrate clear priority: a prominent amount, concise context, relevant actions, purposeful charts, and details opened on demand. Borrow that hierarchy, meaningful comparisons and short task flows while keeping Koti's forest-green/lime/warm-white identity.

The Ultrahuman screenshots connect a personal signal to an explanation and a next action. Apply that to money: what changed, why it matters to this person's goal, and one useful thing to explore. Avoid overwhelming users with simultaneous cards, repeated metadata or generic suggestions that ignore their situation.

The user wants a mobile-first journey where they can ask questions of their own data and understand the three spending baskets: regular essentials, irregular essentials and flexible everyday spending. Contextual coaching, personal learning and constrained visual answers should connect these areas. General discoveries remain useful when the user has not encountered a concept; explain why a personal suggestion appears and let them explore freely.

## Shipped behavior to preserve

- The four main URLs remain `/money`, `/learn`, `/coach`, `/plan`; Accounts is a Money subpage. Compact mobile navigation keeps persona switching and data access. Blur is limited to navigation, with opaque and reduced-transparency fallbacks and safe-area spacing.
- At 390 × 844, Money shows estimated extra room, its meaning and **Explore a what-if** immediately. The forecast follows. Recorded balance, lowest projected balance and protected reserve are separate values in the calculation disclosure. Source/history, coverage limitations and forecast labels remain visible or accessible.
- **Scenario · 35-day forecast** appears when an expense/delay/spending scenario is applied. Do not remove that cue when reducing repeated context.
- The scenario sheet presents one adjustment at a time. `/api/finance` supplies the preview. Pending, invalid, failed or blocked results cannot be applied. Cancel/dismiss never applies. **Use in my plan** explicitly applies, navigates to Plan and shows a simulation receipt; no money moves.
- Chart pointer/touch/keyboard exploration operates on the chart itself. Do not reintroduce the removed duplicate date slider. The daily data table remains available.
- `ActionButton` and `ResponsiveSheet` in `app/components/mobile/` reuse Vaul. Preserve focus trapping/return, heading-first focus, scrollable content, footer access, 120 ms press feedback, 240 ms sheet motion and reduced-motion behavior. See the contract for props.
- `WorkspaceLink` in `features/navigation/` works around a reproduced production Vinext `next/link` dynamic-import failure. It keeps native href/modified-click semantics and uses `useRouter.push` for ordinary local navigation. Don't replace it until the framework issue is verified fixed in a production build. MoneyTabs and the contextual coach's full-conversation link use it too.
- #32's `source.dataset`/`source.customerLabel` render from the response; source-row evidence stays scoped. Claude owns coach intent, streaming, memory, Pesä, Accounts and backend tools. Models explain; the finance engine calculates authoritative integer cents. Generated visuals must use supported component/data contracts, not invented figures or arbitrary executable UI.

## Verification already completed

The UI integration passed unit tests, typecheck and production build. On merged main 9e3d4cd, this chat reran **144 passing unit tests, two optional skips**, typecheck and build. The integration owner then reported **145 passing tests**, type/build and all-eight-persona API checks for the #44 follow-up. Optional skips were unavailable raw source/live Supabase credentials.

Browser checks covered 390 px and 1440 px, 200% root text without horizontal overflow, actual OS reduced-motion/transparency preferences (restored afterward), sheet focus/keyboard/drag dismissal, loading/invalid inputs, real stopped-server retry, cancellation/apply, persona switching, learning progress, refresh/Back and stale-data pause/recovery. Production navigation was verified across all four destinations with a clean error log.

Final **canonical d4fce20 / 5174** smoke passed on the existing Mortgage declined: income persona with Understand my money: a €500 preview moved minimum €56,454.93 → €55,954.93 and extra room €52,954.93 → €52,454.93; Apply survived refresh; Money showed the scenario cue; a €750 preview was cancelled without changing the €500 plan; Back worked. The original zero-expense scenario was restored afterward. Desktop Escape returned focus to Explore. No overflow or console errors. Final screenshots are in `review/mobile-journey/canonical/`.

## Follow-up judgment

The completed package is the Money → scenario → Plan flow, not a promise that every future surface is polished. Continue from the merged work; do not recreate a parallel shell or competing statement view. For new learning/coaching design, use current persona, goal, plan and learning progress; preserve source/period labels and explicit consent before remembering information or applying a plan change.

Physical iOS/Android, software keyboards, notched-device safe areas and mobile screen readers still need hardware verification. The viewport/accessibility checks above are not a substitute for those tests. Broad Learn/Plan redesigns and more advanced generative UI were outside this completed package; evaluate them with the user rather than treating every possible improvement as already authorized implementation scope.

Run the repository-required checks for changes, test the real end-to-end interaction and coordinate canonical promotion. Avoid dependencies, global styling or calculation changes just to achieve a visual effect.
