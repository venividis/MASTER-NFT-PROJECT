import {Contract,ContractFactory,Interface,AbiCoder,getCreateAddress,JsonRpcProvider,FetchRequest,getAddress,keccak256,zeroPadValue,parseUnits,formatUnits,solidityPacked,ZeroAddress} from '../vendor/ethers.min.js';
import {verifySaleContract} from '../launchpad/sale-client.mjs';
import {CROSSCHAIN_ARTIFACTS} from './artifacts.mjs';
const TOKEN=['function decimals() view returns(uint8)','function symbol() view returns(string)','function balanceOf(address) view returns(uint256)'];
const OFT=['function endpoint() view returns(address)','function peers(uint32) view returns(bytes32)','function token() view returns(address)','function oftVersion() view returns(bytes4,uint64)'];
const ENDPOINT=['function eid() view returns(uint32)','function getSendLibrary(address,uint32) view returns(address)','function getReceiveLibrary(address,uint32) view returns(address,bool)'];
const actionType='tuple(address recipient,uint256 minimumReceived,uint112 lockAmount,uint64 deadline,uint64 start,uint64 cliff,uint64 end,bool linear)';
const actionHash=action=>keccak256(AbiCoder.defaultAbiCoder().encode([actionType],[action]));
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export function readProvider(url,chainId){const parsed=new URL(url);const local=[31337,31001,31002].includes(Number(chainId))&&['127.0.0.1','localhost','[::1]'].includes(parsed.hostname);if(parsed.username||parsed.password||parsed.hash||(!local&&parsed.protocol!=='https:')||(local&&!['http:','https:'].includes(parsed.protocol)))throw Error('Use an HTTPS RPC URL, or localhost for an explicit development chain.');const request=new FetchRequest(parsed.href);request.timeout=15000;return new JsonRpcProvider(request,undefined,{cacheTimeout:-1});}
export async function verifyBridgeContract(provider,address,name,blockTag){address=getAddress(address);const artifact=CROSSCHAIN_ARTIFACTS[name],code=await provider.getCode(address,blockTag);if((code.length-2)/2!==artifact.bytes)throw Error(`${name} runtime does not match this NFT's bridge implementation.`);let normalized=code.slice(2);for(const m of artifact.immutableGroups.flat())normalized=normalized.slice(0,m.start*2)+'0'.repeat(m.length*2)+normalized.slice((m.start+m.length)*2);if(keccak256('0x'+normalized)!==artifact.normalizedHash)throw Error(`${name} runtime failed its exact immutable-aware verification.`);return new Contract(address,artifact.abi,provider);}
export async function inspectLane(sourceProvider,{sourceAddress,destinationProvider,destinationChainId}){
 const sourceChain=(await sourceProvider.getNetwork()).chainId,destinationChain=(await destinationProvider.getNetwork()).chainId;
 if(destinationChain!==BigInt(destinationChainId)||sourceChain===destinationChain)throw Error('Select two distinct chains and the matching destination RPC.');
 const sourceBlock=await sourceProvider.getBlockNumber(),destinationBlock=await destinationProvider.getBlockNumber();
 const source=await verifyBridgeContract(sourceProvider,sourceAddress,'AnimaOFTSource',sourceBlock),s={blockTag:sourceBlock},d={blockTag:destinationBlock};
 const [oftAddress,tokenAddress,endpointAddress,dstEid,composerAddress,peer]=await Promise.all([source.oft(s),source.token(s),source.endpoint(s),source.destinationEid(s),source.composer(s),source.destinationPeer(s)]);
 const composer=await verifyBridgeContract(destinationProvider,composerAddress,'AnimaOFTComposer',destinationBlock);
 const [destOFT,destToken,destEndpoint,srcEid,router,sourcePeer,vault]=await Promise.all([composer.oft(d),composer.token(d),composer.endpoint(d),composer.sourceEid(d),composer.sourceRouter(d),composer.sourcePeer(d),composer.timeVault(d)]);
 if(!same(router,zeroPadValue(getAddress(sourceAddress),32))||!same(peer,zeroPadValue(destOFT,32))||!same(sourcePeer,zeroPadValue(oftAddress,32)))throw Error('The source and destination lane do not authenticate one another.');
 const sourceOFT=new Contract(oftAddress,OFT,sourceProvider),destinationOFT=new Contract(destOFT,OFT,destinationProvider),sourceEndpoint=new Contract(endpointAddress,ENDPOINT,sourceProvider),destinationEndpoint=new Contract(destEndpoint,ENDPOINT,destinationProvider);
 const [actualSrcEid,actualDstEid,sourceOFTPeer,destOFTPeer,sourceOFTEndpoint,destOFTEndpoint]=await Promise.all([sourceEndpoint.eid(s),destinationEndpoint.eid(d),sourceOFT.peers(dstEid,s),destinationOFT.peers(srcEid,d),sourceOFT.endpoint(s),destinationOFT.endpoint(d)]);
 if(actualSrcEid!==srcEid||actualDstEid!==dstEid||!same(sourceOFTPeer,peer)||!same(destOFTPeer,sourcePeer)||!same(sourceOFTEndpoint,endpointAddress)||!same(destOFTEndpoint,destEndpoint))throw Error('LayerZero endpoint or asset-peer configuration has changed.');
 const token=new Contract(tokenAddress,TOKEN,sourceProvider),destinationToken=new Contract(destToken,TOKEN,destinationProvider);
 const [symbol,decimals,destinationSymbol,destinationDecimals,sendLibrary,receiveLibrary]=await Promise.all([token.symbol(s),token.decimals(s),destinationToken.symbol(d),destinationToken.decimals(d),sourceEndpoint.getSendLibrary(oftAddress,dstEid,s),destinationEndpoint.getReceiveLibrary(destOFT,srcEid,d)]);
 if(Number(decimals)>36||Number(destinationDecimals)>36||symbol.length>32||destinationSymbol.length>32)throw Error('Unsupported token metadata.');
 return {source,composer,sourceProvider,destinationProvider,sourceAddress:getAddress(sourceAddress),composerAddress,sourceChain:String(sourceChain),destinationChain:String(destinationChain),sourceBlock,destinationBlock,oftAddress,tokenAddress,destOFT,destToken,endpointAddress,destEndpoint,srcEid:String(srcEid),dstEid:String(dstEid),vault,symbol,decimals:Number(decimals),destinationSymbol,destinationDecimals:Number(destinationDecimals),sendLibrary,receiveLibrary:receiveLibrary[0],trust:'The token issuer controls its OFT and LayerZero verification configuration. Contract matching does not certify the issuer, DVNs or RPC.'};
}
export const bridgeOptions=()=>solidityPacked(['uint16','uint8','uint16','uint8','uint128','uint8','uint16','uint8','uint16','uint128'],[3,1,17,1,250000,1,19,3,0,900000]);
export async function bridgePlan(lane,input){
 const amount=parseUnits(String(input.amount),lane.decimals),minimum=parseUnits(String(input.minimum),lane.decimals),minimumReceived=parseUnits(String(input.minimum),lane.destinationDecimals),lockAmount=parseUnits(String(input.lockAmount||'0'),lane.destinationDecimals);
 if(amount<=0n||minimum<=0n||minimum>amount||lockAmount<0n||lockAmount>minimumReceived)throw Error('Set a positive amount, a minimum within it, and a lock amount no greater than that minimum.');
 const recipient=getAddress(input.recipient),now=Number((await lane.sourceProvider.getBlock('latest')).timestamp),deadline=now+86400;
 const end=lockAmount?Math.floor(new Date(input.unlockAt).getTime()/1000):0;
 if(lockAmount&&(lane.vault===ZeroAddress||!Number.isSafeInteger(end)||end<=now||end>now+3650*86400))throw Error('This lane needs a configured TimeVault and an unlock date within ten years.');
 const action={recipient,minimumReceived,lockAmount,deadline,start:0,cliff:lockAmount?(input.linear?0:end):0,end,linear:!!input.linear},options=bridgeOptions();
 const quote=await lane.source.quote(amount,minimum,action,options);if(quote.lzTokenFee!==0n)throw Error('This route accepts native messaging fees only.');
 const fee=quote.nativeFee+quote.nativeFee/10n;
 return {kind:'crosschain-bridge',chainId:Number(lane.sourceChain),deadline:now+600,request:{to:lane.sourceAddress,data:lane.source.interface.encodeFunctionData('bridge',[amount,minimum,action,options,fee]),value:fee},spend:[{tokenAddress:lane.tokenAddress,amount}],meta:{bridgeSource:lane.sourceAddress,composer:lane.composerAddress,destinationChainId:lane.destinationChain,recipient,amount:String(amount),minimum:String(minimum),destinationEid:lane.dstEid,actionHash:actionHash(action),action:Object.fromEntries(Object.entries(action).map(([k,v])=>[k,typeof v==='bigint'?String(v):v]))},summary:{purpose:'Bridge tokens and execute the selected destination payout',sourceChain:lane.sourceChain,destinationChain:lane.destinationChain,token:lane.symbol,amount:input.amount,minimumReceived:input.minimum,recipient,locked:input.lockAmount||'0',unlock:lockAmount?input.unlockAt:'No lock',maximumMessagingFee:String(fee),sourceRouter:lane.sourceAddress,destinationComposer:lane.composerAddress,sendLibrary:lane.sendLibrary,receiveLibrary:lane.receiveLibrary,transportTrust:lane.trust,failure:'A failed destination action leaves a recipient-owned destination credit. Retry preserves the same terms; refund pays on the destination chain.'}};
}
export async function deliveryRecord(lane,sourceHash,{confirmations=12}={}){
 if(!/^0x[\da-f]{64}$/i.test(sourceHash))throw Error('Enter the source transaction hash.');
 const receipt=await lane.sourceProvider.getTransactionReceipt(sourceHash);if(!receipt)return {status:'Source transaction pending or unknown',sourceHash};
 const canonical=await lane.sourceProvider.getBlock(receipt.blockNumber);if(!canonical||canonical.hash!==receipt.blockHash)throw Error('Source receipt is no longer canonical; wait for chain recovery.');
 if(receipt.status!==1)return {status:'Source transaction reverted; no bridge execution',sourceHash};
 const event=receipt.logs.filter(log=>same(log.address,lane.sourceAddress)).map(log=>{try{return lane.source.interface.parseLog(log)}catch{return null}}).find(log=>log?.name==='BridgeSent');
 if(!event)throw Error('This receipt does not contain a send from the selected bridge lane.');
 const depth=(await lane.sourceProvider.getBlockNumber())-receipt.blockNumber+1;
 const destinationBlock=await lane.destinationProvider.getBlock('latest'),delivery=await lane.composer.deliveries(event.args.guid,{blockTag:destinationBlock.number});
 const original=delivery.status!==0n?await lane.composer.deliveryAction(event.args.guid,{blockTag:destinationBlock.number}):null;
 return {status:['Awaiting destination composition','Destination action deferred; recipient can retry or refund','Destination executed','Destination refunded'][Number(delivery.status)],guid:event.args.guid,sourceHash,sourceBlock:receipt.blockNumber,sourceBlockHash:receipt.blockHash,sourceConfirmations:depth,sourceConfirmationTargetMet:depth>=confirmations,requiredConfirmations:confirmations,destinationBlock:destinationBlock.number,destinationBlockHash:destinationBlock.hash,destinationStatus:Number(delivery.status),recipient:event.args.recipient,amount:String(delivery.amount),lockId:String(delivery.lockId),actionHash:delivery.actionHash,...(delivery.status!==0n?{action:Object.fromEntries(['recipient','minimumReceived','lockAmount','deadline','start','cliff','end','linear'].map((key,index)=>[key,typeof original[index]==='bigint'?String(original[index]):original[index]]))}:{})};
}
export async function destinationActionPlan(lane,guid,operation,action){
 if(!/^0x[\da-f]{64}$/i.test(guid)||!['retry','refund'].includes(operation))throw Error('Choose a recorded destination delivery and retry or refund.');
 const record=await lane.composer.deliveries(guid);if(record.status!==1n)throw Error('This delivery has no deferred destination credit.');
 return {kind:'crosschain-'+operation,chainId:Number(lane.destinationChain),deadline:Math.floor(Date.now()/1000)+600,request:{to:lane.composerAddress,data:lane.composer.interface.encodeFunctionData(operation,operation==='retry'?[guid,action]:[guid]),value:0n},spend:[],summary:{purpose:operation==='retry'?'Retry the original destination terms':'Refund the deferred destination credit',recipient:record.recipient,amount:formatUnits(record.amount,lane.destinationDecimals),asset:lane.destinationSymbol,guid},meta:{guid,composer:lane.composerAddress,recipient:record.recipient,expectedAmount:String(record.amount),actionHash:record.actionHash}};
}

export async function bridgeDeploymentPlan(name,args,{chainId,sender,nonce}){
 if(!['AnimaOFTSource','AnimaOFTComposer'].includes(name))throw Error('Unknown cross-chain deployment.');
 const keys=name==='AnimaOFTSource'?['oft','destinationEid','composer','destinationPeer']:['endpoint','oft','sourceEid','sourceRouter','sourcePeer','timeVault'];
 if(args.length!==keys.length)throw Error('Cross-chain constructor arguments are incomplete.');
 const request=await new ContractFactory(CROSSCHAIN_ARTIFACTS[name].abi,CROSSCHAIN_ARTIFACTS[name].bytecode).getDeployTransaction(...args);request.nonce=nonce;
 const predictedAddress=getCreateAddress({from:getAddress(sender),nonce});
 return {kind:'crosschain-setup',chainId:Number(chainId),deadline:Math.floor(Date.now()/1000)+900,request,spend:[],meta:{contractName:name,predictedAddress,expectedImmutables:Object.fromEntries(keys.map((key,index)=>[key,String(args[index])]))},summary:{purpose:'Deploy '+name,predictedAddress,chainId:String(chainId),creationHash:CROSSCHAIN_ARTIFACTS[name].creationHash}};
}

export async function verifyCrosschainReceipt(provider,record,receipt){
 if(!record.final)return null;
 if((await provider.getNetwork()).chainId!==BigInt(record.chainId))throw Error('Receipt provider is on another chain.');
 if(Number(receipt.status)!==1)throw Error('Cross-chain transaction reverted.');
 const meta=record.meta||{},block={blockTag:receipt.blockNumber},inner=record.innerRequest||record.request;
 if(record.kind==='crosschain-setup'){
  if(!same(receipt.contractAddress,meta.predictedAddress))throw Error('Bridge deployment address differs from the reviewed nonce.');
  const required=meta.contractName==='AnimaOFTSource'?['oft','destinationEid','composer','destinationPeer']:meta.contractName==='AnimaOFTComposer'?['endpoint','oft','sourceEid','sourceRouter','sourcePeer','timeVault']:null;
  if(!required||required.some(key=>meta.expectedImmutables?.[key]===undefined)||Object.keys(meta.expectedImmutables).length!==required.length)throw Error('Complete reviewed bridge deployment immutables are required.');
  const contract=await verifyBridgeContract(provider,receipt.contractAddress,meta.contractName,receipt.blockNumber);
  for(const [key,value] of Object.entries(meta.expectedImmutables||{}))if(!same(await contract[key](block),value))throw Error('Bridge deployment immutable differs: '+key);
  record.contractAddress=getAddress(receipt.contractAddress);record.crosschain={status:'Lane component deployed; verify the paired lane before use',contractAddress:record.contractAddress};return record.crosschain;
 }
 if(record.kind==='crosschain-bridge'){
  if(!same(inner.to,meta.bridgeSource))throw Error('Source bridge request identity changed.');
  const source=await verifyBridgeContract(provider,meta.bridgeSource,'AnimaOFTSource',receipt.blockNumber);
  const events=receipt.logs.filter(log=>same(log.address,meta.bridgeSource)).map(log=>{try{return source.interface.parseLog(log)}catch{return null}}).filter(event=>event?.name==='BridgeSent');
  if(events.length!==1)throw Error('Source receipt must contain exactly one bridge send.');
  const e=events[0].args;
  if(!same(e.sender,record.payer||record.account)||!same(e.recipient,meta.recipient)||!same(e.composer,meta.composer)||String(e.destinationEid)!==String(meta.destinationEid)||!same(e.actionHash,meta.actionHash)||e.amountSent>BigInt(meta.amount)||e.amountSent<BigInt(meta.minimum)||e.amountReceived<BigInt(meta.minimum))throw Error('Source bridge event differs from the reviewed sender, recipient, lane or asset terms.');
  if(!same(await source.composer(block),meta.composer)||String(await source.destinationEid(block))!==String(meta.destinationEid))throw Error('Source lane immutable identity differs.');
  record.crosschain={status:'Source debit confirmed; destination execution pending independent verification',guid:e.guid,sourceHash:receipt.hash,sourceBlockHash:receipt.blockHash,destinationChainId:String(meta.destinationChainId),composer:meta.composer,recipient:e.recipient,amountSent:String(e.amountSent),amountReceived:String(e.amountReceived),destinationVerified:false};return record.crosschain;
 }
 if(['crosschain-retry','crosschain-refund'].includes(record.kind)){
  if(!same(inner.to,meta.composer))throw Error('Destination request identity changed.');
  const composer=await verifyBridgeContract(provider,meta.composer,'AnimaOFTComposer',receipt.blockNumber);
  const wanted=record.kind==='crosschain-refund'?['BridgeRefunded']:['BridgeExecuted','BridgeDeferred'];
  const events=receipt.logs.filter(log=>same(log.address,meta.composer)).map(log=>{try{return composer.interface.parseLog(log)}catch{return null}}).filter(event=>wanted.includes(event?.name)&&same(event.args.guid,meta.guid));
  if(events.length!==1)throw Error('Expected destination operation receipt is missing.');
  const delivery=await composer.deliveries(meta.guid,block);
  if(!same(delivery.recipient,meta.recipient)||String(delivery.amount)!==String(meta.expectedAmount)||!same(delivery.actionHash,meta.actionHash))throw Error('Destination delivery differs from the reviewed credit.');
  const event=events[0];
  if(record.kind==='crosschain-refund'&&(!same(event.args.recipient,meta.recipient)||String(event.args.amount)!==String(meta.expectedAmount)||delivery.status!==3n))throw Error('Destination refund receipt differs from the committed credit.');
  record.crosschain={guid:meta.guid,destinationHash:receipt.hash,destinationBlockHash:receipt.blockHash,destinationVerified:true,status:delivery.status===1n?'Destination retry deferred; credit remains recoverable':delivery.status===2n?'Destination executed':'Destination refunded',recipient:delivery.recipient,lockId:String(delivery.lockId)};return record.crosschain;
 }
 return null;
}

export async function recipientDeliveries(provider,{composerAddress,chainId,recipient,before,limit=20}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('Delivery pages contain 1–50 records.');
 if((await provider.getNetwork()).chainId!==BigInt(chainId))throw Error('Delivery reader is on another chain.');
 recipient=getAddress(recipient);const block=await provider.getBlock('latest'),at={blockTag:block.number};
 const composer=await verifyBridgeContract(provider,composerAddress,'AnimaOFTComposer',block.number);
 const tokenAddress=await composer.token(at),token=new Contract(tokenAddress,TOKEN,provider);
 const [count,decimals,symbol]=await Promise.all([composer.deliveryCount(recipient,at),token.decimals(at),token.symbol(at)]);
 if(Number(decimals)>36||symbol.length>32)throw Error('Unsupported destination token metadata.');
 const end=before===undefined||before===null||before===''?count:BigInt(before);
 if(end<0n||end>count)throw Error('The delivery cursor is outside this recipient history.');
 const start=end>BigInt(limit)?end-BigInt(limit):0n;
 const ids=await Promise.all(Array.from({length:Number(end-start)},(_,i)=>composer.deliveryId(recipient,end-1n-BigInt(i),at)));
 const records=await Promise.all(ids.map(async guid=>{
  const [delivery,original]=await Promise.all([composer.deliveries(guid,at),composer.deliveryAction(guid,at)]);
  const action=Object.fromEntries(['recipient','minimumReceived','lockAmount','deadline','start','cliff','end','linear'].map((key,index)=>[key,typeof original[index]==='bigint'?String(original[index]):original[index]]));
  if(!same(delivery.recipient,recipient)||delivery.status===0n||!same(actionHash(action),delivery.actionHash))throw Error('Delivery history and its committed action disagree.');
  return {guid,recipient,amount:String(delivery.amount),formattedAmount:formatUnits(delivery.amount,Number(decimals)),symbol,lockId:String(delivery.lockId),status:Number(delivery.status),statusLabel:['Unknown','Deferred — retry or refund','Executed','Refunded'][Number(delivery.status)],actionHash:delivery.actionHash,action};
 }));
 return {recipient,composerAddress:getAddress(composerAddress),chainId:String(chainId),count:String(count),nextCursor:start>0n?String(start):null,blockNumber:block.number,blockHash:block.hash,records,context:{composer,composerAddress:getAddress(composerAddress),destinationProvider:provider,destinationChain:String(chainId),destinationDecimals:Number(decimals),destinationSymbol:symbol}};
}

export async function prepareLaneDeployment(sourceProvider,destinationProvider,input){
 const sourceChain=(await sourceProvider.getNetwork()).chainId,destinationChain=(await destinationProvider.getNetwork()).chainId;
 if(sourceChain!==BigInt(input.sourceChainId)||destinationChain!==BigInt(input.destinationChainId)||sourceChain===destinationChain)throw Error('RPCs must match the two distinct selected chains.');
 const sourceDeployer=getAddress(input.sourceDeployer),destinationDeployer=getAddress(input.destinationDeployer),sourceOFT=getAddress(input.sourceOFT),destinationOFT=getAddress(input.destinationOFT),vault=getAddress(input.timeVault||ZeroAddress);
 if(await sourceProvider.getCode(sourceDeployer)!=='0x'||await destinationProvider.getCode(destinationDeployer)!=='0x')throw Error('Lane setup currently requires ordinary deployment wallets on each chain. Funding operations can use an NFT account after setup.');
 const a=new Contract(sourceOFT,OFT,sourceProvider),b=new Contract(destinationOFT,OFT,destinationProvider);
 const [endpointA,endpointB,versionA,versionB]=await Promise.all([a.endpoint(),b.endpoint(),a.oftVersion(),b.oftVersion()]);
 if(versionA[0]!=='0x02e49c2c'||versionB[0]!=='0x02e49c2c'||versionA[1]!==1n||versionB[1]!==1n)throw Error('This lane requires compatible OFT message version 1.');
 const sourceEid=await new Contract(endpointA,ENDPOINT,sourceProvider).eid(),destinationEid=await new Contract(endpointB,ENDPOINT,destinationProvider).eid();
 if(sourceEid===destinationEid)throw Error('The two OFTs must use distinct LayerZero endpoint IDs.');
 const sourcePeer=zeroPadValue(sourceOFT,32),destinationPeer=zeroPadValue(destinationOFT,32);
 if(!same(await a.peers(destinationEid),destinationPeer)||!same(await b.peers(sourceEid),sourcePeer))throw Error('The issuer has not configured the reciprocal OFT peers for this lane.');
 if(vault!==ZeroAddress){
  const block=await destinationProvider.getBlockNumber(),at={blockTag:block},contract=await verifySaleContract(destinationProvider,vault,'TimeVault',block),ledger=await verifySaleContract(destinationProvider,await contract.ledger(at),'WorldLedger',block);
  if(!(await ledger.isSealed(at))||!same(await ledger.vault(at),vault))throw Error('Choose the TimeVault installed in a sealed Genesis ledger.');
 }
 const [sourceNonce,destinationNonce]=await Promise.all([sourceProvider.getTransactionCount(sourceDeployer,'pending'),destinationProvider.getTransactionCount(destinationDeployer,'pending')]);
 const sourceAddress=getCreateAddress({from:sourceDeployer,nonce:sourceNonce}),composerAddress=getCreateAddress({from:destinationDeployer,nonce:destinationNonce});
 const source=await bridgeDeploymentPlan('AnimaOFTSource',[sourceOFT,destinationEid,composerAddress,destinationPeer],{chainId:sourceChain,sender:sourceDeployer,nonce:sourceNonce});
 const destination=await bridgeDeploymentPlan('AnimaOFTComposer',[endpointB,destinationOFT,sourceEid,zeroPadValue(sourceAddress,32),sourcePeer,vault],{chainId:destinationChain,sender:destinationDeployer,nonce:destinationNonce});
 source.meta.deployer=sourceDeployer;destination.meta.deployer=destinationDeployer;
 return {schema:'anima.oft-lane-deployment/1',sourceChain:String(sourceChain),destinationChain:String(destinationChain),sourceAddress,composerAddress,source,destination,sourceDeployer,destinationDeployer,sourceOFT,destinationOFT,timeVault:vault,notice:'Each component has an immutable counterpart. Review and deploy both exact plans; a changed nonce requires replanning before either contract is deployed.'};
}
