import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import {BrowserProvider, ContractFactory, ZeroHash, keccak256, toUtf8Bytes} from 'ethers';

const artifact = name => JSON.parse(fs.readFileSync(new URL(`../contracts/artifacts/${name}.json`, import.meta.url)));
async function deploy(name, signer, args = []) {
  const a = artifact(name), c = await new ContractFactory(a.abi, a.bytecode, signer).deploy(...args);
  await c.waitForDeployment(); return c;
}
const rejected = async action => assert.rejects(async () => { const tx = await action(); if(tx?.wait) await tx.wait(); });
async function fixture(t) {
  const rpc = ganache.provider({logging:{quiet:true}, chain:{hardfork:'shanghai'}, wallet:{totalAccounts:4}});
  t.after(() => rpc.disconnect());
  const p = new BrowserProvider(rpc, undefined, {cacheTimeout:-1}); p.pollingInterval=10;
  const a=await p.getSigner(0), b=await p.getSigner(1), buyer=await p.getSigner(2), outsider=await p.getSigner(3);
  const collection=await deploy('CleanupCollectionMock',a);
  const first=await deploy('OperatingAccountMock',a,[await a.getAddress()]);
  const second=await deploy('OperatingAccountMock',a,[await b.getAddress()]);
  await (await collection.setAccount(1,first.target)).wait();
  await (await collection.setAccount(2,second.target)).wait();
  const run=async(account,signer,target,method,args=[]) => {
    const caller=account.connect(signer),data=target.interface.encodeFunctionData(method,args);
    const gas=await caller.run.estimateGas(target.target,data);
    // Match the wallet margin: timestamp SSTORE cost can change before mining.
    return (await caller.run(target.target,data,{gasLimit:gas*120n/100n})).wait();
  };
  return {a,b,buyer,outsider,collection,first,second,run};
}

test('former-author reflections retain history without invalidating the current owner journal or swap',async t=>{
  const {a,b,buyer,collection,first,second,run}=await fixture(t);
  const ledger=await deploy('MemoryLedger',a,[collection.target]);
  // The authorized router is a code-bearing controlled harness for this ledger regression.
  await (await ledger.installRouter(second.target)).wait();
  await (await ledger.appendPersonal(1,0,0,true,ZeroHash,toUtf8Bytes('original thesis'))).wait();
  const original=await ledger.getEntry(1), canonical=await ledger.head(1), body=await ledger.formRoot(1);
  await (await first.transferControl(await buyer.getAddress())).wait();
  await (await ledger.appendPersonal(1,1,0,true,canonical,toUtf8Bytes('former author reflection'))).wait();
  const firstBranch=await ledger.reflectionHead(1,await a.getAddress());
  assert.notEqual(firstBranch,ZeroHash);
  assert.equal(await ledger.head(1),canonical);
  assert.equal(await ledger.formRoot(1),body);
  assert.equal((await ledger.getEntry(2)).imprint,false);
  assert.deepEqual(Array.from(await ledger.getEntry(1)),Array.from(original));
  await (await ledger.appendPersonal(1,1,0,false,canonical,toUtf8Bytes('another historical reflection'))).wait();
  assert.notEqual(await ledger.reflectionHead(1,await a.getAddress()),firstBranch);
  assert.equal(await ledger.head(1),canonical);
  await rejected(()=>ledger.connect(buyer).appendPersonal(1,1,0,false,canonical,toUtf8Bytes('impersonation')));
  const plan=keccak256(toUtf8Bytes('already reviewed owner trade'));
  await run(second,b,ledger,'beforeSwap',[first.target,1,0,false,plan,canonical,toUtf8Bytes('new owner thesis')]);
  const ownerHead=await ledger.head(1);
  assert.notEqual(ownerHead,canonical,'pre-reviewed canonical head was still accepted');
  await run(second,b,ledger,'bindFill',[4,'0x0000000000000000000000000000000000000000',second.target,10,20]);
  assert.notEqual(await ledger.head(1),ownerHead);
  await rejected(()=>ledger.appendPersonal(1,1,0,false,canonical,toUtf8Bytes('stale canonical review')));
  await (await ledger.connect(buyer).appendPersonal(1,0,0,false,await ledger.head(1),toUtf8Bytes('current owner memory'))).wait();
});

test('room membership and moderation require current grantor and recipient custody plus renewed consent',async t=>{
  const {a,b,buyer,outsider,collection,first,second,run}=await fixture(t);
  const ledger=await deploy('WorldLedger',a,[collection.target]);
  await run(first,a,ledger,'createRoom',['Room','Public bytes; gated writing',true,0,0x8af1ff,1]);
  const room=2;
  await run(first,a,ledger,'setMember',[room,second.target,true,false]);
  assert.equal(await ledger.memberActive(room,second.target),false);
  await run(second,b,ledger,'acceptInvitation',[room,true]);
  await run(second,b,ledger,'post',[room,0,toUtf8Bytes('hello'),2]);
  await (await second.connect(b).transferControl(await buyer.getAddress())).wait();
  assert.equal(await ledger.memberActive(room,second.target),false);
  await rejected(()=>run(second,buyer,ledger,'post',[room,0,toUtf8Bytes('inherited write'),2]));
  await rejected(()=>run(second,buyer,ledger,'acceptInvitation',[room,true]));
  await rejected(()=>run(second,buyer,ledger,'react',[1,0,true]));
  await run(first,a,ledger,'setMember',[room,second.target,true,false]);
  assert.equal(await ledger.accepted(room,second.target),false);
  await run(second,buyer,ledger,'acceptInvitation',[room,true]);
  await run(second,buyer,ledger,'post',[room,0,toUtf8Bytes('fresh consent'),2]);
  await run(first,a,ledger,'setModerator',[room,second.target,true]);
  assert.equal(await ledger.moderatorActive(room,second.target),false);
  await run(second,buyer,ledger,'acceptInvitation',[room,true]);
  assert.equal(await ledger.moderatorActive(room,second.target),true);
  await (await second.connect(buyer).transferControl(await b.getAddress())).wait();
  assert.equal(await ledger.moderatorActive(room,second.target),false);
  await rejected(()=>run(second,b,ledger,'setMember',[room,outsider.address,true,false]));
  await run(first,a,ledger,'setModerator',[room,second.target,true]);
  await run(second,b,ledger,'acceptInvitation',[room,true]);
  assert.equal(await ledger.moderatorActive(room,second.target),true);
  await (await first.transferControl(await buyer.getAddress())).wait();
  assert.equal(await ledger.memberActive(room,second.target),false);
  assert.equal(await ledger.moderatorActive(room,second.target),false);
  await rejected(()=>run(second,b,ledger,'post',[room,0,toUtf8Bytes('old admin grant'),2]));
  await rejected(()=>run(second,b,ledger,'acceptInvitation',[room,true]));
  await run(first,buyer,ledger,'setModerator',[room,second.target,true]);
  await run(second,b,ledger,'acceptInvitation',[room,true]);
  assert.equal(await ledger.moderatorActive(room,second.target),true);
});
