// Dedicated preview with mock agent5181. No model or real personal data used.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {defaults} from '../lib/finance.ts';
const base=process.argv[2]??'http://127.0.0.1:5177';
const post=async(path,body,cookie='',extra={})=>{
 const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',cookie,...extra},body:JSON.stringify(body)});
 const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data={error:raw};}
 return {status:r.status,body:data,cookie:r.headers.get('set-cookie')?.split(';')[0]};
};
const list={action:'list',personaId:'reference',assumptions:defaults,goal:'understand'};
const a=await post('/api/memory',list),b=await post('/api/memory',list);
assert.equal(a.status,200);assert.equal(b.status,200);assert.ok(a.cookie);assert.notEqual(a.cookie,b.cookie);
const text='Isolation check: I prefer a quiet home';
let captured='';
const agent=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);captured=Buffer.concat(chunks).toString();res.writeHead(503,{'content-type':'application/json'});res.end('{"error":{"message":"mock unavailable"}}');});
await new Promise(resolve=>agent.listen(5181,'127.0.0.1',resolve));
try {
 const added=await post('/api/memory',{action:'add',personaId:'reference',text},a.cookie);assert.equal(added.status,200);
 assert.equal((await post('/api/memory',list,a.cookie)).body.told.length,1);
 assert.equal((await post('/api/memory',list,b.cookie)).body.told.length,0);
 await post('/api/memory',{action:'delete',personaId:'reference',id:added.body.memory.id},b.cookie);
 assert.equal((await post('/api/memory',list,a.cookie)).body.told.length,1);
 assert.equal((await post('/api/memory',{...list,personaId:'flexible-spender'},a.cookie)).body.told.length,0);
 const ask={question:'Explain my reserve',personaId:'reference',assumptions:defaults};
 await post('/api/coach',ask,a.cookie);assert.ok(captured.includes(text));
 await post('/api/coach',ask,b.cookie);assert.ok(!captured.includes(text));
 await post('/api/coach',ask);assert.ok(!captured.includes(text));
 assert.equal((await post('/api/memory',{action:'add',personaId:'reference',text,visitorId:'forged'},a.cookie)).status,400);
 assert.equal((await post('/api/memory',{action:'add',personaId:'reference',text},a.cookie,{origin:'https://evil.invalid'})).status,403);
 await post('/api/memory',{action:'delete',personaId:'reference',id:added.body.memory.id},a.cookie);
 assert.equal((await post('/api/memory',list,a.cookie)).body.told.length,0);
 console.log('Memory isolation passed: independent browsers, persona scope, delete ownership, coach context, forged scope and cross-origin rejection.');
} finally {agent.closeAllConnections();await new Promise(resolve=>agent.close(resolve));}
