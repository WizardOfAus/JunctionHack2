// The 200 synthetic mortgage applications of the Junction dataset, final outcomes only.
// Used to show how similar cases ended. Synthetic data: no real person is behind a case.
// Tool output leaves out the application id: the persona files map ids to customers, and a locked
// conversation must not point at another customer's case.

import data from './applications.json' with { type: 'json' };
import { money } from '../finance/money.ts';

export interface Application {
	id: string;
	outcome: 'approved' | 'rejected';
	reason: string | null;
	propertyType: string | null;
	priceEur: number;
	loanEur: number;
	equityEur: number;
	collateralEur: number;
	requiredIncomeEur: number;
	appliedOn: string | null;
	decidedOn: string | null;
}

export const APPLICATIONS = data.applications as Application[];

export interface SimilarQuery {
	priceEur: number;
	loanEur: number;
	netSalaryEur?: number;
	propertyType?: string;
	outcome?: 'approved' | 'rejected';
	asOf: string;
	limit: number;
}

const REASONS: Record<string, string> = {
	insufficient_collateral: 'the bank valued the home (collateral) too low for the loan',
	insufficient_income: 'income was too low for the loan',
	insufficient_equity: 'too little own money (deposit)',
	existing_debt: 'existing debts were too high',
};

function view(a: Application) {
	return {
		outcome: a.outcome,
		reason: a.reason ? REASONS[a.reason] ?? a.reason.replaceAll('_', ' ') : null,
		propertyType: a.propertyType?.replaceAll('_', ' ') ?? null,
		price: money(a.priceEur * 100),
		loan: money(a.loanEur * 100),
		ownFunds: money(a.equityEur * 100),
		loanToValuePercent: Math.round((a.loanEur / a.priceEur) * 1000) / 10,
		bankValuation: money(a.collateralEur * 100),
		bankValuationShareOfPricePercent: Math.round((a.collateralEur / a.priceEur) * 1000) / 10,
		requiredMonthlyIncome: money(a.requiredIncomeEur * 100),
		decidedOn: a.decidedOn,
	};
}

/** Nearest cases by price and loan (relative distance), decided before asOf. */
export function similarApplications(q: SimilarQuery) {
	const pool = APPLICATIONS.filter((a) => (a.decidedOn ?? '') < q.asOf && (!q.propertyType || a.propertyType === q.propertyType));
	const dist = (a: Application) => Math.hypot((a.priceEur - q.priceEur) / q.priceEur, (a.loanEur - q.loanEur) / Math.max(q.loanEur, 1));
	const nearest = [...pool].filter((a) => !q.outcome || a.outcome === q.outcome).sort((a, b) => dist(a) - dist(b)).slice(0, q.limit);
	// A band of +-10% around the loan, to count outcomes.
	const band = pool.filter((a) => Math.abs(a.loanEur - q.loanEur) <= q.loanEur * 0.1);
	const counts: Record<string, number> = {};
	for (const a of band) {
		const key = a.outcome === 'approved' ? 'approved' : `rejected: ${REASONS[a.reason ?? ''] ?? a.reason}`;
		counts[key] = (counts[key] ?? 0) + 1;
	}
	const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
	const approvedBand = band.filter((a) => a.outcome === 'approved');
	return {
		casesInDataset: pool.length,
		similarLoanBand: { from: money(q.loanEur * 90), to: money(q.loanEur * 110), cases: band.length, outcomes: counts },
		typicalApprovedInBand: approvedBand.length ? {
			ownFundsSharePercent: median(approvedBand.map((a) => Math.round((a.equityEur / a.priceEur) * 1000) / 10)),
			bankValuationShareOfPricePercent: median(approvedBand.map((a) => Math.round((a.collateralEur / a.priceEur) * 1000) / 10)),
		} : null,
		incomeVsDatasetRule: q.netSalaryEur != null && nearest.length ? {
			yourIncome: money(q.netSalaryEur * 100),
			requiredForSimilarLoans: money(median(nearest.map((a) => a.requiredIncomeEur)) * 100),
		} : null,
		nearest: nearest.map(view),
		notes: [
			'These are synthetic applications from the Junction S-Pankki dataset. They show patterns; they do not predict a decision.',
			'In the dataset, the bank valuation is usually below the price. Rejections for collateral are the most common kind.',
			'Outcomes are not a simple formula: some applications below the required income were approved.',
		],
	};
}

export type SimilarResult = ReturnType<typeof similarApplications>;
