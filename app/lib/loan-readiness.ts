// Loan readiness: rule-based education about a home purchase. It is not a credit decision,
// a score or an approval prediction. Inputs come from the forecast, the user's assumptions or
// an application record; every figure says which. Money is integer cents, rounded once.
import type { Assumptions, Forecast } from './finance';
import type { MortgageView } from './personas/view';

/** FIN-FSA loan cap: housing loans up to 95% of the purchase price for all buyers since 1 July 2026. */
export const LOAN_CAP_PERCENT = 95, LOAN_CAP_LTV = LOAN_CAP_PERCENT/100;
const OWN_FUNDS_PERCENT = 100-LOAN_CAP_PERCENT;
const LOAN_CAP_SOURCE = 'https://www.finanssivalvonta.fi/en/consumers/borrowing/housing-loans-and-loan-cap/';
/** The synthetic dataset's required income: a 6%, 25-year annuity payment divided by 0.35. */
export const STRESS_RATE = 0.06, STRESS_YEARS = 25, REQUIRED_INCOME_SHARE = 0.35;
export const BUFFER_TARGET_MONTHS = 3;

/** Monthly annuity payment in cents. */
export function annuityCents(principalCents:number, annualRate:number, years:number) {
  const r=annualRate/12, n=years*12;
  return Math.round(r===0?principalCents/n:principalCents*r/(1-(1+r)**-n));
}
const stressFactor=annuityCents(1_000_000_00,STRESS_RATE,STRESS_YEARS)/1_000_000_00/REQUIRED_INCOME_SHARE;
const requiredIncome=(loanCents:number)=>Math.round(loanCents*stressFactor);
const maxLoanForIncome=(incomeCents:number)=>Math.floor(incomeCents/stressFactor);

export type MarketRate = { annualPercent:number; month:string; source:string; label:string };
export type ReadinessInput = {
  forecast: Pick<Forecast,'salaryCents'|'balanceCents'|'consumptionCents'|'existingSavingsCents'|'salarySweepCents'|'baskets'>;
  assumptions: Pick<Assumptions,'homePriceCents'|'homeSavingsCents'>;
  mortgage: MortgageView|null;
  marketRate: MarketRate|null;
  termYears?: number;
};
type Status = 'met'|'short'|'unknown';

export function loanReadiness({forecast:f,assumptions:a,mortgage,marketRate,termYears=25}:ReadinessInput) {
  // An application record, when there is one, is the most specific source for the purchase.
  const fromRecord=mortgage?.priceCents!=null&&mortgage.equityCents!=null;
  const priceCents=fromRecord?mortgage!.priceCents!:a.homePriceCents;
  const equityCents=fromRecord?mortgage!.equityCents!:a.homeSavingsCents;
  const source=fromRecord?`Application record ${mortgage!.applicationId}`:'Your assumption';
  const loanCents=Math.max(0,priceCents-equityCents);
  const incomeCents=f.salaryCents;
  const essentialsCents=f.baskets.regular;
  const surplusCents=f.salaryCents-f.consumptionCents-f.existingSavingsCents-f.salarySweepCents;

  // Integer percentages keep cent amounts exact.
  const depositNeededCents=Math.ceil(priceCents*OWN_FUNDS_PERCENT/100);
  const requiredIncomeCents=requiredIncome(loanCents);
  const stressPaymentCents=annuityCents(loanCents,STRESS_RATE,STRESS_YEARS);
  const marketPaymentCents=marketRate?annuityCents(loanCents,marketRate.annualPercent/100,termYears):null;
  const bufferMonths=essentialsCents>0?Math.floor(f.balanceCents*10/essentialsCents)/10:null;
  const status=(ok:boolean|null):Status=>ok===null?'unknown':ok?'met':'short';

  const checks=[
    {id:'deposit',label:'Deposit for the loan cap',status:status(equityCents>=depositNeededCents),
     valueCents:equityCents,targetCents:depositNeededCents,gapCents:Math.max(0,depositNeededCents-equityCents),
     explanation:`A housing loan can cover at most ${LOAN_CAP_PERCENT}% of the price, so at least ${OWN_FUNDS_PERCENT}% must come from your own funds or extra collateral.`,
     source:LOAN_CAP_SOURCE},
    {id:'income',label:'Income at a 6% stress rate',status:status(incomeCents>0?incomeCents>=requiredIncomeCents:null),
     valueCents:incomeCents,targetCents:requiredIncomeCents,gapCents:Math.max(0,requiredIncomeCents-incomeCents),
     explanation:`In this dataset, required income is the monthly payment at 6% over 25 years divided by 0.35. It tests whether payments stay manageable if rates rise; it is not a lending rule.`,
     source:'Synthetic Junction mortgage dataset calculation'},
    {id:'buffer',label:'Cash buffer for essentials',status:status(bufferMonths===null?null:bufferMonths>=BUFFER_TARGET_MONTHS),
     valueMonths:bufferMonths,targetMonths:BUFFER_TARGET_MONTHS,
     explanation:'Months of regular essentials this account balance would cover. Buying a home brings new costs, so a cushion matters after the deposit too.',
     source:'Recorded balance and regular basket'},
  ];

  // What would close the gaps for this price: more own funds, or a lower price.
  const maxLoanCents=maxLoanForIncome(incomeCents);
  const extraEquityCents=Math.max(0,priceCents-maxLoanCents-equityCents,depositNeededCents-equityCents);
  const maxPriceCents=Math.max(0,Math.min(maxLoanCents+equityCents,Math.floor(equityCents*100/OWN_FUNDS_PERCENT)));

  return {
    label:'Loan readiness (education, not a credit decision)' as const,
    basis:{priceCents,equityCents,loanCents,source,incomeCents,incomeSource:'Median monthly salary paid into this account over 12 months',
      ltv:priceCents?Math.round(loanCents/priceCents*10000)/10000:null},
    checks,
    payments:{
      stress:{monthlyCents:stressPaymentCents,annualPercent:STRESS_RATE*100,years:STRESS_YEARS,shareOfIncome:incomeCents?Math.round(stressPaymentCents/incomeCents*1000)/1000:null},
      market:marketRate&&marketPaymentCents!==null?{monthlyCents:marketPaymentCents,annualPercent:Math.round(marketRate.annualPercent*1000)/1000,years:termYears,month:marketRate.month,source:marketRate.source,label:marketRate.label,
        shareOfIncome:incomeCents?Math.round(marketPaymentCents/incomeCents*1000)/1000:null}:null,
    },
    whatItWouldTake:{
      maxLoanAtIncomeCents:maxLoanCents,
      maxPriceCents,
      extraEquityCents,
      extraMonthlyIncomeCents:Math.max(0,requiredIncomeCents-incomeCents),
      monthlySurplusCents:surplusCents,
      monthsToSaveExtraEquity:extraEquityCents===0?0:surplusCents>0?Math.ceil(extraEquityCents/surplusCents):null,
    },
    notes:[
      ...(equityCents>f.balanceCents?['The deposit is larger than this account balance, so part of it must come from savings elsewhere.']:[]),
      ...(f.salarySweepCents?['Most salary moves on to another account, so savings held there are not visible here.']:[]),
      'Banks also look at existing debts, the property and their own criteria. Ask a bank for an actual decision.',
    ],
  };
}
export type LoanReadiness=ReturnType<typeof loanReadiness>;
