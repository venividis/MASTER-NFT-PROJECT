import test from 'node:test';import assert from 'node:assert/strict';
import {Contract,ZeroAddress,parseEther,toUtf8Bytes,keccak256} from 'ethers';
import {mintedFixture} from '../helpers/minted-fixture.mjs';
import {snapshotLocks,workshopContext,fundCalendar,decideCalendar,acquireCalendar} from '../../web/workshop/client.mjs';
import {compileCalendar,validateCalendar,vestedAt,availableAt,calendarICS} from '../../web/workshop/calendar.mjs';
import {ConfluenceWallet} from '../../web/confluence/wallet.mjs';
import {loadArtifact} from '../../scripts/lib/deploy-stack.mjs';
import {WorkshopDesk} from '../../web/workshop/desk.mjs';

test('commissioned calendar becomes a frozen NFT cartridge with no grants; current master NFT owner controls it',async t=>{
  const x=await mintedFixture(t),{w,api,vault,provider,d,worker,stack,owner,next}=x;
  await api.lock({vault:vault.target,asset:ZeroAddress,amount:'1',days:'2'});await w.send();
  const a=await snapshotLocks(w,vault.target);assert.equal(a.snapshot.locks.length,1);assert.equal(a.snapshot.locks[0].amount,String(parseEther('1')));
  const escrow=await d('CommissionEscrow'),binding=await d('ArtifactBinding',[stack.collection.target]),cartridges=await d('CartridgeRegistry',[binding.target]),publisher=await d('CommissionedCartridges',[stack.collection.target,escrow.target,cartridges.target]);
  const ctx=await workshopContext(w,publisher.target);assert.equal(ctx.escrow.target,escrow.target);
  const budget=parseEther('.1'),before=await provider.getBalance(w.account),grants=await w.contract.instrumentGrantCount(),epoch=await w.contract.sessionEpoch();
  await fundCalendar(w,publisher.target,a,{worker:await worker.getAddress(),amount:'.1'});const funding=await w.send();
  assert.equal(await provider.getBalance(w.account),before-budget);assert.equal((await escrow.work(1)).terms,a.terms);
  // UI receipt parsing uses the actual escrow event and addresses, not a fabricated job ID.
  const desk=new WorkshopDesk(w,()=>{},()=>{},()=>{}),idInput={value:''};desk.pending={kind:'fund',publisher:publisher.target};await desk.receipt(funding,{querySelector:s=>s==='#wk-id'?idInput:null});assert.equal(idInput.value,'1');
  await assert.rejects(acquireCalendar(w,publisher.target,1,a),/Accept/);
  await(await escrow.connect(worker).accept(1)).wait();await(await escrow.connect(worker).submit(1,a.deliverable)).wait();
  await assert.rejects(escrow.connect(worker).decide(1,true));
  assert.throws(()=>validateCalendar({...a,html:a.html+'<script>fetch("https://evil.example")</script>'}),/differs/);
  await decideCalendar(w,publisher.target,1,a,true);await w.send();assert.equal(await escrow.claimable(await worker.getAddress(),ZeroAddress),budget);
  assert.equal(await publisher.deliverableHash(a.terms,a.manifestJSON,toUtf8Bytes(a.html)),a.deliverable);
  await assert.rejects(w.prepare({target:publisher.target,data:publisher.interface.encodeFunctionData('acquire',[1,a.manifestJSON,toUtf8Bytes(a.html+'x')])}));
  await acquireCalendar(w,publisher.target,1,a);await w.send();const id=await publisher.cartridgeOfWork(1);assert.equal(id,1n);
  assert.equal(await cartridges.ownerOf(id),w.account);assert.equal((await cartridges.manifestOf(id)).frozen,true);assert.equal(await cartridges.contentOf(id),'0x'+Buffer.from(a.html).toString('hex'));
  assert.equal(await w.contract.instrumentGrantCount(),grants);assert.equal(await w.contract.sessionEpoch(),epoch);assert.equal((await w.contract.sessions(publisher.target)).active,false);
  await assert.rejects(acquireCalendar(w,publisher.target,1,a));
  await assert.rejects(w.prepare({target:cartridges.target,data:cartridges.interface.encodeFunctionData('updateManifest',[id,a.manifestJSON,a.contentHash])}));
  globalThis.window={CONFLUENCE_BUNDLED:{'abis/CartridgeRegistry.json':JSON.stringify({abi:loadArtifact('CartridgeRegistry').abi})}};t.after(()=>delete globalThis.window);
  assert.equal((await w.readCartridge(cartridges.target,id)).html,a.html);
  await w.prepare({target:owner,value:'0',data:'0x'});
  const nextOwner=await next.getAddress();await(await stack.collection.transferFrom(owner,nextOwner,1)).wait();await assert.rejects(w.send(),/Ownership|context/);await assert.rejects(w.readCartridge(cartridges.target,id));
  assert.equal(await cartridges.canLaunch(id,owner),false);assert.equal(await cartridges.canLaunch(id,nextOwner),true);assert.equal(await w.contract.sessionEpoch(),epoch+1n);
  const n=new ConfluenceWallet();Object.assign(n,{...w,connected:true,revision:w.revision+1,address:nextOwner,signer:next,contract:new Contract(w.account,loadArtifact('SovereignAccount').abi,next),raw:{request:q=>q.method==='eth_accounts'?Promise.resolve([nextOwner]):x.rpc.request(q)}});
  assert.equal((await n.readCartridge(cartridges.target,id)).html,a.html);
  const workerBefore=await provider.getBalance(await worker.getAddress());await(await escrow.withdrawFor(await worker.getAddress(),ZeroAddress)).wait();assert.equal(await provider.getBalance(await worker.getAddress()),workerBefore+budget);
});

test('bad provider submissions can be rejected; expired work refunds without grants or leftover ERC20 allowance',async t=>{
  const x=await mintedFixture(t),{w,api,vault,market,token,provider,d,worker,stack,rpc}=x;
  await api.swap({market:market.target,input:ZeroAddress,output:token.target,amount:'.1'});await w.send();
  await api.lock({vault:vault.target,asset:token.target,amount:'1',days:'1'});await w.send();
  const a=await snapshotLocks(w,vault.target),escrow=await d('CommissionEscrow'),binding=await d('ArtifactBinding',[stack.collection.target]),cartridges=await d('CartridgeRegistry',[binding.target]),publisher=await d('CommissionedCartridges',[stack.collection.target,escrow.target,cartridges.target]);
  await fundCalendar(w,publisher.target,a,{worker:await worker.getAddress(),asset:token.target,amount:'2',days:1});await w.send();assert.equal(await token.allowance(w.account,escrow.target),0n);
  await(await escrow.connect(worker).accept(1)).wait();await(await escrow.connect(worker).submit(1,keccak256(toUtf8Bytes('wrong output')))).wait();
  await assert.rejects(decideCalendar(w,publisher.target,1,a,true),/differs/);await decideCalendar(w,publisher.target,1,a,false);await w.send();assert.equal((await escrow.work(1)).status,5n);assert.equal(await escrow.claimable(w.account,token.target),parseEther('2'));
  const before=await token.balanceOf(w.account);await(await escrow.withdrawFor(w.account,token.target)).wait();assert.equal(await token.balanceOf(w.account),before+parseEther('2'));
  await fundCalendar(w,publisher.target,a,{worker:await worker.getAddress(),amount:'.01',days:1});await w.send();const work=await escrow.work(2);await rpc.request({method:'evm_setTime',params:[(Number(work.submitBy)+1)*1000]});await rpc.request({method:'evm_mine',params:[]});
  await(await escrow.refundExpired(2)).wait();assert.equal((await escrow.work(2)).status,5n);assert.equal(await escrow.claimable(w.account,ZeroAddress),parseEther('.01'));assert.equal(await publisher.cartridgeOfWork(2),0n);
  await assert.rejects(fundCalendar(w,publisher.target,compileCalendar({...a.snapshot,chainId:'1'}),{worker:await worker.getAddress(),amount:'.01'}),/another NFT or chain/);
});

test('calendar mathematics use exact raw integers, cliffs and already released amounts',()=>{
  const lock={amount:'1000000000000000001',released:'200000000000000000',start:100,cliff:120,end:200,linear:true};
  assert.equal(vestedAt(lock,119),0n);assert.equal(vestedAt(lock,120),200000000000000000n);assert.equal(availableAt(lock,120),0n);assert.equal(availableAt(lock,150),300000000000000000n);assert.equal(vestedAt(lock,200),1000000000000000001n);
  assert.equal(vestedAt({...lock,cliff:200,linear:false},199),0n);
  const s={schema:'anima.vault-snapshot/1',chainId:'31337',collection:'0x'+'1'.repeat(40),tokenId:'1',account:'0x'+'2'.repeat(40),vault:'0x'+'3'.repeat(40),block:{number:'7',hash:'0x'+'a'.repeat(64),timestamp:125},locks:[{...lock,id:'1',asset:ZeroAddress,beneficiary:'0x'+'2'.repeat(40),decimals:18,symbol:'</script><script>x'}]};
  const a=compileCalendar(s);assert.deepEqual(validateCalendar(a),a);assert.equal(a.html.includes('</script><script>x'),false);assert.equal(JSON.parse(a.manifestJSON).capabilities.length,0);assert.ok(calendarICS(s).includes('DTSTART:19700101T000320Z'));assert.throws(()=>compileCalendar({...s,locks:[...s.locks,...s.locks]}),/Duplicate/);
});
