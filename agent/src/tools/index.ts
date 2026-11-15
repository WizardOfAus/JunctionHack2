import { makeEvaluateAspProgressTool } from './evaluate-asp-progress.ts';
import { makeForecastCashflowTool } from './forecast-cashflow.ts';
import { makeProjectGoalTool } from './project-goal.ts';
import { makeMortgageCalculatorTool, makeSearchMortgageCasesTool } from './mortgage.ts';
import { makeFindCustomersTool, makeQueryTransactionsTool } from './query-transactions.ts';
import type { ToolScope } from './shared.ts';
import { exaApiKey, makeDeepResearchTool, makeReadPageTool, makeWebSearchTool } from './web-search.ts';

export type { ToolScope } from './shared.ts';

const cache = new Map<string, ReturnType<typeof build>>();

function build(scope: ToolScope) {
	return {
		queryTransactions: makeQueryTransactionsTool(scope),
		findCustomers: makeFindCustomersTool(scope),
		forecastCashflow: makeForecastCashflowTool(scope),
		projectGoal: makeProjectGoalTool(scope),
		evaluateAspProgress: makeEvaluateAspProgressTool(),
		mortgage: {
			calculator: makeMortgageCalculatorTool(scope),
			searchCases: makeSearchMortgageCasesTool(),
		},
	};
}

let webTools: {
	webSearch: ReturnType<typeof makeWebSearchTool>;
	deepResearch: ReturnType<typeof makeDeepResearchTool>;
	readPage: ReturnType<typeof makeReadPageTool>;
} | null | undefined;

/** Exa web tools. Null when EXA_API_KEY is not set. Cached, so each render gets the same objects. */
export function kotiWebTools() {
	if (webTools === undefined) {
		const apiKey = exaApiKey();
		webTools = apiKey ? { webSearch: makeWebSearchTool(apiKey), deepResearch: makeDeepResearchTool(apiKey), readPage: makeReadPageTool(apiKey) } : null;
	}
	return webTools;
}

/** Tool definitions for one scope. Cached, so each render gets the same objects. */
export function kotiTools(scope: ToolScope) {
	const key = scope.lockedCustomerId ?? '*';
	let tools = cache.get(key);
	if (!tools) cache.set(key, (tools = build(scope)));
	return tools;
}
