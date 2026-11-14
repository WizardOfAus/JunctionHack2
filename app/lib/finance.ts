export const DEMO_DATE = '2026-09-01';
export const VERSION = 'koti-cashflow-1.0';
export type Basket = 'regular' | 'irregular' | 'flexible';
export type Transaction = {
  id: string; sourceRow: number; customer_id: string; bank_account_id: string;
  tx_date: string; tx_timestamp: string; category: string; transaction_type: string;
  merchant_id: string; mcc_code: string; amountCents: number; balanceCents: number;
};
export type Assumptions = {
  reserveCents: number; irregularReserveCents: number; homePriceCents: number;
  homeSavingsCents: number; monthlyHomeCents: number; allocationCents: number;
  unexpectedCents: number; restaurantReduction: number; incomeDelayDays: number;
  coverageConfirmed: boolean; stale: boolean; connected: boolean;
  corrections: Record<string, Basket>; aspOpenedOn: string; aspDeposits: {date:string; amountCents:number}[];
};
export const defaults: Assumptions = {
  reserveCents: 300000, irregularReserveCents: 50000, homePriceCents: 18000000,
  homeSavingsCents: 0, monthlyHomeCents: 20000, allocationCents: 0,
  unexpectedCents: 0, restaurantReduction: 0, incomeDelayDays: 0,
  coverageConfirmed: true, stale: false, connected: true, corrections: {},
  aspOpenedOn: '', aspDeposits: [],
};
export const euro = (cents: number, digits = 0) => new Intl.NumberFormat('en-IE', {style:'currency',currency:'EUR',minimumFractionDigits:digits,maximumFractionDigits:digits}).format(cents / 100);
export function median(values: number[]) { const s=[...values].sort((a,b)=>a-b); return !s.length?0:s.length%2?s[(s.length-1)/2]:Math.round((s[s.length/2-1]+s[s.length/2])/2); }
export const sum = (values: number[]) => values.reduce((a,b)=>a+b,0);
export function isSaving(t:Transaction) { return t.transaction_type === 'investment_deposit' || t.transaction_type === 'savings_transfer'; }
export function isConsumption(t:Transaction) { return t.amountCents<0 && !isSaving(t) && t.transaction_type !== 'internal_transfer'; }
export function basketOf(t:Transaction, corrections:Record<string,Basket>={}) : Basket {
  if(corrections[t.id]) return corrections[t.id];
  if(['Housing','Utilities','Groceries','Insurance'].includes(t.category)) return 'regular';
  if(['Restaurants','Entertainment','Lifestyle'].includes(t.category)) return 'flexible';
  return 'irregular';
}
export function historyOnly(rows:Transaction[]) { return rows.filter(t=>t.customer_id==='CUST04859' && t.tx_date<DEMO_DATE).sort((a,b)=>a.tx_date.localeCompare(b.tx_date)||a.sourceRow-b.sourceRow); }
export function monthlyAverage(rows:Transaction[], predicate:(t:Transaction)=>boolean, months=['2026-06','2026-07','2026-08']) {
  return Math.round(sum(rows.filter(t=>months.includes(t.tx_date.slice(0,7))&&predicate(t)).map(t=>Math.abs(t.amountCents)))/months.length);
}
export function summarise(rows:Transaction[],from='2026-06-01',to='2026-08-31',category?:string) {
  const selected=historyOnly(rows).filter(t=>t.tx_date>=from&&t.tx_date<=to&&(!category||t.category===category));
  const groups:Record<string,number>={};
  for(const t of selected) if(isConsumption(t)) groups[t.category]=(groups[t.category]||0)-t.amountCents;
  return {from,to,count:selected.length,spentCents:sum(selected.filter(isConsumption).map(t=>-t.amountCents)),incomeCents:sum(selected.filter(t=>t.transaction_type==='salary').map(t=>t.amountCents)),groups,evidence:selected.map(t=>t.id),rows:selected};
}
const addDays=(iso:string,n:number)=>new Date(Date.parse(iso+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function forecast(rows:Transaction[],a:Assumptions) {
  const history=historyOnly(rows);
  const balance=history.at(-1)?.balanceCents||0;
  const months=Array.from({length:12},(_,i)=>new Date(Date.UTC(2025,8+i,1)).toISOString().slice(0,7));
  const salary=median(months.map(m=>sum(history.filter(t=>t.tx_date.startsWith(m)&&t.transaction_type==='salary').map(t=>t.amountCents))));
  const savings=median(months.map(m=>sum(history.filter(t=>t.tx_date.startsWith(m)&&isSaving(t)).map(t=>-t.amountCents))));
  const housing=Math.max(0,...history.filter(t=>t.tx_date>='2026-06-01'&&t.category==='Housing'&&isConsumption(t)).map(t=>-t.amountCents));
  const restaurant=monthlyAverage(history,t=>t.category==='Restaurants'&&isConsumption(t));
  const reducibleRestaurant=monthlyAverage(history,t=>t.category==='Restaurants'&&isConsumption(t)&&basketOf(t,a.corrections)==='flexible');
  const reduction=Math.round(reducibleRestaurant*a.restaurantReduction/100);
  const otherDailyMonthly=monthlyAverage(history,t=>isConsumption(t)&&t.category!=='Housing')-reduction;
  const horizon=Math.max(35,15+a.incomeDelayDays);
  let running=balance-a.unexpectedCents;
  let minimum=running;
  const points:{date:string;balanceCents:number;incomeCents:number;costCents:number;label:string}[]=[];
  const incomeDates=[addDays('2026-09-15',a.incomeDelayDays),addDays('2026-10-15',a.incomeDelayDays),addDays('2026-11-15',a.incomeDelayDays)];
  for(let day=0;day<horizon;day++) {
    const date=addDays(DEMO_DATE,day); const dom=Number(date.slice(8));
    // Exact daily partition of the monthly estimate; no floating-point money.
    let cost=Math.floor(otherDailyMonthly*(day+1)/30)-Math.floor(otherDailyMonthly*day/30);
    let label='Estimated everyday costs';
    if(dom===2) {cost+=housing;label='Housing + everyday costs';}
    if(dom===20) {cost+=savings;label='Existing saving transfer + everyday costs';}
    const income=incomeDates.includes(date)?salary:0;
    running+=income-cost;minimum=Math.min(minimum,running);
    points.push({date,balanceCents:running,incomeCents:income,costCents:cost,label:income?'Estimated salary + everyday costs':label});
  }
  const floor=a.reserveCents+a.irregularReserveCents;
  // Also cap by present cash: future income never becomes cash already held.
  const rawCapacity=Math.max(0,Math.min(balance-a.unexpectedCents,minimum)-floor);
  const blocked=!a.connected||!a.coverageConfirmed||a.stale||balance<0;
  const capacity=blocked?0:rawCapacity;
  const allocation=Math.min(capacity,a.allocationCents);
  const remaining=capacity-allocation;
  const baskets:Record<Basket,number>={regular:0,irregular:0,flexible:0};
  for(const t of history.filter(t=>t.tx_date>='2026-06-01'&&isConsumption(t))) baskets[basketOf(t,a.corrections)]+=-t.amountCents;
  for(const key of Object.keys(baskets) as Basket[]) baskets[key]=Math.round(baskets[key]/3);
  const monthlyIncome=salary;
  const consumption=monthlyAverage(history,isConsumption);
  // The 28-day challenge is additional to existing investment deposits.
  const recurringCapacity=Math.max(0,monthlyIncome-consumption-savings+reduction);
  const challenge=Math.min(a.monthlyHomeCents,capacity,recurringCapacity);
  const warnings=[...(!a.connected?['Source disconnected. Reconnect the synthetic dataset to calculate.']:[]),...(!a.coverageConfirmed?['Confirm other obligations and account coverage before relying on this estimate.']:[]),...(a.stale?['Data marked stale. Refresh or review the source before allocating.']:[]),...(minimum<floor?['The projected balance falls below your protected reserve. Pause extra saving.']:[]),...(a.allocationCents>capacity?['Your requested allocation is above current capacity. The available amount has been reduced.']:[])];
  return {version:VERSION,asOf:DEMO_DATE,dataThrough:'2026-08-31',accountId:history[0]?.bank_account_id||'',balanceCents:balance,minimumCents:minimum,protectedCents:floor,capacityCents:capacity,allocationCents:allocation,remainingCents:remaining,weeklyExtraCents:Math.floor(remaining/5),salaryCents:salary,existingSavingsCents:savings,housingCents:housing,consumptionCents:consumption,restaurantCents:restaurant,protectedRestaurantCents:restaurant-reducibleRestaurant,reductionCents:reduction,baskets,points,warnings,blocked,horizonDays:horizon,challengeCents:challenge,assumptions:['Salary on the 15th, based on the past 12 months.','Housing on the 2nd at the highest amount in June–August.','Other spending spread daily using June–August averages.','Existing saving transfers on the 20th; their destination is unknown.','Goal, reserves and account coverage are editable demo assumptions.'],evidence:history.filter(t=>t.tx_date>='2026-06-01').map(t=>t.id)};
}
export type Forecast=ReturnType<typeof forecast>;
export function evaluateAsp(openedOn:string,deposits:{date:string;amountCents:number}[],asOf=DEMO_DATE) {
  const source='https://www.valtiokonttori.fi/en/services/financing-and-loans/asp-saving-and-asp-loans/';
  if(!openedOn) return {status:'unknown',months:0,required:20,source,message:'Add your ASP opening date and verified deposit history to assess qualifying months.'};
  if(openedOn<'2026-06-01') return {status:'legacy',months:0,required:20,source,message:'This account uses transitional rules. Ask your bank to verify the quarterly or mixed history.'};
  const totals:Record<string,number>={};
  for(const d of deposits) if(d.date>=openedOn&&d.date<asOf&&d.amountCents>0) totals[d.date.slice(0,7)]=(totals[d.date.slice(0,7)]||0)+d.amountCents;
  const months=Object.values(totals).filter(x=>x>=5000&&x<=150000).length;
  return {status:'monthly',months,required:20,source,message:'Monthly path from 1 June 2026: 20 qualifying months, €50–€1,500 per month. Months need not be consecutive.'};
}
export function depositReady(a:Assumptions,monthlyCents:number) {
  const target=Math.round(a.homePriceCents/10); const remaining=Math.max(0,target-a.homeSavingsCents);
  if(remaining===0) return {targetCents:target,months:0,date:DEMO_DATE};
  if(monthlyCents<=0) return {targetCents:target,months:null,date:null};
  const months=Math.ceil(remaining/monthlyCents);const d=new Date(Date.UTC(2026,8+months,1));
  return {targetCents:target,months,date:d.toISOString().slice(0,10)};
}
