import {getAddress,keccak256,AbiCoder} from '../vendor/ethers.min.js';
export const REHEARSAL_SCHEMA='anima.rehearsal/1';
export function publicIntent(plan){
  if(plan.execution==='personal'||!plan.transaction||!plan.collection)throw Error('Rehearsal currently supports public NFT-account swaps and vault operations.');
  const t=plan.transaction;
  const intent={schema:REHEARSAL_SCHEMA,chainId:String(plan.chainId),collection:getAddress(plan.collection),tokenId:String(plan.tokenId),owner:getAddress(t.from),account:getAddress(t.to),epoch:String(plan.epoch),transaction:{to:getAddress(t.to),from:getAddress(t.from),data:t.data,value:String(t.value||0)}};
  if(!/^0x(?:[a-f0-9]{2})+$/i.test(t.data)||t.data.length>32770||BigInt(intent.transaction.value)!==0n)throw Error('Invalid public rehearsal transaction.');
  return intent;
}
export function intentHash(i){return keccak256(AbiCoder.defaultAbiCoder().encode(['string','uint256','address','uint256','address','address','uint256','bytes32','uint256'],[REHEARSAL_SCHEMA,i.chainId,i.collection,i.tokenId,i.owner,i.account,i.epoch,keccak256(i.transaction.data),i.transaction.value]));}
