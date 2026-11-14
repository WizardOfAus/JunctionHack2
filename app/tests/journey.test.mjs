import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, forecast, historyOnly } from '../lib/finance.ts';
import { readFileSync } from 'node:fs';
import { lessons } from '../lib/learning.ts';
import { journeyContextSchema, coachActionSchema, journeyActions, nextLesson, coachJourneyContext, lessonIds } from '../lib/journey/context.ts';
const context={goal:'buffer',completedLessonIds:[],screen:'coach'};

test('progress and goal select a known next lesson, and completion ends recommendations',()=>{
  assert.deepEqual(lessonIds,lessons.map(l=>l.id));
  assert.equal(nextLesson(context),'balance');
  assert.equal(nextLesson({...context,completedLessonIds:['balance']}),'reserve');
  assert.equal(nextLesson({...context,goal:'home',completedLessonIds:['balance']}),'scenario');
  assert.equal(nextLesson({...context,completedLessonIds:[...lessonIds]}),null);
});
test('journey context rejects forged fields, unknown lessons and duplicate completion',()=>{
  for(const value of [{...context,customerId:'CUST00001'},{...context,goal:'approved'},{...context,completedLessonIds:['fake']},{...context,completedLessonIds:['balance','balance']}]) assert.equal(journeyContextSchema.safeParse(value).success,false);
});
test('coach offers only allowed actions and never an apply/transfer payload',()=>{
  for(const q of ['what next','salary delayed','20% less eating out','unexpected cost','recommend a scenario']) for(const goal of ['home','buffer','understand']) {
    for(const action of journeyActions({...context,goal},q,true)) assert.equal(coachActionSchema.safeParse(action).success,true);
  }
  assert.deepEqual(journeyActions(context,'spend 150% less eating out',true).filter(a=>a.type==='preview'),[]);
  assert.equal(coachActionSchema.safeParse({type:'preview',scenario:'spending',reductionPercent:101}).success,false);
  assert.equal(coachActionSchema.safeParse({type:'apply',patch:{balance:100}}).success,false);
  assert.equal(coachActionSchema.safeParse({type:'preview',scenario:'expense',customerId:'other'}).success,false);
  assert.ok(journeyActions(context,'what next',false).every(a=>a.type==='lesson'));
});
test('agent context carries current scenario and exact finance-engine outputs',()=>{
  const rows=historyOnly(JSON.parse(readFileSync(new URL('../data/persona.json',import.meta.url),'utf8')).transactions);
  const a={...defaults,unexpectedCents:25000,incomeDelayDays:7,restaurantReduction:35};
  const f=forecast(rows,a);const supplied=JSON.parse(coachJourneyContext(context,a,f));
  assert.equal(supplied.forecast.remainingCents,f.remainingCents);
  assert.equal(supplied.forecast.minimumCents,f.minimumCents);
  assert.equal(supplied.scenario.unexpectedCents,25000);
  assert.deepEqual(supplied.assumptions,a);
  assert.equal(supplied.nextLesson,'balance');
});
