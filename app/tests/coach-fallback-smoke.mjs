// Start a dedicated app preview with KOTI_AGENT_URL=http://127.0.0.1:5181/agents/koti.
// This mock never calls a model. Usage: node tests/coach-fallback-smoke.mjs http://127.0.0.1:5177
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {defaults,DATA_START,HISTORY_THROUGH} from '../lib/finance.ts';
const origin=process.argv[2]||'http://127.0.0.1:5177';
let status=401;
const agent=createServer((_request,response)=>{response.writeHead(status,{'content-type':'application/json'});response.end(JSON.stringify({error:{message:'Mock failure'}}));});
await new Promise(resolve=>agent.listen(5181,'127.0.0.1',resolve));
const ask=async(question,personaId='reference')=>{
  const response=await fetch(origin+'/api/coach',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question,personaId,assumptions:defaults})});
  return {status:response.status,body:await response.json()};
};
try {
  for(status of [401,403,404]) {
    const r=await ask('What is my balance?');
    assert.equal(r.status,502);assert.ok(r.body.error);assert.equal(r.body.agentUnavailable,undefined);assert.equal(r.body.text,undefined);
  }
  status=503;
  const calculated=await ask('What is my balance?');
  assert.equal(calculated.status,200);assert.equal(calculated.body.mode,'demo');assert.equal(calculated.body.agentUnavailable,true);assert.match(calculated.body.text,/calculated answer/);
  const hello=await ask('hello');
  assert.equal(hello.status,200);assert.equal(hello.body.kind,'help');assert.equal(hello.body.text,'The AI coach is not available right now.');
  const invalidReduction=await ask('What if I spent 150% less eating out?');
  assert.equal(invalidReduction.status,200);assert.equal(invalidReduction.body.kind,'help');assert.equal(invalidReduction.body.mode,'demo');assert.equal(invalidReduction.body.agentUnavailable,true);
  assert.equal(invalidReduction.body.text,'Choose a spending reduction between 0% and 100%.');
  const invalidPeriod=await ask(`Restaurants from ${HISTORY_THROUGH} to ${DATA_START}`);
  assert.equal(invalidPeriod.status,200);assert.equal(invalidPeriod.body.kind,'help');assert.equal(invalidPeriod.body.agentUnavailable,true);
  assert.match(invalidPeriod.body.text,/^Choose a period between .*\. The data ends there\.$/);
  assert.doesNotMatch(invalidPeriod.body.text,/calculated answer|AI coach/);
  const mortgage=await ask('Why was my mortgage declined?','flexible-spender');
  assert.match(mortgage.body.text,/no home loan application on record/);
  console.log('Fallback HTTP smoke: 401/403/404 fail visibly;503 gives labelled calculations, preserved validation, honest help and scoped readiness.');
} finally {await new Promise(resolve=>agent.close(resolve));}
