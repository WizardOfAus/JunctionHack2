// Import the pinned S-Pankki Junction 2026 dataset into a local SQLite file.
//
//   node scripts/import-data.ts [--raw <dir>] [--db <file>] [--skip-download]
//
// Downloads the CSVs (if not present) from the pinned upstream revision,
// checks them, and writes data/koti.db. The raw files and the database stay
// out of Git (see .gitignore). Each transaction keeps its CSV line number as
// `seq`, so every result can point back to the original source row.

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';

const SOURCE_REPO = 'hackjunction/Junction-2026-S-pankki';
const SOURCE_REVISION = 'fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f';
const EXPECTED_TRANSACTIONS = 3_626_755;
const EXPECTED_CUSTOMERS = 5_100;

const FILES = {
	transactions: {
		name: 'tx_junction_transactions.csv',
		// Git LFS file: the media host serves the real content.
		url: `https://media.githubusercontent.com/media/${SOURCE_REPO}/${SOURCE_REVISION}/tx_junction_transactions.csv`,
	},
	customers: {
		name: 'tx_customers_junction.csv',
		url: `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_REVISION}/tx_customers_junction.csv`,
	},
} as const;

const TX_HEADER = [
	'customer_id', 'bank_account_id', 'tx_date', 'tx_timestamp', 'category',
	'tx_amount_eur', 'balance_after_eur', 'transaction_type', 'merchant_id', 'mcc_code',
];
const CUSTOMER_HEADER = ['customer_id', 'customer_postal_code', 'customer_age'];

const MONTHS: Record<string, string> = {
	JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
	JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

const here = dirname(new URL(import.meta.url).pathname);
const { values: args } = parseArgs({
	options: {
		raw: { type: 'string', default: resolve(here, '../data/raw') },
		db: { type: 'string', default: resolve(here, '../data/koti.db') },
		'skip-download': { type: 'boolean', default: false },
	},
});
const rawDir = resolve(args.raw!);
const dbPath = resolve(args.db!);

/** Convert a decimal euro string such as "-27.32" to integer cents. */
export function eurToCents(text: string): number {
	const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
	if (!match) throw new Error(`Not a euro amount: "${text}"`);
	const [, sign, whole, frac = ''] = match;
	const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
	return sign ? -cents : cents;
}

/** Convert "03OCT24:09:04:04" to "2024-10-03T09:04:04". */
export function parseTimestamp(text: string): string {
	const match = /^(\d{2})([A-Z]{3})(\d{2}):(\d{2}:\d{2}:\d{2})$/.exec(text);
	const month = match && MONTHS[match[2]];
	if (!match || !month) throw new Error(`Not a timestamp: "${text}"`);
	return `20${match[3]}-${month}-${match[1]}T${match[4]}`;
}

async function download(url: string, target: string) {
	console.log(`Downloading ${url}`);
	const response = await fetch(url);
	if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status} ${url}`);
	await writeFile(target, response.body as unknown as NodeJS.ReadableStream);
}

async function sha256(path: string): Promise<string> {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return hash.digest('hex');
}

async function* csvLines(path: string): AsyncGenerator<{ line: number; fields: string[] }> {
	const reader = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
	let line = 0;
	for await (let text of reader) {
		if (line === 0) text = text.replace(/^﻿/, ''); // the source files start with a BOM
		if (text.length > 0) yield { line, fields: text.split(',') };
		line++;
	}
}

function checkHeader(file: string, actual: string[], expected: string[]) {
	if (actual.join(',') !== expected.join(',')) {
		throw new Error(`${file}: unexpected header ${actual.join(',')}`);
	}
}

async function main() {
	mkdirSync(rawDir, { recursive: true });
	for (const file of Object.values(FILES)) {
		const path = join(rawDir, file.name);
		if (!existsSync(path)) {
			if (args['skip-download']) throw new Error(`Missing ${path}`);
			await download(file.url, path);
		}
		if (statSync(path).size < 1_000) {
			throw new Error(`${path} is too small. It is probably a Git LFS pointer, not the data.`);
		}
	}

	const tmpPath = `${dbPath}.tmp`;
	rmSync(tmpPath, { force: true });
	mkdirSync(dirname(dbPath), { recursive: true });
	const db = new DatabaseSync(tmpPath);
	db.exec(`
		PRAGMA journal_mode = OFF;
		PRAGMA synchronous = OFF;
		CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		CREATE TABLE customers (
			customer_id TEXT PRIMARY KEY,
			postal_code TEXT,
			age INTEGER
		);
		CREATE TABLE transactions (
			seq INTEGER PRIMARY KEY,          -- line number in the source CSV (header = 0)
			customer_id TEXT NOT NULL,
			account_id TEXT NOT NULL,
			tx_date TEXT NOT NULL,            -- YYYY-MM-DD
			tx_ts TEXT NOT NULL,              -- YYYY-MM-DDTHH:MM:SS
			category TEXT NOT NULL,
			amount_cents INTEGER NOT NULL,
			balance_after_cents INTEGER NOT NULL,
			tx_type TEXT NOT NULL,
			merchant_id TEXT,
			mcc TEXT
		);
	`);

	// Customers
	const insertCustomer = db.prepare('INSERT INTO customers VALUES (?, ?, ?)');
	let customers = 0;
	db.exec('BEGIN');
	for await (const { line, fields } of csvLines(join(rawDir, FILES.customers.name))) {
		if (line === 0) { checkHeader(FILES.customers.name, fields, CUSTOMER_HEADER); continue; }
		if (fields.length !== 3) throw new Error(`customers line ${line}: ${fields.length} fields`);
		insertCustomer.run(fields[0], fields[1] || null, fields[2] ? Number(fields[2]) : null);
		customers++;
	}
	db.exec('COMMIT');

	// Transactions
	const insertTx = db.prepare('INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
	let transactions = 0;
	let minDate = '9999-99-99';
	let maxDate = '0000-00-00';
	db.exec('BEGIN');
	for await (const { line, fields } of csvLines(join(rawDir, FILES.transactions.name))) {
		if (line === 0) { checkHeader(FILES.transactions.name, fields, TX_HEADER); continue; }
		if (fields.length !== 10) throw new Error(`transactions line ${line}: ${fields.length} fields`);
		const [customer, account, date, ts, category, amount, balance, type, merchant, mcc] = fields;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`transactions line ${line}: bad date "${date}"`);
		insertTx.run(
			line, customer, account, date, parseTimestamp(ts), category,
			eurToCents(amount), eurToCents(balance), type, merchant || null, mcc || null,
		);
		if (date < minDate) minDate = date;
		if (date > maxDate) maxDate = date;
		transactions++;
		if (transactions % 500_000 === 0) console.log(`  ${transactions.toLocaleString('en')} rows`);
	}
	db.exec('COMMIT');

	console.log('Building indexes');
	db.exec(`
		CREATE INDEX tx_customer_date ON transactions (customer_id, tx_date, tx_ts, seq);
		CREATE INDEX tx_customer_type ON transactions (customer_id, tx_type);
	`);

	if (transactions !== EXPECTED_TRANSACTIONS) {
		throw new Error(`Expected ${EXPECTED_TRANSACTIONS} transactions, got ${transactions}`);
	}
	if (customers !== EXPECTED_CUSTOMERS) {
		throw new Error(`Expected ${EXPECTED_CUSTOMERS} customers, got ${customers}`);
	}

	const insertMeta = db.prepare('INSERT INTO meta VALUES (?, ?)');
	const meta: Record<string, string> = {
		source_repo: SOURCE_REPO,
		source_revision: SOURCE_REVISION,
		transactions_sha256: await sha256(join(rawDir, FILES.transactions.name)),
		customers_sha256: await sha256(join(rawDir, FILES.customers.name)),
		transaction_count: String(transactions),
		customer_count: String(customers),
		min_date: minDate,
		max_date: maxDate,
		imported_at: new Date().toISOString(),
	};
	for (const [key, value] of Object.entries(meta)) insertMeta.run(key, value);
	db.exec('ANALYZE');
	db.close();

	rmSync(dbPath, { force: true });
	renameSync(tmpPath, dbPath);
	console.log(`Wrote ${dbPath}`);
	console.log(meta);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
