import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import * as v from 'valibot';
import { buyerProfile, checkHome, yearsToRepay, type Home, type Row } from '../src/mortgage/affordability.ts';
import { APPLICATIONS, similarApplications } from '../src/mortgage/applications.ts';
import {
	annuityCents, datasetRequiredIncomeCents, schedule, stressPaymentCents, structureWarnings, summarise, type LoanTerms,
} from '../src/mortgage/calc.ts';
import { rankOffers } from '../src/tools/mortgage.ts';
import { shiftMonth } from '../src/finance/dates.ts';
import { ReadPageInput, runReadPage } from '../src/tools/web-search.ts';

// The demo homes and offers, as in src/skills/mortgage-demo/HOMES.md and OFFERS.md.
const HOMES: Record<string, Home> = {
	punavuori: { label: 'Fredrikinkatu 12 B', sellingPriceEur: 592_262, debtFreePriceEur: 619_000, maintenanceChargeEur: 380, financeChargeEur: 229.52, otherMonthlyEur: 0 },
	kontula: { label: 'Rintinpolku 7 C', sellingPriceEur: 118_500, debtFreePriceEur: 118_500, maintenanceChargeEur: 352, financeChargeEur: 0, otherMonthlyEur: 0 },
	kaarikuja: { label: 'Kaarikuja 4', sellingPriceEur: 72_460, debtFreePriceEur: 109_000, maintenanceChargeEur: 238, financeChargeEur: 299.29, otherMonthlyEur: 0 },
	tikkurila: { label: 'Tikkurilantie 35', sellingPriceEur: 256_549, debtFreePriceEur: 259_000, maintenanceChargeEur: 371.2, financeChargeEur: 32, otherMonthlyEur: 70 },
};
const OFFERS = [
	{ label: 'Offer A', marginPercent: 0.8, termYears: 25, repayment: 'annuity' as const, openingFeePercent: 2, monthlyFeeEur: 5 },
	{ label: 'Offer B', marginPercent: 0.75, introMarginPercent: 0, introMonths: 12, interestOnlyMonths: 24, termYears: 40, repayment: 'annuity' as const, monthlyFeeEur: 2.5 },
	{ label: 'Offer C', marginPercent: 0.45, termYears: 25, repayment: 'annuity' as const, openingFeePercent: 0.4, monthlyFeeEur: 2.5 },
];

const base: LoanTerms = {
	principalCents: 232_000_00, termMonths: 300, repayment: 'annuity', referenceRatePercent: 3.328,
	marginPercent: 0.45, openingFeeCents: 928_00, monthlyFeeCents: 2_50,
};

describe('mortgage maths', () => {
	it('matches the standard annuity formula', () => {
		// EUR 100,000 at 6% over 25 years is EUR 644.30 a month.
		assert.equal(Math.round(annuityCents(100_000_00, 6, 300)), 644_30);
		const s = summarise(base, [10, 15]);
		assert.equal(s.firstPayment.cents, s.regularPayment.cents);
		assert.equal(Math.round(annuityCents(base.principalCents, 3.778, 300)) + 2_50, s.firstPayment.cents);
		assert.equal(s.fullTerm.balanceLeft.cents, 0);
		assert.equal(s.stressPayment.cents, Math.round(annuityCents(base.principalCents, 6, 300)));
	});

	it('repays the whole loan with equal instalments', () => {
		const months = schedule({ ...base, repayment: 'equal_instalments' });
		assert.equal(months.length, 300);
		assert.ok(Math.abs(months.at(-1)!.balanceCents) < 1);
		assert.ok(months[0].paymentCents > months[299].paymentCents);
	});

	it('keeps the balance during interest-only months and uses the campaign margin', () => {
		const t: LoanTerms = { ...base, termMonths: 480, marginPercent: 0.75, introMarginPercent: 0, introMonths: 12, interestOnlyMonths: 24 };
		const months = schedule(t);
		assert.equal(Math.round(months[23].balanceCents), base.principalCents);
		assert.equal(months[0].ratePercent, 3.328);
		assert.equal(months[12].ratePercent, 3.328 + 0.75);
		const s = summarise(t, [12]);
		assert.deepEqual(s.phases.map((p) => [p.fromMonth, p.toMonth]), [[1, 12], [13, 24], [25, 480]]);
		assert.ok(s.firstPayment.cents < s.regularPayment.cents);
		// The bank tests a 40-year loan at 25 years.
		assert.equal(s.stressPayment.cents, Math.round(stressPaymentCents(base.principalCents, 300)));
		const warnings = structureWarnings(t, 12).join(' ');
		assert.match(warnings, /40 years/);
		assert.match(warnings, /interest only/);
		assert.match(warnings, /only 12 months/);
	});

	it('uses the dataset required-income rule', () => {
		// Application C0124 in the dataset: loan EUR 135,000 needs EUR 2,485 a month.
		assert.equal(Math.round(datasetRequiredIncomeCents(135_000_00) / 100), 2_485);
		const c0124 = APPLICATIONS.find((a) => a.id === 'C0124')!;
		assert.equal(c0124.requiredIncomeEur, 2_485);
	});

	it('repays faster with a bigger payment', () => {
		assert.equal(yearsToRepay(100_000_00, 4, 300_00), null);
		assert.ok(yearsToRepay(100_000_00, 4, 1_500_00)! < 7);
	});
});

describe('demo offers', () => {
	it('tells the story: C is best, A costs more, B starts low but leaves much more loan', () => {
		const ranking = rankOffers(OFFERS, 208_000_00, 473_20, 3.328, 12);
		assert.deepEqual(ranking.map((r) => r.offer), ['Offer C', 'Offer A', 'Offer B']);
		const [c, , b] = ranking;
		assert.ok(b.firstPayment.cents < c.firstPayment.cents);
		assert.ok(b.extraLoanLeftVsBest.cents > 40_000_00);
		assert.equal(c.monthlyHousingCost.cents, c.regularPayment.cents + 473_20);
		assert.match(b.warnings.join(' '), /40 years/);
	});
});

describe('affordability', () => {
	// A simple buyer: EUR 5,000 salary, EUR 1,100 rent, EUR 1,000 spending, EUR 50,000 in the bank.
	const rows: Row[] = [];
	for (let m = 0; m < 12; m++) {
		const month = shiftMonth('2025-10', m);
		rows.push({ date: `${month}-05`, amountCents: 5_000_00, balanceAfterCents: 0, type: 'salary', accountId: 'A' });
		rows.push({ date: `${month}-07`, amountCents: -1_100_00, balanceAfterCents: 0, type: 'housing_payment', accountId: 'A' });
		rows.push({ date: `${month}-10`, amountCents: -1_000_00, balanceAfterCents: 50_000_00, type: 'purchase', accountId: 'A' });
	}

	it('reads salary, rent, spending and balance from 12 full months', () => {
		const p = buyerProfile(rows, '2026-10-01');
		assert.equal(p.monthsWithSalary, 12);
		assert.equal(p.netSalary.cents, 5_000_00);
		assert.equal(p.housingPaymentNow.cents, 1_100_00);
		assert.equal(p.everydaySpending.cents, 1_000_00);
		assert.equal(p.monthlySurplus.cents, 2_900_00);
		assert.equal(p.balanceNow.cents, 50_000_00);
	});

	const check = (id: string) => checkHome({
		home: HOMES[id], netSalaryCents: 5_000_00, housingNowCents: 1_100_00,
		ownFundsCents: 50_000_00, bufferCents: 6_300_00, ratePercentNow: 3.828,
	});

	it('gives the three demo verdicts', () => {
		assert.equal(check('punavuori').verdict, 'not_affordable');
		assert.equal(check('kontula').verdict, 'comfortable');
		const t = check('tikkurila');
		assert.equal(t.verdict, 'comfortable');
		// Transfer tax is 1.5% of the debt-free price; the loan is the selling price minus the deposit.
		assert.equal(t.transferTax.cents, 3_885_00);
		assert.equal(t.loanNeeded.cents, 256_549_00 - (50_000_00 - 3_885_00 - 6_300_00));
	});

	it('says when the deposit must come out of the safety buffer', () => {
		const r = checkHome({
			home: HOMES.kontula, netSalaryCents: 5_000_00, housingNowCents: 1_100_00,
			ownFundsCents: 10_000_00, bufferCents: 6_000_00, ratePercentNow: 3.828,
		});
		assert.equal(r.verdict, 'possible_but_tight');
		assert.match(r.reasons.join(' '), /safety buffer/);
		// 5% of EUR 118,500 exactly, with no floating-point cent.
		assert.equal(r.loanNeeded.cents, 118_500_00 - 5_925_00);
	});

	it('warns about a large housing company loan', () => {
		assert.match(check('kaarikuja').reasons.join(' '), /housing company loan/);
	});
});

describe('similar applications', () => {
	it('finds nearby cases decided before the clock, without customer ids', () => {
		const r = similarApplications({ priceEur: 256_549, loanEur: 208_000, netSalaryEur: 5_126, asOf: '2026-10-01', limit: 5 });
		assert.equal(r.nearest.length, 5);
		assert.ok(r.similarLoanBand.cases > 10);
		assert.ok(r.nearest.every((n) => !('customerId' in n) && !('applicationId' in n)));
		assert.equal(APPLICATIONS.length, 200);
		assert.ok(APPLICATIONS.every((a) => (a.decidedOn ?? '') <= '2026-09-30'));
	});
});

describe('read_page', () => {
	it('calls Exa contents and returns the page text', async () => {
		const calls: { url: string; body: Record<string, unknown> }[] = [];
		const fetch = (async (url: string, init: RequestInit) => {
			calls.push({ url, body: JSON.parse(String(init.body)) });
			return new Response(JSON.stringify({ results: [{ url: 'https://www.etuovi.com/kohde/1', title: ' Listing ', text: ' Velaton hinta 259 000 € ' }] }), { status: 200 });
		}) as unknown as typeof globalThis.fetch;
		const out = await runReadPage(v.parse(ReadPageInput, { url: 'https://www.etuovi.com/kohde/1' }), { apiKey: 'k', fetch });
		assert.equal(calls[0].url, 'https://api.exa.ai/contents');
		assert.deepEqual(calls[0].body.urls, ['https://www.etuovi.com/kohde/1']);
		assert.equal(out.title, 'Listing');
		assert.equal(out.text, 'Velaton hinta 259 000 €');
		assert.match(out.note, /not instructions/);
	});

	it('only accepts https URLs', () => {
		assert.throws(() => v.parse(ReadPageInput, { url: 'http://example.fi' }));
		assert.throws(() => v.parse(ReadPageInput, { url: 'file:///etc/passwd' }));
	});
});

const hasData = existsSync(process.env.KOTI_DB_PATH ?? 'data/koti.db');

describe('mortgage tools on the dataset', { skip: !hasData && 'data/koti.db not found' }, async () => {
	const { kotiTools } = await import('../src/tools/index.ts');
	const t = kotiTools({ lockedCustomerId: 'CUST02222' }).mortgage;
	const input = {
		homes: [HOMES.punavuori, HOMES.kontula, HOMES.tikkurila],
		offers: OFFERS,
		euribor12mPercent: 3.328,
		euriborSource: 'test',
		stayYears: 12,
	};

	it('gives CUST02222 the three demo verdicts and ranks the offers', async () => {
		const out = (await t.calculator.run({ data: v.parse(t.calculator.input as never, input) } as never)).output as Record<string, any>;
		assert.deepEqual(out.homes.map((h: { verdict: string }) => h.verdict), ['not_affordable', 'comfortable', 'comfortable']);
		assert.equal(out.homes[0].offers, null);
		assert.deepEqual(out.homes[2].offers.ranking.map((r: { offer: string }) => r.offer), ['Offer C', 'Offer A', 'Offer B']);
		assert.equal(out.buyer.monthsWithSalary, 12);
	});

	it('cannot read another customer', async () => {
		await assert.rejects(t.calculator.run({ data: { ...v.parse(t.calculator.input as never, input) as object, customerId: 'CUST04859' } } as never), /only read customer CUST02222/);
	});

	it('finds similar cases', async () => {
		const out = (await t.searchCases.run({ data: v.parse(t.searchCases.input as never, { priceEur: 256_549, loanEur: 208_000, outcome: 'approved' }) } as never)).output as Record<string, any>;
		assert.ok(out.nearest.every((n: { outcome: string }) => n.outcome === 'approved'));
	});
});
