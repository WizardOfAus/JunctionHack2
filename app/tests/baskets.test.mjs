import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {basketOf,basketProfile,classifyBasket,isConsumption,historyOnly,forecast,defaults,clocks} from '../lib/finance.ts';

// The dataset analysis used history before 1 September, so these checks use the backtest clock.
const bt=clocks.backtest;

const rows=historyOnly(JSON.parse(readFileSync(new URL('../data/persona.json',import.meta.url),'utf8')).transactions,bt);
const profile=basketProfile(rows);
const base=rows.find(t=>t.transaction_type==='purchase');
const purchase=(category,euros,mcc_code='')=>({...base,category,mcc_code,amountCents:-Math.round(euros*100)});

test('reproduces the dataset analysis split for CUST04859 (76.9 / 1.0 / 22.1)',()=>{
  const totals={regular:0,irregular:0,flexible:0};
  for(const t of rows.filter(isConsumption)) totals[basketOf(t,{},profile)]-=t.amountCents;
  const all=totals.regular+totals.irregular+totals.flexible;
  const pct=k=>Math.round(totals[k]*1000/all)/10;
  assert.deepEqual([pct('regular'),pct('irregular'),pct('flexible')],[76.9,1.0,22.1]);
  const shocks=rows.filter(t=>isConsumption(t)&&basketOf(t,{},profile)==='irregular');
  assert.deepEqual(shocks.map(t=>t.category),['Health','Health','Health']);
  assert.equal(shocks.reduce((s,t)=>s-t.amountCents,0),53947);
});

test('commuting is regular, taxis are flexible',()=>{
  assert.equal(classifyBasket(purchase('Transportation',40,'4111')).basket,'regular');
  assert.equal(classifyBasket(purchase('Transportation',25,'4121')).basket,'flexible');
});

test('health splits routine pharmacy from larger clinical costs',()=>{
  assert.equal(classifyBasket(purchase('Health',30,'5912')).basket,'regular');
  assert.equal(classifyBasket(purchase('Health',90,'8021')).basket,'irregular');
  assert.equal(classifyBasket(purchase('Health',160,'5912')).basket,'irregular');
});

test('Home & Tech is irregular only when large for this customer',()=>{
  const p={categoryMedianCents:{'Home & Tech':10000}};
  assert.equal(classifyBasket(purchase('Home & Tech',120),p).basket,'flexible');
  assert.equal(classifyBasket(purchase('Home & Tech',300),p).basket,'irregular');
  assert.equal(classifyBasket(purchase('Home & Tech',1000)).basket,'irregular');
});

test('implausibly large everyday purchases are irregular and flagged for review',()=>{
  const c=classifyBasket(purchase('Restaurants',1200));
  assert.equal(c.basket,'irregular');assert.equal(c.review,true);
  assert.equal(classifyBasket(purchase('Travel',800)).basket,'flexible');
});

test('salary sweeps and investments are not spending',()=>{
  assert.equal(isConsumption({...base,transaction_type:'salary_sweep',amountCents:-250000}),false);
  assert.equal(isConsumption({...base,transaction_type:'investment_deposit',amountCents:-25000}),false);
});

test('user corrections still win over the rules',()=>{
  const t=purchase('Transportation',25,'4121');
  assert.equal(basketOf(t,{[t.id]:'regular'},profile),'regular');
});

test('forecast baskets use the new rules without changing audited baseline answers',()=>{
  const f=forecast(rows,defaults,bt);
  assert.equal(f.balanceCents,605933);assert.equal(f.restaurantCents,11432);
  assert.equal(forecast(rows,{...defaults,restaurantReduction:20},bt).reductionCents,2286);
  assert.ok(f.baskets.irregular<f.baskets.flexible);
});
