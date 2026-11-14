import test from 'node:test';
import assert from 'node:assert/strict';
import './resolve-ts.mjs';
const { parseJourney, makeJourney } = await import('../features/onboarding/model.ts');
const { personaIds } = await import('../lib/contracts.ts');

test('each supported goal and allowlisted persona survives storage', () => {
  for (const goal of ['understand', 'buffer', 'home']) for(const personaId of personaIds) {
    assert.deepEqual(parseJourney(JSON.parse(JSON.stringify(makeJourney(goal,personaId)))), { version:2,goal,personaId });
  }
});
test('legacy journey migrates to reference without losing its goal', () => {
  assert.deepEqual(parseJourney({version:1,goal:'buffer',persona:'junction-alex'}),makeJourney('buffer','reference'));
});
test('invalid identity never falls back to an unrelated customer', () => {
  for (const value of [null, [], 'home', {goal:'home'}, {version:2,goal:'home',personaId:'CUST04859'}, {version:2,goal:'__proto__',personaId:'reference'}, {version:1,goal:'home',persona:'another-customer'}]) assert.equal(parseJourney(value),null);
});
test('stored journey cannot inject other profile fields', () => {
  assert.deepEqual(parseJourney({...makeJourney('buffer'),customer_id:'OTHER',account:'OTHER'}),makeJourney('buffer'));
});
