import './resolve-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createVerify} from 'node:crypto';
import {clocks} from '../lib/finance.ts';
import {toCents} from '../lib/open-banking/types.ts';
import {enableBankingJwt,importSigningKey} from '../lib/open-banking/jwt.ts';
// These modules use bundler-style imports, so load them after the resolver is registered.
const {demoConnection}=await import('../lib/open-banking/demo-bank.ts');
const {connectionFromCode,enableBankingClient,mapTransaction,pickBalance}=await import('../lib/open-banking/enable-banking.ts');

test('amounts become exact integer cents',()=>{
  assert.equal(toCents('12.34'),1234);assert.equal(toCents('-0.5'),-50);assert.equal(toCents('7'),700);assert.equal(toCents(19.99),1999);
  assert.throws(()=>toCents('1,5'));
});

test('the Demo bank is deterministic, labelled simulated, read-only and ends at the demo clock',()=>{
  const now=new Date('2026-10-01T09:00:00Z');
  const a=demoConnection('reference',clocks.current,now),b=demoConnection('reference',clocks.current,now);
  assert.deepEqual(a,b);assert.notDeepEqual(a.accounts,demoConnection('tight-budget',clocks.current,now).accounts);
  assert.equal(a.label,'Demo bank (simulated)');assert.deepEqual(a.scope,['accounts','balances','transactions']);
  assert.ok(a.transactions.every(t=>t.date<=clocks.current.historyThrough&&Number.isInteger(t.amountCents)&&t.amountCents!==0));
  const savings=a.accounts.find(x=>x.type==='savings'),card=a.accounts.find(x=>x.type==='card');
  assert.ok(savings.balanceCents>0);assert.ok(card.balanceCents<0,'the card owes the current month');
  assert.equal(Date.parse(a.validUntil)-now.getTime(),90*86400000);
});

test('the Enable Banking token is RS256 with the application id and the right audience',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwt=await enableBankingJwt('app-1',await importSigningKey(privateKey.export({type:'pkcs8',format:'pem'})),1000);
  const [h,p,s]=jwt.split('.');const json=x=>JSON.parse(Buffer.from(x,'base64url').toString());
  assert.deepEqual(json(h),{typ:'JWT',alg:'RS256',kid:'app-1'});assert.deepEqual(json(p),{iss:'enablebanking.com',aud:'api.enablebanking.com',iat:1000,exp:4600});
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey,Buffer.from(s,'base64url')));
});

test('a code becomes one connection with mapped accounts, balances and signed transactions',async()=>{
  const calls=[];
  const fetcher=async(url,init)=>{calls.push([init.method??'GET',url.replace('https://api.enablebanking.com','')]);const path=new URL(url).pathname;
    const body=path==='/application'?{environment:'SANDBOX'}:path==='/sessions'?{session_id:'s1',accounts:[{uid:'u1',account_id:{iban:'FI2112345600000785'},name:'Käyttötili',currency:'EUR',cash_account_type:'CACC'}],access:{valid_until:'2027-01-01T00:00:00Z'}}
      :path.endsWith('/balances')?{balances:[{balance_amount:{amount:'10.00',currency:'EUR'},balance_type:'ITAV'},{balance_amount:{amount:'1234.56',currency:'EUR'},balance_type:'CLBD',reference_date:'2026-09-30'}]}
      :{transactions:[{entry_reference:'e1',transaction_amount:{amount:'25.10',currency:'EUR'},credit_debit_indicator:'DBIT',booking_date:'2026-09-29',creditor:{name:'S-market'},remittance_information:['Groceries']},
        {entry_reference:'e2',transaction_amount:{amount:'2500.00',currency:'EUR'},credit_debit_indicator:'CRDT',booking_date:'2026-09-15',debtor:{name:'Employer Oy'}}]};
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});};
  const client=enableBankingClient({token:async()=>'t',fetcher});
  const c=await connectionFromCode(client,{code:'abc',bank:'S-Pankki',dateFrom:'2026-04-01',now:new Date('2026-10-01T00:00:00Z'),validUntil:'x'});
  assert.equal(c.sessionId,'s1');assert.equal(c.label,'S-Pankki via Enable Banking (sandbox)');assert.equal(c.validUntil,'2027-01-01T00:00:00Z');
  assert.deepEqual(c.accounts,[{id:'u1',name:'Käyttötili',type:'current',iban:'FI2112345600000785',currency:'EUR',balanceCents:123456,balanceDate:'2026-09-30'}]);
  assert.deepEqual(c.transactions.map(t=>[t.date,t.amountCents,t.description]),[['2026-09-29',-2510,'Groceries'],['2026-09-15',250000,'Employer Oy']]);
  assert.deepEqual(calls[0],['GET','/application']);assert.ok(!c.id.includes(c.sessionId));assert.ok(calls.some(([,u])=>u==='/accounts/u1/transactions?date_from=2026-04-01'));
});

test('balances prefer booked closing balance and pending transactions stay pending',()=>{
  assert.equal(pickBalance([{balance_amount:{amount:'1',currency:'EUR'},balance_type:'XYZ'},{balance_amount:{amount:'2',currency:'EUR'},balance_type:'CLBD'}]).balance_amount.amount,'2');
  assert.equal(mapTransaction('a',{transaction_amount:{amount:'-3.00',currency:'EUR'},status:'PDNG'},0).status,'pending');
  assert.equal(mapTransaction('a',{transaction_amount:{amount:'-3.00',currency:'EUR'}},0).amountCents,-300);
});

test('the full picture adds each source, compares visible cash with the deposit and keeps simulated data labelled',async()=>{
  const {fullPicture,fullPictureContext}=await import('../lib/open-banking/full-picture.ts');
  const {euro}=await import('../lib/finance.ts');
  const demo=demoConnection('home-rejected-income',clocks.current,new Date('2026-10-01T00:00:00Z'));
  const forecast={balanceCents:741739};
  const readiness={checks:[{id:'deposit',targetCents:1575000}]};
  const p=fullPicture({forecast,connections:[demo],readiness,asOf:clocks.current.historyThrough});
  const savings=demo.accounts.find(a=>a.type==='savings').balanceCents,card=demo.accounts.find(a=>a.type==='card').balanceCents;
  assert.equal(p.cashCents,741739+savings);assert.equal(p.cardOwedCents,-card);
  assert.equal(p.deposit.coveredByVisibleCash,741739+savings>=1575000);assert.equal(p.simulated,true);
  assert.deepEqual(p.sources,['S-Bank Junction 2026 dataset (synthetic)','Demo bank (simulated)']);
  const text=fullPictureContext(p,c=>euro(c));
  assert.match(text,/Demo bank is simulated/);assert.match(text,/does not change your application record/);
  assert.equal(fullPicture({forecast,connections:[],readiness:null,asOf:'2026-09-30'}).deposit,null);
});


test('production credentials cannot be presented as a sandbox',async()=>{
 const calls=[];const client=enableBankingClient({token:async()=>'t',fetcher:async url=>{calls.push(new URL(url).pathname);return Response.json({environment:'PRODUCTION'});}});
 await assert.rejects(client.startAuthorisation({bank:'test',country:'FI',redirectUrl:'https://app.invalid',state:'x',validUntil:'2026-12-01'}),/Only sandbox/);
 assert.deepEqual(calls,['/application']);
});

test('full picture excludes other currencies, pending spending and dates after the snapshot',async()=>{
 const {fullPicture}=await import('../lib/open-banking/full-picture.ts');
 const demo=demoConnection('reference',clocks.current,new Date('2026-10-01'));
 demo.accounts=[{id:'usd',currency:'USD',type:'savings',balanceCents:999999},{id:'card',currency:'EUR',type:'card',balanceCents:-3000}];
 demo.transactions=[{accountId:'card',date:'2026-09-20',amountCents:-3000,status:'booked',description:'Purchase'},
 {accountId:'card',date:'2026-09-21',amountCents:-9000,status:'pending',description:'Purchase'},
 {accountId:'card',date:'2026-10-20',amountCents:-9000,status:'booked',description:'Purchase'}];
 const p=fullPicture({forecast:{balanceCents:10000},connections:[demo],readiness:null,asOf:'2026-09-30'});
 assert.equal(p.cashCents,10000);assert.equal(p.cardMonthlySpendCents,1000);assert.equal(p.cardOwedCents,3000);
});

test('bank state is browser/persona scoped, expires and does not consume another browser callback',async()=>{
 const {ensureSession,saveConnection,listConnections,removeConnection,addPending,takePending,publicConnection}=await import('../lib/open-banking/state.ts');
 const a=ensureSession(new Request('http://app.local')),b=ensureSession(new Request('http://app.local'));
 const c={...demoConnection('reference',clocks.current,new Date()),sessionId:'provider-secret'};
 saveConnection(a.sid,'reference',c);
 assert.equal(listConnections(b.sid,'reference').length,0);assert.equal(listConnections(a.sid,'tight-budget').length,0);
 assert.equal(removeConnection(b.sid,'reference',c.id),null);
 assert.equal(publicConnection(c).sessionId,undefined);
 addPending('state1',{sid:a.sid,personaId:'reference',bank:'demo',createdAt:Date.now()});
 assert.equal(takePending('state1',b.sid),null);assert.equal(takePending('state1',a.sid).sid,a.sid);assert.equal(takePending('state1',a.sid),null);
 saveConnection(a.sid,'reference',{...c,validUntil:'2000-01-01'});assert.equal(listConnections(a.sid,'reference').length,0);
});
