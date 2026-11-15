# Shared mobile interactions

These components belong to the mobile UI work package. Their props were coordinated with the integration owner and relayed to Claude on PR #34 before consumer integration. They do not calculate, fetch or apply financial changes.

## ActionButton

Import `ActionButton` and `ActionButtonProps` directly from `@/components/mobile/action-button`.

Native button props (including `ref`) plus:

- `variant?: 'primary' | 'secondary' | 'quiet'` (primary by default).
- `busy?: boolean` disables the action and sets `aria-busy`.
- `busyLabel?: string` replaces the content while busy (default “Working…”).

The default button type is `button`; use `type="submit"` explicitly for forms. Consumers own the adjacent status/error message and retry action. Use a visible label or an accessible name for icon-only actions.

## ResponsiveSheet

Import `ResponsiveSheet` and `ResponsiveSheetProps` directly from `@/components/mobile/responsive-sheet`.

Required: `open`, `onOpenChange`, `title`, `children`.

Optional: `description`, `footer`, `initialFocusRef`, `returnFocusRef` (the refs point to `HTMLElement | null`).

Keep the component mounted while changing `open`, so dismissal can animate. A closed sheet has no rendered modal content. The default initial focus is its title, avoiding an unexpected phone keyboard; pass an input ref only when immediate typing is appropriate. The default return target is the element focused when opening. Supply a return ref when applying a change navigates away from that element.

Close, Escape, backdrop and mobile handle dismissal call `onOpenChange(false)`. They never apply consumer state. Applying a preview must be a distinct labelled button in the footer, guarded against invalid, pending, failed or stale results by the consumer.

Installed Vaul provides modal focus containment, scroll locking and handle gestures. Only the handle drags, keeping form input and content scrolling independent. Mobile uses a bottom sheet; desktop uses a centred panel. The description and content scroll together; the action footer remains reachable. Safe-area clearance protects the bottom actions. No dependencies or global styles were changed.

## Motion

| Before | After |
| --- | --- |
| Each feature owns modal and button interaction styles | Shared 120 ms press feedback and 240 ms sheet/overlay transitions |
| Native scenario modal has no drag dismissal | Vaul handle dismisses the mobile sheet without applying |
| Consumers must implement their own motion preferences | Reduced motion disables shared transitions/animations and removes the drag handle; Close and Escape remain available |

## Verification for the component PR

Checked through a temporary, uncommitted consumer route at 390 × 844 and 1440 × 1000 in the in-app browser. The route was removed before production checks.

- Title focus on open; focus trap wraps from the last action to Close.
- Escape/cancel returns to the opening button without applying.
- Handle drag dismisses without applying (synthesized pointer input, not physical-device touch).
- Pending action is disabled; only explicit Apply changes the consumer state.
- A 200% root font-size fixture has no horizontal overflow; description/body scroll independently of actions.
- Desktop centred panel is 620 px wide; computed opening animation is 240 ms.
- No browser warnings or errors during this check.
- Reduced-motion media rules and SSR-safe preference subscription inspected. Actual OS preference, phone keyboard and physical iOS/Android testing remain for integration verification or hardware review.

Local evidence: `/private/tmp/koti-native-mobile/shared-sheet-desktop.jpg` and `shared-sheet-200percent.jpg`. The Money/scenario integration is a separate PR; this PR alone does not change visible app routes.
