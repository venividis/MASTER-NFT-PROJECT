import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentHost} from '../../agent/extensions/host.mjs';
import {ACTIONS} from '../../web/extensions/agents.mjs';

test('Agent host authenticates, pins origins, exposes reviewable scope and consumes purchase approval once',async t=>{
  const token='a'.repeat(40);const buys=[];
  const buyer={signer:{getAddress:async()=> '0x'+'11'.repeat(20)},ledger:{budget:10n,maxPurchases:2},purchase:async input=>{buys.push(input);return {id:input.id,body:'service delivery'};}};
  const services=[{url:'https://service.example/resource',network:'eip155:31337',asset:'0x'+'22'.repeat(20),payTo:'0x'+'33'.repeat(20),maxAmount:'5',maxTimeoutSeconds:60}];
  const server=createAgentHost({token,allowedOrigins:['https://nft.example'],buyer,services});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`;const headers={Authorization:`Bearer ${token}`,'content-type':'application/json',Origin:'https://nft.example'};
  assert.equal((await fetch(url+'/status')).status,401);assert.equal((await fetch(url+'/status',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
  const status=await (await fetch(url+'/status',{headers})).json();assert.equal(status.payment.budget,'10');assert.equal(status.services[0].payTo,services[0].payTo);
  const post=(route,body)=>fetch(url+route,{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await post('/purchase',{reviewId:'arbitrary'})).status,400);
  const review=await(await post('/purchase/review',{service:0})).json();assert.equal(review.maximumAmount,'5');assert.equal(review.url,services[0].url);
  assert.equal((await post('/purchase',{reviewId:review.reviewId,url:'https://evil.example'})).status,200);assert.equal(buys[0].url,services[0].url);
  assert.equal((await post('/purchase',{reviewId:review.reviewId})).status,400);assert.equal(buys.length,1);
});

test('Agent workbench exposes explicit creation, revocation, job review and provider feedback actions',()=>{
  const ids=new Set(ACTIONS.map(a=>a.id));assert.equal(ids.size,ACTIONS.length);
  for(const id of ['agent-grant','agent-grant-revoke','agent-job-fund','agent-job-complete','agent-job-reject','agent-job-refund','agent-provider-register','agent-provider-feedback'])assert.ok(ids.has(id));
  for(const a of ACTIONS){assert.ok(a.contract&&a.method&&a.description);assert.ok(a.fields.every(f=>f.name&&f.label&&f.type));}
});
