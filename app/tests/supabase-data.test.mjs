import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchPersona,readConfig,toTransaction,DemoDataUnavailableError,PAGE_SIZE} from '../lib/supabase-data.ts';

const persona=JSON.parse(readFileSync(new URL('../data/persona.json',import.meta.url),'utf8'));
const config={url:'https://example.supabase.co',apiKey:'sb_publishable_test'};

// The same row shape that supabase/scripts/build-seed.mjs writes: blank codes become null.
const dbRow=t=>({id:t.id,source_row:t.sourceRow,customer_id:t.customer_id,bank_account_id:t.bank_account_id,tx_date:t.tx_date,tx_timestamp:t.tx_timestamp,category:t.category,tx_amount_eur:t.tx_amount_eur,balance_after_eur:t.balance_after_eur,transaction_type:t.transaction_type,merchant_id:t.merchant_id||null,mcc_code:t.mcc_code||null,amount_cents:t.amountCents,balance_cents:t.balanceCents});
const personaRow={customer_id:persona.customerId,account_id:persona.accountId,as_of:persona.asOf,source_revision:persona.sourceRevision,statistics:persona.statistics};

function stub(txRows,{personas=[personaRow],status=200}={}){
  const calls=[];
  const fetcher=async(url,init)=>{
    calls.push({url:String(url),headers:init.headers});
    if(status!==200)return new Response('{}',{status});
    const u=new URL(url);
    if(u.pathname.endsWith('/personas'))return Response.json(personas);
    const limit=Number(u.searchParams.get('limit')),offset=Number(u.searchParams.get('offset'));
    return Response.json(txRows.slice(offset,offset+limit));
  };
  return {fetcher,calls};
}

test('Supabase rows convert back to the exact persona.json transactions',async()=>{
  const {fetcher,calls}=stub(persona.transactions.map(dbRow));
  const loaded=await fetchPersona(config,'CUST04859',fetcher);
  assert.deepEqual(loaded.transactions,persona.transactions);
  assert.deepEqual(loaded.statistics,persona.statistics);
  assert.equal(loaded.accountId,'ACC004859');
  assert.ok(calls.every(c=>c.headers.apikey==='sb_publishable_test'&&!c.headers.Authorization),'sb_ keys use the apikey header only');
  assert.ok(calls.every(c=>c.url.includes('customer_id=eq.CUST04859')),'every request is scoped to the server-chosen customer');
});

test('bigint cents returned as strings stay exact integers',()=>{
  const t=toTransaction({...dbRow(persona.transactions[0]),amount_cents:'-7689',balance_cents:'393649'});
  assert.equal(t.amountCents,-7689);assert.equal(t.balanceCents,393649);
  assert.throws(()=>toTransaction({...dbRow(persona.transactions[0]),amount_cents:'12.5'}),DemoDataUnavailableError);
});

test('transactions load across pages',async()=>{
  const rows=Array.from({length:PAGE_SIZE+5},(_,i)=>({...dbRow(persona.transactions[0]),id:`row-${i}`,source_row:i}));
  const {fetcher,calls}=stub(rows);
  const loaded=await fetchPersona(config,'CUST04859',fetcher);
  assert.equal(loaded.transactions.length,PAGE_SIZE+5);
  assert.equal(calls.filter(c=>c.url.includes('/transactions')).length,2);
});

test('legacy JWT keys also send a Bearer header',async()=>{
  const {fetcher,calls}=stub(persona.transactions.map(dbRow));
  await fetchPersona({...config,apiKey:'eyJlegacy'},'CUST04859',fetcher);
  assert.ok(calls.every(c=>c.headers.Authorization==='Bearer eyJlegacy'));
});

test('missing configuration, errors and wrong scope fail closed',async()=>{
  assert.throws(()=>readConfig({}),DemoDataUnavailableError);
  assert.throws(()=>readConfig({SUPABASE_URL:'https://x.supabase.co'}),/SUPABASE_PUBLISHABLE_KEY/);
  assert.deepEqual(readConfig({SUPABASE_URL:'https://x.supabase.co/ ',SUPABASE_PUBLISHABLE_KEY:' pk '}),{url:'https://x.supabase.co',apiKey:'pk'});
  assert.deepEqual(readConfig({SUPABASE_URL:'https://x.supabase.co',SUPABASE_PUBLISHABLE_KEY:'pk',SUPABASE_SECRET_KEY:'sk'}).apiKey,'sk','a secret key wins when both are set');
  await assert.rejects(fetchPersona(config,'CUST04859',stub([],{status:500}).fetcher),DemoDataUnavailableError);
  await assert.rejects(fetchPersona(config,'CUST04859',stub(persona.transactions.map(dbRow),{personas:[]}).fetcher),/not in Supabase/);
  await assert.rejects(fetchPersona(config,'CUST04859',stub([]).fetcher),/no transactions/);
  await assert.rejects(fetchPersona(config,'CUST04859',stub([{...dbRow(persona.transactions[0]),customer_id:'CUST00001'}]).fetcher),/different customer/);
  await assert.rejects(fetchPersona(config,"CUST04859'or",stub([]).fetcher),/not valid/);
  await assert.rejects(fetchPersona(config,'CUST04859',async()=>{throw new Error('offline');}),/did not respond/);
});

// Runs only when SUPABASE_URL and a key are set, for example:
//   set -a; . ./.dev.vars; set +a; npm test
test('live Supabase data matches app/data/persona.json',{skip:!(process.env.SUPABASE_URL&&(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_SECRET_KEY))&&'SUPABASE_URL and a Supabase key are not set'},async()=>{
  const loaded=await fetchPersona(readConfig(process.env),'CUST04859');
  assert.deepEqual(loaded.transactions,persona.transactions,'Supabase is out of date: run supabase/scripts/build-seed.mjs and load the seed');
  assert.deepEqual(loaded.statistics,persona.statistics);
});
