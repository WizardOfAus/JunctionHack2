// Pure persona presentation: no data imports, so it runs in tests and on the server.
import type { Clock } from '../finance';

export type CatalogueEntry = { id: string; customerId: string; label: string; story: string; suggestedGoal: string };
type Area = { nameFi: string|null; nameSv: string|null; municipality: string|null; source: string|null; licence: string|null };
export type MortgageEvent = {
  timestamp: string; eventType: string; propertyId: string|null; propertyType: string|null;
  priceCents: number|null; loanCents: number|null; equityCents: number|null; collateralType: string|null;
  collateralValueCents: number|null; collateralStatus: string|null; decision: string|null; rejectionReason: string|null;
  expenseType: string|null; expenseCents: number|null; note: string;
};
export type PersonaRecord = {
  customerId: string; accountId: string; rowCount: number; lastRowDate: string;
  customer: { age: number; postalCode: string; area: Area };
  mortgage: null | {
    applicationId: string;
    final: { decision: string; rejectionReason: string|null; priceCents: number; loanCents: number; equityCents: number; collateralValueCents: number; requiredMonthlyIncomeCents: number };
    events: MortgageEvent[];
  };
};

// Required income in this synthetic dataset equals a 6%, 25-year annuity payment divided by 0.35.
// It is a dataset calculation, not a bank's lending rule or an approval prediction.
const r=0.06/12;
export const REQUIRED_INCOME_PER_LOAN_EURO=r/(1-(1+r)**-300)/0.35;
const SOURCE='hackjunction/Junction-2026-S-pankki mortgage files at fbdecde (synthetic)';

/** The application record as it was known on the clock's last history day. Later events stay hidden. */
export function mortgageAt(record:PersonaRecord['mortgage'],clock:Clock) {
  if(!record) return null;
  const visible=record.events.filter(e=>e.timestamp.slice(0,10)<=clock.historyThrough);
  if(!visible.length) return null;
  const latest=(type:string)=>[...visible].reverse().find(e=>e.eventType===type);
  const decision=latest('loan_decision');
  const calculation=latest('loan_calculation');
  const propertyId=[...visible].reverse().find(e=>e.propertyId)?.propertyId??null;
  const propertyType=visible.find(e=>e.propertyId===propertyId&&e.propertyType)?.propertyType??null;
  // A decided application uses its recorded final figures; an open one shows only what was recorded so far.
  const figures=decision?record.final:{
    loanCents:calculation?.loanCents??null, equityCents:calculation?.equityCents??null,
    priceCents:calculation?.loanCents!=null&&calculation?.equityCents!=null?calculation.loanCents+calculation.equityCents:null,
    collateralValueCents:latest('collateral_valuation')?.collateralValueCents??null,
  };
  const loan=figures.loanCents;
  return {
    label:'Application record' as const,
    applicationId:record.applicationId,
    status:(decision?(decision.decision==='approved'?'approved':'rejected'):'in_progress') as 'approved'|'rejected'|'in_progress',
    statusDate:(decision??visible.at(-1)!).timestamp.slice(0,10),
    rejectionReason:decision?record.final.rejectionReason:null,
    propertyType,
    priceCents:figures.priceCents,
    loanCents:loan,
    equityCents:figures.equityCents,
    collateralValueCents:figures.collateralValueCents,
    ltv:loan!=null&&figures.priceCents?Math.round(loan/figures.priceCents*10000)/10000:null,
    requiredMonthlyIncomeCents:loan!=null?Math.round(loan*REQUIRED_INCOME_PER_LOAN_EURO):null,
    requiredIncomeBasis:'Dataset calculation: a 6%, 25-year annuity payment divided by 0.35. Not a lending rule or an approval prediction.',
    expenses:visible.filter(e=>e.expenseType).map(e=>({date:e.timestamp.slice(0,10),type:e.expenseType!,amountCents:e.expenseCents})),
    timeline:visible.map(e=>({date:e.timestamp.slice(0,10),eventType:e.eventType,note:e.note})),
    source:SOURCE,
  };
}
export type MortgageView=NonNullable<ReturnType<typeof mortgageAt>>;

export function personaView(entry:CatalogueEntry,record:PersonaRecord,clock:Clock) {
  const {age,postalCode,area}=record.customer;
  return {
    id:entry.id, label:entry.label, story:entry.story, suggestedGoal:entry.suggestedGoal, synthetic:true as const,
    customer:{
      age, postalCode,
      ageNote:age===18?'Recorded as 18. The dataset appears to floor ages at 18, so the real value may be lower or unknown.':null,
      area:area.nameFi?{name:area.nameFi,municipality:area.municipality,source:area.source,licence:area.licence}:null,
    },
    account:{customerId:record.customerId,accountId:record.accountId,historyThrough:clock.historyThrough},
    mortgage:mortgageAt(record.mortgage,clock),
  };
}
export type PersonaView=ReturnType<typeof personaView>;
