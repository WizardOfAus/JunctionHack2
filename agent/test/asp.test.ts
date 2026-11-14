import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateAspProgress, rulesInForce, type AspInput } from '../src/finance/asp.ts';

const base = (over: Partial<AspInput> = {}): AspInput => ({
	asOf: '2026-09-01',
	openedOn: '2026-06-10',
	verifiedMonthlyDeposits: [
		{ month: '2026-06', amountCents: 20_000 },
		{ month: '2026-07', amountCents: 20_000 },
		{ month: '2026-08', amountCents: 20_000 },
	],
	...over,
});

describe('evaluateAspProgress', () => {
	it('asks for the opening date when it is not known', () => {
		const r = evaluateAspProgress(base({ openedOn: null }));
		assert.equal(r.status, 'unknown');
		assert.equal(r.progress, undefined);
		assert.equal(r.rules.requiredMonths, 20);
	});

	it('explains transition rules for accounts opened before 1 June 2026', () => {
		const r = evaluateAspProgress(base({ openedOn: '2025-03-01' }));
		assert.equal(r.status, 'legacy');
		assert.equal(r.progress, undefined);
		assert.match(r.message, /quarter/);
	});

	it('blocks an opening date after today', () => {
		assert.equal(evaluateAspProgress(base({ openedOn: '2026-10-01' })).status, 'blocked');
	});

	it('counts months of EUR 50 to EUR 1,500 and keeps months after a skipped month', () => {
		const r = evaluateAspProgress(base({
			verifiedMonthlyDeposits: [
				{ month: '2026-06', amountCents: 5_000 }, // exactly the minimum
				// July skipped
				{ month: '2026-08', amountCents: 150_000 }, // exactly the maximum
			],
		}));
		assert.equal(r.status, 'ok');
		assert.equal(r.progress?.qualifyingMonths, 2);
		assert.equal(r.progress?.remainingMonths, 18);
		assert.equal(r.rules.consecutiveMonthsRequired, false);
	});

	it('adds deposits in the same month before it checks the limits', () => {
		const r = evaluateAspProgress(base({
			verifiedMonthlyDeposits: [
				{ month: '2026-06', amountCents: 3_000 },
				{ month: '2026-06', amountCents: 3_000 },
			],
		}));
		assert.equal(r.progress?.qualifyingMonths, 1);
		assert.equal(r.progress?.months[0].deposited.cents, 6_000);
	});

	it('does not count months below the minimum, above the maximum, before opening or after today', () => {
		const r = evaluateAspProgress(base({
			verifiedMonthlyDeposits: [
				{ month: '2026-05', amountCents: 20_000 },
				{ month: '2026-06', amountCents: 4_000 },
				{ month: '2026-07', amountCents: 150_001 },
				{ month: '2026-08', amountCents: 20_000 },
				{ month: '2026-10', amountCents: 20_000 },
			],
		}));
		assert.equal(r.progress?.qualifyingMonths, 1);
		assert.deepEqual(r.progress?.months.map((m) => m.reason), [
			'before_opening', 'below_minimum', 'above_maximum', 'qualifies', 'after_today',
		]);
		assert.equal(r.progress?.verifiedTotal.cents, 4_000 + 150_001 + 20_000);
		assert.ok(r.warnings.some((w) => /above the EUR 1,500.00 maximum/.test(w)));
		assert.ok(r.warnings.some((w) => /first deposit/.test(w)));
	});

	it('says that EUR 40 a month does not qualify and keeps existing months', () => {
		const r = evaluateAspProgress(base({ plannedMonthlyCents: 4_000 }));
		assert.equal(r.projection?.qualifies, false);
		assert.equal(r.projection?.reason, 'below_minimum');
		assert.equal(r.projection?.allMonthsMonth, null);
		assert.match(r.projection?.summary ?? '', /does not qualify.*keep the 3 qualifying months/);
	});

	it('projects the 10th and 20th qualifying month from this month', () => {
		// 3 months so far; September is still open, so it is the first planned month.
		const r = evaluateAspProgress(base({ plannedMonthlyCents: 20_000 }));
		assert.equal(r.projection?.firstMonth, '2026-09');
		assert.equal(r.projection?.interimMonthsMonth, '2027-03'); // 3 + 7
		assert.equal(r.projection?.allMonthsMonth, '2028-01'); // 3 + 17
	});

	it('starts next month when this month already has a deposit', () => {
		const r = evaluateAspProgress(base({
			verifiedMonthlyDeposits: [{ month: '2026-09', amountCents: 20_000 }],
			openedOn: '2026-09-01',
			plannedMonthlyCents: 20_000,
		}));
		assert.equal(r.progress?.qualifyingMonths, 1);
		assert.equal(r.projection?.firstMonth, '2026-10');
		assert.equal(r.projection?.allMonthsMonth, '2028-04'); // 1 + 19
	});

	it('compares the savings with 5% and 10% of the price and finds the month when both conditions are met', () => {
		const r = evaluateAspProgress(base({
			homePriceCents: 20_000_000, // EUR 200,000 -> 10% = EUR 20,000, 5% = EUR 10,000
			plannedMonthlyCents: 100_000, // EUR 1,000
		}));
		assert.equal(r.savings?.balanceSource, 'verified_deposits');
		assert.equal(r.savings?.balance.cents, 60_000);
		assert.equal(r.savings?.interimTarget.cents, 1_000_000);
		assert.equal(r.savings?.depositTarget.cents, 2_000_000);
		assert.equal(r.savings?.remainingToDeposit.cents, 1_940_000);
		// 20 months: 2028-01. EUR 600 + 20 x EUR 1,000 >= EUR 20,000 in the 20th month: 2028-04.
		assert.equal(r.projection?.allMonthsMonth, '2028-01');
		assert.equal(r.projection?.depositTargetMonth, '2028-04');
		assert.equal(r.projection?.readyMonth, '2028-04');
	});

	it('uses the balance that the user gives', () => {
		const r = evaluateAspProgress(base({ homePriceCents: 20_000_000, currentBalanceCents: 2_500_000 }));
		assert.equal(r.savings?.balanceSource, 'user');
		assert.equal(r.savings?.remainingToDeposit.cents, 0);
	});

	it('rejects an unknown rules version and negative deposits', () => {
		assert.throws(() => evaluateAspProgress(base({ rulesVersion: 'asp-1999' })), /Unknown ASP rules version/);
		assert.throws(() => evaluateAspProgress(base({ verifiedMonthlyDeposits: [{ month: '2026-06', amountCents: -1 }] })), /negative/);
	});

	it('selects rules by effective date', () => {
		assert.equal(rulesInForce('2026-05-31'), null);
		assert.equal(rulesInForce('2026-06-01')?.version, 'asp-2026-06-01');
	});
});
