import './resolve-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCsv} from './read-csv.mjs';
import {basketOf,basketProfile,clocks,defaults,euro,forecast,historyOnly,isConsumption,recentWindow} from '../lib/finance.ts';
import {mortgageAt} from '../lib/personas/view.ts';
import {loanReadiness} from '../lib/loan-readiness.ts';
import {benchmarks} from '../lib/benchmarks.ts';
import {defaultContext,journeyActions} from '../lib/journey/context.ts';
const {calculatedAnswer}=await import('../lib/coach/calculated.ts');
const {answerVisual}=await import('../lib/coach/visuals.ts');

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const tables={overall:readCsv('../data/insights/benchmarks_overall.csv'),byIncome:readCsv('../data/insights/benchmarks_by_income_quintile.csv'),
  byAge:readCsv('../data/insights/benchmarks_by_age.csv'),statfin:read('../data/benchmarks/statfin-household-budget-2022.json')};
const records=read('../data/personas/records.json').personas;
function visualFor(question,id='reference'){
  const record=records[id],raw=id==='reference'?read('../data/persona.json').transactions:read(`../data/personas/${id}.json`).transactions;
  const transactions=historyOnly(raw,clocks.current,record.customerId),f=forecast(raw,defaults,clocks.current,record.customerId),profile=basketProfile(transactions);
  const mortgage=mortgageAt(record.mortgage,clocks.current),readiness=loanReadiness({forecast:f,assumptions:defaults,mortgage,marketRate:null});
  const comparison=benchmarks({rows:transactions,salaryCents:f.salaryCents,age:record.customer.age,tables,isSpending:isConsumption});
  const calc=calculatedAnswer({question,transactions,customerId:record.customerId,assumptions:defaults,forecast:f,profile,readiness,mortgage,comparison,context:defaultContext,actions:journeyActions(defaultContext,question.toLowerCase(),true)});
  const recent=recentWindow();
  return {f,visual:answerVisual({calc,forecast:f,comparison,readiness,months:3,transactions,format:c=>euro(c),
    window:transactions.filter(t=>t.tx_date>=recent.from&&isConsumption(t)).map(t=>({category:t.category,basket:basketOf(t,defaults.corrections,profile),spentCents:-t.amountCents}))})};
}

test('the basket chart adds up to the basket figure the app shows',()=>{
  const {f,visual}=visualFor('Help me understand my flexible spending basket.');
  assert.equal(visual.type,'bars');assert.ok(Math.abs(visual.items.reduce((s,i)=>s+i.cents,0)-f.baskets.flexible)<=visual.items.length);
});
test('the scenario chart frees exactly the calculated amount',()=>{
  const {visual}=visualFor('What if I spent 20% less eating out?');
  assert.equal(visual.items[0].cents-visual.items[1].cents,1546);assert.match(visual.note,/€15/);
});
test('taxi history highlights the asked month; comparisons and readiness have their own shapes',()=>{
  const taxi=visualFor('How much did I spend on taxis in August?').visual;
  assert.equal(taxi.items.length,6);assert.equal(taxi.items.find(i=>i.highlight).label,'Aug');assert.equal(taxi.items.find(i=>i.highlight).cents,5047);
  assert.equal(visualFor('How do I compare with people like me?','flexible-spender').visual.type,'compare');
  const checks=visualFor('Why was my mortgage declined?','home-rejected-income').visual;
  assert.equal(checks.type,'checks');assert.equal(checks.items.find(i=>i.label.startsWith('Income')).status,'short');
  const split=visualFor('Why isn’t my whole balance available?').visual;
  assert.equal(split.type,'split');assert.equal(split.segments.reduce((s,x)=>s+x.cents,0),visualFor('Why isn’t my whole balance available?').f.balanceCents);
  assert.equal(visualFor('hello').visual,null);
});
