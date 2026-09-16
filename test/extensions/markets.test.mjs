import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Contract,Interface,keccak256,toUtf8Bytes,ZeroAddress} from 'ethers';
import {deployStack,deployContract,loadArtifact} from '../../scripts/lib/deploy-stack.mjs';
import {marketAction,prepareMarketReview,readMarketState,ACTIONS} from '../../web/extensions/markets.mjs';

// Compile owned modules without deleting/changing the shared artifact tree while other agents build.
const sources={};for(const name of ['extensions/markets/ContinuousClearingAuction.sol','extensions/markets/PublicGoodsMatching.sol','extensions/markets/WholeNFTShares.sol','protocol/ProtocolPrimitives.sol']){
 const key='contracts/src/'+name;sources[key]={content:fs.readFileSync(new URL('../../'+key,import.meta.url),'utf8')};
}
sources['RejectNFT.sol']={content:'// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24; contract RejectNFT {}'};
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:1000},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}})));
const errors=(output.errors||[]).filter(x=>x.severity==='error');assert.deepEqual(errors,[]);
const artifacts=Object.fromEntries(Object.values(output.contracts).flatMap(x=>Object.entries(x)));
for(const [name,a] of Object.entries(artifacts))assert.ok(a.evm.deployedBytecode.object.length/2<=24576,name+' exceeds deployment limit');
async function deploy(name,signer,args=[],value=0n){const a=artifacts[name],c=await new ContractFactory(a.abi,'0x'+a.evm.bytecode.object,signer).deploy(...args,{value});await c.waitForDeployment();return c;}
const tx=async p=>{const r=await(await p).wait();assert.equal(r.status,1);return r;};
async function env(t){const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},wallet:{totalAccounts:8},logging:{quiet:true}});t.after(()=>rpc.disconnect());const p=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});p.pollingInterval=10;const s=await Promise.all(Array.from({length:8},(_,i)=>p.getSigner(i)));const a=await Promise.all(s.map(x=>x.getAddress()));return {rpc,p,s,a};}
async function mineTo(rpc,n){while(Number(BigInt(await rpc.request({method:'eth_blockNumber'})))<n)await rpc.request({method:'evm_mine',params:[]});}
async function advance(rpc,seconds){await rpc.request({method:'evm_increaseTime',params:[seconds]});await rpc.request({method:'evm_mine',params:[]});}
const hash=s=>keccak256(toUtf8Bytes(s));

test('F01 settles incrementally, obeys limits, retires fills once, and exactly conserves both escrows',async t=>{
 const {rpc,p,s,a}=await env(t),token=await deployContract('GenesisToken',s[0],['Auction token','AT',1000,a[0]]);
 const base=await p.getBlockNumber(),start=base+8,end=start+30,c=await deploy('ContinuousClearingAuction',s[0],[a[0],token.target,10,30,start,end,2]);
 await tx(token.approve(c.target,300));await tx(c.fund());await assert.rejects(c.fund());await mineTo(rpc,start);
 await assert.rejects(c.connect(s[1]).bid(10,5,{value:49}));
 await tx(c.connect(s[1]).bid(10,5,{value:50}));
 // The arriving second bidder checkpoints earlier standing demand before entering.
 await tx(c.connect(s[2]).bid(12,3,{value:36}));
 const auctionState=await readMarketState(rpc,{kind:'auction',target:c.target,owner:a[1]});assert.equal(auctionState.state.bids.length,64);assert.equal(auctionState.state.bids[1].sequence,'2');
 const initialSold=await c.soldLots();assert.ok(initialSold>0n&&initialSold<30n);assert.equal(await c.lastClearingPrice(),5n);
 await mineTo(rpc,start+14);await tx(c.checkpoint());assert.ok(await c.soldLots()>initialSold);assert.equal(await c.lastClearingPrice(),3n);
 // Cancellation cannot undo elapsed fills, nor target a reused slot with a stale sequence.
 const second=await c.bids(1);if(second.bidder!==ZeroAddress)await tx(c.connect(s[2]).cancel(1,2));
 await assert.rejects(c.connect(s[1]).cancel(1,2));
 await mineTo(rpc,end);await tx(c.checkpoint());assert.equal(await c.closed(),true);const sold=await c.soldLots();
 const claims=await Promise.all(a.slice(0,3).map(x=>c.tokenClaims(x)));assert.equal(claims.reduce((x,y)=>x+y,0n),300n);
 const refunds=await Promise.all(a.slice(0,3).map(x=>c.refunds(x)));assert.equal(refunds.reduce((x,y)=>x+y,0n)+await c.sellerCredit(),86n);
 await tx(c.checkpoint());assert.equal(await c.soldLots(),sold);
 for(let i=0;i<3;i++){if(claims[i])await tx(c.connect(s[i]).claimTokens(a[i]));if(refunds[i])await tx(c.connect(s[i]).claimRefund(a[i]));}
 await tx(c.claimProceeds(a[0]));assert.equal(await c.outstandingQuote(),0n);assert.equal(await c.outstandingTokens(),0n);assert.equal(await p.getBalance(c.target),0n);assert.equal(await token.balanceOf(c.target),0n);
 await assert.rejects(c.connect(s[1]).claimTokens(a[1]));await assert.rejects(c.connect(s[1]).claimRefund(a[1]));
});

test('F01 undersubscribed final supply clears at reserve and seller can cancel before start',async t=>{
 const {rpc,p,s,a}=await env(t),token=await deployContract('GenesisToken',s[0],['Auction token','AT',1000,a[0]]);
 let start=await p.getBlockNumber()+8;const c=await deploy('ContinuousClearingAuction',s[0],[a[0],token.target,1,100,start,start+10,2]);await tx(token.approve(c.target,100));await tx(c.fund());await mineTo(rpc,start);await tx(c.connect(s[1]).bid(3,7,{value:21}));await mineTo(rpc,start+10);await tx(c.checkpoint());assert.equal(await c.lastClearingPrice(),2n);assert.equal(await c.refunds(a[1]),15n);assert.equal(await c.tokenClaims(a[0]),97n);
 start=await p.getBlockNumber()+8;const cancelled=await deploy('ContinuousClearingAuction',s[0],[a[0],token.target,1,100,start,start+10,2]);await tx(token.approve(cancelled.target,100));await tx(cancelled.fund());await tx(cancelled.cancelBeforeStart());assert.equal(await cancelled.closed(),true);await tx(cancelled.claimTokens(a[0]));await assert.rejects(cancelled.fund());
});

test('F06 cumulative identity matching amplifies distinct people without overspending the fixed pot',async t=>{
 const {rpc,p,s,a}=await env(t),now=(await p.getBlock('latest')).timestamp,c=await deploy('PublicGoodsMatching',s[0],[a[0],hash('one verified human per identity, registrar attestation'),[a[4],a[5]],now+100,now+200,1000],1000n);
 for(let i=1;i<=3;i++)await tx(c.registerIdentity(a[i],hash('person '+i)));
 await assert.rejects(c.registerIdentity(a[6],hash('person 1')));await assert.rejects(c.connect(s[1]).registerIdentity(a[6],hash('person 6')));
 await advance(rpc,101);await assert.rejects(c.registerIdentity(a[6],hash('person 6')));await assert.rejects(c.connect(s[6]).contribute(0,{value:100}));
 await tx(c.connect(s[1]).contribute(0,{value:25}));await tx(c.connect(s[1]).contribute(0,{value:75}));await tx(c.connect(s[2]).contribute(0,{value:100}));await tx(c.connect(s[3]).contribute(1,{value:200}));
 assert.equal(await c.score(0),200n);assert.equal(await c.score(1),0n);
 await assert.rejects(c.connect(s[1]).contribute(0,{value:1000}));await assert.rejects(c.finalize());
 const state=await readMarketState(rpc,{kind:'matching',target:c.target,owner:a[1]});assert.equal(state.state.personTotal,'100');assert.equal(state.state.projects.length,2);
 await advance(rpc,100);await tx(c.connect(s[7]).finalize());assert.equal((await c.projects(0)).matchAmount,1000n);assert.equal((await c.projects(1)).matchAmount,0n);await assert.rejects(c.finalize());await assert.rejects(c.connect(s[1]).withdrawContribution(0,a[1]));
 const before4=await p.getBalance(a[4]),before5=await p.getBalance(a[5]);await tx(c.claimProject(0));await tx(c.claimProject(1));assert.equal(await p.getBalance(a[4])-before4,1200n);assert.equal(await p.getBalance(a[5])-before5,200n);assert.equal(await p.getBalance(c.target),0n);assert.equal(await c.outstandingNative(),0n);await assert.rejects(c.claimProject(0));
});

test('F06 donors can exit, cancelled budgets refund exactly, and zero-match budgets return to sponsor',async t=>{
 const {rpc,p,s,a}=await env(t);let now=(await p.getBlock('latest')).timestamp;
 const c=await deploy('PublicGoodsMatching',s[0],[a[0],hash('registrar-v1'),[a[4]],now+50,now+100,100],301n);await tx(c.registerIdentity(a[1],hash('person')));await advance(rpc,51);await tx(c.connect(s[1]).contribute(0,{value:77}));await tx(c.connect(s[1]).withdrawContribution(0,a[1]));assert.equal(await c.score(0),0n);await tx(c.connect(s[1]).contribute(0,{value:77}));await tx(c.cancel());await advance(rpc,100);await tx(c.claimSponsorRefund(a[0]));await tx(c.connect(s[1]).withdrawContribution(0,a[1]));assert.equal(await p.getBalance(c.target),0n);await assert.rejects(c.finalize());
 now=(await p.getBlock('latest')).timestamp;const empty=await deploy('PublicGoodsMatching',s[0],[a[0],hash('registrar-v1'),[a[4]],now+10,now+20,100],123n);await advance(rpc,21);await tx(empty.finalize());assert.equal(await empty.sponsorRefund(),123n);await tx(empty.claimSponsorRefund(a[0]));assert.equal(await empty.outstandingNative(),0n);
});

async function shareFixture(t){const e=await env(t),{rpc,p,s,a}=e,stack=await deployStack({signer:s[0],attesterAddress:a[6],royaltyReceiver:a[0],royaltyBps:0}),c=stack.collection;
 async function mint(tag){const secret=hash(tag);await tx(c.commitAwakening(await c.commitmentFor(a[0],secret,a[0])));await rpc.request({method:'evm_mine',params:[]});await rpc.request({method:'evm_mine',params:[]});await tx(c.revealAwakening(secret,a[0]));}
 await mint('whole custody first');const account=new Contract(await c.accountOf(1),loadArtifact('SovereignAccount').abi,s[0]),w=await deploy('WholeNFTShares',s[0],[c.target,1,a[0],1000,hash('Custody disclosure v1: frozen Bound account, no offchain secrets'),6667,86400]);return {...e,c,account,w,mint};}

test('F17 real master NFT custody invalidates old sessions and issues transferable shares with no issuer drain',async t=>{
 const {rpc,p,s,a,c,account,w}=await shareFixture(t);const now=(await p.getBlock('latest')).timestamp;
 await assert.rejects(account.createSession(a[1],a[2],'0x00000000',10,now,now+100000,3));await tx(s[0].sendTransaction({to:account.target,value:100}));
 const epoch=await account.sessionEpoch();await tx(c.approve(w.target,1));await tx(w.deposit());assert.equal(await c.ownerOf(1),w.target);assert.equal(await account.currentOwner(),w.target);assert.equal(await account.sessionEpoch(),epoch+1n);assert.equal(await w.totalSupply(),1000n);
 await assert.rejects(account.execute(a[0],1,'0x'));await assert.rejects(account.connect(s[1]).executeSession(a[2],1,'0x'));await assert.rejects(c.transferFrom(w.target,a[0],1));await assert.rejects(w.deposit());
 await tx(w.transfer(a[1],250));await tx(w.connect(s[1]).approve(a[2],50));await tx(w.connect(s[2]).transferFrom(a[1],a[2],50));assert.equal(await w.balanceOf(a[2]),50n);await assert.rejects(w.connect(s[2]).transferFrom(a[1],a[2],1));await assert.rejects(w.redeemWhole(a[0]));
 await tx(w.connect(s[1]).transfer(a[0],200));await tx(w.connect(s[2]).transfer(a[0],50));
 // An outsider's dust offer cannot hold unanimous ownership hostage until its deadline.
 await tx(w.connect(s[4]).proposeBuyout(a[4],{value:1}));await tx(w.redeemWhole(a[3]));assert.equal(await w.activeProposal(),0n);assert.equal(await w.refunds(a[4]),1n);await tx(w.connect(s[4]).claimRefund(a[4]));
 assert.equal(await c.ownerOf(1),a[3]);assert.equal(await w.totalSupply(),0n);assert.equal(await p.getBalance(account.target),100n);await tx(account.connect(s[3]).execute(a[3],100,'0x'));assert.equal(await p.getBalance(account.target),0n);
});

test('F17 rejects used accounts; funded buyout counts each locked share once and pays the whole pool',async t=>{
 const {rpc,p,s,a,c,account,w,mint}=await shareFixture(t);await mint('used custody second');const used=new Contract(await c.accountOf(2),loadArtifact('SovereignAccount').abi,s[0]);await tx(used.execute(a[1],0,'0x'));
 const bad=await deploy('WholeNFTShares',s[0],[c.target,2,a[0],1000,hash('disclosure'),6667,86400]);await tx(c.approve(bad.target,2));await assert.rejects(bad.deposit());
 await tx(c.approve(w.target,1));await tx(w.deposit());await tx(w.transfer(a[1],300));await tx(w.connect(s[2]).proposeBuyout(a[2],{value:1001}));await tx(w.supportBuyout(1,700));await assert.rejects(w.transfer(a[3],1));await assert.rejects(w.supportBuyout(1,1));await assert.rejects(w.resolveBuyout(1));
 await advance(rpc,86401);await tx(w.connect(s[4]).resolveBuyout(1));assert.equal(await c.ownerOf(1),a[2]);assert.equal(await w.redemptionPool(),1001n);await assert.rejects(w.resolveBuyout(1));await tx(w.withdrawSupport(1,700));await tx(w.claimBuyout(700,a[5]));await tx(w.connect(s[1]).claimBuyout(300,a[5]));assert.equal(await w.totalSupply(),0n);assert.equal(await w.outstandingNative(),0n);assert.equal(await p.getBalance(w.target),0n);assert.equal(await account.currentOwner(),a[2]);
});

test('F17 rejected votes and rejecting NFT recipients unlock shares and refund the funded offer',async t=>{
 const {rpc,p,s,a,c,w}=await shareFixture(t);await tx(c.approve(w.target,1));await tx(w.deposit());
 await tx(w.connect(s[2]).proposeBuyout(a[2],{value:99}));await tx(w.supportBuyout(1,100));await tx(w.withdrawSupport(1,100));await advance(rpc,86401);await tx(w.resolveBuyout(1));assert.equal(await w.refunds(a[2]),99n);await tx(w.connect(s[2]).claimRefund(a[2]));
 const rejecting=await deploy('RejectNFT',s[0]);await tx(w.connect(s[2]).proposeBuyout(rejecting.target,{value:101}));await tx(w.supportBuyout(2,1000));await advance(rpc,86401);await tx(w.resolveBuyout(2));assert.equal(await c.ownerOf(1),w.target);assert.equal((await w.buyouts(2)).accepted,false);await tx(w.withdrawSupport(2,1000));await tx(w.connect(s[2]).claimRefund(a[2]));assert.equal(await p.getBalance(w.target),0n);await tx(w.redeemWhole(a[0]));
});

test('typed owner-review actions match every contract selector and reject malformed escrow and stale wallet context',async t=>{
 for(const a of ACTIONS){const abi=artifacts[a.contract].abi,iface=new Interface(abi);assert.ok(iface.getFunction(a.method));const inputs=iface.getFunction(a.method).inputs;assert.deepEqual(a.fields.filter(x=>x.name!==a.valueField).map(x=>x.type),inputs.map(x=>x.type));}
 const {rpc,p,s,a}=await env(t),now=(await p.getBlock('latest')).timestamp,c=await deploy('PublicGoodsMatching',s[0],[a[0],hash('policy'),[a[4]],now+30,now+60,100],100n);
 const review=await prepareMarketReview(rpc,{id:'F06.register',target:c.target,values:{wallet:a[1],identity:hash('person')},from:a[0],expectedChainId:31337});assert.equal(review.transaction.data,c.interface.encodeFunctionData('registerIdentity',[a[1],hash('person')]));assert.equal(await c.identityCount(),0n,'Preparation must not broadcast');
 await assert.rejects(prepareMarketReview(rpc,{id:'F06.register',target:c.target,values:{wallet:a[1],identity:hash('person')},from:a[0],expectedChainId:84532}));
 assert.throws(()=>marketAction('F01.bid',c.target,{lots:'2',limitPrice:'5',value:'9'}),/escrow/);assert.throws(()=>marketAction('F01.cancel',c.target,{slot:'256',expectedSequence:'1'}));
 assert.throws(()=>marketAction('F17.transfer',c.target,{to:a[1],amount:'0.1'}),/integer/);
});
