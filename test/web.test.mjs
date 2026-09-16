import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createStaticServer} from '../scripts/serve.mjs';
import {composeRuntime} from '../scripts/lib/runtime-build.mjs';
const root=path.resolve(import.meta.dirname,'..','web');
test('interface keeps a full-screen scene and exposes every advertised action',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const id of ['organism','atmosphere','evolve','ascend','spawn','events','policy-preview','timeline','sound','memory','reference','quality','connect','load-token','transaction-review','send-transaction'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/LOCAL PREVIEW/);assert.match(html,/NO ZK \/ TEE CLAIM IN PREVIEW/);assert.doesNotMatch(html,/It remembers becoming/);
});
test('preview has no automatic network or wallet activity',()=>{
 for(const file of ['styles.css','model.mjs','renderer.js','audio.js','app.js']){
  const s=fs.readFileSync(path.join(root,file),'utf8');assert.doesNotMatch(s,/fetch\s*\(|new WebSocket|new XMLHttpRequest/);
 }
 const source=fs.readFileSync(path.join(root,'evm.mjs'),'utf8');assert.match(source,/eth_sendTransaction/);assert.match(source,/eth_getTransactionReceipt/);assert.match(source,/eth_call/);
});
test('current source bundle has inline optical assets and preserves the original reference',async()=>{
 const {html}=await composeRuntime(path.join(root,'..'));assert.match(html,/WebAssembly\.instantiate/);assert.match(html,/referenceHTML/);assert.match(html,/id="original-runtime"/);assert.match(html,/src="web\/confluence\/app.js"/);
});
test('GPU resources are recoverable and CPU fallback uses the actual field program',()=>{
 const s=fs.readFileSync(path.join(root,'renderer.js'),'utf8');assert.match(s,/webglcontextlost/);assert.match(s,/webglcontextrestored/);assert.match(s,/render_region/);assert.match(s,/new Worker/);assert.doesNotMatch(s,/gl\.LINES|gl\.POINTS/);
});
test('static server serves modules and rejects forbidden methods',async()=>{
 const server=createStaticServer({directory:root});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{assert.equal((await fetch(base+'/')).status,200);const mod=await fetch(base+'/evm.mjs');assert.match(mod.headers.get('content-type'),/text\/javascript/);assert.equal(mod.headers.get('x-content-type-options'),'nosniff');assert.equal(await (await fetch(base+'/',{method:'HEAD'})).text(),'');assert.equal((await fetch(base+'/',{method:'POST'})).status,405);}finally{await new Promise(r=>server.close(r));}
});
test('static server rejects traversal and malformed paths',async()=>{
 const server=createStaticServer({directory:root});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{for(const p of ['/..%2fpackage.json','/..%2fweb-other%2fsecret','/missing'])assert.equal((await fetch(base+p)).status,404);assert.equal((await fetch(base+'/%zz')).status,400);assert.equal((await fetch(base+'/%00')).status,400);}finally{await new Promise(r=>server.close(r));}
});
