# Prototype verification — 14 November 2026

## Passed

- 13 domain tests: source scope, balances, single allocation, uncertainty guards, category corrections, restaurant scenario, delayed income, unexpected cost, ASP rules and idempotent learning XP.
- TypeScript type checking and production Worker build.
- Running API smoke checks: finance, custom restaurant percentage, taxi evidence, period filtering, holdout/customer isolation, invalid inputs and disconnected source.
- Desktop and 390 px mobile browser checks: lesson incorrect/correct feedback, XP award, coach-to-plan transition, expense shock pausing saving, allocation and simulated-transfer confirmation, disconnect/reconnect and demo reset.
- No browser error/warning logs observed during these checks.

## Held-out month

September transactions are excluded from app data and coaching. The reproducible offline evaluation uses them only after forecasting from history through 31 August 2026. The baseline forecast's mean absolute daily closing-balance error is **€742.79**. Allocating all estimated capacity would have left a minimum actual closing balance of **€3,821.31**, with **zero days below the €3,500 protected floor** in this one synthetic month. This is a narrow retrospective check, not evidence of general forecast reliability.

Run the importer described in data-audit.md, then `npm run evaluate:holdout` from app. Raw source and holdout files remain ignored under app/work; they are not deployed.

## Boundaries

- No live model: demo coach supports a defined set of source-backed questions. User explicitly deferred model credentials until UI review.
- No bank API or real transfers. A receipt represents a local rehearsal; the original ledger and verified savings remain unchanged.
- XP is noncash and awarded once per lesson. No sponsor/reward fulfilment system exists.
- Browser preferences are a prototype convenience, not a production financial-data persistence system.
- ASP account history is user-entered. Unknown dates and legacy opening dates are disclosed; no eligibility or loan approval is inferred.
- Impeccable automation could not install its engine in this environment. Manual craft review is recorded separately; no automated detector pass is claimed.
