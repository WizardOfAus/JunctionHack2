# Data insights: baskets, housing, archetypes and demo personas

Prepared 14 November 2026 from the pinned Junction dataset (`fbdecde…`, 3,626,755 rows, 5,100 customers). Everything below uses **history before 1 September 2026** (23 months); September stays held out. These are findings and proposals. Nothing in this document is wired into the running app yet.

Reproduce from `app/` (needs the full CSV in `work/transactions.csv`, see [data audit](data-audit.md)):

```sh
python3 -m venv work/.venv && work/.venv/bin/pip install duckdb pandas numpy
for s in load features segment personas; do work/.venv/bin/python scripts/eda/$s.py; done
```

Outputs land in ignored `app/work/eda/`. The aggregate tables committed in [`app/data/insights/`](../app/data/insights/) contain population percentiles only, with no rows or per-customer values.

## What the data contains

- `transaction_type` and `category` map one to one: `purchase` (Groceries, Restaurants, Transportation, Entertainment, Health, Home & Tech, Lifestyle, Travel), `housing_payment`, `utilities_payment`, `salary`, `other_income`, `investment_deposit`, `investment_withdrawal` and `salary_sweep`.
- There is **no** Insurance category, savings transfer, loan, mortgage or interest type.
- `merchant_id` and `mcc_code` appear only on purchases (86–98% coverage). The 515 merchants are opaque codes (`MRC-RES-0042`) with no names. Each merchant has a single MCC.
- `CUST05001–05100` is a designed edge block: variable income, about 6.5 of 23 months without salary, and most extreme outliers.
- Generator patterns the coach should respect:
  - Salary arrives on the 15th, or late (days 26–31) in about 20% of months, so the late-payday scenario is realistic.
  - Many customers hit the same negative balance floor repeatedly, which looks like an overdraft limit.
  - Category purchases cluster within months, so compare 6–12-month means, not single months.

## Three baskets

Merchant recurrence carries no signal: there are no subscriptions, and purchases are random draws from a merchant pool. The usable signals are category, MCC and purchase size relative to the customer's own normal.

Problems in the current `basketOf()` / `isConsumption()` (`app/lib/finance.ts`):
1. Transportation, Travel and every Home & Tech purchase default to **irregular**.
2. `salary_sweep` is not excluded by `isConsumption`. In 264 accounts (€23.7M) an outgoing salary sweep would count as irregular spending. This does not affect CUST04859, but it will once other personas load.
3. `Insurance` is matched but never occurs.

**Proposed deterministic rules** (first match wins):

| Rule | Basket |
|---|---|
| Salary, other income, investment deposits and withdrawals, salary sweep | excluded from spending |
| Groceries/Restaurants/Entertainment/Transportation purchase ≥ €1,000, or Lifestyle/Travel ≥ €3,000 | irregular, flagged for review |
| Housing, Utilities | regular |
| Groceries; Transportation except taxi (MCC 4121) | regular |
| Health: ≥ €150, or clinical MCC 8011/8021/8099 and ≥ €80 | irregular, otherwise regular |
| Home & Tech: ≥ €1,000, or ≥ max(€250, 3 × the customer's own median Home & Tech purchase) | irregular |
| Everything else (restaurants, entertainment, lifestyle, taxis, small Home & Tech, travel) | flexible |

| Spending share | Regular | Irregular | Flexible |
|---|---:|---:|---:|
| All customers, current | 56.8% | 23.3% | 19.9% |
| All customers, proposed | 65.4% | 5.2% | 29.4% |
| CUST04859, current | 69.6% | 13.7% | 16.7% |
| CUST04859, proposed | 76.9% | 1.0% | 22.1% |

Under the proposal, irregular means genuine shocks (median €94/month per customer, p90 €318). Seasonality: Home & Tech runs about 28% higher in November, Travel about 35% higher in June–August.

## Housing and mortgages

Every one of the 4,882 housing payers pays a fixed amount with ±5% noise (max/min ≤ 1.105) on days 1–8. There is no drift, no step change and no Euribor-like movement. **The data cannot distinguish rent from a mortgage**, and it contains no loan balances or interest. Housing takes a median 33% of salary (p90 47%).

So any mortgage status must be a **labelled, user-declared assumption**: "I am applying for a mortgage", or "my housing payment is a mortgage of €X at margin Y". Never infer it from the ledger. Live rates, caps and offers come from web research (Exa), not this data.

## Income, saving and spender archetypes

Salary is stable (monthly coefficient of variation about 8%). Investing is all or nothing: 1,456 customers deposit every month (median about 10% of income), and 3,600 never do.

Ordered rules for "What kind of spender am I?":

| Archetype | Rule | Customers |
|---|---|---:|
| Pass-through account | any salary sweep. Exclude from coaching, because spending is not visible here | 264 |
| Variable earner | edge block, salary CV > 0.3, or other income > 25% | 77 |
| Running on empty | ≥ 20 overdrawn days, or negative surplus with < 1 month buffer | 1,153 |
| Steady investor | investment deposits in ≥ 12 months | 1,193 |
| Lifestyle spender | flexible ≥ 35% of spending | 433 |
| Quiet cushion-builder | surplus ≥ 15% or ≥ 3 months buffer | 677 |
| Balanced, thin margin | everything else | 1,303 |

Medians per archetype are in [`archetypes.csv`](../app/data/insights/archetypes.csv).

## Benchmarks ("people like you")

These are monthly means per customer for the base population (4,736 customers, excluding the edge block and pass-through accounts). Full tables: [`benchmarks_overall.csv`](../app/data/insights/benchmarks_overall.csv) and [`benchmarks_by_income_quintile.csv`](../app/data/insights/benchmarks_by_income_quintile.csv).

| € per month | p25 | p50 | p75 |
|---|---:|---:|---:|
| Groceries | 348 | 497 | 668 |
| Restaurants | 127 | 215 | 336 |
| Transportation | 144 | 219 | 313 |
| Housing | 813 | 1,002 | 1,230 |
| Total consumption | 2,176 | 2,871 | 3,661 |
| Salary | 2,360 | 3,143 | 3,947 |

Salary quintile edges are €2,218, €2,830, €3,423 and €4,216. Compare a user within their quintile: median restaurant spending runs from €111 (Q1) to €494 (Q5). External benchmarks come from Statistics Finland's Household Budget Survey 2022 (`StatFin/ktutk/14ph`, COICOP 2018). Label them "2022 prices" and compare per consumption unit.

## Demo persona shortlist

| Customer | Story | Pre-September evidence | Declared demo goal (assumption, not data) |
|---|---|---|---|
| **CUST03375** | First-home saver (lead) | Salary ~€2.9k; saves 31% before investing; invests €521/month; €12.4k cushion; never overdrawn | **Preparing a first-mortgage application**: ASP, deposit, stress test |
| CUST02097 | Tight budget | Salary €1,875; 88 overdrawn days; ~€0 surplus; housing 47% of salary; restaurants €295/month | Build a safety cushion; no saving challenge |
| CUST04617 | Irregular shocks | Saves 3%; Home & Tech €2,242 and €2,705, Travel €2,145 | Understand spending; irregular reserve |
| CUST02689 | High flexible spend | Restaurants €771/month (p98); 44% of spending flexible; salary ~€3.9k | Understand spending; deal finder (Exa) |
| CUST03846 | Large fixed housing | Housing 55% of salary; invests €390/month | **Existing mortgage holder (declared)**: refinance and rate-change research |
| CUST05030 | Variable income | 7 months without salary; other income; large cushion | Safety cushion with irregular income |
| CUST04859 | Current reference | Clean but middling; restaurants €94/month (p16); almost no irregular spending | Keep for baseline tests |

Mortgage-related goals are user-declared demo assumptions and must be labelled as such in the UI. Loan size, rate type and margin are user-entered or researched, never presented as ledger facts. Do not infer age, occupation, dependants or home ownership.

## Advisor and analyst views

Research summary (not legal advice): bank secrecy (Credit Institutions Act 610/2014, ch. 15 §14) binds staff and lifts with customer consent. In CJEU C-579/21 *Pankki S*, the court held that the dates and purposes of staff lookups are the customer's personal data. A production design therefore needs customer-initiated, scoped and expiring advisor access, plus a customer-visible audit log. An analyst sees aggregates only (groups of ≥ 10) or synthetic data.

For the demo this means:
- an **analyst insights view** built from the committed aggregate tables (archetypes, benchmarks, basket shifts), with no row-level browsing of arbitrary customers;
- a **demo persona switcher** over the allowlisted catalogue above, clearly labelled synthetic;
- an optional **consented advisor session** mock that shows the production access pattern.

Credit scoring is out of scope: creditworthiness AI is high-risk under the EU AI Act, and the Consumer Credit Directive 2 applies from 20 November 2026. Offer rule-based "loan readiness" education instead, with no score or approval odds.
