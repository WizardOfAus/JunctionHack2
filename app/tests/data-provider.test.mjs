import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import './resolve-ts.mjs';
const { dataSource, createPersonaLoader, verifyCopy }=await import('../lib/data-provider.ts');
const { fetchPersona }=await import('../lib/supabase-data.ts');
const { forecast, defaults, CLOCK }=await import('../lib/finance.ts');
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const catalogue=read('../data/personas/catalogue.json');
const records=read('../data/personas/records.json').personas;
const reference=read('../data/persona.json');
const revision=reference.sourceRevision,asOf=reference.asOf;
const artifacts=Object.fromEntries(catalogue.personas.map(p=>[p.id,p.id==='reference'?reference:read(`../data/personas/${p.id}.json`)]));
function resolve(id='reference'){
 const entry=catalogue.personas.find(p=>p.id===id);if(!entry)throw Error('Unknown persona');
 return {customerId:entry.customerId,accountId:records[id].accountId,transactions:artifacts[id].transactions,view:{id,label:entry.label}};
}
function remote(id){const p=resolve(id);return {...p,asOf,sourceRevision:revision,statistics:{}};}
const dbRow=t=>({id:t.id,source_row:t.sourceRow,customer_id:t.customer_id,bank_account_id:t.bank_account_id,tx_date:t.tx_date,tx_timestamp:t.tx_timestamp,category:t.category,tx_amount_eur:t.tx_amount_eur,balance_after_eur:t.balance_after_eur,transaction_type:t.transaction_type,merchant_id:t.merchant_id||null,mcc_code:t.mcc_code||null,amount_cents:String(t.amountCents),balance_cents:String(t.balanceCents)});

test('bundled is the explicit no-key default; invalid provider names fail closed',async()=>{
 assert.equal(dataSource({}),'bundled');assert.equal(dataSource({SUPABASE_URL:'https://example.supabase.co'}),'bundled');
 assert.equal(dataSource({KOTI_DATA_SOURCE:'supabase'}),'supabase');assert.throws(()=>dataSource({KOTI_DATA_SOURCE:'auto'}));
 let calls=0;const load=createPersonaLoader(resolve,async()=>{calls++;throw Error('should not fetch');},revision,asOf);
 assert.deepEqual(await load('home-approved','bundled'),resolve('home-approved'));assert.equal(calls,0);
});
test('all eight personas preserve exact source rows and finance results through the remote adapter',async()=>{
 for(const entry of catalogue.personas){
  const expected=resolve(entry.id),copy=remote(entry.id);
  const fetcher=async url=>{
   const u=new URL(url);assert.equal(u.searchParams.get('customer_id'),`eq.${entry.customerId}`);
   if(u.pathname.endsWith('/personas'))return Response.json([{customer_id:copy.customerId,account_id:copy.accountId,as_of:asOf,source_revision:revision,statistics:{}}]);
   const offset=Number(u.searchParams.get('offset')),limit=Number(u.searchParams.get('limit'));return Response.json(copy.transactions.slice(offset,offset+limit).map(dbRow));
  };
  const load=createPersonaLoader(resolve,id=>fetchPersona({url:'https://example.supabase.co',apiKey:'sb_publishable_test'},id,fetcher),revision,asOf);
  const actual=await load(entry.id,'supabase');assert.deepEqual(actual,expected);
  assert.deepEqual(forecast(actual.transactions,defaults,CLOCK,actual.customerId),forecast(expected.transactions,defaults,CLOCK,expected.customerId));
 }
});
test('per-persona cache deduplicates concurrent loads and never shares customer rows',async()=>{
 const calls=[];const load=createPersonaLoader(resolve,async customer=>{calls.push(customer);return remote(catalogue.personas.find(p=>p.customerId===customer).id);},revision,asOf);
 const [a,b,c]=await Promise.all([load('reference','supabase'),load('reference','supabase'),load('home-approved','supabase')]);
 assert.equal(calls.length,2);assert.deepEqual(a,b);assert.notEqual(a.customerId,c.customerId);
 assert.ok(c.transactions.every(row=>row.customer_id===c.customerId));
});
test('failed loads retry and never fall back to bundled rows',async()=>{
 let calls=0;const load=createPersonaLoader(resolve,async()=>{if(++calls===1)throw Error('offline');return remote('reference');},revision,asOf);
 await assert.rejects(load('reference','supabase'),/offline/);assert.deepEqual(await load('reference','supabase'),resolve());assert.equal(calls,2);
});
test('wrong identity, stale provenance, missing, duplicate and changed rows fail copy validation',()=>{
 const expected=resolve(),copy=remote('reference');
 for(const changed of [ {...copy,customerId:'CUST00001'}, {...copy,accountId:'ACC000001'}, {...copy,asOf:'2026-09-01'}, {...copy,sourceRevision:'old'}, {...copy,transactions:copy.transactions.slice(1)}, {...copy,transactions:copy.transactions.map((row,i)=>i===1?copy.transactions[0]:row)}, {...copy,transactions:copy.transactions.map((row,i)=>i===0?{...row,amountCents:row.amountCents+1}:row)} ]) assert.throws(()=>verifyCopy(expected,changed,revision,asOf));
});
test('seed includes the eight allowlisted customers and all audited rows',()=>{
 const dir=mkdtempSync(join(tmpdir(),'koti-seed-test-'));try{
  const out=join(dir,'seed.sql');const result=JSON.parse(execFileSync(process.execPath,['supabase/scripts/build-seed.mjs','--out',out],{cwd:new URL('../../',import.meta.url),encoding:'utf8'}));
  assert.equal(result.personas,8);assert.equal(result.transactions,Object.values(artifacts).reduce((n,p)=>n+p.transactions.length,0));
  const sql=readFileSync(out,'utf8');assert.equal((sql.match(/insert into public.personas /g)||[]).length,8);
  for(const p of catalogue.personas){assert.ok(sql.includes(p.customerId));assert.ok(sql.includes(`"personaId":"${p.id}"`));}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
