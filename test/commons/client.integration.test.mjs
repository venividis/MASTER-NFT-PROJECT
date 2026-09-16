import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {LaunchChain} from '../../web/launchpad/chain.mjs';
import {CommonsClient,verifyCommonsContract} from '../../web/commons/client.mjs';
import {COMMONS_ARTIFACTS} from '../../web/commons/artifacts.mjs';

async function setup(t){
 const rpc=ganache.provider({logging:{quiet:true},wallet:{totalAccounts:4,defaultBalance:100},chain:{chainId:31337,hardfork:'shanghai'}}),accounts=await rpc.request({method:'eth_accounts',params:[]}),chains=[],clients=[];
 for(const account of accounts.slice(0,3)){
  const raw={request:async args=>['eth_accounts','eth_requestAccounts'].includes(args.method)?[account]:rpc.request(args)},chain=new LaunchChain({storage:null,receiptTimeout:10000,pollInterval:10});await chain.connect(raw);chains.push(chain);clients.push(new CommonsClient({chain,storage:null}));
 }
 t.after(async()=>{for(const client of clients)client.destroy();for(const chain of chains)chain.disconnect();await rpc.disconnect();});
 const send=async client=>{await client.chain.reviewNext();const result=await client.chain.sendReviewed();assert.equal(result.status,'confirmed');return result;};
 const [alice]=clients;await alice.prepareDeploy('PrivacyKeys');await send(alice);await alice.recoverDeployments();assert.equal(alice.configured,false);await alice.prepareDeploy('EpochGroupChat');await send(alice);await alice.recoverDeployments();
 for(const client of clients){await client.configure(alice.config);await client.newIdentity();await client.prepare('register');await send(client);}
 return {rpc,accounts,clients,chains,send};
}

test('verified chat deployment, consent, discovery, epoch recovery and encrypted history use real EVM transactions',async t=>{
 const {clients:[alice,bob,charlie],send}=await setup(t);
 assert.equal(alice.configured,true);assert.equal(alice.config.memory,undefined);assert.equal((await bob.identityStatus()).matches,true);
 await alice.prepare('create');await send(alice);assert.equal((await alice.groups()).groups[0].isManager,true);assert.deepEqual((await bob.groups()).groups,[]);
 await alice.prepare('rotate',{room:1});await send(alice);
 await alice.prepare('post',{room:1,text:'The first epoch belongs to its first member.'});await send(alice);
 await alice.prepare('invite',{room:1,recipient:bob.chain.address});await send(alice);
 assert.equal((await bob.groups()).groups[0].invited,true);assert.equal((await bob.group(1)).member,false);
 await assert.rejects(async()=>{await charlie.prepare('join',{room:1});await send(charlie);});
 await bob.prepare('join',{room:1});await send(bob);assert.equal((await alice.group(1)).dirty,true);
 await assert.rejects(alice.prepare('post',{room:1,text:'Must wait'}),/Membership changed/);
 assert.equal((await alice.members(1)).length,2);await alice.prepare('rotate',{room:1});await send(alice);
 const secret='<script>Only invited friends can read this.</script>';
 await alice.prepare('post',{room:1,text:secret});const encryptedRequest=alice.chain.plan.request.data;assert.ok(!encryptedRequest.includes(Buffer.from(secret).toString('hex')));await send(alice);
 const history=await bob.history(1);assert.equal(history.messages[0].readable,false);assert.equal(history.messages[1].text,secret);assert.equal((await charlie.history(1)).messages.every(m=>!m.readable),true);
 assert.ok(!JSON.stringify(alice.chain.records).includes(secret),'persistent transaction journal never receives plaintext');
 const newest=await bob.history(1,{limit:1});assert.equal(newest.messages[0].index,1);assert.equal(newest.next,1);assert.equal((await bob.history(1,{before:newest.next,limit:1})).messages[0].index,0);
 const passphrase='An encrypted backup that survives a closed tab',backup=await bob.backup(passphrase);bob.lock();assert.equal(bob.unlocked,false);await bob.restore(backup,passphrase);assert.equal((await bob.history(1)).messages[1].text,secret);
 assert.equal(await alice.rotationRequired(1,await alice.members(1)),false);await bob.newIdentity();await bob.prepare('register');await send(bob);assert.equal((await alice.group(1)).dirty,false,'contract dirty flag alone does not reveal registered-key replacement');assert.equal(await alice.rotationRequired(1,await alice.members(1)),true);await bob.restore(backup,passphrase);
 await alice.prepare('remove',{room:1,recipient:bob.chain.address});await send(alice);await alice.prepare('rotate',{room:1});await send(alice);await alice.prepare('post',{room:1,text:'A fresh epoch excludes the removed wallet.'});await send(alice);
 const removedHistory=await bob.history(1);assert.equal(removedHistory.messages[1].text,secret);assert.equal(removedHistory.messages[2].readable,false);assert.deepEqual((await bob.groups()).groups,[]);
 await alice.prepare('close',{room:1});await send(alice);assert.equal((await alice.group(1)).closed,true);await assert.rejects(alice.prepare('post',{room:1,text:'Closed'}),/room closed/);
});

test('contract identity checks reject a different registry and inconsistent immutable call sites',async t=>{
 const {clients:[alice],send}=await setup(t),provider=alice.chain.provider,config={...alice.config};
 await alice.prepareDeploy('PrivacyKeys');const other=await send(alice);
 await assert.rejects(verifyCommonsContract(provider,config.chat,'EpochGroupChat',other.contractAddress),/different encryption-key registry/);
 const runtime=await provider.getCode(config.chat),group=COMMONS_ARTIFACTS.EpochGroupChat.immutableGroups.find(group=>group.length>1);assert.ok(group,'compiler emits repeated immutable references');
 const mask=group[0],start=2+mask.start*2,corrupted=runtime.slice(0,start)+'0'.repeat(mask.length*2)+runtime.slice(start+mask.length*2);
 await assert.rejects(verifyCommonsContract({getCode:async()=>corrupted},config.chat,'EpochGroupChat',config.keys),/inconsistent immutable/);
 await assert.rejects(alice.configure({keys:config.chat,chat:config.chat}),/runtime does not match/);
 assert.equal(alice.config.chat,config.chat,'failed verification must retain known verified configuration');
});

test('locking cancels in-flight decryption and clears prepared ciphertext review',async t=>{
 const {clients:[alice],send}=await setup(t);await alice.prepare('create');await send(alice);await alice.prepare('rotate',{room:1});await send(alice);await alice.prepare('post',{room:1,text:'A message already on chain.'});await send(alice);
 let release,arrived;const gate=new Promise(resolve=>release=resolve),waiting=new Promise(resolve=>arrived=resolve),read=alice.privacy.readMessage.bind(alice.privacy);
 alice.privacy.readMessage=async(...args)=>{const result=await read(...args);arrived();await gate;return result;};
 const pending=alice.history(1);await waiting;alice.lock();release();await assert.rejects(pending,/cancelled/);assert.equal(alice.privacy.epochKeys.size,0);assert.equal(alice.unlocked,false);
 await alice.newIdentity();await alice.prepare('register');await alice.chain.reviewNext();assert.ok(alice.chain.review);alice.lock();assert.equal(alice.chain.review,null);assert.equal(alice.chain.plan,null);
});
