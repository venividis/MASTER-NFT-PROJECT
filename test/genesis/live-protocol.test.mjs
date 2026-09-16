import test from 'node:test';import assert from 'node:assert/strict';import ganache from 'ganache';
import {BrowserProvider,Contract,ZeroAddress,parseEther,keccak256,toUtf8Bytes} from 'ethers';
import {deployStack,deployContract,loadArtifact} from '../../scripts/lib/deploy-stack.mjs';
import {ConfluenceWallet} from '../../web/confluence/wallet.mjs';
import {LiveProtocol} from '../../web/genesis/live-protocol.mjs';

async function setup(t){
  const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},miner:{blockGasLimit:50000000},logging:{quiet:true}});
  const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
  t.after(async()=>{provider.destroy();await rpc.disconnect();});
  const signer=await provider.getSigner(0),other=await provider.getSigner(1),owner=await signer.getAddress();
  const stack=await deployStack({signer,attesterAddress:owner,royaltyBps:0});
  const secret=keccak256(toUtf8Bytes('Genesis 5.2 actual live desk'));
  await(await stack.collection.commitAwakening(await stack.collection.commitmentFor(owner,secret,owner),{value:parseEther('20')})).wait();
  await rpc.request({method:'evm_mine',params:[]});await rpc.request({method:'evm_mine',params:[]});await(await stack.collection.revealAwakening(secret,owner)).wait();
  const d=(name,args=[])=>deployContract(name,signer,args),account=await stack.collection.accountOf(1);
  const ledger=await d('WorldLedger',[stack.collection.target]),market=await d('NativeMarket',[ledger.target]),vault=await d('TimeVault',[ledger.target]),launch=await d('GenesisLaunchpad',[ledger.target]);
  await(await ledger.sealModules(market.target,vault.target,launch.target)).wait();
  const memory=await d('MemoryLedger',[stack.collection.target]),journal=await d('JournalSwapRouter',[memory.target,market.target]);await(await memory.installRouter(journal.target)).wait();
  const block=await provider.getBlock('latest');await(await launch.create('Genesis Test','GNT','Local fixture',parseEther('1000000'),0,block.timestamp+3700,parseEther('1'),parseEther('10'),0,10000,2592000,0)).wait();
  await(await launch.contribute(1,0,{value:parseEther('10')})).wait();await rpc.request({method:'evm_increaseTime',params:[3800]});await rpc.request({method:'evm_mine',params:[]});await(await launch.settle(1)).wait();
  const token=new Contract((await launch.launchInfo(1))[0],loadArtifact('GenesisToken').abi,provider);
  const w=new ConfluenceWallet();Object.assign(w,{connected:true,revision:1,raw:rpc,provider,signer,address:owner,chainId:31337n,core:stack.collection,collection:stack.collection.target,tokenId:1n,account,contract:new Contract(account,loadArtifact('SovereignAccount').abi,signer)});
  return {rpc,provider,signer,other,owner,stack,ledger,market,vault,memory,journal,token,w,api:new LiveProtocol(w)};
}
test('live desk settles native/token swaps, atomic journaled fills, real locks, personal memories and NFT messages',async t=>{
  const x=await setup(t),{api,w,token,market,memory,journal,vault,ledger}=x;
  await api.swap({market:market.target,input:ZeroAddress,output:token.target,amount:'0.1'});const receipt=await w.send();assert.equal(receipt.chainId,'31337');assert.ok(await token.balanceOf(w.account)>0n);
  await assert.rejects(w.send(),/expired|changed/);
  await api.swap({market:market.target,input:token.target,output:ZeroAddress,amount:'1',journal:memory.target,text:'The reason I chose this trade',publicConsent:true});await w.send();
  assert.equal(await memory.count(),1n);const entry=await memory.getEntry(1);assert.equal(entry.executor,w.account);assert.equal(entry.phase,1n);assert.ok((await memory.fills(1)).amountOut>0n);
  assert.equal(await token.allowance(w.account,journal.target),0n);assert.equal(await token.allowance(journal.target,market.target),0n);
  const lock=await api.lock({vault:vault.target,asset:token.target,amount:'2',days:'1'});await w.send();assert.equal((await vault.lockInfo(1))[1],w.account);assert.equal(await token.allowance(w.account,vault.target),0n);
  await assert.rejects(api.release({vault:vault.target,id:'1'}),/vested/);
  await x.rpc.request({method:'evm_setTime',params:[(lock.end+1)*1000]});await x.rpc.request({method:'evm_mine',params:[]});
  await api.release({vault:vault.target,id:'1'});await w.send();assert.equal((await vault.lockInfo(1))[4],parseEther('2'));
  await api.inscribe({journal:memory.target,text:'A public memory, deliberately inscribed.',publicConsent:true});await w.send();assert.equal((await memory.getEntry(2)).author,x.owner);
  await api.post({ledger:ledger.target,room:'1',text:'Hello from this NFT.',publicConsent:true});await w.send();assert.equal(await ledger.messageCount(),1n);
});
test('live desk rejects foreign modules, invalid minima, unconsented publication and changed custody reviews',async t=>{
  const x=await setup(t),{api,w,market,token,memory,ledger}=x;
  await assert.rejects(api.swap({market:market.target,input:ZeroAddress,output:token.target,amount:'0.1',slippage:'100'}),/Slippage/);
  await assert.rejects(api.swap({market:market.target,input:ZeroAddress,output:token.target,amount:'0.1',journal:memory.target,text:'Private thought'}),/Confirm/);
  assert.equal(w.plan,null);await assert.rejects(api.inscribe({journal:memory.target,text:'Do not publish'}),/Confirm/);
  await assert.rejects(api.post({ledger:ledger.target,text:'x'.repeat(1025),publicConsent:true}),/1024/);
  const foreign=await deployContract('NativeMarket',x.signer,[ledger.target]);await assert.rejects(api.module(foreign.target,'market',['function ledger() view returns(address)']),/installed/);
  await api.swap({market:market.target,input:ZeroAddress,output:token.target,amount:'0.1'});
  await(await x.stack.collection.transferFrom(x.owner,await x.other.getAddress(),1)).wait();await(await x.stack.collection.connect(x.other).transferFrom(await x.other.getAddress(),x.owner,1)).wait();
  await assert.rejects(w.send(),/custody|context/);assert.equal(await token.balanceOf(w.account),0n);
});
test('disconnect during preparation cannot restore a stale spend review; reconnect failure closes old authority',async()=>{
  const w=new ConfluenceWallet();w.connected=true;w.revision=1;
  w.assertOwner=async()=>{if(!w.connected)throw Error('disconnected');};let resolve;const gate=new Promise(r=>resolve=r);
  w.contract={sessionEpoch:async()=>0n,execute:{populateTransaction:async()=>{await gate;return {};}}};
  w.provider={call:async()=>{},estimateGas:async()=>21000n,getBalance:async()=>parseEther('1')};w.address='0x'+'11'.repeat(20);w.account='0x'+'22'.repeat(20);w.collection='0x'+'33'.repeat(20);w.tokenId=1n;w.chainId=31337n;
  const prepare=w.prepare({target:'0x'+'44'.repeat(20)});await Promise.resolve();await Promise.resolve();w.disconnect();resolve();await assert.rejects(prepare);assert.equal(w.plan,null);
  const prior=globalThis.window;globalThis.window={};try{w.connected=true;await assert.rejects(w.connect('invalid','1'),/wallet/);assert.equal(w.connected,false);}finally{globalThis.window=prior;}
});
