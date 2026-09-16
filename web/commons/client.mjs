import {Contract,ContractFactory,getAddress,getCreateAddress,keccak256,ZeroAddress} from '../vendor/ethers.min.js';
import {PrivacyClient} from '../extensions/privacy.mjs';
import {COMMONS_ARTIFACTS} from './artifacts.mjs';

const STORAGE='anima.commons.deployments.v1';
const lower=x=>String(x).toLowerCase();
const number=(x,label)=>{const n=Number(x);if(!Number.isSafeInteger(n)||n<0)throw Error(`Invalid ${label}.`);return n;};
const roomId=x=>{const n=BigInt(x);if(n<=0n)throw Error('Choose a positive group number.');return n;};
const currentKey=chain=>chain?.address?`${chain.chainId}:${lower(chain.address)}`:'';
function saved(storage){try{return JSON.parse(storage?.getItem(STORAGE)||'{}');}catch{return {};}}

/** Check executable bytecode and every repeated immutable, including the actual key registry. */
export async function verifyCommonsContract(provider,address,name,keysAddress){
 address=getAddress(address);const artifact=COMMONS_ARTIFACTS[name];if(!artifact)throw Error('Unknown communication contract.');
 let code=(await provider.getCode(address)).slice(2).toLowerCase();if(code.length!==artifact.bytes*2)throw Error(`${name} runtime does not match this NFT edition.`);
 for(const group of artifact.immutableGroups){
  let expected;
  for(const mask of group){const word=code.slice(mask.start*2,(mask.start+mask.length)*2);if(expected!==undefined&&word!==expected)throw Error(`${name} has inconsistent immutable values.`);expected=word;}
  if(name==='EpochGroupChat'&&keysAddress&&expected!==lower(getAddress(keysAddress)).slice(2).padStart(64,'0'))throw Error('This conversation contract uses a different encryption-key registry.');
  for(const mask of group)code=code.slice(0,mask.start*2)+'0'.repeat(mask.length*2)+code.slice((mask.start+mask.length)*2);
 }
 if(keccak256('0x'+code)!==artifact.normalizedHash)throw Error(`${name} runtime does not match this NFT edition.`);
 const contract=new Contract(address,artifact.abi,provider);
 if(name==='EpochGroupChat'&&keysAddress&&lower(await contract.keys())!==lower(keysAddress))throw Error('Conversation key registry mismatch.');
 return contract;
}

/** Existing ANIMA encryption, real contracts, and the shared wallet review/receipt lifecycle.
 * Only public deployment addresses and receipt metadata are persisted. Keys/text stay in memory.
 */
export class CommonsClient {
 constructor({chain,storage,onLock=()=>{}}){
  if(!chain)throw Error('A wallet transaction controller is required.');
  if(storage===undefined){try{storage=globalThis.localStorage;}catch{storage=null;}}
  this.chain=chain;this.storage=storage;this.deployments=saved(storage);this.onLock=onLock;this.revision=0;this.binding='';this.config={};this.privacy=null;
  this.walletChanged=()=>{this.lock();this.binding='';this.config={};};
 }
 context(){return {key:currentKey(this.chain),revision:this.revision,provider:this.chain.provider};}
 async assert(context){await this.chain.assertContext();if(!context.key||context.key!==currentKey(this.chain)||context.revision!==this.revision||context.provider!==this.chain.provider)throw Error('Private operation cancelled because the wallet or encryption identity changed.');}
 get configured(){return !!this.privacy&&this.binding===currentKey(this.chain);}
 get unlocked(){return this.configured&&!!this.privacy.identity;}
 get publicKey(){return this.unlocked?this.privacy.identity.publicKey:null;}
 deployment(){return {...(this.deployments[String(this.chain.chainId)]||{})};}
 persist(){try{this.storage?.setItem(STORAGE,JSON.stringify(this.deployments));return true;}catch{return false;}}
 attachWallet(){if(this.raw===this.chain.raw)return;for(const e of ['accountsChanged','chainChanged','disconnect'])this.raw?.removeListener?.(e,this.walletChanged);this.raw=this.chain.raw;for(const e of ['accountsChanged','chainChanged','disconnect'])this.raw?.on?.(e,this.walletChanged);}
 lock(){++this.revision;this.privacy?.lock();this.onLock();this.chain.invalidate();}
 destroy(){this.lock();for(const e of ['accountsChanged','chainChanged','disconnect'])this.raw?.removeListener?.(e,this.walletChanged);this.raw=null;}
 async configure(input=this.deployment()){
  await this.chain.assertContext();this.attachWallet();const context=this.context(),keysAddress=getAddress(input.keys),fromBlock=number(input.fromBlock??0,'deployment block');
  const keys=await verifyCommonsContract(this.chain.provider,keysAddress,'PrivacyKeys');
  const chat=input.chat?await verifyCommonsContract(this.chain.provider,input.chat,'EpochGroupChat',keysAddress):null;
  await this.assert(context);const config={keys:keysAddress,chat:chat?await chat.getAddress():null,fromBlock};
  const same=this.binding===context.key&&lower(this.config.keys)===lower(config.keys)&&lower(this.config.chat)===lower(config.chat);
  if(!same){this.lock();this.privacy=chat?new PrivacyClient({chainId:this.chain.chainId,owner:this.chain.address,keys,chat}):null;}
  this.config=config;this.binding=context.key;this.deployments[String(this.chain.chainId)]={...config};this.persist();return {...config};
 }
 requireChat(){if(!this.configured)throw Error('Configure the verified encryption and conversation contracts first.');return this.privacy;}
 async newIdentity(){const p=this.requireChat();this.lock();const context=this.context();await p.newIdentity();await this.assert(context);return p.identity.publicKey;}
 async backup(passphrase){const p=this.requireChat(),context=this.context(),backup=await p.backup(passphrase);await this.assert(context);return backup;}
 async restore(backup,passphrase){const p=this.requireChat();this.lock();const context=this.context();await p.restore(backup,passphrase);await this.assert(context);return p.identity.publicKey;}
 async identityStatus(){const p=this.requireChat(),context=this.context(),generation=await p.keys.generation(this.chain.address);const registered=generation>0n?await p.keys.keyOf(this.chain.address):null;await this.assert(context);return {generation:String(generation),registered,unlocked:!!p.identity,matches:!!p.identity&&lower(registered)===lower(p.identity.publicKey)};}
 async prepareDeploy(name){
  if(!['PrivacyKeys','EpochGroupChat'].includes(name))throw Error('Unknown communication contract.');await this.chain.assertContext();this.attachWallet();const context=this.context(),artifact=COMMONS_ARTIFACTS[name];
  if(keccak256(artifact.bytecode)!==artifact.creationHash)throw Error('Communication deployment integrity check failed.');
  const args=[];if(name==='EpochGroupChat'){if(!this.config.keys)throw Error('Deploy or verify the encryption-key registry first.');await verifyCommonsContract(this.chain.provider,this.config.keys,'PrivacyKeys');args.push(this.config.keys);}
  if(await this.chain.provider.getCode(this.chain.address)!=='0x')throw Error('This deployment flow requires an ordinary signing wallet.');
  const request=await new ContractFactory(artifact.abi,artifact.bytecode).getDeployTransaction(...args),nonce=await this.chain.provider.getTransactionCount(this.chain.address,'pending');request.nonce=nonce;
  const predictedAddress=getCreateAddress({from:this.chain.address,nonce});await this.assert(context);
  return this.chain.prepareExternal({kind:'commons-deploy',request,meta:{commonsContract:name,predictedAddress,keys:this.config.keys||null},summary:{purpose:`Deploy ${name==='PrivacyKeys'?'encryption-key registry':'encrypted conversations'}`,contract:name,predictedAddress,creationHash:artifact.creationHash,compiler:artifact.compiler}});
 }
 async recoverDeployments(){
  await this.chain.assertContext();const records=this.chain.records.filter(r=>r.status==='confirmed'&&r.kind==='commons-deploy'&&Number(r.chainId)===Number(this.chain.chainId)&&lower(r.account)===lower(this.chain.address));
  let config=this.deployment();for(const record of records){const name=record.meta.commonsContract;if(!record.contractAddress||lower(record.contractAddress)!==lower(record.meta.predictedAddress))continue;await verifyCommonsContract(this.chain.provider,record.contractAddress,name,record.meta.keys);
   if(name==='PrivacyKeys'){if(!config.keys)config={keys:record.contractAddress,fromBlock:record.blockNumber};}
   else if(name==='EpochGroupChat'&&lower(config.keys)===lower(record.meta.keys)&&!config.chat)config={...config,chat:record.contractAddress};
  }
  if(config.keys)return this.configure(config);return null;
 }
 async prepare(action,{room,recipient,text}={}){
  const p=this.requireChat(),context=this.context();let transaction,purpose,description;const id=room===undefined?undefined:roomId(room);
  const latest=await this.chain.provider.getBlock('latest'),deadline=BigInt(latest.timestamp)+7n*86400n-60n;
  switch(action){
   case 'register':transaction=await p.register();purpose='Register encryption public key';description='A replaced key requires each group manager to rotate its epoch. Preserve older encrypted backups to read historical messages.';break;
   case 'create':transaction=await p.createRoom();purpose='Create encrypted group';description='You manage the group. Invite recipients, wait for acceptance, and rotate keys before messaging.';break;
   case 'invite':transaction=await p.invite(id,getAddress(recipient),deadline);purpose=`Invite member to group ${id}`;description='Invitation expires in seven days. The recipient must accept with their wallet.';break;
   case 'revoke':transaction=await p.chat.revokeInvite.populateTransaction(id,getAddress(recipient));purpose=`Revoke group ${id} invitation`;break;
   case 'join':transaction=await p.join(id);purpose=`Accept group ${id} invitation`;description='Membership becomes public. Posting pauses until the manager distributes a fresh epoch key.';break;
   case 'remove':transaction=await p.remove(id,getAddress(recipient));purpose=`Remove group ${id} member`;description='Old messages remain available to holders of old keys. Rotate keys before future messages.';break;
   case 'leave':transaction=await p.leave(id);purpose=`Leave group ${id}`;break;
   case 'close':transaction=await p.chat.close.populateTransaction(id);purpose=`Permanently close group ${id}`;description='Existing history remains. Closing cannot be undone.';break;
   case 'rotate':{const members=await this.members(id);transaction=(await p.rotate(id,members)).transaction;purpose=`Rotate group ${id} encryption keys`;description=`Fresh encrypted key packages for all ${members.length} accepted members.`;break;}
   case 'post':transaction=await p.post(id,text);purpose=`Send encrypted message to group ${id}`;description='Only authenticated padded ciphertext enters the transaction. Sender, group, timing and approximate size remain public.';break;
   default:throw Error('Unknown conversation action.');
  }
  await this.assert(context);
  return this.chain.prepareExternal({kind:'commons-action',request:transaction,meta:{commonsAction:action,room:id?.toString(),chat:this.config.chat},summary:{purpose,description,group:id?.toString(),recipient:recipient?getAddress(recipient):undefined}});
 }
 async group(room){
  const p=this.requireChat(),context=this.context(),id=roomId(room),[r,member,invitation,count,latest]=await Promise.all([p.chat.rooms(id),p.chat.member(id,this.chain.address),p.chat.invitations(id,this.chain.address),p.chat.messageCount(id),this.chain.provider.getBlock('latest')]);
  if(lower(r.manager)===lower(ZeroAddress))throw Error('This group does not exist.');await this.assert(context);
  return {id:String(id),manager:r.manager,isManager:lower(r.manager)===lower(this.chain.address),epoch:String(r.epoch),members:Number(r.count),member,closed:r.closed,dirty:r.dirty,messageCount:Number(count),invited:!member&&!r.closed&&invitation>BigInt(latest.timestamp),invitation:String(invitation)};
 }
 /** Bounded, resumable room discovery avoids depending on an off-chain indexer. */
 async groups({before,limit=24}={}){
  const p=this.requireChat(),context=this.context(),total=BigInt(await p.chat.roomCount());let cursor=before===undefined?total:BigInt(before);if(cursor>total)cursor=total;
  const size=Math.min(48,Math.max(1,number(limit,'group page size'))),groups=[];let scanned=0;
  while(cursor>0n&&scanned<size){const batch=[];for(let i=0;i<6&&cursor>0n&&scanned<size;i++,cursor--,scanned++)batch.push(this.group(cursor));for(const group of await Promise.all(batch))if(group.member||group.invited||group.isManager)groups.push(group);}
  await this.assert(context);return {groups,next:String(cursor),total:String(total),scanned};
 }
 async members(room){
  const p=this.requireChat(),context=this.context(),id=roomId(room),r=await p.chat.rooms(id);if(lower(r.manager)===lower(ZeroAddress))throw Error('This group does not exist.');
  const end=await this.chain.provider.getBlockNumber(),start=this.config.fromBlock??0,filter=p.chat.filters.Membership(id);let requests=0;
  const scan=async(a,b)=>{if(a>b)return [];if(++requests>128)throw Error('The RPC needs a narrower event scan. Enter the conversation deployment block in Setup.');try{return await p.chat.queryFilter(filter,a,b);}catch(e){if(b-a<1000)throw e;const middle=Math.floor((a+b)/2);return [...await scan(a,middle),...await scan(middle+1,b)];}};
  const events=await scan(start,end),candidates=new Set([lower(r.manager),...events.map(e=>lower(e.args.identity))]);
  const members=[];for(const who of candidates)if(await p.chat.member(id,who))members.push(getAddress(who));
  if(members.length!==Number(r.count))throw Error('Complete membership could not be recovered. Check the deployment block and RPC; no partial rotation was prepared.');
  await this.assert(context);return members.sort((a,b)=>lower(a).localeCompare(lower(b)));
 }
 async rotationRequired(room,members){
  const p=this.requireChat(),context=this.context(),id=roomId(room),r=await p.chat.rooms(id);let required=r.dirty||r.epoch===0n;
  if(!required){const statuses=await Promise.all(members.map(async who=>{const [registered,packaged]=await Promise.all([p.keys.generation(who),p.chat.packageGeneration(id,r.epoch,who)]);return registered===0n||registered!==packaged;}));required=statuses.some(Boolean);}
  await this.assert(context);return required;
 }
 async history(room,{before,limit=24}={}){
  const p=this.requireChat(),context=this.context(),id=roomId(room),total=number(await p.chat.messageCount(id),'message count'),end=before===undefined?total:Math.min(total,number(before,'message index')),start=Math.max(0,end-Math.min(48,Math.max(1,number(limit,'history page size')))),messages=[];
  for(let index=start;index<end;index++){
   try{const m=await p.readMessage(id,index);await this.assert(context);messages.push({index,...m,readable:true});}
   catch(error){await this.assert(context);const m=await p.chat.messageOf(id,index);messages.push({index,sender:m.sender,epoch:String(m.epoch),sequence:String(m.sequence),readable:false,reason:'This encryption identity cannot authenticate or open this historical epoch.'});}
  }
  await this.assert(context);return {messages,next:start,total};
 }
}
