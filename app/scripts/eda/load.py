import duckdb
import os
# Run from anywhere: inputs/outputs live in the ignored app/work/eda/ directory.
WORK=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','work','eda'); os.makedirs(WORK,exist_ok=True); os.chdir(WORK)
con=duckdb.connect('tx.duckdb')
con.execute("""create or replace table tx as select customer_id, tx_date::date tx_date, tx_timestamp, category, tx_amount_eur::double amt, balance_after_eur::double bal, transaction_type tt, merchant_id, mcc_code::varchar mcc from read_csv('../transactions.csv', header=true, all_varchar=true)""")
print(con.execute("select count(*), count(distinct customer_id), min(tx_date), max(tx_date) from tx").fetchall())
