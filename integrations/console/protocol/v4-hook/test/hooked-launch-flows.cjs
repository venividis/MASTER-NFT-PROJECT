const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {ethers}=require('../scripts/dependency.cjs')('ethers');
const {compileFixtures}=require('../scripts/compile.cjs');
const root=path.resolve(__dirname,'..'),project=path.resolve(root,'../../../..');
async function main(){
 const compiled=compileFixtures(),port=23949,rpc=`http://127.0.0.1:${port}`;
 execFileSync(process.execPath,[path.join(project,'scripts/build-v4.mjs')]);
 execFileSync(process.execPath,[path.join(project,'scripts/build-hook-launch.mjs')]);
 const client=await import(path.join(project,'web/launchpad/hook-client.mjs'));
 const anvil=spawn(process.execPath,[path.join(root,'node_modules/@foundry-rs/anvil/bin.mjs'),'--host','127.0.0.1','--port',String(port),'--chain-id','31337','--hardfork','cancun','--silent'],{stdio:['ignore','ignore','pipe']});
 let stderr='',provider;anvil.stderr.on('data',b=>stderr+=b);
 try{
  let ready=false;for(let i=0;i<100;i++){if(anvil.exitCode!==null)throw Error(stderr);try{const r=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})});if((await r.json()).result==='0x7a69'){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  provider=new ethers.JsonRpcProvider(rpc,31337,{staticNetwork:true,cacheTimeout:-1});provider.pollingInterval=10;
  const [owner,alice,bob,attacker]=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i))),[o,a,b,x]=await Promise.all([owner,alice,bob,attacker].map(s=>s.getAddress()));
  const deploy=async(source,name,args=[])=>{const artifact=compiled[source][name],c=await new ethers.ContractFactory(artifact.abi,'0x'+artifact.evm.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c;};
  const send=async tx=>(await tx).wait();
  const manager=await deploy('@uniswap/v4-core/src/PoolManager.sol','PoolManager',[o]),quoter=await deploy('vendor/v4-periphery/src/lens/V4Quoter.sol','V4Quoter',[await manager.getAddress()]),router=await deploy('src/GenesisV4Router.sol','GenesisV4Router',[await manager.getAddress()]);
  const quote=await deploy('src/GenesisV4Launchpad.sol','GenesisFixedToken',['Quote','QUOTE',10n**26n]);
  const config={chainId:31337,manager:await manager.getAddress(),quoter:await quoter.getAddress(),router:await router.getAddress()},passed=[];
  const execute=async(plan,signer=owner)=>{
   assert.equal(plan.chainId,31337);
   for(const spend of plan.spend||[]){const t=new ethers.Contract(spend.tokenAddress,['function approve(address,uint256) returns(bool)'],signer);await send(t.approve(plan.request.to,spend.amount));}
   const receipt=await send(signer.sendTransaction(plan.request));
   if(plan.predictedAddress)await client.verifyHookContract(provider,plan.predictedAddress,plan.verification.name,plan.verification);
   return receipt;
  };
  for(const [kind,key] of [['factory','hookFactory'],['create2','create2'],['splitter','splitter']]){
   const p=await client.hookInfrastructurePlan(provider,config,{kind,owner:o,recipients:[a,b],weights:[3n,1n]},o);assert.equal(await provider.getCode(p.predictedAddress),'0x');await execute(p);config[key]=p.predictedAddress;
  }
  let progress=0;const hp=await client.hookDeployPlan(provider,config,{create2:config.create2,owner:o,feePpm:10000,recipient:config.splitter,viaSplitter:true},o,{onProgress:()=>progress++});assert.ok(progress>0);await execute(hp);config.hook=hp.predictedAddress;
  assert.equal(BigInt(config.hook)&0x3fffn,0xc8n);
  const hook=await client.verifyHookContract(provider,config.hook,'OwnerV4FeeHook',{manager:config.manager,owner:o,recipient:config.splitter,viaSplitter:true});
  const splitter=await client.verifyHookContract(provider,config.splitter,'OwnerFeeRouter',{owner:o});
  const signal=AbortSignal.abort();await assert.rejects(client.mineHookAddress(config.create2,'0x60006000',{signal}),{name:'AbortError'});
  await assert.rejects(client.verifyHookContract(provider,config.hook,'OwnerV4FeeHook',{owner:x}));
  await assert.rejects(client.verifyHookContract(provider,config.router,'OwnerV4FeeHook'));
  passed.push('Browser unsigned builders deploy the separate factory, splitter, CREATE2 factory and correctly flagged known hook; runtime/manager/owner verification and mining cancellation work.');
  const input={name:'Hooked Anima',symbol:'HANI',supply:'1000000',quoteToken:await quote.getAddress(),tokenBudget:'10000',quoteBudget:'10000',price:'1',fee:3000,tickSpacing:60,tickLower:-600,tickUpper:600,salt:ethers.id('hooked-live-path')};
  const human=await client.hookedLaunchPlan(provider,config,{...input,range:{lower:'0.98',upper:'1.02'},salt:ethers.id('human-hook-range')},o);assert.ok(human.terms.tickLower<0&&human.terms.tickUpper>0);assert.equal(Math.abs(human.terms.tickLower%60),0);assert.equal(human.terms.tickUpper%60,0);
  const p=await client.hookedLaunchPlan(provider,config,input,o);assert.equal(p.key.hooks,config.hook);assert.ok(p.terms.liquidity>0n);
  const receipt=await execute(p),factory=await client.verifyHookContract(provider,config.hookFactory,'GenesisV4HookLaunchpad',{manager:config.manager});
  const event=receipt.logs.map(l=>{try{return factory.interface.parseLog(l);}catch{return null;}}).find(l=>l?.name==='Launched');assert.equal(event.args.token,p.summary.token);assert.equal(event.args.position,p.summary.position);
  const position=new ethers.Contract(p.summary.position,compiled['src/GenesisV4Launchpad.sol'].GenesisV4Position.abi,owner),token=new ethers.Contract(p.summary.token,compiled['src/GenesisV4Launchpad.sol'].GenesisFixedToken.abi,owner);
  assert.equal((await position.poolKey()).hooks,config.hook);assert.equal(await token.totalSupply(),ethers.parseEther(input.supply));assert.equal(await position.balanceOf(o),p.terms.liquidity);
  assert.equal(await token.balanceOf(config.hookFactory),0n);assert.equal(await quote.balanceOf(config.hookFactory),0n);assert.equal(await quote.allowance(o,config.hookFactory),0n);
  await assert.rejects(client.hookedLaunchPlan(provider,config,input,o));
  const bad={...p.terms,salt:ethers.id('bad-budget'),tokenBudget:1n},badPredicted=await factory.predict(bad,o,config.hook);await send(quote.approve(config.hookFactory,bad.quoteBudget));await assert.rejects(factory.launch.staticCall(bad,config.hook));assert.equal(await provider.getCode(badPredicted[0]),'0x');
  await assert.rejects(factory.launch.staticCall({...p.terms,salt:ethers.id('no-hook')},ethers.ZeroAddress));
  passed.push('Human quote-per-token ranges map to address-sorted ticks; a single launch creates its predicted fixed-supply token, initializes and funds a genuine hook pool, assigns redeemable LP shares and refunds unused budgets; reused salts, invalid hooks and underfunded launches reject atomically.');
  const gross=ethers.parseEther('1'),fee=gross/100n;
  const sp=await client.hookedSwapPlan(provider,config,{inputToken:await quote.getAddress(),outputToken:await token.getAddress(),amount:'1',fee:3000,tickSpacing:60,maximumHookFeePpm:10000,slippageBps:50});
  const data=ethers.AbiCoder.defaultAbiCoder().decode(['uint24','uint64'],sp.hookData);assert.equal(data[0],10000n);assert.equal(data[1],BigInt(sp.deadline));
  const before=await token.balanceOf(o);await execute(sp);assert.ok(await token.balanceOf(o)>before);assert.equal(await hook.accrued(await quote.getAddress(),config.splitter,true),fee);assert.equal(await manager.balanceOf(config.hook,BigInt(await quote.getAddress())),fee);
  const rev=await client.hookedSwapPlan(provider,config,{inputToken:await token.getAddress(),outputToken:await quote.getAddress(),amount:'1',fee:3000,tickSpacing:60,maximumHookFeePpm:10000,slippageBps:50});await execute(rev);assert.equal(await hook.accrued(await token.getAddress(),config.splitter,true),fee);
  passed.push('Real v4 quoter calls with bounded hookData prepare both swap directions; swaps debit gross input, return output and accrue exact fee claims backed by PoolManager ERC6909 balances.');
  const stale=await client.hookedSwapPlan(provider,config,{inputToken:await quote.getAddress(),outputToken:await token.getAddress(),amount:'1',fee:3000,tickSpacing:60,maximumHookFeePpm:10000});
  await execute(await client.configureHookPlan(provider,config,{feePpm:20000,recipient:config.splitter,viaSplitter:true},o));await send(quote.approve(config.router,gross));await assert.rejects(provider.call({...stale.request,from:o}));
  assert.equal(await hook.accrued(await quote.getAddress(),config.splitter,true),fee);
  await assert.rejects(client.configureHookPlan(provider,config,{feePpm:0,recipient:x,viaSplitter:false},x));
  passed.push('A fee increase beyond the user-signed swap cap rejects before funds move; nonowners cannot configure the hook.');
  await execute(await client.hookFlushPlan(provider,config,{currency:await quote.getAddress(),recipient:config.splitter,viaSplitter:true}),attacker);
  assert.equal(await manager.balanceOf(config.hook,BigInt(await quote.getAddress())),0n);assert.equal(await quote.allowance(config.hook,config.splitter),0n);
  assert.equal(await splitter.claimable(await quote.getAddress(),a),fee*3n/4n);assert.equal(await splitter.claimable(await quote.getAddress(),b),fee/4n);
  await assert.rejects(client.hookClaimPlan(provider,config,{splitter:config.splitter,currency:await quote.getAddress()},x));
  const aBefore=await quote.balanceOf(a);await execute(await client.hookClaimPlan(provider,config,{splitter:config.splitter,currency:await quote.getAddress()},a),alice);assert.equal(await quote.balanceOf(a)-aBefore,fee*3n/4n);
  const oldBob=await splitter.claimable(await quote.getAddress(),b);await execute(await client.configureSplitPlan(provider,config,{splitter:config.splitter,recipients:[o],weights:[1]},o));assert.equal(await splitter.claimable(await quote.getAddress(),b),oldBob);
  await execute(await client.hookClaimPlan(provider,config,{splitter:config.splitter,currency:await quote.getAddress()},b),bob);assert.equal(await splitter.totalClaimable(await quote.getAddress()),0n);
  passed.push('Anyone can flush only to the recorded splitter; the configured 3:1 split conserves funds, each beneficiary claims only their own amount, later weight changes preserve existing claims and hook allowances are cleared.');
  await execute(await client.configureHookPlan(provider,config,{feePpm:10000,recipient:a,viaSplitter:false},o));
  // The prior token-currency fees still belong to the old splitter despite new direct routing.
  await execute(await client.hookFlushPlan(provider,config,{currency:await token.getAddress(),recipient:config.splitter,viaSplitter:true}),attacker);assert.equal(await splitter.claimable(await token.getAddress(),o),fee);
  const direct=await client.hookedSwapPlan(provider,{...config,splitter:undefined},{inputToken:await quote.getAddress(),outputToken:await token.getAddress(),amount:'1',fee:3000,tickSpacing:60});await execute(direct);const directBefore=await quote.balanceOf(a);await execute(await client.hookFlushPlan(provider,config,{currency:await quote.getAddress(),recipient:a,viaSplitter:false}),attacker);assert.equal(await quote.balanceOf(a)-directBefore,fee);
  passed.push('Changing a fee route preserves prior hook accrual buckets; direct-recipient flushes pay only that beneficiary, while old splitter accrual follows weights current at flush time.');
  const half=p.terms.liquidity/2n;await send(position.transfer(a,half));const deadline=(await provider.getBlock('latest')).timestamp+600;
  await assert.rejects(position.connect(attacker).redeem.staticCall(1,0,0,deadline));
  const aPreview=await position.connect(alice).previewRedeem(half);
  assert.deepEqual([...aPreview],[...await position.previewRedeemFor(a,half)],'connected preview must quote the redeeming holder');
  const simulated=await position.connect(alice).redeem.staticCall(half,0,0,deadline);
  assert.deepEqual([...simulated],[...aPreview],'holder preview must match simulated redemption');
  const redemptionKey=await position.poolKey(),tokenAddress=await token.getAddress();
  const currency0=redemptionKey.currency0.toLowerCase()===tokenAddress.toLowerCase()?token:quote,currency1=currency0===token?quote:token;
  const balancesBefore=await Promise.all([currency0.balanceOf(a),currency1.balanceOf(a)]);
  await send(position.connect(alice).redeem(half,aPreview[0],aPreview[1],deadline));
  const balancesAfter=await Promise.all([currency0.balanceOf(a),currency1.balanceOf(a)]);
  assert.deepEqual(balancesAfter.map((balance,index)=>balance-balancesBefore[index]),[...aPreview],'exact-minimum redemption pays the quoted holder amounts');
  const rest=await position.balanceOf(o),oPreview=await position.previewRedeem(rest);await send(position.redeem(rest,oPreview[0],oPreview[1],deadline));assert.equal(await position.totalSupply(),0n);assert.equal(await position.liquidity(),0n);
  passed.push('Hooked liquidity remains represented by the unchanged transferable position shares; separate holders redeem their principal plus ordinary LP fees, and nonholders cannot withdraw.');
  const summary={status:'passed',environment:'Disposable local Anvil Cancun chain 31337 with pinned real Uniswap v4 PoolManager and V4Quoter; no external transactions',scenarios:passed.length,hookFlags:'0x00c8',saltMiningAttempts:hp.mined.attempts,passed};
  fs.writeFileSync(path.join(root,'artifacts/hooked-launch-test-results.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
 }finally{provider?.destroy();anvil.kill('SIGTERM');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
