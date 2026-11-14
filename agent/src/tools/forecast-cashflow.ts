import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { AS_OF, getCustomerRows } from '../data/store.ts';
import { MCC_CODES, SPENDING_CATEGORIES } from '../finance/catalog.ts';
import { forecastCashflow, type ForecastChange } from '../finance/forecast.ts';
import { eurToCents } from '../finance/money.ts';
import { CustomerId, IsoDate, MoneySchema, resolveCustomer, type ToolScope } from './shared.ts';

const Eur = v.pipe(v.number(), v.minValue(0.01), v.maxValue(50_000));

const Change = v.variant('type', [
	v.object({
		type: v.literal('changeSpending'),
		category: v.picklist(SPENDING_CATEGORIES),
		mcc: v.optional(v.pipe(
			v.picklist(MCC_CODES),
			v.description('Optional: change only this merchant category code, e.g. 5814 = fast food and cafés.'),
		)),
		percentChange: v.pipe(v.number(), v.minValue(-100), v.maxValue(100), v.description('-20 means 20% less.')),
	}),
	v.object({
		type: v.literal('addExpense'),
		label: v.pipe(v.string(), v.minLength(1), v.maxLength(60)),
		amountEur: Eur,
		date: IsoDate,
	}),
	v.object({
		type: v.literal('moveToSavings'),
		amountEur: Eur,
		date: IsoDate,
	}),
	v.object({
		type: v.literal('delayIncome'),
		days: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(30)),
	}),
	v.object({
		type: v.literal('changeIncome'),
		percentChange: v.optional(v.pipe(v.number(), v.minValue(-100), v.maxValue(200), v.description('+5 means a 5% raise.'))),
		newMonthlyEur: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1_000_000), v.description('The new monthly salary after tax.'))),
	}),
	v.object({
		type: v.literal('addIncome'),
		label: v.pipe(v.string(), v.minLength(1), v.maxLength(60)),
		amountEur: Eur,
		date: IsoDate,
	}),
]);

export const ForecastInput = v.object({
	customerId: v.optional(CustomerId),
	floorEur: v.optional(v.pipe(
		v.number(),
		v.minValue(0),
		v.maxValue(1_000_000),
		v.description('The emergency reserve the user wants to protect, in euros. Leave out if the user has not said.'),
	)),
	changes: v.optional(v.pipe(v.array(Change), v.maxLength(5)), []),
});

const Outlook = v.object({
	breachRisk: v.number(),
	lowestBalanceP10: MoneySchema,
	lowestBalanceP50: MoneySchema,
	lowestBalanceDate: v.string(),
	endBalanceP50: MoneySchema,
	safeToSetAside: MoneySchema,
});

export const ForecastOutput = v.object({
	status: v.picklist(['ok', 'low_confidence', 'blocked']),
	blockedReason: v.optional(v.string()),
	customerId: v.string(),
	period: v.object({ from: v.string(), to: v.string(), days: v.number() }),
	startBalance: MoneySchema,
	floor: v.object({ cents: v.number(), display: v.string(), source: v.picklist(['user', 'not_set']) }),
	baseline: Outlook,
	scenario: v.optional(Outlook),
	difference: v.optional(v.object({
		safeToSetAside: MoneySchema,
		breachRiskPoints: v.number(),
		lowestBalanceP10: MoneySchema,
		incomeChange: v.optional(v.object({
			baselineMonthlyIncome: MoneySchema,
			scenarioMonthlyIncome: MoneySchema,
			monthlyChange: MoneySchema,
		})),
		spendingChanges: v.array(v.object({
			category: v.string(),
			mcc: v.optional(v.string()),
			mccLabel: v.optional(v.string()),
			percentChange: v.number(),
			baselineMonthlySpend: MoneySchema,
			monthlySpendChange: MoneySchema,
		})),
	})),
	knownItems: v.array(v.object({
		date: v.string(),
		label: v.string(),
		group: v.string(),
		amount: MoneySchema,
		basedOnMonths: v.number(),
		dayRange: v.string(),
		rowRefs: v.array(v.string()),
	})),
	assumptions: v.array(v.string()),
	warnings: v.array(v.string()),
	evidence: v.object({
		historyWindow: v.object({ from: v.string(), to: v.string(), weeks: v.number() }),
		spendingRowsSampled: v.number(),
		lastTransactionDate: v.nullable(v.string()),
	}),
	method: v.object({
		calcVersion: v.string(),
		runs: v.number(),
		seed: v.string(),
		percentile: v.number(),
		horizonDays: v.number(),
		historyWeeks: v.number(),
	}),
});

const FORECAST_DESCRIPTION = `Forecast the balance of one synthetic customer for the next 35 days (from ${AS_OF})
with a Monte Carlo simulation, and say how much they can safely set aside without going below their emergency floor.
In coaching mode this is always the bound customer.

Use it for: "Can I save EUR X?", "Is it safe to...?", "What if I cut / spend / add...?",
"What if my salary is late / goes up 5%?", "What if I get a EUR 500 bonus on 25 Sep?",
"How much can I put towards my home this month?".
Do NOT use it for "when is my deposit ready?" (use project_goal).
Pass changes to compare a scenario with the baseline (same random seed, so the difference is the effect of the change).
Do NOT use it for questions about past spending (use query_transactions).

Returns, for the baseline and the scenario: breachRisk (0.06 = 6% of simulated months go below the floor),
lowestBalanceP10 (in 9 of 10 runs the lowest balance is higher), lowestBalanceDate (the tightest day),
safeToSetAside = max(0, lowestBalanceP10 - floor), plus difference and monthly spending effect.

Quote the display values exactly. Do not do your own arithmetic. All results are estimates, not money the user has.
If status is "blocked", tell the user what is missing. If "low_confidence", say so and give the warnings.
If floor.source is "not_set", ask the user for their emergency reserve and call again with floorEur.`;

export function makeForecastCashflowTool(scope: ToolScope) {
	return defineTool({
		name: 'forecast_cashflow',
		description: FORECAST_DESCRIPTION,
		input: ForecastInput,
		output: ForecastOutput,
		annotations: { readOnlyHint: true, idempotentHint: true },
		async run({ data }) {
			const profile = resolveCustomer(scope, data.customerId);
			const changes: ForecastChange[] = data.changes.map((change) => {
				switch (change.type) {
					case 'addExpense':
						return { type: 'addExpense', label: change.label, date: change.date, amountCents: eurToCents(change.amountEur) };
					case 'moveToSavings':
						return { type: 'moveToSavings', date: change.date, amountCents: eurToCents(change.amountEur) };
					case 'addIncome':
						return { type: 'addIncome', label: change.label, date: change.date, amountCents: eurToCents(change.amountEur) };
					case 'changeIncome':
						return {
							type: 'changeIncome',
							percentChange: change.percentChange,
							newMonthlyCents: change.newMonthlyEur != null ? eurToCents(change.newMonthlyEur) : undefined,
						};
					default:
						return change;
				}
			});
			const result = forecastCashflow({
				customerId: profile.customerId,
				asOf: AS_OF,
				rows: getCustomerRows(profile.customerId),
				floorCents: data.floorEur != null ? eurToCents(data.floorEur) : null,
				changes,
			});
			return { output: result };
		},
	});
}
