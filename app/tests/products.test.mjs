import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {liveProducts,productKind,products,suggest} from '../lib/products/catalogue.ts';

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
