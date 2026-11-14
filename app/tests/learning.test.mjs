import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonRoom, checkPrediction } from '../features/learning/balance-model.ts';
import { awardLesson, totalXp } from '../lib/learning.ts';

test('the whole practice balance is conserved as protection changes', () => {
  for (let reserve = 10000; reserve <= 40000; reserve += 5000) {
    const room = lessonRoom(100000, 60000, reserve);
    assert.equal(60000 + reserve + room, 100000);
    assert.equal(room % 1000, 0);
  }
  assert.equal(lessonRoom(100000, 60000, 40000), 0);
});
test('prediction distinguishes full balance, post-bills balance and extra room', () => {
  assert.equal(checkPrediction(null), false);
  assert.equal(checkPrediction(120000), false);
  assert.equal(checkPrediction(55000), false);
  assert.equal(checkPrediction(20000), true);
});
test('replaying the new balance lesson preserves existing progress and awards XP once', () => {
  let completed = ['reserve'];
  for (let i = 0; i < 5; i++) completed = awardLesson(completed, 'balance');
  assert.deepEqual(completed, ['reserve', 'balance']);
  assert.equal(totalXp(completed), 90);
});
