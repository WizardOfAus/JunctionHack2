// Descriptive statistics from a customer's history. Shared by the cashflow
// forecast and the goal projection, so both tools give the same numbers.

import type { SpendingCategory } from './catalog.ts';
import { addDays, daysBetween, monthKey, shiftMonth } from './dates.ts';
import type { Cents } from './money.ts';

export interface HistoryRow {
	seq: number;
	date: string;
	amountCents: Cents;
	type: string;
	category: string;
	mcc: string | null;
}

/**
 * Months of recent history for salary, bills and saving transfers. The forecast
 * and the goal projection both use it, so they give the same salary and saving.
 */
export const RECENT_MONTHS = 6;

/** Average weeks in a calendar month. */
export const WEEKS_PER_MONTH = 365.25 / 12 / 7;

/** Median, rounded to whole cents (half up). */
export function median(values: number[]): number {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Whole 7-day blocks of history that end the day before asOf. */
export function spendingWindow(rows: HistoryRow[], asOf: string, maxWeeks = 26) {
	const firstDate = rows.length ? rows[0].date : asOf;
	const weeks = Math.max(0, Math.min(maxWeeks, Math.floor(daysBetween(firstDate, asOf) / 7)));
	return { weeks, from: addDays(asOf, -7 * weeks), to: addDays(asOf, -1) };
}

/**
 * Average monthly spend on everyday purchases that match the filter, over the
 * spending window: (spend in window / weeks) x weeks per month.
 */
export function monthlySpend(
	rows: HistoryRow[],
	asOf: string,
	filter: { category: SpendingCategory; mcc?: string },
	maxWeeks = 26,
): { monthlyCents: number; weeks: number; rowsMatched: number } {
	const window = spendingWindow(rows, asOf, maxWeeks);
	let total = 0;
	let rowsMatched = 0;
	for (const row of rows) {
		if (row.date < window.from || row.date >= asOf || row.type !== 'purchase' || row.amountCents >= 0) continue;
		if (row.category !== filter.category || (filter.mcc && row.mcc !== filter.mcc)) continue;
		total -= row.amountCents;
		rowsMatched++;
	}
	const monthlyCents = window.weeks ? (total / window.weeks) * WEEKS_PER_MONTH : 0;
	return { monthlyCents, weeks: window.weeks, rowsMatched };
}

export interface MonthStats {
	month: string;
	salaryCents: Cents;
	savingTransfersCents: Cents;
	/** All money in minus all money out, before existing saving transfers. */
	surplusBeforeSavingCents: Cents;
}

/**
 * Per-month totals for the last `months` complete calendar months before asOf,
 * and their medians.
 */
export function monthlyStats(rows: HistoryRow[], asOf: string, months = RECENT_MONTHS) {
	const keys = Array.from({ length: months }, (_, i) => shiftMonth(monthKey(asOf), i - months));
	const firstMonth = rows.length ? monthKey(rows[0].date) : monthKey(asOf);
	const byMonth = new Map<string, MonthStats>();
	for (const key of keys) {
		if (key < firstMonth) continue; // no data yet in this month
		byMonth.set(key, { month: key, salaryCents: 0, savingTransfersCents: 0, surplusBeforeSavingCents: 0 });
	}
	for (const row of rows) {
		const stats = byMonth.get(monthKey(row.date));
		if (!stats) continue;
		if (row.type === 'salary') stats.salaryCents += row.amountCents;
		if (row.type === 'investment_deposit') stats.savingTransfersCents -= row.amountCents;
		else stats.surplusBeforeSavingCents += row.amountCents;
	}
	const list = [...byMonth.values()];
	return {
		months: list,
		medianSalaryCents: median(list.map((m) => m.salaryCents)),
		medianSavingTransfersCents: median(list.map((m) => m.savingTransfersCents)),
		medianSurplusBeforeSavingCents: median(list.map((m) => m.surplusBeforeSavingCents)),
	};
}
