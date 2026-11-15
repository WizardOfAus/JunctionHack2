import './resolve-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {liveProducts,productKind,products,productsContext,suggest} from '../lib/products/catalogue.ts';
// Dynamic import, so the loader is active for the extensionless imports in terms.ts.
const {createSBankTerms,EXA_TIMEOUT_MS}=await import('../lib/products/terms.ts');

const cached=JSON.parse(readFileSync(new URL('../data/products/s-pankki-cached.json',import.meta.url),'utf8'));

test('a thin buffer puts the savings account first; a home goal puts ASP before investing',()=>{
  assert.deepEqual(suggest({goal:'home',bufferMonths:1.2}).map(s=>s.id),['savings','asp','funds','share-savings','ps']);
  assert.deepEqual(suggest({goal:'home',bufferMonths:5}).map(s=>s.id),['asp','savings','funds','share-savings','ps']);
  assert.deepEqual(suggest({goal:'understand',bufferMonths:null}).map(s=>s.id),['savings','asp','funds','share-savings','ps']);
  assert.match(suggest({goal:'buffer',bufferMonths:1.2})[0].reason,/1\.2 months/);
  assert.ok(Object.values(products).every(p=>p.sourceUrl.startsWith('https://')&&p.tax&&p.limits&&p.access));
});

test('provider products map to the right option',()=>{
  assert.equal(productKind('ASP-tili (ensiasuntosäästötili)'),'asp');assert.equal(productKind('Osakesäästötili'),'share-savings');
  assert.equal(productKind('Rahastot Rahastosäästäminen'),'funds');assert.equal(productKind('Säästötili S-Tuottotili'),'savings');assert.equal(productKind('Lottery'),null);
});

test('only cited products from s-pankki.fi survive, using the dated real Exa response',()=>{
  const live=liveProducts(cached.output);
  assert.ok(live.length>=3);assert.ok(live.every(p=>new URL(p.url).hostname.endsWith('s-pankki.fi')&&p.citations.length));
  assert.ok(live.some(p=>p.kind==='asp'&&/4 %/.test(p.rateOrFee)));
  const forged=liveProducts({content:{products:[{product:'Scam',url:'https://evil.example/x'},{product:'Uncited',url:'https://www.s-pankki.fi/x'}]},grounding:[{field:'products[0].product',citations:[{url:'https://evil.example/x'}]}]});
  assert.deepEqual(forged,[]);
});

test('the coach block lists neutral options and dated, cited S-Bank terms',()=>{
  const text=productsContext({products:liveProducts(cached.output),checkedAt:'2026-11-15',source:'cached'});
  assert.match(text,/not investment advice/);assert.match(text,/Osakesäästötili/);
  assert.match(text,/S-Bank terms from a cached check on 2026-11-15/);assert.match(text,/ASP-tili: .*\(https:\/\/www\.s-pankki\.fi/);
  assert.doesNotMatch(productsContext(null),/S-Bank terms (checked live|from a cached check)/);
});

test('the coach block says Koti is independent and other providers\' terms can differ',()=>{
  for(const text of [productsContext(null),productsContext({products:liveProducts(cached.output),checkedAt:'2026-11-15',source:'live'})]){
    const lines=text.split('\n');
    assert.equal(lines[1],"Koti is independent and not an S-Pankki service. Other Finnish banks offer these options too; if you quote S-Bank terms, say that other providers' terms can differ.");
  }
});

// Fake fetch only: these tests never call Exa.
const fallback=()=>({products:[],checkedAt:cached.retrievedAt,source:'cached',note:'cached'});
const goodBody={output:cached.output};
function fakeFetch(respond){
  const calls=[];
  const fn=async(url,init)=>{calls.push({url,init});return respond(calls.length);};
  return {fn,calls};
}
const quiet=fn=>async()=>{const error=console.error;console.error=()=>{};try{await fn();}finally{console.error=error;}};

test('a failed Exa call is cached for the day, so a second call does not fetch again',quiet(async()=>{
  let day='2026-11-15';
  for(const respond of [()=>new Response('no',{status:500}),()=>{throw new Error('timeout');},()=>Response.json({output:{content:{products:[]}}})]){
    const f=fakeFetch(respond);
    const terms=createSBankTerms({key:()=>'test-key',fallback,fetch:f.fn,today:()=>day});
    assert.equal((await terms()).source,'cached');
    assert.equal((await terms()).source,'cached');
    assert.equal(f.calls.length,1);
  }
  const f=fakeFetch(()=>new Response('no',{status:500}));
  const terms=createSBankTerms({key:()=>'test-key',fallback,fetch:f.fn,today:()=>day});
  await terms();day='2026-11-16';await terms();
  assert.equal(f.calls.length,2,'a new day tries again');
}));

test('concurrent calls share one Exa fetch, with an 8 s timeout',async()=>{
  let release;const gate=new Promise(r=>{release=r;});
  const f=fakeFetch(async()=>{await gate;return Response.json(goodBody);});
  const terms=createSBankTerms({key:()=>'test-key',fallback,fetch:f.fn,today:()=>'2026-11-15'});
  const all=Promise.all([terms(),terms(),terms()]);
  release();
  const results=await all;
  assert.equal(f.calls.length,1);
  assert.ok(results.every(r=>r===results[0]&&r.source==='live'&&r.products.length>=3));
  assert.equal((await terms()).source,'live');assert.equal(f.calls.length,1);
  assert.equal(EXA_TIMEOUT_MS,8000);
  assert.ok(f.calls[0].init.signal instanceof AbortSignal);
  assert.doesNotMatch(f.calls[0].init.body,/customer|persona/i);
});

test('with no Exa key, the cached copy is used and nothing is fetched',async()=>{
  const f=fakeFetch(()=>Response.json(goodBody));
  const terms=createSBankTerms({key:()=>'  ',fallback,fetch:f.fn});
  assert.equal((await terms()).source,'cached');assert.equal(f.calls.length,0);
});
