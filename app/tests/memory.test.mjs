import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCsv} from './read-csv.mjs';
import {clocks,defaults,euro,forecast,historyOnly,isConsumption} from '../lib/finance.ts';
import {mortgageAt} from '../lib/personas/view.ts';
import {benchmarks} from '../lib/benchmarks.ts';
import {cleanTold,learnedFacts,memoryContext,paydayOfMonth,rememberRequest,MAX_TOLD_LENGTH} from '../lib/memory/memory.ts';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const tables={overall:readCsv('../data/insights/benchmarks_overall.csv'),byIncome:readCsv('../data/insights/benchmarks_by_income_quintile.csv'),
  byAge:readCsv('../data/insights/benchmarks_by_age.csv'),statfin:read('../data/benchmarks/statfin-household-budget-2022.json')};
const records=read('../data/personas/records.json').personas;
function facts(id,goal='home'){
  const record=records[id],raw=id==='reference'?read('../data/persona.json').transactions:read(`../data/personas/${id}.json`).transactions;
  const rows=historyOnly(raw,clocks.current,record.customerId),f=forecast(raw,defaults,clocks.current,record.customerId);
  return learnedFacts({rows,forecast:f,goal,mortgage:mortgageAt(record.mortgage,clocks.current),format:c=>euro(c),
    comparison:benchmarks({rows,salaryCents:f.salaryCents,age:record.customer.age,tables,isSpending:isConsumption})});
}

test('learned facts come from the account, each with a source',()=>{
  const ref=facts('reference');
  assert.ok(ref.every(f=>f.text&&f.source));
  assert.match(ref.find(f=>f.id==='salary').text,/paid around the 15th/);
  assert.equal(ref.find(f=>f.id==='goal').text,'Your direction is a first home.');
  assert.equal(ref.some(f=>f.id==='mortgage'),false);
  const spender=facts('flexible-spender');
  assert.match(spender.find(f=>f.id==='benchmark-Restaurants').text,/higher than about 9 in 10 people/);
  assert.match(facts('home-recent-approval').find(f=>f.id==='sweep').text,/moves to another account/);
  assert.match(facts('home-rejected-income').find(f=>f.id==='mortgage').text,/declined on 2026-05-12/);
});

test('payday is the most common salary day in the last six payments',()=>{
  const row=d=>({category:'Salary',tx_date:`2026-0${d[0]}-${d[1]}`});
  assert.equal(paydayOfMonth([['1','15'],['2','15'],['3','14'],['4','15']].map(row)),15);
  assert.equal(paydayOfMonth([]),null);
});

test('only explicit, short statements become memories, and nothing is saved by detection alone',()=>{
  assert.equal(rememberRequest('Remember that I want to buy a flat in Espoo in 2028'),'I want to buy a flat in Espoo in 2028');
  assert.equal(rememberRequest('please remember: eating out with friends matters to me'),'Eating out with friends matters to me');
  assert.equal(rememberRequest('Do you remember my rent?'),null);
  assert.equal(cleanTold('   '),null);assert.equal(cleanTold('x'.repeat(MAX_TOLD_LENGTH+1)),null);assert.equal(cleanTold(42),null);
});

test('the agent context lists learned facts with sources and the things the person asked to keep',()=>{
  const text=memoryContext([{id:'a',text:'Your salary is usually about €3,000.',source:'Salary payments'}],[{id:'1',text:'I want a flat in Espoo',createdAt:''}]);
  assert.match(text,/they can see and edit this in the app/);
  assert.match(text,/- Your salary is usually about €3,000\. \(Salary payments\)/);
  assert.match(text,/They asked you to remember:\n- I want a flat in Espoo/);
});
