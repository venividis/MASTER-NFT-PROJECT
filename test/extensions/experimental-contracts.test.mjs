import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,ZeroAddress,keccak256,toUtf8Bytes,AbiCoder} from 'ethers';
import {ACTIONS,prepareExperimentalAction} from '../../web/extensions/experimental.mjs';

const root=path.resolve(import.meta.dirname,'../..'),sources={};
function source(file){if(sources[file])return;const content=fs.readFileSync(path.join(root,file),'utf8');sources[file]={content};for(const match of content.matchAll(/import[^;]*?['"]([^'"]+)['"];?/g))source(path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1])));}
for(const file of ['House.sol','HouseDependencies.sol','Wager.sol','Wake.sol','WakeExitTask.sol'])source('contracts/src/extensions/experimental/'+file);
source('contracts/src/operating/ExperimentGate.sol');source('test/extensions/experimental-fixtures.sol');
const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{viaIR:true,optimizer:{enabled:true,runs:1000},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}})));
const errors=compiled.errors?.filter(x=>x.severity==='error')??[];assert.deepEqual(errors,[],errors.map(x=>x.formattedMessage).join('\n'));
const artifacts=Object.assign({},...Object.values(compiled.contracts));
async function deploy(name,s,args=[]){const a=artifacts[name],c=await new ContractFactory(a.abi,'0x'+a.evm.bytecode.object,s).deploy(...args);await c.waitForDeployment();return c;}
async function tx(p){return(await p).wait();}
async function rejected(fn){await assert.rejects(async()=>{const r=await fn();if(r?.wait)await r.wait();});}
async function now(p){return Number((await p.getBlock('latest')).timestamp);}
async function time(f,to){const n=await now(f.p);if(to>n)await f.rpc.request({method:'evm_increaseTime',params:[to-n]});await f.rpc.request({method:'evm_mine',params:[]});}
const hash=n=>keccak256(toUtf8Bytes(String(n))),MAX=2n**112n-1n;
async function fixture(t){
 const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},logging:{quiet:true},wallet:{totalAccounts:7},miner:{timestampIncrement:0}});t.after(()=>rpc.disconnect());
 const p=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});p.pollingInterval=5;const ss=await Promise.all(Array.from({length:7},(_,i)=>p.getSigner(i)));const addrs=await Promise.all(ss.map(s=>s.getAddress()));
 const gate=await deploy('ExperimentGate',ss[0],[addrs[0]]),q=await deploy('ExperimentalTokenMock',ss[0],[6]),b=await deploy('ExperimentalTokenMock',ss[0],[18]);
 for(const a of addrs){await tx(q.mint(a,10n**27n));await tx(b.mint(a,10n**27n));}
 return{rpc,p,ss,addrs,gate,q,b,a:ss[0],l:ss[1],x:ss[2]};
}
async function approve(f,c){for(const s of f.ss)for(const a of [f.q,f.b])await tx(a.connect(s).approve(c.target,MAX));await tx(f.gate.set(c.target,true));}
async function backedHouse(f,adapter=false){
 const oracle=await deploy('ExperimentalOracleMock',f.a),market=await deploy('ExperimentalVenueMock',f.a,[f.q.target,f.b.target,10n**18n]);
 await tx(oracle.set(2000n*10n**6n,await now(f.p)));await tx(market.configure(2000n*10n**6n,false,false));
 await tx(f.q.mint(market.target,10n**29n));await tx(f.b.mint(market.target,10n**29n));
 const venue=adapter?await deploy('HouseNativeMarketVenue',f.a,[market.target]):market;
 const house=await deploy('House',f.a,[f.gate.target,f.q.target,f.b.target,oracle.target,venue.target,10n**18n,120,60,100,11000]);await approve(f,house);
 const at=await now(f.p),terms=[1000n*10n**6n,2000n*10n**6n,2020n*10n**6n,1485n*10n**15n,1900n*10n**6n,2100n*10n**6n,at+100,at+300];
 return{house,oracle,venue,market,terms};
}
async function opened(f,h){await tx(h.house.offer(h.terms));await tx(h.house.connect(f.l).fund(await h.house.count(),h.terms[3],h.terms[7]));return await h.house.count();}
async function conserved(c,asset){const r=await c.reserve(asset);assert.equal(r.held,r.liabilities+r.surplus);}

test('House buys real spot with borrowed principal, realizes profit, and conserves isolated claims after gate closes',async t=>{
 const f=await fixture(t),h=await backedHouse(f,true),id=await opened(f,h);
 assert.equal((await h.house.position(id)).heldBase,15n*10n**17n);assert.equal(await f.b.balanceOf(h.house.target),15n*10n**17n);
 assert.equal(await f.q.allowance(h.house.target,h.venue.target),0n);assert.equal(await f.q.allowance(h.venue.target,h.market.target),0n);
 await tx(h.oracle.set(2500n*10n**6n,await now(f.p)));await tx(h.market.configure(2500n*10n**6n,false,false));
 await tx(f.gate.set(h.house.target,false));await rejected(()=>h.house.offer(h.terms));await tx(h.house.close(id,3700n*10n**6n,h.terms[7]));
 assert.equal(await h.house.claimable(f.addrs[1],f.q.target),2020n*10n**6n);assert.equal(await h.house.claimable(f.addrs[0],f.q.target),1730n*10n**6n);
 await conserved(h.house,f.q.target);await tx(h.house.connect(f.x).withdrawFor(f.addrs[0],f.q.target));await rejected(()=>h.house.withdrawFor(f.addrs[0],f.q.target));await conserved(h.house,f.q.target);
});

test('House adverse gap has borrower-first loss, disclosed lender debt shortfall, and no first-closer reserve advantage',async t=>{
 const f=await fixture(t),h=await backedHouse(f);const id1=await opened(f,h),id2=await opened(f,h);
 await tx(h.oracle.set(800n*10n**6n,await now(f.p)));await tx(h.market.configure(800n*10n**6n,false,false));
 await tx(h.house.connect(f.x).close(id2,1188n*10n**6n,h.terms[7]));await tx(h.house.connect(f.x).close(id1,1188n*10n**6n,h.terms[7]));
 for(const id of[id1,id2]){const p=await h.house.position(id);assert.equal(p.proceeds,1200n*10n**6n);assert.equal(p.debtShortfall,820n*10n**6n);}
 assert.equal(await h.house.claimable(f.addrs[0],f.q.target),0n);assert.equal(await h.house.claimable(f.addrs[1],f.q.target),2400n*10n**6n);await conserved(h.house,f.q.target);await conserved(h.house,f.b.target);
});

test('House blocks stale/future/out-of-entry-bound prices, dishonest venue receipts and inadequate fills; refunds remain live',async t=>{
 const f=await fixture(t),h=await backedHouse(f);await tx(h.house.offer(h.terms));
 for(const [price,at] of [[2000n*10n**6n,await now(f.p)-121],[2000n*10n**6n,await now(f.p)+1],[5000n*10n**6n,await now(f.p)],[0,await now(f.p)]]){await tx(h.oracle.set(price,at));await rejected(()=>h.house.connect(f.l).fund(1,h.terms[3],h.terms[7]));}
 await tx(h.oracle.set(2000n*10n**6n,await now(f.p)));await tx(h.market.configure(2000n*10n**6n,true,false));await rejected(()=>h.house.connect(f.l).fund(1,h.terms[3],h.terms[7]));
 await tx(h.market.configure(4000n*10n**6n,false,false));await rejected(()=>h.house.connect(f.l).fund(1,h.terms[3],h.terms[7]));
 assert.equal((await h.house.position(1)).status,1n);await tx(f.gate.set(h.house.target,false));await tx(h.house.cancel(1));assert.equal(await h.house.claimable(f.addrs[0],f.q.target),h.terms[0]);await conserved(h.house,f.q.target);
});

test('House repay and predetermined in-kind expiry need neither oracle nor venue, including disabled entries',async t=>{
 const f=await fixture(t),h=await backedHouse(f);const a=await opened(f,h),b=await opened(f,h);
 await tx(h.oracle.set(0,0));await tx(h.market.configure(2000n*10n**6n,false,true));await tx(f.gate.set(h.house.target,false));
 await tx(h.house.repay(a));assert.equal(await h.house.claimable(f.addrs[0],f.b.target),15n*10n**17n);
 await rejected(()=>h.house.settleInKind(b));await time(f,h.terms[7]+60);await tx(h.house.connect(f.x).settleInKind(b));
 assert.equal(await h.house.claimable(f.addrs[1],f.b.target),101n*10n**16n);assert.equal(await h.house.claimable(f.addrs[0],f.b.target),199n*10n**16n);
 await rejected(()=>h.house.repay(b));await conserved(h.house,f.b.target);await conserved(h.house,f.q.target);
});

test('House feed ratio normalizes 6/8/18 decimals and rejects stale, negative and source decimal mutation',async t=>{
 const f=await fixture(t),base=await deploy('ExperimentalFeedMock',f.a,[8]),quote=await deploy('ExperimentalFeedMock',f.a,[18]);
 await tx(base.set(2000n*10n**8n,await now(f.p)));await tx(quote.set(10n**18n,await now(f.p)));
 const o=await deploy('HouseFeedRatio',f.a,[base.target,quote.target,6,120]);assert.equal((await o.price())[0],2000n*10n**6n);
 for(const decimals of [8,18]){const scaled=await deploy('HouseFeedRatio',f.a,[base.target,quote.target,decimals,120]);assert.equal((await scaled.price())[0],2000n*10n**BigInt(decimals));}
 await tx(quote.set(2n*10n**18n,await now(f.p)));assert.equal((await o.price())[0],1000n*10n**6n);
 await tx(base.set(-1,await now(f.p)));await rejected(()=>o.price());await tx(base.set(2000n*10n**8n,await now(f.p)-121));await rejected(()=>o.price());
 await tx(base.set(2000n*10n**8n,await now(f.p)));await tx(base.setDecimals(6));await rejected(()=>o.price());
});

test('House rejects a reentrant state mutation during the actual funded-token transfer',async t=>{
 const f=await fixture(t),h=await backedHouse(f);await tx(h.house.offer(h.terms));
 await tx(f.b.attack(h.house.target,h.house.interface.encodeFunctionData('close',[1,1,h.terms[7]])));
 await tx(h.house.connect(f.l).fund(1,h.terms[3],h.terms[7]));assert.equal(await f.b.attackAttempted(),true);assert.equal(await f.b.attackSucceeded(),false);
 assert.equal((await h.house.position(1)).status,2n);await conserved(h.house,f.b.target);
});

async function wager(f){const w=await deploy('Wager',f.a,[f.gate.target,f.q.target]);await approve(f,w);const at=await now(f.p),terms=[hash('Will the specified event occur?'),hash('evidence-source-v1'),f.addrs[2],f.addrs[3],40,60,5,at+100,at+200,at+300,at+500,50,true];return{w,terms};}
async function matched(f,h){await tx(h.w.create(h.terms));const id=await h.w.count();await tx(h.w.connect(f.l).accept(id));return id;}
test('Wager executes a funded outcome trade and pays the new winner; unchallenged bond and pull claims conserve funds',async t=>{
 const f=await fixture(t),h=await wager(f),id=await matched(f,h);await tx(h.w.offerSide(id,true,30,ZeroAddress));
 await rejected(()=>h.w.connect(f.ss[4]).buySide(id,true,31,f.addrs[0]));await tx(h.w.connect(f.ss[4]).buySide(id,true,30,f.addrs[0]));
 assert.equal((await h.w.market(id)).maker,f.addrs[4]);assert.equal(await h.w.claimable(f.addrs[0],f.q.target),30n);
 await time(f,h.terms[8]);await tx(f.gate.set(h.w.target,false));await tx(h.w.connect(f.x).propose(id,true,hash('proof evidence')));await time(f,h.terms[8]+50);
 await rejected(()=>h.w.connect(f.l).challenge(id,hash('late')));await tx(h.w.finalize(id));assert.equal(await h.w.claimable(f.addrs[4],f.q.target),100n);assert.equal(await h.w.claimable(f.addrs[2],f.q.target),5n);
 await rejected(()=>h.w.finalize(id));await conserved(h.w,f.q.target);
});
test('Wager challenged result gives the correct challenger both bonds; losing side cannot double-claim',async t=>{
 const f=await fixture(t),h=await wager(f),id=await matched(f,h);await time(f,h.terms[8]);await tx(h.w.connect(f.x).propose(id,true,hash('yes')));await tx(h.w.connect(f.l).challenge(id,hash('no')));
 await rejected(()=>h.w.finalize(id));await rejected(()=>h.w.arbitrate(id,0,hash('no')));await tx(h.w.connect(f.ss[3]).arbitrate(id,0,hash('final no')));
 assert.equal(await h.w.claimable(f.addrs[1],f.q.target),110n);assert.equal(await h.w.claimable(f.addrs[0],f.q.target),0n);await conserved(h.w,f.q.target);
});
test('Wager authority ends before void at exact deadlines; missing resolver, missing arbiter and invalid answer refund all escrows',async t=>{
 const f=await fixture(t),h=await wager(f),a=await matched(f,h),b=await matched(f,h),c=await matched(f,h);
 await time(f,h.terms[8]);for(const id of[b,c]){await tx(h.w.connect(f.x).propose(id,true,hash('yes')));await tx(h.w.connect(f.l).challenge(id,hash('no')));}
 await tx(h.w.connect(f.ss[3]).arbitrate(c,2,hash('invalid')));
 await time(f,h.terms[9]);await rejected(()=>h.w.connect(f.x).propose(a,true,hash('late')));await tx(h.w.voidExpired(a));
 await time(f,h.terms[10]);await rejected(()=>h.w.connect(f.ss[3]).arbitrate(b,1,hash('late')));await tx(h.w.voidExpired(b));
 assert.equal(await h.w.claimable(f.addrs[0],f.q.target),120n);assert.equal(await h.w.claimable(f.addrs[1],f.q.target),190n);assert.equal(await h.w.claimable(f.addrs[2],f.q.target),10n);
 await rejected(()=>h.w.voidExpired(b));await conserved(h.w,f.q.target);
});
test('Wager unfilled cancel and hostile token withdrawal callback cannot seize another claim',async t=>{
 const f=await fixture(t),h=await wager(f);await tx(h.w.create(h.terms));await tx(f.gate.set(h.w.target,false));await tx(h.w.cancel(1));
 await tx(f.q.attack(h.w.target,h.w.interface.encodeFunctionData('withdrawFor',[f.addrs[0],f.q.target])));await tx(h.w.withdrawFor(f.addrs[0],f.q.target));
 assert.equal(await f.q.attackAttempted(),true);assert.equal(await f.q.attackSucceeded(),false);assert.equal(await h.w.claimable(f.addrs[0],f.q.target),0n);await conserved(h.w,f.q.target);
});

test('Wager accepts the last permitted proposal, preserves its full challenge window and never expires an earned claim',async t=>{
 const f=await fixture(t),h=await wager(f),id=await matched(f,h);await time(f,h.terms[9]-1);await tx(h.w.connect(f.x).propose(id,true,hash('last timestamp')));
 await time(f,h.terms[9]);await rejected(()=>h.w.voidExpired(id));await rejected(()=>h.w.finalize(id));
 await time(f,h.terms[9]-1+h.terms[11]);await tx(h.w.finalize(id));await time(f,h.terms[10]+366*86400);
 const before=await f.q.balanceOf(f.addrs[0]);await tx(h.w.withdrawFor(f.addrs[0],f.q.target));assert.equal(await f.q.balanceOf(f.addrs[0])-before,100n);await conserved(h.w,f.q.target);
});

async function wake(f){const task=await deploy('ExperimentalWakeTaskMock',f.a),w=await deploy('Wake',f.a,[f.gate.target,f.q.target,f.addrs[6],task.target,3,1,100,10,1,1000]);await tx(task.bind(w.target));await approve(f,w);return{w,task};}
test('Wake fractional rent is independent of checkpoint partitioning and views include unposted accrual',async t=>{
 const f=await fixture(t),a=await wake(f),b=await wake(f);const at=await now(f.p);await tx(a.w.take(13,2,at+1000,0));await tx(b.w.take(13,2,at+1000,0));
 for(const n of [1,3,7,13,26,49,75,99]){await time(f,at+n);await tx(a.w.checkpoint());}
 const view=await b.w.accruedRent();assert.equal(view.whole,1n);assert.equal(view.fraction,287n);
 await time(f,at+100);await tx(a.w.checkpoint());await tx(b.w.checkpoint());
 assert.equal(await a.w.claimable(f.addrs[6],f.q.target),2n);assert.equal(await b.w.claimable(f.addrs[6],f.q.target),2n);assert.equal(await a.w.holder(),ZeroAddress);
 for(const w of[a.w,b.w])await conserved(w,f.q.target);
});
test('Wake takeover credits a rejecting incumbent, refunds unused rent, invalidates epochs, and gate closure leaves releases open',async t=>{
 const f=await fixture(t),h=await wake(f),reject=await deploy('ExperimentalRejectingHolder',f.a);await tx(f.q.mint(reject.target,1000));
 await tx(reject.execute(f.q.target,f.q.interface.encodeFunctionData('approve',[h.w.target,1000])));const at=await now(f.p);
 await tx(reject.execute(h.w.target,h.w.interface.encodeFunctionData('take',[100,10,at+1000,0])));const epoch=await h.w.epoch();
 await time(f,at+13);await tx(h.w.connect(f.l).take(101,111,at+1000,epoch));
 assert.equal(await h.w.claimable(reject.target,f.q.target),108n);assert.equal(await h.w.claimable(f.addrs[6],f.q.target),2n);
 await rejected(()=>h.w.run(hash('stale'),'0x',epoch));await tx(f.gate.set(h.w.target,false));await rejected(async()=>h.w.take(103,200,at+1000,await h.w.epoch()));
 await tx(h.w.connect(f.l).release(await h.w.epoch()));assert.equal(await h.w.claimable(f.addrs[1],f.q.target),11n);await conserved(h.w,f.q.target);
});
test('Wake forbids other keepers during exclusivity, permits stalled-holder fallback, and cannot renew expiry or replay task',async t=>{
 const f=await fixture(t),h=await wake(f),at=await now(f.p);await tx(h.w.take(10,1,at+1000,0));const epoch=await h.w.epoch();
 await rejected(()=>h.w.connect(f.l).run(hash('first'),'0x',epoch));await time(f,at+10);await tx(h.w.connect(f.l).run(hash('first'),'0x',epoch));assert.equal(await h.task.keeper(),f.addrs[1]);
 await rejected(()=>h.w.connect(f.l).run(hash('first'),'0x',epoch));await tx(h.w.run(hash('second'),'0x',epoch));await rejected(()=>h.w.connect(f.l).run(hash('third'),'0x',epoch));
 assert.equal(await h.w.expiresAt(),BigInt(at+100));await tx(h.task.setFail(true));await rejected(()=>h.w.run(hash('failing'),'0x',epoch));assert.equal(await h.w.runCount(),2n);
 await tx(h.task.setFail(false));await time(f,at+100);await tx(h.w.connect(f.x).run(hash('after-expiry'),'0x',epoch));assert.equal(await h.w.holder(),ZeroAddress);await conserved(h.w,f.q.target);
});
test('Wake concrete exit adapter binds once and executes a real task transition without granting account authority',async t=>{
 const f=await fixture(t),vault=await deploy('ExperimentalExitVaultMock',f.a),target=await deploy('WakeExitTask',f.a,[vault.target]);
 const w=await deploy('Wake',f.a,[f.gate.target,f.q.target,f.addrs[6],target.target,3,1,100,10,1,1000]);await tx(target.bind(w.target));await rejected(()=>target.bind(w.target));
 const data=AbiCoder.defaultAbiCoder().encode(['uint256','uint256'],[7,2]),task=keccak256(data);
 await rejected(()=>target.perform(task,f.addrs[0],data));await tx(w.run(task,data,0));assert.equal(await vault.done(7,2),true);await rejected(()=>w.run(task,data,0));
});
test('Experimental typed review binds live funding, caller, deployment version and gate without signing',async t=>{
 const f=await fixture(t),h=await backedHouse(f);await tx(h.house.offer(h.terms));
 const input={contract:'House',address:h.house.target,method:'fund',args:[1,h.terms[3],h.terms[7]],caller:f.addrs[1],abi:artifacts.House.abi};
 const prepared=await prepareExperimentalAction(f.p,input);assert.deepEqual(prepared.inputs,[{asset:f.q.target,maximum:String(h.terms[1])}]);
 assert.equal(prepared.data,h.house.interface.encodeFunctionData('fund',input.args));assert.equal(prepared.value,'0');assert.ok(prepared.review.rows.some(([label,value])=>label==='Fixed debt raw units'&&value===String(h.terms[2])));
 await tx(f.gate.set(h.house.target,false));await rejected(()=>prepareExperimentalAction(f.p,input));
 const cancellation=await prepareExperimentalAction(f.p,{...input,method:'cancel',args:[1],caller:f.addrs[0]});assert.deepEqual(cancellation.inputs,[]);
 const seat=await wake(f);await rejected(()=>prepareExperimentalAction(f.p,{contract:'Wake',address:seat.w.target,method:'take',args:[100,1,h.terms[7],0],caller:f.addrs[0],abi:artifacts.Wake.abi}));
 for(const entry of ACTIONS){const a=artifacts[entry.contract].abi.find(x=>x.type==='function'&&x.name===entry.method);assert.ok(a,entry.id);assert.equal(a.inputs.length,entry.fields.length,entry.id);}
});
test('All experimental executor runtimes fit EIP-170',()=>{for(const n of ['House','HouseFeedRatio','HouseNativeMarketVenue','Wager','Wake','WakeExitTask'])assert.ok(artifacts[n].evm.deployedBytecode.object.length/2<=24576,n);});
