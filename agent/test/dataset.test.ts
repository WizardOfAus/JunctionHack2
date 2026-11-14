// Checks against the real imported dataset. Skipped when data/koti.db is missing
// (run "npm run import-data" first).
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import * as v from 'valibot';

// Retain the original audited figures as an explicit backtest.
import clock from '../../app/data/demo-clock.json' with { type: 'json' };
process.env.KOTI_DATA_CUTOFF = clock.clocks.backtest.historyThrough;

const hasData = existsSync(process.env.KOTI_DB_PATH ?? 'data/koti.db');
const ctx = { toolCallId: 'test', log: { info() {}, warn() {}, error() {} } } as never;

describe('dataset and tools', { skip: !hasData && 'data/koti.db not found' }, async () => {
	const { kotiTools } = await import('../src/tools/index.ts');
	const { ForecastInput, ForecastOutput } = await import('../src/tools/forecast-cashflow.ts');
	const { GoalInput, GoalOutput } = await import('../src/tools/project-goal.ts');
	const { getCustomerRows } = await import('../src/data/store.ts');
	const { monthlyStats } = await import('../src/finance/history.ts');
	const open = kotiTools({});
	const locked = kotiTools({ lockedCustomerId: 'CUST04859' });

	async function query(tools: typeof open, data: Record<string, unknown>) {
		const tool = tools.queryTransactions;
		const result = await tool.run({ ...ctx, data: v.parse(tool.input, data) });
		return (result as { output: any }).output;
	}

	it('matches the audit: closing balance on 31 August 2026 is EUR 6,059.33', () => {
		const rows = getCustomerRows('CUST04859');
		assert.equal(rows.at(-1)!.date, '2026-08-31');
		assert.equal(rows.at(-1)!.balanceAfterCents, 605_933);
	});

	it('matches the audit: June-August mean monthly restaurant spend is EUR 114.32', async () => {
		const out = await query(open, { customerId: 'CUST04859', from: '2026-06-01', to: '2026-08-31', categories: ['Restaurants'], groupBy: 'category' });
		assert.equal(out.groups[0].monthlyMean.display, '-EUR 114.32');
	});

	it('matches the audit: August taxi/rideshare (MCC 4121) is EUR 50.47', async () => {
		const out = await query(open, { customerId: 'CUST04859', from: '2026-08-01', to: '2026-08-31', mcc: ['4121'], groupBy: 'mcc' });
		assert.equal(out.totals.moneyOut.display, '-EUR 50.47');
		assert.equal(out.groups[0].label, 'Taxis and rideshare');
	});

	it('never returns data after the cutoff', async () => {
		const out = await query(open, { customerId: 'CUST04859', from: '2026-08-01', to: '2026-09-30' });
		assert.equal(out.period.to, '2026-08-31');
		assert.ok(out.rows.every((row: { date: string }) => row.date <= '2026-08-31'));
		assert.match(out.notes.join(' '), /held out/);
	});

	it('a locked conversation cannot read another customer', async () => {
		await assert.rejects(query(locked, { customerId: 'CUST00001' }), /can only read customer CUST04859/);
		const out = await query(locked, { groupBy: 'type' });
		assert.equal(out.customer.customerId, 'CUST04859');
	});

	it('an open scope can read any customer, and rejects unknown ones', async () => {
		const out = await query(open, { customerId: 'CUST00001', groupBy: 'month' });
		assert.equal(out.customer.customerId, 'CUST00001');
		await assert.rejects(query(open, { customerId: 'CUST99999' }), /not in the dataset/);
	});

	it('matches the audit: 12-month medians of salary, saving transfers and surplus (Sep 2025-Aug 2026)', () => {
		const stats = monthlyStats(getCustomerRows('CUST04859'), '2026-09-01', 12);
		assert.equal(stats.medianSalaryCents, 270_099);
		assert.equal(stats.medianSavingTransfersCents, 24_633);
		assert.equal(stats.medianSurplusBeforeSavingCents, 58_338);
	});

	it('goal uses the last 6 months, and agrees with the forecast on salary and saving', async () => {
		const goal = (await locked.projectGoal.run({ ...ctx, data: v.parse(GoalInput, { goalEur: 30_000, currentSavingsEur: 5_000 }) })) as { output: unknown };
		const output = v.parse(GoalOutput, goal.output);
		assert.equal(output.history.monthsUsed, 6);
		assert.equal(output.history.months[0].month, '2026-03');
		assert.equal(output.history.medianSalary.display, 'EUR 2,737.43');
		assert.equal(output.history.medianSavingTransfers.display, 'EUR 249.65');
		assert.equal(output.history.medianSurplusBeforeSaving.display, 'EUR 808.69');
		assert.equal(output.baseline.monthlySaving.display, 'EUR 249.65');
		assert.equal(output.status, 'ok');

		const forecast = (await locked.forecastCashflow.run({ ...ctx, data: v.parse(ForecastInput, { floorEur: 3_000 }) })) as { output: any };
		const known = forecast.output.knownItems;
		assert.equal(known.find((k: any) => k.label === 'Salary').amount.display, output.history.medianSalary.display);
		assert.equal(known.find((k: any) => k.group === 'saving').amount.cents, -output.history.medianSavingTransfers.cents);
	});

	it('forecast output matches the published contract', async () => {
		const tool = open.forecastCashflow;
		const data = v.parse(ForecastInput, {
			customerId: 'CUST04859',
			floorEur: 3000,
			changes: [{ type: 'changeSpending', category: 'Restaurants', mcc: '5814', percentChange: -20 }],
		});
		const result = (await tool.run({ ...ctx, data })) as { output: unknown };
		const output = v.parse(ForecastOutput, result.output);
		assert.equal(output.status, 'ok');
		assert.equal(output.startBalance.display, 'EUR 6,059.33');
		assert.equal(output.period.from, '2026-09-01');
		assert.ok(output.difference!.spendingChanges[0].monthlySpendChange.cents < 0);
	});
});
