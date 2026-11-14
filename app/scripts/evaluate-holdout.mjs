// Backtest: forecast as of the 'backtest' clock using only earlier rows, then
// compare with what the ledger actually recorded until the 'current' history ends.
// forecast() filters rows to the clock itself, so later rows cannot leak into the inputs.
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { clocks,defaults,forecast } from '../lib/finance.ts';
const persona=JSON.parse(readFileSync(new URL('../data/persona.json',import.meta.url),'utf8'));
const {backtest,current}=clocks;
const f=forecast(persona.transactions,defaults,backtest);
const actualRows=persona.transactions.filter(t=>t.tx_date>=backtest.demoDate&&t.tx_date<=current.historyThrough);
let balance=f.balanceCents;const records=[];
for(const point of f.points.filter(p=>p.date<=current.historyThrough)){
 const actual=actualRows.filter(t=>t.tx_date===point.date).sort((a,b)=>a.sourceRow-b.sourceRow);
 if(actual.length)balance=actual.at(-1).balanceCents;
 records.push({date:point.date,predicted:point.balanceCents,actual:balance,error:point.balanceCents-balance,afterFullAllocation:balance-f.capacityCents});
}
const mae=Math.round(records.reduce((s,r)=>s+Math.abs(r.error),0)/records.length);
const breaches=records.filter(r=>r.afterFullAllocation<f.protectedCents);
const output={asOf:f.asOf,inputsThrough:f.dataThrough,comparedThrough:current.historyThrough,version:f.version,actualRows:actualRows.length,meanAbsoluteDailyBalanceErrorCents:mae,protectedFloorBreachDaysIfFullCapacityAllocated:breaches.length,minimumActualAfterAllocationCents:Math.min(...records.map(r=>r.afterFullAllocation)),records};
mkdirSync(new URL('../work/',import.meta.url),{recursive:true});
writeFileSync(new URL('../work/backtest-evaluation.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({...output,records:undefined},null,2));
