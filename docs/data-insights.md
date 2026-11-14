# Data insights: baskets, housing, archetypes and demo personas

Prepared 14 November 2026 from the pinned Junction dataset (`fbdecde…`, 3,626,755 rows, 5,100 customers). Everything below uses **history before 1 September 2026** (23 months); September stays held out. These are findings and proposals. Nothing in this document is wired into the running app yet.

Reproduce from `app/` (needs the full CSV in `work/transactions.csv`, see [data audit](data-audit.md)):

```sh
python3 -m venv work/.venv && work/.venv/bin/pip install duckdb pandas numpy pyarrow scikit-learn
for s in load features segment personas; do work/.venv/bin/python scripts/eda/$s.py; done
```

Outputs land in ignored `app/work/eda/`. The aggregate tables committed in [`app/data/insights/`](../app/data/insights/) contain population aggregates (percentiles, counts, medians and basket shares), plus the explicitly named synthetic CUST04859 basket-share comparison. They contain no transaction rows. The reference-persona comparison is not a population-only table. These tables are also accessible in Supabase (`insight_datasets` and `insight_rows`, see [`supabase/README.md`](../supabase/README.md)). Run the EDA from the pinned GitHub source, not from the Supabase copy.

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

**In transactions:** each of the 4,882 housing payers pays a fixed amount with ±5% noise (max/min ≤ 1.105) on days 1–8. There is no drift, no step change and no Euribor-like movement, so **the ledger cannot distinguish rent from a mortgage**. Housing takes a median 33% of salary (p90 47%).

**Mortgage application files.** The upstream repository also ships `mtg_negotiation_history.csv` (3,452 events) and `mtg_tx_customer_link_and_final_mtg_infio.csv` (200 applications). Each application links one-to-one to a `customer_id`. Applications were created 2 January–7 August 2026, and decisions took a median of 24 days (range 12–44). Outcomes: 150 approved and 50 rejected (34 insufficient collateral, 8 insufficient income, 6 insufficient equity, 2 existing debt).

These relationships were verified exactly on every row:
- `final_requested_loan + final_equity_amount = final_property_price`.
- `lfinal_loan_to_value = loan / price` (not loan / collateral).
- `required_monthly_income = annuity(loan, 6%, 25 years) / 0.35`, i.e. 0.0184086 × loan; inversely, loan ≈ 54.3 × monthly income. This is **a calculation found in this synthetic dataset**, not a bank's lending rule and not an approval prediction. Present it as "in this dataset, required income was calculated as…".

Other observations:
- The event order is fixed: application created → property added (1–3, with optional price updates) → loan calculation → income received → expenses recorded → collateral added → valuation → additional collateral requested (192/200) → second valuation → document received → loan decision. Customer contacts are spread throughout.
- Valued collateral for the purchased home is 65–80% of price (median 72%, a lending-value haircut). That is why almost every application gets a request for extra collateral.
- Expense amounts are synthetic: transfer tax is 1.5–4% of price, which does not follow Finnish rules. Label them as recorded application amounts, not tax advice.
- **Outcomes are not a reproducible rule.** The best single features reach AUC 0.55–0.64. Every collateral, equity and debt rejection belongs to a salary-sweep (pass-through) account; non-sweep applicants were rejected only for insufficient income (7 of 78). Do not build approval odds.
- **Transactions do not reflect the mortgage.** There is no down-payment outflow, no new or changed housing payment after approval and no saving acceleration. Join the two only through the link file, and present it as an *application record*, not ledger behaviour.
- **Dates:** only C0065 (CUST01265) has events after 31 August; its decision is dated 8 September. The team is moving the demo clock to 1 October 2026 (history through 30 September), where every application is decided. "In progress" exists only in the 1 September **backtest**, which must exclude September transactions and later mortgage events and outcomes.
- Applicants are older and richer than the base population: median age 45–47, 43% in the top salary quintile, and 61% are pass-through accounts. Only 3% are under 35.

Mortgage status for anyone **without** an application record stays a labelled, user-declared assumption. Live rates, caps and offers come from web research (Exa).

## Customer attributes

`tx_customers_junction.csv` gives `customer_postal_code` and `customer_age` for all 5,100 customers, with nothing missing.

- **Region:** all postal codes are in the capital region (prefixes 00/01/02). Approximate split: Helsinki 2,557, Espoo 1,251, Vantaa 945, Kauniainen 38, and an outer ring of 309. Regional effects are mild: Vantaa has the lowest salaries, Kauniainen and central Helsinki the highest.
- **Age:** 18–90, median 44. Age is the stronger driver (Spearman 0.46 with salary). The share of "Running on empty" falls from 42% (18–24) to 12% (55–64).
- **Caveats:**
  - 150 customers are exactly 18, about three times the neighbouring ages, which suggests a floor. Keep the recorded value as 18 and label the suspected floor as a dataset limitation; do not infer an unrecorded age below 18.
  - People aged 65+ still receive "salary", probably pension.
  - The edge block skews old.
- **Benchmarks by age band and age × region** (groups of n ≥ 16): [`benchmarks_by_age.csv`](../app/data/insights/benchmarks_by_age.csv) and [`benchmarks_age_region.csv`](../app/data/insights/benchmarks_age_region.csv). Lead with age band and income quintile; region adds little.

## Income, saving and spender archetypes

Salary is stable (monthly coefficient of variation about 8%). Investing is all or nothing: 1,456 customers deposit every month (median about 10% of income), and 3,600 never do.

Ordered rules for "What kind of spender am I?":

Here, `neg_days` counts observed transaction dates whose last recorded balance is negative, not every calendar day spent overdrawn. The archetypes are descriptive demo rules, not creditworthiness assessments.

| Archetype | Rule | Customers |
|---|---|---:|
| Pass-through account | any salary sweep. Exclude from coaching, because spending is not visible here | 264 |
| Variable earner | edge block, salary CV > 0.3, or other income > 25% | 77 |
| Running on empty | ≥ 20 negative observed transaction-day balances, or negative surplus with < 1 month buffer | 1,153 |
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

Revised after adding the mortgage and customer files. Transaction figures were computed on history before 1 September 2026; they will be refreshed when the demo clock moves to 1 October 2026. Mortgage information is labelled **application record**; anything the record does not contain stays unknown.

| Customer | Story | Evidence | Application record (dated outcome; September backtest noted) |
|---|---|---|---|
| **CUST04767** (lead) | Approved home purchase ("first home" is a demo assumption; the data does not say) | 36, Espoo; steady investor. Salary ~€3.0k; saves 33%; invests €393/month; housing payment €938 (rent is an assumption; the ledger cannot tell rent from a loan); €15.6k balance; never overdrawn | C0689: applied 4 Apr; viewed three apartments; €174.5k apartment, loan €160k, equity €14.5k (8.3%), LTV 0.92; **approved 4 May**. Income 1.05 × required |
| CUST02222 | Rejected: insufficient income | 36, Espoo; steady investor. Salary ~€5.0k; saves 46%; €56k balance; 2 shocks | C0137: €315k house, loan €286.5k, LTV 0.91; **rejected 12 May**. Income 0.94 × the dataset's required-income calculation. "What would it take?": by that calculation, ~€270k at this income, so ~€16.5k more equity or a home ≤ ~€298k (illustrative, not an approval prediction) |
| CUST01265 | Recent approval (backtest: in progress) | 41, Helsinki; pass-through account | C0065: applied 3 Aug; €217.5k apartment, loan €203.5k, equity €14k (6.4%); **approved 8 Sep**. In the 1 September backtest only, it is in progress with collateral valued 30 Aug |
| CUST01460 | Rejected: insufficient collateral | 41, Helsinki; pass-through, so spending is largely invisible | C0345: €186k apartment, loan €152.5k vs collateral €126k; extra collateral requested but none valued; **rejected 4 Feb**. Teaches lending value vs price and the state guarantee |
| CUST02097 | Tight budget | Age recorded as 18 (likely floored); Espoo. Salary €1,875; 88 negative observed transaction-day balances; ~€0 surplus; housing 47% of salary | none; goal: safety cushion, no saving challenge |
| CUST02689 | High flexible spend | 62, Helsinki. Restaurants €771/month (p98); 44% of spending flexible | none; goal: spending awareness, deal finder (Exa) |
| CUST04617 | Irregular shocks | 44, Helsinki. Saves 3%; Home & Tech €2,242 and €2,705, Travel €2,145 | none; goal: irregular reserve |
| CUST04859 | Current reference | Clean but middling; almost no irregular spending | none; keep for baseline tests |

Alternatives:
- CUST02003: approved despite income at 0.92 × required, so outcomes are not formulaic.
- CUST00161: a non-sweep income rejection on 20 August.
- CUST03375: a non-applicant strong saver, usable only with a declared intent.

Mortgage records are application data, not ledger behaviour; show them as such. Every collateral and equity rejection is a pass-through account with a thin spending story. Do not infer occupation, dependants or home ownership. Use age only as the recorded (possibly floored) value.

## Advisor and analyst views

Research summary (not legal advice): bank secrecy (Credit Institutions Act 610/2014, ch. 15 §14) binds staff and lifts with customer consent. In [CJEU C-579/21 *Pankki S*](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=celex%3A62021CJ0579), the court held that the dates and purposes of staff lookups are the customer's personal data. A production design therefore needs customer-initiated, scoped and expiring advisor access, plus a customer-visible audit log. An analyst sees aggregates only (groups of ≥ 10) or synthetic data.

For the demo this means:
- an **analyst insights view** built from the committed aggregate tables (archetypes, benchmarks, basket shifts), with no row-level browsing of arbitrary customers;
- a **demo persona switcher** over the allowlisted catalogue above, clearly labelled synthetic;
- an optional **consented advisor session** mock that shows the production access pattern.

Credit scoring is out of scope: creditworthiness AI is high-risk under the EU AI Act, and [Consumer Credit Directive 2](https://eur-lex.europa.eu/eli/dir/2023/2225/oj/eng) applies from 20 November 2026. Offer rule-based "loan readiness" education instead, with no score or approval odds.
