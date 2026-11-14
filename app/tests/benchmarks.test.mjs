import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCsv} from './read-csv.mjs';
import {clocks,forecast,defaults,historyOnly,isConsumption} from '../lib/finance.ts';
import {benchmarks} from '../lib/benchmarks.ts';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const tables={overall:readCsv('../data/insights/benchmarks_overall.csv'),byIncome:readCsv('../data/insights/benchmarks_by_income_quintile.csv'),
  byAge:readCsv('../data/insights/benchmarks_by_age.csv'),statfin:read('../data/benchmarks/statfin-household-budget-2022.json')};
const records=read('../data/personas/records.json').personas;
function run(id){
  const raw=id==='reference'?read('../data/persona.json').transactions:read(`../data/personas/${id}.json`).transactions;
  const rows=historyOnly(raw,clocks.current,records[id].customerId);
  const f=forecast(raw,defaults,clocks.current,records[id].customerId);
  return benchmarks({rows,salaryCents:f.salaryCents,age:records[id].customer.age,tables,isSpending:isConsumption});
}
const cat=(b,name)=>b.categories.find(c=>c.category===name);

test('the Statistics Finland snapshot matches the published 2022 figures',()=>{
  const one=tables.statfin.householdTypes['1'].perHousehold;
  assert.deepEqual([one['0'],one['01'],one['04'],one['07'],one['11']],[216700,27300,74900,27200,10500]);
  assert.equal(tables.statfin.licence,'CC BY 4.0');assert.equal(tables.statfin.year,2022);
});

test('the high restaurant spender sits in the top 10% of the dataset',()=>{
  const r=cat(run('flexible-spender'),'Restaurants');
  assert.equal(r.dataset.band,'top 10%');assert.ok(r.youCents>r.dataset.p90);
  assert.equal(r.national.coicop,'11');assert.match(r.national.note,/hotels/);
});

test('the reference customer is placed by salary quintile and recorded age band',()=>{
  const b=run('reference');
  assert.equal(b.groups.incomeQuintile.quintile,2);assert.equal(b.groups.ageBand.band,'25-34');
  const r=cat(b,'Restaurants');
  assert.ok(['bottom 10%','p10–p25'].includes(r.dataset.band),r.dataset.band);
  assert.equal(typeof r.ageBandMedianCents,'number');assert.equal(typeof r.incomeQuintileMedianCents,'number');
});

test('averages use whole months of this customer\'s own spending only',()=>{
  const b=run('home-approved');
  assert.equal(b.period.months,24);
  const raw=read('../data/personas/home-approved.json').transactions;
  const groceries=raw.filter(t=>t.category==='Groceries'&&isConsumption(t)).reduce((s,t)=>s-t.amountCents,0);
  assert.equal(cat(b,'Groceries').youCents,Math.round(groceries/24));
  assert.ok(b.categories.every(c=>Number.isInteger(c.youCents)&&Number.isInteger(c.dataset.p50)));
  assert.match(b.label,/not advice/);
  assert.ok(!b.categories.some(c=>c.category==='Invest Deposit'));
});
