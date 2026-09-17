/** Trusted chain adapter. Untrusted frames receive none of this object. */
import * as sdk from '../../packages/modules/sdk.mjs';
import { Contract, Interface, formatEther, getAddress, keccak256, toUtf8Bytes } from '../vendor/ethers.min.js';
import { LiveProtocol } from '../genesis/live-protocol.mjs';
import { sameAuthority, boundedJSON } from './host.mjs';
import { parseJournalPacket, prepareJournal } from './journal.mjs';
const zero=sdk.ZERO_HASH;
const clean=value=>JSON.parse(JSON.stringify(value,(_,item)=>typeof item==='bigint'?item.toString():item));
export class RegistryAdapter {
 constructor(wallet, config){this.wallet=wallet;this.config={...config,registry:getAddress(config.registry)};this.request=value=>wallet.raw.request(value);this.snapshot=null;}
 async context(){
  const w=this.wallet;await w.assertOwner();
  if(String(w.chainId)!==String(this.config.chainId)||w.collection.toLowerCase()!==this.config.collection.toLowerCase()||String(w.tokenId)!==String(this.config.tokenId))throw Error('Connected NFT or chain differs from the workbench selection.');
  const read=await sdk.readRegistry({request:this.request,registry:this.config.registry,tokenId:String(w.tokenId),chainId:String(w.chainId),limit:16});
  if(read.collection.toLowerCase()!==w.collection.toLowerCase()||read.account.toLowerCase()!==w.account.toLowerCase()||read.owner.toLowerCase()!==w.address.toLowerCase()||read.currentOwner.toLowerCase()!==read.owner.toLowerCase())throw Error('Registry identity or current NFT custody does not match.');
  this.snapshot=read;return {...clean(read),identity:{chainId:String(read.chainId),registry:read.registry.toLowerCase(),collection:read.collection.toLowerCase(),tokenId:String(read.tokenId),account:read.account.toLowerCase(),owner:read.owner.toLowerCase(),epoch:String(read.epoch)}};
 }
 async fresh(expected,releaseId,moduleKey){
  const current=await this.context();if(!sameAuthority(expected,current.identity))throw Error('NFT ownership or custody epoch changed.');
  if(releaseId){const installed=await this.installation(moduleKey,current);if(!installed.enabled||installed.releaseId.toLowerCase()!==releaseId.toLowerCase())throw Error('This release is no longer the enabled module.');}
  return current.identity;
 }
 async installation(moduleKey,context=this.snapshot){
  if(!context)context=await this.context();const result=await sdk.readCall(this.request,context.snapshot,context.registry,sdk.TOKEN_REGISTRY_ABI,'installation',[context.tokenId,moduleKey]);
  const i=result[0];return{moduleKey,releaseId:i.releaseId,stateHead:i.stateHead,enabled:i.enabled,epoch:String(i.epoch)};
 }
 async catalogEntries(releaseIds,context){
  if(!Array.isArray(releaseIds)||releaseIds.length>16)throw Error('Invalid release catalog page.');
  const catalog=[];
  for(const releaseId of releaseIds){
   try{
    const entry=await sdk.readRelease({request:this.request,registry:context.releases,releaseId,chainId:context.chainId,snapshot:context.snapshot});
    catalog.push(clean({releaseId,moduleKey:entry.moduleKey,manifest:entry.manifest}));
   }catch(error){
    // Publication is permissionless and the contract preserves opaque manifest
    // bytes. One unsupported publisher must not hide the rest of the NFT page.
    catalog.push({releaseId,invalid:true,moduleKey:null,manifest:null,error:String(error?.message??'Release metadata could not be verified.').slice(0,240)});
   }
  }
  return catalog;
 }
 async refresh({catalogCursor=0,moduleCursor=0,historyCursor=0}={}){
  const c=await this.context(),page=await sdk.readRegistry({request:this.request,registry:c.registry,tokenId:c.tokenId,chainId:c.chainId,snapshot:c.snapshot,cursor:moduleCursor,historyCursor,limit:16});
  const result=await sdk.readCall(this.request,c.snapshot,c.releases,sdk.RELEASE_REGISTRY_ABI,'catalog',[catalogCursor,16]);
  const count=await sdk.readCall(this.request,c.snapshot,c.releases,sdk.RELEASE_REGISTRY_ABI,'releaseCount');
  const catalog=await this.catalogEntries(result[0],c);
  await sdk.assertSnapshot(this.request,c.snapshot);return {...c,modules:clean(page.modules),history:clean(page.history),catalog,cursors:{catalog:Number(result[1]),modules:Number(page.next),history:Number(page.historyNext)},counts:{catalog:Number(count[0]),modules:Number(page.moduleCount),history:Number(page.historyCount)}};
 }
 async recover(releaseId){const c=await this.context(),recovered=await sdk.recoverRelease({request:this.request,registry:c.releases,releaseId,chainId:c.chainId,snapshot:c.snapshot});await this.fresh(c.identity);return recovered;}
 async savedState(recovered,{stateHead}={}){
  const c=await this.context(),installation=await this.installation(recovered.moduleKey,c),head=stateHead===undefined?installation.stateHead:sdk.hashValue(stateHead);
  if(head===zero)return{installation,value:{},head:zero};
  const state=await sdk.recoverState({request:this.request,stateStore:c.stateStore,stateId:head,chainId:c.chainId,snapshot:c.snapshot,collection:c.collection,tokenId:c.tokenId,moduleKey:recovered.moduleKey});
  if(stateHead!==undefined&&state.record.schema!==recovered.manifest.stateSchema)throw Error('Historical snapshot schema differs from the selected release.');
  const value=boundedJSON(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(state.bytes)),65536);
  await this.fresh(c.identity);
  return{installation,value,head,schema:state.record.schema};
 }
 async intent(kind,recovered,{value={},nextStateHead}={}){
  const c=await this.context(),installation=await this.installation(recovered.moduleKey,c);let recipe;
  if(kind==='activate')recipe=sdk.encodeActivate(c,{releaseId:recovered.releaseId,expectedStateHead:installation.stateHead,nextStateHead:nextStateHead??installation.stateHead});
  else if(kind==='disable')recipe=sdk.encodeDisable(c,{moduleKey:recovered.moduleKey});
  else if(kind==='writeState'){
   // writeState uses the active release's schema onchain, so a draft for a
   // different selected edition must take the explicit stage/activate path.
   if(!installation.enabled||installation.releaseId.toLowerCase()!==recovered.releaseId.toLowerCase())throw Error('Select the enabled release before saving its state. Use a staged migration for another version.');
   if(recovered.input?.stateSchema!==recovered.manifest.stateSchema||recovered.manifest.stateSchema===zero)throw Error('The selected state schema does not match the verified active release.');
   recipe=sdk.encodeWriteState(c,{moduleKey:recovered.moduleKey,bytes:new TextEncoder().encode(JSON.stringify(boundedJSON(value,32768)))});
  }
  // State is ordinary bounded JSON, including finite decimal coordinates/audio
  // values. Integer-only canonical encoding belongs to release manifests.
  else if(kind==='stageState')recipe=sdk.encodeStageState(c,{moduleKey:recovered.moduleKey,stateSchema:recovered.manifest.stateSchema,bytes:new TextEncoder().encode(JSON.stringify(boundedJSON(value,32768)))});
  else throw Error('Unknown module registry action.');
  return clean({kind,recipe,releaseId:recovered.releaseId,moduleKey:recovered.moduleKey,stateSchema:recovered.manifest.stateSchema,description:recipe.description,permissions:recovered.manifest.capabilities,...(['writeState','stageState'].includes(kind)?{state:value}:{}),identity:c.identity});
 }
 async prepare(intent){
  if(intent.kind==='journal'){
   this.wallet.plan=null;
   let mode;
   if(intent.privacyMode==='encrypted'){
    const packet=parseJournalPacket(intent.text);
    if(!sameAuthority(packet.header,intent.identity))throw Error('The encrypted journal packet belongs to a different NFT or custody epoch.');
    mode=1;
   }else if(intent.privacyMode==='public'){
    await prepareJournal({mode:'public',text:intent.text});mode=0;
   }else throw Error('Choose public or encrypted journal publication.');
   const memory=await new LiveProtocol(this.wallet).memory(intent.ledger);
   const data=memory.interface.encodeFunctionData('appendPersonal',[this.wallet.tokenId,0,mode,true,await memory.head(this.wallet.tokenId),toUtf8Bytes(intent.text)]);
   return this.wallet.preparePersonal({target:memory.target,data});
  }
  if(intent.kind==='module-proposal')return this.wallet.prepare({target:intent.proposal.to,value:formatEther(BigInt(intent.proposal.value)),data:intent.proposal.data});
  const outer=new Interface(sdk.ACCOUNT_ABI).parseTransaction({data:intent.recipe.data});
  if(outer.name!=='execute'||intent.recipe.to.toLowerCase()!==this.wallet.account.toLowerCase()||BigInt(intent.recipe.value)!==0n)throw Error('The SDK recipe does not target this NFT account.');
  return this.wallet.prepare({target:outer.args[0],value:formatEther(outer.args[1]),data:outer.args[2]});
 }
 async send(prepared,intent){
  if(this.wallet.plan!==prepared)throw Error('The wallet review changed. Prepare again.');
  if(intent.kind==='module-proposal')await this.fresh(intent.identity,intent.releaseId,intent.moduleKey);
  const receipt=await this.wallet.send();let stagedStateId;
  if(intent.kind==='stageState'){
   const c=await this.context(),abi=new Interface(['event StateStaged(bytes32 indexed id,bytes32 indexed namespace,bytes32 indexed parent,bytes32 schema,uint64 epoch,bytes32 dataHash)']);
   for(const log of receipt.logs??[]){if(log.address.toLowerCase()!==c.stateStore.toLowerCase())continue;try{const event=abi.parseLog(log);if(event?.name==='StateStaged'&&event.args.schema===intent.stateSchema)stagedStateId=event.args.id;}catch{}}
   if(!stagedStateId)throw Error('Transaction mined, but the staged state receipt was not recovered. Refresh history before another action.');
  }
  return{...receipt,stagedStateId};
 }
}
