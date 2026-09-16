import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Contract,getCreateAddress,keccak256} from 'ethers';
import {prepareExtensionsDeployment,verifyExtensionsDeploymentPlan,verifyExtensionsDeploymentReceipts,validateExtensionsDeploymentConfig} from '../../scripts/lib/extensions-deployment.mjs';

const source='// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24; contract PlanLeaf {address public immutable owner;uint256 public number;constructor(address o){owner=o;}function set(uint256 n) external {require(msg.sender==owner);number=n;}} contract PlanLink {PlanLeaf public immutable leaf;constructor(PlanLeaf l){require(address(l).code.length!=0);leaf=l;} function value() external view returns(uint256){return leaf.number();}} contract PlanSponsor {uint256 public immutable budget;constructor() payable {require(msg.value!=0);budget=msg.value;}}';
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'contracts/src/extensions/test/PlanFixture.sol':{content:source}},settings:{optimizer:{enabled:true,runs:1000},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','metadata','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}})));
assert.deepEqual((output.errors||[]).filter(x=>x.severity==='error'),[]);
const fixtures=Object.fromEntries(Object.entries(output.contracts['contracts/src/extensions/test/PlanFixture.sol']).map(([contractName,c])=>[contractName,{contractName,sourceName:'contracts/src/extensions/test/PlanFixture.sol',compiler:solc.version(),abi:c.abi,metadata:JSON.parse(c.metadata),bytecode:'0x'+c.evm.bytecode.object,deployedBytecode:'0x'+c.evm.deployedBytecode.object,immutableReferences:c.evm.deployedBytecode.immutableReferences}]));
function arts(t){const artifactDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'anima-extension-plan-'));t.after(()=>fs.rmSync(artifactDirectory,{recursive:true,force:true}));for(const [n,a] of Object.entries(fixtures))fs.writeFileSync(path.join(artifactDirectory,n+'.json'),JSON.stringify(a));return {artifactDirectory};}
const owner='0x1111111111111111111111111111111111111111';
const config=(overrides={})=>({schema:'anima.extensions-deployment-config/1',chainId:31337,deployer:owner,startingNonce:0,externals:{},steps:[{kind:'deploy',name:'leaf',contractName:'PlanLeaf',args:[owner],value:'0'},{kind:'call',name:'initialize',target:'$leaf',method:'set',args:['17'],value:'0'},{kind:'deploy',name:'link',contractName:'PlanLink',args:['$leaf'],value:'0'},{kind:'deploy',name:'funded',contractName:'PlanSponsor',args:[],value:'31'}],...overrides});

test('the release compiler emits deployable empty immutable maps for every previously blocked real extension', async () => {
  const artifactDirectory = path.resolve(import.meta.dirname, '../../contracts/artifacts');
  const index = JSON.parse(fs.readFileSync(path.join(artifactDirectory, 'index.json'), 'utf8'));
  const names = ['PrivacyKeys', 'AgentPolicyGuard', 'NativeQuoteGroth16Verifier', 'SessionSponsor'];
  for (const contractName of names) {
    const identity = index.aliases[contractName];
    assert.ok(identity?.endsWith(':' + contractName));
    const artifact = JSON.parse(fs.readFileSync(path.join(artifactDirectory, index.artifacts[identity].file), 'utf8'));
    assert.deepEqual(artifact.immutableReferences, {}, contractName + ' must retain an explicit empty map');
    assert.equal(artifact.sourceName + ':' + artifact.contractName, identity);
  }
  const plan = await prepareExtensionsDeployment(config({steps: names.map(contractName => ({kind: 'deploy', name: contractName, contractName, args: [], value: '0'}))}), {artifactDirectory});
  assert.equal(plan.requests.length, 4);
  assert.equal(plan.summary.chainState, 'not-read');
  await verifyExtensionsDeploymentPlan(plan, {artifactDirectory});
});

test('extension planner constructs exact dependency-aware CREATE/call sequence and detects every tampered request',async t=>{
 const options=arts(t),plan=await prepareExtensionsDeployment(config({startingNonce:7}),options);assert.equal(plan.status,'unsigned-offline-preparation');assert.equal(plan.summary.nextNonce,11);assert.equal(plan.summary.totalValueWei,'31');assert.equal(plan.summary.coreManifest,'unchanged');
 for(const r of plan.requests){assert.equal(r.transaction.nonce,7+plan.requests.indexOf(r));assert.equal(r.transaction.gasLimit,undefined);if(r.kind==='create')assert.equal(r.address,getCreateAddress({from:owner,nonce:r.transaction.nonce}));}
 assert.equal(plan.requests[2].args[0],plan.directory.leaf.address);assert.equal(plan.directory.leaf.runtimeCodeHash,null);assert.deepEqual(await verifyExtensionsDeploymentPlan(plan,options),plan);
 for(const change of [x=>x.requests[0].transaction.value='1',x=>x.requests[1].transaction.to=owner,x=>x.requests[2].args[0]=owner,x=>x.directory.leaf.runtimeCodeHash='0x'+'11'.repeat(32),x=>x.artifacts.PlanLeaf.compiler='changed',x=>x.planHash='0x'+'01'.repeat(32),x=>x.extra='field']){const edited=structuredClone(plan);change(edited);await assert.rejects(verifyExtensionsDeploymentPlan(edited,options),/reconstruction/);}
});

test('extension deployment validation fails closed on keys, missing terms, forward dependencies and invalid payable use',async t=>{
 const options=arts(t);
 for(const change of [{chainId:1},{privateKey:'not-accepted'},{rpcUrl:'not-accepted'},{startingNonce:-1},{deployer:'0x'+'00'.repeat(20)},{steps:[]},{schema:'wrong'}])assert.throws(()=>validateExtensionsDeploymentConfig(config(change)));
 let c=config();c.steps[0].value=0;assert.throws(()=>validateExtensionsDeploymentConfig(c));c=config();c.steps[0].args=[Number.MAX_SAFE_INTEGER+1];assert.throws(()=>validateExtensionsDeploymentConfig(c));
 c=config();c.steps[0].args=['$link'];await assert.rejects(prepareExtensionsDeployment(c,options),/forward/);
 c=config();c.steps[2].name='leaf';await assert.rejects(prepareExtensionsDeployment(c,options),/Duplicate/);
 c=config();c.steps[1].method='number';c.steps[1].args=[];await assert.rejects(prepareExtensionsDeployment(c,options),/mutating/);
 c=config();c.steps[0].value='1';await assert.rejects(prepareExtensionsDeployment(c,options),/nonpayable constructor/);
 const artifact=JSON.parse(fs.readFileSync(path.join(options.artifactDirectory,'PlanLeaf.json')));delete artifact.immutableReferences;fs.writeFileSync(path.join(options.artifactDirectory,'PlanLeaf.json'),JSON.stringify(artifact));await assert.rejects(prepareExtensionsDeployment(config(),options),/immutableReferences/);
});

test('actual local deployment receipts produce observed immutable runtime hashes and reject incomplete or mismatched evidence',async t=>{
 const options=arts(t),rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},logging:{quiet:true}});t.after(()=>rpc.disconnect());const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;const signer=await provider.getSigner(),deployer=await signer.getAddress(),c=config({deployer});c.steps[0].args=[deployer];
 const plan=await prepareExtensionsDeployment(c,options);assert.equal(await provider.getTransactionCount(deployer),0,'offline preparation must not send');const hashes={};
 for(const r of plan.requests){const tx=await signer.sendTransaction({...r.transaction,value:BigInt(r.transaction.value)});const receipt=await tx.wait();assert.equal(receipt.status,1);hashes[r.id]=tx.hash;}
 const directory=await verifyExtensionsDeploymentReceipts(plan,provider,hashes,options);assert.equal(Object.keys(directory.modules).length,3);assert.equal(directory.modules.leaf.runtimeCodeHash,keccak256(await provider.getCode(plan.directory.leaf.address)));assert.notEqual(directory.modules.leaf.runtimeCodeHash,plan.directory.leaf.runtimeTemplateHash,'runtime immutables must use observed bytes');
 const link=new Contract(plan.directory.link.address,fixtures.PlanLink.abi,provider);assert.equal(await link.value(),17n);
 await assert.rejects(verifyExtensionsDeploymentReceipts(plan,provider,{...hashes,extra:hashes.leaf},options),/exactly one/);
 await assert.rejects(verifyExtensionsDeploymentReceipts(plan,provider,{...hashes,leaf:hashes.link},options),/does not match/);
 await assert.rejects(verifyExtensionsDeploymentReceipts(plan,provider,hashes,{...options,confirmations:100}),/insufficiently/);
});

test('pinned external contracts retain their identities and external mutations are checked against the supplied ABI',async t=>{
 const options=arts(t),rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},logging:{quiet:true}});t.after(()=>rpc.disconnect());const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;const signer=await provider.getSigner(),deployer=await signer.getAddress(),existing=await new ContractFactory(fixtures.PlanLeaf.abi,fixtures.PlanLeaf.bytecode,signer).deploy(deployer);await existing.waitForDeployment();
 const pin={address:existing.target,contractName:'PlanLeaf',runtimeCodeHash:keccak256(await provider.getCode(existing.target))};const c=config({deployer,startingNonce:1,externals:{Existing:pin},steps:[{kind:'call',name:'updateExisting',target:'$Existing',method:'set',args:['29'],value:'0'},{kind:'deploy',name:'link',contractName:'PlanLink',args:['$Existing'],value:'0'}]});
 const plan=await prepareExtensionsDeployment(c,options),hashes={};for(const r of plan.requests){const sent=await signer.sendTransaction({...r.transaction,value:BigInt(r.transaction.value)});await sent.wait();hashes[r.id]=sent.hash;}
 const directory=await verifyExtensionsDeploymentReceipts(plan,provider,hashes,options);assert.equal(directory.externals.Existing.runtimeCodeHash,pin.runtimeCodeHash);assert.equal(await existing.number(),29n);
 const badConfig=structuredClone(c);badConfig.externals.Existing.runtimeCodeHash='0x'+'22'.repeat(32);const badPlan=await prepareExtensionsDeployment(badConfig,options);await assert.rejects(verifyExtensionsDeploymentReceipts(badPlan,provider,hashes,options),/External contract runtime changed/);
});
