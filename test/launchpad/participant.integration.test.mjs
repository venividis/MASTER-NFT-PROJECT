import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import ganache from 'ganache';
import {BrowserProvider,Contract,ContractFactory,parseUnits} from '../../web/vendor/ethers.min.js';
import {LaunchChain} from '../../web/launchpad/chain.mjs';
import {LaunchParticipant,validateReadEndpoint} from '../../web/launchpad/participant.mjs';
import {CommunitySaleClient,readCommunitySale} from '../../web/launchpad/sale-client.mjs';
import {AUCTION_ARTIFACT} from '../../web/launchpad/auction-artifacts.mjs';
import {buildLaunchHash,buildLaunchLink,parseLaunchHash} from '../../web/launchpad/links.mjs';
import {deployStack,deployContract} from '../../scripts/lib/deploy-stack.mjs';

const address=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
const mineTo=async(rpc,n)=>{while(BigInt(await rpc.request({method:'eth_blockNumber'}))<BigInt(n))await rpc.request({method:'evm_mine',params:[]});};

async function environment(t){
  const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},wallet:{totalAccounts:4},logging:{quiet:true}}),provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
  const signers=await Promise.all([0,1,2].map(i=>provider.getSigner(i))),addresses=await Promise.all(signers.map(s=>s.getAddress()));
  let connects=0,sends=0;const chains=[],pages=[];
  class Wallet extends EventEmitter{
    constructor(index){super();this.index=index;}
    async request({method,params=[]}){if(method==='eth_requestAccounts'){connects++;return [addresses[this.index]];}if(method==='eth_accounts')return [addresses[this.index]];if(method==='eth_sendTransaction'){sends++;assert.equal(params[0].from.toLowerCase(),addresses[this.index].toLowerCase());}return rpc.request({method,params});}
  }
  function participant(route,index=1){const chain=new LaunchChain({storage:storage(),receiptTimeout:2000,pollInterval:10}),wallet=new Wallet(index),page=new LaunchParticipant({chain,baseURL:'https://example.org/nft/7?rpc=private-key#owner'}).open(route);chains.push(chain);pages.push(page);return {chain,wallet,page};}
  t.after(async()=>{pages.forEach(p=>p.destroy());chains.forEach(c=>c.disconnect());provider.destroy();await rpc.disconnect();});
  return {rpc,provider,signers,addresses,participant,get connects(){return connects;},get sends(){return sends;}};
}

async function execute(page,action){
  await page.act(action);assert.ok(page.chain.plan,'action must prepare the real chain plan');
  await page.act('review');assert.ok(page.chain.review,'gas and exact call are reviewed before signing');
  const receipt=await page.act('send');assert.equal(receipt.status,'confirmed');return receipt;
}

test('launch links contain only deterministic public identity, reject malformed identities and never carry RPC/query secrets',()=>{
  const r={kind:'community',chainId:1,contract:address(101),id:'12'};
  assert.deepEqual(parseLaunchHash(buildLaunchHash(r)),r);
  const link=buildLaunchLink(r,'https://example.org/token/7?rpc=SECRET&privateNote=SECRET#owner');
  assert.equal(link,'https://example.org/token/7'+buildLaunchHash(r));assert.doesNotMatch(link,/SECRET|rpc|privateNote/);
  assert.deepEqual(parseLaunchHash(link),r);assert.equal(parseLaunchHash('#atlas'),null);
  for(const hash of ['#launch/community/1/'+address(1),'#launch/auction/1/'+address(1)+'/2','#launch/community/1/'+address(1)+'/0','#launch/community/9007199254740993/'+address(1)+'/1','#launch/community/1/'+address(0)+'/1','#launch/community/1/'+address(1)+'/1?rpc=foo'])assert.throws(()=>parseLaunchHash(hash));
  assert.throws(()=>buildLaunchLink(r,'data:text/html,owner-state'),/shareable/);
  assert.throws(()=>validateReadEndpoint('http://remote.example/rpc',1),/HTTPS/);
  assert.throws(()=>validateReadEndpoint('https://user:secret@example.org',1),/HTTPS/);
  assert.throws(()=>validateReadEndpoint('http://localhost:8545',1),/HTTPS/);
  assert.equal(validateReadEndpoint('http://127.0.0.1:8545',31337),'http://127.0.0.1:8545/');
});

test('community link reads real sealed sale while disconnected, reconnects on a fresh device, and executes contribution/withdrawal/refund through reviewed wallet transactions', {timeout:90000},async t=>{
  const x=await environment(t),{provider,signers,addresses}=x;
  const stack=await deployStack({signer:signers[0],attesterAddress:addresses[0],royaltyBps:0}),ledger=await deployContract('WorldLedger',signers[0],[stack.collection.target]);
  const market=await deployContract('NativeMarket',signers[0],[ledger.target]),vault=await deployContract('TimeVault',signers[0],[ledger.target]),launchpad=await deployContract('GenesisLaunchpad',signers[0],[ledger.target]);
  await(await ledger.sealModules(market.target,vault.target,launchpad.target)).wait();
  const now=(await provider.getBlock('latest')).timestamp;
  await(await launchpad.create('Actual linked community','LINK','<script>not executable</script> A real public sale.',parseUnits('1000000',18),0,now+4000,parseUnits('2',18),parseUnits('10',18),1000,8000,180*86400,0)).wait();
  const route={kind:'community',chainId:31337,contract:launchpad.target,id:'1'},a=x.participant(route);
  a.page.render();assert.equal(x.connects,0);assert.equal(x.sends,0);assert.equal(a.chain.provider,undefined);
  const before=await a.page.useReadProvider(provider);assert.equal(x.connects,0);assert.equal(x.sends,0);assert.equal(before.phase,'funding');assert.equal(before.name,'Actual linked community');assert.equal(before.personalKnown,false);assert.equal(before.account,null);assert.equal(before.contribution,null);assert.equal(before.claimable,null);
  const html=a.page.render();assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|Recorded contribution|Claimable.*0\.0/);assert.match(html,/500000\.0 LINK/);assert.match(html,/400000\.0 LINK/);assert.match(html,/100000\.0 LINK/);
  await assert.rejects(a.page.prepare('sale:contribute'),/Connect a participant wallet/);
  await assert.rejects(readCommunitySale(provider,{chainId:1,launchpad:launchpad.target,id:'1'}),/different chain/);
  await assert.rejects(readCommunitySale(provider,{chainId:31337,launchpad:market.target,id:'1'}),/bytecode/);
  await a.page.connect(a.wallet);assert.equal(x.connects,1);assert.equal(a.page.record.contribution,'0');assert.equal(a.page.record.personalKnown,true);
  a.page.values.amount='1.5';const prior=x.sends;await a.page.prepare('sale:contribute');assert.equal(x.sends,prior);assert.equal(a.chain.plan.request.value,parseUnits('1.5',18));assert.equal(a.chain.plan.request.to,launchpad.target);await a.page.act('review');assert.equal(x.sends,prior);await a.page.act('send');assert.equal(await launchpad.contribution(1,addresses[1]),parseUnits('1.5',18));
  const b=x.participant(parseLaunchHash(buildLaunchHash(route)));assert.equal(b.chain.records.length,0);await b.page.connect(b.wallet);assert.equal(b.page.record.formatted.contribution,'1.5','Personal rights derive from chain, not the other browser’s records.');
  b.page.values.amount='0.5';await execute(b.page,'sale:withdraw');assert.equal(await launchpad.contribution(1,addresses[1]),parseUnits('1',18));
  b.page.values.amount='0.1';await b.page.prepare('sale:contribute');await b.page.act('review');const sent=x.sends;b.wallet.index=2;b.wallet.emit('accountsChanged',[addresses[2]]);await assert.rejects(b.page.act('send'),/Prepare and review/);assert.equal(x.sends,sent,'A changed account must not receive or submit a previous participant review.');
  await x.rpc.request({method:'evm_increaseTime',params:[4100]});await x.rpc.request({method:'evm_mine',params:[]});await a.page.refresh();await execute(a.page,'sale:settle');assert.equal(a.page.record.phase,'refundable');assert.equal(a.page.record.formatted.claimable,'1.0');
  const balanceBefore=await provider.getBalance(addresses[1]),receipt=await execute(a.page,'sale:claim'),balanceAfter=await provider.getBalance(addresses[1]);assert.equal(balanceAfter+receipt.receipt.fee-balanceBefore,parseUnits('1',18));assert.equal(a.page.record.claimable,'0');
  assert.ok(a.page.matchingRecords().every(r=>r.meta.saleId==='1'));await assert.rejects(a.page.prepare('sale:claim'),/no unclaimed/);
});

test('auction link reads actual six-decimal inventory without wallet and executes funded bids, stale-slot protection, cancellation and claims', {timeout:90000},async t=>{
  const x=await environment(t),{provider,signers,addresses}=x;
  // Test-only mintable ERC20 gives a real six-decimal balance; no mock claim is used in the product.
  const token=await deployContract('OperatingTokenMock',signers[0],[6]);await(await token.mint(addresses[0],parseUnits('1000',6))).wait();
  const start=(await provider.getBlockNumber())+20,end=start+40,auction=await new ContractFactory(AUCTION_ARTIFACT.abi,AUCTION_ARTIFACT.bytecode,signers[0]).deploy(addresses[0],token.target,parseUnits('2.5',6),100,start,end,parseUnits('0.001',18));await auction.waitForDeployment();
  await(await token.approve(auction.target,parseUnits('250',6))).wait();await(await auction.fund()).wait();
  const route={kind:'auction',chainId:31337,contract:auction.target},a=x.participant(route);
  const initial=await a.page.useReadProvider(provider);assert.equal(initial.token.decimals,6);assert.equal(initial.inventory,'250.0');assert.equal(initial.lotTokens,'2.5');assert.equal(initial.personalKnown,false);assert.deepEqual(initial.claims,{tokens:null,refund:null,proceeds:null});assert.equal(x.connects,0);assert.equal(x.sends,0);assert.doesNotMatch(a.page.render(),/Refundable escrow|Claimable tokens/);
  await mineTo(x.rpc,start);await a.page.connect(a.wallet);a.page.values.lots='10';a.page.values.limitPrice='0.002';await execute(a.page,'auction:bid');assert.equal(a.page.record.ownBids.length,1);assert.equal(a.page.record.ownBids[0].sequence,'1');assert.match(a.page.render(),/cancel:0:1/);
  await assert.rejects(a.page.prepare('cancel:0:2'),/stale/);await execute(a.page,'cancel:0:1');assert.ok(BigInt(a.page.record.claims.refund)>0n);await execute(a.page,'auction:claimRefund');assert.equal(await auction.refunds(addresses[1]),0n);
  if(BigInt(a.page.record.claims.tokens)>0n){await execute(a.page,'auction:claimTokens');assert.ok(await token.balanceOf(addresses[1])>0n);}
  a.page.values.lots='5';a.page.values.limitPrice='0.001';await execute(a.page,'auction:bid');await mineTo(x.rpc,end);await a.page.refresh();assert.equal(a.page.record.phase,'awaiting-close');await execute(a.page,'auction:checkpoint');assert.equal(a.page.record.phase,'closed');
  await execute(a.page,'auction:claimTokens');assert.equal(await auction.tokenClaims(addresses[1]),0n);assert.ok(await token.balanceOf(addresses[1])>=parseUnits('12.5',6));
  const fresh=x.participant(parseLaunchHash(buildLaunchHash(route)));await fresh.page.connect(fresh.wallet);assert.equal(fresh.page.record.phase,'closed');assert.equal(fresh.page.record.claims.tokens,'0');assert.equal(fresh.chain.records.length,0);assert.equal(fresh.page.matchingRecords().length,0);
});

test('participant page rejects a read that completes after the launch identity changes',async()=>{
  const first={kind:'auction',chainId:1,contract:address(7)},next={...first,contract:address(8)},page=new LaunchParticipant({chain:new LaunchChain({storage:null})}).open(first);
  let release;const delayed=new Promise(resolve=>release=resolve),provider={async getNetwork(){await delayed;return {chainId:1n};}};
  const pending=page.useReadProvider(provider);page.open(next);release();await assert.rejects(pending,/Launch changed/);assert.equal(page.record,null);assert.equal(page.readProvider,null);
});
