import test from 'node:test';
import assert from 'node:assert/strict';
import {readCsv} from './read-csv.mjs';

const rates=readCsv('../data/overlays/mortgage_market_rates.csv');

test('pinned historical rate snapshot contains January to August 2026 only',()=>{
  assert.ok(rates.length>0);
  for(const row of rates){
    assert.match(row.month,/^2026-0[1-8]$/,`${row.series} ${row.month}`);
    assert.ok(row.month<='2026-08');
  }
});

test('one value for each series and month, as a number',()=>{
  const keys=rates.map(r=>`${r.series}|${r.month}`);
  assert.equal(new Set(keys).size,keys.length);
  for(const row of rates){
    const value=Number(row.value_percent);
    assert.ok(Number.isFinite(value)&&value>=0&&value<20,`${row.series} ${row.month}: ${row.value_percent}`);
  }
});

test('every row has source, licence and label',()=>{
  for(const row of rates){
    assert.match(row.source_url,/^https:\/\/api\.boffsaopendata\.fi\//);
    assert.match(row.licence,/Bank of Finland/);
    assert.equal(row.attribution,'Source: Bank of Finland');
    assert.match(row.label,/Not the rate of any loan in the dataset/);
    assert.ok(row.series_code&&row.series_title);
  }
});
