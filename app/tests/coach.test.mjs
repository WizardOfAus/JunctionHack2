import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {basketOf,basketProfile,defaults,euro,forecast,historyOnly,isConsumption,recentWindow} from '../lib/finance.ts';
import {basketContext,basketNames} from '../lib/coach/context.ts';

const rows=historyOnly(JSON.parse(readFileSync(new URL('../data/persona.json',import.meta.url),'utf8')).transactions);
const recent=recentWindow(),profile=basketProfile(rows);

// Same row selection as the coach route (app/api/coach/route.ts) and forecast().
function coachContext(a){
  const window=rows.filter(t=>t.tx_date>=recent.from&&isConsumption(t));
  const basketRows=window.map(t=>({category:t.category,basket:basketOf(t,a.corrections,profile),spentCents:-t.amountCents}));
  const totals=forecast(rows,a).baskets;
  return {basketRows,totals,text:basketContext(basketRows,totals,{months:3,period:recent.label,corrections:Object.keys(a.corrections).length,format:c=>euro(c)})};
}

test('coach basket figures are the same as the Today screen figures',()=>{
  const {basketRows,totals,text}=coachContext(defaults);
  for(const basket of ['regular','irregular','flexible']){
    const cents=basketRows.filter(r=>r.basket===basket).reduce((s,r)=>s+r.spentCents,0);
    assert.equal(Math.round(cents/3),totals[basket],`${basket}: coach rows and forecast().baskets disagree`);
    assert.ok(text.includes(`${basketNames[basket]} (${basket}): ${euro(totals[basket])}.`));
  }
  assert.match(text,/has not moved any transaction/);
});

test('user basket corrections reach the coach context',()=>{
  const restaurant=rows.find(t=>t.tx_date>=recent.from&&t.category==='Restaurants'&&isConsumption(t));
  const a={...defaults,corrections:{[restaurant.id]:'regular'}};
  const before=coachContext(defaults).totals, {totals,text}=coachContext(a);
  assert.ok(totals.regular>before.regular);
  assert.ok(text.includes(`${basketNames.regular} (regular): ${euro(totals.regular)}.`));
  assert.match(text,/moved 1 transaction\(s\)/);
});
