import * as v from 'valibot';
import { CUSTOMER_ID_PATTERN, getCustomerProfile, type CustomerProfile } from '../data/store.ts';

export const IsoDate = v.pipe(v.string(), v.isoDate('Use the YYYY-MM-DD date format.'));

export const CustomerId = v.pipe(
	v.string(),
	v.regex(CUSTOMER_ID_PATTERN, 'A customer id looks like CUST04859'),
	v.description('Synthetic customer id, for example CUST04859. Not needed when the conversation is bound to one customer.'),
);

export const MoneySchema = v.object({ cents: v.number(), display: v.string() });

/**
 * Which customers a tool may read.
 * - lockedCustomerId set: only that customer (a coaching conversation for one user).
 * - not set: analyst mode over the synthetic dataset (analyst and adviser views, demo personas,
 *   evaluation). No real person is behind these ids. A real bank would need customer-consented,
 *   scoped, expiring and audited adviser access, and aggregates-only analyst views
 *   (see docs/data-insights.md, "Advisor and analyst views").
 * The model can choose a customer only inside this boundary.
 */
export interface ToolScope {
	lockedCustomerId?: string;
}

export function resolveCustomer(scope: ToolScope, requested: string | undefined): CustomerProfile {
	const locked = scope.lockedCustomerId;
	if (locked && requested && requested !== locked) {
		throw new Error(`This conversation can only read customer ${locked}.`);
	}
	const customerId = locked ?? requested;
	if (!customerId) throw new Error('Give a customerId, for example CUST04859.');
	const profile = getCustomerProfile(customerId);
	if (!profile) throw new Error(`Customer ${customerId} is not in the dataset.`);
	return profile;
}
