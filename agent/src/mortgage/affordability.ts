// What a buyer can afford, from their own transactions and the Finnish lending rules.
// Pure functions: the caller passes the rows (already cut at the data cutoff).

import { monthKey, shiftMonth } from '../finance/dates.ts';
import { median } from '../finance/history.ts';
import { money, type Cents, type Money } from '../finance/money.ts';
import {
	DATASET_INCOME_SHARE, DEBT_SERVICE_LIMIT, LOAN_CAP_PERCENT, STRESS_RATE_PERCENT, STRESS_MAX_YEARS, TRANSFER_TAX_PERCENT,
	annuityCents, datasetRequiredIncomeCents, maxLoanForStressPaymentCents, stressPaymentCents,
} from './calc.ts';

export interface Row { date: string; amountCents: Cents; balanceAfterCents: Cents; type: string; accountId: string }

export interface BuyerProfile {
	months: number;
	monthsWithSalary: number;
	netSalary: Money;
	housingPaymentNow: Money;
	everydaySpending: Money;
	monthlySurplus: Money;
	balanceNow: Money;
	lowestBalance: Money;
	investedLast12Months: Money;
	notes: string[];
}

const NOT_SPENDING = new Set(['salary', 'other_income', 'investment_deposit', 'investment_withdrawal', 'salary_sweep', 'housing_payment']);

/** Default safety buffer: three months of everyday spending and housing. */
export function defaultBufferCents(p: BuyerProfile): Cents {
	return 3 * (p.everydaySpending.cents + p.housingPaymentNow.cents);
}

/** Profile from the 12 full months before asOf. */
export function buyerProfile(rows: Row[], asOf: string, months = 12): BuyerProfile {
	const end = monthKey(asOf); // the month of asOf is not complete, so it is left out
	const start = shiftMonth(end, -months);
	const keys = Array.from({ length: months }, (_, i) => shiftMonth(start, i));
	const by = new Map(keys.map((k) => [k, { salary: 0, housing: 0, spending: 0, net: 0 }]));
	let invested = 0, lowest = Infinity;
	const lastBalance = new Map<string, Cents>();
	for (const r of rows) {
		if (r.date >= asOf) continue;
		lastBalance.set(r.accountId, r.balanceAfterCents);
		const m = by.get(monthKey(r.date));
		if (!m) continue;
		lowest = Math.min(lowest, r.balanceAfterCents);
		if (r.type === 'salary') m.salary += r.amountCents;
		if (r.type === 'housing_payment') m.housing -= r.amountCents;
		if (!NOT_SPENDING.has(r.type) && r.amountCents < 0) m.spending -= r.amountCents;
		if (r.type === 'investment_deposit') invested -= r.amountCents;
		// Surplus: money in minus money out, but saving into investments is not a cost.
		if (r.type !== 'investment_deposit' && r.type !== 'investment_withdrawal') m.net += r.amountCents;
	}
	const list = [...by.values()];
	const paid = list.filter((m) => m.salary > 0);
	const notes = [
		'Salary is what was paid into this account each month (after tax), median of the last 12 months.',
		'The data cannot tell rent from a loan payment; the current housing payment is taken to be rent.',
		'Investments are not counted as own funds unless you say you will use them.',
	];
	if (paid.length < months) notes.push(`Salary was paid in only ${paid.length} of ${months} months.`);
	if (rows.some((r) => r.type === 'salary_sweep')) notes.push('Part of the salary moves on to another account, so spending there is not visible.');
	return {
		months,
		monthsWithSalary: paid.length,
		netSalary: money(median(paid.map((m) => m.salary))),
		housingPaymentNow: money(median(list.map((m) => m.housing))),
		everydaySpending: money(median(list.map((m) => m.spending))),
		monthlySurplus: money(median(list.map((m) => m.net))),
		balanceNow: money([...lastBalance.values()].reduce((a, b) => a + b, 0)),
		lowestBalance: money(Number.isFinite(lowest) ? lowest : 0),
		investedLast12Months: money(invested),
		notes,
	};
}

export interface Limits {
	/** FIN-FSA: stress payment at most 60% of net income (other debts assumed zero). */
	maxLoanByBankRule: Money;
	/** The synthetic dataset's required-income rule: loan payment at 6%/25y is at most 35% of income. */
	maxLoanByDatasetRule: Money;
	rules: string[];
}

export function limits(netSalaryCents: Cents, otherDebtPaymentsCents = 0): Limits {
	return {
		maxLoanByBankRule: money(Math.max(0, maxLoanForStressPaymentCents(netSalaryCents * DEBT_SERVICE_LIMIT - otherDebtPaymentsCents))),
		maxLoanByDatasetRule: money(maxLoanForStressPaymentCents(netSalaryCents * DATASET_INCOME_SHARE)),
		rules: [
			`Bank rule (FIN-FSA): all debt payments, calculated at ${STRESS_RATE_PERCENT}% over at most ${STRESS_MAX_YEARS} years, should be at most ${DEBT_SERVICE_LIMIT * 100}% of net income. Other debts are taken as zero; ask the user.`,
			`Dataset rule: the synthetic S-Pankki applications use required income = the ${STRESS_RATE_PERCENT}%, ${STRESS_MAX_YEARS}-year payment divided by ${DATASET_INCOME_SHARE}. It is stricter. It is not a bank rule.`,
			`Loan cap: the loan can be at most ${LOAN_CAP_PERCENT}% of the price, so you need at least ${100 - LOAN_CAP_PERCENT}% of your own money, plus the ${TRANSFER_TAX_PERCENT}% transfer tax.`,
		],
	};
}

/** A home as the buyer sees it in a listing. */
export interface Home {
	label: string;
	/** Myyntihinta: what the buyer pays the seller. */
	sellingPriceEur: number;
	/** Velaton hinta: selling price plus the flat's share of the housing company loan. The true price. */
	debtFreePriceEur: number;
	/** Hoitovastike. */
	maintenanceChargeEur: number;
	/** Rahoitusvastike or pääomavastike: pays the housing company loan. */
	financeChargeEur: number;
	/** Other fixed monthly costs, for example parking. */
	otherMonthlyEur: number;
}

export type Verdict = 'comfortable' | 'possible_but_tight' | 'not_affordable';

export interface HomeCheck {
	home: string;
	sellingPrice: Money;
	debtFreePrice: Money;
	housingCompanyLoanShare: Money;
	monthlyCharges: Money;
	transferTax: Money;
	minimumCashNeeded: Money;
	deposit: Money;
	loanNeeded: Money;
	loanToValuePercent: number;
	stressPayment: Money;
	stressShareOfNetSalaryPercent: number;
	datasetRequiredIncome: Money;
	/** Loan payment at today's rate (25-year annuity) plus the housing company charges. */
	monthlyHousingCost: Money;
	monthlyHousingCostVsNow: Money;
	housingCostShareOfNetSalaryPercent: number;
	fullyPaidInYearsAtCurrentHousingCost: number | null;
	verdict: Verdict;
	reasons: string[];
}

export interface CheckInput {
	home: Home;
	netSalaryCents: Cents;
	housingNowCents: Cents;
	ownFundsCents: Cents;
	bufferCents: Cents;
	ratePercentNow: number;
	termYears?: number;
	otherDebtPaymentsCents?: number;
}

/**
 * The buyer pays the selling price to the seller, and takes over the flat's share of the housing
 * company loan. The transfer tax is 1.5% of the debt-free price. Own funds minus tax and the
 * safety buffer go to the deposit; the rest is the bank loan.
 */
export function checkHome(i: CheckInput): HomeCheck {
	const p = i.home;
	const termMonths = (i.termYears ?? 25) * 12;
	const price = Math.round(p.sellingPriceEur * 100);
	const debtFree = Math.round(p.debtFreePriceEur * 100);
	const tax = Math.round(debtFree * (TRANSFER_TAX_PERCENT / 100));
	const minDeposit = Math.ceil((price * (100 - LOAN_CAP_PERCENT)) / 100);
	const available = Math.max(0, i.ownFundsCents - tax - i.bufferCents);
	// The bank needs at least the minimum deposit; if the buffer must pay for it, the verdict says so.
	const deposit = Math.min(price, Math.max(available, minDeposit));
	const loan = Math.max(0, price - deposit);
	const stress = stressPaymentCents(loan, termMonths);
	const financeCharge = Math.round(p.financeChargeEur * 100);
	const charges = Math.round((p.maintenanceChargeEur + p.otherMonthlyEur) * 100) + financeCharge;
	const loanPayment = annuityCents(loan, i.ratePercentNow, termMonths);
	const housingCost = loanPayment + charges;
	// The finance charge pays debt too, so the bank counts it in the 60% test.
	const debtService = stress + financeCharge + (i.otherDebtPaymentsCents ?? 0);
	const stressShare = i.netSalaryCents ? debtService / i.netSalaryCents : Infinity;
	const required = datasetRequiredIncomeCents(loan);
	const reasons: string[] = [];
	let verdict: Verdict = 'comfortable';
	const cashShort = minDeposit + tax - i.ownFundsCents;
	if (cashShort > 0) { verdict = 'not_affordable'; reasons.push(`You need at least ${money(minDeposit + tax).display} of your own money (5% deposit and transfer tax). You have ${money(i.ownFundsCents).display}.`); }
	else if (available < minDeposit) { verdict = 'possible_but_tight'; reasons.push(`The 5% deposit and the tax would use part of your ${money(i.bufferCents).display} safety buffer.`); }
	if (stressShare > DEBT_SERVICE_LIMIT) { verdict = 'not_affordable'; reasons.push(`At ${STRESS_RATE_PERCENT}% the debt payments would be ${pct(stressShare)}% of your net salary. The limit is ${DEBT_SERVICE_LIMIT * 100}%.`); }
	if (required > i.netSalaryCents && verdict !== 'not_affordable') { verdict = 'possible_but_tight'; reasons.push(`Under the dataset's stricter rule, this loan needs ${money(required).display} a month of income.`); }
	const share = i.netSalaryCents ? housingCost / i.netSalaryCents : Infinity;
	if (verdict === 'comfortable' && share > 0.4) { verdict = 'possible_but_tight'; reasons.push(`Housing would take ${pct(share)}% of your net salary, which leaves little room.`); }
	const companyLoanCents = Math.max(0, debtFree - price);
	if (companyLoanCents > debtFree * 0.1) reasons.push(`${money(companyLoanCents).display} of the true price is housing company loan. You pay it in the finance charge of ${money(financeCharge).display} a month.`);
	if (verdict === 'comfortable') reasons.push(`It passes the bank's ${STRESS_RATE_PERCENT}% stress test with room, and you keep your safety buffer.`);
	// How fast could the loan be repaid if the user paid what they pay for housing now (minus charges)?
	const toLoan = i.housingNowCents - charges;
	return {
		home: p.label,
		sellingPrice: money(price),
		debtFreePrice: money(debtFree),
		housingCompanyLoanShare: money(companyLoanCents),
		monthlyCharges: money(charges),
		transferTax: money(tax),
		minimumCashNeeded: money(minDeposit + tax),
		deposit: money(deposit),
		loanNeeded: money(loan),
		loanToValuePercent: price ? Math.round((loan / price) * 1000) / 10 : 0,
		stressPayment: money(stress),
		stressShareOfNetSalaryPercent: pct(stressShare),
		datasetRequiredIncome: money(required),
		monthlyHousingCost: money(housingCost),
		monthlyHousingCostVsNow: money(housingCost - i.housingNowCents),
		housingCostShareOfNetSalaryPercent: pct(share),
		/** Years to repay the loan if the user keeps paying what they pay for housing now (null: not within 40 years). */
		fullyPaidInYearsAtCurrentHousingCost: loan > 0 ? yearsToRepay(loan, i.ratePercentNow, toLoan) : 0,
		verdict,
		reasons,
	};
}

/** Years to repay a loan with a fixed monthly amount, or null if the amount never repays it (or takes over 40 years). */
export function yearsToRepay(principalCents: Cents, annualPercent: number, monthlyCents: Cents): number | null {
	const r = annualPercent / 100 / 12;
	if (monthlyCents <= principalCents * r) return null;
	const n = r === 0 ? principalCents / monthlyCents : -Math.log(1 - (principalCents * r) / monthlyCents) / Math.log(1 + r);
	return n > 480 ? null : Math.round((n / 12) * 10) / 10;
}

function pct(x: number) { return Number.isFinite(x) ? Math.round(x * 1000) / 10 : 999; }
