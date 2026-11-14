import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaults,forecast,historyOnly,summarise,evaluateAsp,isConsumption,basketOf,depositReady} from '../lib/finance.ts';
import {awardLesson,totalXp} from '../lib/learning.ts';
const persona=JSON.parse(readFileSync(new URL('../data/persona.json',import.meta.url),'utf8'));
const rows=persona.transactions;
test('historical restaurant, taxi and closing balance match audited source',()=>{
 const f=forecast(rows,defaults);assert.equal(f.balanceCents,605933);assert.equal(f.restaurantCents,11432);
 assert.equal(forecast(rows,{...defaults,restaurantReduction:20}).reductionCents,2286);
 assert.equal(summarise(rows,'2026-06-01','2026-08-31','Restaurants').spentCents,34295);
 assert.equal(rows.filter(t=>t.tx_date.startsWith('2026-08')&&t.mcc_code==='4121').reduce((s,t)=>s-t.amountCents,0),5047);
});
test('a €50 saving allocation reduces optional spending by exactly €50',()=>{
 const base=forecast(rows,defaults),next=forecast(rows,{...defaults,allocationCents:5000});
 assert.equal(base.remainingCents-next.remainingCents,5000);assert.equal(next.capacityCents,base.capacityCents);
 assert.equal(next.remainingCents+next.allocationCents,next.capacityCents);
});
test('essential expense reduces capacity and pauses a challenge if reserve would be breached',()=>{
 const base=forecast(rows,defaults);const changed=forecast(rows,{...defaults,unexpectedCents:120000});
 assert.equal(changed.minimumCents,base.minimumCents-120000);assert.equal(changed.capacityCents,0);assert.equal(changed.challengeCents,0);
 assert.ok(changed.warnings.some(x=>x.includes('reserve')));
});
test('income delay changes the dated path; October housing is included',()=>{
 const base=forecast(rows,defaults);const delayed=forecast(rows,{...defaults,incomeDelayDays:14});
 assert.equal(delayed.points.find(p=>p.date==='2026-09-15').incomeCents,0);
 assert.ok(delayed.minimumCents<base.minimumCents);assert.ok(base.points.find(p=>p.date==='2026-10-02').costCents>=base.housingCents);
 assert.equal(forecast(rows,{...defaults,incomeDelayDays:60}).horizonDays,75);
});
test('stale, unknown coverage and disconnected data block capacity',()=>{
 for(const patch of [{stale:true},{coverageConfirmed:false},{connected:false}]){const f=forecast(rows,{...defaults,...patch});assert.equal(f.capacityCents,0);assert.equal(f.challengeCents,0);assert.ok(f.blocked);}
});
test('September holdout and other customers never enter history or forecasts',()=>{
 const fake={...rows.at(-1),id:'row-999',sourceRow:999,tx_date:'2026-09-01',amountCents:99000000,balanceCents:99000000};
 const other={...fake,customer_id:'CUST00001',tx_date:'2026-08-30'};
 assert.equal(historyOnly([...rows,fake,other]).length,rows.length);
 assert.deepEqual(forecast([...rows,fake,other],defaults),forecast(rows,defaults));
});
test('negative available balance never produces a positive recommendation',()=>{
 const f=forecast([{...rows.at(-1),balanceCents:-10000}],defaults);assert.equal(f.capacityCents,0);assert.equal(f.challengeCents,0);
});
test('saving transfers and internal transfers are not consumption',()=>{
 const base=rows[0];assert.equal(isConsumption({...base,transaction_type:'investment_deposit'}),false);assert.equal(isConsumption({...base,transaction_type:'internal_transfer'}),false);
 const withdrawal={...base,amountCents:20000,transaction_type:'investment_withdrawal'};
 assert.equal(summarise([withdrawal],'2024-10-01','2026-08-31').incomeCents,0);
});
test('classification correction is separate from original rows',()=>{
 const t=rows.find(t=>t.category==='Restaurants');assert.equal(basketOf(t),'flexible');assert.equal(basketOf(t,{[t.id]:'regular'}),'regular');assert.equal(t.category,'Restaurants');
});
test('ASP aggregates monthly totals, preserves skipped months and separates legacy rules',()=>{
 const deposits=[{date:'2026-06-02',amountCents:3000},{date:'2026-06-10',amountCents:2000},{date:'2026-08-01',amountCents:150000},{date:'2026-09-01',amountCents:5000}];
 assert.equal(evaluateAsp('2026-06-01',deposits).months,2);
 assert.equal(evaluateAsp('2026-06-01',[...deposits,{date:'2026-08-11',amountCents:1}]).months,1);
 assert.equal(evaluateAsp('2026-05-01',deposits).status,'legacy');assert.equal(evaluateAsp('',deposits).status,'unknown');
});
test('learning rewards cannot be farmed by repeated completion',()=>{
 const done=awardLesson([], 'balance');assert.deepEqual(awardLesson(done,'balance'),done);assert.equal(totalXp(awardLesson(done,'balance')),40);assert.equal(totalXp(awardLesson(done,'invented')),40);
});
test('zero monthly capacity has no fictional deposit-ready date',()=>{assert.equal(depositReady(defaults,0).date,null);assert.equal(depositReady(defaults,20000).months,90);});

test('a restaurant reclassified as essential is protected from the reduction scenario',()=>{
 const t=rows.find(t=>t.category==='Restaurants'&&t.tx_date>='2026-06-01');
 const base=forecast(rows,{...defaults,restaurantReduction:20});
 const changed=forecast(rows,{...defaults,restaurantReduction:20,corrections:{[t.id]:'regular'}});
 assert.ok(changed.reductionCents<base.reductionCents);assert.ok(changed.protectedRestaurantCents>0);
});
