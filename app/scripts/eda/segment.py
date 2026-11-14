"""Archetypes, persona ranking and population benchmarks (pre-September data only)."""
import duckdb, pandas as pd, numpy as np
import os
# Run from anywhere: inputs/outputs live in the ignored app/work/eda/ directory.
WORK=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','work','eda'); os.makedirs(WORK,exist_ok=True); os.chdir(WORK)
pd.set_option('display.width', 250); pd.set_option('display.max_columns', 60); pd.set_option('display.max_rows', 200)
f = pd.read_csv('customer_features_raw.csv', index_col=0)
con = duckdb.connect('tx.duckdb', read_only=True)

late = con.execute("""select customer_id, count(*) filter (where day(tx_date)>=26) late_salary,
  count(*) filter (where day(tx_date) not in (15) and day(tx_date)<26) offday_salary
  from tx where tt='salary' and tx_date<'2026-09-01' group by 1""").df().set_index('customer_id')
f = f.join(late)
f['surplus_rate'] = f.savings_rate  # (income - sweep - consumption) / (income - sweep), before investing
f['net_rate'] = f.mean_net_m / f.avail_income_m.replace(0, np.nan)
f['missed_housing'] = (23 - f.housing_months).where(f.housing_months > 0, np.nan)

# recent window Jun-Aug 2026 (still pre-September)
m = pd.read_parquet('monthly.parquet'); m['mo'] = pd.to_datetime(m.mo)
r = m[m.mo >= '2026-06-01'].groupby('customer_id').agg(rec_consumption=('consumption', 'mean'), rec_flex=('b_flex', 'mean'),
        rec_irr=('b_irr', 'mean'), rec_salary=('salary', 'mean'), rec_net=('net', 'mean'))
f = f.join(r)
cp = pd.read_parquet('monthly_cat.parquet')
catmean = cp.drop(columns='mo').groupby('customer_id').mean()
f = f.join(catmean.add_prefix('cat_'))

# ---------------- archetypes (priority-ordered rules) ----------------
def arche(x):
    if x.mean_sweep_m > 0: return 'A Pass-through account'
    if x.edge_block or x.salary_cv_m > 0.3 or x.other_inc_share > 0.25: return 'B Variable earner'
    if x.neg_days >= 20 or (x.surplus_rate < 0 and x.buffer_months < 1): return 'C Running on empty'
    if x.months_inv_dep >= 12: return 'D Steady investor'
    if x.flex_share >= 0.35: return 'E Lifestyle spender'
    if x.surplus_rate >= 0.15 or x.buffer_months >= 3: return 'F Quiet cushion-builder'
    return 'G Balanced, thin margin'
f['archetype'] = f.apply(arche, axis=1)
f['housing_heavy_flag'] = f.housing_share >= 0.45
cols = ['med_salary_m', 'mean_consumption_m', 'surplus_rate', 'invest_rate', 'housing_share', 'flex_share', 'irr_share',
        'eod_median', 'buffer_months', 'neg_days', 'consumption_cv_m', 'n_shocks', 'late_salary', 'missed_housing']
summ = f.groupby('archetype')[cols].median().round(2)
summ.insert(0, 'n', f.archetype.value_counts())
summ.insert(1, 'pct', (f.archetype.value_counts(normalize=True) * 100).round(1))
summ['housing_heavy_pct'] = (f.groupby('archetype').housing_heavy_flag.mean() * 100).round(0)
print(summ.T.to_string()); summ.to_csv('archetypes.csv')

# k-means cross-check
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
base = f[(f.mean_sweep_m == 0) & (~f.edge_block)].copy()
X = base[['surplus_rate', 'invest_rate', 'housing_share', 'flex_share', 'irr_share', 'buffer_months', 'neg_days', 'med_salary_m']].copy()
X['buffer_months'] = np.log1p(X.buffer_months.clip(lower=0)); X['neg_days'] = np.log1p(X.neg_days)
X = X.fillna(X.median())
km = KMeans(6, n_init=10, random_state=0).fit(StandardScaler().fit_transform(X))
base['km'] = km.labels_
print(pd.crosstab(base.archetype, base.km))
print(base.groupby('km')[cols].median().round(2).assign(n=base.km.value_counts()).T)

# ---------------- benchmarks ----------------
b = f[(f.mean_sweep_m == 0) & (~f.edge_block)].copy()
b['income_band'] = pd.qcut(b.med_salary_m, 5, labels=['Q1', 'Q2', 'Q3', 'Q4', 'Q5'])
catcols = [c for c in f.columns if c.startswith('cat_') and c not in ('cat_Salary', 'cat_Other Income', 'cat_Invest Withdraw', 'cat_Salary Sweep')]
q = [.1, .25, .5, .75, .9]
bench = b[catcols + ['mean_consumption_m', 'mean_flex_m', 'mean_irr_m', 'mean_reg_m', 'med_salary_m', 'surplus_rate', 'housing_share', 'flex_share', 'eod_median', 'neg_days']].quantile(q).T.round(2)
bench.columns = ['p10', 'p25', 'p50', 'p75', 'p90']
print(bench); bench.to_csv('benchmarks_overall.csv')
band = b.groupby('income_band', observed=True)[['med_salary_m'] + catcols + ['mean_consumption_m', 'surplus_rate', 'flex_share', 'housing_share']].median().round(1).T
print(band); band.to_csv('benchmarks_by_income_quintile.csv')
edges = b.med_salary_m.quantile([.2, .4, .6, .8]).round(0).tolist(); print('quintile edges', edges)

# percentile of CUST04859 within base population
def pct_rank(cid, cols):
    return {c: round((b[c] < f.loc[cid, c]).mean() * 100) for c in cols}
pc = ['med_salary_m', 'mean_consumption_m', 'surplus_rate', 'invest_rate', 'housing_share', 'flex_share', 'cat_Restaurants', 'eod_median', 'neg_days', 'n_shocks']
print('CUST04859', f.loc['CUST04859', ['archetype'] + pc + ['late_salary', 'missed_housing']].to_dict()); print(pct_rank('CUST04859', pc))

f.to_csv('customer_features_full.csv')
