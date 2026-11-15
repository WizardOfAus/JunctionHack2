import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCsv} from './read-csv.mjs';
import {clocks,defaults,euro,forecast,historyOnly,isConsumption} from '../lib/finance.ts';
import {mortgageAt} from '../lib/personas/view.ts';
import {loanReadiness} from '../lib/loan-readiness.ts';
import {benchmarks} from '../lib/benchmarks.ts';
import {buildFeed,cardsFor,closeEnough,concepts,masteredCount,updateMastery,MASTERED} from '../lib/learning/feed.ts';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const tables={overall:readCsv('../data/insights/benchmarks_overall.csv'),byIncome:readCsv('../data/insights/benchmarks_by_income_quintile.csv'),
  byAge:readCsv('../data/insights/benchmarks_by_age.csv'),statfin:read('../data/benchmarks/statfin-household-budget-2022.json')};
const records=read('../data/personas/records.json').personas;
function data(id){
  const record=records[id],raw=id==='reference'?read('../data/persona.json').transactions:read(`../data/personas/${id}.json`).transactions;
  const rows=historyOnly(raw,clocks.current,record.customerId),f=forecast(raw,defaults,clocks.current,record.customerId);
  return {forecast:f,format:c=>euro(c),comparison:benchmarks({rows,salaryCents:f.salaryCents,age:record.customer.age,tables,isSpending:isConsumption}),
    readiness:loanReadiness({forecast:f,assumptions:defaults,mortgage:mortgageAt(record.mortgage,clocks.current),marketRate:null})};
}

test('the feed follows the goal and starts with balance vs room',()=>{
  const d=data('home-rejected-income');
  assert.deepEqual(buildFeed({...d,goal:'home',mastery:{}}).map(c=>c.conceptId),['room','loan-cap','stress','asp','reserve']);
  assert.deepEqual(buildFeed({...d,goal:'buffer',mastery:{}}).map(c=>c.conceptId),['room','reserve','baskets','compare','share-savings']);
});

test('cards use the person’s own figures, with exactly one right answer',()=>{
  const d=data('home-rejected-income');
  const cap=cardsFor('loan-cap',d)[0];
  assert.ok(cap.prompt.includes('€315,000'));assert.equal(cap.options.filter(o=>o.correct).length,1);
  assert.equal(cap.options.find(o=>o.correct).label,'€15,750');
  const stress=cardsFor('stress',d)[0];
  assert.equal(stress.options.find(o=>o.correct).label,euro(d.readiness.payments.stress.monthlyCents));
  const room=cardsFor('room',d)[0];
  assert.equal(room.answerCents,Math.max(0,d.forecast.remainingCents));assert.ok(room.maxCents>=room.answerCents);
  for(const id of Object.keys(concepts)) for(const card of cardsFor(id,d)) if(card.kind==='quiz') assert.equal(new Set(card.options.map(o=>o.label)).size,card.options.length,id);
});

test('mastery moves up on a right answer, back to zero on a miss, and mastered topics come back as reviews',()=>{
  let m=updateMastery({},'room',true,1);m=updateMastery(m,'room',true,2);
  assert.equal(m.room.box,2);assert.equal(updateMastery(m,'room',false,3).room.box,0);
  for(let i=0;i<5;i++) m=updateMastery(m,'room',true,10+i);
  assert.equal(m.room.box,MASTERED);assert.equal(masteredCount(m),1);
  const d=data('reference');
  assert.notEqual(buildFeed({...d,goal:'understand',mastery:m})[0].conceptId,'room');
  const all=Object.fromEntries(Object.keys(concepts).map((id,i)=>[id,{box:MASTERED,seenAt:i}]));
  assert.equal(buildFeed({...d,goal:'understand',mastery:all})[0].conceptId,'room');
});

test('a guess within 20% (or €20) counts as close',()=>{
  assert.ok(closeEnough(110000,100000));assert.ok(!closeEnough(130000,100000));assert.ok(closeEnough(1500,0));
});


test('room guesses remain reachable with incoming income and deposit wording states the illustration',()=>{
 const d=data('reference');
 const room=cardsFor('room',{...d,forecast:{...d.forecast,balanceCents:10000,remainingCents:50000}})[0];
 assert.equal(room.maxCents,50000);
 const cap=cardsFor('loan-cap',data('home-rejected-income'))[0];
 assert.match(cap.prompt,/no extra collateral/);assert.match(cap.explain,/not a universal cash deposit/);
});
