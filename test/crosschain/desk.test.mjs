import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../../agent/extensions/node_modules/linkedom/esm/index.js';
import {CrosschainDesk} from '../../web/crosschain/desk.mjs';
import {readProvider} from '../../web/crosschain/client.mjs';
test('cross-chain desk escapes user values and invalidates changed transaction terms',()=>{
 const chain={payer:'0x1111111111111111111111111111111111111111',chainId:1,plan:null,invalidate(){this.plan=null;}};
 const desk=new CrosschainDesk({chain});desk.values.recipient='<img src=x onerror=alert(1)>';
 const {document,window}=parseHTML('<html><body><main></main></body></html>'),root=document.querySelector('main');root.innerHTML=desk.render();desk.mount(root);
 assert.equal(root.querySelectorAll('img').length,0);
 const plan={};chain.plan=plan;desk.prepared=plan;
 const field=root.querySelector('[data-cross-field="amount"]');field.value='15';field.dispatchEvent(new window.Event('input'));
 assert.equal(desk.values.amount,'15');assert.equal(chain.plan,null);assert.equal(desk.prepared,null);desk.unmount();
});
test('external read endpoints reject plain remote HTTP and credentials',()=>{
 assert.throws(()=>readProvider('http://example.com',1),/HTTPS/);
 assert.throws(()=>readProvider('https://user:pass@example.com',1),/HTTPS/);
});
test('recipient history restores immutable recovery terms without a source transaction or saved GUID',async()=>{
 const chain={payer:'0x1111111111111111111111111111111111111111',chainId:1,async switchChain(id){this.chainId=id;}};
 const desk=new CrosschainDesk({chain}),guid='0x'+'a'.repeat(64),action={recipient:chain.payer,minimumReceived:'10',lockAmount:'4',deadline:'2000000000',start:'0',cliff:'1900000000',end:'1900000000',linear:false};
 desk.history={chainId:'42161',blockNumber:77,blockHash:'0x'+'b'.repeat(64),context:{destinationChain:'42161'},records:[{guid,status:1,statusLabel:'Deferred — retry or refund',action}]};
 await desk.act('delivery:'+guid);assert.equal(desk.values.guid,guid);assert.deepEqual(JSON.parse(desk.values.retryAction),action);assert.equal(desk.values.sourceHash,'');assert.equal(desk.lane,undefined);
 await desk.act('destination');assert.equal(chain.chainId,42161);assert.equal(desk.record.destinationBlock,77);
});
