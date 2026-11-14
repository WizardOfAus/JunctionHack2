# Contributing to Koti

The first complete prototype was merged through [PR #1](https://github.com/WizardOfAus/JunctionHack2/pull/1), merge commit `d56feea8b03173f84b7860c907e6719a6354dbbc`. Start new work from the latest `main`, not the old prototype branch.

## Independent checkouts

Each contributor can clone the repo separately. For several local tools, use worktrees from the repository root; choose your own work package and unused port:

```sh
git fetch origin
git worktree add ../koti-onboarding -b codex/onboarding origin/main
cd ../koti-onboarding/app
npm ci
npm run dev -- --port 5174
```

For another contributor use a different path, branch and port, for example `../koti-coach`, `claude/coach` and `5175`. Worktrees isolate uncommitted changes; they do not prevent conflicts when two branches edit the same lines. The file ownership rules below do that. Each worktree has its own ignored environment files and dependencies. Do not share secrets through Git.

## Agree the boundary first

1. Assign one owner to a package in [workstreams](docs/workstreams.md); owners are intentionally unassigned until the team claims them.
2. Put the allowed paths and shared-file dependencies in the PR description. Keep the task small enough to review.
3. For UI work, build the feature in its own folder and use callbacks/props. The integration owner wires it into the shell. Keep money calculations on the server.
4. Let one owner change shared request/response schemas. Consumers use the current contract until that prerequisite PR merges.
5. Run the relevant checks in [AGENTS.md](AGENTS.md). Submit one focused PR and list any follow-up work honestly.

Only the integration owner changes `app/components/koti-app.tsx`, global styles, package/lock files and deployment identity while parallel feature work is underway. Coordinate changes to `app/lib/contracts.ts` with the finance/data owners. Do not use CODEOWNERS with guessed GitHub usernames; add actual owners after the team is assigned.

## What to give Claude Code

Copy this instruction, replacing the bracketed values:

> Work on package [ID] from docs/workstreams.md. Read AGENTS.md and CLAUDE.md. Use a separate worktree on branch [branch] from current origin/main. Edit only the package's owned paths. For shared-file changes, document the proposed integration rather than editing another owner's files. Preserve current behavior outside the package. Run the relevant checks and open a focused PR with screenshots for UI changes. Do not merge or deploy unless assigned that responsibility.

## Runtime and data

Node 24 is recommended. All npm commands run inside `app/`. The running UI needs no model key and no raw CSV. It loads the audited demo persona from Supabase, so put `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in ignored `app/.dev.vars` (see [`supabase/README.md`](supabase/README.md#app-runtime); ask the team for the key, never commit it). The audited historical subset is also committed in `app/data`. Download the large source only for dataset work, using [the pinned LFS payload instructions](docs/data-audit.md).

The demo data is also accessible in Supabase at <https://ighxaiiqgtpsgioqwamp.supabase.co> (see [`supabase/README.md`](supabase/README.md)). The app server reads it at runtime. To process data for development, use the source on GitHub, [hackjunction/Junction-2026-S-pankki](https://github.com/hackjunction/Junction-2026-S-pankki) at the pinned revision, not the Supabase copy.

Live AI configuration is deferred until UI review. New provider integrations must accept server-side environment variables and keep deterministic calculations/evidence intact. Preview publication belongs to the integration owner; a new worktree must not register another Site or change `app/.openai/hosting.json`.
