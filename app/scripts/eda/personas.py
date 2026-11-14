import pandas as pd, numpy as np, duckdb
import os
# Run from anywhere: inputs/outputs live in the ignored app/work/eda/ directory.
WORK=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','work','eda'); os.makedirs(WORK,exist_ok=True); os.chdir(WORK)
pd.set_option('display.width', 250); pd.set_option('display.max_columns', 60)
f = pd.read_csv('customer_features_full.csv', index_col=0)
con = duckdb.connect('tx.duckdb', read_only=True)
# biggest proposed-irregular purchase in Jun-Aug 2026 and its date
big = con.execute("""
select customer_id, max(-amt) rec_big, arg_max(category, -amt) rec_big_cat, arg_max(tx_date, -amt) rec_big_date
from tx where tt='purchase' and tx_date between '2026-05-01' and '2026-08-31' and category in ('Home & Tech','Health') group by 1""").df().set_index('customer_id')
f = f.join(big)
clean = (f.mean_sweep_m == 0) & (f.n_anom == 0) & (f.housing_months >= 22)
show = ['archetype', 'med_salary_m', 'mean_consumption_m', 'surplus_rate', 'invest_rate', 'housing_share', 'flex_share', 'cat_Restaurants',
        'eod_median', 'bal_aug31', 'neg_days', 'n_shocks', 'late_salary', 'missed_housing', 'salary_cv_m', 'mean_other_inc_m']
def top(name, mask, key, asc=False, n=6):
    d = f[mask].sort_values(key, ascending=asc).head(n)
    print('\n##', name, mask.sum()); print(d[show + [c for c in ['rec_big', 'rec_big_cat', 'rec_big_date'] if name.startswith('shock')]].round(2).to_string())

# 1 first-home saver: steady salary, healthy surplus, no overdraft, moderate housing, growing balance, invests
m1 = clean & ~f.edge_block & (f.neg_days == 0) & f.surplus_rate.between(0.15, 0.35) & f.med_salary_m.between(2800, 4500) & (f.salary_cv_m < 0.12) & f.housing_share.between(0.25, 0.4) & (f.bal_trend_m > 150)
f['s1'] = f.surplus_rate + f.invest_rate - f.n_shocks * 0.01
top('first-home saver', m1, 's1')
# 2 tight budget
m2 = clean & ~f.edge_block & (f.neg_days >= 25) & f.surplus_rate.between(-0.05, 0.03) & (f.housing_share >= 0.38) & (f.n_shocks <= 2) & (f.missed_housing <= 1)
top('tight budget', m2, 'neg_days')
# 3 variable income
m3 = f.edge_block & (f.mean_sweep_m == 0) & (f.n_anom == 0) & (f.housing_months >= 22) & (f.eod_median < 30000) & (f.mean_consumption_m > 1500)
top('variable income', m3, 'salary_cv_m')
# 4 shock: clean, stable otherwise, one big recent purchase
m4 = clean & ~f.edge_block & (f.rec_big >= 1500) & (f.n_shocks <= 4) & (f.salary_cv_m < 0.12) & (f.surplus_rate > 0.03)
top('shock', m4, 'rec_big')
# 5 high flexible
m5 = clean & ~f.edge_block & (f.flex_share >= 0.38) & (f.surplus_rate.between(0.0, 0.12)) & (f.salary_cv_m < 0.12) & (f.med_salary_m < 5500)
top('high flex', m5, 'cat_Restaurants')
# 6 large fixed housing (mortgage-like signal only)
m6 = clean & ~f.edge_block & (f.housing_share.between(0.42, 0.55)) & (f.surplus_rate > 0.05) & (f.neg_days <= 5) & (f.missed_housing == 0)
top('large housing', m6, 'med_housing_m')
f.to_csv('customer_features_full.csv')
