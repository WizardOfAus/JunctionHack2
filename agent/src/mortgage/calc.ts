// Mortgage maths. Pure functions, integer cents, no I/O.
// A Finnish housing loan is usually tied to a Euribor reference rate plus the bank's margin.
// We simulate month by month, so periods without repayments, a low first-year margin and a
// rate change all use the same code.

import { money, type Cents, type Money } from '../finance/money.ts';

/** FIN-FSA: the bank tests the payment at 6% interest over at most 25 years. */
export const STRESS_RATE_PERCENT = 6;
export const STRESS_MAX_YEARS = 25;
/** FIN-FSA debt-service rule: all debt payments at the stress rate should be at most 60% of net income. */
export const DEBT_SERVICE_LIMIT = 0.6;
/** The synthetic dataset's own rule: required income = 6% / 25-year annuity divided by 0.35. */
export const DATASET_INCOME_SHARE = 0.35;
/** Loan cap: up to 95% of the purchase price for all buyers since 30 June 2026 (FIN-FSA). */
export const LOAN_CAP_PERCENT = 95;
/** Transfer tax on housing company shares (flats and most row houses). */
export const TRANSFER_TAX_PERCENT = 1.5;
/** The rate shock we show: what the payment would be if the reference rate went up this much. */
export const RATE_SHOCK_POINTS = 2;

export type Repayment = 'annuity' | 'equal_instalments';

export interface LoanTerms {
	principalCents: Cents;
	termMonths: number;
	repayment: Repayment;
	/** The reference rate now, for example the 12-month Euribor, in percent. */
	referenceRatePercent: number;
	marginPercent: number;
	/** A lower margin for the first months (a campaign). */
	introMarginPercent?: number;
	introMonths?: number;
	/** Months at the start with interest only, no repayment of the loan. */
	interestOnlyMonths?: number;
	openingFeeCents: Cents;
	monthlyFeeCents: Cents;
}

export interface Month {
	month: number;
	ratePercent: number;
	paymentCents: Cents;
	interestCents: Cents;
	repaymentCents: Cents;
	balanceCents: Cents;
}

export function ratePercentAt(terms: LoanTerms, month: number, shockPoints = 0) {
	const margin = terms.introMonths && month <= terms.introMonths && terms.introMarginPercent != null
		? terms.introMarginPercent : terms.marginPercent;
	return Math.max(0, terms.referenceRatePercent + shockPoints + margin);
}

/** Annuity payment for a principal, an annual rate and a number of months. */
export function annuityCents(principalCents: Cents, annualPercent: number, months: number): Cents {
	if (months <= 0) return principalCents;
	const r = annualPercent / 100 / 12;
	return r === 0 ? principalCents / months : (principalCents * r) / (1 - (1 + r) ** -months);
}

/** Full month-by-month schedule. Amounts are kept unrounded inside and rounded on output. */
export function schedule(terms: LoanTerms, shockPoints = 0): Month[] {
	const months: Month[] = [];
	const io = Math.min(terms.interestOnlyMonths ?? 0, terms.termMonths - 1);
	const repayMonths = terms.termMonths - io;
	const fixedRepayment = terms.principalCents / repayMonths;
	let balance = terms.principalCents;
	for (let m = 1; m <= terms.termMonths && balance > 0.5; m++) {
		const ratePercent = ratePercentAt(terms, m, shockPoints);
		const interest = balance * (ratePercent / 100 / 12);
		let repayment = 0;
		if (m > io) {
			if (terms.repayment === 'annuity') {
				// Recalculate on the remaining term, as a bank does when the rate changes.
				repayment = annuityCents(balance, ratePercent, terms.termMonths - m + 1) - interest;
			} else {
				repayment = fixedRepayment;
			}
		}
		repayment = Math.min(repayment, balance);
		balance -= repayment;
		months.push({ month: m, ratePercent, paymentCents: interest + repayment, interestCents: interest, repaymentCents: repayment, balanceCents: balance });
	}
	return months;
}

export interface Phase {
	fromMonth: number;
	toMonth: number;
	monthlyPayment: Money;
	ratePercent: number;
	note: string;
}

/** Groups months with the same rate and the same kind of payment, for a readable summary. */
function phases(terms: LoanTerms, months: Month[]): Phase[] {
	const io = terms.interestOnlyMonths ?? 0;
	const out: Phase[] = [];
	for (const m of months) {
		const interestOnly = m.month <= io;
		const intro = !!terms.introMonths && m.month <= terms.introMonths;
		const note = interestOnly ? (intro ? 'interest only, campaign margin' : 'interest only, no repayment')
			: intro ? 'campaign margin' : terms.repayment === 'annuity' ? 'annuity payment' : 'equal repayment plus interest';
		const last = out.at(-1);
		// With equal instalments the payment falls a little every month; the phase shows its first payment.
		if (last && last.note === note && last.ratePercent === round3(m.ratePercent)) {
			last.toMonth = m.month;
			continue;
		}
		out.push({ fromMonth: m.month, toMonth: m.month, monthlyPayment: money(m.paymentCents + terms.monthlyFeeCents), ratePercent: round3(m.ratePercent), note });
	}
	return out;
}

export interface HorizonSummary {
	years: number;
	paid: Money;
	interest: Money;
	fees: Money;
	/** Interest plus fees: the money that does not reduce the loan. */
	cost: Money;
	/** Loan repaid so far, which becomes the owner's equity if the price stays the same. */
	repaid: Money;
	balanceLeft: Money;
}

export function horizon(terms: LoanTerms, months: Month[], years: number): HorizonSummary {
	const n = Math.min(years * 12, months.length);
	let paid = 0, interest = 0;
	for (let i = 0; i < n; i++) { paid += months[i].paymentCents; interest += months[i].interestCents; }
	const fees = terms.openingFeeCents + terms.monthlyFeeCents * n;
	const balance = n > 0 ? months[n - 1].balanceCents : terms.principalCents;
	return {
		years,
		paid: money(paid + fees),
		interest: money(interest),
		fees: money(fees),
		cost: money(interest + fees),
		repaid: money(terms.principalCents - balance),
		balanceLeft: money(balance),
	};
}

/** FIN-FSA stress payment: annuity at 6% over the loan term, but at most 25 years. */
export function stressPaymentCents(principalCents: Cents, termMonths: number): Cents {
	return annuityCents(principalCents, STRESS_RATE_PERCENT, Math.min(termMonths, STRESS_MAX_YEARS * 12));
}

/** The dataset's own required monthly income for a loan. */
export function datasetRequiredIncomeCents(principalCents: Cents): Cents {
	return annuityCents(principalCents, STRESS_RATE_PERCENT, STRESS_MAX_YEARS * 12) / DATASET_INCOME_SHARE;
}

/** The largest loan whose stress payment fits in a monthly amount. */
export function maxLoanForStressPaymentCents(monthlyCents: Cents): Cents {
	return monthlyCents / annuityCents(1, STRESS_RATE_PERCENT, STRESS_MAX_YEARS * 12);
}

export interface LoanSummary {
	principal: Money;
	termYears: number;
	repayment: Repayment;
	ratePercentNow: number;
	firstPayment: Money;
	/** The usual payment once campaign months and months without repayment end. */
	regularPayment: Money;
	phases: Phase[];
	stressPayment: Money;
	paymentIfRatesRise: { points: number; payment: Money };
	horizons: HorizonSummary[];
	fullTerm: HorizonSummary;
}

export function summarise(terms: LoanTerms, horizonYears: number[]): LoanSummary {
	const months = schedule(terms);
	const shocked = schedule(terms, RATE_SHOCK_POINTS);
	const settled = Math.min(Math.max(terms.interestOnlyMonths ?? 0, terms.introMonths ?? 0) + 1, months.length);
	return {
		principal: money(terms.principalCents),
		termYears: round3(terms.termMonths / 12),
		repayment: terms.repayment,
		ratePercentNow: round3(ratePercentAt(terms, 1)),
		firstPayment: money(months[0].paymentCents + terms.monthlyFeeCents),
		regularPayment: money(months[settled - 1].paymentCents + terms.monthlyFeeCents),
		phases: phases(terms, months),
		stressPayment: money(stressPaymentCents(terms.principalCents, terms.termMonths)),
		paymentIfRatesRise: { points: RATE_SHOCK_POINTS, payment: money(shocked[settled - 1].paymentCents + terms.monthlyFeeCents) },
		horizons: horizonYears.map((y) => horizon(terms, months, y)),
		fullTerm: horizon(terms, months, Math.ceil(terms.termMonths / 12)),
	};
}

/** Warnings a careful adviser would give about the structure of an offer. */
export function structureWarnings(terms: LoanTerms, stayYears: number): string[] {
	const w: string[] = [];
	const years = terms.termMonths / 12;
	if (years > 25) w.push(`The term is ${round3(years)} years. A long term lowers the payment but you pay interest for longer, and the bank still tests you at 25 years.`);
	if (terms.interestOnlyMonths) w.push(`The first ${terms.interestOnlyMonths} months are interest only. The loan does not get smaller in that time.`);
	if (terms.introMonths && terms.introMarginPercent != null && terms.introMarginPercent < terms.marginPercent) {
		w.push(`The low margin (${terms.introMarginPercent}%) lasts only ${terms.introMonths} months. After that the margin is ${terms.marginPercent}% for the rest of the loan.`);
	}
	const feePercent = terms.principalCents ? (terms.openingFeeCents / terms.principalCents) * 100 : 0;
	if (feePercent > 1) w.push(`The opening fee is ${round3(feePercent)}% of the loan, which is high. Many banks charge 0.4% or less.`);
	if (terms.marginPercent >= 0.75) w.push(`The margin ${terms.marginPercent}% is high. Recent bank offers in Finland were about 0.45% to 0.65%.`);
	if (years > stayYears + 20) w.push(`You plan to stay about ${stayYears} years, but the loan runs ${round3(years)} years. Most of it would still be unpaid when you sell.`);
	return w;
}

function round3(x: number) { return Math.round(x * 1000) / 1000; }
