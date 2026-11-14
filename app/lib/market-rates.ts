import 'server-only';
import ratesCsv from '@/data/overlays/mortgage_market_rates.csv?raw';
import type { Clock } from './finance';
import type { MarketRate } from './loan-readiness';

// Minimal CSV reader for the committed overlay (quoted fields may contain commas).
function parse(text:string) {
  const rows:string[][]=[];
  for(const line of text.replace(/^﻿/,'').split(/\r?\n/).filter(Boolean)) {
    const cells:string[]=[];let cell='',quoted=false;
    for(let i=0;i<line.length;i++){const c=line[i];
      if(quoted){if(c==='"'&&line[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
      else if(c==='"')quoted=true;else if(c===','){cells.push(cell);cell='';}else cell+=c;}
    rows.push([...cells,cell]);
  }
  const [header,...body]=rows;
  return body.map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]??''])));
}
const rows=parse(ratesCsv);

/** Bank of Finland average rate on new housing loans for the latest month the clock has seen. */
export function latestMortgageRate(clock:Clock):MarketRate|null {
  const month=clock.historyThrough.slice(0,7);
  const row=rows.filter(r=>r.series==='new_housing_loans_average_rate'&&r.month<=month).sort((a,b)=>a.month.localeCompare(b.month)).at(-1);
  return row?{annualPercent:Number(row.value_percent),month:row.month,source:row.source_url,label:row.label}:null;
}
