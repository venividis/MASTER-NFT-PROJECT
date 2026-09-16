import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {JsonRpcProvider, ContractFactory, Contract, Interface, parseUnits, formatUnits, toBeHex, ZeroAddress} from '../../web/vendor/ethers.min.js';
import {launchPlan, swapPlan, redeemPlan, inspectPosition, TOKEN_ABI} from '../../web/v4/client.mjs';
import {hookInfrastructurePlan, hookDeployPlan, configureHookPlan, verifyHookContract} from '../../web/launchpad/hook-client.mjs';
import {resolveHumanRange} from '../../web/v4/math.mjs';
import {V4Desk} from '../../web/v4/desk.mjs';

const root=path.resolve(import.meta.dirname,'../..'),v4=path.join(root,'integrations/console/protocol/v4-hook'),privacy=path.join(root,'packages/privacy');
const require=createRequire(import.meta.url);

function v4ArtifactHashes(){
  const directory=path.join(v4,'artifacts'),hashes={};
  function visit(relative=''){
    for(const entry of fs.readdirSync(path.join(directory,relative),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      const name=path.join(relative,entry.name);
      if(entry.isDirectory())visit(name);
      else hashes[name]=createHash('sha256').update(fs.readFileSync(path.join(directory,name))).digest('hex');
    }
  }
  if(fs.existsSync(directory))visit();
  return hashes;
}

async function offlineSDK(){
  const {build}=require(path.join(privacy,'node_modules/esbuild'));
  const {options}=await import('../../packages/privacy/build.mjs');
  const contents=`import * as sdk from '@railgun-community/wallet';import {RelayAdaptHelper,ABIRelayAdapt} from '@railgun-community/engine';import {BroadcasterTransaction} from '@railgun-community/waku-broadcaster-client-web';import memdown from 'memdown';import {RailgunRuntime} from './src/runtime.mjs';import {composePrivateCalls,privatePlanFingerprint,verifyPrivatePlan} from './src/composition.mjs';globalThis.animaPrivateHookTest={sdk,RelayAdaptHelper,ABIRelayAdapt,memdown,RailgunRuntime,BroadcasterTransaction,composePrivateCalls,privatePlanFingerprint,verifyPrivatePlan};`;
  const built=await build({...options,stdin:{contents,resolveDir:privacy,sourcefile:'private-hook-accounting.mjs'},write:false});
  globalThis.self=globalThis;
  vm.runInThisContext(built.outputFiles[0].text,{filename:'anima-private-hook-accounting.js'});
  return globalThis.animaPrivateHookTest;
}

test('private interface exposes hook selection, bounded hooked swaps and hooked share withdrawal',()=>{
  const values={creatorHook:true,hook:'0x'+'12'.repeat(20),hookFactory:'0x'+'34'.repeat(20),expectedHookFeePpm:'10000',salt:toBeHex(1,32)};
  const render=kind=>V4Desk.prototype.operationPage.call({values,kind,private:true,bridge:{info:{}}});
  assert.match(render('launch'),/name="creatorHook"[^>]*checked/);
  assert.match(render('launch'),/name="hookFactory"[^>]*0x3434/);
  assert.match(render('launch'),/shared funding adapter is not asserted to be the creator/);
  assert.match(render('swap'),/name="maximumHookFeePpm"/);
  assert.match(render('redeem'),/name="hookFactory"/);
});

test('SDK-composed shielded hooked launch, trade and redemption conserve actual PoolManager assets and recover failures', {timeout:240000},async()=>{
  const crypto=await offlineSDK(),{sdk,memdown,RelayAdaptHelper,ABIRelayAdapt,composePrivateCalls,privatePlanFingerprint,verifyPrivatePlan}=crypto;
  const cache=new Map(),store=new sdk.ArtifactStore(async p=>cache.get(p)??null,async(d,p,v)=>cache.set(p,v),async p=>cache.has(p));
  sdk.setLoggers(()=>{},()=>{});
  const port=24937,rpc=`http://127.0.0.1:${port}`;
  let provider,anvil;
  try{
    await sdk.startRailgunEngine('animagenesis',memdown(),false,store,false,false);
    const info=await sdk.createRailgunWallet('11'.repeat(32),'test test test test test test test test test test test junk',undefined);
    const {RailgunRuntime,BroadcasterTransaction}=crypto;
    const fakeRelay='0x'+'34'.repeat(20),fakePlan={kind:'swap',chainId:1,request:{to:fakeRelay,data:'0x1234',value:0n},spend:[],outputs:[],deadline:Math.floor(Date.now()/1000)+1000};
    const freshRuntime=()=>{const r=new RailgunRuntime();r.started=true;r.config={chainId:1};r.chain={};r.relay=fakeRelay;r.provider={getNetwork:async()=>({chainId:1n})};r.prepared={id:'reserved-test',generation:0,plan:fakePlan,planFingerprint:privatePlanFingerprint(fakePlan,fakeRelay),expires:Date.now()+60000,proof:{transaction:{to:fakeRelay,data:'0x1234',value:0n}},broadcaster:{railgunAddress:info.railgunAddress,tokenFee:{feesID:'test'}},gasPrice:1n};return r;};
    const expired=freshRuntime();expired.prepared.expires=Date.now()-1;
    const rejected=await expired.send({id:'reserved-test'});
    assert.equal(rejected.state,'not-submitted');assert.equal(rejected.broadcastAttempted,false);assert.equal(rejected.id,'reserved-test');
    const originalCreate=BroadcasterTransaction.create;
    try{
      BroadcasterTransaction.create=async()=>({send:async()=>{throw Error('Peer disconnected after accepting bytes.');}});
      await assert.rejects(freshRuntime().send({id:'reserved-test'}),/Peer disconnected/);
    }finally{BroadcasterTransaction.create=originalCreate;}
    // The real SDK derives and encrypts return notes. The accounting harness below
    // intentionally does not verify a ZK proof or provide privacy to these local test funds.
    const publishedBefore=v4ArtifactHashes();
    let compiled;
    try{compiled=require(path.join(v4,'scripts/compile.cjs')).compileFixtures();}
    finally{assert.deepEqual(v4ArtifactHashes(),publishedBefore,'fixture compilation must preserve every published v4 artifact and manifest');}
    const solc=require(path.join(v4,'scripts/dependency.cjs'))('solc');
    const fixture=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Quote.sol':{content:'pragma solidity 0.8.26; contract Quote { uint8 public constant decimals=6; string public constant symbol="USDQ"; mapping(address=>uint256) public balanceOf; mapping(address=>mapping(address=>uint256)) public allowance; constructor(){balanceOf[msg.sender]=1_000_000_000e6;} function approve(address a,uint256 n) external returns(bool){allowance[msg.sender][a]=n;return true;} function transfer(address a,uint256 n) external returns(bool){balanceOf[msg.sender]-=n;balanceOf[a]+=n;return true;} function transferFrom(address a,address b,uint256 n) external returns(bool){allowance[a][msg.sender]-=n;balanceOf[a]-=n;balanceOf[b]+=n;return true;} }'}},settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
    assert.deepEqual((fixture.errors||[]).filter(e=>e.severity==='error'),[]);
    anvil=spawn(process.execPath,[path.join(v4,'node_modules/@foundry-rs/anvil/bin.mjs'),'--host','127.0.0.1','--port',String(port),'--chain-id','31337','--hardfork','cancun','--silent'],{stdio:['ignore','ignore','pipe']});
    let stderr='';anvil.stderr.on('data',b=>stderr+=b);
    for(let i=0;i<100;i++){try{const response=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})});if((await response.json()).result==='0x7a69')break;}catch{}if(i===99)throw Error(stderr||'Anvil did not start');await new Promise(r=>setTimeout(r,50));}
    provider=new JsonRpcProvider(rpc,31337,{staticNetwork:true,cacheTimeout:-1});provider.pollingInterval=10;
    const owner=await provider.getSigner(0),sinkSigner=await provider.getSigner(1),beneficiary=await provider.getSigner(2),o=await owner.getAddress(),sink=await sinkSigner.getAddress(),b=await beneficiary.getAddress();
    const send=async promise=>(await promise).wait();
    const deploy=async(artifact,args=[])=>{const c=await new ContractFactory(artifact.abi,'0x'+artifact.evm.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c;};
    const manager=await deploy(compiled['@uniswap/v4-core/src/PoolManager.sol'].PoolManager,[o]);
    const quote=await deploy(fixture.contracts['Quote.sol'].Quote);
    const relay=await deploy(compiled['test/RelayAccountingHarness.sol'].RelayAccountingHarness,[sink]),payer=await relay.getAddress();
    const router=await deploy(compiled['src/GenesisV4Router.sol'].GenesisV4Router,[await manager.getAddress()]);
    const quoter=await deploy(compiled['vendor/v4-periphery/src/lens/V4Quoter.sol'].V4Quoter,[await manager.getAddress()]);
    const config={chainId:31337,manager:await manager.getAddress(),router:await router.getAddress(),quoter:await quoter.getAddress(),privateFunding:true};
    for(const [kind,key]of [['factory','hookFactory'],['create2','create2'],['splitter','splitter']]){const p=await hookInfrastructurePlan(provider,config,{kind,owner:o,recipients:[b],weights:[1]},o);await send(owner.sendTransaction(p.request));config[key]=p.predictedAddress;}
    const hp=await hookDeployPlan(provider,config,{owner:o,recipient:config.splitter,viaSplitter:true,feePpm:10000},o);await send(owner.sendTransaction(hp.request));config.hook=hp.predictedAddress;
    const base={creatorHook:true,hookFactory:config.hookFactory,hook:config.hook,expectedHookOwner:o,expectedHookFeePpm:'10000',expectedHookRecipient:config.splitter,expectedHookViaSplitter:true,expectedSplitRecipients:[b],expectedSplitWeights:['1'],name:'Shielded Hook',symbol:'SHK',supply:'1000000',quoteToken:await quote.getAddress(),tokenBudget:'10000',quoteBudget:'10000',price:'1',fee:3000,tickSpacing:60,humanLowerPrice:'0.5',humanUpperPrice:'2',salt:toBeHex(1,32)};
    let plan,publicPlan;
    for(let i=1;i<=128;i++){base.salt=toBeHex(i,32);plan=await launchPlan(provider,config,base,payer);publicPlan=await launchPlan(provider,{...config,privateFunding:false},base,o);if((BigInt(plan.summary.token)<BigInt(base.quoteToken))!==(BigInt(publicPlan.summary.token)<BigInt(base.quoteToken)))break;if(i===128)throw Error('No opposite payer ordering found.');}
    assert.notEqual(plan.summary.token,publicPlan.summary.token);
    assert.notEqual(Math.sign(plan.terms.tickLower),Math.sign(publicPlan.terms.tickLower));
    assert.deepEqual({tickLower:plan.terms.tickLower,tickUpper:plan.terms.tickUpper},resolveHumanRange({lower:'0.5',upper:'2'},6,BigInt(plan.summary.token)<BigInt(base.quoteToken),60));
    assert.equal(plan.summary.funding,'Shielded funds through shared RelayAdapt');
    assert.equal(plan.hook.owner,o);assert.notEqual(plan.hook.owner,payer);
    const ownerOmitted=await launchPlan(provider,config,{...base,expectedHookOwner:''},payer);assert.equal(ownerOmitted.hook.owner,o);
    await assert.rejects(launchPlan(provider,config,{...base,expectedHookFeePpm:'999'},payer),/fee differs/);
    await assert.rejects(launchPlan(provider,config,{...base,expectedHookOwner:b},payer),/owner differs/);
    await assert.rejects(launchPlan(provider,config,{...base,expectedSplitWeights:['2']},payer),/splitter differs/);
    await assert.rejects(launchPlan(provider,config,{...base,humanUpperPrice:''},payer),/both lower and upper/);
    const iface=new Interface(ABIRelayAdapt),tokenInterface=new Interface(TOKEN_ABI);
    const composed=await composePrivateCalls(plan,payer,info.railgunAddress,25n,'45'.repeat(16));
    const nested=iface.decodeFunctionData('multicall',composed.calls[0].data);
    assert.equal(nested[0],true);assert.equal(nested[1].length,5);
    assert.equal(tokenInterface.decodeFunctionData('approve',nested[1][0].data)[1],0n);
    assert.equal(tokenInterface.decodeFunctionData('approve',nested[1][1].data)[1],plan.terms.quoteBudget);
    assert.equal(nested[1][2].to,config.hookFactory);assert.equal(nested[1][2].data,plan.request.data);
    assert.equal(tokenInterface.decodeFunctionData('approve',nested[1][3].data)[1],0n);
    const shields=iface.decodeFunctionData('shield',nested[1][4].data)[0];
    assert.deepEqual(shields.map(r=>r.preimage.token.tokenAddress),plan.outputs);
    assert.ok(shields.every(r=>r.preimage.value===0n&&r.ciphertext.encryptedBundle.some(x=>BigInt(x)!==0n)));
    assert.ok(!composed.calls[0].data.includes(info.railgunAddress));
    assert.deepEqual(composed.refunds.map(r=>r.tokenAddress),[base.quoteToken]);
    await verifyPrivatePlan(provider,config,plan,payer,composed.planFingerprint);
    await assert.rejects(verifyPrivatePlan(provider,config,{...plan,outputs:plan.outputs.slice(0,2)},payer,composed.planFingerprint),/Terms changed/);
    await assert.rejects(composePrivateCalls({...plan,outputs:[base.quoteToken]},payer,info.railgunAddress,25n,'45'.repeat(16)),/Created token or liquidity/);
    await assert.rejects(composePrivateCalls({...plan,outputs:plan.outputs.slice(1)},payer,info.railgunAddress,25n,'45'.repeat(16)),/Input refund/);
    const configChange=await configureHookPlan(provider,config,{feePpm:12000,recipient:config.splitter,viaSplitter:true},o);await send(owner.sendTransaction(configChange.request));
    await assert.rejects(verifyPrivatePlan(provider,config,plan,payer,composed.planFingerprint),/Creator fee settings changed/);
    await send(owner.sendTransaction((await configureHookPlan(provider,config,{feePpm:10000,recipient:config.splitter,viaSplitter:true},o)).request));
    await verifyPrivatePlan(provider,config,plan,payer,composed.planFingerprint);
    const execute=async(p,c,signer=owner)=>{const t=new Contract(c.spend[0].tokenAddress,TOKEN_ABI,signer);await send(t.approve(payer,c.spend[0].amount));const refunds=await RelayAdaptHelper.generateRelayShieldRequests('67'.repeat(16),c.refunds,[]);return send(relay.connect(signer).execute(c.spend[0].tokenAddress,c.spend[0].amount,c.calls,refunds,{gasLimit:15000000}));};
    const receipt=await execute(plan,composed);assert.equal(receipt.status,1);assert.equal(await relay.failures(),0n);
    const position=new Contract(plan.summary.position,compiled['src/GenesisV4Launchpad.sol'].GenesisV4Position.abi,provider),minted=new Contract(plan.summary.token,compiled['src/GenesisV4Launchpad.sol'].GenesisFixedToken.abi,provider);
    assert.equal((await position.poolKey()).hooks,config.hook);assert.equal(await position.factory(),config.hookFactory);
    assert.equal(await position.balanceOf(sink),plan.terms.liquidity);
    assert.ok(await minted.balanceOf(sink)>=parseUnits('990000',18));
    for(const t of [quote,position,minted])assert.equal(await t.balanceOf(payer),0n);
    assert.equal(await quote.allowance(payer,config.hookFactory),0n);
    assert.equal(await minted.balanceOf(o),0n);assert.equal(await position.balanceOf(o),0n);
    await assert.rejects(verifyPrivatePlan(provider,config,plan,payer,composed.planFingerprint),/already exists/);
    // A real hook-aware private swap pays the chosen input-asset creator fee and
    // reshields both purchased tokens and the gross-unshield rounding remainder.
    const sp=await swapPlan(provider,config,{inputToken:base.quoteToken,outputToken:plan.summary.token,amount:'1',fee:3000,tickSpacing:60,hook:config.hook,maximumHookFeePpm:10000});
    const sc=await composePrivateCalls(sp,payer,info.railgunAddress,25n,'89'.repeat(16));
    const before=await minted.balanceOf(sink);await execute(sp,sc);assert.ok(await minted.balanceOf(sink)>before);
    const hook=await verifyHookContract(provider,config.hook,'OwnerV4FeeHook',{manager:config.manager});
    assert.equal(await hook.accrued(base.quoteToken,config.splitter,true),parseUnits('0.01',6));
    assert.equal(await quote.balanceOf(payer),0n);assert.equal(await minted.balanceOf(payer),0n);assert.equal(await quote.allowance(payer,config.router),0n);
    const half=(await position.balanceOf(sink))/2n,view=await inspectPosition(provider,config,{position:plan.summary.position,shares:formatUnits(half,18)});
    const rp=await redeemPlan(provider,config,{position:plan.summary.position,shares:formatUnits(half,18),minimum0:formatUnits(view.amount0*99n/100n,view.decimals0),minimum1:formatUnits(view.amount1*99n/100n,view.decimals1)});
    const rc=await composePrivateCalls(rp,payer,info.railgunAddress,0n,'ab'.repeat(16));await execute(rp,rc,sinkSigner);
    for(const t of [quote,position,minted])assert.equal(await t.balanceOf(payer),0n);
    assert.equal(await position.balanceOf(sink),plan.terms.liquidity-half);
    // Underfund the required liquidity after constructing a new exact plan.
    // The entire create/approve/shield self-call reverts; only existing quote refunds run.
    const fp=await launchPlan(provider,config,{...base,salt:toBeHex(999,32)},payer);
    fp.terms.tokenBudget=1n;
    const factory=await verifyHookContract(provider,config.hookFactory,'GenesisV4HookLaunchpad',{manager:config.manager});
    fp.request.data=factory.interface.encodeFunctionData('launch',[fp.terms,config.hook]);
    const fc=await composePrivateCalls(fp,payer,info.railgunAddress,25n,'cd'.repeat(16)),refundBefore=await quote.balanceOf(sink);
    await execute(fp,fc);
    assert.equal(await relay.failures(),1n);assert.equal(await provider.getCode(fp.summary.token),'0x');assert.equal(await provider.getCode(fp.summary.position),'0x');
    assert.equal(await quote.balanceOf(sink)-refundBefore,fc.spend[0].amount);
    assert.equal(await quote.balanceOf(payer),0n);assert.equal(await quote.allowance(payer,config.hookFactory),0n);
    assert.notEqual(privatePlanFingerprint(plan,payer),privatePlanFingerprint(plan,o));
  }finally{provider?.destroy();anvil?.kill('SIGTERM');await sdk.stopRailgunEngine();delete globalThis.animaPrivateHookTest;}
});
