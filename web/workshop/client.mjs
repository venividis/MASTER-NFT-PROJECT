import {Contract,getAddress,keccak256,ZeroAddress,parseUnits,formatEther,toUtf8Bytes} from '../vendor/ethers.min.js';
import {LiveProtocol,VAULT_ABI,assetDetails} from '../genesis/live-protocol.mjs';
import {compileCalendar,validateCalendar} from './calendar.mjs';
import {WORKSHOP_CONTRACTS} from './contracts.mjs';
async function checked(provider,address,name){const a=WORKSHOP_CONTRACTS[name];address=getAddress(address);let code=(await provider.getCode(address)).slice(2);if(code.length/2!==a.bytes)throw Error(name+' does not match this build.');for(const m of a.masks)code=code.slice(0,m.start*2)+'0'.repeat(m.length*2)+code.slice((m.start+m.length)*2);if(keccak256('0x'+code)!==a.hash)throw Error(name+' code does not match this build.');return new Contract(address,a.abi,provider);}
export async function workshopContext(wallet,publisher){
  await wallet.assertOwner();const p=await checked(wallet.provider,publisher,'CommissionedCartridges');if(getAddress(await p.collection())!==wallet.collection)throw Error('Workshop belongs to another NFT collection.');
  const escrow=await checked(wallet.provider,await p.escrow(),'CommissionEscrow'),cartridges=await checked(wallet.provider,await p.cartridges(),'CartridgeRegistry'),binding=await checked(wallet.provider,await cartridges.artifact(),'ArtifactBinding');
  if(getAddress(await binding.collection())!==wallet.collection)throw Error('Cartridges belong to another NFT collection.');return {publisher:p,escrow,cartridges};
}
export async function snapshotLocks(wallet,vaultAddress,selected=[]){
  const revision=wallet.revision;await wallet.assertOwner();const epoch=String(await wallet.contract.sessionEpoch());
  await new LiveProtocol(wallet).module(vaultAddress,'vault',VAULT_ABI);
  const block=await wallet.provider.getBlock('latest'),tag={blockTag:block.number},vault=new Contract(vaultAddress,[...VAULT_ABI,'function lockCountOf(address) view returns(uint256)','function lockIdOf(address,uint256) view returns(uint256)'],wallet.provider);
  let ids=selected.map(String);if(!ids.length){const count=Number(await vault.lockCountOf(wallet.account,tag));if(count>48)throw Error('Select up to 48 public lock IDs for this instrument.');for(let n=0;n<count;n++)ids.push(String(await vault.lockIdOf(wallet.account,n,tag)));}
  if(ids.length>48||ids.some(id=>!/^\d+$/.test(id)))throw Error('Choose up to 48 integer lock IDs.');
  const locks=[];for(const id of ids){const l=await vault.lockInfo(id,tag);let decimals=18,symbol='ETH';if(l[2]!==ZeroAddress){const token=new Contract(l[2],['function decimals() view returns(uint8)','function symbol() view returns(string)'],wallet.provider);decimals=Number(await token.decimals(tag));symbol=await token.symbol(tag);}locks.push({id,beneficiary:l[1],asset:l[2],amount:String(l[3]),released:String(l[4]),start:Number(l[5]),cliff:Number(l[6]),end:Number(l[7]),linear:l[8],decimals,symbol});}
  await wallet.assertReviewContext(revision,epoch);
  if((await wallet.provider.getBlock(block.number))?.hash!==block.hash)throw Error('Snapshot block changed. Read the locks again.');
  return compileCalendar({schema:'anima.vault-snapshot/1',chainId:String(wallet.chainId),collection:wallet.collection,tokenId:String(wallet.tokenId),account:wallet.account,vault:getAddress(vaultAddress),block:{number:String(block.number),hash:block.hash,timestamp:block.timestamp},locks});
}
export async function fundCalendar(wallet,publisher,artifact,{worker,reviewer,asset=ZeroAddress,amount,days=7}){
  artifact=validateCalendar(artifact);const s=artifact.snapshot;if(s.account!==wallet.account||s.collection!==wallet.collection||s.chainId!==String(wallet.chainId)||s.tokenId!==String(wallet.tokenId))throw Error('Calendar belongs to another NFT or chain.');
  const {escrow}=await workshopContext(wallet,publisher),a=await assetDetails(wallet.provider,asset),raw=parseUnits(String(amount),a.decimals);
  if(raw<=0n||raw>(1n<<112n)-1n||!Number.isInteger(Number(days))||days<1||days>90)throw Error('Choose a positive fixed budget and 1–90 days.');
  const block=await wallet.provider.getBlock('latest'),submitBy=block.timestamp+Number(days)*86400;
  const data=escrow.interface.encodeFunctionData('fund',[getAddress(worker),getAddress(reviewer||wallet.account),a.address,raw,submitBy,artifact.terms]);
  const plan=await wallet.prepareUtility({target:escrow.target,asset:a.address,amount:a.address===ZeroAddress?'0':String(raw),value:a.address===ZeroAddress?formatEther(raw):'0',data});
  return {plan,submitBy,reviewBy:submitBy+3*86400,terms:artifact.terms,deliverable:artifact.deliverable};
}
export async function inspectCommission(wallet,publisher,id,artifact,{allowMismatch=false}={}){
  artifact=validateCalendar(artifact);const context=await workshopContext(wallet,publisher),work=await context.escrow.work(id);
  if(work.fundingAccount!==wallet.account||work.terms!==artifact.terms)throw Error('Commission does not match this NFT and request.');
  if(!allowMismatch&&(work.status===3n||work.status===4n))if(work.deliverable!==artifact.deliverable)throw Error('Submitted deliverable differs from the validated calendar.');
  return {...context,work};
}
export async function decideCalendar(wallet,publisher,id,artifact,approve){
  const {escrow,work}=await inspectCommission(wallet,publisher,id,artifact,{allowMismatch:!approve});if(work.reviewer!==wallet.account)throw Error('This commission requires its selected external evaluator.');
  return wallet.prepare({target:escrow.target,data:escrow.interface.encodeFunctionData('decide',[id,approve])});
}
export async function acquireCalendar(wallet,publisher,id,artifact){
  artifact=validateCalendar(artifact);const {publisher:p,work}=await inspectCommission(wallet,publisher,id,artifact);if(work.status!==4n)throw Error('Accept the submitted work before acquiring its cartridge.');
  return wallet.prepare({target:p.target,data:p.interface.encodeFunctionData('acquire',[id,artifact.manifestJSON,toUtf8Bytes(artifact.html)])});
}
