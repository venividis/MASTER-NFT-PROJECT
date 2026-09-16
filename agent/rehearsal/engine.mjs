import {Contract,Interface,getAddress,ZeroAddress,keccak256} from 'ethers';
import {createFork} from './fork.mjs';
import {REHEARSAL_SCHEMA,intentHash} from '../../web/rehearsal/intent.mjs';
import {MARKET_ABI,VAULT_ABI,LEDGER_ABI} from '../../web/genesis/live-protocol.mjs';
const ACCOUNT=['function execute(address target,uint256 value,bytes data) payable returns(bytes)','function executeUtility(uint256 expectedNonce,uint48 deadline,address asset,address target,uint256 value,bytes data,uint256 allowanceAmount) payable returns(bytes)','function sessionEpoch() view returns(uint64)','function actionNonce() view returns(uint256)','function auditRoot() view returns(bytes32)','function mode() view returns(uint8)','function currentOwner() view returns(address)'];
const COLLECTION=['function accountOf(uint256) view returns(address)','function ownerOf(uint256) view returns(address)'];
const ERC20=['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function decimals() view returns(uint8)','event Transfer(address indexed from,address indexed to,uint256 value)','event Approval(address indexed owner,address indexed spender,uint256 value)'];
const same=(a,b)=>getAddress(a)===getAddress(b),unique=a=>[...new Set(a.map(getAddress))];
const scalar=x=>typeof x==='bigint'?String(x):x;
async function authority(account,collection,tokenId){return {owner:await collection.ownerOf(tokenId),epoch:String(await account.sessionEpoch()),nonce:String(await account.actionNonce()),mode:String(await account.mode()),auditRoot:await account.auditRoot()};}
async function describe(provider,i){
  if(i.schema!==REHEARSAL_SCHEMA||BigInt(i.transaction?.value||0)!==0n||!same(i.account,i.transaction.to)||!same(i.owner,i.transaction.from))throw Error('Invalid public NFT-account intent.');
  const collection=new Contract(getAddress(i.collection),COLLECTION,provider);
  if(!same(await collection.accountOf(i.tokenId),i.account)||!same(await collection.ownerOf(i.tokenId),i.owner))throw Error('NFT custody does not match the reviewed intent.');
  const account=new Contract(i.account,ACCOUNT,provider),before=await authority(account,collection,i.tokenId);
  if(before.epoch!==i.epoch||before.mode!=='0')throw Error('NFT authority changed or is no longer owner-controlled.');
  const call=new Interface(ACCOUNT).parseTransaction({data:i.transaction.data});
  if(!call||!['execute','executeUtility'].includes(call.name))throw Error('Unsupported account action.');
  const target=getAddress(call.args.target),data=call.args.data;
  const module=new Contract(target,['function ledger() view returns(address)'],provider),ledger=new Contract(await module.ledger(),LEDGER_ABI,provider);
  if(!same(await ledger.collection(),i.collection)||!await ledger.isSealed())throw Error('Module belongs to another collection or is unsealed.');
  let kind,operation,assets=[],lockId=null,vaultAddress=await ledger.vault(),fee=null;
  if(same(await ledger.market(),target)){
    operation=new Interface(MARKET_ABI).parseTransaction({data});if(operation?.name!=='swap')throw Error('Only market swaps are supported.');
    const [input,output,amount,minOut,deadline,identity,lockUntil]=operation.args;
    if(identity!==BigInt(i.tokenId)||minOut===0n)throw Error('Swap identity or minimum output is invalid.');
    const market=new Contract(target,['function FEE_BPS() view returns(uint256)'],provider);
    kind='swap';assets=[input,output];fee={basisPointsPerHop:Number(await market.FEE_BPS()),hops:input===ZeroAddress||output===ZeroAddress?1:2,location:'Retained in pool reserves',minimumOutput:String(minOut),deadline:String(deadline),inputAmount:String(amount),lockUntil:String(lockUntil)};
  }else if(same(vaultAddress,target)){
    operation=new Interface(VAULT_ABI).parseTransaction({data});
    if(operation?.name==='deposit'){
      const [asset,,beneficiary,,,,,identity]=operation.args;
      if(!same(beneficiary,i.account)||identity!==BigInt(i.tokenId))throw Error('Vault beneficiary must be this NFT account.');kind='lock';assets=[asset];
    }else if(operation?.name==='release'){
      kind='release';lockId=String(operation.args[0]);const v=new Contract(target,VAULT_ABI,provider),info=await v.lockInfo(lockId);
      if(!same(info[1],i.account))throw Error('Lock belongs to a different beneficiary.');assets=[info[2]];
    }else throw Error('Only vault deposits and releases are supported.');
  }else throw Error('Target is not an installed market or vault.');
  const addresses=unique([i.owner,i.account,target,vaultAddress]);assets=unique([ZeroAddress,...assets]);
  if(call.name==='executeUtility'&&call.args.asset!==ZeroAddress)assets=unique([...assets,call.args.asset]);
  return {kind,target,call,account,collection,before,assets,addresses,vaultAddress,lockId,fee,moduleCodeHash:keccak256(await provider.getCode(target))};
}
async function snapshot(provider,d,i){
  const balances=[],allowances=[];
  for(const asset of d.assets){
    const token=asset===ZeroAddress?null:new Contract(asset,ERC20,provider),decimals=token?Number(await token.decimals()):18;
    for(const address of d.addresses)balances.push({asset,address,decimals,value:String(token?await token.balanceOf(address):await provider.getBalance(address))});
    if(token)for(const holder of [i.account,d.target])for(const spender of unique([d.target,d.vaultAddress]).filter(x=>!same(x,holder)))allowances.push({asset,holder,spender,value:String(await token.allowance(holder,spender))});
  }
  const vault=new Contract(d.vaultAddress,[...VAULT_ABI,'function lockCount() view returns(uint256)'],provider),lockCount=String(await vault.lockCount());
  const lock=d.lockId?Array.from(await vault.lockInfo(d.lockId),scalar):null;
  return {balances,allowances,lockCount,lock,authority:await authority(d.account,d.collection,i.tokenId)};
}
export async function rehearse(upstream,input,{forkFactory=createFork}={}){
  const i=structuredClone(input);if(JSON.stringify(i).length>65536)throw Error('Intent exceeds the size limit.');
  if(!/^0x(?:[0-9a-f]{2})+$/i.test(i.transaction?.data||'')||i.transaction.data.length>32770)throw Error('Invalid calldata.');
  const chain=await upstream.request({method:'eth_chainId',params:[]});if(BigInt(chain)!==BigInt(i.chainId))throw Error('Source chain mismatch.');
  const block=await upstream.request({method:'eth_getBlockByNumber',params:['latest',false]});if(!block?.hash||!block.number)throw Error('A pinned source block is required.');
  const fork=await forkFactory(upstream,BigInt(block.number),BigInt(chain));
  try{
    const p=fork.provider,d=await describe(p,i),before=await snapshot(p,d,i);
    // Only the disposable fork receives impersonation and transaction RPCs.
    await p.send('anvil_impersonateAccount',[i.owner]);
    await p.send('evm_setNextBlockTimestamp',[Number(BigInt(block.timestamp))+1]);
    const hash=await p.send('eth_sendTransaction',[{from:i.owner,to:i.account,data:i.transaction.data,value:'0x0',gas:'0x989680'}]);
    let receipt;for(let n=0;n<100;n++){receipt=await p.getTransactionReceipt(hash);if(receipt)break;await new Promise(r=>setTimeout(r,20));}
    if(!receipt)throw Error('Fork execution did not produce a receipt.');
    const after=await snapshot(p,d,i),locks=[];
    if(d.lockId)locks.push({id:d.lockId,before:before.lock,after:after.lock});
    for(let id=BigInt(before.lockCount)+1n;id<=BigInt(after.lockCount);id++)locks.push({id:String(id),before:null,after:Array.from(await new Contract(d.vaultAddress,VAULT_ABI,p).lockInfo(id),scalar)});
    const canonical=await upstream.request({method:'eth_getBlockByNumber',params:[block.number,false]});if(canonical?.hash!==block.hash)throw Error('Source block changed during rehearsal. Repeat against the canonical chain.');
    return {schema:REHEARSAL_SCHEMA,intentHash:intentHash(i),chainId:String(BigInt(chain)),sourceBlock:{number:String(BigInt(block.number)),hash:block.hash,timestamp:String(BigInt(block.timestamp))},executedAt:Number(BigInt(block.timestamp))+1,createdAt:Date.now(),scope:'Disposable fork; no source-chain transaction submitted',status:receipt.status===1?'succeeded':'reverted',kind:d.kind,moduleCodeHash:d.moduleCodeHash,gas:{used:String(receipt.gasUsed),price:String(receipt.gasPrice),cost:String(receipt.gasUsed*receipt.gasPrice)},balances:after.balances.map((b,n)=>({...b,before:before.balances[n].value,after:b.value,delta:String(BigInt(b.value)-BigInt(before.balances[n].value))})),allowances:after.allowances.map((a,n)=>({...a,before:before.allowances[n].value,after:a.value})),authority:{before:before.authority,after:after.authority},locks,fees:d.fee,receipt:{hash:receipt.hash,blockNumber:receipt.blockNumber,logs:receipt.logs.map(l=>({address:l.address,topics:[...l.topics],data:l.data}))}};
  }finally{await fork.close();}
}
