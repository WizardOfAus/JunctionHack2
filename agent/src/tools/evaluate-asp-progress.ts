import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { AS_OF } from '../data/store.ts';
import { ASP_RULE_VERSIONS, evaluateAspProgress } from '../finance/asp.ts';
import { eurToCents } from '../finance/money.ts';
import { IsoDate } from './shared.ts';

const Month = v.pipe(v.string(), v.regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the YYYY-MM month format.'));
const Eur = (max: number) => v.pipe(v.number(), v.minValue(0), v.maxValue(max));

const AspInput = v.object({
	openedOn: v.optional(v.pipe(IsoDate, v.description('The date the ASP account was opened. Leave out if the user has not said.'))),
	verifiedMonthlyDeposits: v.optional(v.pipe(
		v.array(v.object({ month: Month, amountEur: Eur(1_000_000) })),
		v.maxLength(360),
		v.description('Deposits that the user says were made to the ASP account, as a total for each month. Never use saving transfers from the transaction data.'),
	), []),
	rulesVersion: v.optional(v.pipe(
		v.picklist(ASP_RULE_VERSIONS),
		v.description('Leave out to use the rules in force on the opening date.'),
	)),
	homePriceEur: v.optional(v.pipe(Eur(10_000_000), v.minValue(1), v.description('Optional: the home price, to compare the savings with the 5% and 10% targets.'))),
	currentBalanceEur: v.optional(v.pipe(Eur(10_000_000), v.description('Optional: the ASP balance now. Leave out to use the sum of the verified deposits.'))),
	plannedMonthlyDepositEur: v.optional(v.pipe(Eur(1_000_000), v.description('Optional what-if: deposit this much every month from now.'))),
});

const DESCRIPTION = `Check ASP (Finnish state-supported home savings) progress with the official, versioned rules.

Use it for: "How many ASP qualifying months do I have?", "Does a EUR 40 deposit count?",
"If I miss a month, do I lose my progress?", "When can I get an ASP loan if I deposit every month?",
"I opened my ASP account in 2025. Which rules apply?".

Rules from 1 June 2026: 20 qualifying months of EUR 50 to EUR 1,500 each. The months do not need to be
in a row, and a skipped month keeps earlier months. Savings must be 10% of the price (5% and 10 months
for interim financing). Accounts opened before 1 June 2026 are on transition rules: the tool explains
them and does not give an exact count.

Only the user knows the opening date and the ASP deposits. The transaction data does not show ASP
deposits, so never pass saving transfers from the data. If the status is "unknown", ask the user for the
opening date and the deposit for each month. To answer a rule question (for example "does EUR 40 count?")
without the user's history, pass plannedMonthlyDepositEur and read message. The status stays unknown;
no personal progress or projected date is inferred. Read projection.summary only when an opening date is supplied.

Quote the display values and the summary. Do not do your own arithmetic. Meeting the ASP conditions is
not a mortgage approval.`;

export function makeEvaluateAspProgressTool() {
	return defineTool({
		name: 'evaluate_asp_progress',
		description: DESCRIPTION,
		input: AspInput,
		annotations: { readOnlyHint: true, idempotentHint: true },
		async run({ data }) {
			const result = evaluateAspProgress({
				asOf: AS_OF,
				openedOn: data.openedOn ?? null,
				verifiedMonthlyDeposits: data.verifiedMonthlyDeposits.map((d) => ({ month: d.month, amountCents: eurToCents(d.amountEur) })),
				rulesVersion: data.rulesVersion,
				homePriceCents: data.homePriceEur != null ? eurToCents(data.homePriceEur) : null,
				currentBalanceCents: data.currentBalanceEur != null ? eurToCents(data.currentBalanceEur) : null,
				plannedMonthlyCents: data.plannedMonthlyDepositEur != null ? eurToCents(data.plannedMonthlyDepositEur) : null,
			});
			return { output: result as unknown as Record<string, never> };
		},
	});
}
