import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJourney, makeJourney } from '../features/onboarding/model.ts';

test('saved journey accepts each supported goal without changing persona', () => {
  for (const goal of ['understand', 'buffer', 'home']) {
    const profile = makeJourney(goal);
    assert.deepEqual(parseJourney(JSON.parse(JSON.stringify(profile))), { version: 1, goal, persona: 'junction-alex' });
  }
});
test('invalid, old and foreign-persona storage returns to goal selection', () => {
  for (const value of [null, [], 'home', { goal: 'home' }, { version: 2, goal: 'home', persona: 'junction-alex' }, { version: 1, goal: '__proto__', persona: 'junction-alex' }, { version: 1, goal: 'home', persona: 'another-customer' }]) {
    assert.equal(parseJourney(value), null);
  }
});
test('stored journey cannot inject other profile fields', () => {
  assert.deepEqual(parseJourney({ ...makeJourney('buffer'), customer_id: 'OTHER', account: 'OTHER' }), makeJourney('buffer'));
});
