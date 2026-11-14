import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {readCsv} from './read-csv.mjs';

const areas=readCsv('../data/overlays/postal_areas.csv');
const customers=new URL('../work/tx_customers_junction.csv',import.meta.url);

test('one row for each distinct customer postal code, kept as five-digit strings',()=>{
  assert.equal(areas.length,290);
  assert.equal(new Set(areas.map(r=>r.postal_code)).size,areas.length);
  for(const row of areas)assert.match(row.postal_code,/^0[012]\d{3}$/);
  assert.ok(areas.some(r=>r.postal_code==='00640'),'the main persona postal code 00640 is missing');
});

test('every customer postal code has a row (only when the source file is present locally)',{skip:!existsSync(customers)&&'work/tx_customers_junction.csv is not present'},()=>{
  const lines=readFileSync(customers,'utf8').replace(/^﻿/,'').trim().split('\n').slice(1);
  const codes=new Set(lines.map(line=>line.split(',')[1]));
  assert.deepEqual([...codes].sort(),areas.map(r=>r.postal_code).sort());
});

test('codes not in Paavo are kept and marked, with no guessed values',()=>{
  for(const row of areas){
    assert.ok(['in_paavo','not_in_paavo'].includes(row.status),row.postal_code);
    if(row.status==='not_in_paavo'){
      for(const key of ['area_name_fi','area_name_sv','municipality_fi','inhabitants','households','household_median_income_eur'])
        assert.equal(row[key],'',`${row.postal_code} ${key}`);
    }else{
      assert.ok(row.area_name_fi&&row.area_name_sv&&row.municipality_fi,row.postal_code);
    }
  }
});

test('every row has source, licence, year and retrieval date',()=>{
  for(const row of areas){
    assert.match(row.source,/^Statistics Finland/);
    assert.equal(row.licence,'CC-BY-4.0');
    assert.match(row.paavo_year,/^\d{4}$/);
    assert.match(row.retrieved_at,/^\d{4}-\d{2}-\d{2}$/);
  }
});
