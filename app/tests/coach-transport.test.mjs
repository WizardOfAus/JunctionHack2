import './resolve-ts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FlueApiError } from '@flue/sdk';
const { askAgent, AgentUnavailableError, isAgentOutage } = await import('../lib/coach/transport.ts');
const config = { url:'https://agent.invalid/agents/koti' };
const input = { customerId:'CUST04859', question:'Explain my reserve' };

for (const status of [400,401,403,404,409,422]) test(`agent HTTP ${status} is not disguised as an outage`, async t => {
  t.mock.method(globalThis,'fetch',async()=>Response.json({error:{message:'Request rejected'}},{status}));
  await assert.rejects(askAgent(config,input),e=>e instanceof FlueApiError && e.status===status && !(e instanceof AgentUnavailableError));
});
for (const status of [408,429,500,503]) test(`agent HTTP ${status} permits a labelled fallback`, async t => {
  t.mock.method(globalThis,'fetch',async()=>Response.json({error:{message:'Unavailable'}},{status}));
  await assert.rejects(askAgent(config,input),AgentUnavailableError);
});
test('fetch network failures permit fallback, programming errors do not',async t=>{
  const network=t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('fetch failed');});
  await assert.rejects(askAgent(config,input),AgentUnavailableError);
  network.mock.mockImplementation(async()=>{throw new Error('Network connection lost.');});
  await assert.rejects(askAgent(config,input),AgentUnavailableError);
  const bug=new TypeError('Cannot read properties of undefined');
  network.mock.mockImplementation(async()=>{throw bug;});
  await assert.rejects(askAgent(config,input),e=>e===bug);
});
test('aborted requests permit fallback but cannot hide an explicit authentication failure',()=>{
  const signal=AbortSignal.abort();
  assert.equal(isAgentOutage(new DOMException('Timed out','TimeoutError'),signal),true);
  assert.equal(isAgentOutage(new FlueApiError(401,'Unauthorized'),signal),false);
});

test('caller cancellation stops admitted durable work, without fallback', async t => {
  const caller = new AbortController();
  let aborts = 0, reading;
  const started = new Promise(resolve => { reading = resolve; });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/abort')) {
      aborts++;
      assert.equal(init.signal.aborted, false, 'abort uses an independent signal');
      return Response.json({ ok: true });
    }
    if (init.method === 'POST') return Response.json({ submissionId:'test', streamUrl:String(url)+'?view=updates', offset:'0' }, {status:202});
    reading();
    return new Promise((_, reject) => {
      if (init.signal.aborted) reject(init.signal.reason);
      else init.signal.addEventListener('abort', () => reject(init.signal.reason), {once:true});
    });
  });
  const reply = askAgent(config, input, {signal:caller.signal});
  await started;
  caller.abort();
  await assert.rejects(reply, e => !(e instanceof AgentUnavailableError));
  assert.equal(aborts, 1);
});
