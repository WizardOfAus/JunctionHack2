import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clocks,defaults,forecast,historyOnly} from '../lib/finance.ts';
import {mortgageAt,personaView,REQUIRED_INCOME_PER_LOAN_EURO} from '../lib/personas/view.ts';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const catalogue=read('../data/personas/catalogue.json');
const records=read('../data/personas/records.json').personas;
const rowsOf=id=>id===catalogue.defaultId?read('../data/persona.json').transactions:read(`../data/personas/${id}.json`).transactions;
const {current,backtest}=clocks;

test('the browser-safe persona key list matches the catalogue',()=>{
  const src=readFileSync(new URL('../lib/contracts.ts',import.meta.url),'utf8');
  const keys=JSON.parse(src.match(/personaIds=(\[[^\]]*\])/)[1].replaceAll("'",'"'));
  assert.deepEqual(keys,catalogue.personas.map(p=>p.id));
  assert.match(src,new RegExp(`DEFAULT_PERSONA_ID:PersonaId='${catalogue.defaultId}'`));
});

test('catalogue keys are unique and every persona has one customer, one account and no rows after the clock',()=>{
  assert.equal(new Set(catalogue.personas.map(p=>p.id)).size,catalogue.personas.length);
  assert.equal(new Set(catalogue.personas.map(p=>p.customerId)).size,catalogue.personas.length);
  assert.ok(catalogue.personas.some(p=>p.id===catalogue.defaultId&&p.customerId==='CUST04859'));
  for(const p of catalogue.personas){
    const rows=rowsOf(p.id);
    assert.equal(records[p.id].customerId,p.customerId);
    assert.deepEqual([...new Set(rows.map(t=>t.customer_id))],[p.customerId],p.id);
    assert.equal(new Set(rows.map(t=>t.bank_account_id)).size,1,p.id);
    assert.ok(rows.every(t=>t.tx_date<=current.historyThrough),p.id);
    assert.equal(rows.length,records[p.id].rowCount,p.id);
  }
});

test('one persona\'s rows never appear under another persona\'s customer scope',()=>{
  const a=rowsOf('home-approved'),b=rowsOf('tight-budget');
  assert.equal(historyOnly([...a,...b],current,'CUST04767').length,a.length);
  assert.equal(historyOnly(a,current,'CUST02097').length,0);
  assert.deepEqual(forecast([...a,...b],defaults,current,'CUST02097'),forecast(b,defaults,current,'CUST02097'));
});

test('approved application shows its recorded final figures, labelled as an application record',()=>{
  const m=mortgageAt(records['home-approved'].mortgage,current);
  assert.equal(m.label,'Application record');assert.equal(m.applicationId,'C0689');
  assert.equal(m.status,'approved');assert.equal(m.statusDate,'2026-05-04');assert.equal(m.propertyType,'apartment');
  assert.equal(m.priceCents,17450000);assert.equal(m.loanCents,16000000);assert.equal(m.equityCents,1450000);
  assert.equal(m.ltv,0.9169);
  assert.ok(Math.abs(m.requiredMonthlyIncomeCents-records['home-approved'].mortgage.final.requiredMonthlyIncomeCents)<=1);
  assert.match(m.requiredIncomeBasis,/not a lending rule/i);
});

test('rejections keep their recorded reason',()=>{
  assert.deepEqual([mortgageAt(records['home-rejected-income'].mortgage,current)].map(m=>[m.status,m.rejectionReason]),[['rejected','insufficient_income']]);
  assert.deepEqual([mortgageAt(records['home-rejected-collateral'].mortgage,current)].map(m=>[m.status,m.rejectionReason]),[['rejected','insufficient_collateral']]);
});

test('the 1 September backtest hides the September decision and later events',()=>{
  const record=records['home-recent-approval'].mortgage;
  assert.equal(mortgageAt(record,current).status,'approved');
  const m=mortgageAt(record,backtest);
  assert.equal(m.status,'in_progress');assert.equal(m.rejectionReason,null);
  assert.ok(m.statusDate<='2026-08-31');
  assert.ok(m.timeline.every(e=>e.date<='2026-08-31'));
  assert.ok(!m.timeline.some(e=>e.eventType==='loan_decision'));
  // Only what was recorded by 31 August: the loan calculation, not the final record.
  assert.equal(m.loanCents,20350000);assert.equal(m.equityCents,1400000);assert.equal(m.priceCents,21750000);
});

test('personas without an application have no mortgage record; floored ages carry a note',()=>{
  const entry=catalogue.personas.find(p=>p.id==='tight-budget');
  const view=personaView(entry,records['tight-budget'],current);
  assert.equal(view.mortgage,null);assert.equal(view.customer.age,18);assert.match(view.customer.ageNote,/floor/);
  assert.equal(view.customer.area.municipality,'Espoo');
});

test('salary sweeps are forecast as transfers out, with a this-account-only warning',()=>{
  const rows=rowsOf('home-recent-approval');
  const f=forecast(rows,defaults,current,'CUST01265');
  assert.ok(f.salarySweepCents>300000);
  assert.ok(f.warnings.some(w=>/another account/.test(w)));
  const payday=f.points.find(p=>p.incomeCents>0).date;
  const transfer=f.points.find(p=>p.label.startsWith('Transfer to your other account'));
  assert.ok(transfer&&transfer.date>payday);
  const reference=forecast(rowsOf('reference'),defaults,current);
  assert.equal(reference.salarySweepCents,0);assert.ok(!reference.warnings.some(w=>/another account/.test(w)));
});

test('the required-income factor reproduces the dataset to the cent',()=>{
  for(const id of ['home-approved','home-rejected-income','home-recent-approval','home-rejected-collateral']){
    const f=records[id].mortgage.final;
    assert.ok(Math.abs(Math.round(f.loanCents*REQUIRED_INCOME_PER_LOAN_EURO)-f.requiredMonthlyIncomeCents)<=1,id);
  }
});
