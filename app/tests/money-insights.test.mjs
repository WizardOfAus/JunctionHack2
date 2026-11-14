import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, forecast } from '../lib/finance.ts';
import { analysisPeriod, dateLabel, outlook } from '../features/money-insights/model.ts';

const f = forecast([], defaults);
test('unknown coverage takes precedence over a seemingly healthy balance', () => {
  const result = outlook({ ...f, blocked: true, minimumCents: 900000, protectedCents: 100000, remainingCents: 800000, warnings: ['Account coverage is unknown.'] });
  assert.equal(result.kind, 'paused');
  assert.equal(result.detail, 'Account coverage is unknown.');
});
test('reserve pressure explains the actual minimum date and does not promote saving', () => {
  const result = outlook({ ...f, blocked: false, minimumCents: 100000, protectedCents: 350000, points: [{ date: '2026-10-02', balanceCents: 100000 }, { date: '2026-10-15', balanceCents: 600000 }] });
  assert.equal(result.kind, 'attention');
  assert.match(result.detail, /2 Oct/);
  assert.match(result.detail, /before adding extra saving/);
});
test('zero room is explained without inventing available money', () => {
  const result = outlook({ ...f, blocked: false, minimumCents: 350000, protectedCents: 350000, remainingCents: 0 });
  assert.match(result.title, /already has a job/);
});
test('history labels consume the explicit server period after a clock change', () => {
  assert.equal(analysisPeriod({ ...f, dataThrough: '2026-09-30', recentPeriod: 'Jul–Sep 2026' }), 'Jul–Sep 2026');
});
test('date labels are UTC-stable and show the correct demo month', () => {
  assert.equal(dateLabel('2026-10-01', true), '1 Oct 2026');
});
