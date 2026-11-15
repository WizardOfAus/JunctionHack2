import test from 'node:test';
import assert from 'node:assert/strict';
import {answerActions} from '../lib/coach/actions.ts';

const base=[{type:'lesson',lessonId:'balance'},{type:'preview',scenario:'spending',reductionPercent:20}];

test('a surprise bill offers an unexpected-cost preview, not the default lesson',()=>{
  assert.deepEqual(answerActions(base,'forecast','What happens to my reserve if a €500 bill arrives?'),[{type:'preview',scenario:'expense'}]);
});
test('ordinary answers drop the lesson; learning questions keep it',()=>{
  assert.deepEqual(answerActions(base,'restaurant_scenario','What if I spent 20% less eating out?'),[base[1]]);
  assert.deepEqual(answerActions([base[0]],'basket','Help me understand my flexible spending basket.'),[base[0]]);
  assert.deepEqual(answerActions([base[0]],'journey','What should I learn next?'),[base[0]]);
  assert.deepEqual(answerActions([base[0]],'taxi','How much did I spend on taxis in August?'),[]);
});
