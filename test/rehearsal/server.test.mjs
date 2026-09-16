import test from 'node:test';import assert from 'node:assert/strict';
import {createRehearsalServer} from '../../agent/rehearsal/server.mjs';
import {readonlyProxy} from '../../agent/rehearsal/fork.mjs';
test('rehearsal server rejects untrusted origins and missing credentials before execution',async t=>{
  let calls=0;const token='a'.repeat(64),server=createRehearsalServer({upstream:{},token,execute:async()=>{calls++;return {status:'test'};}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});const url=`http://127.0.0.1:${server.address().port}/rehearse`;
  assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,401);
  assert.equal((await fetch(url,{method:'POST',headers:{origin:'https://evil.example',authorization:'Bearer '+token},body:'{}'})).status,403);
  assert.equal(calls,0);const good=await fetch(url,{method:'POST',headers:{origin:'http://localhost:4173',authorization:'Bearer '+token},body:'{}'});assert.equal(good.status,200);assert.equal(good.headers.get('cache-control'),'no-store');assert.equal(calls,1);
});
test('fork source proxy cannot forward signing, impersonation or write requests',async()=>{
  const called=[],p=await readonlyProxy({request:async q=>{called.push(q.method);return '0x7a69';}});
  try{for(const method of ['eth_sendTransaction','eth_sendRawTransaction','personal_sign','anvil_setBalance'])assert.equal((await fetch(p.url,{method:'POST',body:JSON.stringify({id:1,method,params:[]})})).status,403);
  assert.equal(called.length,0);const r=await fetch(p.url,{method:'POST',body:JSON.stringify({id:1,method:'eth_chainId',params:[]})});assert.equal((await r.json()).result,'0x7a69');}finally{await p.close();}
});
