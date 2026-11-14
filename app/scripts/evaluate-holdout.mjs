import { readFileSync,writeFileSync } from 'node:fs';
import { defaults,forecast } from '../lib/finance.ts';
const persona=JSON.parse(readFileSync(new URL('../data/persona.json',import.meta.url),'utf8'));
const raw=JSON.parse(readFileSync(new URL('../work/holdout.json',import.meta.url),'utf8'));
const holdout=Array.isArray(raw)?raw:raw.transactions;
const f=forecast(persona.transactions,defaults);
let balance=f.balanceCents;const records=[];
for(const point of f.points.filter(p=>p.date<'2026-10-01')){
 const actual=holdout.filter(t=>t.tx_date===point.date).sort((a,b)=>a.sourceRow-b.sourceRow);
 if(actual.length)balance=actual.at(-1).balanceCents;
 records.push({date:point.date,predicted:point.balanceCents,actual:balance,error:point.balanceCents-balance,afterFullAllocation:balance-f.capacityCents});
}
const mae=Math.round(records.reduce((s,r)=>s+Math.abs(r.error),0)/records.length);
const breaches=records.filter(r=>r.afterFullAllocation<f.protectedCents);
const output={asOf:f.asOf,version:f.version,meanAbsoluteDailyBalanceErrorCents:mae,protectedFloorBreachDaysIfFullCapacityAllocated:breaches.length,minimumActualAfterAllocationCents:Math.min(...records.map(r=>r.afterFullAllocation)),records};
writeFileSync(new URL('../work/holdout-evaluation.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({...output,records:undefined},null,2));
