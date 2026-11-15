import './resolve-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCsv} from './read-csv.mjs';
import {basketProfile,clocks,defaults,forecast,historyOnly,isConsumption} from '../lib/finance.ts';
import {mortgageAt} from '../lib/personas/view.ts';
import {loanReadiness} from '../lib/loan-readiness.ts';
import {benchmarks} from '../lib/benchmarks.ts';
import {defaultContext,journeyActions} from '../lib/journey/context.ts';

// calculated.ts uses bundler-style imports, so load it after the resolver is registered.
const {calculatedAnswer,calculatedContext}=await import('../lib/coach/calculated.ts');
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const tables={overall:readCsv('../data/insights/benchmarks_overall.csv'),byIncome:readCsv('../data/insights/benchmarks_by_income_quintile.csv'),
  byAge:readCsv('../data/insights/benchmarks_by_age.csv'),statfin:read('../data/benchmarks/statfin-household-budget-2022.json')};
const records=read('../data/personas/records.json').personas;
// Same inputs as the coach route (app/api/coach/route.ts).
function ask(question,id='reference'){
  const record=records[id],raw=id==='reference'?read('../data/persona.json').transactions:read(`../data/personas/${id}.json`).transactions;
  const transactions=historyOnly(raw,clocks.current,record.customerId),f=forecast(raw,defaults,clocks.current,record.customerId);
  const mortgage=mortgageAt(record.mortgage,clocks.current);
  return calculatedAnswer({question,transactions,customerId:record.customerId,assumptions:defaults,forecast:f,profile:basketProfile(transactions),
    readiness:loanReadiness({forecast:f,assumptions:defaults,mortgage,marketRate:null}),mortgage,
    comparison:benchmarks({rows:transactions,salaryCents:f.salaryCents,age:record.customer.age,tables,isSpending:isConsumption}),
    context:defaultContext,actions:journeyActions(defaultContext,question.toLowerCase(),true)});
}

test('calculated answers keep the figures the demo coach has always given',()=>{
  const cut=ask('What if I spent 20% less eating out?');
  assert.equal(cut.intent,'restaurant_scenario');assert.equal(cut.authoritative,true);assert.equal(cut.reductionPercent,20);assert.ok(cut.text.includes('€15.46'));assert.ok(cut.evidence.length);
  const taxi=ask('Taxi spending in August');
  assert.equal(taxi.intent,'taxi');assert.equal(taxi.authoritative,true);assert.ok(taxi.text.includes('€50.47'));
  assert.equal(ask('Restaurants in July, 40% less').from,'2026-07-01');
});

test('questions that are not a spending cut never become a reduction scenario',()=>{
  for(const q of ['Can I afford more restaurants?','Should I spend more on eating out?','What if I spent 20% more eating out?','Restaurants near me']){
    const r=ask(q);
    assert.notEqual(r.intent,'restaurant_scenario',q);assert.equal(r.reductionPercent,undefined,q);assert.equal(r.authoritative,false,q);
  }
  const vague=ask('What if I ate out less?');
  assert.equal(vague.intent,'restaurant_scenario');assert.equal(vague.authoritative,false);assert.match(vague.text,/For example, a 20% reduction/);
  assert.equal(ask('How much did I spend on restaurants last month?').authoritative,true);
});

test('validation replies and web topics are handled explicitly',()=>{
  const over=ask('What if I spent 150% less eating out?');
  assert.equal(over.intent,'validation');assert.equal(over.text,'Choose a spending reduction between 0% and 100%.');
  assert.equal(ask('Restaurants from 2026-09-30 to 2024-10-01').intent,'validation');
  const declined=ask('Why was my mortgage declined?','home-rejected-income');
  assert.equal(declined.intent,'readiness');assert.equal(declined.authoritative,true);assert.match(declined.text,/declined/);
  assert.equal(ask('What is the Euribor today and my mortgage payment?','home-rejected-income').authoritative,false);
});

test('the agent context marks authority and leaves unsupported questions alone',()=>{
  assert.match(calculatedContext(ask('What if I spent 20% less eating out?')),/^App-calculated answer to this question \(authoritative/);
  assert.match(calculatedContext(ask('Can I afford more restaurants?')),/^Possibly relevant app figures/);
  const hello=ask('hello');
  assert.equal(hello.intent,'unsupported');assert.equal(calculatedContext(hello),'');
});

test('general advice and unmatched parameters never become authoritative app answers',()=>{
  const questions=[
    'What is a typical mortgage term?', 'Is it normal to feel anxious about money?',
    'What will I spend on groceries next month?', 'What happens next after I apply for a mortgage?',
    'What is a mortgage?', 'How does a variable rate mortgage work?', 'Should I get a fixed or variable mortgage?',
    'What if I spent 20% less on groceries?', 'How can I spend less on groceries?',
    'What if I spent 20% less on taxis?', 'Should I take a taxi in September?',
    'What if I spent 20% eating out?', 'Compare restaurants in August and September',
    'How can I reduce my flexible basket by 20%?', 'What is an emergency buffer?',
    'Should I increase my investment deposits?',
  ];
  for(const id of ['reference','home-rejected-income'])for(const question of questions){
    const r=ask(question,id);
    assert.equal(r.authoritative,false,`${id}: ${question}`);
    assert.doesNotMatch(calculatedContext(r),/^App-calculated answer/);
  }
});

test('explicit supported requests retain authoritative figures and source rows',()=>{
  for(const question of ['Restaurants last month','What is my balance?','Taxi spending in August','How much did I spend on groceries last month?']){
    const r=ask(question);assert.equal(r.authoritative,true,question);assert.ok(r.evidence.length,question);
  }
  assert.equal(ask('What should I learn next?').authoritative,true);
  assert.equal(ask('How does my restaurant spending compare with other people?').authoritative,true);
});

test('out-of-range restaurant percentages retain validation without a reduction keyword',()=>{
  for(const question of ['What if I spent 150% eating out?','What if I spent 1500% less eating out?','What if I spent -20% less eating out?']){
    const r=ask(question);assert.equal(r.intent,'validation',question);assert.equal(r.authoritative,true);
    assert.equal(r.text,'Choose a spending reduction between 0% and 100%.');
  }
});
