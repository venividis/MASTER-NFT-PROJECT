import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider, Contract, ContractFactory, ZeroAddress, ZeroHash, keccak256, sha256, toUtf8Bytes, hexlify} from 'ethers';

const root = path.resolve(import.meta.dirname, '../..');
let compiled;
export function artifacts() {
  if (compiled) return compiled;
  const names = ['contracts/src/modules/TokenModuleRegistry.sol', 'contracts/src/modules/ModuleWorkbench.sol', 'contracts/src/core/IDontFuckingBelieveIt.sol',
    'contracts/src/core/SovereignAccountFactory.sol', 'contracts/src/core/OnchainRenderer.sol'];
  const input = {language:'Solidity', sources:Object.fromEntries(names.map(name => [name, {content:fs.readFileSync(path.join(root,name),'utf8')}])),
    settings:{optimizer:{enabled:true,runs:1000},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
  const output = JSON.parse(solc.compile(JSON.stringify(input), {import:name=>({contents:fs.readFileSync(path.join(root,name),'utf8')})}));
  assert.deepEqual((output.errors || []).filter(item=>item.severity==='error'), [], 'targeted module/native source compilation');
  compiled = Object.fromEntries(Object.values(output.contracts).flatMap(file=>Object.entries(file)));
  for (const [name, artifact] of Object.entries(compiled)) {
    assert.ok(artifact.evm.deployedBytecode.object.length / 2 <= 24576, `${name} exceeds EIP-170`);
    assert.ok(artifact.evm.bytecode.object.length / 2 <= 49152, `${name} base initcode exceeds EIP-3860`);
  }
  return compiled;
}
export const hash = text=>keccak256(toUtf8Bytes(text));
export const emptyArchive = Object.freeze({archive:ZeroAddress,schema:0,storedHash:ZeroHash,storedBytes:0,expandedHash:ZeroHash,expandedBytes:0,codeHash:ZeroHash});
export async function send(contract, method, args=[], value=0n) {
  const gas = await contract[method].estimateGas(...args,{value});
  return (await contract[method](...args,{value,gasLimit:(gas*120n+99n)/100n})).wait();
}
export async function rejected(action) {
  await assert.rejects(async()=>{const result=await action(); if(result?.wait) await result.wait();});
}
export function event(receipt, contract, name) {
  for(const log of receipt.logs) {
    if(log.address.toLowerCase()!==contract.target.toLowerCase()) continue;
    try { const decoded=contract.interface.parseLog(log);if(decoded?.name===name)return decoded.args; } catch {}
  }
  throw Error(`Missing ${name} event`);
}
export async function fixture(t,{mint=false}={}) {
  const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},miner:{timestampIncrement:1,blockGasLimit:50000000},wallet:{deterministic:true,totalAccounts:5},logging:{quiet:true}});
  const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=5;
  t.after(async()=>{provider.destroy();await rpc.disconnect();});
  const [owner,publisher,other,buyer]=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));
  const deploy=async(name,args=[])=>{const a=artifacts()[name],c=await new ContractFactory(a.abi,'0x'+a.evm.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c;};
  const factory=await deploy('ModuleArchiveFactory'),releases=await deploy('ExtensionReleaseRegistry',[factory.target]);
  const archive=async(data,existingChunks)=>{
    const bytes=typeof data==='string'?toUtf8Bytes(data):data,chunks=existingChunks||[];
    if(!existingChunks) for(let i=0;i<bytes.length;i+=23000)chunks.push((await deploy('AppChunk',[hexlify(bytes.slice(i,i+23000))])).target);
    const digest=sha256(bytes),receipt=await send(factory,'createArchive',[chunks,digest]),address=event(receipt,factory,'ArchiveCreated').archive;
    return {descriptor:{archive:address,schema:1,storedHash:digest,storedBytes:bytes.length,expandedHash:digest,expandedBytes:bytes.length,codeHash:keccak256(await provider.getCode(address))},chunks,bytes};
  };
  const publish=async(payload,{moduleId=hash('calculator'),version=1n,stateSchema=hash('calculator/state/1'),capabilities=[],dependencies=[],signer=publisher,manifest, ...rest}={})=>{
    const input={moduleId,version,payload,runtime:hash('html'),hostAPI:hash('anima.host/1'),stateSchema,capabilities,dependencies,...rest};
    const bytes=toUtf8Bytes(manifest||JSON.stringify({moduleId,version:String(version),payload}));
    const contract=releases.connect(signer),id=await releases.hashRelease(await signer.getAddress(),input,sha256(bytes));
    const receipt=await send(contract,'publish',[input,bytes]);
    assert.equal(event(receipt,releases,'ReleasePublished').releaseId,id);
    return {id,input,manifest:bytes,key:await releases.moduleKey(await signer.getAddress(),moduleId)};
  };
  const f={rpc,provider,owner,publisher,other,buyer,deploy,factory,releases,archive,publish};
  if(mint) {
    const renderer=await deploy('OnchainRenderer');
    // Bound-mode fixture uses code-bearing placeholders for unused proof/witness services.
    const collection=await deploy('IDontFuckingBelieveIt',[owner.address,renderer.target,renderer.target,renderer.target,owner.address,0]);
    const accounts=await deploy('SovereignAccountFactory',[collection.target,renderer.target]);await send(collection,'setAccountFactory',[accounts.target]);
    for(let tokenId=1;tokenId<=2;tokenId++) {
      const secret=hash(`module-owner-${tokenId}`);
      await send(collection,'commitAwakening',[await collection.commitmentFor(owner.address,secret,owner.address)],1000n);
      await rpc.request({method:'evm_mine',params:[]});
      await send(collection,'revealAwakening',[secret,owner.address]);
    }
    const account=new Contract(await collection.accountOf(1),artifacts().SovereignAccount.abi,owner);
    const account2=new Contract(await collection.accountOf(2),artifacts().SovereignAccount.abi,owner);
    const modules=await deploy('TokenModuleRegistry',[collection.target,releases.target]);
    const state=new Contract(await modules.stateStore(),artifacts().ModuleStateStore.abi,owner);
    const call=(method,args,signer=owner,selected=account)=>send(selected.connect(signer),'execute',[modules.target,0,modules.interface.encodeFunctionData(method,args)]);
    const context=async(tokenId=1,selected=account)=>({root:await modules.rootOf(tokenId),epoch:await selected.sessionEpoch()});
    Object.assign(f,{renderer,collection,accounts,account,account2,modules,state,call,context});
  }
  return f;
}
