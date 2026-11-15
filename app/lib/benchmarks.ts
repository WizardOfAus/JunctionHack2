// "People like you": compares a customer's average month with two reference groups.
// 1. The synthetic Junction population (docs/data-insights.md): percentiles overall, by salary
//    quintile and by age band. Only aggregates are used; no other customer's rows.
// 2. Statistics Finland's Household Budget Survey 2022, per consumption unit (one adult = 1).
// Descriptive only: a comparison, not advice or a judgement.
import type { Transaction } from './finance';

type Row = Record<string,string>;
export type BenchmarkTables = { overall: Row[]; byIncome: Row[]; byAge: Row[]; statfin: StatfinSnapshot };
export type StatfinSnapshot = { source:string; sourceUrl:string; licence:string; year:number; priceBasis:string;
  coicop:Record<string,string>; householdTypes:Record<string,{label:string;perHousehold:Record<string,number|null>;perConsumptionUnit:Record<string,number|null>}> };

/** Salary quintile edges of the synthetic population (euros a month), from docs/data-insights.md. */
const QUINTILE_EDGES_CENTS=[221800,283000,342300,421600];
const AGE_BANDS:[string,number,number][]=[['18-24',18,24],['25-34',25,34],['35-44',35,44],['45-54',45,54],['55-64',55,64],['65+',65,200]];
/** Dataset categories with a clean Household Budget Survey counterpart. */
const COICOP:Record<string,{code:string;note?:string}>={
  Groceries:{code:'01'}, Health:{code:'06'}, Transportation:{code:'07'}, Entertainment:{code:'09'},
  Restaurants:{code:'11',note:'The survey line also includes hotels and other accommodation.'},
};
const PERCENTILES=['p10','p25','p50','p75','p90'] as const;
const cents=(euros:string|undefined)=>euros===undefined||euros===''?null:Math.round(Number(euros)*100);

function position(value:number,p:Record<(typeof PERCENTILES)[number],number>) {
  if(value>=p.p90) return {band:'top 10%',words:'higher than about 9 in 10 people'};
  if(value>=p.p75) return {band:'p75–p90',words:'higher than most people'};
  if(value>p.p25) return {band:'p25–p75',words:'about typical'};
  if(value>p.p10) return {band:'p10–p25',words:'lower than most people'};
  return {band:'bottom 10%',words:'lower than about 9 in 10 people'};
}

/** Months spanned by the history, counting the first and last month. */
function monthsSpanned(rows:Transaction[]) {
  if(!rows.length) return 0;
  const [a,b]=[rows[0].tx_date,rows.at(-1)!.tx_date];
  return (Number(b.slice(0,4))-Number(a.slice(0,4)))*12+Number(b.slice(5,7))-Number(a.slice(5,7))+1;
}

export function benchmarks(input:{rows:Transaction[];salaryCents:number;age:number|null;tables:BenchmarkTables;isSpending:(t:Transaction)=>boolean}) {
  const {rows,salaryCents,age,tables}=input;
  const months=monthsSpanned(rows);
  const quintile=QUINTILE_EDGES_CENTS.filter(edge=>salaryCents>=edge).length+1;
  const band=age===null?null:AGE_BANDS.find(([,lo,hi])=>age>=lo&&age<=hi)?.[0]??null;
  const ageMedian=tables.byAge.find(r=>r.age_band===band&&r['']==='0.5');
  const overall=Object.fromEntries(tables.overall.map(r=>[r[''],r]));
  const incomeRow=(key:string)=>tables.byIncome.find(r=>r['']===key)?.[`Q${quintile}`];
  const national=tables.statfin.householdTypes.SSS.perConsumptionUnit;

  // Investment deposits are saving, not spending, so they are not compared here.
  const categories=Object.keys(overall).filter(k=>k.startsWith('cat_')&&k!=='cat_Invest Deposit').map(k=>k.slice(4)).sort().map(category=>{
    const spent=rows.filter(t=>t.category===category&&input.isSpending(t)).reduce((s,t)=>s-t.amountCents,0);
    const youCents=months?Math.round(spent/months):0;
    const p=Object.fromEntries(PERCENTILES.map(q=>[q,cents(overall[`cat_${category}`][q])!])) as Record<(typeof PERCENTILES)[number],number>;
    const ageCents=ageMedian?cents(ageMedian[`cat_${category}`]):null;
    const map=COICOP[category];
    return {
      category, youCents,
      dataset:{...p,...position(youCents,p)},
      incomeQuintileMedianCents:cents(incomeRow(`cat_${category}`)),
      ageBandMedianCents:ageCents,
      national:map&&national[map.code]!=null?{coicop:map.code,label:tables.statfin.coicop[map.code],cents:national[map.code]!,note:map.note??null}:null,
    };
  });
  return {
    label:'People like you (a comparison, not advice)' as const,
    statfinYear:tables.statfin.year,
    period:{months,from:rows[0]?.tx_date??null,to:rows.at(-1)?.tx_date??null},
    groups:{
      dataset:'Synthetic Junction population (4,736 customers; monthly means per customer, October 2024–August 2026)',
      incomeQuintile:{quintile,label:`Salary quintile ${quintile} of 5`},
      ageBand:band?{band,label:`Age ${band}`}:null,
      national:{label:`Finnish households, ${tables.statfin.year}, per consumption unit (one adult = 1)`,priceBasis:tables.statfin.priceBasis,source:tables.statfin.source,sourceUrl:tables.statfin.sourceUrl,licence:tables.statfin.licence},
    },
    categories,
    notes:[
      'Dataset percentiles describe synthetic customers, not real people.',
      `National figures are ${tables.statfin.year} survey averages at ${tables.statfin.year} prices and include spending from all accounts and cash; this view shows one account.`,
    ],
  };
}
export type Benchmarks=ReturnType<typeof benchmarks>;

type Format=(cents:number)=>string;

/** Plain-text comparison for the coach agent: figures the app calculated, to quote and never recompute. */
export function benchmarkContext(b:Benchmarks,format:Format) {
  const lines=[`${b.label}, calculated by the Koti app from ${b.period.months} months of this account (quote these figures; do not recalculate):`];
  for(const c of b.categories) {
    const parts=[`you ${format(c.youCents)} a month`,`synthetic customers' median ${format(c.dataset.p50)} (you are in the ${c.dataset.band}, ${c.dataset.words})`];
    if(c.incomeQuintileMedianCents!==null) parts.push(`median in ${b.groups.incomeQuintile.label.toLowerCase()} ${format(c.incomeQuintileMedianCents)}`);
    if(c.ageBandMedianCents!==null&&b.groups.ageBand) parts.push(`median at age ${b.groups.ageBand.band} ${format(c.ageBandMedianCents)}`);
    if(c.national) parts.push(`${b.groups.national.label}: ${format(c.national.cents)}${c.national.note?` (${c.national.note})`:''}`);
    lines.push(`- ${c.category}: ${parts.join('; ')}.`);
  }
  lines.push(...b.notes.map(n=>`- ${n}`),'- This describes; it does not judge. Spending more than others is not wrong in itself.');
  return lines.join('\n');
}

/** Short answer for the demo coach: one category, or up to three at or above the dataset's 75th percentile. */
export function benchmarkAnswer(b:Benchmarks,category:string|undefined,format:Format) {
  const above=(c:Benchmarks['categories'][number])=>c.youCents-c.dataset.p50;
  const picked=category?b.categories.filter(c=>c.category===category)
    :b.categories.filter(c=>c.youCents>=c.dataset.p75).sort((x,y)=>above(y)-above(x)).slice(0,3);
  const sentences=picked.map(c=>`${c.category}: ${format(c.youCents)} a month, ${c.dataset.words} in the synthetic dataset (median ${format(c.dataset.p50)})${c.national?`; Finnish households averaged ${format(c.national.cents)} per consumption unit in ${b.statfinYear} (${b.statfinYear} prices)`:''}.`);
  const lead=category?'':picked.length?'Compared with people like you, these categories stand out most. ':'None of your categories is higher than most people’s in the synthetic dataset. ';
  return `${lead}${sentences.join(' ')} This is a comparison, not advice: dataset figures describe synthetic customers, and national figures include all accounts and cash.`.trim();
}
