import assert from 'node:assert/strict';
import {defaults} from '../lib/finance.ts';
const origin=process.argv[2]||'http://127.0.0.1:5173';
async function post(path,body,status=200){const r=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,status,path);return r.json();}
const base=await post('/api/finance',defaults);
assert.equal(base.forecast.balanceCents,741739);assert.equal(base.forecast.dataThrough,'2026-09-30');
const allocated=await post('/api/finance',{...defaults,allocationCents:5000});
assert.equal(base.forecast.remainingCents-allocated.forecast.remainingCents,5000);
const coach=await post('/api/coach',{question:'What if I spent 20% less eating out?',assumptions:defaults});
assert.ok(coach.text.includes('€15.46'));assert.equal(coach.mode,'demo');assert.ok(coach.evidence.length);
await post('/api/coach',{question:'Continue',assumptions:defaults,conversationId:'analyst-demo'},400);
const custom=await post('/api/coach',{question:'Restaurants in July, 40% less',assumptions:defaults});assert.equal(custom.reductionPercent,40);assert.equal(custom.from,'2026-07-01');
const taxi=await post('/api/coach',{question:'Taxi spending in August',assumptions:defaults});assert.ok(taxi.text.includes('€50.47'));
const rows=await post('/api/transactions',{query:{from:'2026-08-01',to:'2026-08-31',category:'Restaurants'},assumptions:defaults});
assert.ok(rows.rows.length);assert.ok(rows.rows.every(r=>r.category==='Restaurants'&&r.customer_id==='CUST04859'&&r.tx_date<'2026-09-01'));
const september=await post('/api/transactions',{query:{from:'2026-09-01',to:'2026-09-30'},assumptions:defaults});assert.ok(september.rows.length&&september.rows.every(r=>r.tx_date<='2026-09-30'));
await post('/api/transactions',{query:{from:'2026-10-01',to:'2026-10-31'},assumptions:defaults},400);
await post('/api/transactions',{query:{from:'2024-09-01',to:'2024-09-30'},assumptions:defaults},400);
await post('/api/transactions',{query:{customerId:'CUST00001'},assumptions:defaults},400);
await post('/api/finance',{...defaults,reserveCents:-1},400);
await post('/api/transactions',{query:{},assumptions:{...defaults,connected:false}},409);
console.log('API smoke: finance, allocation, coach, taxi evidence, period filters, history window limits, customer isolation, validation, disconnect passed.');

const catalogue=await (await fetch(origin+'/api/personas')).json();
assert.equal(catalogue.defaultId,'reference');assert.equal(catalogue.personas.length,8);
for(const persona of catalogue.personas){
  const finance=await post('/api/finance',{...defaults,personaId:persona.id});
  assert.equal(finance.persona.account.accountId,persona.account.accountId);
  assert.equal(finance.forecast.accountId,persona.account.accountId);
  assert.match(finance.loanReadiness.label,/education, not a credit decision/);assert.equal(finance.loanReadiness.checks.length,3);assert.ok(finance.loanReadiness.payments.market.month);
  if(persona.mortgage)assert.match(finance.loanReadiness.basis.source,/Application record/);
  const evidence=await post('/api/transactions',{query:{},assumptions:defaults,personaId:persona.id});
  assert.equal(evidence.persona.id,persona.id);
  assert.ok(evidence.rows.every(row=>row.customer_id===persona.account.customerId));
  const answer=await post('/api/coach',{question:'What should I learn next?',assumptions:defaults,personaId:persona.id,context:{goal:'home',completedLessonIds:['balance'],screen:'learn'}});
  assert.equal(answer.persona.id,persona.id);assert.equal(answer.context.goal,'home');
  assert.deepEqual(answer.actions[0],{type:'lesson',lessonId:'scenario'});
}
const contextual=await post('/api/coach',{question:'What if I spent 35% less eating out?',assumptions:defaults,personaId:'flexible-spender',context:{goal:'buffer',completedLessonIds:['balance'],screen:'coach'}});
assert.deepEqual(contextual.actions.find(a=>a.type==='preview'),{type:'preview',scenario:'spending',reductionPercent:35});
const preview=await post('/api/finance',{...defaults,personaId:'flexible-spender',restaurantReduction:35});
assert.equal(preview.persona.id,'flexible-spender');assert.ok(preview.forecast.reductionCents>0);
const blocked=await post('/api/coach',{question:'What should I learn next?',assumptions:{...defaults,coverageConfirmed:false},context:{goal:'buffer',completedLessonIds:[],screen:'coach'}});
assert.ok(blocked.actions.every(a=>a.type==='lesson'));
for(const personaId of ['unknown','CUST04859']){
 await post('/api/finance',{...defaults,personaId},400);
 await post('/api/coach',{question:'hi',assumptions:defaults,personaId},400);
 await post('/api/transactions',{query:{},assumptions:defaults,personaId},400);
}
await post('/api/coach',{question:'hi',assumptions:defaults,context:{goal:'home',completedLessonIds:['invented'],screen:'coach'}},400);
await post('/api/coach',{question:'hi',assumptions:defaults,context:{goal:'home',completedLessonIds:[],screen:'coach',customerId:'CUST00001'}},400);
console.log('Journey API: all 8 personas isolated; context, lesson actions, scenario previews, unknown identities and forged context verified.');

// Topic routing must not turn affordability/card/period questions into mortgages or population benchmarks.
const dining=await post('/api/coach',{question:'Can I afford to eat out more at restaurants?',assumptions:defaults});
assert.equal(dining.kind,'scenario');assert.equal(dining.category,'Restaurants');
const card=await post('/api/coach',{question:'Why was my card declined?',assumptions:defaults});
assert.equal(card.kind,'help');assert.doesNotMatch(card.text,/mortgage|application record/);
const periods=await post('/api/coach',{question:'Compare restaurants in August and September',assumptions:defaults});
assert.notEqual(periods.kind,'benchmark');assert.notEqual(periods.kind,'readiness');assert.equal(periods.category,'Restaurants');
const noApplication=await post('/api/coach',{question:'Why was my mortgage declined?',assumptions:defaults,personaId:'flexible-spender'});
assert.equal(noApplication.kind,'readiness');assert.match(noApplication.text,/no home loan application on record/);assert.doesNotMatch(noApplication.text,/price up to €0(?:\D|$)/);
console.log('Coach routing: restaurant affordability, card decline, period comparison and missing application verified.');
