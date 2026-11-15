// Isolated preview: KOTI_AGENT_URL=http://127.0.0.1:5181/agents/koti.
// Uses a mock agent; never calls a model. Run: node tests/coach-stream-smoke.mjs http://127.0.0.1:5177
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {defaults} from '../lib/finance.ts';
import {parseEvents} from '../lib/coach/stream-client.ts';
const origin=process.argv[2]??'http://127.0.0.1:5177';
let mode='outage', abortedAt=0;
const agent=createServer((req,res)=>{
  if(req.url.endsWith('/abort')) {abortedAt=Date.now();res.writeHead(200,{'content-type':'application/json'});res.end('{}');return;}
  if(mode==='outage') {res.writeHead(503,{'content-type':'application/json'});res.end('{"error":{"message":"Mock unavailable"}}');return;}
  if(req.method==='POST') {res.writeHead(202,{'content-type':'application/json'});res.end(JSON.stringify({submissionId:'test',offset:'0',streamUrl:`http://127.0.0.1:5181${req.url}?view=updates`}));}
  // The read stays quiet: disconnect detection must not depend on model/tool events.
});
await new Promise(resolve=>agent.listen(5181,'127.0.0.1',resolve));
const post=(path,body,signal)=>fetch(origin+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal});
try {
  for(const question of ['hello','What is my balance?','What if I spent 150% less eating out?']) {
    const body={question,personaId:'reference',assumptions:defaults};
    const json=await post('/api/coach',body);
    const stream=await post('/api/coach/stream',body);
    assert.match(stream.headers.get('content-type'),/text\/event-stream/);
    const final=parseEvents(await stream.text()).events.find(e=>e.event==='final').data;
    assert.equal(final.status,json.status);assert.deepEqual(final.body,await json.json());
  }
  const invalid=await post('/api/coach/stream',{question:''});
  assert.equal(parseEvents(await invalid.text()).events.find(e=>e.event==='final').data.status,400);
  mode='quiet';
  const controller=new AbortController();
  const response=await post('/api/coach/stream',{question:'Explain my reserve',personaId:'reference',assumptions:defaults},controller.signal);
  const reader=response.body.getReader();let text='';
  while(!text.includes(': ping')) {const part=await reader.read();assert.equal(part.done,false);text+=new TextDecoder().decode(part.value);}
  const stoppedAt=Date.now();controller.abort();
  await reader.cancel().catch(()=>{});
  const deadline=Date.now()+7000;
  while(!abortedAt&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,100));
  assert.ok(abortedAt,'browser cancellation must send /abort to the admitted agent');
  assert.ok(abortedAt-stoppedAt<6500,`cancellation took ${abortedAt-stoppedAt}ms`);
  console.log(`Stream smoke passed: JSON parity, validation, heartbeat, durable abort ${abortedAt-stoppedAt}ms after disconnect.`);
} finally {agent.closeAllConnections();await new Promise(resolve=>agent.close(resolve));}
