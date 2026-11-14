// Goal projection: "When is my home deposit ready?"
//
// Simple, deterministic month-by-month arithmetic. This is not a Monte Carlo
// forecast: it answers "how long", not "is it safe this month" (use the
// cashflow forecast for that).
//
// - Saving goes in at the end of each month, from the month of asOf.
// - The default monthly saving is the median of the existing saving transfers
//   in the last 6 months. The data does not show where those transfers go.
// - Spending and income changes use the same history numbers as the forecast.
// - Optional interest is added monthly, before that month's saving.

import type { SpendingCategory } from './catalog.ts';
import { MCC_LABELS } from './catalog.ts';
import { addDays, dateInMonth, daysBetween, daysInMonth, monthKey, shiftMonth } from './dates.ts';
import { monthlySpend, monthlyStats, RECENT_MONTHS, type HistoryRow } from './history.ts';
import { money, type Cents, type Money } from './money.ts';

export const GOAL_CALC_VERSION = 'koti-goal-1';
const MAX_MONTHS = 600; // 50 years

export type GoalChange =
	| { type: 'changeSpending'; category: SpendingCategory; mcc?: string; percentChange: number }
	/** Scale salary: give percentChange or newMonthlyCents. toGoalPercent of the extra goes to the goal. */
	| { type: 'changeIncome'; percentChange?: number; newMonthlyCents?: Cents; toGoalPercent?: number }
	| { type: 'addMonthlySaving'; amountCents: Cents }
	| { type: 'oneOffDeposit'; label: string; amountCents: Cents; date: string };

export interface GoalInput {
	customerId: string;
	asOf: string;
	rows: HistoryRow[];
	goalCents: Cents;
	/** Money already saved for the goal. null = not known (uses 0 and says so). */
	currentSavingsCents: Cents | null;
	/** Monthly saving now. null = use the median of the existing saving transfers. */
	monthlySavingCents: Cents | null;
	annualInterestPercent?: number;
	changes?: GoalChange[];
}

export interface GoalOutlook {
	monthlySaving: Money;
	monthsToGoal: number | null;
	readyDate: string | null;
	reached: boolean;
	savedByReadyDate: Money | null;
}

export interface GoalEffect {
	change: string;
	monthlyEffect: Money;
	detail: string;
}

export interface GoalResult {
	status: 'ok' | 'low_confidence' | 'blocked';
	blockedReason?: string;
	customerId: string;
	asOf: string;
	goal: Money;
	currentSavings: Money & { source: 'user' | 'not_set' };
	monthlySavingSource: 'user' | 'existing_transfers';
	remaining: Money;
	baseline: GoalOutlook;
	scenario?: GoalOutlook;
	difference?: {
		monthlySaving: Money;
		months: number | null;
		days: number | null;
		summary: string;
		effects: GoalEffect[];
	};
	history: {
		monthsUsed: number;
		medianSalary: Money;
		medianSavingTransfers: Money;
		medianSurplusBeforeSaving: Money;
		months: { month: string; salary: Money; savingTransfers: Money; surplusBeforeSaving: Money }[];
	};
	assumptions: string[];
	warnings: string[];
	method: { calcVersion: string; annualInterestPercent: number; maxMonths: number };
}

function project(
	asOf: string, startCents: Cents, goalCents: Cents, monthlyCents: Cents,
	annualInterestPercent: number, oneOffs: { date: string; amountCents: Cents }[],
): GoalOutlook {
	const outlook = (months: number | null, readyDate: string | null, saved: number | null): GoalOutlook => ({
		monthlySaving: money(monthlyCents),
		monthsToGoal: months,
		readyDate,
		reached: readyDate !== null,
		savedByReadyDate: saved === null ? null : money(saved),
	});
	if (startCents >= goalCents) return outlook(0, asOf, startCents);
	const rate = Math.pow(1 + annualInterestPercent / 100, 1 / 12) - 1;
	const start = monthKey(asOf);
	let balance = startCents;
	for (let m = 0; m < MAX_MONTHS; m++) {
		const key = shiftMonth(start, m);
		const [y, mo] = key.split('-').map(Number);
		const monthEnd = dateInMonth(key, daysInMonth(y, mo));
		balance = Math.round(balance * (1 + rate));
		balance += monthlyCents;
		for (const deposit of oneOffs) if (monthKey(deposit.date) === key) balance += deposit.amountCents;
		if (balance >= goalCents) return outlook(m + 1, monthEnd, balance);
		if (monthlyCents <= 0 && rate <= 0 && !oneOffs.some((d) => monthKey(d.date) > key)) break; // can never get there
	}
	return outlook(null, null, null);
}

function describeDifference(days: number | null, base: GoalOutlook, scen: GoalOutlook): string {
	if (!scen.reached && !base.reached) return 'The goal is not reached in either case.';
	if (!base.reached) return `The change makes the goal reachable: ready about ${scen.readyDate}.`;
	if (!scen.reached) return 'With this change the goal is not reached.';
	if (days === 0) return 'No change to the ready date.';
	const weeks = Math.round(Math.abs(days!) / 7);
	const months = Math.round(Math.abs(days!) / 30.44);
	const size = Math.abs(days!) < 60 ? `about ${weeks} week${weeks === 1 ? '' : 's'}` : `about ${months} month${months === 1 ? '' : 's'}`;
	return `Ready ${size} ${days! < 0 ? 'sooner' : 'later'} (${scen.readyDate} instead of ${base.readyDate}).`;
}

export function projectGoal(input: GoalInput): GoalResult {
	const { asOf, customerId, goalCents } = input;
	const changes = input.changes ?? [];
	const interest = input.annualInterestPercent ?? 0;
	const rows = input.rows.filter((row) => row.date < asOf);
	if (rows.length !== input.rows.length) {
		throw new Error('Rows on or after asOf were given to the goal projection. Future data must not enter it.');
	}
	const assumptions: string[] = [];
	const warnings: string[] = [];

	for (const change of changes) {
		if (change.type === 'oneOffDeposit' && (change.date < asOf || change.date > addDays(asOf, 365 * 50))) {
			throw new Error(`oneOffDeposit date ${change.date} must be between ${asOf} and 50 years later.`);
		}
		if (change.type === 'changeIncome' && (change.percentChange == null) === (change.newMonthlyCents == null)) {
			throw new Error('changeIncome needs exactly one of percentChange or newMonthlyEur.');
		}
	}

	// Reject overlapping cuts rather than allocate the same spending twice.
	const cuts = changes.filter((c): c is Extract<GoalChange, { type: 'changeSpending' }> => c.type === 'changeSpending');
	for (let i = 0; i < cuts.length; i++) {
		for (const other of cuts.slice(i + 1)) {
			if (cuts[i].category === other.category && (!cuts[i].mcc || !other.mcc || cuts[i].mcc === other.mcc)) {
				throw new Error('Spending changes must not overlap. Use one change per category, or distinct MCCs within it.');
			}
		}
	}
	if (changes.filter((c) => c.type === 'changeIncome').length > 1) {
		throw new Error('Give only one changeIncome change.');
	}

	const stats = monthlyStats(rows, asOf, RECENT_MONTHS);
	const history = {
		monthsUsed: stats.months.length,
		medianSalary: money(stats.medianSalaryCents),
		medianSavingTransfers: money(stats.medianSavingTransfersCents),
		medianSurplusBeforeSaving: money(stats.medianSurplusBeforeSavingCents),
		months: stats.months.map((m) => ({
			month: m.month,
			salary: money(m.salaryCents),
			savingTransfers: money(m.savingTransfersCents),
			surplusBeforeSaving: money(m.surplusBeforeSavingCents),
		})),
	};

	const currentCents = input.currentSavingsCents ?? 0;
	const currentSource = input.currentSavingsCents == null ? 'not_set' : 'user';
	if (currentSource === 'not_set') {
		warnings.push('Current home savings are not known, so the projection starts from EUR 0. Ask the user how much they have saved.');
	}
	const savingSource = input.monthlySavingCents == null ? 'existing_transfers' : 'user';
	const baseMonthly = input.monthlySavingCents ?? stats.medianSavingTransfersCents;
	if (savingSource === 'existing_transfers') {
		assumptions.push(`Monthly saving = the median of the existing saving transfers in the last ${stats.months.length} months (${money(baseMonthly).display}). The data does not show if they go to the home goal.`);
	}
	assumptions.push('Saving goes in at the end of each month, starting this month.');
	assumptions.push(interest > 0 ? `Interest of ${interest}% a year is added monthly.` : 'No interest or ASP bonus is included.');
	assumptions.push('Purchase costs (transfer tax, fees) and mortgage approval are not included.');
	assumptions.push('All results are estimates, not money the customer has now.');

	const base: GoalResult = {
		status: 'ok',
		customerId,
		asOf,
		goal: money(goalCents),
		currentSavings: { ...money(currentCents), source: currentSource },
		monthlySavingSource: savingSource,
		remaining: money(Math.max(0, goalCents - currentCents)),
		baseline: project(asOf, currentCents, goalCents, baseMonthly, interest, []),
		history,
		assumptions,
		warnings,
		method: { calcVersion: GOAL_CALC_VERSION, annualInterestPercent: interest, maxMonths: MAX_MONTHS },
	};

	if (!rows.length && savingSource === 'existing_transfers') {
		return { ...base, status: 'blocked', blockedReason: 'There is no history for this customer. Give monthlySavingEur.' };
	}
	if (baseMonthly <= 0 && savingSource === 'existing_transfers' && !changes.length) {
		return { ...base, status: 'blocked', blockedReason: 'No regular saving transfers were found. Ask the user how much they can save each month.' };
	}

	// Scenario.
	const effects: GoalEffect[] = [];
	let extraMonthly = 0;
	const oneOffs: { date: string; amountCents: Cents }[] = [];
	for (const change of changes) {
		if (change.type === 'changeSpending') {
			const spend = monthlySpend(rows, asOf, { category: change.category, mcc: change.mcc });
			const effect = Math.round((-spend.monthlyCents * change.percentChange) / 100);
			extraMonthly += effect;
			const what = change.mcc ? `${change.category} / ${MCC_LABELS[change.mcc] ?? change.mcc}` : change.category;
			effects.push({
				change: `${what} ${change.percentChange > 0 ? '+' : ''}${change.percentChange}%`,
				monthlyEffect: money(effect),
				detail: `Average spend ${money(spend.monthlyCents).display} a month over the last ${spend.weeks} weeks.`,
			});
		} else if (change.type === 'changeIncome') {
			const salary = stats.medianSalaryCents;
			if (salary <= 0) throw new Error('changeIncome needs salary in the history, and none was found.');
			const newSalary = change.newMonthlyCents ?? Math.round(salary * (1 + change.percentChange! / 100));
			const share = (change.toGoalPercent ?? 100) / 100;
			const effect = Math.round((newSalary - salary) * share);
			extraMonthly += effect;
			effects.push({
				change: `Salary ${money(salary).display} -> ${money(newSalary).display} a month`,
				monthlyEffect: money(effect),
				detail: `${Math.round(share * 100)}% of the difference goes to the goal. Salary changes are a what-if.`,
			});
		} else if (change.type === 'addMonthlySaving') {
			extraMonthly += change.amountCents;
			effects.push({ change: 'Change in monthly saving', monthlyEffect: money(change.amountCents), detail: 'Given by the user.' });
		} else {
			oneOffs.push({ date: change.date, amountCents: change.amountCents });
			effects.push({ change: `One-off: ${change.label} on ${change.date}`, monthlyEffect: money(0), detail: `${money(change.amountCents).display} once.` });
		}
	}

	if (stats.months.length && baseMonthly > stats.medianSurplusBeforeSavingCents) {
		warnings.push(`The baseline saves ${money(baseMonthly).display} a month, more than the usual monthly surplus before saving (${history.medianSurplusBeforeSaving.display}). It may not be realistic. Check this month with forecast_cashflow.`);
	}

	if (!changes.length) {
		if (!base.baseline.reached) warnings.push('At this saving rate the goal is not reached within 50 years.');
		return currentSource === 'not_set' ? { ...base, status: 'low_confidence' } : base;
	}

	const scenarioMonthly = baseMonthly + extraMonthly;
	const scenario = project(asOf, currentCents, goalCents, scenarioMonthly, interest, oneOffs);
	const days = scenario.readyDate && base.baseline.readyDate ? daysBetween(base.baseline.readyDate, scenario.readyDate) : null;
	const months = scenario.monthsToGoal != null && base.baseline.monthsToGoal != null
		? scenario.monthsToGoal - base.baseline.monthsToGoal : null;

	// Protect everyday life: warn when the plan saves more than the usual surplus.
	if (stats.months.length && scenarioMonthly > stats.medianSurplusBeforeSavingCents) {
		warnings.push(`This plan saves ${money(scenarioMonthly).display} a month, more than the usual monthly surplus before saving (${history.medianSurplusBeforeSaving.display}). It may not be realistic. Check this month with forecast_cashflow.`);
	}
	if (!scenario.reached) warnings.push('With this change the goal is not reached within 50 years.');

	return {
		...base,
		status: currentSource === 'not_set' ? 'low_confidence' : 'ok',
		scenario,
		difference: {
			monthlySaving: money(extraMonthly),
			months,
			days,
			summary: describeDifference(days, base.baseline, scenario),
			effects,
		},
	};
}
