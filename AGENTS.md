# Working on Koti

Read `README.md`, `CONTRIBUTING.md`, and your work package in `docs/workstreams.md` before editing. Claude Code should also read this file; `CLAUDE.md` points here.

## Collaboration

- Use a separate branch and checkout/worktree per person or agent. Never share a working tree between simultaneous editors.
- Claim one work package with the team before editing; do not infer ownership from which agent you are. Keep changes inside its file boundaries.
- `app/components/koti-app.tsx`, `app/app/globals.css`, dependency manifests, shared contracts and deployment configuration are coordination points. One named owner edits each at a time. Request a small integration patch instead of independently rewriting these files.
- Keep feature styling local to its component (CSS Modules) for new work. Reuse existing design tokens. Avoid whole-repository formatting and unrelated dependency upgrades.
- One focused PR per work package. Rebase or merge the latest main before final checks; never force-push a shared branch. Preserve other people's work.

## Product and data invariants

- The current shipped app is a single-persona first-home prototype. Multi-goal onboarding is planned in `docs/onboarding.md`, not implemented yet.
- Money is integer euro cents, calculated in `app/lib/finance.ts`. Models explain and call constrained tools; they do not calculate authoritative balances.
- Use the real pinned Junction dataset, not a Git LFS pointer. Follow `docs/data-audit.md`. Keep the full CSV and September holdout under ignored `app/work/`; never deploy them.
- Coaching history ends on 31 August 2026, before the 1 September demo clock. Keep customer scope server-controlled. Do not combine different customers into one person or fabricate source rows.
- Preserve original transaction values. Store scenario overlays and classification corrections separately and label them.
- Koti is independent. The palette is custom, not an official S-Pankki design system. See `docs/brand-provenance.md` and `app/DESIGN.md`.
- Live AI, bank consent, actual transfers and monetary rewards are not configured. Do not imply they are. Never commit credentials.
- Preserve explanatory feedback, reduced motion, keyboard access, legible financial context and idempotent noncash XP.

## Verification

For implementation changes, run relevant checks from `app/`: `npm test`, `npm run typecheck`, and `npm run build`. Changes to API behavior also require `npm run test:api` against the running server. Test UI changes at desktop and 390 px, including the interaction changed. Documentation-only changes need link/path and diff checks, not a new app build.

Report changed files, verification, limitations and integration points in the PR. Do not claim planned work is shipped.
