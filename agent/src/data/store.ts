// Read-only access to the imported dataset (data/koti.db, made by
// `npm run import-data`). Every query is parameterised and every query stops at
// the data cutoff, so the September 2026 holdout never reaches the agent.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { addDays } from '../finance/dates.ts';
import type { Cents } from '../finance/money.ts';

export const CUSTOMER_ID_PATTERN = /^CUST\d{5}$/;

/** Last day of history the agent can see. The demo clock is the day after. */
export const DATA_CUTOFF = process.env.KOTI_DATA_CUTOFF ?? '2026-08-31';
export const AS_OF = addDays(DATA_CUTOFF, 1);

let db: DatabaseSync | undefined;

function database(): DatabaseSync {
	if (db) return db;
	const path = resolve(process.env.KOTI_DB_PATH ?? 'data/koti.db');
	if (!existsSync(path)) {
		throw new Error(`Dataset not found at ${path}. Run "npm run import-data" in agent/ first.`);
	}
	db = new DatabaseSync(path, { readOnly: true });
	return db;
}

function all<T>(sql: string, ...params: SQLInputValue[]): T[] {
	return database().prepare(sql).all(...params) as T[];
}

export interface CustomerProfile {
	customerId: string;
	age: number | null;
	postalCode: string | null;
	accounts: string[];
	firstTransactionDate: string | null;
	lastTransactionDate: string | null;
	transactionCount: number;
	dataCutoff: string;
}

export function getCustomerProfile(customerId: string): CustomerProfile | null {
	const [customer] = all<{ age: number | null; postal_code: string | null }>(
		'SELECT age, postal_code FROM customers WHERE customer_id = ?', customerId,
	);
	if (!customer) return null;
	const [stats] = all<{ first: string | null; last: string | null; n: number; accounts: string | null }>(
		`SELECT MIN(tx_date) AS first, MAX(tx_date) AS last, COUNT(*) AS n,
		        GROUP_CONCAT(DISTINCT account_id) AS accounts
		 FROM transactions WHERE customer_id = ? AND tx_date <= ?`,
		customerId, DATA_CUTOFF,
	);
	return {
		customerId,
		age: customer.age,
		postalCode: customer.postal_code,
		accounts: stats.accounts ? stats.accounts.split(',') : [],
		firstTransactionDate: stats.first,
		lastTransactionDate: stats.last,
		transactionCount: stats.n,
		dataCutoff: DATA_CUTOFF,
	};
}

/** One source transaction row, in integer cents. */
export interface TxRow {
	seq: number;
	accountId: string;
	date: string;
	amountCents: Cents;
	balanceAfterCents: Cents;
	type: string;
	category: string;
	mcc: string | null;
}

/** All rows for one customer up to and including `to` (never after the cutoff), in source order. */
export function getCustomerRows(customerId: string, to: string = DATA_CUTOFF): TxRow[] {
	const until = to < DATA_CUTOFF ? to : DATA_CUTOFF;
	return all<{
		seq: number; account_id: string; tx_date: string; amount_cents: number;
		balance_after_cents: number; tx_type: string; category: string; mcc: string | null;
	}>(
		`SELECT seq, account_id, tx_date, amount_cents, balance_after_cents, tx_type, category, mcc
		 FROM transactions WHERE customer_id = ? AND tx_date <= ?
		 ORDER BY tx_date, tx_ts, seq`,
		customerId, until,
	).map((row) => ({
		seq: row.seq,
		accountId: row.account_id,
		date: row.tx_date,
		amountCents: row.amount_cents,
		balanceAfterCents: row.balance_after_cents,
		type: row.tx_type,
		category: row.category,
		mcc: row.mcc,
	}));
}

export interface TransactionFilter {
	customerId: string;
	from: string;
	to: string;
	categories?: string[];
	types?: string[];
	mcc?: string[];
	merchantId?: string;
	direction?: 'in' | 'out';
	minAbsCents?: number;
	maxAbsCents?: number;
}

function whereClause(filter: TransactionFilter): { sql: string; params: SQLInputValue[] } {
	const parts = ['customer_id = ?', 'tx_date >= ?', 'tx_date <= ?'];
	const params: SQLInputValue[] = [filter.customerId, filter.from, filter.to];
	const list = (column: string, values?: string[]) => {
		if (!values?.length) return;
		parts.push(`${column} IN (${values.map(() => '?').join(', ')})`);
		params.push(...values);
	};
	list('category', filter.categories);
	list('tx_type', filter.types);
	list('mcc', filter.mcc);
	if (filter.merchantId) { parts.push('merchant_id = ?'); params.push(filter.merchantId); }
	if (filter.direction === 'in') parts.push('amount_cents > 0');
	if (filter.direction === 'out') parts.push('amount_cents < 0');
	if (filter.minAbsCents != null) { parts.push('ABS(amount_cents) >= ?'); params.push(filter.minAbsCents); }
	if (filter.maxAbsCents != null) { parts.push('ABS(amount_cents) <= ?'); params.push(filter.maxAbsCents); }
	return { sql: parts.join(' AND '), params };
}

export interface TransactionRecord {
	seq: number;
	tx_date: string;
	tx_ts: string;
	tx_type: string;
	category: string;
	amount_cents: number;
	balance_after_cents: number;
	merchant_id: string | null;
	mcc: string | null;
}

const SORTS = {
	date_desc: 'tx_date DESC, tx_ts DESC, seq DESC',
	date_asc: 'tx_date, tx_ts, seq',
	largest_out: 'amount_cents ASC, seq',
	largest_in: 'amount_cents DESC, seq',
} as const;
export type TransactionSort = keyof typeof SORTS;

export function listTransactions(filter: TransactionFilter, sort: TransactionSort, limit: number): TransactionRecord[] {
	const where = whereClause(filter);
	return all<TransactionRecord>(
		`SELECT seq, tx_date, tx_ts, tx_type, category, amount_cents, balance_after_cents, merchant_id, mcc
		 FROM transactions WHERE ${where.sql} ORDER BY ${SORTS[sort]} LIMIT ?`,
		...where.params, limit,
	);
}

export function totals(filter: TransactionFilter) {
	const where = whereClause(filter);
	const [row] = all<{ n: number; inflow: number | null; outflow: number | null; first: string | null; last: string | null }>(
		`SELECT COUNT(*) AS n,
		        SUM(CASE WHEN amount_cents > 0 THEN amount_cents END) AS inflow,
		        SUM(CASE WHEN amount_cents < 0 THEN amount_cents END) AS outflow,
		        MIN(tx_date) AS first, MAX(tx_date) AS last
		 FROM transactions WHERE ${where.sql}`,
		...where.params,
	);
	return { count: row.n, inflowCents: row.inflow ?? 0, outflowCents: row.outflow ?? 0, first: row.first, last: row.last };
}

// Group keys are fixed SQL expressions. The model selects a key name, never SQL.
const GROUP_EXPRESSIONS = {
	category: 'category',
	type: 'tx_type',
	month: "substr(tx_date, 1, 7)",
	week: "date(tx_date, '-6 days', 'weekday 1')", // Monday of the week
	weekday: "strftime('%w', tx_date)",
	mcc: "COALESCE(mcc, 'none')",
	merchant: "COALESCE(merchant_id, 'none')",
} as const;
export type GroupBy = keyof typeof GROUP_EXPRESSIONS;

export function groupTransactions(filter: TransactionFilter, groupBy: GroupBy, limit: number) {
	const where = whereClause(filter);
	const expression = GROUP_EXPRESSIONS[groupBy];
	const order = groupBy === 'month' || groupBy === 'week' || groupBy === 'weekday' ? 'key' : 'ABS(SUM(amount_cents)) DESC';
	return all<{ key: string; n: number; total: number; inflow: number | null; outflow: number | null }>(
		`SELECT ${expression} AS key, COUNT(*) AS n, SUM(amount_cents) AS total,
		        SUM(CASE WHEN amount_cents > 0 THEN amount_cents END) AS inflow,
		        SUM(CASE WHEN amount_cents < 0 THEN amount_cents END) AS outflow
		 FROM transactions WHERE ${where.sql} GROUP BY key ORDER BY ${order} LIMIT ?`,
		...where.params, limit,
	);
}

export interface CustomerSearch {
	minAge?: number;
	maxAge?: number;
	postalCodePrefix?: string;
	limit: number;
	offset: number;
}

export function findCustomers(search: CustomerSearch) {
	const parts = ['1 = 1'];
	const params: SQLInputValue[] = [];
	if (search.minAge != null) { parts.push('age >= ?'); params.push(search.minAge); }
	if (search.maxAge != null) { parts.push('age <= ?'); params.push(search.maxAge); }
	if (search.postalCodePrefix) { parts.push('postal_code LIKE ?'); params.push(`${search.postalCodePrefix}%`); }
	const [{ n }] = all<{ n: number }>(`SELECT COUNT(*) AS n FROM customers WHERE ${parts.join(' AND ')}`, ...params);
	const rows = all<{ customer_id: string; age: number | null; postal_code: string | null }>(
		`SELECT customer_id, age, postal_code FROM customers WHERE ${parts.join(' AND ')}
		 ORDER BY customer_id LIMIT ? OFFSET ?`,
		...params, search.limit, search.offset,
	);
	return { total: n, customers: rows };
}

export function datasetInfo(): Record<string, string> {
	return Object.fromEntries(all<{ key: string; value: string }>('SELECT key, value FROM meta').map((r) => [r.key, r.value]));
}
