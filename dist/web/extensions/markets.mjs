import {address,callData,words,quantity,bytesOf} from '../evm.mjs';
const field=(name,label,type='uint256',def)=>({name,label,type,...(def===undefined?{}:{default:def})});
const recipient=()=>field('recipient','Recipient address','address');
const action=(id,label,contract,method,description,fields=[],valueField)=>({id,label,contract,method,description,fields,sender:'wallet',...(valueField?{valueField}:{})});
export const ACTIONS=Object.freeze([
 action('F01.fund','Fund auction','ContinuousClearingAuction','fund','Deposit the exact sale inventory after approving its token to this auction.'),
 action('F01.bid','Place a standing bid','ContinuousClearingAuction','bid','Escrow lots × maximum price in native wei. Existing bids clear elapsed supply before yours enters.',[field('lots','Number of lots','uint64'),field('limitPrice','Maximum native wei per lot','uint96'),field('value','Escrow native wei (lots × maximum price)')],'value'),
 action('F01.checkpoint','Clear released inventory','ContinuousClearingAuction','checkpoint','Settle released lots at a common marginal price. Anyone can advance the auction.'),
 action('F01.cancel','Cancel remaining bid','ContinuousClearingAuction','cancel','Settle elapsed fills, then return the unspent balance to your refundable credit.',[field('slot','Bid slot, 0–63','uint8'),field('expectedSequence','Exact bid sequence','uint64')]),
 action('F01.cancelBeforeStart','Cancel unstarted auction','ContinuousClearingAuction','cancelBeforeStart','Seller cancels before the start and receives an inventory claim.'),
 action('F01.claimTokens','Claim auction tokens','ContinuousClearingAuction','claimTokens','Withdraw purchased tokens or the seller’s unsold inventory.',[recipient()]),
 action('F01.claimRefund','Claim unspent bid funds','ContinuousClearingAuction','claimRefund','Withdraw your recorded native-currency refund.',[recipient()]),
 action('F01.claimProceeds','Claim seller proceeds','ContinuousClearingAuction','claimProceeds','Seller withdraws settled sale proceeds.',[recipient()]),
 action('F06.register','Register a matching participant','PublicGoodsMatching','registerIdentity','Registrar attests a unique person identifier before the round starts. This trusts the disclosed identity policy.',[field('wallet','Participant wallet','address'),field('identity','Unique person identifier hash','bytes32')]),
 action('F06.contribute','Contribute to a public good','PublicGoodsMatching','contribute','Contribute native currency; repeated contributions from one identity are combined before matching.',[field('project','Project index, starting at 0'),field('value','Contribution in native wei')],'value'),
 action('F06.withdraw','Withdraw a contribution','PublicGoodsMatching','withdrawContribution','Withdraw before the deadline, or after sponsor cancellation.',[field('project','Project index, starting at 0'),recipient()]),
 action('F06.cancel','Cancel matching round','PublicGoodsMatching','cancel','Sponsor cancels before the deadline; every donor can reclaim contributions.'),
 action('F06.finalize','Finalize matching','PublicGoodsMatching','finalize','Anyone computes the bounded matching split after the round ends.'),
 action('F06.claimProject','Pay a public good','PublicGoodsMatching','claimProject','Send that project’s contributions plus its match to its immutable recipient.',[field('project','Project index, starting at 0')]),
 action('F06.claimSponsor','Return unused matching funds','PublicGoodsMatching','claimSponsorRefund','Sponsor claims unused matching funds or its cancelled budget.',[recipient()]),
 action('F17.deposit','Freeze NFT into custody shares','WholeNFTShares','deposit','Issuer deposits an approved, unused Bound NFT. Account execution freezes while fractionalized; shares are issued.'),
 action('F17.transfer','Transfer custody shares','WholeNFTShares','transfer','Transfer economic shares. The underlying NFT account remains frozen in custody.',[field('to','Share recipient','address'),field('amount','Share base units')]),
 action('F17.approve','Approve share spending','WholeNFTShares','approve','Set an explicit share allowance for a spender; zero revokes it.',[field('spender','Spender address','address'),field('amount','Maximum share base units')]),
 action('F17.transferFrom','Use a share allowance','WholeNFTShares','transferFrom','Move shares under an allowance the share owner granted.',[field('from','Share owner','address'),field('to','Share recipient','address'),field('amount','Share base units')]),
 action('F17.propose','Offer a whole-NFT buyout','WholeNFTShares','proposeBuyout','Escrow the full native price. Shareholders vote until the fixed deadline.',[recipient(),field('value','Total buyout price in native wei')],'value'),
 action('F17.support','Vote for a buyout','WholeNFTShares','supportBuyout','Lock real shares as support; locked shares cannot be sold or counted twice.',[field('id','Buyout proposal ID'),field('amount','Share base units to lock')]),
 action('F17.withdrawSupport','Unlock buyout votes','WholeNFTShares','withdrawSupport','Withdraw support before the deadline, or unlock shares after resolution.',[field('id','Buyout proposal ID'),field('amount','Locked share base units')]),
 action('F17.resolve','Resolve a buyout','WholeNFTShares','resolveBuyout','After the deadline, the fixed threshold decides sale. A rejecting NFT recipient causes a refundable failed offer.',[field('id','Buyout proposal ID')]),
 action('F17.redeemWhole','Reunite the whole NFT','WholeNFTShares','redeemWhole','Owning every issued share allows an in-kind redemption. Any pending offer is rejected and its bidder receives a refund credit.',[recipient()]),
 action('F17.claimBuyout','Redeem shares for sale proceeds','WholeNFTShares','claimBuyout','Burn unlocked shares for their share of the funded sale proceeds.',[field('shares','Share base units to redeem'),recipient()]),
 action('F17.claimRefund','Reclaim a failed offer','WholeNFTShares','claimRefund','Withdraw the price escrow from rejected or failed buyouts.',[recipient()]),
]);

/** All inputs are raw ABI integers; no floating-point token or currency conversions. No signing side effects. */
export function marketAction(id,target,values={}) {
 const a=ACTIONS.find(x=>x.id===id);if(!a)throw Error('Unknown market action.');target=address(target);
 const args=a.fields.filter(x=>x.name!==a.valueField),types=args.map(x=>x.type),entries=args.map(x=>{
  const value=values[x.name];if(value===undefined)throw Error('Missing '+x.label+'.');
  if(x.type==='address')return address(value);
  if(x.type==='bytes32'){if(bytesOf(value).length!==32||/^0x0+$/.test(value))throw Error('Expected a nonzero bytes32 identity.');return value;}
  if(!/^\d+$/.test(String(value)))throw Error(x.label+' must be an integer.');return BigInt(value);
 });
 let value=0n;if(a.valueField){if(!/^\d+$/.test(String(values[a.valueField])))throw Error('Native value must be integer wei.');value=BigInt(values[a.valueField]);if(value<=0n||value>(1n<<112n)-1n)throw Error('Native value outside uint112 range.');}
 if(id==='F01.bid'&&BigInt(values.lots)*BigInt(values.limitPrice)!==value)throw Error('Bid escrow must equal lots multiplied by limit price.');
 return {id,label:a.label,contract:a.contract,sender:a.sender,note:a.description,to:target,data:callData(a.method+'('+types.join(',')+')',types,entries),value:quantity(value)};
}

/** Independent wallet review: shareholders need not personally own the escrowed master NFT. */
export async function prepareMarketReview(rpc,{id,target,values,expectedChainId,from}) {
 from=address(from);const chain=BigInt(await rpc.request({method:'eth_chainId'}));
 if(chain!==BigInt(expectedChainId))throw Error('Wallet network changed.');
 const accounts=await rpc.request({method:'eth_accounts'});if(!accounts?.length||address(accounts[0])!==from)throw Error('Wallet account changed.');
 const action=marketAction(id,target,values),block=await rpc.request({method:'eth_blockNumber'}),code=await rpc.request({method:'eth_getCode',params:[action.to,block]});if(code==='0x')throw Error('No deployed market contract at this address.');
 const tx={from,to:action.to,data:action.data,value:action.value,chainId:quantity(chain)};
 await rpc.request({method:'eth_call',params:[tx,'latest']});const gas=BigInt(await rpc.request({method:'eth_estimateGas',params:[tx]}));
 if(gas<=0n||gas>15_000_000n)throw Error('Gas estimate outside review bounds.');
 const afterChain=BigInt(await rpc.request({method:'eth_chainId'})),afterAccounts=await rpc.request({method:'eth_accounts'});
 if(chain!==afterChain||!afterAccounts.length||address(afterAccounts[0])!==from)throw Error('Wallet context changed during review.');
 return {...action,schema:'anima.market-review/1',chainId:String(chain),from,block,createdAt:Date.now(),gasLimit:String((gas*120n+99n)/100n),transaction:tx};
}

/** Reads use one pinned block; callers can compare blockHash again before acting. */
export async function readMarketState(rpc,{kind,target,owner}) {
 target=address(target);if(owner)owner=address(owner);
 const block=await rpc.request({method:'eth_blockNumber'}),meta=await rpc.request({method:'eth_getBlockByNumber',params:[block,false]});if(!meta?.hash)throw Error('Missing block identity.');
 const read=async(signature,types=[],args=[],count=1)=>words(await rpc.request({method:'eth_call',params:[{to:target,data:callData(signature,types,args)},block]}),count);
 const names=kind==='auction'?['funded','closed','totalLots','soldLots','releasedLots','startBlock','endBlock','reservePrice','lastClearingPrice','sellerCredit','outstandingQuote','outstandingTokens']:kind==='matching'?['finalized','cancelled','budget','startTime','endTime','identityCount','totalContributions','sponsorRefund','outstandingNative','projectCount']:kind==='shares'?['deposited','redeemed','totalSupply','originalSupply','activeProposal','redemptionPool','outstandingNative','tokenId','approvalBps','votingPeriod']:null;
 if(!names)throw Error('Unknown market state kind.');const state=Object.fromEntries(await Promise.all(names.map(async name=>[name,BigInt((await read(name+'()'))[0]).toString()])));
 if(owner){const getters=kind==='auction'?['refunds','tokenClaims']:kind==='matching'?['personTotal']:['balanceOf','refunds'];for(const name of getters)state[name]=BigInt((await read(name+'(address)',['address'],[owner]))[0]).toString();}
 const addressGetters=kind==='auction'?['seller','saleToken']:kind==='matching'?['sponsor','registrar']:['collection','issuer','account'];
 for(const name of addressGetters)state[name]=address('0x'+(await read(name+'()'))[0].slice(-40));
 if(kind==='matching')state.identityPolicyHash=(await read('identityPolicyHash()'))[0];
 if(kind==='shares')state.propertyDisclosure=(await read('propertyDisclosure()'))[0];
 if(kind==='auction'){state.bids=await Promise.all(Array.from({length:64},async(_,i)=>{const w=await read('bids(uint256)',['uint256'],[i],5);return {slot:i,bidder:'0x'+w[0].slice(-40),remainingLots:BigInt(w[1]).toString(),limitPrice:BigInt(w[2]).toString(),escrow:BigInt(w[3]).toString(),sequence:BigInt(w[4]).toString()};}));}
 if(kind==='matching'){if(BigInt(state.projectCount)>32n)throw Error('Project count exceeds the matching contract bound.');state.projects=await Promise.all(Array.from({length:Number(state.projectCount)},async(_,i)=>{const w=await read('projects(uint256)',['uint256'],[i],5);return {index:i,recipient:address('0x'+w[0].slice(-40)),contributions:BigInt(w[1]).toString(),rootSum:BigInt(w[2]).toString(),matchAmount:BigInt(w[3]).toString(),claimed:BigInt(w[4])===1n};}));}
 const check=await rpc.request({method:'eth_getBlockByNumber',params:[block,false]});if(check?.hash!==meta.hash)throw Error('State block changed. Refresh.');
 return {kind,target,owner,block,blockHash:meta.hash,state};
}

export const DEPLOYMENTS=Object.freeze({
 ContinuousClearingAuction:{args:['seller','saleToken','lotSize:uint112','totalLots:uint64','startBlock:uint64','endBlock:uint64','reservePrice:uint96'],value:'0',after:'Seller approves exact sale inventory to this auction, then calls fund before startBlock.'},
 PublicGoodsMatching:{args:['registrar','identityPolicyHash:bytes32','recipients:address[]','startTime:uint64','endTime:uint64','perPersonCap:uint112'],value:'matching budget in native wei',after:'Registrar registers audited person IDs before startTime. Sponsor equals the deploying address.'},
 WholeNFTShares:{args:['collection','tokenId:uint256','issuer','supply:uint112','propertyDisclosure:bytes32','approvalBps:uint16','votingPeriod:uint64'],value:'0',after:'Issuer approves the exact NFT to this wrapper and calls deposit. Account must be unused and Bound.'},
});
