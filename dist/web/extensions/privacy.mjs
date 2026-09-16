/** Callable privacy SDK. Contracts use ethers-compatible read/populateTransaction methods.
 * Every returned transaction is unsigned. Caller must show review and obtain the wallet signature.
 */
import {abiEncode,bytesOf,hexOf,keccak256} from '../evm.mjs';
import {createIdentity,contextBytes,randomBytes,memoryCommitment,encodePrivate,decodePrivate,sealTo,openFrom,epochCommitment,encryptMessage,decryptMessage,exportIdentity,importIdentity} from './privacy/crypto.mjs';
export {createIdentity,exportIdentity,importIdentity};
const low = x=>String(x).toLowerCase();
const call = (contract,method,args) => contract[method].populateTransaction(...args);
// Public operational fields only. Encrypted memory/message flows live in mountPrivacyDesk.
export const ACTIONS = [
 {id:'F04-configure',label:'Configure authenticated transport',contract:'AuthenticatedStatePortal',method:'configureTransport',description:'Configurator only, before sealing. Pin registered libraries, explicit ULN DVNs/confirmations and executor. Uses ABI-encoded official ULN and ExecutorConfig tuples; no default DVN aliases accepted.',sender:'wallet',fields:[{name:'sendLibrary_',label:'Registered send library',type:'address'},{name:'receiveLibrary_',label:'Registered receive library',type:'address'},{name:'sendUln',label:'Encoded send ULN config',type:'bytes'},{name:'receiveUln',label:'Encoded receive ULN config',type:'bytes'},{name:'executorConfig',label:'Encoded executor config',type:'bytes'}]},
 {id:'F04-seal',label:'Seal authenticated transport',contract:'AuthenticatedStatePortal',method:'sealTransport',description:'Irreversibly fixes the reviewed libraries and explicit DVN/executor configuration. Enables observations; grants no wallet authority.',sender:'wallet',fields:[]},
 {id:'F04',label:'Queue an authenticated state snapshot',contract:'AuthenticatedStatePortal',method:'queue',description:'Captures a Bound NFT state for delayed cross-chain delivery. Remote observations do not carry wallet spending authority.',sender:'wallet',fields:[{name:'id',label:'NFT token ID',type:'uint256',default:'1'},{name:'expires',label:'Expiry (Unix seconds, within one hour)',type:'uint64'}]}
];
export class PrivacyClient {
 /** @param {{chainId:bigint|string|number,owner:string,keys:object,memory:object,chat:object,portal?:object,collection?:object,identity?:object}} config */
 constructor(config){Object.assign(this,config);this.epochKeys=new Map();this.revision=0;}
 async domain(contract){return [this.chainId,await contract.getAddress()];}
 async newIdentity(){const revision=++this.revision,identity=await createIdentity();if(revision!==this.revision)throw Error('Private operation cancelled because the identity was locked or changed.');this.identity=identity;this.epochKeys.clear();return this.identity.publicKey;}
 async register(){if(!this.identity)throw Error('Create or restore your encryption identity first.');return call(this.keys,'register',[this.identity.publicKey]);}
 async verifyIdentity(){if(!this.identity || low(await this.keys.keyOf(this.owner))!==low(this.identity.publicKey))throw Error('Encryption identity differs from your registered wallet key. Register or restore the correct key.');}
 async backup(passphrase){if(!this.identity)throw Error('No encryption identity loaded.');return exportIdentity(this.identity,passphrase);}
 async restore(backup,passphrase){const revision=++this.revision,identity=await importIdentity(backup,passphrase);if(revision!==this.revision)throw Error('Private operation cancelled because the identity was locked or changed.');this.identity=identity;this.epochKeys.clear();return this.identity.publicKey;}
 async publishMemory(tokenId,text){
  await this.verifyIdentity();const m=await this.memory.memoryOf(tokenId),salt=hexOf(randomBytes()),commitment=await memoryCommitment(text,salt);
  const domain=await this.domain(this.memory),context=contextBytes('published-memory',[...domain,tokenId,this.owner,BigInt(m.version)+1n]);
  const ciphertext=await sealTo(this.identity.publicKey,encodePrivate({text,salt}),context);
  return {transaction:await call(this.memory,'publish',[tokenId,commitment,ciphertext]),commitment};
 }
 async ownMemory(tokenId){
  await this.verifyIdentity();const m=await this.memory.memoryOf(tokenId);
  if(low(m.owner)!==low(this.owner))throw Error('Published memory belongs to an earlier owner. Accept their handover or publish your own memory.');
  const plain=decodePrivate(await openFrom(this.identity,m.ciphertext,contextBytes('published-memory',[...await this.domain(this.memory),tokenId,m.owner,m.version])));
  if(await memoryCommitment(plain.text,plain.salt)!==low(m.commitment))throw Error('Memory commitment mismatch.');return {record:m,...plain};
 }
 async proposeMemory(tokenId,recipient,deadline){
  if(this.collection && low(await this.collection.ownerOf(tokenId))!==low(this.owner))throw Error('Only the current NFT owner can offer a memory handover.');
  const {record:m,text,salt}=await this.ownMemory(tokenId),publicKey=await this.keys.keyOf(recipient),generation=await this.keys.generation(recipient);
  if(BigInt(generation)===0n)throw Error('Recipient must register their encryption public key first.');
  const secret=hexOf(randomBytes()),domain=await this.domain(this.memory);
  const receiptHash=keccak256(bytesOf(abiEncode(['string','uint256','address','uint256','address','address','uint64','uint64','bytes32'],['ANIMA_MEMORY_RECEIPT_V1',...domain,tokenId,this.owner,recipient,m.custodyEpoch,m.version,secret])));
  const context=contextBytes('memory-handover',[...domain,tokenId,this.owner,recipient,m.custodyEpoch,m.version,generation,deadline,m.commitment,receiptHash]);
  const envelope=await sealTo(publicKey,encodePrivate({text,salt,receiptSecret:secret}),context);
  return {transaction:await call(this.memory,'propose',[tokenId,recipient,deadline,receiptHash,envelope]),commitment:m.commitment};
 }
 async receiveMemory(offerId,{readOnly=false}={}){
  if(readOnly){if(!this.identity)throw Error('Restore your encryption identity before reading memory.');}else await this.verifyIdentity();
  const o=await this.memory.offerOf(offerId),domain=await this.domain(this.memory);
  if((o.consumed&&!readOnly)||low(o.to)!==low(this.owner))throw Error('This handover is consumed or addressed to someone else.');
  const context=contextBytes('memory-handover',[...domain,o.tokenId,o.from,o.to,o.custodyEpoch,o.memoryVersion,o.keyGeneration,o.deadline,o.commitment,o.receiptHash]);
  const plain=decodePrivate(await openFrom(this.identity,o.envelope,context));
  if(await memoryCommitment(plain.text,plain.salt)!==low(o.commitment))throw Error('Seller sent different memory. Ownership was not accepted.');
  const actual=keccak256(bytesOf(abiEncode(['string','uint256','address','uint256','address','address','uint64','uint64','bytes32'],['ANIMA_MEMORY_RECEIPT_V1',...domain,o.tokenId,o.from,o.to,o.custodyEpoch,o.memoryVersion,plain.receiptSecret])));
  if(actual!==low(o.receiptHash))throw Error('Receipt secret does not match this handover.');
  return {text:plain.text,tokenId:String(o.tokenId),...(readOnly?{}:{transaction:await call(this.memory,'accept',[offerId,plain.receiptSecret])})};
 }
 async readReceivedMemory(offerId){return this.receiveMemory(offerId,{readOnly:true});}
 async approveMemoryTransfer(tokenId){if(!this.collection)throw Error('Collection contract not configured.');return call(this.collection,'approve',[await this.memory.getAddress(),tokenId]);}
 async cancelMemory(offerId){return call(this.memory,'cancel',[offerId]);}
 async createRoom(){await this.verifyIdentity();return call(this.chat,'create',[]);}
 async invite(roomId,recipient,deadline){return call(this.chat,'invite',[roomId,recipient,deadline]);}
 async join(roomId){await this.verifyIdentity();return call(this.chat,'join',[roomId]);}
 async remove(roomId,recipient){this.epochKeys.clear();return call(this.chat,'remove',[roomId,recipient]);}
 async leave(roomId){this.epochKeys.clear();return call(this.chat,'leave',[roomId]);}
 async rotate(roomId,members){
  await this.verifyIdentity();const r=await this.chat.rooms(roomId),epoch=BigInt(r.epoch)+1n,domain=await this.domain(this.chat);
  const identities=[...new Set(members.map(low))].sort();if(identities.length!==Number(r.count))throw Error('Supply every currently accepted member, including the room manager.');
  const key=randomBytes(),commitment=await epochCommitment(key,contextBytes('epoch-key',[...domain,roomId,epoch])),generations=[],packages=[];
  try {for(const who of identities){if(!await this.chat.member(roomId,who))throw Error('A supplied identity has not accepted group membership.');
   const generation=await this.keys.generation(who);generations.push(generation);
   packages.push(await sealTo(await this.keys.keyOf(who),key,contextBytes('group-key-package',[...domain,roomId,epoch,who,generation,commitment])));
  }
  return {transaction:await call(this.chat,'rotate',[roomId,r.epoch,identities,generations,packages,commitment]),epoch:String(epoch)};
  }finally{key.fill(0);}
 }
 async openEpoch(roomId,epoch){
  const revision=this.revision;
  if(!this.identity)throw Error('Restore your encryption identity before reading messages.');
  const r=await this.chat.rooms(roomId),e=BigInt(epoch??r.epoch),domain=await this.domain(this.chat);
  const commitment=await this.chat.epochCommitments(roomId,e);
  const generation=await this.chat.packageGeneration(roomId,e,this.owner),envelope=await this.chat.packageOf(roomId,e,this.owner);
  if(envelope==='0x')throw Error('No key package exists for you in this membership epoch.');
  const key=await openFrom(this.identity,envelope,contextBytes('group-key-package',[...domain,roomId,e,this.owner,generation,commitment]));
  if(await epochCommitment(key,contextBytes('epoch-key',[...domain,roomId,e]))!==low(commitment)){key.fill(0);throw Error('Group key commitment mismatch.');}
  if(revision!==this.revision){key.fill(0);throw Error('Private operation cancelled because the identity was locked or changed.');}this.epochKeys.set(`${roomId}:${e}`,key);return {epoch:String(e)};
 }
 async post(roomId,text){
  await this.verifyIdentity();
  const r=await this.chat.rooms(roomId);if(r.dirty||r.closed)throw Error('Membership changed or room closed. The manager must rotate keys before further messages.');
  if(!this.epochKeys.has(`${roomId}:${r.epoch}`))await this.openEpoch(roomId);
  const sequence=await this.chat.nextSequence(roomId,r.epoch,this.owner),context=contextBytes('group-message',[...await this.domain(this.chat),roomId,r.epoch,this.owner,sequence]);
  const ciphertext=await encryptMessage(this.epochKeys.get(`${roomId}:${r.epoch}`),text,context);
  return call(this.chat,'post',[roomId,r.epoch,sequence,ciphertext]);
 }
 async readMessage(roomId,index){
  const m=await this.chat.messageOf(roomId,index);if(!this.epochKeys.has(`${roomId}:${m.epoch}`))await this.openEpoch(roomId,m.epoch);
  return {sender:m.sender,epoch:String(m.epoch),sequence:String(m.sequence),text:await decryptMessage(this.epochKeys.get(`${roomId}:${m.epoch}`),m.ciphertext,contextBytes('group-message',[...await this.domain(this.chat),roomId,m.epoch,m.sender,m.sequence]))};
 }
 async queuePortal(tokenId,expires){if(!this.portal)throw Error('Portal is not configured.');return call(this.portal,'queue',[tokenId,expires]);}
 async dispatchPortal(tokenId,options='0x'){if(!this.portal)throw Error('Portal is not configured.');const fee=await this.portal.quote(tokenId,options);return call(this.portal,'dispatch',[tokenId,options,{value:fee.nativeFee}]);}
 lock(){++this.revision;for(const key of this.epochKeys.values())key.fill(0);this.epochKeys.clear();this.identity=null;}
}
