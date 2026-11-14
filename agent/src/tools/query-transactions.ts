import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import {
	DATA_CUTOFF, findCustomers, groupTransactions, listTransactions, totals,
	type GroupBy, type TransactionFilter, type TransactionSort,
} from '../data/store.ts';
import { CATEGORIES, MCC_CODES, MCC_LABELS, TX_TYPES } from '../finance/catalog.ts';
import { addDays, monthsTouched, shiftMonth, WEEKDAYS } from '../finance/dates.ts';
import { eurToCents, money } from '../finance/money.ts';
import { CustomerId, IsoDate, resolveCustomer, type ToolScope } from './shared.ts';

const GROUP_BY = ['none', 'category', 'type', 'month', 'week', 'weekday', 'mcc', 'merchant'] as const;
const SORT = ['date_desc', 'date_asc', 'largest_out', 'largest_in'] as const;

const QueryInput = v.object({
	customerId: v.optional(CustomerId),
	from: v.optional(IsoDate),
	to: v.optional(IsoDate),
	categories: v.optional(v.pipe(v.array(v.picklist(CATEGORIES)), v.maxLength(15))),
	types: v.optional(v.pipe(v.array(v.picklist(TX_TYPES)), v.maxLength(8))),
	mcc: v.optional(v.pipe(
		v.array(v.picklist(MCC_CODES)),
		v.maxLength(20),
		v.description('Merchant category codes, e.g. 5814 = fast food and cafés, 4121 = taxis.'),
	)),
	merchantId: v.optional(v.pipe(v.string(), v.regex(/^MRC-[A-Z]{3}-\d{4}$/, 'A merchant id looks like MRC-GRO-0035.'))),
	direction: v.optional(v.picklist(['in', 'out'])),
	minAmountEur: v.optional(v.pipe(v.number(), v.minValue(0))),
	maxAmountEur: v.optional(v.pipe(v.number(), v.minValue(0))),
	groupBy: v.optional(v.picklist(GROUP_BY), 'none'),
	sort: v.optional(v.picklist(SORT), 'date_desc'),
	limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 25),
});

const QUERY_DESCRIPTION = `Read one customer's transactions from the S-Pankki dataset.

Use it for questions about the past: "How much did I spend on restaurants in August?",
"What are my biggest purchases?", "How much do I spend on cafés each month?", "When is my salary paid?".
Use groupBy to get totals by category, type, month, week, weekday, mcc or merchant.
With groupBy "none" it returns single transactions (max 100).

Defaults: the last 12 calendar months up to the data cutoff (${DATA_CUTOFF}). Data after the cutoff is held out.
Amounts: negative = money out, positive = money in. monthlyMean divides by the calendar months the period touches.
Coffee is not a category: use mcc 5814 (fast food and cafés) inside Restaurants.
Every row has a ref (row:<line>) that points to the source CSV line.
Quote the display values. Do not add up amounts yourself; use groupBy or totals.`;

export function makeQueryTransactionsTool(scope: ToolScope) {
	return defineTool({
		name: 'query_transactions',
		description: QUERY_DESCRIPTION,
		input: QueryInput,
		annotations: { readOnlyHint: true, idempotentHint: true },
		async run({ data }) {
			const profile = resolveCustomer(scope, data.customerId);
			const notes: string[] = [];
			let to = data.to ?? DATA_CUTOFF;
			if (to > DATA_CUTOFF) {
				notes.push(`Data after ${DATA_CUTOFF} is held out, so the period ends on ${DATA_CUTOFF}.`);
				to = DATA_CUTOFF;
			}
			const from = data.from ?? `${shiftMonth(to.slice(0, 7), -11)}-01`;
			if (from > to) throw new Error(`"from" (${from}) is after "to" (${to}).`);

			const filter: TransactionFilter = {
				customerId: profile.customerId,
				from,
				to,
				categories: data.categories,
				types: data.types,
				mcc: data.mcc,
				merchantId: data.merchantId,
				direction: data.direction,
				minAbsCents: data.minAmountEur != null ? eurToCents(data.minAmountEur) : undefined,
				maxAbsCents: data.maxAmountEur != null ? eurToCents(data.maxAmountEur) : undefined,
			};
			const months = monthsTouched(from, to);
			const fullMonths = from.endsWith('-01') && addDays(to, 1).endsWith('-01');
			if (!fullMonths) notes.push('The period does not start and end on whole months, so monthlyMean is approximate.');

			const sum = totals(filter);
			const result: Record<string, unknown> = {
				customer: profile,
				period: { from, to, monthsTouched: months },
				totals: {
					count: sum.count,
					moneyIn: money(sum.inflowCents),
					moneyOut: money(sum.outflowCents),
					net: money(sum.inflowCents + sum.outflowCents),
					monthlyMeanOut: money(sum.outflowCents / months),
					monthlyMeanNet: money((sum.inflowCents + sum.outflowCents) / months),
					firstDate: sum.first,
					lastDate: sum.last,
				},
			};

			if (data.groupBy !== 'none') {
				const groups = groupTransactions(filter, data.groupBy as GroupBy, 100);
				result.groups = groups.map((g) => ({
					key: g.key,
					...(data.groupBy === 'weekday' ? { label: WEEKDAYS[Number(g.key)] } : {}),
					...(data.groupBy === 'mcc' && MCC_LABELS[g.key] ? { label: MCC_LABELS[g.key] } : {}),
					count: g.n,
					net: money(g.total),
					moneyIn: money(g.inflow ?? 0),
					moneyOut: money(g.outflow ?? 0),
					monthlyMean: money(g.total / months),
				}));
			} else {
				const rows = listTransactions(filter, data.sort as TransactionSort, data.limit);
				result.rows = rows.map((r) => ({
					ref: `row:${r.seq}`,
					date: r.tx_date,
					time: r.tx_ts.slice(11),
					type: r.tx_type,
					category: r.category,
					amount: money(r.amount_cents).display,
					amountCents: r.amount_cents,
					balanceAfter: money(r.balance_after_cents).display,
					...(r.merchant_id ? { merchantId: r.merchant_id } : {}),
					...(r.mcc ? { mcc: r.mcc, mccLabel: MCC_LABELS[r.mcc] } : {}),
				}));
				if (sum.count > rows.length) notes.push(`Showing ${rows.length} of ${sum.count} transactions.`);
			}
			if (notes.length) result.notes = notes;
			return { output: result as Record<string, never> };
		},
	});
}

const FindInput = v.object({
	minAge: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	maxAge: v.optional(v.pipe(v.number(), v.integer(), v.maxValue(130))),
	postalCodePrefix: v.optional(v.pipe(v.string(), v.regex(/^\d{1,5}$/, 'Use digits only, e.g. 00 for Helsinki.'))),
	limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 20),
	offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
});

export function makeFindCustomersTool(scope: ToolScope) {
	return defineTool({
		name: 'find_customers',
		description: `List synthetic customers in the dataset by age and postal code prefix.
Use it to find customers to compare or to research patterns across many customers.
Returns customer ids with age and postal code, plus the total number of matches.`,
		input: FindInput,
		annotations: { readOnlyHint: true, idempotentHint: true },
		async run({ data }) {
			if (scope.lockedCustomerId) {
				throw new Error(`This conversation can only read customer ${scope.lockedCustomerId}.`);
			}
			const { total, customers } = findCustomers({
				minAge: data.minAge, maxAge: data.maxAge, postalCodePrefix: data.postalCodePrefix,
				limit: data.limit, offset: data.offset,
			});
			return {
				output: {
					total,
					customers: customers.map((c) => ({ customerId: c.customer_id, age: c.age, postalCode: c.postal_code })),
				},
			};
		},
	});
}
