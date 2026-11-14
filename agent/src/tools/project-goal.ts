import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { AS_OF, getCustomerRows } from '../data/store.ts';
import { MCC_CODES, SPENDING_CATEGORIES } from '../finance/catalog.ts';
import { projectGoal, type GoalChange } from '../finance/goal.ts';
import { eurToCents } from '../finance/money.ts';
import { CustomerId, IsoDate, MoneySchema, resolveCustomer, type ToolScope } from './shared.ts';

const Eur = v.pipe(v.number(), v.minValue(0.01), v.maxValue(10_000_000));

const Change = v.variant('type', [
	v.object({
		type: v.literal('changeSpending'),
		category: v.picklist(SPENDING_CATEGORIES),
		mcc: v.optional(v.pipe(v.picklist(MCC_CODES), v.description('Optional, e.g. 5814 = fast food and cafés.'))),
		percentChange: v.pipe(v.number(), v.minValue(-100), v.maxValue(100), v.description('-20 means 20% less. The saved money goes to the goal.')),
	}),
	v.object({
		type: v.literal('changeIncome'),
		percentChange: v.optional(v.pipe(v.number(), v.minValue(-100), v.maxValue(200), v.description('+5 means a 5% raise.'))),
		newMonthlyEur: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1_000_000), v.description('The new monthly salary after tax.'))),
		toGoalPercent: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(100), v.description('Share of the extra income that goes to the goal. Default 100.'))),
	}),
	v.object({
		type: v.literal('addMonthlySaving'),
		amountEur: v.pipe(v.number(), v.minValue(-1_000_000), v.maxValue(1_000_000), v.description('Extra (or, if negative, less) saving each month.')),
	}),
	v.object({
		type: v.literal('oneOffDeposit'),
		label: v.pipe(v.string(), v.minLength(1), v.maxLength(60)),
		amountEur: Eur,
		date: IsoDate,
	}),
]);

export const GoalInput = v.object({
	customerId: v.optional(CustomerId),
	goalEur: v.pipe(v.number(), v.minValue(1), v.maxValue(10_000_000), v.description('The deposit or savings target in euros.')),
	currentSavingsEur: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(10_000_000), v.description('Already saved for the goal. Leave out if the user has not said.'))),
	monthlySavingEur: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1_000_000), v.description('Monthly saving now. Leave out to use the existing saving transfers from the data.'))),
	annualInterestPercent: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(10)), 0),
	changes: v.optional(v.pipe(v.array(Change), v.maxLength(5)), []),
});

const Outlook = v.object({
	monthlySaving: MoneySchema,
	monthsToGoal: v.nullable(v.number()),
	readyDate: v.nullable(v.string()),
	reached: v.boolean(),
	savedByReadyDate: v.nullable(MoneySchema),
});

export const GoalOutput = v.object({
	status: v.picklist(['ok', 'low_confidence', 'blocked']),
	blockedReason: v.optional(v.string()),
	customerId: v.string(),
	asOf: v.string(),
	goal: MoneySchema,
	currentSavings: v.object({ cents: v.number(), display: v.string(), source: v.picklist(['user', 'not_set']) }),
	monthlySavingSource: v.picklist(['user', 'existing_transfers']),
	remaining: MoneySchema,
	baseline: Outlook,
	scenario: v.optional(Outlook),
	difference: v.optional(v.object({
		monthlySaving: MoneySchema,
		months: v.nullable(v.number()),
		days: v.nullable(v.number()),
		summary: v.string(),
		effects: v.array(v.object({ change: v.string(), monthlyEffect: MoneySchema, detail: v.string() })),
	})),
	history: v.object({
		monthsUsed: v.number(),
		medianSalary: MoneySchema,
		medianSavingTransfers: MoneySchema,
		medianSurplusBeforeSaving: MoneySchema,
		months: v.array(v.object({
			month: v.string(),
			salary: MoneySchema,
			savingTransfers: MoneySchema,
			surplusBeforeSaving: MoneySchema,
		})),
	}),
	assumptions: v.array(v.string()),
	warnings: v.array(v.string()),
	method: v.object({ calcVersion: v.string(), annualInterestPercent: v.number(), maxMonths: v.number() }),
});

const DESCRIPTION = `Project when one synthetic customer's savings goal (for example a home deposit) is reached,
and how a change moves that date. In coaching mode this is always the bound customer.

Use it for: "When will my deposit be ready?", "How much sooner if I cut cafés by 20%?",
"What if I get a 5% raise?", "What if I add my EUR 1,000 bonus?", "How long to save EUR 30,000?".
Do NOT use it for "is it safe to save this month?" (use forecast_cashflow).

This is simple month-by-month arithmetic from ${AS_OF}, not a risk forecast.
If monthlySavingEur is left out, it uses the median of the existing saving transfers in the data.
Pass changes to compare a scenario with the baseline. difference.summary gives the result in words.
Also returns the median salary, saving transfers and monthly surplus of the last 6 months.

Quote the display values and the summary. Do not do your own arithmetic. Results are estimates.
If currentSavings.source is "not_set", ask the user how much they have saved and call again.
If there are warnings (for example the plan saves more than the usual surplus), tell the user.`;

export function makeProjectGoalTool(scope: ToolScope) {
	return defineTool({
		name: 'project_goal',
		description: DESCRIPTION,
		input: GoalInput,
		output: GoalOutput,
		annotations: { readOnlyHint: true, idempotentHint: true },
		async run({ data }) {
			const profile = resolveCustomer(scope, data.customerId);
			const changes: GoalChange[] = data.changes.map((change) => {
				switch (change.type) {
					case 'changeIncome':
						return {
							type: 'changeIncome',
							percentChange: change.percentChange,
							newMonthlyCents: change.newMonthlyEur != null ? eurToCents(change.newMonthlyEur) : undefined,
							toGoalPercent: change.toGoalPercent,
						};
					case 'addMonthlySaving':
						return { type: 'addMonthlySaving', amountCents: eurToCents(change.amountEur) };
					case 'oneOffDeposit':
						return { type: 'oneOffDeposit', label: change.label, date: change.date, amountCents: eurToCents(change.amountEur) };
					default:
						return change;
				}
			});
			const result = projectGoal({
				customerId: profile.customerId,
				asOf: AS_OF,
				rows: getCustomerRows(profile.customerId),
				goalCents: eurToCents(data.goalEur),
				currentSavingsCents: data.currentSavingsEur != null ? eurToCents(data.currentSavingsEur) : null,
				monthlySavingCents: data.monthlySavingEur != null ? eurToCents(data.monthlySavingEur) : null,
				annualInterestPercent: data.annualInterestPercent,
				changes,
			});
			return { output: result };
		},
	});
}
