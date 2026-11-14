// ASP (asuntosäästöpalkkio) progress: "How many qualifying months do I have?"
//
// Pure and deterministic. It uses only what the user tells us: the opening date
// and the verified monthly deposit totals. The transaction data does not show
// ASP deposits, so saving transfers in the data are never counted here.
//
// Rules are versioned and effective-dated. The monthly path applies to accounts
// opened on or after 1 June 2026. Older accounts are on transition rules that
// mix quarterly and monthly history; for them we explain the rules and do not
// give an exact count.

import { monthKey, shiftMonth } from './dates.ts';
import { money, type Cents, type Money } from './money.ts';

export const ASP_CALC_VERSION = 'koti-asp-1';
const MAX_MONTHS = 600; // 50 years

export interface AspRules {
	version: string;
	/** Accounts opened on or after this date use these rules. */
	effectiveFrom: string;
	source: string;
	sourceUpdated: string;
	minMonthlyCents: Cents;
	maxMonthlyCents: Cents;
	requiredMonths: number;
	/** Interim financing: this many qualifying months and interimSharePercent of the price. */
	interimMonths: number;
	interimSharePercent: number;
	/** Own savings needed for the ASP loan, as a share of the purchase price. */
	depositSharePercent: number;
	/** Interest that the ASP bank pays on deposits. Not used in the projection. */
	depositInterestPercent: number;
}

export const ASP_RULES: Record<string, AspRules> = {
	'asp-2026-06-01': {
		version: 'asp-2026-06-01',
		effectiveFrom: '2026-06-01',
		source: 'https://www.valtiokonttori.fi/en/services/financing-and-loans/asp-saving-and-asp-loans/',
		sourceUpdated: '2026-08-05',
		minMonthlyCents: 5_000,
		maxMonthlyCents: 150_000,
		requiredMonths: 20,
		interimMonths: 10,
		interimSharePercent: 5,
		depositSharePercent: 10,
		depositInterestPercent: 1,
	},
};

export const ASP_RULE_VERSIONS = Object.keys(ASP_RULES) as [string, ...string[]];

/** The newest rules that are in force on the given date, or null. */
export function rulesInForce(onDate: string): AspRules | null {
	let best: AspRules | null = null;
	for (const rules of Object.values(ASP_RULES)) {
		if (rules.effectiveFrom <= onDate && (!best || rules.effectiveFrom > best.effectiveFrom)) best = rules;
	}
	return best;
}

export interface AspInput {
	asOf: string;
	/** null = the user has not said. */
	openedOn: string | null;
	/** Verified deposit totals by month ("2026-06"). The same month can appear more than once. */
	verifiedMonthlyDeposits: { month: string; amountCents: Cents }[];
	/** Leave out to use the rules in force on the opening date. */
	rulesVersion?: string;
	/** Optional: to compare the savings with the 5% and 10% targets. */
	homePriceCents?: Cents | null;
	/** Optional: the ASP balance now. null = use the sum of the verified deposits. */
	currentBalanceCents?: Cents | null;
	/** Optional what-if: deposit this much each month from now. */
	plannedMonthlyCents?: Cents | null;
}

export type MonthReason = 'qualifies' | 'below_minimum' | 'above_maximum' | 'before_opening' | 'after_today';

export interface AspMonth {
	month: string;
	deposited: Money;
	qualifies: boolean;
	reason: MonthReason;
}

export interface AspResult {
	status: 'ok' | 'unknown' | 'legacy' | 'blocked';
	message: string;
	asOf: string;
	openedOn: string | null;
	rules: {
		version: string;
		effectiveFrom: string;
		source: string;
		sourceUpdated: string;
		minMonthlyDeposit: Money;
		maxMonthlyDeposit: Money;
		requiredMonths: number;
		interimMonths: number;
		interimSharePercent: number;
		depositSharePercent: number;
		consecutiveMonthsRequired: false;
	};
	progress?: {
		qualifyingMonths: number;
		requiredMonths: number;
		remainingMonths: number;
		interimMonthsMet: boolean;
		allMonthsMet: boolean;
		verifiedTotal: Money;
		months: AspMonth[];
	};
	savings?: {
		balance: Money;
		balanceSource: 'user' | 'verified_deposits';
		homePrice: Money;
		interimTarget: Money;
		depositTarget: Money;
		remainingToInterim: Money;
		remainingToDeposit: Money;
	};
	projection?: {
		monthlyDeposit: Money;
		qualifies: boolean;
		reason: MonthReason;
		firstMonth: string;
		/** Month of the 10th qualifying deposit. */
		interimMonthsMonth: string | null;
		/** Month of the 20th qualifying deposit. */
		allMonthsMonth: string | null;
		/** Month when the balance reaches the 10% target. Needs homePrice. */
		depositTargetMonth: string | null;
		/** Month when both the 20 months and the 10% target are met. Needs homePrice. */
		readyMonth: string | null;
		summary: string;
	};
	assumptions: string[];
	warnings: string[];
	notes: string[];
	method: { calcVersion: string };
}

function judge(cents: Cents, rules: AspRules): MonthReason {
	if (cents < rules.minMonthlyCents) return 'below_minimum';
	if (cents > rules.maxMonthlyCents) return 'above_maximum';
	return 'qualifies';
}

function monthName(key: string): string {
	const [y, m] = key.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const share = (cents: Cents, percent: number) => Math.ceil((cents * percent) / 100);

export function evaluateAspProgress(input: AspInput): AspResult {
	const { asOf } = input;
	const nowMonth = monthKey(asOf);
	const assumptions: string[] = [
		'Only deposits that the user or the bank has verified are counted. Saving transfers in the transaction data are not treated as ASP deposits.',
		'Interest (1% a year from the ASP bank) and bonus interest are not included.',
	];
	const warnings: string[] = [];
	const notes: string[] = [];

	const requested = input.rulesVersion ? ASP_RULES[input.rulesVersion] : undefined;
	if (input.rulesVersion && !requested) throw new Error(`Unknown ASP rules version "${input.rulesVersion}".`);
	// The rules in force on the opening date apply to the account. Before the first
	// monthly rules, the account is on transition rules (legacy).
	const accountRules = requested ?? rulesInForce(input.openedOn ?? asOf);
	const rules = accountRules ?? rulesInForce(asOf) ?? ASP_RULES[ASP_RULE_VERSIONS[0]];

	const base = {
		asOf,
		openedOn: input.openedOn,
		rules: {
			version: rules.version,
			effectiveFrom: rules.effectiveFrom,
			source: rules.source,
			sourceUpdated: rules.sourceUpdated,
			minMonthlyDeposit: money(rules.minMonthlyCents),
			maxMonthlyDeposit: money(rules.maxMonthlyCents),
			requiredMonths: rules.requiredMonths,
			interimMonths: rules.interimMonths,
			interimSharePercent: rules.interimSharePercent,
			depositSharePercent: rules.depositSharePercent,
			consecutiveMonthsRequired: false as const,
		},
		assumptions,
		warnings,
		notes,
		method: { calcVersion: ASP_CALC_VERSION },
	};
	const ruleText = `You need ${rules.requiredMonths} qualifying months with ${money(rules.minMonthlyCents).display} to ${money(rules.maxMonthlyCents).display} deposited in each month. The months do not need to be in a row, and a skipped month does not remove earlier months. For the ASP loan, your savings must also be ${rules.depositSharePercent}% of the purchase price.`;

	if (!input.openedOn) {
		return {
			...base,
			status: 'unknown',
			message: `Give the ASP opening date and the verified deposit for each month to count qualifying months. ${ruleText}`,
		};
	}
	if (input.openedOn > asOf) {
		return { ...base, status: 'blocked', message: `The opening date ${input.openedOn} is after today (${asOf}). Check the date.` };
	}
	if (!accountRules || input.openedOn < rules.effectiveFrom) {
		return {
			...base,
			status: 'legacy',
			message: `This account was opened before ${rules.effectiveFrom}, so transition rules apply. Under the old rules, deposits are counted in quarters (EUR 150 to EUR 4,500 each, at least 8 quarters). The account can stay quarterly, change to monthly or mix both, and one quarter equals three monthly deposits. Koti cannot give an exact count for a mixed history. Ask your bank to confirm your progress.`,
		};
	}

	// Add up the verified deposits by month.
	const openMonth = monthKey(input.openedOn);
	const totals = new Map<string, Cents>();
	for (const d of input.verifiedMonthlyDeposits) {
		if (d.amountCents < 0) throw new Error('A deposit amount cannot be negative.');
		totals.set(d.month, (totals.get(d.month) ?? 0) + d.amountCents);
	}
	const months: AspMonth[] = [...totals.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([month, cents]) => {
			const reason: MonthReason = month < openMonth ? 'before_opening' : month > nowMonth ? 'after_today' : judge(cents, rules);
			return { month, deposited: money(cents), qualifies: reason === 'qualifies', reason };
		});

	const counted = months.filter((m) => m.reason !== 'before_opening' && m.reason !== 'after_today');
	const verifiedTotalCents = counted.reduce((s, m) => s + m.deposited.cents, 0);
	const qualifying = months.filter((m) => m.qualifies).length;
	const remainingMonths = Math.max(0, rules.requiredMonths - qualifying);

	for (const m of months) {
		if (m.reason === 'before_opening') notes.push(`${monthName(m.month)} is before the account opened, so it is not counted.`);
		if (m.reason === 'after_today') notes.push(`${monthName(m.month)} is after today, so it is not counted.`);
		if (m.reason === 'below_minimum') notes.push(`${monthName(m.month)} (${m.deposited.display}) is below the ${money(rules.minMonthlyCents).display} minimum, so it does not qualify.`);
		if (m.reason === 'above_maximum') warnings.push(`${monthName(m.month)} (${m.deposited.display}) is above the ${money(rules.maxMonthlyCents).display} maximum. Koti does not count it. Ask your bank how it treats this month.`);
	}
	if (!months.some((m) => m.month === openMonth && m.qualifies)) {
		warnings.push(`The rules need a first deposit of ${money(rules.minMonthlyCents).display} to ${money(rules.maxMonthlyCents).display} when the account opens. No qualifying deposit is given for ${monthName(openMonth)}.`);
	}
	if (!totals.has(nowMonth)) notes.push(`${monthName(nowMonth)} is still open. A deposit this month can still qualify.`);

	const progress = {
		qualifyingMonths: qualifying,
		requiredMonths: rules.requiredMonths,
		remainingMonths,
		interimMonthsMet: qualifying >= rules.interimMonths,
		allMonthsMet: remainingMonths === 0,
		verifiedTotal: money(verifiedTotalCents),
		months,
	};

	// Savings compared with the 5% and 10% targets.
	const balanceCents = input.currentBalanceCents ?? verifiedTotalCents;
	const balanceSource = input.currentBalanceCents != null ? 'user' as const : 'verified_deposits' as const;
	let savings: AspResult['savings'];
	if (input.homePriceCents) {
		const interimTarget = share(input.homePriceCents, rules.interimSharePercent);
		const depositTarget = share(input.homePriceCents, rules.depositSharePercent);
		savings = {
			balance: money(balanceCents),
			balanceSource,
			homePrice: money(input.homePriceCents),
			interimTarget: money(interimTarget),
			depositTarget: money(depositTarget),
			remainingToInterim: money(Math.max(0, interimTarget - balanceCents)),
			remainingToDeposit: money(Math.max(0, depositTarget - balanceCents)),
		};
		if (balanceSource === 'verified_deposits') assumptions.push('The ASP balance is the sum of the verified deposits, without interest.');
		assumptions.push('Other assets in your own bank accounts can also count towards the 10%. They are not included here.');
	}

	// What-if: the same deposit every month from now.
	let projection: AspResult['projection'];
	if (input.plannedMonthlyCents != null) {
		const planned = input.plannedMonthlyCents;
		const reason = judge(planned, rules);
		const firstMonth = totals.has(nowMonth) ? shiftMonth(nowMonth, 1) : nowMonth;
		let count = qualifying;
		let balance = balanceCents;
		let interimMonthsMonth: string | null = progress.interimMonthsMet ? nowMonth : null;
		let allMonthsMonth: string | null = progress.allMonthsMet ? nowMonth : null;
		const depositTarget = savings?.depositTarget.cents ?? null;
		let depositTargetMonth: string | null = depositTarget != null && balance >= depositTarget ? nowMonth : null;
		for (let i = 0; i < MAX_MONTHS; i++) {
			const month = shiftMonth(firstMonth, i);
			balance += planned;
			if (reason === 'qualifies') count += 1;
			if (!interimMonthsMonth && count >= rules.interimMonths) interimMonthsMonth = month;
			if (!allMonthsMonth && count >= rules.requiredMonths) allMonthsMonth = month;
			if (depositTarget != null && !depositTargetMonth && balance >= depositTarget) depositTargetMonth = month;
			if (allMonthsMonth && (depositTarget == null || depositTargetMonth)) break;
			if (planned <= 0 && reason !== 'qualifies') break;
		}
		const readyMonth = depositTarget != null && allMonthsMonth && depositTargetMonth
			? (allMonthsMonth > depositTargetMonth ? allMonthsMonth : depositTargetMonth)
			: null;
		let summary: string;
		if (reason !== 'qualifies') {
			summary = `A deposit of ${money(planned).display} a month does not qualify: each month needs ${money(rules.minMonthlyCents).display} to ${money(rules.maxMonthlyCents).display}. You keep the ${qualifying} qualifying month${qualifying === 1 ? '' : 's'} you already have.`;
		} else {
			summary = allMonthsMonth
				? `With ${money(planned).display} each month from ${monthName(firstMonth)}, your ${rules.requiredMonths}th qualifying month is ${monthName(allMonthsMonth)}.`
				: `With ${money(planned).display} each month, you do not reach ${rules.requiredMonths} qualifying months within ${MAX_MONTHS / 12} years.`;
			if (depositTarget != null) {
				summary += depositTargetMonth
					? ` Your ASP savings reach ${rules.depositSharePercent}% of the price (${money(depositTarget).display}) in ${monthName(depositTargetMonth)}.`
					: ` Your ASP savings do not reach ${rules.depositSharePercent}% of the price within ${MAX_MONTHS / 12} years.`;
				if (readyMonth) summary += ` Both conditions are met in ${monthName(readyMonth)}.`;
			}
		}
		projection = {
			monthlyDeposit: money(planned),
			qualifies: reason === 'qualifies',
			reason,
			firstMonth,
			interimMonthsMonth,
			allMonthsMonth,
			depositTargetMonth,
			readyMonth,
			summary,
		};
		assumptions.push('The projection assumes the same deposit in every month and no skipped months. It is an estimate, not a promise.');
	}

	assumptions.push('Meeting the ASP conditions is not a mortgage approval. Purchase costs are not included.');

	const message = `You have ${qualifying} of ${rules.requiredMonths} qualifying months${remainingMonths ? `, so ${remainingMonths} remain` : ', so the deposit-month condition is met'}. ${ruleText}`;
	return { ...base, status: 'ok', message, progress, savings, projection };
}
