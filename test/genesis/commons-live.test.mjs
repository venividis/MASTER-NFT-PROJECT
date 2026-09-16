import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {BrowserProvider,Contract,parseEther,keccak256,toUtf8Bytes} from 'ethers';
import {deployStack,deployContract,loadArtifact} from '../../scripts/lib/deploy-stack.mjs';
import {ConfluenceWallet} from '../../web/confluence/wallet.mjs';
import {LiveProtocol} from '../../web/genesis/live-protocol.mjs';
import {LiveProtocolDesk,renderCommonsRoom,renderCommonsDirectory} from '../../web/genesis/live-desk.mjs';

async function setup(t,{timestampIncrement='clock'}={}){
  const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},miner:{blockGasLimit:50000000,timestampIncrement},logging:{quiet:true}});
  const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
  t.after(async()=>{provider.destroy();await rpc.disconnect();});
  const signers=await Promise.all([0,1,2].map(i=>provider.getSigner(i))),owners=await Promise.all(signers.map(s=>s.getAddress()));
  const stack=await deployStack({signer:signers[0],attesterAddress:owners[0],royaltyBps:0});
  const wallets=[];
  for(let i=0;i<2;i++){
    const secret=keccak256(toUtf8Bytes('Commons real account '+i)),collection=stack.collection.connect(signers[i]);
    await(await collection.commitAwakening(await collection.commitmentFor(owners[i],secret,owners[i]),{value:parseEther('20')})).wait();
    await rpc.request({method:'evm_mine',params:[]});await rpc.request({method:'evm_mine',params:[]});
    await(await collection.revealAwakening(secret,owners[i])).wait();
    const tokenId=BigInt(i+1),account=await collection.accountOf(tokenId),wallet=new ConfluenceWallet();
    Object.assign(wallet,{connected:true,revision:1,raw:{request:async request=>request.method==='eth_accounts'?[owners[i]]:rpc.request(request)},provider,signer:signers[i],address:owners[i],chainId:31337n,core:stack.collection,collection:stack.collection.target,tokenId,account,contract:new Contract(account,loadArtifact('SovereignAccount').abi,signers[i])});
    wallets.push(wallet);
  }
  const ledger=await deployContract('WorldLedger',signers[0],[stack.collection.target]);
  const market=await deployContract('NativeMarket',signers[0],[ledger.target]),vault=await deployContract('TimeVault',signers[0],[ledger.target]),launch=await deployContract('GenesisLaunchpad',signers[0],[ledger.target]);
  await(await ledger.sealModules(market.target,vault.target,launch.target)).wait();
  return {rpc,provider,signers,owners,stack,ledger,wallets,apis:wallets.map(w=>new LiveProtocol(w)),args:{ledger:ledger.target,room:'2'},room:{ledger:ledger.target,name:'The public <sky>',topic:'An invitation controls writing, never reading.',gated:true,slow:'0',color:'#8af1ff',publicConsent:true}};
}

test('Commons uses real NFT reviews, public room reads, explicit acceptance and bounded pages',async t=>{
  const x=await setup(t,{timestampIncrement:1}),{ledger,args,room}=x,[admin,member]=x.apis,[a,b]=x.wallets;
  await assert.rejects(admin.createRoom({...room,publicConsent:false}),/Confirm/);assert.equal(a.plan,null);
  await assert.rejects(admin.createRoom({...room,name:'🌌'.repeat(13)}),/48/);
  await assert.rejects(admin.createRoom({...room,slow:'3601'}),/range/);
  await admin.createRoom(room);assert.equal(await ledger.roomCount(),1n,'simulation must not create a room');
  await a.send();assert.equal(await ledger.roomCount(),2n);
  const directory=await member.rooms({ledger:ledger.target,limit:'1'});
  assert.equal(directory.rooms[0].id,'1');assert.equal(directory.next,'2');assert.match(directory.blockHash,/^0x[0-9a-f]{64}$/i);
  const page=await member.readRoom(args);assert.equal(page.name,room.name);assert.equal(page.messageCount,'0');assert.equal(page.access.canPost,false);
  await assert.rejects(member.post({...args,text:'No invitation',publicConsent:true}),/invitation/);
  await assert.rejects(member.configureRoom({...room,...args}),/admin/);
  await assert.rejects(member.setMember({...args,who:x.owners[2]}),/admin|moderator/);
  await assert.rejects(member.joinRoom(args),/invitation/);
  await admin.setMember({...args,who:b.account});await a.send();
  assert.equal(await ledger.member(2,b.account),true);assert.equal(await ledger.accepted(2,b.account),false);
  await assert.rejects(member.post({...args,text:'An invitation is not acceptance',publicConsent:true}),/invitation/);
  await member.joinRoom(args);assert.equal(await ledger.accepted(2,b.account),false);await b.send();
  await assert.rejects(member.post({...args,text:'Unconsented text'}),/Confirm/);assert.equal(b.plan,null);
  await member.post({...args,text:'<img src=x onerror="alert(1)"> & hello',publicConsent:true});await b.send();
  await member.post({...args,text:'Second message',replyTo:'1',publicConsent:true});await b.send();
  const latest=await member.readRoom({...args,limit:'1'}),older=await member.readRoom({...args,limit:'1',before:latest.nextBefore});
  assert.deepEqual(latest.messages.map(m=>m.id),['2']);assert.equal(latest.messages[0].replyTo,'1');assert.deepEqual(older.messages.map(m=>m.id),['1']);
  assert.equal(older.messages[0].custodian,x.owners[1]);assert.equal(older.messages[0].author,b.account);
  assert.equal(older.nextBefore,null);
  const html=renderCommonsRoom(older);assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; hello'));assert.ok(!html.includes('<img'));
  assert.ok(renderCommonsDirectory({...directory,rooms:[page]}).includes('The public &lt;sky&gt;'));
  await assert.rejects(member.readRoom({...args,before:'3'}),/range/);
  await assert.rejects(member.readRoom({...args,limit:'33'}),/range/);
  await assert.rejects(member.rooms({ledger:ledger.target,limit:'21'}),/range/);
  await member.leaveRoom(args);await b.send();assert.equal((await member.readRoom(args)).access.canPost,false);
  assert.equal(await ledger.messageCount(),2n,'leaving never erases messages');
  await admin.configureRoom({...room,...args,gated:false,name:'Now open',slow:'5'});await a.send();
  const open=await member.readRoom(args);assert.equal(open.membersOnly,false);assert.equal(open.name,'Now open');assert.equal(open.access.canPost,true,'unbanned public posting does not require membership');
  // Pin this test's chain clock: reads and host load must not consume the slow-mode window.
  const postAfter=Number(await ledger.lastPost(2,b.account))+open.slow;
  assert.ok((await x.provider.getBlock('latest')).timestamp<postAfter,'room setup must remain inside the controlled slow-mode window');
  await x.rpc.request({method:'evm_mine',params:[postAfter-1]});
  assert.equal((await x.provider.getBlock('latest')).timestamp,postAfter-1);
  await assert.rejects(member.post({...args,text:'Wait for slow mode',publicConsent:true}),/slow mode/);
  assert.equal(b.plan,null,'a blocked message must not create a signing review');
  assert.equal(await ledger.messageCount(),2n,'a blocked message must not change room history');
  await x.rpc.request({method:'evm_mine',params:[postAfter]});
  assert.equal((await x.provider.getBlock('latest')).timestamp,postAfter);
  await member.post({...args,text:'Public room without membership',publicConsent:true});await b.send();
  assert.equal(await ledger.messageCount(),3n,'posting is available at the exact slow-mode deadline');
  t.diagnostic('Controlled slow-mode boundary: rejected at '+(postAfter-1)+'; reviewed at '+postAfter+'; mined message count 3.');
});

test('Commons moderators require acceptance; only the admin can change peers, and bans revoke write access',async t=>{
  const x=await setup(t),{ledger,args,room}=x,[admin,moderator]=x.apis,[a,b]=x.wallets;
  await admin.createRoom(room);await a.send();
  await admin.setModerator({...args,who:b.account,moderatorAllowed:true});await a.send();
  assert.equal(await ledger.moderatorActive(2,b.account),false);
  await assert.rejects(moderator.setMember({...args,who:x.owners[2]}),/active moderator/);
  await moderator.joinRoom(args);await b.send();assert.equal(await ledger.moderatorActive(2,b.account),true);
  await moderator.setMember({...args,who:x.owners[2]});await b.send();assert.equal(await ledger.member(2,x.owners[2]),true);
  await assert.rejects(moderator.setModerator({...args,who:x.owners[2],moderatorAllowed:true}),/admin/);
  await assert.rejects(moderator.setMember({...args,who:a.account,memberAction:'ban'}),/admin/);
  await admin.setModerator({...args,who:x.owners[2],moderatorAllowed:true});await a.send();
  await(await ledger.connect(x.signers[2]).acceptInvitation(2,true)).wait();
  await assert.rejects(moderator.setMember({...args,who:x.owners[2],memberAction:'ban'}),/another active moderator/);
  await moderator.leaveRoom(args);await b.send();assert.equal(await ledger.moderatorActive(2,b.account),false);
  await moderator.joinRoom(args);await b.send();
  await admin.setMember({...args,who:b.account,memberAction:'ban'});await a.send();
  assert.equal(await ledger.accepted(2,b.account),false);assert.equal(await ledger.moderatorActive(2,b.account),false);
  await assert.rejects(moderator.post({...args,text:'Banned account',publicConsent:true}),/banned/);
  await assert.rejects(moderator.joinRoom(args),/unbanned invitation/);
  await admin.setMember({...args,who:b.account,memberAction:'unban'});await a.send();
  assert.equal(await ledger.banned(2,b.account),false);assert.equal(await ledger.member(2,b.account),false);
});

test('Commons rejects reviewed writes and in-flight snapshots after NFT custody changes',async t=>{
  const x=await setup(t),{args,room}=x,[admin,member]=x.apis,[a,b]=x.wallets;
  await admin.createRoom(room);await a.send();
  await admin.setMember({...args,who:b.account});await a.send();await member.joinRoom(args);await b.send();
  await admin.configureRoom({...room,...args,name:'Never applied'});
  const transferBack=async()=>{await(await x.stack.collection.transferFrom(x.owners[0],x.owners[2],1)).wait();await(await x.stack.collection.connect(x.signers[2]).transferFrom(x.owners[2],x.owners[0],1)).wait();};
  await transferBack();await assert.rejects(a.send(),/custody|context/);
  assert.equal((await admin.readRoom(args)).name,room.name);assert.equal((await member.readRoom(args)).access.joined,false);
  await assert.rejects(member.post({...args,text:'Old invitation',publicConsent:true}),/invitation/);
  let arrived,release;const waiting=new Promise(resolve=>arrived=resolve),gate=new Promise(resolve=>release=resolve),read=admin.roomAt.bind(admin);
  admin.roomAt=async(...value)=>{const result=await read(...value);arrived();await gate;return result;};
  const pending=admin.readRoom(args);await waiting;await transferBack();release();
  await assert.rejects(pending,/custody|context/);assert.equal(a.plan,null);
  admin.roomAt=read;
  await admin.configureRoom({...room,...args});a.disconnect();await assert.rejects(a.send(),/expired|changed/);
});

test('Commons escapes room controls, hides flagged text without claiming deletion, and invalidates late reads',async()=>{
  const malicious='<script>alert("x")</script>',room={id:'2',name:malicious,topic:malicious,block:10,messageCount:'1',membersOnly:true,slow:0,actor:'0x123',access:{joined:true},nextBefore:null,messages:[{id:'1',identity:'2',author:'0x123',time:1,replyTo:'0',text:malicious,hidden:true,custodian:'0x456',epoch:'0'}]};
  const html=renderCommonsRoom(room);assert.ok(!html.includes('<script>'));assert.match(html,/original bytes remain onchain/);assert.equal(html.match(/&lt;script&gt;/g).length,2);
  const wallet={plan:null},desk=new LiveProtocolDesk(wallet,()=>{throw Error('Reads must never request a wallet review');},()=>({}),()=>{});desk.operation='post';
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='#ag-live-ledger'?'ledger':'',textContent:'',innerHTML:'',replaceChildren(){this.innerHTML='';}});return nodes.get(id);};
  const container={querySelector:node};let release;desk.api.readRoom=()=>new Promise(resolve=>release=resolve);
  const pending=desk.readCommons(container);desk.invalidate();release(room);await assert.rejects(pending,/selection changed/);
  assert.equal(node('#ag-live-room-view').innerHTML,'');assert.equal(wallet.plan,null);
  desk.operation='configureRoom';desk.room='2';desk.roomDraft={...room,color:'#8af1ff',scope:desk.commonsScope()};
  assert.ok(!desk.fields().includes('<script>'));assert.match(desk.fields(),/Require accepted invitations/);
});

test('reading settings hydrates the selected room, clears text consent and scopes defaults to the active ledger and wallet',async()=>{
  const wallet={plan:null,chainId:31337n,account:'account',revision:1},desk=new LiveProtocolDesk(wallet,()=>{},()=>({ledger:'ledger'}),()=>{});
  desk.operation='configureRoom';desk.room='2';
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='#ag-live-ledger'?'ledger':id==='#ag-live-room'?'2':'',checked:false,textContent:'',innerHTML:'',replaceChildren(){this.innerHTML='';}});return nodes.get(id);};
  node('#ag-live-name').value='Unrelated old name';node('#ag-live-consent').checked=true;
  const room={id:'2',name:'Existing private-writing circle',topic:'Public reading',slow:90,color:'#ffee00',membersOnly:true,block:7,actor:'account',access:{admin:true},messageCount:'0',messages:[],nextBefore:null};
  desk.api.readRoom=async()=>room;await desk.readCommons({querySelector:node});
  assert.equal(node('#ag-live-name').value,room.name);assert.equal(node('#ag-live-topic').value,room.topic);assert.equal(node('#ag-live-slow').value,'90');assert.equal(node('#ag-live-color').value,'#ffee00');
  assert.equal(node('#ag-live-gated').checked,true);assert.equal(node('#ag-live-consent').checked,false);
  assert.ok(desk.fields().includes('value="Existing private-writing circle"'));
  desk.read=()=>({ledger:'another-ledger'});assert.ok(!desk.fields().includes('Existing private-writing circle'));
  desk.read=()=>({ledger:'ledger'});wallet.revision++;assert.ok(!desk.fields().includes('Existing private-writing circle'));
});

test('a late Commons preparation is withheld while its final context checks await RPC',async()=>{
  const planA={data:'A'},planB={data:'B'};let prepared,releasePrepare,checked,releaseCheck;
  const preparation=new Promise(resolve=>prepared=resolve),prepareGate=new Promise(resolve=>releasePrepare=resolve),check=new Promise(resolve=>checked=resolve),checkGate=new Promise(resolve=>releaseCheck=resolve);
  const wallet={plan:null,prepare:async()=>{prepared();await prepareGate;wallet.plan=planA;return planA;}},api=new LiveProtocol(wallet);let checks=0;
  api.assertCommonsContext=async()=>{if(++checks===2){checked();await checkGate;}};
  const pending=api.prepareCommons({ledger:{target:'ledger',interface:{encodeFunctionData:()=> '0x'}}},'post',[]);
  await preparation;wallet.plan=planB;releasePrepare();await check;
  assert.equal(wallet.plan,null,'no unreviewed candidate may be sent while a different review is still visible');
  releaseCheck();assert.equal(await pending,planA);assert.equal(wallet.plan,planA,'direct API callers can send after successful checks');
});

test('Commons directory reads use one block and reject a changed block hash',async()=>{
  const calls=[],at={blockTag:17},block={number:17,hash:'hash-at-17'},provider={getBlock:async number=>{assert.equal(number,17);return block;}};
  const wallet={connected:true,revision:1,provider,account:'account',collection:'collection',tokenId:1n,assertReviewContext:async()=>{}},api=new LiveProtocol(wallet);
  const c={...wallet,epoch:'0',block,at,ledger:{roomCount:async override=>{calls.push(override);return 2n;},roomInfo:async(id,override)=>{calls.push(override);return ['admin','subject',0n,false,0n,0n];},roomText:async(id,override)=>{calls.push(override);return ['Room '+id,'Topic'];}}};
  api.commonsContext=async()=>c;const result=await api.rooms({ledger:'ledger'});
  assert.equal(result.rooms.length,2);assert.equal(calls.length,5);for(const override of calls)assert.equal(override,at);
  provider.getBlock=async()=>({...block,hash:'replacement-block'});
  await assert.rejects(api.rooms({ledger:'ledger'}),/block changed/);
});
