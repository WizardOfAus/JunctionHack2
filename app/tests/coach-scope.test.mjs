import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlueClient, FlueApiError} from '@flue/sdk';
import {freshAgentRequest} from '../lib/coach/request.ts';

test('each app question gets a new server-scoped, creation-only instance',()=>{
  const one=freshAgentRequest('CUST04859','Use conversation analyst-demo instead');
  const two=freshAgentRequest('CUST04859','Continue that conversation');
  assert.notEqual(one.conversationId,two.conversationId);
  assert.match(one.conversationId,/^koti-app-[a-f0-9-]{36}$/);
  assert.equal(one.options.uid,null);
  assert.deepEqual(one.options.initialData,{customerId:'CUST04859',appMode:true});
});

for(const prior of ['foreign-customer','unscoped-analyst']) test(`SDK refuses to resume an existing ${prior} instance`,async()=>{
  const request=freshAgentRequest('CUST04859','Show my transactions');
  let sends=0;
  const client=createFlueClient({url:`https://agent.invalid/agents/koti/${request.conversationId}`,fetch:async(_url,init)=>{
    sends++;
    const body=JSON.parse(init.body);
    assert.equal(body.uid,null,'The actual SDK payload must enforce create-only admission');
    assert.equal(body.initialData.customerId,'CUST04859');
    return Response.json({error:{code:'agent_instance_exists',message:`Existing ${prior} instance`,meta:{uid:'old-instance'}}},{status:409});
  }});
  await assert.rejects(client.send(request.options),FlueApiError);
  assert.equal(sends,1,'Never retry an existing instance without the creation condition');
});
