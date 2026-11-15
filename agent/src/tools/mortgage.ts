// Two slim mortgage tools. The agent finds homes, rates and offers itself (Exa, or the
// mortgage-demo skill files) and passes the figures in. The tools calculate all money.
// - mortgage_calculator: affordability from the customer's own history, and offers ranked over the stay.
// - search_mortgage_cases: similar cases among the 200 synthetic applications.

import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { AS_OF, getCustomerRows } from '../data/store.ts';
import { eurToCents, money } from '../finance/money.ts';
import { buyerProfile, checkHome, defaultBufferCents, limits, type Home } from '../mortgage/affordability.ts';
import { similarApplications } from '../mortgage/applications.ts';
import { summarise, structureWarnings, type LoanTerms } from '../mortgage/calc.ts';
import { CustomerId, resolveCustomer, type ToolScope } from './shared.ts';

const Eur = (max: number) => v.pipe(v.number(), v.minValue(0), v.maxValue(max));
const Label = v.pipe(v.string(), v.minLength(1), v.maxLength(160));
const Source = v.optional(v.pipe(v.string(), v.maxLength(500), v.description('Where the figures come from: a URL, or "mortgage-demo HOMES.md".')));

const HomeInput = v.object({
	label: v.pipe(Label, v.description('Address and area, for example "Tikkurilantie 35, Vantaa".')),
	sellingPriceEur: v.pipe(Eur(20_000_000), v.minValue(1), v.description('Myyntihinta.')),
	debtFreePriceEur: v.optional(v.pipe(Eur(20_000_000), v.description('Velaton hinta. Leave out if it is the same as the selling price.'))),
	maintenanceChargeEur: v.optional(v.pipe(Eur(20_000), v.description('Hoitovastike a month.')), 0),
	financeChargeEur: v.optional(v.pipe(Eur(20_000), v.description('Rahoitusvastike or pääomavastike a month.')), 0),
	otherMonthlyEur: v.optional(v.pipe(Eur(20_000), v.description('Other fixed costs a month, for example parking.')), 0),
	source: Source,
});

const OfferInput = v.object({
	label: v.pipe(Label, v.description('For example "Offer C" or "Nordea example terms".')),
	marginPercent: v.pipe(v.number(), v.minValue(0), v.maxValue(10), v.description('Margin over the 12-month Euribor.')),
	termYears: v.pipe(v.number(), v.minValue(1), v.maxValue(40)),
	repayment: v.optional(v.picklist(['annuity', 'equal_instalments']), 'annuity'),
	introMarginPercent: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(10), v.description('A campaign margin for the first months.'))),
	introMonths: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120))),
	interestOnlyMonths: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(120), v.description('Months at the start without repayment (lyhennysvapaa).'))),
	openingFeePercent: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(10))),
	openingFeeEur: v.optional(v.pipe(Eur(100_000), v.description('A fixed opening fee, or the minimum fee when openingFeePercent is also given.'))),
	monthlyFeeEur: v.optional(Eur(100), 0),
	source: Source,
});

const CalculatorInput = v.object({
	customerId: v.optional(CustomerId),
	homes: v.pipe(v.array(HomeInput), v.minLength(1), v.maxLength(6)),
	offers: v.optional(v.pipe(v.array(OfferInput), v.maxLength(6), v.description('Loan offers to compare for each home the user can afford. Leave out to check affordability only.')), []),
	euribor12mPercent: v.pipe(v.number(), v.minValue(-1), v.maxValue(15), v.description('The 12-month Euribor now, in percent. Find it with web_search, or use the dated value in the mortgage-demo files.')),
	euriborSource: v.pipe(Label, v.description('Where the Euribor value comes from, with its date.')),
	stayYears: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(40), v.description('How long the user plans to live in the home. Default 12.')), 12),
	ownFundsEur: v.optional(v.pipe(Eur(20_000_000), v.description('Own money for the purchase. Leave out to use the account balance now. Add investments only if the user says to.'))),
	bufferEur: v.optional(v.pipe(Eur(5_000_000), v.description('Money to keep after buying. Leave out to keep 3 months of everyday spending and housing.'))),
	otherDebtPaymentsEur: v.optional(v.pipe(Eur(100_000), v.description('Monthly payments on other loans, if the user says. Default 0.'))),
	loanEur: v.optional(v.pipe(Eur(20_000_000), v.minValue(1), v.description('Compare the offers on this loan amount instead of the loan each home needs.'))),
});

const CALCULATOR_DESCRIPTION = `Mortgage calculator for one customer. You give the homes and the loan offers (from Exa or the mortgage-demo
skill files) and the 12-month Euribor. The tool reads the customer's own income, rent and savings from the data.

Returns:
- buyer: net salary, housing payment now (taken to be rent), surplus, savings, safety buffer;
- limits: the maximum loan by the bank rule (FIN-FSA: debt payments at 6% at most 60% of net income) and by the
  stricter dataset rule;
- for each home: true (debt-free) price, transfer tax, cash needed, deposit, loan, stress test, monthly housing cost
  against rent now, a verdict (comfortable, possible_but_tight, not_affordable) with reasons;
- for each home that is not out of reach: the offers ranked by cost (interest + fees) over the stay, the loan left
  when the stay ends, the payment in each phase, at 6% and if rates rise 2 points, and warnings about the structure.
Use it once with all homes and offers. For a custom question ("what if I pay it off in 7 years?") pass one offer
with that term. Quote the display values and the reasons. A verdict is never a loan approval.`;

type Offer = v.InferOutput<typeof OfferInput>;

function terms(o: Offer, loanCents: number, euribor: number): LoanTerms {
	const percentFee = o.openingFeePercent != null ? Math.round(loanCents * (o.openingFeePercent / 100)) : 0;
	return {
		principalCents: loanCents,
		termMonths: Math.round(o.termYears * 12),
		repayment: o.repayment,
		referenceRatePercent: euribor,
		marginPercent: o.marginPercent,
		introMarginPercent: o.introMarginPercent,
		introMonths: o.introMonths,
		interestOnlyMonths: o.interestOnlyMonths,
		openingFeeCents: Math.max(percentFee, eurToCents(o.openingFeeEur ?? 0)),
		monthlyFeeCents: eurToCents(o.monthlyFeeEur),
	};
}

export function rankOffers(offers: Offer[], loanCents: number, chargesCents: number, euribor: number, stayYears: number) {
	const rows = offers.map((o) => {
		const t = terms(o, loanCents, euribor);
		const s = summarise(t, [stayYears]);
		return {
			offer: o.label,
			ratePercentNow: s.ratePercentNow,
			termYears: s.termYears,
			openingFee: money(t.openingFeeCents),
			firstPayment: s.firstPayment,
			regularPayment: s.regularPayment,
			phases: s.phases,
			monthlyHousingCost: money(s.regularPayment.cents + chargesCents),
			stressPayment: s.stressPayment,
			paymentIfRatesRise: s.paymentIfRatesRise,
			overStay: s.horizons[0],
			fullTermCost: s.fullTerm.cost,
			warnings: structureWarnings(t, stayYears),
			source: o.source ?? null,
		};
	});
	const best = Math.min(...rows.map((r) => r.overStay.cost.cents));
	const bestLeft = Math.min(...rows.map((r) => r.overStay.balanceLeft.cents));
	return [...rows]
		.sort((a, b) => a.overStay.cost.cents - b.overStay.cost.cents)
		.map((r, i) => ({ rank: i + 1, ...r, extraCostVsBest: money(r.overStay.cost.cents - best), extraLoanLeftVsBest: money(r.overStay.balanceLeft.cents - bestLeft) }));
}

export function makeMortgageCalculatorTool(scope: ToolScope) {
	return defineTool({
		name: 'mortgage_calculator',
		description: CALCULATOR_DESCRIPTION,
		input: CalculatorInput,
		annotations: { readOnlyHint: true, idempotentHint: true },
		async run({ data }) {
			const customer = resolveCustomer(scope, data.customerId);
			const profile = buyerProfile(getCustomerRows(customer.customerId), AS_OF);
			const ownFunds = data.ownFundsEur != null ? eurToCents(data.ownFundsEur) : profile.balanceNow.cents;
			const buffer = data.bufferEur != null ? eurToCents(data.bufferEur) : defaultBufferCents(profile);
			const otherDebt = eurToCents(data.otherDebtPaymentsEur ?? 0);
			// The housing cost in the affordability check uses the lowest margin given, or a typical 0.5%.
			const typicalMargin = data.offers.length ? Math.min(...data.offers.map((o) => o.marginPercent)) : 0.5;
			const homes = data.homes.map((h) => {
				const home: Home = {
					label: h.label,
					sellingPriceEur: h.sellingPriceEur,
					debtFreePriceEur: Math.max(h.debtFreePriceEur ?? h.sellingPriceEur, h.sellingPriceEur),
					maintenanceChargeEur: h.maintenanceChargeEur,
					financeChargeEur: h.financeChargeEur,
					otherMonthlyEur: h.otherMonthlyEur,
				};
				const check = checkHome({
					home,
					netSalaryCents: profile.netSalary.cents,
					housingNowCents: profile.housingPaymentNow.cents,
					ownFundsCents: ownFunds,
					bufferCents: buffer,
					ratePercentNow: data.euribor12mPercent + typicalMargin,
					otherDebtPaymentsCents: otherDebt,
				});
				const loan = data.loanEur != null ? eurToCents(data.loanEur) : check.loanNeeded.cents;
				const compare = data.offers.length > 0 && check.verdict !== 'not_affordable' && loan > 0;
				return {
					...check,
					source: h.source ?? null,
					offers: compare ? { loan: money(loan), ranking: rankOffers(data.offers, loan, check.monthlyCharges.cents, data.euribor12mPercent, data.stayYears) } : null,
				};
			});
			return {
				output: {
					asOf: AS_OF,
					euribor12m: { percent: data.euribor12mPercent, source: data.euriborSource },
					stayYears: data.stayYears,
					buyer: { ...profile, ownFunds: money(ownFunds), ownFundsSource: data.ownFundsEur != null ? 'given' : 'account balance now', safetyBuffer: money(buffer) },
					limits: limits(profile.netSalary.cents, otherDebt),
					housingCostAssumes: `25-year annuity at the 12-month Euribor + ${typicalMargin}%`,
					homes,
					note: 'Offers are ranked by interest + fees over the stay. Loan left is what you still owe when you sell. Listings, rates and terms change; check them with the seller and the bank. This is education, not a credit decision.',
				} as unknown as Record<string, never>,
			};
		},
	});
}

const CasesInput = v.object({
	priceEur: v.pipe(Eur(20_000_000), v.minValue(1)),
	loanEur: v.pipe(Eur(20_000_000), v.minValue(1)),
	netSalaryEur: v.optional(v.pipe(Eur(1_000_000), v.description('The user\'s monthly net salary from mortgage_calculator, to compare with the required income of similar cases.'))),
	propertyType: v.optional(v.picklist(['apartment', 'terraced_house', 'detached_house'])),
	outcome: v.optional(v.picklist(['approved', 'rejected'])),
	limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10)), 5),
});

const CASES_DESCRIPTION = `Search the 200 synthetic mortgage applications in the Junction S-Pankki dataset for cases like the user's.
Returns the nearest cases by price and loan (approved or rejected, and why), outcome counts for loans within 10%,
the typical own funds and bank valuation of approved cases, and the required income of similar loans.
Filter by property type or outcome. It shows patterns; it does not predict a decision.`;

export function makeSearchMortgageCasesTool() {
	return defineTool({
		name: 'search_mortgage_cases',
		description: CASES_DESCRIPTION,
		input: CasesInput,
		annotations: { readOnlyHint: true, idempotentHint: true },
		async run({ data }) {
			return { output: similarApplications({ ...data, asOf: AS_OF }) as unknown as Record<string, never> };
		},
	});
}
