# Shared journey and coach contract

Money, Learn, Coach and Plan are views of one persistent workspace. The shell owns the goal, allowlisted persona, assumptions, scenario, lesson completion and conversation. Feature components receive props and callbacks.

## State and identity

Onboarding stores `{version:2, goal, personaId}` under the existing `koti-journey-v1` key. Legacy `junction-alex` journeys migrate to `reference`. Unknown identities restart onboarding. Assumptions are stored with their persona ID; mismatched assumptions are not restored. Learning progress belongs to the visitor and stays across persona switches, with one-time noncash XP.

The server supplies the catalogue as props and at `GET /api/personas`. Transaction JSON stays server-side. Every finance, evidence, export, transfer rehearsal and scenario-preview request sends `personaId`. The server resolves the allowlist; unknown keys and raw customer IDs return 400.

Switching personas resets assumptions, scenario, chat, source rows, corrections, transfer receipts and ASP drafts. Old-account forecasts remain hidden until the new response arrives. Finance/evidence requests abort on changes; coach, export and transfer results are also guarded by context identity. A coach preview from an earlier plan is disabled until a new question is asked.

## Coach request and response

`POST /api/coach` retains `question`, `assumptions` and optional top-level `personaId`. It additionally accepts:

```json
{"context":{"goal":"home","completedLessonIds":["balance"],"screen":"learn"}}
```

Goals: `understand`, `buffer`, `home`. Lessons: `balance`, `reserve`, `scenario`. Screens: `money`, `learn`, `coach`, `plan`. The strict schema rejects duplicate/unknown lessons and injected identity fields. Context is optional for older clients. Scenario fields come from validated assumptions, avoiding two conflicting copies of the plan.

Responses include `persona`, `context` and `actions`. The deterministic demo and live-agent bridge share this contract. The server adds validated journey context, assumptions, scenario and exact finance-engine outputs to the agent's context block. Each request still uses a fresh server-scoped agent conversation. This does not enable a provider or add long-term conversation memory.

## Constrained actions

Allowed actions in `app/lib/journey/context.ts`:

```json
{"type":"lesson","lessonId":"scenario"}
{"type":"preview","scenario":"spending","reductionPercent":20}
```

Preview kinds are `expense`, `payday`, `spending`; reduction is an integer from 0 to 100. No arbitrary routes, identifiers, code, model-calculated money amounts or direct apply/transfer actions are accepted. Current actions are selected by server rules using question, goal, progress and data availability. They are not model-generated plans.

The existing scenario dialog sends the current persona and edited assumptions to `/api/finance`. Apply is unavailable while pending, invalid, blocked or failed. The user explicitly chooses **Use in my plan**. No ledger changes occur. Recommendations skip completed lessons and vary by goal after the balance foundation.

## Claude / agent follow-up

Claude can implement richer reasoning in `agent/` and `app/lib/coach/` against this contract. Proposed tools should return allowlisted action proposals for server validation, not mutate browser state. Future forecast tools must accept the same validated assumptions and invoke the finance engine. Existing app-mode tool restrictions remain until that path is tested. Provider configuration, memory, streaming and cancellation are separate work.

Coordinate changes to the coach route and `lib/journey/context.ts` with the integration owner. Supply shell changes as small patches. The visual chat supplied #21 and its shell patch, combined here with persona scoping.

## Home purchase education

Only the home goal shows `loanReadiness`: three checks and gaps, market reference month/rate/source, stress payment, alternative gap-closing figures and notes. **Education, not a credit decision** remains visible. Application-record purchase figures are explicitly separate from editable home-goal assumptions. Cash buffer is before a deposit is paid. Paused, disconnected, stale or failed forecasts hide readiness figures.

The market rate is a committed historical overlay, not a live personal quote. Collateral adequacy and other debt are not modeled. Application records are inspectable in Your data and never shown as current approval odds.

## Verification and local review

Unit coverage includes legacy migration, all goal/persona combinations, unknown identities, lesson order, strict context/action validation, finance-context parity and buffer gaps. API smoke covers all eight customers, scoped evidence, forged identity/context rejection, readiness and coach actions. Desktop/390px browser acceptance covers onboarding, XP continuity, coach preview/apply, persona reset and salary-sweep warnings.

Canonical local review: port 5174. Temporary QA servers stop after integration. No hosted preview was published.
