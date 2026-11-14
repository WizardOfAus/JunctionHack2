import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCsv,header} from './read-csv.mjs';

const merchants=readCsv('../data/overlays/merchants.csv');
const ids=readCsv('../data/overlays/merchant_ids.csv');
const persona=JSON.parse(readFileSync(new URL('../data/persona.json',import.meta.url),'utf8'));
const byId=new Map(ids.map(row=>[row.merchant_id,row]));

const groups={GRO:'Groceries',RES:'Restaurants',TRN:'Transportation',ENT:'Entertainment',HEA:'Health',HMT:'Home & Tech',LIF:'Lifestyle',TRV:'Travel'};
// Venue types that fit each MCC. A name must label a venue of the same kind as the MCC.
const venueTypes={
  4111:['metro_station','train_station'],4121:['taxi_rank'],4511:['airline'],4722:['travel_agency'],
  5200:['home_improvement_store','hardware_store'],5251:['hardware_store','home_improvement_store'],5411:['supermarket'],
  5422:['butcher','fish_shop','delicatessen'],5451:['cheese_shop','delicatessen'],5499:['convenience_store','delicatessen','health_food_shop'],
  5541:['fuel_station'],5542:['fuel_station'],5651:['clothes_shop'],5691:['clothes_shop'],5712:['furniture_store'],
  5732:['electronics_store'],5734:['computer_or_games_store','mobile_phone_shop','electronics_store'],5812:['restaurant'],5813:['bar'],
  5814:['cafe'],5912:['pharmacy'],5941:['sports_shop','bicycle_shop'],5942:['bookshop'],5945:['toy_or_hobby_shop'],
  5999:['gift_or_variety_shop'],7011:['hotel'],7512:['car_rental'],7523:['parking_garage'],7832:['cinema'],
  7922:['theatre','event_venue'],7991:['museum_or_gallery','zoo_or_aquarium'],7996:['amusement_park','recreation_venue'],
  7999:['recreation_venue','public_sauna','public_bath'],8011:['medical_clinic'],8021:['dental_clinic'],8099:['health_practitioner'],
};

test('overlay has the expected columns',()=>{
  assert.deepEqual(header('../data/overlays/merchants.csv'),['merchant_id','display_name','brand','venue_type','source_mcc_code','source_category','mcc_description','municipality','postal_code','lat','lon','osm_type','osm_id','brand_wikidata','name_source','licence','retrieved_at','label']);
});

test('exactly one row for each of the 515 source merchant IDs',()=>{
  assert.equal(ids.length,515);
  assert.equal(new Set(ids.map(r=>r.merchant_id)).size,515);
  assert.equal(merchants.length,515);
  assert.equal(new Set(merchants.map(r=>r.merchant_id)).size,515);
  assert.deepEqual(merchants.map(r=>r.merchant_id).sort(),ids.map(r=>r.merchant_id).sort());
});

test('ID list agrees with every persona row and with the ID group code',()=>{
  const rows=persona.transactions.filter(t=>t.merchant_id);
  assert.ok(rows.length>0);
  for(const t of rows){
    const source=byId.get(t.merchant_id);
    assert.ok(source,`${t.merchant_id} is missing from merchant_ids.csv`);
    assert.equal(source.mcc_code,t.mcc_code);
    assert.equal(source.category,t.category);
  }
  for(const row of ids)assert.equal(groups[row.merchant_id.slice(4,7)],row.category,row.merchant_id);
});

test('source MCC and category agree with the source ID list',()=>{
  for(const row of merchants){
    const source=byId.get(row.merchant_id);
    assert.equal(row.source_mcc_code,source.mcc_code,row.merchant_id);
    assert.equal(row.source_category,source.category,row.merchant_id);
    assert.ok(row.mcc_description,`${row.merchant_id} has no MCC description`);
  }
});

test('each name labels a venue type that fits its MCC',()=>{
  for(const row of merchants){
    assert.ok(venueTypes[row.source_mcc_code],`no venue rule for MCC ${row.source_mcc_code}`);
    assert.ok(venueTypes[row.source_mcc_code].includes(row.venue_type),`${row.merchant_id}: ${row.venue_type} for MCC ${row.source_mcc_code}`);
  }
});

test('no two IDs share a venue or a display name',()=>{
  const venues=merchants.map(r=>r.osm_type?`${r.osm_type}/${r.osm_id}`:`wikidata/${r.brand_wikidata}`);
  assert.equal(new Set(venues).size,merchants.length);
  assert.equal(new Set(merchants.map(r=>r.display_name.toLocaleLowerCase('fi'))).size,merchants.length);
});

test('every row has a name, source, licence, date and the synthetic-data label',()=>{
  for(const row of merchants){
    assert.ok(row.display_name.trim(),row.merchant_id);
    assert.match(row.retrieved_at,/^\d{4}-\d{2}-\d{2}$/);
    assert.match(row.label,/synthetic/);
    assert.match(row.label,/did not take part/);
    if(row.licence==='ODbL-1.0'){
      assert.match(row.name_source,/^OpenStreetMap name( and (branch|addr:street) tags| tag)$/);
      assert.ok(['node','way','relation'].includes(row.osm_type),row.merchant_id);
      assert.match(row.osm_id,/^\d+$/);
      assert.ok(['Helsinki','Espoo','Vantaa'].includes(row.municipality),row.merchant_id);
      const lat=Number(row.lat),lon=Number(row.lon);
      assert.ok(lat>60.0&&lat<60.5&&lon>24.4&&lon<25.3,`${row.merchant_id} is outside the Helsinki region`);
    }else{
      assert.equal(row.licence,'CC0-1.0',row.merchant_id);
      assert.equal(row.name_source,'Wikidata English label');
      assert.match(row.brand_wikidata,/^Q\d+$/);
    }
  }
});
