import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import clock from '../../app/data/demo-clock.json' with { type: 'json' };
function readClock(cutoff?: string, rows = false) {
  const env = { ...process.env };
  delete env.KOTI_DATA_CUTOFF;
  if (cutoff) env.KOTI_DATA_CUTOFF = cutoff;
  return spawnSync(process.execPath, ['--input-type=module', '-e', `import { AS_OF, DATA_CUTOFF, getCustomerRows } from './src/data/store.ts'; console.log(JSON.stringify({asOf:AS_OF,through:DATA_CUTOFF${rows ? ",last:getCustomerRows('CUST04859').at(-1)" : ''}}));`], { env, encoding: 'utf8' });
}
test('agent defaults to shared current clock and supports the explicit backtest', () => {
  for (const [key, cutoff] of [['current', undefined], ['backtest', clock.clocks.backtest.historyThrough]] as const) {
    const result = readClock(cutoff);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { asOf: clock.clocks[key].demoDate, through: clock.clocks[key].historyThrough });
  }
});
test('agent refuses invalid, future and out-of-dataset cutoffs', () => {
  for (const cutoff of ['2026-02-30', 'invalid', '2026-10-01', '2024-09-30']) {
    const result = readClock(cutoff);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /valid date within the supplied history/);
  }
});
test('current agent uses September transactions and audited closing balance', { skip: !existsSync(process.env.KOTI_DB_PATH ?? 'data/koti.db') }, () => {
  const result = readClock(undefined, true);
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.through, clock.clocks.current.historyThrough);
  assert.equal(out.last.date, '2026-09-26'); // last posted transaction; coverage extends through month end
  assert.equal(out.last.balanceAfterCents, 741739);
});
