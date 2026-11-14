// Money is always integer euro cents inside the engine.

export type Cents = number;

export interface Money {
	cents: Cents;
	display: string;
}

/** Convert a euro amount (as a user or a model gives it) to integer cents. */
export function eurToCents(eur: number): Cents {
	return Math.round(eur * 100);
}

const formatter = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "EUR 1,234.56" or "-EUR 12.00". */
export function formatEur(cents: Cents): string {
	const sign = cents < 0 ? '-' : '';
	return `${sign}EUR ${formatter.format(Math.abs(cents) / 100)}`;
}

export function money(cents: Cents): Money {
	const rounded = Math.round(cents);
	return { cents: rounded, display: formatEur(rounded) };
}
