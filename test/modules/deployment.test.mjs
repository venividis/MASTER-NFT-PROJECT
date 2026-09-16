import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import ganache from 'ganache';
import {BrowserProvider,Contract,Interface,ZeroHash,getBytes,keccak256,sha256,toUtf8Bytes} from 'ethers';
import {deployStack,loadArtifact} from '../../scripts/lib/deploy-stack.mjs';
import {planModuleDeployment,prepareModuleDeployment,readWorkbenchBuild,validateModuleDeploymentConfig,verifyModuleDeploymentPlan} from '../../scripts/lib/modules-deployment.mjs';
import {buildWorkbench} from '../../scripts/modules-build-workbench.mjs';
import {recoverWorkbench,saveWorkbenchRecovery,readOnlyRpc,WORKBENCH_ABI} from '../../scripts/modules-recover-workbench.mjs';

const root=path.resolve(import.meta.dirname,'../..'),run=promisify(execFile);
const names=['ModuleArchiveFactory','ExtensionReleaseRegistry','TokenModuleRegistry','ModuleStateStore','ChunkedCartridgeRegistry','ArtifactBinding','AppChunk','OnchainApp','OnchainAppDirectory','ModuleWorkbench'];
const artifactSet=()=>Object.fromEntries(names.map(name=>[name,loadArtifact(name)]));
const config={chainId:31337,deployer:'0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',startingNonce:0,collection:'0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0'};

function documentFixture(t) {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'anima-workbench-plan-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const prefix='<!doctype html><html><meta charset="utf-8"><title>Recovery fixture</title><body><p>Self-contained workbench document</p><!--',suffix='--></body></html>';
  const bytes=Buffer.from(prefix+'x'.repeat(49152-Buffer.byteLength(prefix+suffix))+suffix);
  const archive=path.join(base,'archive');fs.mkdirSync(path.join(archive,'chunks'),{recursive:true});
  const chunks=[];
  for(let i=0;i<bytes.length;i+=23000){const data=bytes.subarray(i,i+23000),file='chunks/'+String(chunks.length).padStart(3,'0')+'.bin';fs.writeFileSync(path.join(archive,file),data);chunks.push({file,byteLength:data.length,sha256:sha256(data)});}
  const source=Buffer.from('self-contained local test fixture');fs.writeFileSync(path.join(base,'source.txt'),source);
  const manifest={schema:'anima.module-workbench/1',compression:'raw',byteLength:bytes.length,sha256:sha256(bytes),chunks,inputs:{'source.txt':sha256(source)}};
  const manifestPath=path.join(archive,'manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(archive,'index.html'),bytes);
  return {base,archive,manifestPath,bytes,manifest,workbench:readWorkbenchBuild(manifestPath,base)};
}

test('offline module planning validates exact bytes, constructor limits and explicit testnet identity',async t=>{
  const f=documentFixture(t),artifacts=artifactSet();
  const plan=await planModuleDeployment(config,{artifacts,workbench:f.workbench});
  assert.deepEqual(await planModuleDeployment(config,{artifacts,workbench:f.workbench}),plan,'pure plan determinism');
  assert.equal(plan.workbench.byteLength,49152);
  assert.equal(plan.archive.chunkReferences.length,3);
  assert.equal(plan.steps.length,9);
  assert.equal(plan.steps.find(step=>step.kind==='createArchive').preconditions.expectedFactoryNonce,1);
  assert.equal(plan.steps.at(-1).preconditions.contentSha256,sha256(f.bytes));
  assert.deepEqual(plan.internalCreations.map(x=>[x.contract,x.nonce]),[['ModuleStateStore',1],['ArtifactBinding',1],['OnchainApp',1]]);
  for(let i=0;i<plan.steps.length;i++){
    const step=plan.steps[i];assert.equal(step.nonce,i);assert.equal(step.value,'0');assert.equal(step.chainId,'31337');assert.equal(step.dataHash,keccak256(step.data));
    if(step.to===null)assert.ok(step.initcodeBytes<=49152);
  }
  await assert.rejects(()=>verifyModuleDeploymentPlan({...plan,nextNonce:plan.nextNonce+1}),/fingerprint mismatch/);
  assert.throws(()=>validateModuleDeploymentConfig({...config,chainId:1}),/Sepolia/);
  assert.throws(()=>validateModuleDeploymentConfig({...config,privateKey:'never accepted'}),/Unknown/);
  assert.throws(()=>validateModuleDeploymentConfig({...config,startingNonce:-1}),/nonce/);
  assert.throws(()=>validateModuleDeploymentConfig({...config,collection:'0x'+'00'.repeat(20)}),/nonzero/);
  await assert.rejects(()=>planModuleDeployment(config,{artifacts,workbench:{...f.workbench,bytes:Buffer.from('changed')}}),/Invalid raw/);
  const tooBig={...artifacts,ModuleWorkbench:{...artifacts.ModuleWorkbench,bytecode:'0x'+'60'.repeat(49100)}};
  await assert.rejects(()=>planModuleDeployment(config,{artifacts:tooBig,workbench:f.workbench}),/initcode including arguments/);
  const runtimeTooBig={...artifacts,ModuleWorkbench:{...artifacts.ModuleWorkbench,deployedBytecode:'0x'+'60'.repeat(24577)}};
  await assert.rejects(()=>planModuleDeployment(config,{artifacts:runtimeTooBig,workbench:f.workbench}),/EIP-170/);
  fs.appendFileSync(path.join(f.base,'source.txt'),'changed');
  assert.throws(()=>readWorkbenchBuild(f.manifestPath,f.base),/build input changed/);
  fs.writeFileSync(path.join(f.base,'source.txt'),'self-contained local test fixture');
  const changed=JSON.parse(fs.readFileSync(f.manifestPath));changed.chunks[0].file='../source.txt';fs.writeFileSync(f.manifestPath,JSON.stringify(changed));
  assert.throws(()=>readWorkbenchBuild(f.manifestPath,f.base),/ordered workbench chunk/);
  fs.writeFileSync(f.manifestPath,JSON.stringify(f.manifest));
  fs.appendFileSync(path.join(f.archive,'chunks/000.bin'),'x');
  assert.throws(()=>readWorkbenchBuild(f.manifestPath,f.base),/chunk differs/);
});

test('operator planning binds current compilation and independently rebuilt workbench, rejecting self-consistent substituted bytes',async t=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'anima-current-workbench-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const output=path.join(base,'built'),built=await buildWorkbench({output}),options={workbenchManifest:path.join(output,'manifest.json')};
  const plan=await prepareModuleDeployment(config,options);
  assert.equal(plan.verification.scope,'current compiled source and rebuilt workbench');
  assert.equal(plan.workbench.sha256,sha256(built.bytes));
  assert.deepEqual(await verifyModuleDeploymentPlan(plan,options),plan);
  // An attacker can recompute every local document hash, but cannot make different bytes
  // equal the independently rebuilt current source bundle.
  const substituted=Buffer.from(built.bytes);substituted[0]^=1;
  const manifest=JSON.parse(fs.readFileSync(options.workbenchManifest));manifest.sha256=sha256(substituted);
  const first=substituted.subarray(0,23000);manifest.chunks[0].sha256=sha256(first);
  fs.writeFileSync(path.join(output,manifest.chunks[0].file),first);fs.writeFileSync(path.join(output,'index.html'),substituted);fs.writeFileSync(options.workbenchManifest,JSON.stringify(manifest));
  assert.equal(readWorkbenchBuild(options.workbenchManifest).manifest.sha256,sha256(substituted),'all declared hashes are internally consistent');
  await assert.rejects(()=>prepareModuleDeployment(config,options),/differs from the current reproducible source build/);
});

test('exact unsigned module-system plan deploys beside an existing native NFT and independently recovers its workbench', {timeout:180000},async t=>{
  const f=documentFixture(t),artifacts=artifactSet();
  const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},miner:{timestampIncrement:1,blockGasLimit:50000000},wallet:{deterministic:true,defaultBalance:1000},logging:{quiet:true}});
  const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=5;
  t.after(async()=>{provider.destroy();await rpc.disconnect();});
  const signer=await provider.getSigner(),owner=await signer.getAddress();
  const native=await deployStack({signer,attesterAddress:owner,royaltyBps:0}),collection=native.collection;
  const secret=keccak256(toUtf8Bytes('existing native NFT for unsigned module plan'));
  await(await collection.commitAwakening(await collection.commitmentFor(owner,secret,owner),{value:1000n})).wait();
  await rpc.request({method:'evm_mine',params:[]});await(await collection.revealAwakening(secret,owner)).wait();
  const snapshot=await collection.renderSnapshot(1),account=await collection.accountOf(1);
  const originalCode=await provider.getCode(collection.target),accountCode=await provider.getCode(account),accountBalance=await provider.getBalance(account);
  const startingNonce=Number(BigInt(await rpc.request({method:'eth_getTransactionCount',params:[owner,'pending']})));
  const plan=await planModuleDeployment({chainId:31337,deployer:owner,startingNonce,collection:collection.target},{artifacts,workbench:f.workbench});
  for(const step of plan.steps){
    const tx={data:step.data,nonce:step.nonce,chainId:BigInt(step.chainId),value:BigInt(step.value),...(step.to===null?{}:{to:step.to})};
    const estimate=await signer.estimateGas(tx),sent=await signer.sendTransaction({...tx,gasLimit:(estimate*120n+99n)/100n}),receipt=await sent.wait();
    assert.equal(receipt.status,1,step.id);
    if(step.to===null)assert.equal(receipt.contractAddress.toLowerCase(),step.expectedAddress.toLowerCase(),step.id);
    const mined=await provider.getTransaction(sent.hash);assert.equal(mined.data,step.data);assert.equal(mined.nonce,step.nonce);assert.equal(mined.value,0n);
  }
  assert.equal(Number(BigInt(await rpc.request({method:'eth_getTransactionCount',params:[owner,'pending']}))),plan.nextNonce);
  const deployed=name=>new Contract(plan.modules[name],artifacts[name].abi,provider);
  assert.equal((await deployed('TokenModuleRegistry').stateStore()).toLowerCase(),plan.modules.ModuleStateStore.toLowerCase());
  assert.equal((await deployed('ChunkedCartridgeRegistry').artifact()).toLowerCase(),plan.modules.ArtifactBinding.toLowerCase());
  assert.equal(await deployed('ModuleArchiveFactory').archiveSchema(plan.modules.WorkbenchArchive),1n);
  assert.equal(await deployed('ModuleArchiveFactory').archiveCodeHash(plan.modules.WorkbenchArchive),keccak256(await provider.getCode(plan.modules.WorkbenchArchive)));
  for(const child of plan.internalCreations)assert.notEqual(await provider.getCode(child.expectedAddress),'0x',child.contract);
  const after=await collection.renderSnapshot(1);assert.deepEqual(Array.from(after),Array.from(snapshot),'building companion modules leaves native art and state untouched');
  assert.equal(await provider.getCode(collection.target),originalCode);assert.equal(await provider.getCode(account),accountCode);assert.equal(await provider.getBalance(account),accountBalance);
  const reads=[],request=async payload=>{reads.push(payload);return rpc.request(payload);};
  const args={request,chainId:31337,workbench:plan.modules.ModuleWorkbench,tokenId:1,expectedHash:sha256(f.bytes)};
  const recovered=await recoverWorkbench(args);
  assert.deepEqual(Buffer.from(recovered.bytes),f.bytes);
  assert.equal(recovered.record.services.installations,plan.modules.TokenModuleRegistry.toLowerCase());
  assert.equal(recovered.record.services.collection,collection.target.toLowerCase());
  assert.equal(recovered.record.tokenContext.account,account.toLowerCase());assert.equal(recovered.record.tokenContext.moduleCount,'0');
  assert.equal(recovered.record.tokenContext.root,ZeroHash);
  assert.ok(reads.every(x=>['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call'].includes(x.method)));
  assert.ok(reads.filter(x=>['eth_getCode','eth_call'].includes(x.method)).every(x=>x.params[1]===recovered.record.snapshot.block),'all contract reads use the same pinned block');
  const output=path.join(f.base,'recovered');saveWorkbenchRecovery(recovered,output);
  assert.deepEqual(fs.readFileSync(path.join(output,'index.html')),f.bytes);
  assert.throws(()=>saveWorkbenchRecovery(recovered,output),/already exists/);
  assert.throws(()=>saveWorkbenchRecovery({...recovered,bytes:Buffer.from('changed')},path.join(f.base,'bad')),/changed before saving/);
  await assert.rejects(()=>recoverWorkbench({...args,chainId:11155111}),/chain differs/);
  await assert.rejects(()=>recoverWorkbench({...args,expectedHash:ZeroHash}),/content commitment mismatch/);
  await assert.rejects(()=>recoverWorkbench({...args,expectedCodeHash:ZeroHash}),/anchor code hash mismatch/);
  const iface=new Interface(WORKBENCH_ABI),selector=iface.getFunction('readChunk').selector;
  await assert.rejects(()=>recoverWorkbench({...args,request:async payload=>{
    const result=await rpc.request(payload);
    if(payload.method==='eth_call'&&payload.params[0].to===plan.modules.ModuleWorkbench.toLowerCase()&&payload.params[0].data.startsWith(selector)){
      const bytes=getBytes(iface.decodeFunctionResult('readChunk',result)[0]);bytes[0]^=1;return iface.encodeFunctionResult('readChunk',[bytes]);
    }return result;
  }}),/hash or length mismatch/);
  await assert.rejects(()=>recoverWorkbench({...args,request:async payload=>payload.method==='eth_getCode'&&payload.params[0]===plan.modules.WorkbenchArchive.toLowerCase()?'0x00':rpc.request(payload)}),/code\/factory binding mismatch/);
  let blockReads=0;
  await assert.rejects(()=>recoverWorkbench({...args,tokenId:undefined,request:async payload=>{const result=await rpc.request(payload);return payload.method==='eth_getBlockByNumber'&&++blockReads>1?{...result,hash:ZeroHash}:result;}}),/snapshot changed/);

  // Exercise the real CLI over a local read-only transport, independently of ethers signers.
  const server=http.createServer(async(req,res)=>{try{let input='';for await(const chunk of req)input+=chunk;const p=JSON.parse(input);assert.ok(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call'].includes(p.method));const result=await rpc.request({method:p.method,params:p.params});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:p.id,result}));}catch(error){res.statusCode=500;res.end('read failed');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url='http://127.0.0.1:'+server.address().port;
  await assert.rejects(()=>readOnlyRpc(url)({method:'eth_sendTransaction',params:[]}),/read-only/);
  await assert.rejects(()=>readOnlyRpc(url,{maxResponseBytes:1})({method:'eth_chainId',params:[]}),/response exceeds/);
  assert.throws(()=>readOnlyRpc('http://example.com'),/HTTPS/);assert.throws(()=>readOnlyRpc('https://user:password@example.com'),/credentials/);
  const cliOutput=path.join(f.base,'cli-recovered'),argv=['scripts/modules-recover-workbench.mjs','--rpc',url,'--chain','31337','--workbench',plan.modules.ModuleWorkbench,'--token-id','1','--output',cliOutput];
  const cli=await run(process.execPath,argv,{cwd:root,timeout:30000,maxBuffer:1024*1024});assert.equal(JSON.parse(cli.stdout).sha256,sha256(f.bytes));
  assert.deepEqual(fs.readFileSync(path.join(cliOutput,'index.html')),f.bytes);
  await assert.rejects(()=>run(process.execPath,argv,{cwd:root,timeout:30000}),error=>{assert.match(error.stderr,/already exists/);return true;});
  assert.deepEqual(fs.readFileSync(path.join(cliOutput,'index.html')),f.bytes,'CLI never overwrites an existing recovery');
});
