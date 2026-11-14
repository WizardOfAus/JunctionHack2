import { makeForecastCashflowTool } from './forecast-cashflow.ts';
import { makeProjectGoalTool } from './project-goal.ts';
import { makeFindCustomersTool, makeQueryTransactionsTool } from './query-transactions.ts';
import type { ToolScope } from './shared.ts';

export type { ToolScope } from './shared.ts';

const cache = new Map<string, ReturnType<typeof build>>();

function build(scope: ToolScope) {
	return {
		queryTransactions: makeQueryTransactionsTool(scope),
		findCustomers: makeFindCustomersTool(scope),
		forecastCashflow: makeForecastCashflowTool(scope),
		projectGoal: makeProjectGoalTool(scope),
	};
}

/** Tool definitions for one scope. Cached, so each render gets the same objects. */
export function kotiTools(scope: ToolScope) {
	const key = scope.lockedCustomerId ?? '*';
	let tools = cache.get(key);
	if (!tools) cache.set(key, (tools = build(scope)));
	return tools;
}
