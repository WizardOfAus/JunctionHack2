// Calendar helpers for ISO dates (YYYY-MM-DD). All maths is done in UTC.

const DAY_MS = 86_400_000;

export function parseIsoDate(iso: string): number {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Not an ISO date: "${iso}"`);
	const ms = Date.parse(`${iso}T00:00:00Z`);
	if (Number.isNaN(ms)) throw new Error(`Not a valid date: "${iso}"`);
	return ms;
}

export function toIsoDate(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
	return toIsoDate(parseIsoDate(iso) + days * DAY_MS);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
	return Math.round((parseIsoDate(b) - parseIsoDate(a)) / DAY_MS);
}

export function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-12
}

/** "2026-08" for a date. */
export function monthKey(iso: string): string {
	return iso.slice(0, 7);
}

/** Month key n months before (negative) or after (positive) the given month key. */
export function shiftMonth(key: string, n: number): string {
	const [y, m] = key.split('-').map(Number);
	const index = y * 12 + (m - 1) + n;
	return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** A date in a month, clamped to the last day of that month. */
export function dateInMonth(key: string, day: number): string {
	const [y, m] = key.split('-').map(Number);
	const d = Math.min(Math.max(1, day), daysInMonth(y, m));
	return `${key}-${String(d).padStart(2, '0')}`;
}

/** Number of calendar months that the range touches, e.g. 2026-06-01..2026-08-31 -> 3. */
export function monthsTouched(from: string, to: string): number {
	const [fy, fm] = from.split('-').map(Number);
	const [ty, tm] = to.split('-').map(Number);
	return (ty - fy) * 12 + (tm - fm) + 1;
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
