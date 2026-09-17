import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Interface,toUtf8Bytes,keccak256} from 'ethers';
import {fixture,send,event,artifacts} from './contracts.fixture.mjs';
import {packageFiles,sha256,canonicalManifest,manifestHash,releaseInput,releaseIdFor,readRelease,recoverRelease,readRegistry,encodeInstall,encodeWriteState,encodeStageState,encodeActivate,recoverState,recoverToken,assertCurrentContext,validateReleaseRecord,moduleKeyFor,ZERO_HASH,STATE_ABI,TOKEN_REGISTRY_ABI} from '../../packages/modules/sdk.mjs';
import {planArchiveDeployment,validateDeploymentPlan,createDeploymentJournal,appendDeploymentReceipt,reconcileDeploymentJournal,preparePublishRecipe} from '../../packages/modules/deployment.mjs';
import {RegistryAdapter} from '../../web/modules/adapter.mjs';

test('native NFT: SDK publishes, recovers only selected closure, saves/migrates state and reconstructs public history',async t=>{
 const f=await fixture(t,{mint:true}),request=p=>f.rpc.request(p),publisher=(await f.publisher.getAddress()).toLowerCase();
 const files=[{path:'index.html',mime:'text/html',bytes:'<!doctype html><p>Saved on ANIMA</p>',imports:[]}];
 const publish=async(name,options={})=>{const p=await packageFiles(files,{name,version:1,publisher,entrypoint:'index.html',...options}),a=await f.archive(p.archive),descriptor={...a.descriptor,expandedHash:p.manifest.archive.expandedHash,expandedBytes:p.manifest.archive.expandedBytes},input=releaseInput(p.manifest,descriptor),id=releaseIdFor(publisher,input,p.manifest);
  assert.equal(await f.releases.hashRelease(publisher,input,p.manifestHash),id);const prepared=await preparePublishRecipe({request,chainId:31337,registry:f.releases.target,manifest:p.manifest,archiveAddress:descriptor.archive,archiveSchema:descriptor.schema});assert.equal(prepared.releaseId,id);assert.equal(prepared.data,f.releases.interface.encodeFunctionData('publish',[input,toUtf8Bytes(canonicalManifest(p.manifest))]));await send(f.releases.connect(f.publisher),'publish',[input,toUtf8Bytes(canonicalManifest(p.manifest))]);return {...p,id,input,address:descriptor.archive};};
 const library=await publish('shared-score'),root=await publish('notes',{dependencies:[library.id],capabilities:['identity.read','state.read','state.write'],stateSchema:sha256('notes/state/1')}),unrelated=await publish('unrelated');
 const calls=[];const recovered=await recoverRelease({request:async p=>{calls.push(p);return request(p);},registry:f.releases.target,releaseId:root.id,chainId:31337});assert.equal(recovered.manifest.name,'notes');assert.deepEqual(recovered.dependencies.map(d=>d.manifest.name),['shared-score']);assert.ok(!calls.some(p=>p.params?.[0]?.to?.toLowerCase()===unrelated.address.toLowerCase()));assert.ok(calls.filter(p=>p.method==='eth_call').every(p=>p.params[1]===recovered.snapshot.block&&p.params[0].gas==='0x989680'));
 const record=await readRelease({request,registry:f.releases.target,releaseId:root.id,chainId:31337});const poisoned=structuredClone(record);poisoned.input.capabilities=[];assert.throws(()=>validateReleaseRecord(poisoned,root.id),/ABI differs/);
 const run=async recipe=>(await f.owner.sendTransaction({to:recipe.to,data:recipe.data,value:BigInt(recipe.value)})).wait();
 let context=await readRegistry({request,registry:f.modules.target,tokenId:1,chainId:31337});const old=context;const installed=await run(encodeInstall(context,{releaseId:root.id}));await assert.rejects(()=>assertCurrentContext({request,context:old}),/Stale review/);
 context=await readRegistry({request,registry:f.modules.target,tokenId:1,chainId:31337});assert.equal(context.modules[0].releaseId,root.id);const key=context.modules[0].moduleKey;
 // ABI tuple fields can shadow Array methods: `at` must be the mined timestamp,
 // not ethers Result.at, so real history remains usable by the workbench.
 const installBlock=await request({method:'eth_getBlockByNumber',params:['0x'+installed.blockNumber.toString(16),false]});
 const installedAt=BigInt(installBlock.timestamp).toString();assert.equal(context.history[0].at,installedAt);assert.equal(context.history[0].at,(await f.modules.historyOf(1,0,64))[0][0][6].toString());
 assert.equal(new Date(Number(context.history[0].at)*1000).toISOString(),new Date(Number(BigInt(installBlock.timestamp))*1000).toISOString());
 await run(encodeWriteState(context,{moduleKey:key,bytes:toUtf8Bytes('{"score":7}')}));context=await readRegistry({request,registry:f.modules.target,tokenId:1,chainId:31337});const firstHead=context.modules[0].stateHead;
 const state=await recoverState({request,stateStore:context.stateStore,stateId:firstHead,chainId:31337,collection:context.collection,tokenId:1,moduleKey:key});assert.equal(new TextDecoder().decode(state.bytes),'{"score":7}');await assert.rejects(()=>recoverState({request,stateStore:context.stateStore,stateId:firstHead,chainId:31337,collection:context.collection,tokenId:2,moduleKey:key}),/different module or NFT/);
 const upgraded=await publish('notes',{version:2,predecessor:root.id,dependencies:[library.id],capabilities:['identity.read','state.read','state.write'],stateSchema:sha256('notes/state/2')});
 const migration=encodeStageState(context,{moduleKey:key,stateSchema:upgraded.manifest.stateSchema,bytes:toUtf8Bytes('{"score":7,"revision":2}')});const staged=await run(migration),nextHead=event(staged,f.state,'StateStaged').stateId;
 context=await readRegistry({request,registry:f.modules.target,tokenId:1,chainId:31337});assert.equal(context.modules[0].stateHead,firstHead);await run(encodeActivate(context,{releaseId:upgraded.id,expectedStateHead:firstHead,nextStateHead:nextHead}));
 // The history inspector must recover the selected historical snapshot, not
 // silently substitute the latest state belonging to the upgraded release.
 const adapter=new RegistryAdapter({raw:{request}},{registry:f.modules.target});
 adapter.context=async()=>{const c=await readRegistry({request,registry:f.modules.target,tokenId:1,chainId:31337});return {...c,identity:{...c}};};
 const oldRelease={moduleKey:key,manifest:root.manifest},newRelease={moduleKey:key,manifest:upgraded.manifest};
 assert.deepEqual((await adapter.savedState(oldRelease,{stateHead:firstHead})).value,{score:7});
 assert.deepEqual((await adapter.savedState(newRelease)).value,{score:7,revision:2});
 await assert.rejects(adapter.savedState(newRelease,{stateHead:firstHead}),/Historical snapshot schema/);
 await assert.rejects(adapter.savedState({...oldRelease,moduleKey:moduleKeyFor(publisher,sha256('other-module'))},{stateHead:firstHead}),/different module or NFT/);
 assert.deepEqual((await adapter.savedState(oldRelease,{stateHead:ZERO_HASH})).value,{});
 // Prepare state for a never-installed namespace and discard its transaction receipt.
 context=await readRegistry({request,registry:f.modules.target,tokenId:1,chainId:31337});const beforeUnactivatedRoot=context.root;
 const unactivatedKey=moduleKeyFor(publisher,sha256('never-activated')),unactivatedBytes=toUtf8Bytes('{"draft":"prepared before any installation"}');
 await run(encodeStageState(context,{moduleKey:unactivatedKey,stateSchema:sha256('never-activated/state/1'),bytes:unactivatedBytes}));
 assert.equal(await f.modules.rootOf(1),beforeUnactivatedRoot);assert.equal(await f.modules.moduleCount(1),1n);assert.equal(await f.modules.historyCount(1),3n);
 const exportAll=await recoverToken({request,registry:f.modules.target,tokenId:1,chainId:31337});assert.equal(exportAll.context.modules[0].releaseId,upgraded.id);assert.equal(exportAll.states.length,3);assert.equal(exportAll.context.stateModuleCount,"2");assert.ok(exportAll.context.stateModules.includes(unactivatedKey));assert.deepEqual(exportAll.states.find(state=>state.moduleKey===unactivatedKey).bytes,unactivatedBytes);assert.deepEqual(new Set(exportAll.packages.map(p=>p.releaseId)),new Set([library.id,root.id,upgraded.id]));assert.equal(exportAll.context.history.length,3);assert.equal(exportAll.context.account,context.account);assert.equal(await f.collection.ownerOf(1),f.owner.address);
 // A stalled/short RPC page must fail immediately, not loop or omit records.
 const moduleABI=new Interface(TOKEN_REGISTRY_ABI),statePagesABI=new Interface(STATE_ABI);
 for(const method of ['modulesOf','historyOf']){
  const malformed=async p=>p.method==='eth_call'&&p.params[0].to.toLowerCase()===f.modules.target.toLowerCase()&&p.params[0].data.startsWith(moduleABI.getFunction(method).selector)?moduleABI.encodeFunctionResult(method,[[],0]):request(p);
  await assert.rejects(readRegistry({request:malformed,registry:f.modules.target,tokenId:1,chainId:31337}),/Invalid catalog page response/);
 }
 for(const mutation of ['reverse','duplicate','overflow']){
  const malformed=async p=>{
   const result=await request(p);
   if(p.method==='eth_call'&&p.params[0].to.toLowerCase()===f.state.target.toLowerCase()&&p.params[0].data.startsWith(statePagesABI.getFunction('historyOf').selector)){
    const [ids,next]=statePagesABI.decodeFunctionResult('historyOf',result);
    if(ids.length===2)return statePagesABI.encodeFunctionResult('historyOf',[mutation==='reverse'?[...ids].reverse():mutation==='duplicate'?[ids[0],ids[0]]:[...ids,ids[0]],mutation==='overflow'?3:next]);
   }
   return result;
  };
  await assert.rejects(recoverToken({request:malformed,registry:f.modules.target,tokenId:1,chainId:31337}),/State history order|Duplicate or empty state history|Invalid state history page/);
 }
 const packageBytes=exportAll.packages.reduce((n,p)=>n+p.manifest.archive.expandedBytes,0);let payloadReads=0;
 await assert.rejects(recoverToken({request:async p=>{if(p.method==='eth_getCode')payloadReads++;return request(p);},registry:f.modules.target,tokenId:1,chainId:31337,maxExpandedBytes:packageBytes-1}),/Token packages exceed expanded recovery budget/);
 assert.equal(payloadReads,0,'reject an oversized export before fetching any archive payload');
 const exactBudget=await recoverToken({request,registry:f.modules.target,tokenId:1,chainId:31337,maxExpandedBytes:exportAll.expandedBytes});
 assert.equal(exactBudget.expandedBytes,exportAll.expandedBytes,'shared dependency bytes count only once');
 // Exercise the independent read-only CLI against the same real chain via loopback JSON-RPC.
 const rpcMethods=[];const server=http.createServer(async(req,res)=>{let body;try{const chunks=[];for await(const p of req)chunks.push(p);body=JSON.parse(Buffer.concat(chunks));rpcMethods.push(body.method);const result=await request({method:body.method,params:body.params});res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result}));}catch(e){res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:body?.id??null,error:{code:Number.isInteger(e.code)?e.code:-32000,message:String(e.message)}}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const temp=await fs.mkdtemp(path.join(os.tmpdir(),'anima-sdk-recovery-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));const output=path.join(temp,'token');
 await promisify(execFile)(process.execPath,['scripts/modules-recover.mjs','--rpc',`http://127.0.0.1:${server.address().port}`,'--chain','31337','--registry',f.modules.target,'--token','1','--output',output],{cwd:path.resolve(import.meta.dirname,'../..'),timeout:20000});
 const receipt=JSON.parse(await fs.readFile(path.join(output,'receipt.json'),'utf8'));assert.equal(receipt.packages.length,3);assert.equal(receipt.states.length,3);const unactivatedRecovered=receipt.states.find(state=>state.moduleKey===unactivatedKey);assert.ok(unactivatedRecovered);assert.deepEqual(new Uint8Array(await fs.readFile(path.join(output,"states",unactivatedRecovered.stateId+".bin"))),unactivatedBytes);assert.equal(await fs.readFile(path.join(output,'states',nextHead+'.bin'),'utf8'),'{"score":7,"revision":2}');assert.ok(rpcMethods.every(m=>['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call'].includes(m)));
 // Both operator planning phases consume only public reads and emit concrete calldata.
 const cli=promisify(execFile),cwd=path.resolve(import.meta.dirname,'../..'),rpcURL=`http://127.0.0.1:${server.address().port}`;
 const source=path.join(temp,'source'),metadata=path.join(temp,'options.json'),packageDir=path.join(temp,'package');await fs.mkdir(source);await fs.writeFile(path.join(source,'index.html'),'<!doctype html><p>CLI publication</p>');await fs.writeFile(metadata,JSON.stringify({name:'cli-publication',version:1,publisher,entrypoint:'index.html'}));
 await cli(process.execPath,['scripts/modules-package.mjs','--input',source,'--metadata',metadata,'--output',packageDir],{cwd,timeout:20000});
 const archivePlanPath=path.join(temp,'archive-plan.json'),planBase=['scripts/modules-plan-package.mjs','--package',packageDir,'--rpc',rpcURL,'--chain','31337'];
 const beforePlanningNonce=await request({method:'eth_getTransactionCount',params:[publisher,'pending']});
 await cli(process.execPath,[...planBase,'--factory',f.factory.target,'--publisher',publisher,'--output',archivePlanPath],{cwd,timeout:30000});
 assert.equal(await request({method:'eth_getTransactionCount',params:[publisher,'pending']}),beforePlanningNonce,'planning cannot consume a nonce');
 const archivePlan=JSON.parse(await fs.readFile(archivePlanPath,'utf8'));assert.equal(archivePlan.phase,'archive');assert.equal(archivePlan.packageManifestHash,manifestHash(JSON.parse(await fs.readFile(path.join(packageDir,'manifest.json'),'utf8'))));assert.ok(archivePlan.compilerProvenance.compiler.startsWith('0.8.30+'));assert.ok(!JSON.stringify(archivePlan).includes(rpcURL));
 for(const step of archivePlan.steps)await(await f.publisher.sendTransaction({to:step.to??undefined,data:step.data,value:0,nonce:step.nonce})).wait();
 const reusePath=path.join(temp,'reuse.json'),reusePlanPath=path.join(temp,'reuse-plan.json');await fs.writeFile(reusePath,JSON.stringify(Object.fromEntries(archivePlan.chunks.map(c=>[c.hash,c.address]))));
 await cli(process.execPath,[...planBase,'--factory',f.factory.target,'--publisher',publisher,'--reuse',reusePath,'--output',reusePlanPath],{cwd,timeout:30000});assert.equal(JSON.parse(await fs.readFile(reusePlanPath,'utf8')).deployBytes,0);
 const publishPlanPath=path.join(temp,'publish-plan.json');await cli(process.execPath,[...planBase,'--registry',f.releases.target,'--archive',archivePlan.archiveAddress,'--schema',String(archivePlan.archiveSchema),'--output',publishPlanPath],{cwd,timeout:20000});
 const publication=JSON.parse(await fs.readFile(publishPlanPath,'utf8'));assert.equal(publication.phase,'publish');assert.equal(await f.releases.exists(publication.releaseId),false,'publication planning only simulates');
 await(await f.publisher.sendTransaction({to:publication.to,data:publication.data,value:0})).wait();assert.equal(await f.releases.exists(publication.releaseId),true,'the exact reviewed publication call works');
 await assert.rejects(()=>cli(process.execPath,[...planBase,'--registry',f.releases.target,'--archive',archivePlan.archiveAddress,'--schema','1','--output',path.join(temp,'conflict.json')],{cwd,timeout:20000}),/RPC rejected|publication/);await assert.rejects(()=>fs.stat(path.join(temp,'conflict.json')),{code:'ENOENT'});
 assert.ok(rpcMethods.every(m=>['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getTransactionCount','eth_call'].includes(m)));
 // A changed block hash and a substituted committed state payload both fail closed.
 let blocks=0;await assert.rejects(()=>recoverRelease({request:async p=>{const result=await request(p);if(p.method==='eth_getBlockByNumber'&&++blocks>1)return {...result,hash:'0x'+'ff'.repeat(32)};return result;},registry:f.releases.target,releaseId:root.id,chainId:31337}),/snapshot changed/);
 const stateABI=new Interface(STATE_ABI);await assert.rejects(()=>recoverState({request:async p=>{if(p.method==='eth_call'&&p.params[0].data.startsWith(stateABI.getFunction('dataOf').selector))return stateABI.encodeFunctionResult('dataOf',['0xdead']);return request(p);},stateStore:context.stateStore,stateId:firstHead,chainId:31337}),/commitment/);
 // Archive-backed saves also respect the remaining budget before code/chunk reads.
 const archiveState=await f.archive(toUtf8Bytes('a'.repeat(4096)));
 context=await readRegistry({request,registry:f.modules.target,tokenId:1,chainId:31337});
 const archivedReceipt=await run(encodeStageState(context,{moduleKey:key,stateSchema:upgraded.manifest.stateSchema,bytes:new Uint8Array(),archive:archiveState.descriptor}));
 const archivedHead=event(archivedReceipt,f.state,'StateStaged').stateId;payloadReads=0;
 await assert.rejects(recoverState({request:async p=>{if(p.method==='eth_getCode')payloadReads++;return request(p);},stateStore:context.stateStore,stateId:archivedHead,chainId:31337,maxExpandedBytes:4095}),/State exceeds expanded recovery byte budget/);
 assert.equal(payloadReads,0);
 assert.equal((await recoverState({request,stateStore:context.stateStore,stateId:archivedHead,chainId:31337,maxExpandedBytes:4096})).bytes.length,4096);
});

test('invalid byte budgets fail before any chain request',async()=>{
 let calls=0;const request=async()=>{calls++;throw Error('Unexpected RPC');};
 for(const recover of [recoverRelease,recoverState,recoverToken])for(const maxExpandedBytes of [NaN,Infinity,-1,1.5,'1024',Number.MAX_SAFE_INTEGER]){
  await assert.rejects(recover({request,maxExpandedBytes}),/Invalid expanded recovery byte budget/);
 }
 assert.equal(calls,0);
});

test('public deployment plan executes with dedupe and reconciles receipts without a private key',async t=>{
 const f=await fixture(t),request=p=>f.rpc.request(p),publisher=(await f.owner.getAddress()).toLowerCase();
 const content=new Uint8Array(46008).fill(17),compiled=artifacts().AppChunk;
 const plan=await planArchiveDeployment({archive:content,publisher,chainId:31337,startNonce:Number(BigInt(await request({method:'eth_getTransactionCount',params:[publisher,'pending']}))),factory:f.factory.target,factoryNonce:Number(BigInt(await request({method:'eth_getTransactionCount',params:[f.factory.target,'latest']}))),appChunkArtifact:{abi:compiled.abi,bytecode:'0x'+compiled.evm.bytecode.object}});
 assert.equal(plan.steps.filter(s=>s.kind==='chunk').length,2);assert.equal(plan.chunkReferences.length,3);assert.equal(plan.deployBytes,23008);await validateDeploymentPlan(request,plan);let journal=createDeploymentJournal(plan);
 for(const step of plan.steps){const receipt=await(await f.owner.sendTransaction({to:step.to??undefined,data:step.data,value:0,nonce:step.nonce})).wait();journal=appendDeploymentReceipt(journal,{stepId:step.id,transactionHash:receipt.hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,status:receipt.status,contractAddress:receipt.contractAddress});}
 const verified=await reconcileDeploymentJournal(request,journal);assert.equal(verified.complete,true);assert.equal(verified.verifiedSteps,plan.steps.length);
 const altered=structuredClone(journal);altered.completed[0].blockHash='0x'+'01'.repeat(32);await assert.rejects(()=>reconcileDeploymentJournal(request,altered),/receipt/);
 const reuse=Object.fromEntries(plan.chunks.map(c=>[c.hash,c.address]));const next=await planArchiveDeployment({archive:content,publisher,chainId:31337,startNonce:Number(BigInt(await request({method:'eth_getTransactionCount',params:[publisher,'pending']}))),factory:f.factory.target,factoryNonce:Number(BigInt(await request({method:'eth_getTransactionCount',params:[f.factory.target,'latest']}))),appChunkArtifact:{abi:compiled.abi,bytecode:'0x'+compiled.evm.bytecode.object},existingChunks:reuse});assert.equal(next.deployBytes,0);assert.equal(next.steps.length,1);await validateDeploymentPlan(request,next);
});
