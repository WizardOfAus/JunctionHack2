import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clocks,defaults,forecast} from '../lib/finance.ts';
import {mortgageAt,REQUIRED_INCOME_PER_LOAN_EURO} from '../lib/personas/view.ts';
import {annuityCents,loanReadiness,readinessContext,LOAN_CAP_LTV} from '../lib/loan-readiness.ts';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const records=read('../data/personas/records.json').personas;
const rate={annualPercent:3.35,month:'2026-08',source:'https://api.boffsaopendata.fi',label:'Bank of Finland average'};
function readiness(id,assumptions=defaults){
  const record=records[id];
  const rows=id==='reference'?read('../data/persona.json').transactions:read(`../data/personas/${id}.json`).transactions;
  const f=forecast(rows,assumptions,clocks.current,record.customerId);
  return {f,r:loanReadiness({forecast:f,assumptions,mortgage:mortgageAt(record.mortgage,clocks.current),marketRate:rate})};
}
const check=(r,id)=>r.checks.find(c=>c.id===id);

test('stress payment and required income reproduce the dataset calculation',()=>{
  assert.equal(annuityCents(16000000,0.06,25),103088);
  const {r}=readiness('home-approved');
  assert.ok(Math.abs(check(r,'income').targetCents-Math.round(16000000*REQUIRED_INCOME_PER_LOAN_EURO))<=1);
  assert.ok(Math.abs(check(r,'income').targetCents-records['home-approved'].mortgage.final.requiredMonthlyIncomeCents)<=1);
});

test('the approved applicant meets the deposit and income checks from the application record',()=>{
  const {r}=readiness('home-approved');
  assert.equal(r.basis.source,'Application record C0689');
  assert.equal(r.basis.priceCents,17450000);assert.equal(r.basis.equityCents,1450000);assert.equal(r.basis.ltv,0.9169);
  assert.equal(check(r,'deposit').status,'met');assert.equal(check(r,'income').status,'met');
  assert.equal(r.whatItWouldTake.extraEquityCents,0);
});

test('the income-declined applicant sees what would close the gap',()=>{
  const {f,r}=readiness('home-rejected-income');
  assert.equal(check(r,'income').status,'short');
  const w=r.whatItWouldTake;
  // More own funds lower the loan to what this income supports; a cheaper home works too.
  assert.equal(w.extraEquityCents,r.basis.loanCents-w.maxLoanAtIncomeCents);
  // Salary has risen since the May application, so the October gap is smaller than at the decision.
  assert.ok(w.extraEquityCents>0&&w.extraEquityCents<r.basis.priceCents*0.1,`${w.extraEquityCents}`);
  assert.ok(w.maxPriceCents<r.basis.priceCents);
  assert.equal(w.extraMonthlyIncomeCents,check(r,'income').gapCents);
  assert.ok(w.monthsToSaveExtraEquity>0);
  assert.equal(f.salaryCents,r.basis.incomeCents);
});

test('at the maximum price, the same own funds pass both deposit and income checks',()=>{
  const {f,r}=readiness('home-rejected-income');
  const at=loanReadiness({forecast:f,assumptions:{homePriceCents:r.whatItWouldTake.maxPriceCents,homeSavingsCents:r.basis.equityCents},mortgage:null,marketRate:null});
  assert.equal(check(at,'deposit').status,'met');assert.equal(check(at,'income').status,'met');
});

test('without an application record, the user assumptions drive it and zero savings fail the deposit check',()=>{
  const {r}=readiness('reference');
  assert.equal(r.basis.source,'Your assumption');assert.equal(r.basis.priceCents,defaults.homePriceCents);
  assert.equal(check(r,'deposit').status,'short');
  assert.equal(check(r,'deposit').gapCents,900000);assert.equal(LOAN_CAP_LTV,0.95);
  assert.equal(r.whatItWouldTake.maxPriceCents,0);
});

test('payments are reported at the market rate and the stress rate, never as a score',()=>{
  const {r}=readiness('home-approved');
  assert.equal(r.payments.market.monthlyCents,annuityCents(16000000,0.0335,25));
  assert.ok(r.payments.market.monthlyCents<r.payments.stress.monthlyCents);
  assert.match(r.label,/not a credit decision/);
  assert.ok(!JSON.stringify(r).match(/score|odds|probability/i));
});

test('pass-through accounts are told their savings elsewhere are not visible',()=>{
  const {r}=readiness('home-recent-approval');
  assert.ok(r.notes.some(n=>/another account/.test(n)));
});

test('buffer gap is explicit and absent when essentials are unknown',()=>{
  const {f}=readiness('reference');
  const input={forecast:{...f,balanceCents:15000,baskets:{regular:10000,irregular:0,flexible:0}},assumptions:defaults,mortgage:null,marketRate:null};
  assert.equal(check(loanReadiness(input),'buffer').gapMonths,1.5);
  const unknown=loanReadiness({...input,forecast:{...input.forecast,baskets:{regular:0,irregular:0,flexible:0}}});
  assert.equal(check(unknown,'buffer').gapMonths,null);assert.equal(check(unknown,'buffer').status,'unknown');
});

test('the coach context quotes the record and the app figures for the agent',()=>{
  const {r}=readiness('home-rejected-income');
  const text=readinessContext(r,mortgageAt(records['home-rejected-income'].mortgage,clocks.current),c=>`EUR ${(c/100).toFixed(2)}`);
  assert.match(text,/Application record C0137: rejected on 2026-05-12 \(reason: insufficient income\)/);
  assert.ok(text.includes(`extra own funds EUR ${(r.whatItWouldTake.extraEquityCents/100).toFixed(2)}`));
  assert.match(text,/do not recalculate/);assert.match(text,/not a bank rule/);
});
