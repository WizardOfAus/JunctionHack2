# Demo script (3 minutes)

A click-by-click path through Koti for the S-Bank "Personal Economic Trainer" challenge, with the Exa "Internet Butler" angle. Every figure below comes from the app on the 1 October 2026 demo clock; recheck it on the day.

## Before you start (5 minutes earlier)

1. App server with the agent switched on: `app/.dev.vars` has `KOTI_AGENT_URL`, `EXA_API_KEY`, `ENABLE_BANKING_APP_ID` and `ENABLE_BANKING_PRIVATE_KEY_B64`. Start the agent (`agent/`: `npm run dev`, port 5180) and the app (`app/`: `npm run dev -- --port 5176`).
2. Run `npm run evaluate:coach` in `app/`. Expect every case to pass (12/12 with follow-ups).
3. Open http://127.0.0.1:5176 in a clean browser window. Choose **Buy a first home** and the **declined-for-income** demo situation (`home-rejected-income`).
4. Fallback if the agent or Wi-Fi fails: the coach answers with calculated figures and says so. The Demo bank works offline.

## The story (one line)

"Koti is a first-home coach that reads your real transactions, explains your money in plain language, connects your other banks through PSD2, and never invents a number: the app calculates, Pesä explains."

## Path

| Time | Screen | Do | Say / point at |
|---|---|---|---|
| 0:00 | **Money** | Land on Money. | Safe-to-spend after the reserve; the three baskets (essentials, surprises, your kind of everyday). "Built from S-Bank's Junction dataset: real columns, real merchant codes." |
| 0:20 | **Money → Accounts** | Open **Accounts**. Scroll the statement. | A statement like a bank's: merchant names, running balance. The **home-loan application record**: declined for income on 12 May 2026, with its timeline. |
| 0:40 | **Ask Pesä** (sheet) | Tap the application's **Ask Pesä what it means**. | Live progress: "Calculating from your transactions ✓". Answer: €148 a month short at the 6% stress test, about €8,049 more own funds or a price up to €306,951. "Education, not a credit decision." |
| 1:05 | **Coach** | Ask: *"What is the 12-month Euribor today and what would it mean for my payment?"* | "Checking public sources" plus source chips (Bank of Finland). Exa finds the live rate; the app's payment table for the actual loan gives the payment. **Exa finds facts; our code calculates.** |
| 1:30 | **Coach** | Follow up: *"And at 4.5%?"* | Follow-ups work: Pesä remembers the conversation. |
| 1:40 | **Accounts → Connect a bank** | Pick **S-Pankki** (sandbox) or the **Demo bank**. Show the consent screen, then connect. | PSD2 in plain language: read-only, 90 days, re-confirm every 180 days, **Revoke** any time. Enable Banking is a licensed aggregator; S-Pankki, OP and Nordea are live in its sandbox. |
| 2:05 | **Accounts → Your full picture** | Point at the card. | Cash across all accounts against the deposit the loan cap needs. Every account carries its source. "It never rewrites the application record." |
| 2:20 | **Coach** | Say *"Remember that I want a two-room flat in Espoo by 2028"*, tap **Remember this**, then open **What Pesä knows**. | Visible memory: facts learned from the account (each with a source), plus what you told it. You can delete anything. |
| 2:35 | **Learn** | Guess your free room, then **Reveal**. | Learning built from your own numbers; mastery decides the next card. |
| 2:45 | **My plan → Grow your savings** | Scroll to the ASP card. | Finland's ISA-like options, ordered for you. **Live S-Bank terms via Exa**: ASP 1% plus a 4% tax-free bonus, with a citation and the check date. Information, not advice. |
| 2:55 | Close | — | "Plain-language coaching, what-ifs, safe-to-spend and safe-to-save, benchmarks against Statistics Finland, the full multi-bank picture, and live facts from the web, all with figures you can inspect." |

## Challenge checklist (for Q&A)

- **Conversational AI that explains in plain language:** Pesä (GPT-6.1 Sol, Flue agent) quotes app-calculated figures; evaluation suite `npm run evaluate:coach`.
- **What-if scenarios:** My plan scenarios; chat what-ifs ("20% less eating out" → €15.46; "and 40%?" → €30.92).
- **Safe-to-spend / safe-to-save:** Money overview and My plan.
- **Three baskets:** Money, with per-row reasons and user corrections.
- **Benchmarking against open data:** "People like you" against dataset percentiles and Statistics Finland's 2022 household survey.
- **Multi-bank (PSD2):** Enable Banking sandbox (real redirect and consent) plus the Demo bank; full picture; consent dashboard with Revoke.
- **Guardrails:** no approval odds, no other customers' data, no stock picks, sources on every figure; the 12-case evaluation runs at the start of each demo.

## If something breaks

- **Agent slow or down:** answers fall back to calculated figures with a note. Keep going.
- **Enable Banking redirect needs a login:** use the sandbox's test login, or switch to the Demo bank (same screens, labelled simulated).
- **Exa slow:** savings terms fall back to the dated cached check; the Euribor question can be skipped.
