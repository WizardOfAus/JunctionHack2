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

Node 24 is recommended. Run npm commands inside `app/`. The default bundled provider needs no model/database key or raw CSV. `KOTI_DATA_SOURCE=supabase` explicitly opts into the server-only remote copy; see [provider setup and eight-persona seed requirements](supabase/README.md). Unknown or unavailable remote personas fail closed, without a fallback.

For development processing, use the pinned GitHub dataset and [LFS instructions](docs/data-audit.md). Supabase is a derived runtime/inspection copy, not the source of truth. Do not change the canonical5174 provider until its all-persona API smoke checks pass.

The only model endpoint is the OpenAI API: the agent in `agent/` uses OpenAI GPT-6 Luna (`openai/gpt-6-luna`) with a server-side `OPENAI_API_KEY`, in development and in deployment. Do not add other model providers. Model changes must keep deterministic calculations/evidence intact; see [agent model](agent/README.md#model). Preview publication belongs to the integration owner; a new worktree must not register another Site or change `app/.openai/hosting.json`.
