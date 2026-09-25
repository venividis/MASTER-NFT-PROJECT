import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import http from 'node:http';
import {BrowserProvider,keccak256,toUtf8Bytes,parseEther} from 'ethers';
import {deployContract} from '../../scripts/lib/deploy-stack.mjs';
import {deployModuleSystem} from '../../scripts/lib/modules-stack.mjs';
import {sharedScorePackage,exampleModules} from '../../web/modules/examples.mjs';
import {parseMintedTokenURI,createReadOnlyRequest,recoverMintSnapshot,createSimulatorServer,mintDocument,simulatorSha256,assertLocalEdition,installLiveGuard,simulatorDocument} from '../../scripts/lib/prism-simulator.mjs';

const exampleAddress='0x'+'12'.repeat(20);
test('pinned RPC allows bounded reads and rejects wallet authority, writes, overrides and foreign blocks',async()=>{
 const calls=[],request=createReadOnlyRequest(async p=>{calls.push(p);return '0x01';},{blockNumber:'0x10'});
 assert.equal(await request({method:'eth_chainId',params:[]}),'0x7a69');
 assert.equal(await request({method:'eth_blockNumber',params:[]}),'0x10');
 await request({method:'eth_call',params:[{to:exampleAddress,data:'0x'},'latest']});assert.equal(calls[0].params[1],'0x10');
 for(const method of ['eth_accounts','eth_requestAccounts','eth_sendTransaction','eth_sendRawTransaction','eth_sign','personal_sign','eth_signTypedData_v4','wallet_switchEthereumChain','evm_mine','evm_setAccountBalance','personal_unlockAccount'])await assert.rejects(request({method,params:[]}),/read-only RPC/);
 await assert.rejects(request({method:'eth_call',params:[{to:exampleAddress},'latest',{}]}),/override/);
 await assert.rejects(request({method:'eth_call',params:[{to:exampleAddress,value:'0x1'},'latest']}),/Value/);
 await assert.rejects(request({method:'eth_getCode',params:[exampleAddress,'pending']}),/pinned/);
 assert.equal(calls.length,1);
});

test('immutable identity parsing rejects unexpected executable expressions and altered token binding',()=>{
 const identity={seed:'0x'+'11'.repeat(32),genome:'0x'+'22'.repeat(32),root:'0x'+'33'.repeat(32),chainId:'31337',collection:exampleAddress,tokenId:'1',manifest:exampleAddress,privacyResource:exampleAddress,runtime:exampleAddress,sha256:'0x'+'44'.repeat(32),archiveVersion:'1'};
 const uri=body=>'data:application/json;base64,'+Buffer.from(JSON.stringify({animation_url:'data:text/html;base64,'+Buffer.from(body).toString('base64')})).toString('base64');
 const loader='<script>window.AWE_CHAIN_IDENTITY='+JSON.stringify(identity)+';</script><!doctype html>';
 assert.deepEqual(parseMintedTokenURI(uri(loader),identity).identity,identity);
 assert.throws(()=>parseMintedTokenURI(uri(loader),{...identity,tokenId:'2'}),/differs/);
 assert.throws(()=>parseMintedTokenURI(uri(loader.replace('"31337"','(globalThis.compromised=1)')),identity));
 assert.equal(globalThis.compromised,undefined);
 assert.throws(()=>parseMintedTokenURI(uri(loader.replace('"31337"','"1"')),identity),/differs/);
});

test('saved editions cannot silently reuse a stale runtime, workbench or build',()=>{
 const record={schema:'anima.master-local/1',chainId:31337,buildManifestSha256:'build',runtimeHash:'runtime',workbenchHash:'workbench'},expected={buildManifestSha256:'build',runtimeHash:'runtime',workbenchHash:'workbench'};
 assert.doesNotThrow(()=>assertLocalEdition(record,expected));
 for(const key of Object.keys(expected))assert.throws(()=>assertLocalEdition(record,{...expected,[key]:'changed'}),/changed/);
});

test('real local NFT mint recovers exact immutable runtime/workbench and HTTP never exposes chain mutation',{timeout:180000},async t=>{
 const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},miner:{blockGasLimit:100000000},wallet:{totalAccounts:2,defaultBalance:10000},logging:{quiet:true}});
 const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 t.after(async()=>{provider.destroy();await rpc.disconnect();});
 const signer=await provider.getSigner(),owner=await signer.getAddress();
 const deploy=(name,args=[])=>deployContract(name,signer,args);
 const runtime='<!doctype html><html><meta charset="utf-8"><title>Mint fixture</title><body><h1>Immutable runtime</h1></body></html>',workbench='<!doctype html><html><body>Immutable workbench</body></html>';
 const chunk=await deploy('AppChunk',['0x'+Buffer.from(runtime).toString('hex')]);
 const archive=await deploy('OnchainApp',[[chunk.target],simulatorSha256(runtime)]);
 const manifest=await deploy('GenesisManifest'),privacy=await deploy('AppChunk',['0x01']);
 const renderer=await deploy('ConfluenceRenderer',[archive.target,manifest.target,privacy.target]);
 const router=await deploy('ProofRouter',[owner]),witness=await deploy('OmnichainWitnessRegistry',[owner]);
 const collection=await deploy('IDontFuckingBelieveIt',[owner,renderer.target,router.target,witness.target,owner,0]);
 const factory=await deploy('SovereignAccountFactory',[collection.target,router.target]);await(await collection.setAccountFactory(factory.target)).wait();
 const secret=keccak256(toUtf8Bytes('prism simulator real EVM fixture'));
 await(await collection.commitAwakening(await collection.commitmentFor(owner,secret,owner),{value:parseEther('25')})).wait();
 await rpc.request({method:'evm_mine',params:[]});await rpc.request({method:'evm_mine',params:[]});await(await collection.revealAwakening(secret,owner)).wait();
 const system=await deployModuleSystem({provider,signer,collection:collection.target,workbenchBytes:Buffer.from(workbench)});
 const shared=await system.publish(await sharedScorePackage({publisher:owner.toLowerCase()}));
 const packages=await exampleModules({publisher:owner.toLowerCase(),sharedReleaseId:shared.releaseId});
 const example=await system.publish(packages[0]);await system.install(1,example,{});
 const record={schema:'anima.master-local/1',chainId:31337,collection:collection.target,tokenId:'1',registry:system.modules.target,releaseRegistry:system.releases.target,workbench:system.workbench.target,workbenchHash:simulatorSha256(workbench),runtimeHash:simulatorSha256(runtime),buildManifestSha256:'fixture-build'};
 const request=p=>rpc.request(p);
 const snapshot=await recoverMintSnapshot({request,record,expectedRuntime:runtime,expectedWorkbench:workbench,expectedBuildManifestSha256:'fixture-build'});
 assert.equal(snapshot.runtimeHtml,runtime);assert.equal(snapshot.workbenchHtml,workbench);
 assert.equal(snapshot.provenance.verification.installedModules,1);
 assert.equal(snapshot.provenance.verification.runtimeByteEquality,true);
 assert.ok(snapshot.rpcRecords.some(r=>r.method==='eth_call'));
 assert.equal(snapshot.identity.collection.toLowerCase(),collection.target.toLowerCase());
 assert.ok(mintDocument(snapshot).startsWith('<!doctype html>'));
 assert.ok(mintDocument(snapshot).endsWith(runtime));
 await assert.rejects(recoverMintSnapshot({request,record,expectedRuntime:runtime+'wrong',expectedWorkbench:workbench}),/differs/);
 const server=createSimulatorServer({snapshot,request});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin='http://127.0.0.1:'+server.address().port;
 assert.equal(await(await fetch(origin+'/token/1/runtime')).text(),runtime);
 assert.equal(await(await fetch(origin+'/token/1/loader')).text(),snapshot.loaderHtml);
 assert.ok((await(await fetch(origin+'/')).text()).startsWith('<!doctype html>'));
 assert.equal((await(await fetch(origin+'/token/1/provenance')).json()).blockHash,snapshot.blockHash);
 const before=await rpc.request({method:'eth_blockNumber',params:[]});
 const mutation=await(await fetch(origin+'/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:1,method:'evm_mine',params:[]})})).json();assert.equal(mutation.error.code,4200);
 assert.equal(await rpc.request({method:'eth_blockNumber',params:[]}),before);
 assert.equal((await fetch(origin+'/rpc',{method:'POST',headers:{Origin:'https://attacker.example'},body:'{}'})).status,403);
 const foreignHostStatus=await new Promise((resolve,reject)=>{const req=http.request(origin+'/rpc',{method:'POST',headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end('{}');});assert.equal(foreignHostStatus,403);
});


test('live replay isolates wallet discovery and reestablishes the barrier after document.open',async()=>{
 const events=[],doc={addEventListener:(name,fn,capture)=>events.push([name,capture]),open(){events.length=0;return this;}};
 const win={document:doc,addEventListener:(name,fn,capture)=>events.push([name,capture]),fetch:async()=>({ok:true,json:async()=>({result:'0x7a69'})})};
 const provider=installLiveGuard(win,'/rpc');
 assert.equal(win.ethereum,provider);assert.equal(await win.AWE_CHAIN_RPC({method:'eth_chainId',params:[]}),'0x7a69');
 assert.equal(events.length,4);doc.open();assert.equal(events.length,4);
 assert.throws(()=>{win.ethereum={request(){}};},TypeError);
 const locked={};Object.defineProperty(locked,'ethereum',{value:{request(){}},configurable:false});
 assert.throws(()=>installLiveGuard(locked,'/rpc'),/prevents a safe/);assert.equal(locked.__ANIMA_SIMULATOR_ISOLATED__,undefined);
 const source='<script>globalThis.mintExecuted=true;</script>';
 const wrapper=simulatorDocument(source,'<script>throw Error("isolation unavailable")</script>');
 assert.ok(wrapper.startsWith('<!doctype html>'));
 assert.ok(!wrapper.includes(source));assert.match(wrapper,/__ANIMA_SIMULATOR_ISOLATED__===true/);
});
