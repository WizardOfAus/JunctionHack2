import test from 'node:test';
import assert from 'node:assert/strict';
import {progressMapper,sourceDomains,applyProgress,emptyProgress,CALCULATING_STEP} from '../lib/coach/progress.ts';
import {parseEvents} from '../lib/coach/stream-client.ts';

test('agent events become allowlisted steps without tool inputs or customer data',()=>{
  const map=progressMapper();
  const events=[
    ...map({type:'tool-input',toolCallId:'a',toolName:'query_transactions',input:{customerId:'CUST04859',sql:'select * from tx'}}),
    ...map({type:'tool-output',toolCallId:'a',output:{rows:[{amount:-50.47,merchant:'M123'}]}}),
    ...map({type:'tool-input',toolCallId:'b',toolName:'web_search',input:{query:'euribor today'}}),
    ...map({type:'tool-output',toolCallId:'b',output:{results:[{url:'https://www.suomenpankki.fi/fi/tilastot/?x=1'},{url:'https://euribor-rates.eu/en/'},{url:'https://suomenpankki.fi/en/'}]}}),
    ...map({type:'tool-input',toolCallId:'c',toolName:'mystery_tool',input:{secret:'k'}}),
    ...map({type:'message-delta',kind:'reasoning',delta:'private thoughts'}),
    ...map({type:'message-delta',kind:'text',delta:'Hello'}),
  ];
  const wire=JSON.stringify(events);
  for(const leaked of ['CUST04859','select','50.47','M123','euribor today','secret','private thoughts','/fi/tilastot']) assert.ok(!wire.includes(leaked),leaked);
  assert.deepEqual(events.filter(e=>e.type==='step').map(e=>e.label),['Looking through your transactions','Checking public sources','Working it out']);
  assert.deepEqual(events.find(e=>e.type==='sources').domains,['suomenpankki.fi','euribor-rates.eu']);
  // Only web tools report sources; transaction outputs never do.
  assert.equal(events.filter(e=>e.type==='sources').length,1);
});

test('source domains are deduplicated, stripped of www and capped',()=>{
  assert.deepEqual(sourceDomains('see https://www.a.fi/x and http://b.com/y?z https://a.fi'),['a.fi','b.com']);
  assert.equal(sourceDomains(Array.from({length:9},(_,i)=>`https://s${i}.fi`).join(' ')).length,5);
});

test('the progress state tracks steps, sources and streamed text',()=>{
  let s=emptyProgress;
  for(const e of [CALCULATING_STEP,{type:'step-done',id:CALCULATING_STEP.id},{type:'step',id:'b',label:'Checking public sources'},{type:'step',id:'b',label:'dup'},{type:'sources',id:'b',domains:['a.fi']},{type:'sources',id:'b',domains:['a.fi','b.fi']},{type:'text',delta:'Hel'},{type:'text',delta:'lo'}]) s=applyProgress(s,e);
  assert.deepEqual(s.steps,[{id:'app-calculation',label:'Calculating from your transactions',done:true},{id:'b',label:'Checking public sources',done:false}]);
  assert.deepEqual(s.sources,['a.fi','b.fi']);assert.equal(s.text,'Hello');
});

test('server-sent events parse across chunk boundaries',()=>{
  const first=parseEvents('event: progress\ndata: {"type":"text","delta":"a"}\n\nevent: fin');
  assert.deepEqual(first.events,[{event:'progress',data:{type:'text',delta:'a'}}]);
  const second=parseEvents(first.rest+'al\ndata: {"status":200,"body":{}}\n\n');
  assert.deepEqual(second.events,[{event:'final',data:{status:200,body:{}}}]);assert.equal(second.rest,'');
});
