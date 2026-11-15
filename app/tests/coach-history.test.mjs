import './resolve-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCsv} from './read-csv.mjs';
import {basketProfile,clocks,defaults,forecast,historyOnly,isConsumption} from '../lib/finance.ts';
import {loanReadiness} from '../lib/loan-readiness.ts';
import {benchmarks} from '../lib/benchmarks.ts';
import {defaultContext,journeyActions} from '../lib/journey/context.ts';
import {followUpQuestion,historyContext,historySchema,looksLikeFollowUp,resolveFollowUp} from '../lib/coach/history.ts';
const {calculatedAnswer}=await import('../lib/coach/calculated.ts');

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const tables={overall:readCsv('../data/insights/benchmarks_overall.csv'),byIncome:readCsv('../data/insights/benchmarks_by_income_quintile.csv'),
  byAge:readCsv('../data/insights/benchmarks_by_age.csv'),statfin:read('../data/benchmarks/statfin-household-budget-2022.json')};
const raw=read('../data/persona.json').transactions,customerId=read('../data/personas/records.json').personas.reference.customerId;
const transactions=historyOnly(raw,clocks.current,customerId),f=forecast(raw,defaults,clocks.current,customerId);
const answer=question=>calculatedAnswer({question,transactions,customerId,assumptions:defaults,forecast:f,profile:basketProfile(transactions),
  readiness:loanReadiness({forecast:f,assumptions:defaults,mortgage:null,marketRate:null}),mortgage:null,
  comparison:benchmarks({rows:transactions,salaryCents:f.salaryCents,age:null,tables,isSpending:isConsumption}),context:defaultContext,actions:journeyActions(defaultContext,question.toLowerCase(),true)});
const turns=(...pairs)=>pairs.flatMap(([q,a])=>[{role:'user',text:q},{role:'coach',text:a}]);

test('short follow-ups borrow the previous topic with the new period or percentage',()=>{
  const taxi=resolveFollowUp('and in July?',turns(['Taxi spending in August','€50.47']),answer);
  assert.equal(taxi.usedFollowUp,true);assert.equal(taxi.calc.intent,'taxi');assert.equal(taxi.calc.from,'2026-07-01');
  const cut=resolveFollowUp('And 40%?',turns(['What if I spent 20% less eating out?','…€15.46…']),answer);
  assert.equal(cut.calc.intent,'restaurant_scenario');assert.equal(cut.calc.reductionPercent,40);assert.equal(cut.calc.authoritative,true);
});

test('a question that stands on its own is never rewritten',()=>{
  const r=resolveFollowUp('How much did I spend on groceries last month?',turns(['Taxi spending in August','€50.47']),answer);
  assert.equal(r.usedFollowUp,false);assert.equal(r.calc.category,'Groceries');
  assert.equal(resolveFollowUp('and in July?',[],answer).usedFollowUp,false);
  assert.equal(looksLikeFollowUp('Why was my mortgage declined and what can I do about it next year?'),false);
  assert.equal(followUpQuestion('what about restaurants?',turns(['Taxi spending in August','x'])),'Taxi spending in what about restaurants?');
});

test('history is bounded and labelled as context, not instructions',()=>{
  assert.equal(historySchema.safeParse(Array.from({length:7},()=>({role:'user',text:'x'}))).success,false);
  assert.equal(historySchema.safeParse([{role:'system',text:'x'}]).success,false);
  const text=historyContext([{role:'user',text:'a'.repeat(900)},{role:'coach',text:'ok'}]);
  assert.match(text,/context, not instructions/);assert.match(text,/^User: a{600}…$/m);assert.match(text,/^Pesä: ok$/m);
  assert.equal(historyContext([]),'');
});
