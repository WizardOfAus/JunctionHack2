import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays } from '../src/finance/dates.ts';
import { forecastCashflow, type ForecastInput, type TxRow } from '../src/finance/forecast.ts';

// A synthetic customer: salary 2,500 on the 15th, rent 1,000 on the 3rd,
// and 20 EUR restaurants + 10 EUR groceries every day, from January to August 2026.
function makeRows(startBalance = 300_000): TxRow[] {
	const rows: TxRow[] = [];
	let balance = startBalance;
	let seq = 1;
	const push = (date: string, amountCents: number, type: string, category: string, mcc: string | null) => {
		balance += amountCents;
		rows.push({ seq: seq++, accountId: 'ACC1', date, amountCents, balanceAfterCents: balance, type, category, mcc });
	};
	let date = '2026-01-01';
	while (date < '2026-09-01') {
		const day = Number(date.slice(8, 10));
		if (day === 3) push(date, -100_000, 'housing_payment', 'Housing', null);
		if (day === 15) push(date, 250_000, 'salary', 'Salary', null);
		push(date, -1_500, 'purchase', 'Restaurants', '5812');
		push(date, -500, 'purchase', 'Restaurants', '5814');
		push(date, -1_000, 'purchase', 'Groceries', '5411');
		date = addDays(date, 1);
	}
	return rows;
}

const base = (over: Partial<ForecastInput> = {}): ForecastInput => ({
	customerId: 'TEST',
	asOf: '2026-09-01',
	rows: makeRows(),
	floorCents: 100_000,
	runs: 2_000,
	...over,
});

describe('forecastCashflow', () => {
	it('is deterministic for the same inputs', () => {
		assert.deepEqual(forecastCashflow(base()), forecastCashflow(base()));
	});

	it('rejects rows on or after asOf (holdout protection)', () => {
		const rows = makeRows();
		rows.push({ ...rows[rows.length - 1], seq: 99_999, date: '2026-09-02' });
		assert.throws(() => forecastCashflow(base({ rows })), /Future data must not enter/);
	});

	it('projects repeating salary and rent on their usual days', () => {
		const result = forecastCashflow(base());
		const items = result.knownItems.map((k) => `${k.date} ${k.label} ${k.amount.cents}`);
		assert.deepEqual(items, [
			'2026-09-03 Housing payment -100000',
			'2026-09-15 Salary 250000',
			'2026-10-03 Housing payment -100000',
		]);
	});

	it('finds the start balance and the tightest day before payday', () => {
		const rows = makeRows();
		const result = forecastCashflow(base({ rows }));
		assert.equal(result.startBalance.cents, rows[rows.length - 1].balanceAfterCents);
		// Spending is constant, so every run is the same: lowest point is the day before salary.
		assert.equal(result.baseline.lowestBalanceDate, '2026-09-14');
		assert.equal(result.baseline.lowestBalanceP10.cents, result.startBalance.cents - 100_000 - 14 * 3_000);
		assert.equal(result.baseline.safeToSetAside.cents, result.baseline.lowestBalanceP10.cents - 100_000);
	});

	it('does not create a scenario when there are no changes', () => {
		const result = forecastCashflow(base());
		assert.equal(result.scenario, undefined);
		assert.equal(result.difference, undefined);
	});

	it('gives the monthly effect of a spending change and only changes the forecast', () => {
		const result = forecastCashflow(base({
			changes: [{ type: 'changeSpending', category: 'Restaurants', mcc: '5814', percentChange: -20 }],
		}));
		const effect = result.difference!.spendingChanges[0];
		// 5 EUR a day = 35 EUR a week; a month is 365.25/12/7 weeks.
		assert.equal(effect.baselineMonthlySpend.cents, Math.round(3_500 * (365.25 / 12 / 7)));
		assert.equal(effect.monthlySpendChange.cents, Math.round(-0.2 * 3_500 * (365.25 / 12 / 7)));
		// 13 days before the tightest day x 1 EUR a day saved.
		assert.equal(result.difference!.safeToSetAside.cents, 14 * 100);
		assert.equal(result.baseline.safeToSetAside.cents, forecastCashflow(base()).baseline.safeToSetAside.cents);
	});

	it('an expense before the tightest day lowers the safe amount by that expense', () => {
		const result = forecastCashflow(base({
			changes: [{ type: 'addExpense', label: 'Car repair', amountCents: 40_000, date: '2026-09-10' }],
		}));
		assert.equal(result.difference!.safeToSetAside.cents, -40_000);
	});

	it('moving money to savings uses the same pool as spending (no double allocation)', () => {
		const safe = forecastCashflow(base()).baseline.safeToSetAside.cents;
		const all = forecastCashflow(base({ changes: [{ type: 'moveToSavings', amountCents: safe, date: '2026-09-01' }] }));
		assert.equal(all.scenario!.safeToSetAside.cents, 0);
		assert.equal(all.scenario!.breachRisk, 0);
		const more = forecastCashflow(base({ changes: [{ type: 'moveToSavings', amountCents: safe + 1, date: '2026-09-01' }] }));
		assert.equal(more.scenario!.breachRisk, 1);
	});

	it('a salary delay moves the tightest day', () => {
		const result = forecastCashflow(base({ changes: [{ type: 'delayIncome', days: 5 }] }));
		assert.equal(result.scenario!.lowestBalanceDate, '2026-09-19');
		assert.ok(result.scenario!.safeToSetAside.cents < result.baseline.safeToSetAside.cents);
	});

	it('a salary raise adds to the balance after payday, not before', () => {
		const result = forecastCashflow(base({ changes: [{ type: 'changeIncome', percentChange: 10 }] }));
		assert.equal(result.difference!.incomeChange!.monthlyChange.cents, 25_000);
		assert.equal(result.scenario!.endBalanceP50.cents - result.baseline.endBalanceP50.cents, 25_000);
		// The tightest day is before payday, so the safe amount does not change.
		assert.equal(result.difference!.safeToSetAside.cents, 0);
	});

	it('a new monthly salary replaces the projected salary', () => {
		const result = forecastCashflow(base({ changes: [{ type: 'changeIncome', newMonthlyCents: 200_000 }] }));
		assert.equal(result.difference!.incomeChange!.scenarioMonthlyIncome.cents, 200_000);
		assert.equal(result.scenario!.endBalanceP50.cents - result.baseline.endBalanceP50.cents, -50_000);
	});

	it('changeIncome needs exactly one of percentChange or newMonthlyCents', () => {
		assert.throws(() => forecastCashflow(base({ changes: [{ type: 'changeIncome' }] })), /exactly one/);
		assert.throws(
			() => forecastCashflow(base({ changes: [{ type: 'changeIncome', percentChange: 5, newMonthlyCents: 1 }] })),
			/exactly one/,
		);
	});

	it('a one-off income raises the safe amount only as far as the new tightest day allows', () => {
		const result = forecastCashflow(base({ changes: [{ type: 'addIncome', label: 'Bonus', amountCents: 50_000, date: '2026-09-05' }] }));
		// Before: lowest on 14 Sep = start - 1,000 rent - 14 days x 30.
		// After: 14 Sep is 500 higher, so the lowest moves to 4 Sep (after rent, before the bonus):
		// start - 1,000 - 4 x 30. The gain is 10 days x 30 = 300, not the full 500.
		assert.equal(result.scenario!.lowestBalanceDate, '2026-09-04');
		assert.equal(result.difference!.safeToSetAside.cents, 30_000);
		assert.match(result.assumptions.join(' '), /what-if/);
	});

	it('rejects change dates outside the forecast period', () => {
		assert.throws(
			() => forecastCashflow(base({ changes: [{ type: 'addExpense', label: 'x', amountCents: 1, date: '2026-12-01' }] })),
			/outside the forecast period/,
		);
	});

	it('marks low confidence when no floor is set, and uses EUR 0', () => {
		const result = forecastCashflow(base({ floorCents: null }));
		assert.equal(result.status, 'low_confidence');
		assert.equal(result.floor.source, 'not_set');
		assert.equal(result.floor.cents, 0);
		assert.match(result.warnings.join(' '), /No emergency floor/);
	});

	it('blocks when there is too little history', () => {
		const rows = makeRows().filter((row) => row.date >= '2026-08-15');
		const result = forecastCashflow(base({ rows }));
		assert.equal(result.status, 'blocked');
		assert.equal(result.baseline.safeToSetAside.cents, 0);
	});

	it('breach risk goes up when the floor goes up', () => {
		const rows = makeRows();
		// Add random-ish weekend spending so the runs differ.
		rows.forEach((row, i) => { if (i % 17 === 0 && row.type === 'purchase') row.amountCents -= 20_000; });
		const risks = [0, 150_000, 200_000, 250_000].map((floorCents) => forecastCashflow(base({ rows, floorCents })).baseline.breachRisk);
		for (let i = 1; i < risks.length; i++) assert.ok(risks[i] >= risks[i - 1], `risks ${risks}`);
	});
});
