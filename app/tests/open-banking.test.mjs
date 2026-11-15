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
    const body=path==='/sessions'?{session_id:'s1',accounts:[{uid:'u1',account_id:{iban:'FI2112345600000785'},name:'Käyttötili',currency:'EUR',cash_account_type:'CACC'}],access:{valid_until:'2027-01-01T00:00:00Z'}}
      :path.endsWith('/balances')?{balances:[{balance_amount:{amount:'10.00',currency:'EUR'},balance_type:'ITAV'},{balance_amount:{amount:'1234.56',currency:'EUR'},balance_type:'CLBD',reference_date:'2026-09-30'}]}
      :{transactions:[{entry_reference:'e1',transaction_amount:{amount:'25.10',currency:'EUR'},credit_debit_indicator:'DBIT',booking_date:'2026-09-29',creditor:{name:'S-market'},remittance_information:['Groceries']},
        {entry_reference:'e2',transaction_amount:{amount:'2500.00',currency:'EUR'},credit_debit_indicator:'CRDT',booking_date:'2026-09-15',debtor:{name:'Employer Oy'}}]};
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});};
  const client=enableBankingClient({token:async()=>'t',fetcher});
  const c=await connectionFromCode(client,{code:'abc',bank:'S-Pankki',dateFrom:'2026-04-01',now:new Date('2026-10-01T00:00:00Z'),validUntil:'x'});
  assert.equal(c.sessionId,'s1');assert.equal(c.label,'S-Pankki via Enable Banking (sandbox)');assert.equal(c.validUntil,'2027-01-01T00:00:00Z');
  assert.deepEqual(c.accounts,[{id:'u1',name:'Käyttötili',type:'current',iban:'FI2112345600000785',currency:'EUR',balanceCents:123456,balanceDate:'2026-09-30'}]);
  assert.deepEqual(c.transactions.map(t=>[t.date,t.amountCents,t.description]),[['2026-09-29',-2510,'Groceries'],['2026-09-15',250000,'Employer Oy']]);
  assert.deepEqual(calls[0],['POST','/sessions']);assert.ok(calls.some(([,u])=>u==='/accounts/u1/transactions?date_from=2026-04-01'));
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
