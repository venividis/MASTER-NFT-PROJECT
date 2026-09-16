import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {BrowserProvider,Contract,parseEther} from 'ethers';
import {CommunitySaleClient,verifySaleContract} from '../../web/launchpad/sale-client.mjs';
import {SALE_ARTIFACTS} from '../../web/launchpad/sale-artifacts.mjs';
import {deployStack,deployContract} from '../../scripts/lib/deploy-stack.mjs';

async function environment(t){
  const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},wallet:{totalAccounts:5},logging:{quiet:true}}),provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
  t.after(async()=>{provider.destroy();await rpc.disconnect();});const signers=await Promise.all([0,1,2].map(i=>provider.getSigner(i))),addresses=await Promise.all(signers.map(s=>s.getAddress()));
  const stack=await deployStack({signer:signers[0],attesterAddress:addresses[0],royaltyBps:0});
  const clients=signers.map((signer,i)=>{
    const chain={provider,address:addresses[i],chainId:31337,generation:0,prepared:[],invalidate(){this.generation++;this.plan=null;},async assertContext(generation=this.generation){assert.equal(generation,this.generation);assert.equal((await provider.getNetwork()).chainId,31337n);},async prepareExternal(plan){await this.assertContext();assert.ok(plan.purpose);assert.equal(plan.chainId,31337);assert.deepEqual(plan.spend,[]);this.prepared.push(plan);this.plan=plan;return plan;}};
    return {chain,client:new CommunitySaleClient(chain),async send(plan){await provider.call({...plan.request,from:addresses[i]});const receipt=await(await signer.sendTransaction({...plan.request,gasLimit:(await provider.estimateGas({...plan.request,from:addresses[i]}))*12n/10n})).wait();assert.equal(receipt.status,1);return receipt;}};
  });
  const owner=clients[0],ledgerReceipt=await owner.send(await owner.client.setup({kind:'ledger',collection:stack.collection.target})),ledger=ledgerReceipt.contractAddress,modules={};
  for(const kind of ['market','vault','launchpad']){const plan=await owner.client.setup({kind,ledger}),r=await owner.send(plan);assert.equal(r.contractAddress.toLowerCase(),plan.meta.predictedAddress.toLowerCase());modules[kind]=r.contractAddress;}
  await assert.rejects(owner.client.verify(modules.launchpad),/sealed/);
  await owner.send(await owner.client.setup({kind:'seal',ledger,...modules}));
  return {rpc,provider,signers,addresses,stack,clients,ledger,...modules};
}
const advance=async(x,seconds)=>{await x.rpc.request({method:'evm_increaseTime',params:[seconds]});await x.rpc.request({method:'evm_mine',params:[]});};
async function create(x,overrides={}){const a=x.clients[0],now=(await x.provider.getBlock('latest')).timestamp,plan=await a.client.create({launchpad:x.launchpad,name:'Community Light',symbol:'LIGHT',supply:'1000000',softCap:'2',hardCap:'10',closes:now+4000,founderBps:1000,liquidityBps:8000,vestingDays:180,...overrides});
  // Preparing is unsigned: no launch exists until this actual EVM transaction executes.
  const launch=new Contract(x.launchpad,SALE_ARTIFACTS.GenesisLaunchpad.abi,x.provider),before=await launch.launchCount();assert.equal((await a.client.list({launchpad:x.launchpad})).total,String(before));await a.send(plan);assert.equal(await launch.launchCount(),before+1n);return String(before+1n);
}

test('community sale unsigned plans execute issuance, contribution withdrawal, settlement, exact token claims and real vesting/market locks',async t=>{
  const x=await environment(t),[owner,alice,bob]=x.clients,id=await create(x),input={launchpad:x.launchpad,id};
  await alice.send(await alice.client.contribute({...input,amount:'2'}));await bob.send(await bob.client.contribute({...input,amount:'4'}));
  await alice.send(await alice.client.withdraw({...input,amount:'1'}));
  await assert.rejects(alice.client.contribute({...input,amount:'6'}),/hard cap/);await assert.rejects(owner.client.settle(input),/closes/);
  const active=await alice.client.read(input);assert.equal(active.formatted.raised,'5.0');assert.equal(active.formatted.contribution,'1.0');assert.equal(active.phase,'funding');assert.equal(active.actions.withdraw,true);
  await advance(x,4100);await bob.send(await bob.client.settle(input));const settled=await alice.client.read(input);assert.equal(settled.phase,'settled');assert.equal(settled.formatted.publicTokens,'500000.0');assert.equal(settled.formatted.lpTokens,'400000.0');assert.equal(settled.formatted.founderTokens,'100000.0');assert.equal(settled.formatted.claimable,'100000.0');
  assert.equal(settled.founderLock.beneficiary,x.addresses[0]);assert.equal(settled.founderLock.linear,true);assert.equal(settled.founderLock.cliff-settled.founderLock.start,30*86400);assert.equal(settled.founderLock.end-settled.founderLock.start,180*86400);assert.equal(settled.treasuryLock.formatted.amount,'1.0');assert.equal(settled.treasuryLock.linear,false);
  await assert.rejects(owner.client.release({...input,lock:'founder'}),/Nothing has vested/);
  const market=new Contract(x.market,SALE_ARTIFACTS.NativeMarket.abi,x.provider),pool=await market.poolInfo(settled.token);assert.equal(pool[0],parseEther('4'));assert.equal(pool[1],parseEther('400000'));
  await alice.send(await alice.client.claim(input));await bob.send(await bob.client.claim(input));const token=new Contract(settled.token,SALE_ARTIFACTS.GenesisToken.abi,x.provider);assert.equal(await token.balanceOf(x.addresses[1]),parseEther('100000'));assert.equal(await token.balanceOf(x.addresses[2]),parseEther('400000'));assert.equal(await token.balanceOf(x.launchpad),0n);
  await assert.rejects(alice.client.claim(input),/unclaimed/);await assert.rejects(owner.client.claim(input),/unclaimed/);
  const listed=await owner.client.list({launchpad:x.launchpad,limit:1});assert.equal(listed.sales[0].id,id);assert.equal(listed.sales[0].status,2);assert.equal(listed.next,null);
  await advance(x,181*86400);const matured=await owner.client.read(input);assert.equal(matured.founderLock.releasable,parseEther('100000').toString());assert.equal(matured.treasuryLock.releasable,parseEther('1').toString());
  // A participant may trigger the release, but cannot replace the committed founder beneficiary.
  const founderRelease=await bob.client.release({...input,lock:'founder'});assert.equal(founderRelease.summary.recipient,x.addresses[0]);await bob.send(founderRelease);assert.equal(await token.balanceOf(x.addresses[0]),parseEther('100000'));
  const founderBefore=await x.provider.getBalance(x.addresses[0]);await bob.send(await bob.client.release({...input,lock:'treasury'}));assert.equal(await x.provider.getBalance(x.addresses[0])-founderBefore,parseEther('1'));
  await assert.rejects(owner.client.release({...input,lock:'treasury'}),/Nothing has vested/);await assert.rejects(owner.client.release({...input,lock:'other'}),/founder or treasury/);
});

test('failed community raise refunds the complete contribution once and does not seed a market or vesting allocations',async t=>{
  const x=await environment(t),[owner,alice]=x.clients,id=await create(x,{softCap:'3'}),input={launchpad:x.launchpad,id};await alice.send(await alice.client.contribute({...input,amount:'1.25'}));await advance(x,4100);await owner.send(await owner.client.settle(input));
  const state=await alice.client.read(input);assert.equal(state.phase,'refundable');assert.equal(state.formatted.claimable,'1.25');assert.equal(state.founderLock,null);assert.equal(state.treasuryLock,null);
  const before=await x.provider.getBalance(x.addresses[1]),receipt=await alice.send(await alice.client.claim(input)),after=await x.provider.getBalance(x.addresses[1]);assert.equal(after+receipt.fee-before,parseEther('1.25'));assert.equal(await x.provider.getBalance(x.launchpad),0n);await assert.rejects(alice.client.claim(input),/unclaimed/);
  const market=new Contract(x.market,SALE_ARTIFACTS.NativeMarket.abi,x.provider);assert.equal((await market.poolInfo(state.token))[0],0n);
});

test('community verification rejects wrong runtime, uninstalled modules and invalid terms instead of preparing an action',async t=>{
  const x=await environment(t),owner=x.clients[0];await assert.rejects(verifySaleContract(x.provider,x.market,'GenesisLaunchpad'),/bytecode/);await assert.rejects(owner.client.read({launchpad:x.launchpad,id:'1'}),/does not exist/);
  const wrong=await deployContract('GenesisLaunchpad',x.signers[0],[x.ledger]);await assert.rejects(owner.client.verify(wrong.target),/installed/);
  const base={launchpad:x.launchpad,name:'Valid',symbol:'OK',supply:'1',softCap:'1',hardCap:'2'};
  await assert.rejects(owner.client.create({...base,symbol:'TOO-LONG-UTF8'}),/10 bytes/);await assert.rejects(owner.client.create({...base,founderBps:2001}),/Founder/);await assert.rejects(owner.client.create({...base,liquidityBps:4999}),/Liquidity/);await assert.rejects(owner.client.create({...base,vestingDays:29}),/Vesting/);
  await assert.rejects(owner.client.setup({kind:'market',ledger:x.ledger}),/already sealed/);
});

test('scheduled one-hour sale survives delayed confirmation and a prepared creation expires at its explicit opening',async t=>{
  const x=await environment(t),owner=x.clients[0],now=(await x.provider.getBlock('latest')).timestamp;
  const terms={launchpad:x.launchpad,name:'Scheduled Light',symbol:'TIME',supply:'1000',softCap:'1',hardCap:'2',opens:now+300,closes:now+300+3600};
  await assert.rejects(owner.client.create({...terms,opens:0,closes:now+3600}),/confirmation/);
  const plan=await owner.client.create(terms);assert.equal(plan.deadline,terms.opens);await advance(x,120);const receipt=await owner.send(plan);assert.ok((await x.provider.getBlock(receipt.blockNumber)).timestamp<terms.opens);
  const sale=await owner.client.read({launchpad:x.launchpad,id:'1'});assert.equal(sale.phase,'scheduled');assert.equal(sale.closes-sale.opens,3600);assert.equal(sale.name,terms.name);const token=new Contract(sale.token,SALE_ARTIFACTS.GenesisToken.abi,x.provider);assert.equal(await token.balanceOf(x.launchpad),parseEther('1000'));
  const expired=await owner.client.create({...terms,name:'Late Light'});assert.equal(expired.deadline,terms.opens);await advance(x,181);assert.ok((await x.provider.getBlock('latest')).timestamp>expired.deadline);
  await assert.rejects(x.provider.call({...expired.request,from:x.addresses[0]}));await assert.rejects(owner.client.create(terms),/opening/);assert.equal((await owner.client.list({launchpad:x.launchpad})).total,'1');
});
