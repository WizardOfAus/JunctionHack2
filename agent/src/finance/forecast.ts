// Monte Carlo cashflow forecast (block bootstrap).
//
// 1. Split history into KNOWN items (salary, rent, bills, saving transfers that
//    repeat each month) and FLEXIBLE spending (everyday purchases).
// 2. Put known items on their expected future dates. They are the same in every run.
// 3. For flexible spending, build a library of past 7-day blocks. Each run picks
//    random past weeks (with replacement), so weekday patterns stay together.
// 4. Each run walks the balance day by day and records its lowest point.
// 5. Over 10,000 runs: risk = share of runs below the floor; the safe amount
//    to set aside = max(0, P10 of the lowest balances - floor).
//
// Baseline and scenario use the same random picks (common random numbers), so
// a difference between them comes from the change, not from chance.
// This module is pure: no I/O, no clock, no global random numbers.

import type { TxRow } from '../data/store.ts';
import { groupOf, MCC_LABELS, type SpendingCategory, type TxGroup } from './catalog.ts';
import { addDays, dateInMonth, daysBetween, monthKey, shiftMonth } from './dates.ts';
import { median, RECENT_MONTHS, WEEKS_PER_MONTH } from './history.ts';
import { money, type Cents, type Money } from './money.ts';
import { hashSeed, mulberry32 } from './rng.ts';

export const CALC_VERSION = 'koti-mc-forecast-1';

// One source row. Defined once, in the data store; re-exported here for engine users.
export type { TxRow };

export type ForecastChange =
	| { type: 'changeSpending'; category: SpendingCategory; mcc?: string; percentChange: number }
	| { type: 'addExpense'; label: string; amountCents: Cents; date: string }
	| { type: 'moveToSavings'; amountCents: Cents; date: string }
	| { type: 'delayIncome'; days: number }
	/** Scale repeating income: give percentChange (+5 = 5% more) or newMonthlyCents, not both. */
	| { type: 'changeIncome'; percentChange?: number; newMonthlyCents?: Cents }
	| { type: 'addIncome'; label: string; amountCents: Cents; date: string };

export interface ForecastInput {
	customerId: string;
	/** First forecast day. All rows must be before this date. */
	asOf: string;
	/** Rows for this customer before asOf, in source order. */
	rows: TxRow[];
	/** Protected emergency floor. null = not known yet (the engine uses 0 and says so). */
	floorCents: Cents | null;
	changes?: ForecastChange[];
	horizonDays?: number;
	historyWeeks?: number;
	runs?: number;
	/** Percentile of the lowest balance used for the safe amount (10 = P10). */
	percentile?: number;
}

export interface Outlook {
	breachRisk: number;
	lowestBalanceP10: Money;
	lowestBalanceP50: Money;
	lowestBalanceDate: string;
	endBalanceP50: Money;
	safeToSetAside: Money;
}

export interface KnownItem {
	date: string;
	label: string;
	group: TxGroup;
	amount: Money;
	basedOnMonths: number;
	dayRange: string;
	rowRefs: string[];
}

export interface SpendingChangeEffect {
	category: string;
	mcc?: string;
	mccLabel?: string;
	percentChange: number;
	baselineMonthlySpend: Money;
	monthlySpendChange: Money;
}

export interface ForecastResult {
	status: 'ok' | 'low_confidence' | 'blocked';
	blockedReason?: string;
	customerId: string;
	period: { from: string; to: string; days: number };
	startBalance: Money;
	floor: Money & { source: 'user' | 'not_set' };
	baseline: Outlook;
	scenario?: Outlook;
	difference?: {
		safeToSetAside: Money;
		breachRiskPoints: number;
		lowestBalanceP10: Money;
		spendingChanges: SpendingChangeEffect[];
		incomeChange?: { baselineMonthlyIncome: Money; scenarioMonthlyIncome: Money; monthlyChange: Money };
	};
	knownItems: KnownItem[];
	assumptions: string[];
	warnings: string[];
	evidence: {
		historyWindow: { from: string; to: string; weeks: number };
		spendingRowsSampled: number;
		lastTransactionDate: string | null;
	};
	method: {
		calcVersion: string;
		runs: number;
		seed: string;
		percentile: number;
		horizonDays: number;
		historyWeeks: number;
	};
}

const LABELS: Record<string, string> = {
	salary: 'Salary',
	housing_payment: 'Housing payment',
	utilities_payment: 'Utilities',
	investment_deposit: 'Existing saving transfer',
	salary_sweep: 'Transfer to own other account',
};

const RECURRING_GROUPS: ReadonlySet<TxGroup> = new Set(['income', 'commitment', 'saving', 'transfer_out']);
const LOOKBACK_MONTHS = RECENT_MONTHS;
const MIN_MONTHS_FOR_RECURRING = 4;
const MIN_WEEKS_BLOCKED = 4;
const MIN_WEEKS_CONFIDENT = 8;
const STALE_DAYS = 14;

function percentileOf(sorted: Float64Array, p: number): number {
	const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
	return sorted[rank];
}

interface Slot {
	type: string;
	group: TxGroup;
	index: number;
	day: number;
	amountCents: Cents;
	months: number;
	minDay: number;
	maxDay: number;
	rowRefs: string[];
}

/**
 * Find items that repeat each month. For each type, the i-th payment of each
 * month forms slot i (for example, utilities come about 3 times a month). A slot
 * counts as recurring when it appears in at least 4 of the last 6 months.
 */
function findRecurringSlots(rows: TxRow[], asOf: string): { slots: Slot[]; oneOff: TxRow[] } {
	const asOfMonth = monthKey(asOf);
	const months = Array.from({ length: LOOKBACK_MONTHS }, (_, i) => shiftMonth(asOfMonth, i - LOOKBACK_MONTHS));
	const byType = new Map<string, Map<string, TxRow[]>>();
	for (const row of rows) {
		const group = groupOf(row.type);
		if (!group || !RECURRING_GROUPS.has(group)) continue;
		const key = monthKey(row.date);
		if (!months.includes(key)) continue;
		let perMonth = byType.get(row.type);
		if (!perMonth) byType.set(row.type, (perMonth = new Map()));
		const list = perMonth.get(key) ?? [];
		list.push(row);
		perMonth.set(key, list);
	}

	const slots: Slot[] = [];
	const oneOff: TxRow[] = [];
	for (const [type, perMonth] of byType) {
		const group = groupOf(type)!;
		const counts = [...perMonth.values()].map((list) => list.length);
		const slotCount = perMonth.size >= MIN_MONTHS_FOR_RECURRING ? median(counts) : 0;
		for (const list of perMonth.values()) {
			list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));
			// Payments after the usual count in a month are extra, not recurring.
			for (const extra of list.slice(slotCount)) oneOff.push(extra);
		}
		for (let index = 0; index < slotCount; index++) {
			const hits = [...perMonth.values()].map((list) => list[index]).filter((row): row is TxRow => !!row);
			if (hits.length < MIN_MONTHS_FOR_RECURRING) {
				oneOff.push(...hits);
				continue;
			}
			const days = hits.map((row) => Number(row.date.slice(8, 10)));
			slots.push({
				type,
				group,
				index,
				day: median(days),
				amountCents: median(hits.map((row) => row.amountCents)),
				months: hits.length,
				minDay: Math.min(...days),
				maxDay: Math.max(...days),
				rowRefs: hits.map((row) => `row:${row.seq}`),
			});
		}
	}
	slots.sort((a, b) => a.day - b.day || a.type.localeCompare(b.type));
	return { slots, oneOff };
}

/** Put recurring slots on dates inside the forecast window. */
function projectSlots(slots: Slot[], rows: TxRow[], asOf: string, horizonDays: number, delayIncomeDays = 0) {
	const end = addDays(asOf, horizonDays - 1);
	const asOfMonth = monthKey(asOf);
	// Payments of each type that already happened in the asOf month (before asOf).
	const doneThisMonth = new Map<string, number>();
	for (const row of rows) {
		if (monthKey(row.date) === asOfMonth) doneThisMonth.set(row.type, (doneThisMonth.get(row.type) ?? 0) + 1);
	}
	const items: { date: string; slot: Slot }[] = [];
	for (let m = 0; m <= Math.ceil(horizonDays / 28) + 1; m++) {
		const key = shiftMonth(asOfMonth, m);
		for (const slot of slots) {
			if (m === 0 && slot.index < (doneThisMonth.get(slot.type) ?? 0)) continue;
			let date = dateInMonth(key, slot.day);
			if (slot.group === 'income' && delayIncomeDays > 0) date = addDays(date, delayIncomeDays);
			if (date >= asOf && date <= end) items.push({ date, slot });
		}
	}
	items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
	return items;
}

interface BlockItem {
	category: string;
	mcc: string | null;
	cents: Cents; // spend, positive
}

function matches(item: BlockItem, change: Extract<ForecastChange, { type: 'changeSpending' }>) {
	return item.category === change.category && (!change.mcc || item.mcc === change.mcc);
}

export function forecastCashflow(input: ForecastInput): ForecastResult {
	const horizonDays = input.horizonDays ?? 35;
	const maxWeeks = input.historyWeeks ?? 26;
	const runs = input.runs ?? 10_000;
	const percentile = input.percentile ?? 10;
	const changes = input.changes ?? [];
	const { asOf, customerId } = input;
	const end = addDays(asOf, horizonDays - 1);
	const assumptions: string[] = [];
	const warnings: string[] = [];

	for (const change of changes) {
		if ('date' in change && (change.date < asOf || change.date > end)) {
			throw new Error(`Change date ${change.date} is outside the forecast period ${asOf} to ${end}.`);
		}
		if (change.type === 'changeIncome' && (change.percentChange == null) === (change.newMonthlyCents == null)) {
			throw new Error('changeIncome needs exactly one of percentChange or newMonthlyEur.');
		}
	}
	if (changes.filter((c) => c.type === 'changeIncome').length > 1) {
		throw new Error('Give only one changeIncome change.');
	}

	const rows = input.rows.filter((row) => row.date < asOf);
	if (rows.length !== input.rows.length) {
		throw new Error('Rows on or after asOf were given to the forecast. Future data must not enter the forecast.');
	}

	// Start balance: the last balance of each account before asOf.
	const lastByAccount = new Map<string, TxRow>();
	for (const row of rows) lastByAccount.set(row.accountId, row);
	const startCents = [...lastByAccount.values()].reduce((sum, row) => sum + row.balanceAfterCents, 0);
	const lastDate = rows.length ? rows[rows.length - 1].date : null;
	if (lastByAccount.size > 1) {
		warnings.push(`${lastByAccount.size} accounts are added together. Restricted savings accounts are not yet separated.`);
	}

	const floorCents = input.floorCents ?? 0;
	const floorSource = input.floorCents == null ? 'not_set' : 'user';
	if (floorSource === 'not_set') {
		warnings.push('No emergency floor is set. The forecast uses EUR 0, so it only protects against overdraft. Ask the user for their emergency reserve.');
	}

	// History window for flexible spending: whole 7-day blocks that end the day before asOf.
	const firstDate = rows.length ? rows[0].date : asOf;
	const weeks = Math.min(maxWeeks, Math.floor(daysBetween(firstDate, asOf) / 7));
	const historyFrom = addDays(asOf, -7 * weeks);

	const { slots, oneOff } = findRecurringSlots(rows, asOf);
	const oneOffSeqs = new Set(oneOff.map((row) => row.seq));

	// Blocks: blocks[b][j] = spending items on day j of past week b. Week b starts at
	// historyFrom + 7b, so day j of every block has the same weekday as asOf + j.
	const blocks: BlockItem[][][] = Array.from({ length: weeks }, () => Array.from({ length: 7 }, () => []));
	let sampledRows = 0;
	const unknownTypes = new Set<string>();
	for (const row of rows) {
		if (row.date < historyFrom) continue;
		const group = groupOf(row.type);
		if (!group) {
			unknownTypes.add(row.type);
			continue;
		}
		// Spending, plus bills that do not repeat on a schedule (they are still a real risk).
		const isFlexible = group === 'spending' || (group === 'commitment' && oneOffSeqs.has(row.seq));
		if (!isFlexible || row.amountCents >= 0) continue;
		const offset = daysBetween(historyFrom, row.date);
		const day = blocks[Math.floor(offset / 7)][offset % 7];
		const existing = day.find((item) => item.category === row.category && item.mcc === row.mcc);
		if (existing) existing.cents -= row.amountCents;
		else day.push({ category: row.category, mcc: row.mcc, cents: -row.amountCents });
		sampledRows++;
	}
	if (unknownTypes.size) {
		warnings.push(`Unknown transaction types were left out: ${[...unknownTypes].join(', ')}.`);
	}

	const period = { from: asOf, to: end, days: horizonDays };
	const seedText = `${customerId}|${asOf}|${CALC_VERSION}|${horizonDays}|${weeks}`;
	const seed = hashSeed(seedText);
	const method = {
		calcVersion: CALC_VERSION,
		runs,
		seed: seed.toString(16).padStart(8, '0'),
		percentile,
		horizonDays,
		historyWeeks: weeks,
	};
	const evidence = {
		historyWindow: { from: historyFrom, to: addDays(asOf, -1), weeks },
		spendingRowsSampled: sampledRows,
		lastTransactionDate: lastDate,
	};

	let blockedReason: string | undefined;
	if (!rows.length) blockedReason = 'There are no transactions for this customer before the forecast date.';
	else if (weeks < MIN_WEEKS_BLOCKED) blockedReason = `Only ${weeks} full weeks of history. At least ${MIN_WEEKS_BLOCKED} are needed.`;
	if (blockedReason) {
		const empty: Outlook = {
			breachRisk: 0,
			lowestBalanceP10: money(startCents),
			lowestBalanceP50: money(startCents),
			lowestBalanceDate: asOf,
			endBalanceP50: money(startCents),
			safeToSetAside: money(0),
		};
		return {
			status: 'blocked', blockedReason, customerId, period, startBalance: money(startCents),
			floor: { ...money(floorCents), source: floorSource }, baseline: empty, knownItems: [],
			assumptions, warnings, evidence, method,
		};
	}

	// Known cashflow per future day, for the baseline and the scenario.
	const delay = changes.find((c) => c.type === 'delayIncome')?.days ?? 0;
	const knownBase = new Float64Array(horizonDays);
	const knownScen = new Float64Array(horizonDays);
	const baseItems = projectSlots(slots, rows, asOf, horizonDays);
	for (const { date, slot } of baseItems) knownBase[daysBetween(asOf, date)] += slot.amountCents;

	// Income change: one factor for every repeating income item.
	const incomeChange = changes.find((c) => c.type === 'changeIncome');
	const monthlyIncomeCents = slots.filter((s) => s.group === 'income').reduce((sum, s) => sum + s.amountCents, 0);
	let incomeFactor = 1;
	if (incomeChange?.percentChange != null) incomeFactor = 1 + incomeChange.percentChange / 100;
	if (incomeChange?.newMonthlyCents != null) {
		if (monthlyIncomeCents <= 0) throw new Error('changeIncome needs repeating income, and none was found.');
		incomeFactor = incomeChange.newMonthlyCents / monthlyIncomeCents;
	}
	for (const { date, slot } of projectSlots(slots, rows, asOf, horizonDays, delay)) {
		const amount = slot.group === 'income' ? Math.round(slot.amountCents * incomeFactor) : slot.amountCents;
		knownScen[daysBetween(asOf, date)] += amount;
	}
	for (const change of changes) {
		if (change.type === 'addExpense' || change.type === 'moveToSavings') {
			knownScen[daysBetween(asOf, change.date)] -= change.amountCents;
		}
		if (change.type === 'addIncome') knownScen[daysBetween(asOf, change.date)] += change.amountCents;
	}
	if (incomeChange || changes.some((c) => c.type === 'addIncome')) {
		assumptions.push('Income changes are a what-if. They are not money the customer has received.');
	}

	const knownItems: KnownItem[] = baseItems.map(({ date, slot }) => ({
		date,
		label: LABELS[slot.type] ?? slot.type,
		group: slot.group,
		amount: money(slot.amountCents),
		basedOnMonths: slot.months,
		dayRange: slot.minDay === slot.maxDay ? `day ${slot.minDay}` : `days ${slot.minDay}-${slot.maxDay}`,
		rowRefs: slot.rowRefs,
	}));

	const incomeSlots = slots.filter((slot) => slot.group === 'income');
	if (!incomeSlots.length) warnings.push('No income repeats each month. The forecast assumes no income.');
	for (const slot of incomeSlots) {
		if (slot.maxDay - slot.minDay > 5) {
			warnings.push(`Salary date changes: in the last ${slot.months} months it came between day ${slot.minDay} and day ${slot.maxDay}. The forecast uses day ${slot.day}.`);
		}
	}
	assumptions.push(`Start balance ${money(startCents).display} at the end of ${addDays(asOf, -1)}.`);
	assumptions.push(`Repeating items are projected from the last ${LOOKBACK_MONTHS} months; each needs at least ${MIN_MONTHS_FOR_RECURRING} months.`);
	assumptions.push(`Everyday spending is sampled from ${weeks} past weeks (${historyFrom} to ${addDays(asOf, -1)}).`);
	assumptions.push('One-off income and investment withdrawals are not assumed to happen again.');
	assumptions.push('All results are estimates, not money the customer has now.');

	// Flexible spend per block-day, for the baseline and the scenario.
	const spendChanges = changes.filter((c): c is Extract<ForecastChange, { type: 'changeSpending' }> => c.type === 'changeSpending');
	const flexBase = new Float64Array(weeks * 7);
	const flexScen = new Float64Array(weeks * 7);
	const matchedTotals = spendChanges.map(() => 0);
	for (let b = 0; b < weeks; b++) {
		for (let j = 0; j < 7; j++) {
			let base = 0;
			let scen = 0;
			for (const item of blocks[b][j]) {
				base += item.cents;
				let factor = 1;
				spendChanges.forEach((change, i) => {
					if (matches(item, change)) {
						factor *= 1 + change.percentChange / 100;
						matchedTotals[i] += item.cents;
					}
				});
				scen += Math.round(item.cents * factor);
			}
			flexBase[b * 7 + j] = base;
			flexScen[b * 7 + j] = scen;
		}
	}
	const scenarioActive = changes.length > 0;

	// Simulation.
	const random = mulberry32(seed);
	const lowBase = new Float64Array(runs);
	const lowScen = new Float64Array(runs);
	const endBase = new Float64Array(runs);
	const endScen = new Float64Array(runs);
	const lowDayBase = new Uint16Array(runs);
	const lowDayScen = new Uint16Array(runs);
	const weeksAhead = Math.ceil(horizonDays / 7);
	for (let r = 0; r < runs; r++) {
		let balB = startCents;
		let balS = startCents;
		// Immediate saving capacity must include cash held before predicted income.
		let minB = startCents;
		let minS = startCents;
		let dayB = 0;
		let dayS = 0;
		for (let w = 0; w < weeksAhead; w++) {
			const block = Math.floor(random() * weeks) * 7;
			for (let j = 0; j < 7; j++) {
				const d = w * 7 + j;
				if (d >= horizonDays) break;
				balB += knownBase[d] - flexBase[block + j];
				balS += knownScen[d] - flexScen[block + j];
				if (balB < minB) { minB = balB; dayB = d; }
				if (balS < minS) { minS = balS; dayS = d; }
			}
		}
		lowBase[r] = minB;
		lowScen[r] = minS;
		endBase[r] = balB;
		endScen[r] = balS;
		lowDayBase[r] = dayB;
		lowDayScen[r] = dayS;
	}

	const summarise = (lows: Float64Array, ends: Float64Array, lowDays: Uint16Array): Outlook => {
		let breaches = 0;
		for (const low of lows) if (low < floorCents) breaches++;
		const dayCounts = new Map<number, number>();
		for (const d of lowDays) dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1);
		const commonDay = [...dayCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
		const sortedLows = Float64Array.from(lows).sort();
		const sortedEnds = Float64Array.from(ends).sort();
		const p = percentileOf(sortedLows, percentile);
		return {
			breachRisk: Math.round((breaches / runs) * 10_000) / 10_000,
			lowestBalanceP10: money(p),
			lowestBalanceP50: money(percentileOf(sortedLows, 50)),
			lowestBalanceDate: addDays(asOf, commonDay),
			endBalanceP50: money(percentileOf(sortedEnds, 50)),
			safeToSetAside: money(Math.max(0, p - floorCents)),
		};
	};

	const baseline = summarise(lowBase, endBase, lowDayBase);
	const scenario = scenarioActive ? summarise(lowScen, endScen, lowDayScen) : undefined;

	let status: ForecastResult['status'] = 'ok';
	if (floorSource === 'not_set' || weeks < MIN_WEEKS_CONFIDENT || !incomeSlots.length) status = 'low_confidence';
	if (lastDate && daysBetween(lastDate, asOf) > STALE_DAYS) {
		status = 'low_confidence';
		warnings.push(`The newest transaction is from ${lastDate}, more than ${STALE_DAYS} days before the forecast date.`);
	}
	if (weeks < MIN_WEEKS_CONFIDENT) warnings.push(`Only ${weeks} weeks of history. The range is probably too narrow.`);

	return {
		status,
		customerId,
		period,
		startBalance: money(startCents),
		floor: { ...money(floorCents), source: floorSource },
		baseline,
		scenario,
		difference: scenario && {
			safeToSetAside: money(scenario.safeToSetAside.cents - baseline.safeToSetAside.cents),
			breachRiskPoints: Math.round((scenario.breachRisk - baseline.breachRisk) * 1000) / 10,
			lowestBalanceP10: money(scenario.lowestBalanceP10.cents - baseline.lowestBalanceP10.cents),
			...(incomeChange ? {
				incomeChange: {
					baselineMonthlyIncome: money(monthlyIncomeCents),
					scenarioMonthlyIncome: money(monthlyIncomeCents * incomeFactor),
					monthlyChange: money(monthlyIncomeCents * incomeFactor - monthlyIncomeCents),
				},
			} : {}),
			spendingChanges: spendChanges.map((change, i) => {
				const monthly = (matchedTotals[i] / weeks) * WEEKS_PER_MONTH;
				return {
					category: change.category,
					...(change.mcc ? { mcc: change.mcc, mccLabel: MCC_LABELS[change.mcc] } : {}),
					percentChange: change.percentChange,
					baselineMonthlySpend: money(monthly),
					monthlySpendChange: money((monthly * change.percentChange) / 100),
				};
			}),
		},
		knownItems,
		assumptions,
		warnings,
		evidence,
		method,
	};
}
