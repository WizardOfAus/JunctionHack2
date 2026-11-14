import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays } from '../src/finance/dates.ts';
import { forecastCashflow, type TxRow } from '../src/finance/forecast.ts';
import { projectGoal, type GoalInput } from '../src/finance/goal.ts';

// Salary 2,500 on the 15th, saving transfer 200 on the 20th, rent 1,000 on the 3rd,
// 5 EUR cafés + 15 EUR restaurants + 10 EUR groceries a day. January to August 2026.
function makeRows({ saving = 20_000 } = {}): TxRow[] {
	const rows: TxRow[] = [];
	let balance = 300_000;
	let seq = 1;
	const push = (date: string, amountCents: number, type: string, category: string, mcc: string | null) => {
		balance += amountCents;
		rows.push({ seq: seq++, accountId: 'ACC1', date, amountCents, balanceAfterCents: balance, type, category, mcc });
	};
	for (let date = '2026-01-01'; date < '2026-09-01'; date = addDays(date, 1)) {
		const day = Number(date.slice(8, 10));
		if (day === 3) push(date, -100_000, 'housing_payment', 'Housing', null);
		if (day === 15) push(date, 250_000, 'salary', 'Salary', null);
		if (day === 20 && saving) push(date, -saving, 'investment_deposit', 'Invest Deposit', null);
		push(date, -500, 'purchase', 'Restaurants', '5814');
		push(date, -1_500, 'purchase', 'Restaurants', '5812');
		push(date, -1_000, 'purchase', 'Groceries', '5411');
	}
	return rows;
}

const base = (over: Partial<GoalInput> = {}): GoalInput => ({
	customerId: 'TEST',
	asOf: '2026-09-01',
	rows: makeRows(),
	goalCents: 1_000_000, // EUR 10,000
	currentSavingsCents: 200_000, // EUR 2,000
	monthlySavingCents: null,
	...over,
});

describe('projectGoal', () => {
	it('uses the median saving transfer and counts whole months', () => {
		const result = projectGoal(base());
		assert.equal(result.monthlySavingSource, 'existing_transfers');
		assert.equal(result.baseline.monthlySaving.cents, 20_000);
		// 8,000 remaining / 200 a month = 40 months; month 1 is September 2026.
		assert.equal(result.baseline.monthsToGoal, 40);
		assert.equal(result.baseline.readyDate, '2029-12-31');
		assert.equal(result.remaining.cents, 800_000);
	});

	it('gives the monthly statistics of the history', () => {
		const result = projectGoal(base());
		assert.equal(result.history.monthsUsed, 6); // March to August
		assert.equal(result.history.medianSalary.cents, 250_000);
		assert.equal(result.history.medianSavingTransfers.cents, 20_000);
	});

	it('is ready now when savings already cover the goal', () => {
		const result = projectGoal(base({ currentSavingsCents: 1_000_000 }));
		assert.equal(result.baseline.monthsToGoal, 0);
		assert.equal(result.baseline.readyDate, '2026-09-01');
	});

	it('a spending cut uses the same monthly number as the cashflow forecast', () => {
		const change = { type: 'changeSpending', category: 'Restaurants', mcc: '5814', percentChange: -20 } as const;
		const goal = projectGoal(base({ changes: [change] }));
		const forecast = forecastCashflow({ customerId: 'TEST', asOf: '2026-09-01', rows: makeRows(), floorCents: 0, runs: 100, changes: [change] });
		assert.equal(goal.difference!.monthlySaving.cents, -forecast.difference!.spendingChanges[0].monthlySpendChange.cents);
		assert.ok(goal.scenario!.monthsToGoal! < goal.baseline.monthsToGoal!);
		assert.match(goal.difference!.summary, /sooner/);
	});

	it('a raise adds only the share that goes to the goal', () => {
		const result = projectGoal(base({ changes: [{ type: 'changeIncome', percentChange: 10, toGoalPercent: 50 }] }));
		assert.equal(result.difference!.monthlySaving.cents, 12_500); // 10% of 2,500 = 250, half = 125
		assert.equal(result.scenario!.monthlySaving.cents, 32_500);
	});

	it('a one-off deposit moves the date', () => {
		const result = projectGoal(base({ changes: [{ type: 'oneOffDeposit', label: 'Bonus', amountCents: 200_000, date: '2026-12-10' }] }));
		assert.equal(result.scenario!.monthsToGoal, 30); // 6,000 remaining after the bonus = 30 months
		assert.equal(result.difference!.months, -10);
	});

	it('interest shortens the time', () => {
		const result = projectGoal(base({ annualInterestPercent: 3 }));
		assert.ok(result.baseline.monthsToGoal! < 40);
	});

	it('says when the goal is never reached', () => {
		const result = projectGoal(base({ monthlySavingCents: 0, changes: [{ type: 'addMonthlySaving', amountCents: -100 }] }));
		assert.equal(result.baseline.reached, false);
		assert.equal(result.scenario!.reached, false);
		assert.equal(result.difference!.summary, 'The goal is not reached in either case.');
	});

	it('warns when the plan saves more than the usual surplus', () => {
		const result = projectGoal(base({ changes: [{ type: 'addMonthlySaving', amountCents: 200_000 }] }));
		assert.match(result.warnings.join(' '), /more than the usual monthly surplus/);
	});

	it('is low confidence when current savings are not known', () => {
		const result = projectGoal(base({ currentSavingsCents: null }));
		assert.equal(result.status, 'low_confidence');
		assert.equal(result.currentSavings.source, 'not_set');
	});

	it('is blocked when there are no saving transfers and no saving amount', () => {
		const result = projectGoal(base({ rows: makeRows({ saving: 0 }) }));
		assert.equal(result.status, 'blocked');
		assert.match(result.blockedReason!, /how much they can save/);
	});

	it('rejects future rows (holdout protection)', () => {
		const rows = makeRows();
		rows.push({ ...rows[rows.length - 1], seq: 99_999, date: '2026-09-03' });
		assert.throws(() => projectGoal(base({ rows })), /Future data must not enter/);
	});
});
