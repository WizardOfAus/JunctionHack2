import 'server-only';
import ratesCsv from '@/data/overlays/mortgage_market_rates.csv?raw';
import type { Clock } from './finance';
import { parseCsv } from './csv';
import type { MarketRate } from './loan-readiness';

const rows=parseCsv(ratesCsv);

/** Bank of Finland average rate on new housing loans for the latest month the clock has seen. */
export function latestMortgageRate(clock:Clock):MarketRate|null {
  const month=clock.historyThrough.slice(0,7);
  const row=rows.filter(r=>r.series==='new_housing_loans_average_rate'&&r.month<=month).sort((a,b)=>a.month.localeCompare(b.month)).at(-1);
  return row?{annualPercent:Number(row.value_percent),month:row.month,source:row.source_url,label:row.label}:null;
}
