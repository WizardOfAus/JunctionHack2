import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {defaults} from '../lib/finance.ts';
const base=process.argv[2]??'http://127.0.0.1:5177';
const post=async(path,body,cookie='')=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify(body)});const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{data={error:raw};}return {status:r.status,body:data,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
const prefix='/api/open-banking/';
const a=await post(prefix+'connect',{personaId:'reference',provider:'demo'});
assert.equal(a.status,200);assert.ok(a.cookie);assert.equal(a.body.connection.sessionId,undefined);
const list=await post(prefix+'connections',{personaId:'reference'},a.cookie);assert.equal(list.body.connections.length,1);
assert.equal((await post(prefix+'connections',{personaId:'reference'})).body.connections.length,0);
assert.equal((await post(prefix+'connections',{personaId:'tight-budget'},a.cookie)).body.connections.length,0);
assert.equal((await post(prefix+'connect',{personaId:'invalid',provider:'demo'})).status,400);
assert.equal((await post(prefix+'revoke',{personaId:'reference',id:a.body.connection.id})).status,400);
let captured='';
const agent=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);captured=Buffer.concat(chunks).toString();res.writeHead(503,{'content-type':'application/json'});res.end('{"error":{"message":"mock unavailable"}}');});
await new Promise(resolve=>agent.listen(5181,'127.0.0.1',resolve));
try{
 await post('/api/coach',{question:'Explain my full picture',personaId:'reference',assumptions:defaults},a.cookie);
 assert.ok(captured.includes('Full picture across connected accounts'));assert.ok(captured.includes('Demo bank is simulated'));
 await post('/api/coach',{question:'Explain my full picture',personaId:'reference',assumptions:defaults});
 assert.ok(!captured.includes('Full picture across connected accounts'));
}finally{agent.closeAllConnections();await new Promise(resolve=>agent.close(resolve));}
assert.equal((await post(prefix+'revoke',{personaId:'reference',id:a.body.connection.id},a.cookie)).body.revoked,true);
assert.equal((await post(prefix+'connections',{personaId:'reference'},a.cookie)).body.connections.length,0);
console.log('Bank HTTP smoke passed: demo connect/list/revoke, browser/persona isolation, no provider session leaks, connected coach context.');
