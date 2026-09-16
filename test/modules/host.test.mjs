import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleHostSession, ModuleState, ReviewedAction, previewMigration, commitMigration, normalizeProposal, stateNamespace, HOST_LIMITS } from '../../web/modules/host.mjs';
import { validateScene, sceneFromRelease, mountScene } from '../../web/modules/runtime.mjs';
const A='0x'+'11'.repeat(20),B='0x'+'22'.repeat(20),C='0x'+'33'.repeat(20),D='0x'+'44'.repeat(20),H='0x'+'aa'.repeat(32),M='0x'+'bb'.repeat(32),S='0x'+'cc'.repeat(32),OTHER='0x'+'dd'.repeat(32);
const identity={chainId:'31337',collection:A,tokenId:'1',account:B,registry:C,owner:D,epoch:'2'};
const memory=()=>{const entries=new Map();return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};};
function setup(overrides={}){const storage=memory(),manifest={stateSchema:S,capabilities:['identity.read','state.read','state.write','transaction.propose','journal.propose']};let authority={...identity},proposals=[];const host=new ModuleHostSession({identity,releaseId:H,moduleKey:M,manifest,storage,verifyContext:async()=>authority,onProposal:async p=>{proposals.push(p);return{queued:true,sent:false};},onJournal:async()=>({queued:true,sent:false}),...overrides});return{host,storage,proposals,setAuthority:value=>authority=value};}
const message=(id,method,params={})=>({id,method,params});
const proposal={to:A,value:'1000000000000000',data:'0x',description:'An exact gift'};
test('host permits declared reads and isolated state but rejects wallet/RPC requests, escalation and replay',async()=>{
 const f=setup();assert.deepEqual(await f.host.handle(message('one','identity.read')),identity);
 await f.host.handle(message('two','state.set',{key:'draft',value:{message:'hello'}}));assert.deepEqual(await f.host.handle(message('three','state.get',{key:'draft'})),{message:'hello'});
 for(const method of ['eth_sendTransaction','eth_requestAccounts','fetch','wallet.sign','state.delete'])await assert.rejects(f.host.handle(message(method.replace(/[^a-zA-Z0-9]/g,''),method)),/permission/);
 await assert.rejects(f.host.handle(message('foreign','state.set',{key:'draft',value:'oops',namespace:'other'})),/fields/);
 await assert.rejects(f.host.handle(message('two','state.set',{key:'draft',value:'replay'})),/replayed/);
 const denied=setup({manifest:{stateSchema:S,capabilities:['identity.read']}});await assert.rejects(denied.host.handle(message('no','transaction.propose',proposal)),/permission/);assert.equal(denied.proposals.length,0);
});
test('ownership/epoch change during an awaited request closes resources before any local write',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const f=setup({verifyContext:()=>gate});let cleanups=0;f.host.cleanups.add(()=>cleanups++);
 const pending=f.host.handle(message('write','state.set',{key:'secret',value:'must not persist'}));release({...identity,epoch:'3'});await assert.rejects(pending,/custody/);assert.equal(f.host.closed,true);assert.equal(cleanups,1);assert.deepEqual(f.host.state.read(),{});
 await assert.rejects(f.host.handle(message('later','identity.read')),/closed/);
});
test('proposals are exact inert review requests and the host rejects malformed destination/calldata/value',async()=>{
 const f=setup();assert.deepEqual(await f.host.handle(message('review','transaction.propose',proposal)),{queued:true,sent:false});assert.deepEqual(f.proposals,[proposal]);
 for(const p of [{...proposal,to:'https://example.test'},{...proposal,value:'-1'},{...proposal,value:String(2n**256n)},{...proposal,data:'0x0'},{...proposal,gas:'unreviewed'}])assert.throws(()=>normalizeProposal(p));
 await assert.rejects(f.host.handle(message('journal','journal.propose',{text:'x'.repeat(4097)})),/4096/);
});
test('only verified package/dependency bytes are readable; unrelated releases, traversal and oversize reads fail',async()=>{
 const bytes=new TextEncoder().encode('{"frequencies":[220]}');const f=setup({files:[],dependencies:[{releaseId:OTHER,files:[{path:'score.json',mime:'application/json',bytes}]}]});
 const r=await f.host.handle(message('score','package.read',{releaseId:OTHER,path:'score.json'}));assert.equal(atob(r.base64),'{"frequencies":[220]}');assert.equal(r.bytes,bytes.length);
 await assert.rejects(f.host.handle(message('outside','package.read',{releaseId:S,path:'score.json'})),/outside/);
 await assert.rejects(f.host.handle(message('escape','package.read',{releaseId:OTHER,path:'../score.json'})),/reference/);
 const large=setup({files:[{path:'big.bin',mime:'application/octet-stream',bytes:new Uint8Array(HOST_LIMITS.packageBytes+1)}]});await assert.rejects(large.host.handle(message('big','package.read',{releaseId:H,path:'big.bin'})),/64 KiB/);
});
test('state survives compatible releases and remains isolated by token, module and schema; migration is explicit and stale previews fail',()=>{
 const storage=memory(),source=new ModuleState({storage,identity,moduleKey:M,stateSchema:S});source.set('draft',{v:1});
 assert.deepEqual(new ModuleState({storage,identity,moduleKey:M,stateSchema:S}).get('draft'),{v:1});
 for(const change of [{identity:{...identity,tokenId:'2'}},{moduleKey:OTHER},{stateSchema:OTHER}])assert.deepEqual(new ModuleState({storage,identity,moduleKey:M,stateSchema:S,...change}).read(),{});
 const destination=new ModuleState({storage,identity,moduleKey:M,stateSchema:OTHER});const preview=previewMigration({source,destination,value:{draft:{v:2}}});assert.deepEqual(destination.read(),{});commitMigration(preview,source,destination);assert.deepEqual(destination.read(),{draft:{v:2}});assert.deepEqual(source.read(),{draft:{v:1}});
 const stale=previewMigration({source,destination,value:{new:'schema'}});source.set('changed',true);assert.throws(()=>commitMigration(stale,source,destination),/changed/);
 const tampered=previewMigration({source,destination,value:{new:'reviewed'}});tampered.after.new='unreviewed';assert.throws(()=>commitMigration(tampered,source,destination),/changed/);
 const constrained=new ModuleState({storage,identity,moduleKey:OTHER,stateSchema:S,maxBytes:32});assert.throws(()=>constrained.set('draft','x'.repeat(33)),/limit/);assert.equal(source.namespace,stateNamespace(identity,M,S));
});
test('review creation never sends; confirmation rechecks custody, consumes approvals and drops stale async preparations',async()=>{
 let sends=0,prepared=0,cancelled=0,authority={...identity},now=10;
 const review=new ReviewedAction({verifyContext:async()=>authority,prepare:async()=>{prepared++;return{gas:'21000'};},send:async()=>{sends++;return{hash:H};},cancel:()=>cancelled++,now:()=>now});
 await review.review(proposal,identity);assert.equal(prepared,1);assert.equal(sends,0);assert.equal(review.pending.intent.value,proposal.value);authority={...identity,owner:A};await assert.rejects(review.confirm(),/custody/);assert.equal(sends,0);await assert.rejects(review.confirm(),/used/);
 authority={...identity};await review.review(proposal,identity);assert.deepEqual(await review.confirm(),{hash:H});assert.equal(sends,1);await assert.rejects(review.confirm(),/used/);
 await review.review(proposal,identity);now+=180001;await assert.rejects(review.confirm(),/expired/);assert.equal(sends,1);
 let release;review.prepare=()=>new Promise(resolve=>release=resolve);const pending=review.review(proposal,identity);await new Promise(resolve=>setImmediate(resolve));review.invalidate();release({gas:'1'});await assert.rejects(pending,/changed/);assert.equal(review.pending,null);assert.ok(cancelled>=4);
});
test('message transport closes its port on a bounded queue flood, including a stalled authorization',async()=>{
 let release;const f=setup({verifyContext:()=>new Promise(resolve=>release=resolve)});let closed=0;const port={onmessage:null,start(){},postMessage(){},close(){closed++;}};f.host.attachPort(port);
 for(let i=0;i<5;i++){const listener=port.onmessage;listener?.({data:message('r'+i,'identity.read')});}assert.equal(f.host.closed,true);assert.equal(closed,1);release?.(identity);
});
const scene={schema:'anima.module-scene/1',title:'A gift of sound',description:'A typed scene.',visual:{kind:'orb',primary:'#88ddff',secondary:'#af99ff',seed:42},audio:{frequencies:[220,330],durationMs:4000,volume:.08},fields:[],actions:[]};
test('typed runtime rejects executable entrypoints, URLs, unknown actions and excessive audio',()=>{
 assert.deepEqual(validateScene(scene),scene);for(const change of [{visual:{...scene.visual,primary:'url(https://bad.test)'}},{script:'while(true){}'},{audio:{...scene.audio,durationMs:999999}},{actions:[{kind:'sign',label:'No'}]}])assert.throws(()=>validateScene({...scene,...change}));
 assert.throws(()=>sceneFromRelease({entrypoint:'index.html',files:[{path:'index.html',bytes:new TextEncoder().encode('<script>bad()</script>')}]}),/not executed/);
 assert.deepEqual(sceneFromRelease({entrypoint:'scene.json',files:[{path:'scene.json',bytes:new TextEncoder().encode(JSON.stringify(scene))}]}),scene);
});
test('renderer uses an opaque sandbox, a source+nonce handshake, and cleanup removes the frame and timers',()=>{
 const listeners=new Map(),timers=new Set();const attrs={};let removed=0,attached=0;const frame={setAttribute:(k,v)=>attrs[k]=v,remove:()=>removed++,contentWindow:{postMessage:()=>attached++}};
 const container={ownerDocument:{createElement:()=>frame},replaceChildren:()=>{}};
 const win={crypto:{getRandomValues:a=>a.fill(3)},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name),setTimeout:()=>{timers.add(1);return 1;},clearTimeout:id=>timers.delete(id),setInterval:()=>{timers.add(2);return 2;},clearInterval:id=>timers.delete(id),MessageChannel:class{constructor(){this.port1={start(){},close(){}};this.port2={};}}};
 const f=setup(),mounted=mountScene({container,scene,session:f.host,window:win});assert.equal(attrs.sandbox,'allow-scripts');assert.doesNotMatch(attrs.sandbox,/same-origin|popups|forms/);assert.match(frame.srcdoc,/connect-src 'none'/);assert.match(frame.srcdoc,/frame-src 'none'/);
 listeners.get('message')({source:{},data:{type:'anima:ready',nonce:'03'.repeat(24)}});assert.equal(attached,0);listeners.get('message')({source:frame.contentWindow,data:{type:'anima:ready',nonce:'wrong'}});assert.equal(attached,0);listeners.get('message')({source:frame.contentWindow,data:{type:'anima:ready',nonce:'03'.repeat(24)}});assert.equal(attached,1);
 mounted.destroy();assert.equal(f.host.closed,true);assert.equal(removed,1);assert.equal(timers.size,0);assert.equal(listeners.size,0);mounted.destroy();assert.equal(removed,1);
});
