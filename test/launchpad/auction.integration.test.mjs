import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EventEmitter} from 'node:events';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Contract,keccak256,parseUnits,formatUnits} from '../../web/vendor/ethers.min.js';
import {LaunchChain} from '../../web/launchpad/chain.mjs';
import {AUCTION_ARTIFACT} from '../../web/launchpad/auction-artifacts.mjs';
import {auctionDeployPlan,auctionFundPlan,auctionBidPlan,auctionActionPlan,inspectAuction,verifyAuctionContract} from '../../web/launchpad/auction-client.mjs';

const CONFIG={chainId:31337},wei=n=>formatUnits(BigInt(n),18);
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
async function mineTo(rpc,n){while(BigInt(await rpc.request({method:'eth_blockNumber'}))<BigInt(n))await rpc.request({method:'evm_mine',params:[]});}
async function execute(chain,plan){await chain.prepareExternal(plan);const reviews=[];for(let i=0;i<4;i++){const review=await chain.reviewNext();reviews.push(review);const result=await chain.sendReviewed();assert.equal(result.status,'confirmed');if(review.final)return {result,reviews};}throw Error('Unexpected approval loop');}
async function environment(t){
 const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},wallet:{totalAccounts:4},logging:{quiet:true}}),provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 const signers=await Promise.all([0,1,2].map(i=>provider.getSigner(i))),addresses=await Promise.all(signers.map(s=>s.getAddress()));
 const tokenArtifact=JSON.parse(fs.readFileSync(new URL('../../contracts/artifacts/GenesisToken.json',import.meta.url)));
 const token=await new ContractFactory(tokenArtifact.abi,tokenArtifact.bytecode,signers[0]).deploy('Auction test token','ATT',parseUnits('1000',18),addresses[0]);await token.waitForDeployment();
 const chains=[];let sends=0;
 for(let i=0;i<3;i++){
  class Wallet extends EventEmitter{async request({method,params=[]}){if(method==='eth_requestAccounts'||method==='eth_accounts')return [addresses[i]];if(method==='eth_sendTransaction'){assert.equal(params[0].from.toLowerCase(),addresses[i].toLowerCase());sends++;}return rpc.request({method,params});}}
  const chain=new LaunchChain({storage:memory(),receiptTimeout:2000,pollInterval:10});await chain.connect(new Wallet());chains.push(chain);
 }
 t.after(async()=>{chains.forEach(c=>c.disconnect());provider.destroy();await rpc.disconnect();});
 return {rpc,provider,signers,addresses,token,chains,get sends(){return sends;}};
}

test('auction browser artifact is exactly the shipped source and deployable artifact',()=>{
 const original=JSON.parse(fs.readFileSync(new URL('../../contracts/artifacts/ContinuousClearingAuction.json',import.meta.url)));
 assert.equal(AUCTION_ARTIFACT.bytecode,original.bytecode);assert.equal(AUCTION_ARTIFACT.creationHash,keccak256(original.bytecode));
 for(const [source,hash] of Object.entries(AUCTION_ARTIFACT.sourceHashes))assert.equal(keccak256(fs.readFileSync(new URL('../../'+source,import.meta.url))),hash);
 assert.deepEqual(Object.keys(AUCTION_ARTIFACT.immutables).sort(),['endBlock','lotSize','reservePrice','saleToken','seller','startBlock','totalLots']);
});

test('real wallet review deploys and funds inventory; bids, cancellation, settlement and claims conserve both assets', {timeout:90000},async t=>{
 const e=await environment(t),{provider:p,rpc,chains:[seller,buyer,other],addresses:a,token}=e,start=Number(BigInt(await rpc.request({method:'eth_blockNumber'})))+24,end=start+30;
 const input={saleToken:token.target,lotSize:'10',totalLots:'30',reservePrice:wei(2),startBlock:start,endBlock:end};
 const deploy=await auctionDeployPlan(p,CONFIG,input,a[0]);assert.equal(e.sends,0);assert.equal(deploy.summary.mechanism,'ANIMA streaming auction');assert.equal(deploy.terms.lotSize,parseUnits('10',18));
 const deployed=await execute(seller,deploy),auction=deployed.result.contractAddress;assert.equal(auction,deploy.predictedAddress);const c=await verifyAuctionContract(p,auction,deploy.terms);
 let state=await inspectAuction(p,{auction,owner:a[0]});assert.equal(state.state.lotSize,parseUnits('10',18).toString());assert.equal(state.inventory,'300.0');assert.equal(state.phase,'unfunded');
 const funding=await auctionFundPlan(p,CONFIG,{auction},a[0]);assert.equal(funding.spend[0].amount,parseUnits('300',18));
 const funded=await execute(seller,funding);assert.equal(funded.reviews.length,2);assert.equal(funded.reviews[0].approval.amount,parseUnits('300',18).toString());assert.equal(await token.allowance(a[0],auction),0n);assert.equal(await token.balanceOf(auction),parseUnits('300',18));
 await assert.rejects(auctionFundPlan(p,CONFIG,{auction},a[0]),/already funded/);await assert.rejects(auctionBidPlan(p,CONFIG,{auction,lots:10,limitPrice:wei(5)},a[1]),/not currently accepting/);
 await mineTo(rpc,start);
 await execute(buyer,await auctionBidPlan(p,CONFIG,{auction,lots:10,limitPrice:wei(5)},a[1]));
 await execute(other,await auctionBidPlan(p,CONFIG,{auction,lots:12,limitPrice:wei(3)},a[2]));
 state=await inspectAuction(p,{auction,owner:a[2]});assert.equal(state.phase,'active');assert.equal(state.ownBids.length,1);assert.equal(state.ownBids[0].sequence,'2');
 await assert.rejects(auctionActionPlan(p,CONFIG,{auction,action:'cancel',slot:state.ownBids[0].slot,expectedSequence:1},a[2]),/stale/);
 await execute(other,await auctionActionPlan(p,CONFIG,{auction,action:'cancel',slot:state.ownBids[0].slot,expectedSequence:2},a[2]));
 assert.equal(await c.refunds(a[2]),36n);await execute(other,await auctionActionPlan(p,CONFIG,{auction,action:'claimRefund'},a[2]));assert.equal(await c.refunds(a[2]),0n);
 assert.ok(await c.tokenClaims(a[1])>0n);await execute(buyer,await auctionActionPlan(p,CONFIG,{auction,action:'claimTokens'},a[1]));
 // Seller proceeds are intentionally claimable during this particular auction, not conditioned on a soft cap.
 const firstProceeds=await c.sellerCredit();assert.ok(firstProceeds>0n);await execute(seller,await auctionActionPlan(p,CONFIG,{auction,action:'claimProceeds'},a[0]));
 await mineTo(rpc,end);await execute(seller,await auctionActionPlan(p,CONFIG,{auction,action:'checkpoint'},a[0]));assert.equal(await c.closed(),true);
 const tokenClaims=await Promise.all(a.map(x=>c.tokenClaims(x))),refunds=await Promise.all(a.map(x=>c.refunds(x))),lastProceeds=await c.sellerCredit();
 assert.equal(refunds.reduce((x,y)=>x+y,0n)+lastProceeds+firstProceeds+36n,86n);
 for(let i=0;i<3;i++){if(tokenClaims[i]>0n)await execute(e.chains[i],await auctionActionPlan(p,CONFIG,{auction,action:'claimTokens'},a[i]));if(refunds[i]>0n)await execute(e.chains[i],await auctionActionPlan(p,CONFIG,{auction,action:'claimRefund'},a[i]));}
 if(lastProceeds>0n)await execute(seller,await auctionActionPlan(p,CONFIG,{auction,action:'claimProceeds'},a[0]));
 assert.equal(await c.outstandingQuote(),0n);assert.equal(await c.outstandingTokens(),0n);assert.equal(await p.getBalance(auction),0n);assert.equal(await token.balanceOf(auction),0n);assert.equal(await token.balanceOf(a[1]),parseUnits('100',18));
 await assert.rejects(auctionActionPlan(p,CONFIG,{auction,action:'claimTokens'},a[1]),/no recorded balance/);await assert.rejects(auctionActionPlan(p,CONFIG,{auction,action:'claimRefund'},a[2]),/no recorded balance/);
});

test('plans reject wrong runtimes, inconsistent immutable code, bad units, unsafe block windows and stale ownership', {timeout:60000},async t=>{
 const {provider:p,rpc,chains:[seller],addresses:a,token}=await environment(t),start=Number(BigInt(await rpc.request({method:'eth_blockNumber'})))+20;
 const input={saleToken:token.target,lotSize:'1',totalLots:'10',reservePrice:'0.01',startBlock:start,endBlock:start+30};
 await assert.rejects(auctionDeployPlan(p,CONFIG,{...input,startBlock:start-19},a[0]),/eight blocks/);
 await assert.rejects(auctionDeployPlan(p,CONFIG,{...input,totalLots:9007199254740993},a[0]),/exact integer/);
 await assert.rejects(auctionDeployPlan(p,CONFIG,{...input,lotSize:'1e2'},a[0]),/decimal amount/);
 await assert.rejects(auctionDeployPlan(p,CONFIG,{...input,endBlock:start+10000001},a[0]),/bounds/);
 await assert.rejects(auctionDeployPlan(p,{chainId:1},input,a[0]),/network/);
 await assert.rejects(verifyAuctionContract(p,token.target),/bytecode|runtime/);
 const plan=await auctionDeployPlan(p,CONFIG,input,a[0]),{result}=await execute(seller,plan),auction=result.contractAddress;
 await assert.rejects(verifyAuctionContract(p,auction,{seller:a[1]}),/seller differs/);
 const code=await p.getCode(auction),ref=AUCTION_ARTIFACT.immutables.lotSize.find(r=>r.start!==AUCTION_ARTIFACT.immutables.lotSize[0].start)||AUCTION_ARTIFACT.immutables.lotSize[0],offset=2+(ref.start+31)*2;
 const changed=code.slice(0,offset)+(code.slice(offset,offset+2)==='01'?'02':'01')+code.slice(offset+2);
 const corrupt={send:async(method,params)=>method==='eth_getCode'?changed:p.send(method,params)};
 await assert.rejects(verifyAuctionContract(corrupt,auction),/inconsistent/);
 await assert.rejects(auctionFundPlan(p,CONFIG,{auction},a[1]),/Only the auction seller/);
 await execute(seller,await auctionFundPlan(p,CONFIG,{auction},a[0]));
 await assert.rejects(auctionActionPlan(p,CONFIG,{auction,action:'cancelBeforeStart'},a[1]),/Only the seller/);
 await execute(seller,await auctionActionPlan(p,CONFIG,{auction,action:'cancelBeforeStart'},a[0]));
 assert.equal((await inspectAuction(p,{auction,owner:a[0]})).claims.tokens,parseUnits('10',18).toString());
 await assert.rejects(auctionActionPlan(p,CONFIG,{auction,action:'claimTokens',recipient:auction},a[0]),/own claim/);
 await execute(seller,await auctionActionPlan(p,CONFIG,{auction,action:'claimTokens'},a[0]));assert.equal(await token.balanceOf(auction),0n);
});
