import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import {BrowserProvider,Contract,ContractFactory,AbiCoder,ZeroAddress,ZeroHash,getCreateAddress,zeroPadValue,keccak256,toUtf8Bytes} from 'ethers';
import {compilePrivacy} from '../../scripts/lib/extensions-privacy.mjs';
import {PrivacyClient} from '../../web/extensions/privacy.mjs';
import {contextBytes,sealTo,openFrom,encodePrivate,decodePrivate,decryptMessage} from '../../web/extensions/privacy/crypto.mjs';

const fixture=`// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {PortalOrigin,PortalMessagingParams,PortalMessagingFee,PortalMessagingReceipt,PortalSetConfigParam,PortalUlnConfig,AuthenticatedStatePortal} from "contracts/src/extensions/privacy/AuthenticatedStatePortal.sol";
contract PrivacyEndpointFixture {
 uint32 public immutable eid; uint64 public nonce; bytes public payload; bytes32 public receiver; bytes32 public guid;
 mapping(address=>address) public sendLib; mapping(address=>address) public receiveLib;
 mapping(bytes32=>bytes) private configs;
 constructor(uint32 id){eid=id;}
 function quote(PortalMessagingParams calldata,address) external pure returns(PortalMessagingFee memory){return PortalMessagingFee(0,0);}
 function send(PortalMessagingParams calldata p,address) external payable returns(PortalMessagingReceipt memory){require(msg.value==0&&!p.payInLzToken);payload=p.message;receiver=p.receiver;guid=keccak256(abi.encode(eid,msg.sender,++nonce,p.message));return PortalMessagingReceipt(guid,nonce,PortalMessagingFee(0,0));}
 function isRegisteredLibrary(address lib) external view returns(bool){return lib.code.length>0;}
 function setSendLibrary(address oapp,uint32,address lib) external {require(msg.sender==oapp);sendLib[oapp]=lib;}
 function setReceiveLibrary(address oapp,uint32,address lib,uint256) external {require(msg.sender==oapp);receiveLib[oapp]=lib;}
 function getSendLibrary(address oapp,uint32) external view returns(address){return sendLib[oapp];}
 function getReceiveLibrary(address oapp,uint32) external view returns(address,bool){return(receiveLib[oapp],receiveLib[oapp]==address(0));}
 function isDefaultSendLibrary(address oapp,uint32) external view returns(bool){return sendLib[oapp]==address(0);}
 function setConfig(address oapp,address lib,PortalSetConfigParam[] calldata params) external {require(msg.sender==oapp);for(uint i;i<params.length;i++){bytes memory c=params[i].config;if(params[i].configType==2){PortalUlnConfig memory u=abi.decode(c,(PortalUlnConfig));if(u.optionalDVNCount==255)u.optionalDVNCount=0;c=abi.encode(u);}configs[keccak256(abi.encode(oapp,lib,params[i].eid,params[i].configType))]=c;}}
 function getConfig(address oapp,address lib,uint32 remote,uint32 kind) external view returns(bytes memory){return configs[keccak256(abi.encode(oapp,lib,remote,kind))];}
 function corruptSendLibrary(address oapp,address lib) external {sendLib[oapp]=lib;}
 // Local test relay deliberately exposes arbitrary delivery to exercise application authentication and replay checks.
 function deliver(address target,PortalOrigin calldata origin,bytes32 id,bytes calldata data) external {AuthenticatedStatePortal(target).lzReceive(origin,id,data,msg.sender,"");}
}
`;
const compiled=compilePrivacy({'test/privacy/Fixture.sol':{content:fixture}});
const artifact=name=>compiled[name]??JSON.parse(fs.readFileSync(new URL(`../../contracts/artifacts/${name}.json`,import.meta.url),'utf8'));
async function deploy(name,signer,args=[]){const a=artifact(name),c=await new ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c;}
async function chain(chainId=31337){const rpc=ganache.provider({logging:{quiet:true},wallet:{totalAccounts:6,defaultBalance:1000},chain:{chainId,hardfork:'shanghai'},miner:{blockGasLimit:30000000}}),provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;const signers=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));return {rpc,provider,signers,chainId};}
async function realCollection(c){
 const [admin,owner]=c.signers,router=await deploy('ProofRouter',admin,[await admin.getAddress()]),renderer=await deploy('OnchainRenderer',admin),registry=await deploy('OmnichainWitnessRegistry',admin,[await admin.getAddress()]);
 const collection=await deploy('IDontFuckingBelieveIt',admin,[await admin.getAddress(),await renderer.getAddress(),await router.getAddress(),await registry.getAddress(),await admin.getAddress(),500]);
 const factory=await deploy('SovereignAccountFactory',admin,[await collection.getAddress(),await router.getAddress()]);await (await collection.setAccountFactory(await factory.getAddress())).wait();
 const secret=keccak256(toUtf8Bytes(`privacy-local-${c.chainId}`)),address=await owner.getAddress();await (await collection.connect(owner).commitAwakening(await collection.commitmentFor(address,secret,address))).wait();await c.provider.send('evm_mine',[]);await c.provider.send('evm_mine',[]);await (await collection.connect(owner).revealAwakening(secret,address)).wait();
 return {collection,registry,account:new Contract(await collection.accountOf(1),artifact('SovereignAccount').abi,owner)};
}
const send=async(signer,transaction)=>{const tx=await signer.sendTransaction(transaction);return tx.wait();};
const rejects=async(fn)=>assert.rejects(async()=>{const result=await fn();if(result?.wait)await result.wait();});
async function clients(c,collection){
 const [admin,...users]=c.signers,keys=await deploy('PrivacyKeys',admin),chat=await deploy('EpochGroupChat',admin,[await keys.getAddress()]),memory=collection?await deploy('PrivateMemoryHandover',admin,[await collection.getAddress(),await keys.getAddress()]):null;
 const clients=[];for(const signer of users){const client=new PrivacyClient({chainId:c.chainId,owner:await signer.getAddress(),keys:keys.connect(signer),chat:chat.connect(signer),memory:memory?.connect(signer),collection:collection?.connect(signer)});await client.newIdentity();await send(signer,await client.register());clients.push(client);}return {keys,chat,memory,clients};
}

test('F02: real NFT transfers only after recipient decryption, content verification, consent and custody-bound receipt',async t=>{
 const c=await chain();t.after(()=>c.rpc.disconnect());const {collection,account}=await realCollection(c),{memory,clients: [alice,bob,charlie]}=await clients(c,collection);const [,a,b,d]=c.signers;
 const text='A private agent remembers the hidden blue garden.';
 const publication=await alice.publishMemory(1,text);assert.ok(!publication.transaction.data.includes(Buffer.from(text).toString('hex')));await send(a,publication.transaction);
 assert.equal((await alice.ownMemory(1)).text,text);await rejects(async()=>bob.ownMemory(1));
 const deadline=BigInt((await c.provider.getBlock('latest')).timestamp)+3600n;
 const offer=await alice.proposeMemory(1,bob.owner,deadline);assert.ok(!offer.transaction.data.includes(Buffer.from(text).toString('hex')));await send(a,offer.transaction);
 assert.equal(await collection.ownerOf(1),alice.owner);await rejects(async()=>charlie.receiveMemory(1));
 const receipt=await bob.receiveMemory(1);assert.equal(receipt.text,text);await rejects(async()=>send(b,receipt.transaction)); // exact-token approval is required
 await send(a,await alice.approveMemoryTransfer(1));
 const priorEpoch=await account.sessionEpoch();await send(b,receipt.transaction);
 assert.equal(await collection.ownerOf(1),bob.owner);assert.equal(await account.sessionEpoch(),priorEpoch+1n);
 assert.equal((await bob.readReceivedMemory(1)).text,text);
 await rejects(async()=>send(b,receipt.transaction));await rejects(async()=>alice.proposeMemory(1,charlie.owner,deadline));
 // Buyer rotates identity and creates genuinely new memory; old owner cannot read it.
 await bob.newIdentity();await send(b,await bob.register());const newText='The buyer alone chooses a fresh private future.';await send(b,(await bob.publishMemory(1,newText)).transaction);
 assert.equal((await bob.ownMemory(1)).text,newText);await rejects(async()=>alice.ownMemory(1));
 // A transfer away and back invalidates the old custody epoch, even if the address looks the same.
 await send(b,(await bob.proposeMemory(1,charlie.owner,deadline)).transaction);await send(b,await bob.approveMemoryTransfer(1));
 const stale=await charlie.receiveMemory(2);await (await collection.connect(b).transferFrom(bob.owner,alice.owner,1)).wait();await (await collection.connect(a).transferFrom(alice.owner,bob.owner,1)).wait();await (await collection.connect(b).approve(await memory.getAddress(),1)).wait();await rejects(async()=>send(d,stale.transaction));
});

test('F02: wrong plaintext and AEAD tampering fail before recipient can prepare acceptance',async t=>{
 const c=await chain();t.after(()=>c.rpc.disconnect());const {collection}=await realCollection(c),{memory,clients:[alice,bob]}=await clients(c,collection);const [,a]=c.signers;
 await send(a,(await alice.publishMemory(1,'The committed authentic memory.')).transaction);const deadline=BigInt((await c.provider.getBlock('latest')).timestamp)+3600n;
 await send(a,(await alice.proposeMemory(1,bob.owner,deadline)).transaction);
 const o=await memory.offerOf(1),domain=[c.chainId,await memory.getAddress()],ctx=contextBytes('memory-handover',[...domain,o.tokenId,o.from,o.to,o.custodyEpoch,o.memoryVersion,o.keyGeneration,o.deadline,o.commitment,o.receiptHash]);
 const plain=decodePrivate(await openFrom(bob.identity,o.envelope,ctx));plain.text='A substituted fake memory';
 const fake=await sealTo(bob.identity.publicKey,encodePrivate(plain),ctx);await (await memory.connect(a).propose(1,bob.owner,deadline,o.receiptHash,fake)).wait();
 await assert.rejects(async()=>bob.receiveMemory(2),/different memory/);
 const corrupted=o.envelope.slice(0,-2)+(o.envelope.endsWith('00')?'01':'00');await (await memory.connect(a).propose(1,bob.owner,deadline,o.receiptHash,corrupted)).wait();await rejects(async()=>bob.receiveMemory(3));
 assert.equal(await collection.ownerOf(1),alice.owner);
});

test('F05: group consent, epoch rotation, ciphertext transport, revocation, replay rejection and encrypted recovery',async t=>{
 const c=await chain();t.after(()=>c.rpc.disconnect());const {keys,chat,clients:[alice,bob,charlie]}=await clients(c);const [,a,b,d]=c.signers;
 await send(a,await alice.createRoom());await rejects(async()=>send(b,await bob.join(1)));
 await send(a,(await alice.rotate(1,[alice.owner])).transaction);await send(a,await alice.post(1,'A private first message.'));
 await rejects(async()=>bob.readMessage(1,0));
 const deadline=BigInt((await c.provider.getBlock('latest')).timestamp)+3600n;
 await send(a,await alice.invite(1,bob.owner,deadline));assert.equal(await chat.member(1,bob.owner),false);await send(b,await bob.join(1));
 await assert.rejects(async()=>alice.post(1,'blocked'),/Membership changed/);
 await rejects(async()=>alice.rotate(1,[alice.owner]));await send(a,(await alice.rotate(1,[alice.owner,bob.owner])).transaction);
 const message='Only the two invited friends can read this now.',tx=await alice.post(1,message);assert.ok(!tx.data.includes(Buffer.from(message).toString('hex')));await send(a,tx);assert.equal((await bob.readMessage(1,1)).text,message);await rejects(async()=>send(a,tx));await rejects(async()=>charlie.readMessage(1,1));
 const chainMessage=await chat.messageOf(1,1);assert.ok(!chainMessage.ciphertext.includes(Buffer.from(message).toString('hex')));
 const backup=await bob.backup('a strong backup phrase with many words');assert.ok(!JSON.stringify(backup).includes('"d":'));await rejects(async()=>bob.restore(backup,'a wrong phrase but still long'));
 bob.lock();await bob.restore(backup,'a strong backup phrase with many words');assert.equal((await bob.readMessage(1,1)).text,message);
 const oldKey=bob.epochKeys.get('1:2').slice();await send(a,await alice.remove(1,bob.owner));await assert.rejects(async()=>alice.post(1,'blocked before rotation'),/Membership changed/);
 await send(a,(await alice.rotate(1,[alice.owner])).transaction);await send(a,await alice.post(1,'The next epoch excludes the removed member.'));
 assert.equal(await chat.packageOf(1,3,bob.owner),'0x');await rejects(async()=>bob.readMessage(1,2));assert.equal((await bob.readMessage(1,1)).text,message);
 const future=await chat.messageOf(1,2);await rejects(async()=>decryptMessage(oldKey,future.ciphertext,contextBytes('group-message',[c.chainId,await chat.getAddress(),1,future.epoch,future.sender,future.sequence])));
 await rejects(async()=>send(b,await bob.post(1,'removed sender')));
 // Group members replacing a key force a fresh epoch before anyone can post more content.
 await alice.newIdentity();await send(a,await alice.register());await rejects(async()=>send(a,await alice.post(1,'key was replaced')));
 await send(a,(await alice.rotate(1,[alice.owner])).transaction);await send(a,await alice.post(1,'Key replacement completed.'));
 assert.equal((await alice.readMessage(1,3)).text,'Key replacement completed.');oldKey.fill(0);
 // Historical backup keys remain usable for reading, while posting still requires the current registry key.
 await bob.newIdentity();await send(b,await bob.register());bob.lock();await bob.restore(backup,'a strong backup phrase with many words');assert.equal((await bob.readMessage(1,1)).text,message);await rejects(async()=>bob.post(1,'old key cannot post'));
});

test('F02/F05: locking cancels pending private-key creation and backup restoration',async()=>{
 const client=new PrivacyClient({chainId:31337,owner:ZeroAddress});
 const creation=client.newIdentity();client.lock();await assert.rejects(creation,/cancelled/);assert.equal(client.identity,null);
 await client.newIdentity();const backup=await client.backup('a restore cancellation test passphrase');
 const restoring=client.restore(backup,'a restore cancellation test passphrase');client.lock();await assert.rejects(restoring,/cancelled/);assert.equal(client.identity,null);
});

test('F04: two local chains authenticate endpoint + source domain, wait source blocks, reject replay and stale custody',async t=>{
 const source=await chain(31337),destination=await chain(31338);t.after(()=>{source.rpc.disconnect();destination.rpc.disconnect();});
 const s=await realCollection(source),d=await realCollection(destination),[sa,owner,next]=source.signers,[da]=destination.signers;
 const se=await deploy('PrivacyEndpointFixture',sa,[101]),de=await deploy('PrivacyEndpointFixture',da,[102]);
 const sourcePredicted=getCreateAddress({from:await sa.getAddress(),nonce:await source.provider.getTransactionCount(await sa.getAddress())}),destPredicted=getCreateAddress({from:await da.getAddress(),nonce:await destination.provider.getTransactionCount(await da.getAddress())});
 const sp=await deploy('AuthenticatedStatePortal',sa,[await se.getAddress(),await s.collection.getAddress(),102,31338,zeroPadValue(destPredicted,32),await d.collection.getAddress(),ZeroAddress,2]);
 const dp=await deploy('AuthenticatedStatePortal',da,[await de.getAddress(),await d.collection.getAddress(),101,31337,zeroPadValue(sourcePredicted,32),await s.collection.getAddress(),await d.registry.getAddress(),2]);
 assert.equal(await sp.getAddress(),sourcePredicted);assert.equal(await dp.getAddress(),destPredicted);
 await rejects(async()=>sp.connect(owner).queue(1,BigInt((await source.provider.getBlock('latest')).timestamp)+1800n));
 for(const [portal,endpoint] of [[sp,se],[dp,de]]){
  const address=await endpoint.getAddress(),uln=AbiCoder.defaultAbiCoder().encode(['tuple(uint64,uint8,uint8,uint8,address[],address[])'],[[2,1,255,0,[address],[]]]),executor=AbiCoder.defaultAbiCoder().encode(['tuple(uint32,address)'],[[4096,address]]);
  await (await portal.configureTransport(address,address,uln,uln,executor)).wait();await (await portal.sealTransport()).wait();
  await rejects(async()=>portal.configureTransport(address,address,uln,uln,executor));
 }
 await (await d.registry.setAdapter(101,await dp.getAddress())).wait();await (await d.registry.freeze()).wait();
 const deadline=BigInt((await source.provider.getBlock('latest')).timestamp)+1800n;
 await (await sp.connect(owner).queue(1,deadline)).wait();await rejects(async()=>sp.quote(1,'0x'));await source.provider.send('evm_mine',[]);await source.provider.send('evm_mine',[]);await (await sp.dispatch(1,'0x')).wait();
 const payload=await se.payload(),guid=await se.guid(),origin=[101,zeroPadValue(await sp.getAddress(),32),1];
 await rejects(async()=>dp.lzReceive(origin,guid,payload,ZeroAddress,'0x'));
 await rejects(async()=>de.deliver(await dp.getAddress(),[100,origin[1],1],guid,payload));await rejects(async()=>de.deliver(await dp.getAddress(),[101,zeroPadValue(await owner.getAddress(),32),1],guid,payload));
 await (await de.deliver(await dp.getAddress(),origin,guid,payload)).wait();await rejects(async()=>de.deliver(await dp.getAddress(),origin,guid,payload));
 const identity=keccak256(AbiCoder.defaultAbiCoder().encode(['uint256','address','uint256'],[31337,await s.collection.getAddress(),1])),observed=await dp.observation(identity);
 assert.equal(observed.fresh,true);assert.equal(observed.snapshot.owner,await owner.getAddress());assert.equal(observed.snapshot.custodyEpoch,await s.account.sessionEpoch());
 assert.equal((await d.registry.witnessOf(identity,101)).stateRoot,await s.account.stateRoot());
 // Domain and monotonic sequence checks also protect against a faulty local relay fixture.
 const tuple='tuple(uint256 chainId,address collectionAddress,uint256 tokenId,address owner,uint64 custodyEpoch,uint64 sequence,uint64 sourceBlock,uint64 expires,bytes32 stateRoot,bytes32 memoryRoot)';
 const original=Array.from(AbiCoder.defaultAbiCoder().decode([tuple],payload)[0]),wrong=[...original];wrong[0]=999;wrong[5]=2;
 await rejects(async()=>de.deliver(await dp.getAddress(),[101,origin[1],2],keccak256(toUtf8Bytes('bad-domain')),AbiCoder.defaultAbiCoder().encode([tuple],[wrong])));
 await (await sp.connect(owner).queue(1,deadline)).wait();await (await s.collection.connect(owner).transferFrom(await owner.getAddress(),await next.getAddress(),1)).wait();await source.provider.send('evm_mine',[]);await rejects(async()=>sp.dispatch(1,'0x'));
 assert.equal(await destination.provider.getBalance(await dp.getAddress()),0n);assert.equal(dp.interface.fragments.some(x=>x.name==='execute'),false);
 await (await se.corruptSendLibrary(await sp.getAddress(),await owner.getAddress())).wait();await rejects(async()=>sp.connect(next).queue(1,deadline));
 await destination.provider.send('evm_increaseTime',[1801]);await destination.provider.send('evm_mine',[]);assert.equal((await dp.observation(identity)).fresh,false);
});
