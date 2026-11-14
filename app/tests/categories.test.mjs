import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {categories,matchCategory} from '../lib/categories.ts';

const persona=JSON.parse(readFileSync(new URL('../data/persona.json',import.meta.url)));

test('category list matches the dataset exactly',()=>{
  assert.deepEqual(new Set(persona.transactions.map(t=>t.category)),new Set(categories));
});

test('everyday words resolve to dataset categories',()=>{
  assert.equal(matchCategory('How much did I spend on transport?'),'Transportation');
  assert.equal(matchCategory('Train tickets in July'),'Transportation');
  assert.equal(matchCategory('Home & Tech in 2026'),'Home & Tech');
  assert.equal(matchCategory('New electronics last month'),'Home & Tech');
  assert.equal(matchCategory('Travel spending in June'),'Travel');
  assert.equal(matchCategory('How much did I invest?'),'Invest Deposit');
  assert.equal(matchCategory('Groceries in July'),'Groceries');
});

test('home-goal and safe-to-save questions do not become categories',()=>{
  assert.equal(matchCategory('How much is safe to save for my home?'),undefined);
  assert.equal(matchCategory('What is my balance?'),undefined);
});
