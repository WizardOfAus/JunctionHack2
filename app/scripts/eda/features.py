"""Per-customer features on PRE-SEPTEMBER data only (tx_date < 2026-09-01).
Also builds the basket classifier (current vs proposed) and writes tables summarised in docs/data-insights.md."""
import duckdb, pandas as pd, numpy as np
import os
# Run from anywhere: inputs/outputs live in the ignored app/work/eda/ directory.
WORK=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','work','eda'); os.makedirs(WORK,exist_ok=True); os.chdir(WORK)
con = duckdb.connect('tx.duckdb')
CUT = "2026-09-01"

# ---------- proposed classifier (deterministic) ----------
con.execute(f"""
create or replace temp table h as
select *, strptime(tx_timestamp,'%d%b%y:%H:%M:%S') ts from tx where tx_date < '{CUT}'""")
con.execute("""
create or replace temp table cat_med as
select customer_id, category, median(-amt) cmed, quantile_cont(-amt,0.9) cp90, count(*) cn
from h where tt='purchase' group by all""")
con.execute("""
create or replace temp table hb as
select h.*, c.cmed,
 case when category in ('Housing','Utilities','Groceries','Insurance') then 'regular'
      when category in ('Restaurants','Entertainment','Lifestyle') then 'flexible'
      else 'irregular' end as basket_current,
 case
  when tt in ('salary','other_income','investment_withdrawal') then 'income'
  when tt in ('investment_deposit','salary_sweep') then 'transfer'
  -- R0 anomaly guard: implausible single purchase for an everyday category
  when tt='purchase' and category in ('Groceries','Restaurants','Entertainment','Transportation') and -amt>=1000 then 'irregular'
  when tt='purchase' and category in ('Lifestyle','Travel') and -amt>=3000 then 'irregular'
  -- R1 contractual / scheduled
  when tt in ('housing_payment','utilities_payment') then 'regular'
  -- R2 essential everyday (narrow amount distribution, high frequency)
  when category='Groceries' then 'regular'
  when category='Transportation' and coalesce(mcc,'') <> '4121' then 'regular'
  -- R3 health: small pharmacy = regular essential, larger/clinical = irregular
  when category='Health' and (-amt>=150 or mcc in ('8011','8021','8099') and -amt>=80) then 'irregular'
  when category='Health' then 'regular'
  -- R4 home & tech: large relative to own history => replacement/repair shock
  when category='Home & Tech' and (-amt>=1000 or -amt>=greatest(250, 3*c.cmed)) then 'irregular'
  -- R6 discretionary
  else 'flexible' end as basket_proposed
from h left join cat_med c using (customer_id, category)""")

recl = con.execute("""
select category, basket_current, basket_proposed, count(*) n, round(sum(-amt)) eur
from hb where amt<0 and tt not in ('investment_deposit','salary_sweep') group by all order by category, eur desc""").df()
recl.to_csv('reclass_by_category.csv', index=False)

def basket_shares(where):
    d = con.execute(f"""select basket, sum(eur) eur from (
      select 'current' k, basket_current basket, -amt eur from hb where amt<0 and tt not in ('investment_deposit','salary_sweep') {where}
      union all select 'proposed', basket_proposed, -amt from hb where amt<0 and tt not in ('investment_deposit','salary_sweep') {where}
      union all select 'current_as_coded(incl sweep)', basket_current, -amt from hb where amt<0 and tt<>'investment_deposit' {where}
    ) t join (select 'current' k union all select 'proposed' union all select 'current_as_coded(incl sweep)') kk using(k) group by all""").df()
    return d
for name, w in [('all', ''), ('CUST04859', "and customer_id='CUST04859'")]:
    d = con.execute(f"""
     select 'current' k, basket_current b, sum(-amt) eur from hb where amt<0 and tt not in ('investment_deposit','salary_sweep') {w} group by all
     union all select 'proposed', basket_proposed, sum(-amt) from hb where amt<0 and tt not in ('investment_deposit','salary_sweep') {w} group by all
     union all select 'current_incl_sweep', basket_current, sum(-amt) from hb where amt<0 and tt<>'investment_deposit' {w} group by all""").df()
    p = d.pivot(index='b', columns='k', values='eur').fillna(0)
    (p / p.sum() * 100).round(1).to_csv(f'basket_shares_{name}.csv')
    print(name); print((p / p.sum() * 100).round(1)); print(p.round(0))

# transition matrix (spend EUR)
tm = con.execute("""select basket_current, basket_proposed, round(sum(-amt)/1e6,2) eur_m from hb
 where amt<0 and tt not in ('investment_deposit','salary_sweep') group by all""").df().pivot(index='basket_current', columns='basket_proposed', values='eur_m').fillna(0)
tm.to_csv('transition_matrix.csv'); print(tm)
tm2 = con.execute("""select basket_current, basket_proposed, round(sum(-amt),2) eur from hb
 where customer_id='CUST04859' and amt<0 and tt not in ('investment_deposit','salary_sweep') group by all""").df().pivot(index='basket_current', columns='basket_proposed', values='eur').fillna(0)
tm2.to_csv('transition_matrix_CUST04859.csv'); print(tm2)

# ---------- monthly customer table ----------
m = con.execute("""
select customer_id, date_trunc('month',tx_date)::date mo,
 sum(amt) filter (where tt='salary') salary,
 count(*) filter (where tt='salary') n_salary,
 sum(amt) filter (where tt='other_income') other_inc,
 sum(amt) filter (where tt='investment_withdrawal') inv_wd,
 sum(-amt) filter (where tt='housing_payment') housing,
 sum(-amt) filter (where tt='utilities_payment') utilities,
 sum(-amt) filter (where tt='investment_deposit') inv_dep,
 sum(-amt) filter (where tt='salary_sweep') sweep,
 sum(-amt) filter (where tt='purchase') purchases,
 sum(-amt) filter (where amt<0 and tt not in ('investment_deposit','salary_sweep')) consumption,
 sum(-amt) filter (where amt<0 and tt not in ('investment_deposit','salary_sweep') and basket_proposed='regular') b_reg,
 sum(-amt) filter (where amt<0 and tt not in ('investment_deposit','salary_sweep') and basket_proposed='irregular') b_irr,
 sum(-amt) filter (where amt<0 and tt not in ('investment_deposit','salary_sweep') and basket_proposed='flexible') b_flex,
 sum(-amt) filter (where category in ('Restaurants','Entertainment','Lifestyle')) flex_cat,
 sum(amt) net,
 min(bal) min_bal
from hb group by all""").df().fillna({c: 0 for c in ['salary','n_salary','other_inc','inv_wd','housing','utilities','inv_dep','sweep','purchases','consumption','b_reg','b_irr','b_flex','flex_cat','net']})
# fill missing months with zeros
months = pd.date_range('2024-10-01', '2026-08-01', freq='MS').date
idx = pd.MultiIndex.from_product([sorted(m.customer_id.unique()), months], names=['customer_id','mo'])
m = m.set_index(['customer_id','mo']).reindex(idx).reset_index()
num = [c for c in m.columns if c not in ('customer_id','mo','min_bal')]
m[num] = m[num].fillna(0)
m.to_parquet('monthly.parquet')

cats = con.execute("""select customer_id, date_trunc('month',tx_date)::date mo, category, sum(-amt) eur from hb where amt<0 group by all""").df()
cp = cats.pivot_table(index=['customer_id','mo'], columns='category', values='eur', aggfunc='sum').reindex(idx).fillna(0).reset_index()
cp.to_parquet('monthly_cat.parquet')

# ---------- end-of-day balances ----------
eod = con.execute("""
select customer_id, tx_date, arg_max(bal, ts) eod from hb group by all""").df()
eodf = eod.groupby('customer_id').agg(eod_min=('eod','min'), eod_median=('eod','median'),
    neg_days=('eod', lambda s: int((s < 0).sum())), active_days=('eod','size'))
last = con.execute("select customer_id, arg_max(bal, ts) bal_aug31 from hb group by 1").df().set_index('customer_id')

# ---------- shocks ----------
shock = con.execute("""
select customer_id, count(*) n_shocks, sum(-amt) shock_eur, max(-amt) max_purchase
from hb where tt='purchase' and basket_proposed='irregular' and -amt>=500 group by 1""").df().set_index('customer_id')
anomaly = con.execute("""select customer_id, count(*) n_anom from hb where tt='purchase' and -amt>=3000 group by 1""").df().set_index('customer_id')

# ---------- housing ----------
hs = con.execute("""
select customer_id, count(*) n_housing, avg(-amt) h_mean, stddev(-amt)/avg(-amt) h_cv,
 min(-amt) h_min, max(-amt) h_max, stddev(day(tx_date)) h_dom_sd, max(day(tx_date)) h_dom_max,
 regr_slope(-amt, epoch(tx_date)/86400/30.44) h_slope_per_month,
 avg(-amt) filter (where tx_date<'2025-04-01') h_first6, avg(-amt) filter (where tx_date>='2026-03-01') h_last6
from hb where tt='housing_payment' group by 1""").df().set_index('customer_id')

# ---------- salary ----------
sal = con.execute("""
select customer_id, count(*) n_sal_tx, mode(day(tx_date)) sal_dom, stddev(amt)/avg(amt) sal_tx_cv,
 count(distinct date_trunc('month',tx_date)) sal_months
from hb where tt='salary' group by 1""").df().set_index('customer_id')

g = m.groupby('customer_id')
f = pd.DataFrame({
    'edge_block': [c >= 'CUST05001' for c in g.size().index],
    'med_salary_m': g.salary.median(),
    'mean_salary_m': g.salary.mean(),
    'salary_cv_m': g.salary.std() / g.salary.mean(),
    'zero_salary_months': g.salary.apply(lambda s: int((s <= 0).sum())),
    'med_other_inc_m': g.other_inc.median(),
    'mean_other_inc_m': g.other_inc.mean(),
    'months_other_inc': g.other_inc.apply(lambda s: int((s > 0).sum())),
    'mean_income_m': (g.salary.sum() + g.other_inc.sum()) / 23,
    'med_consumption_m': g.consumption.median(),
    'mean_consumption_m': g.consumption.mean(),
    'consumption_cv_m': g.consumption.std() / g.consumption.mean(),
    'med_housing_m': g.housing.median(),
    'housing_months': g.housing.apply(lambda s: int((s > 0).sum())),
    'mean_utilities_m': g.utilities.mean(),
    'mean_inv_dep_m': g.inv_dep.mean(),
    'months_inv_dep': g.inv_dep.apply(lambda s: int((s > 0).sum())),
    'mean_sweep_m': g.sweep.mean(),
    'mean_inv_wd_m': g.inv_wd.mean(),
    'mean_reg_m': g.b_reg.mean(), 'mean_irr_m': g.b_irr.mean(), 'mean_flex_m': g.b_flex.mean(),
    'mean_flexcat_m': g.flex_cat.mean(),
    'mean_net_m': g.net.mean(),
})
inc = f.mean_income_m.replace(0, np.nan)
# income available to this account = income minus sweep-out
f['avail_income_m'] = f.mean_income_m - f.mean_sweep_m
f['savings_rate'] = (f.mean_income_m - f.mean_sweep_m - f.mean_consumption_m) / (f.mean_income_m - f.mean_sweep_m).replace(0, np.nan)
f['invest_rate'] = f.mean_inv_dep_m / inc
f['housing_share'] = f.med_housing_m / f.med_salary_m.replace(0, np.nan)
f['flex_share'] = f.mean_flex_m / f.mean_consumption_m
f['irr_share'] = f.mean_irr_m / f.mean_consumption_m
f['other_inc_share'] = f.mean_other_inc_m / inc
f = f.join(eodf).join(last).join(shock).join(anomaly).join(hs).join(sal)
f[['n_shocks','shock_eur','n_anom']] = f[['n_shocks','shock_eur','n_anom']].fillna(0)
f['buffer_months'] = f.eod_median / f.mean_consumption_m
f['bal_trend_m'] = (f.bal_aug31 - con.execute("select customer_id, arg_min(bal_before, ts) b0 from (select customer_id, ts, bal-amt bal_before from hb) group by 1").df().set_index('customer_id').b0) / 23
f.round(4).to_csv('customer_features_raw.csv')
print(f.describe().T.round(2).to_string())
