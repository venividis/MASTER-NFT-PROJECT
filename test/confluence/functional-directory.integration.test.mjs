import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Contract,keccak256,toUtf8Bytes,Interface,ZeroAddress} from 'ethers';
import {fixtureExpanded} from './functional-fixture.mjs';
import {packageRuntimeModules,moduleConstructorEntries} from '../../scripts/lib/runtime-modules.mjs';
import {functionalCommitment} from '../../web/confluence/module-loader.mjs';
import {recoverArchive} from '../../web/confluence/chain-loader.mjs';

// Optional isolated compilation cache is a local acceleration only; normal release tests
// read the canonical artifacts rebuilt by compile:local.
const cache=process.env.ANIMA_MODULE_ARTIFACT_CACHE?JSON.parse(fs.readFileSync(process.env.ANIMA_MODULE_ARTIFACT_CACHE,'utf8')):{};
const artifact=name=>cache[name]||JSON.parse(fs.readFileSync(new URL(`../../contracts/artifacts/${name}.json`,import.meta.url),'utf8'));
async function deploy(name,signer,args=[]){const a=artifact(name),c=await new ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c;}
const reject=async fn=>assert.rejects(async()=>{const tx=await fn();if(tx?.wait)await tx.wait();});
async function setup(t){const rpc=ganache.provider({logging:{quiet:true},wallet:{defaultBalance:1000},chain:{chainId:31337,hardfork:'shanghai'},miner:{blockGasLimit:95000000}});t.after(()=>rpc.disconnect());const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;const signer=await provider.getSigner();return {rpc,provider,signer};}
async function moduleArchives(p,signer,{previous,addresses:existing}={}){const addresses=[];for(const [i,m] of p.entries.entries()){if(previous?.entries[i].sha256===m.sha256){addresses.push(existing[i]);continue;}const chunks=[];for(const bytes of m.chunks)chunks.push((await deploy('AppChunk',signer,['0x'+bytes.toString('hex')])).target);assert.equal(m.archiveVersion,1);addresses.push((await deploy('OnchainApp',signer,[chunks,'0x'+m.sha256])).target);}return addresses;}

test('real module directories recover exact feature editions and reuse unchanged immutable archives',async t=>{
 const c=await setup(t),first=packageRuntimeModules(await fixtureExpanded()),addresses=await moduleArchives(first,c.signer),directory=await deploy('OnchainModuleDirectory',c.signer,[moduleConstructorEntries(first.entries,addresses),0,'0x'+first.sha256]);assert.equal(await directory.contentSha256(),'0x'+first.sha256);assert.equal(await directory.schemaVersion(),3n);
 const request=payload=>c.rpc.request(payload),config={runtime:directory.target,chainId:31337,archiveVersion:3,sha256:first.sha256};assert.equal(await recoverArchive(request,config),first.html);
 const second=packageRuntimeModules(await fixtureExpanded('a different launch policy'),{previous:{modules:first.entries}}),reused=await moduleArchives(second,c.signer,{previous:first,addresses});assert.equal(reused.filter((a,i)=>a===addresses[i]).length,3);const next=await deploy('OnchainModuleDirectory',c.signer,[moduleConstructorEntries(second.entries,reused),0,'0x'+second.sha256]);assert.equal(await recoverArchive(request,{...config,runtime:next.target,sha256:second.sha256}),second.html);assert.equal(await recoverArchive(request,config),first.html);
 const bad=structuredClone(first.entries);bad[1].dependencies[0].version++;await reject(()=>deploy('OnchainModuleDirectory',c.signer,[moduleConstructorEntries(bad,addresses),0,'0x'+functionalCommitment(bad,0)]));await reject(()=>deploy('OnchainModuleDirectory',c.signer,[moduleConstructorEntries(first.entries,addresses),0,'0x'+'1'.repeat(64)]));
 let pinned;const seen=[];await recoverArchive(async payload=>{if(payload.method==='eth_blockNumber'){const b=await request(payload);pinned??=b;return b;}if(payload.method==='eth_call')seen.push(payload.params[1]);return request(payload);},config);assert.ok(seen.length>10);assert.ok(seen.every(b=>b===pinned));
 await assert.rejects(()=>recoverArchive(async payload=>{const r=await request(payload);if(payload.method==='eth_call'&&payload.params[0].to.toLowerCase()===addresses[1].toLowerCase()&&payload.params[0].data.startsWith('0x8f5281bf')){const offset=130;return r.slice(0,offset)+(r.slice(offset,offset+2)==='00'?'ff':'00')+r.slice(offset+2);}return r;},config),/digest|UTF/);
});

test('a real minted NFT embeds the immutable schema3 loader and its exact onchain feature edition',async t=>{
 const c=await setup(t),p=packageRuntimeModules(await fixtureExpanded()),archives=await moduleArchives(p,c.signer),runtime=await deploy('OnchainModuleDirectory',c.signer,[moduleConstructorEntries(p.entries,archives),0,'0x'+p.sha256]),manifest=await deploy('GenesisManifest',c.signer),privacy=await deploy('AppChunk',c.signer,['0x01']),renderer=await deploy('ConfluenceRenderer',c.signer,[runtime.target,manifest.target,privacy.target]);
 const rendererArtifact=artifact('ConfluenceRenderer'),code=await c.provider.getCode(renderer.target);assert.ok((code.length-2)/2<=24576);assert.ok((rendererArtifact.bytecode.length-2)/2+96<=49152);const store=await renderer.loaderStore(),loaderCode=await c.provider.getCode(store);assert.ok((loaderCode.length-2)/2<=23001);assert.equal(loaderCode.slice(2,4),'00');
 const owner=await c.signer.getAddress(),router=await deploy('ProofRouter',c.signer,[owner]),witness=await deploy('OmnichainWitnessRegistry',c.signer,[owner]),collection=await deploy('IDontFuckingBelieveIt',c.signer,[owner,renderer.target,router.target,witness.target,owner,0]),factory=await deploy('SovereignAccountFactory',c.signer,[collection.target,router.target]);await(await collection.setAccountFactory(factory.target)).wait();const secret=keccak256(toUtf8Bytes('functional onchain edition mint'));await(await collection.commitAwakening(await collection.commitmentFor(owner,secret,owner))).wait();await c.provider.send('evm_mine',[]);await c.provider.send('evm_mine',[]);await(await collection.revealAwakening(secret,owner)).wait();
 const metadata=JSON.parse(Buffer.from((await collection.tokenURI(1,{gasLimit:90000000})).split(',')[1],'base64')),animation=Buffer.from(metadata.animation_url.split(',')[1],'base64').toString();assert.ok(animation.includes(p.sha256));assert.ok(animation.includes('archiveVersion:"3"'));
 const elements={unfold:{},rpc:{value:''},status:{}},context={window:{},document:{getElementById:id=>elements[id]},TextEncoder,TextDecoder,Blob,Response,DecompressionStream,atob,btoa,URL,console};vm.createContext(context);for(const match of animation.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],context);const identity=context.window.AWE_CHAIN_IDENTITY;assert.equal(identity.collection,collection.target.toLowerCase());assert.equal(identity.tokenId,'1');assert.equal(await context.recoverArchive(payload=>c.rpc.request(payload),identity),p.html);
 const readerInterface=new Interface(artifact('OnchainModuleDirectory').abi);for(const signature of ['moduleCount()','shellIndex()','moduleAt(uint256)','dependencyCount(uint256)','dependencyAt(uint256,uint256)'])assert.ok(animation.includes(readerInterface.getFunction(signature).selector));
});
