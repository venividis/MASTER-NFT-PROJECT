import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,poolModel,poolTrade,units,hydrateDraft} from '../../web/launchpad/model.mjs';
import {replayPool,replaySale,scenarioJSON} from '../../web/launchpad/scenarios.mjs';
import {LaunchStudio} from '../../web/launchpad/studio.mjs';
import {VaultStrategyDesk} from '../../web/launchpad/vault-ui.mjs';

test('repeatable multi-event swap replay conserves both currencies through two directions, flush and actual fee claims',()=>{
 const d={...defaults(),hookEnabled:true,recipients:[{label:'Creator',recipient:'',weight:'3',outputToken:'0x'+'0'.repeat(40)},{label:'Community',recipient:'',weight:'1',outputToken:'0x'+'0'.repeat(40)}]};
 for(const decimals of ['6','18'])for(const tokenOrder of ['token0','token1']){
  const draft={...d,quoteDecimals:decimals,scenarioTokenOrder:tokenOrder,eventSequence:'fund alice 2\nbuy alice 0.1\nbuy alice 0.2\nsell alice 100\nflush\nclaim 1\nclaim 2'},r=replayPool(draft);
  assert.equal(r.complete,true,JSON.stringify(scenarioJSON(r.history)));assert.ok(r.history.every(e=>e.conservation.balanced));assert.equal(r.state.volume.token,units('100'));
  assert.equal(r.state.volume.quote,units('0.3',Number(decimals)));assert.equal(r.state.hookPending.quote+r.state.hookPending.token,0n);
  assert.equal(r.state.claims['recipient:1'].quote+r.state.claims['recipient:2'].quote,0n);
  assert.equal(r.state.accounts['recipient:1'].quote+r.state.accounts['recipient:2'].quote,r.state.feeTotal.quote);
  assert.equal(r.state.accounts['recipient:1'].token+r.state.accounts['recipient:2'].token,r.state.feeTotal.token);
  assert.deepEqual(scenarioJSON(r),scenarioJSON(replayPool(draft)));
  for(const e of r.history.filter(e=>e.kind==='buy'||e.kind==='sell')){assert.equal(e.gross,e.hookFee+e.lpFee+e.net);assert.equal(e.poolInput,e.gross-e.hookFee);}
 }
});
test('split changes affect unflushed accrual while preserving already deposited recipient claims',()=>{
 const d={...defaults(),hookEnabled:true,hookPercent:'1',recipients:[{weight:'1'},{weight:'1'}]};
 const r=replayPool(d,'fund alice 1\nbuy alice 0.1\nflush\nweights 3 1\nbuy alice 0.1\nflush');assert.equal(r.complete,true);
 assert.equal(r.state.claims['recipient:1'].quote,units('0.00125'));assert.equal(r.state.claims['recipient:2'].quote,units('0.00075'));
 const delayed=replayPool(d,'fund alice 1\nbuy alice 0.1\nweights 3 1\nflush');assert.equal(delayed.state.claims['recipient:1'].quote,units('0.00075'));
});
test('failed full-fill or insufficient-balance events are atomic and stop remaining events',()=>{
 const d={...defaults(),range:'custom',lowerPrice:'0.000019',upperPrice:'0.000021'},before=replayPool(d,'fund alice 1000'),after=replayPool(d,'fund alice 1000\nbuy alice 1000\nsell creator 1');
 assert.equal(after.complete,false);assert.match(after.history[1].error,/edge|range/);assert.equal(after.history.length,2);assert.deepEqual(after.state,before.state);assert.equal(after.conservation.balanced,true);
 const empty=replayPool(defaults(),'sell alice 1');assert.match(empty.history[0].error,/does not hold/);assert.equal(empty.state.accounts.alice,undefined);
});
test('time, vested supply and explicit sales are independent transformations without invented supply',()=>{
 const d={...defaults(),retainedLockAmount:'10000',retainedCliffDays:'30',retainedVestingDays:'100'};
 const locked=replayPool(d,'advance 29\nunlock');assert.equal(locked.complete,false);assert.equal(locked.state.lock.remaining,units('10000'));assert.equal(locked.state.model.price,poolModel(d).price);
 const r=replayPool(d,'advance 30\nunlock\nsell creator 1000');assert.equal(r.complete,true);assert.equal(r.state.lock.released,units('3000'));assert.equal(r.state.lock.remaining,units('7000'));assert.equal(r.state.trades,1);assert.ok(r.state.model.price<poolModel(d).price);assert.equal(r.conservation.token,units(d.supply));
});
test('community sale replay preserves exact claim rounding, failure refunds, cap rejection and fixed vesting destinations',()=>{
 const d={...defaults(),mode:'sale',supply:'1000000.000000000000000001'},r=replaySale(d);assert.equal(r.complete,true);assert.equal(r.state.status,'successful');assert.equal(r.state.accounts.alice.token,units('100000'));assert.equal(r.state.accounts.bob.token,units('400000'));assert.equal(r.state.accounts.creator.token,units('100000'));assert.equal(r.state.treasuryLocked,0n);assert.equal(r.conservation.balanced,true);
 const failed=replaySale({...d,soft:'5'},'contribute alice 1\ncontribute bob 2\nclose\nsettle\nclaim bob\nclaim alice');assert.equal(failed.complete,true);assert.equal(failed.state.accounts.alice.quote,units('1'));assert.equal(failed.state.accounts.bob.quote,units('2'));assert.equal(failed.state.saleTokens,units(d.supply));assert.equal(failed.state.lpToken,0n);
 const cap=replaySale({...d,hard:'2'},'contribute alice 1\ncontribute bob 2');assert.equal(cap.complete,false);assert.equal(cap.state.raised,units('1'));assert.match(cap.history[1].error,/rejects overflow/);
 const rounded=replaySale({...d,supply:'1',founderPercent:'0',liquidityPercent:'50'},'contribute alice 1\ncontribute bob 4\nclose\nsettle\nclaim alice\nclaim bob');assert.equal(rounded.complete,true);assert.equal(rounded.state.saleTokens,1n);assert.equal(rounded.conservation.balanced,true);
});
test('studio includes creator fees in first trade, same replay fee destinations, and explicit raw-unit export',()=>{
 const d={...defaults(),hookEnabled:true},plain=poolTrade(poolModel({...d,hookEnabled:false}),'buy','0.1'),hooked=poolTrade(poolModel(d),'buy','0.1');assert.equal(hooked.hookFee,units('0.0005'));assert.ok(hooked.out<plain.out);
 const studio=new LaunchStudio();studio.d=d;studio.step=2;const html=studio.html();assert.match(html,/Replay the whole sequence/);assert.match(html,/Creator hook fee/);assert.match(html,/data-lp-field="eventSequence"/);assert.match(html,/Creator fees from accepted replay trades/);assert.doesNotMatch(html,/excluded from the plain-pool/);
 assert.deepEqual(hydrateDraft(d).eventSequence,d.eventSequence);assert.throws(()=>hydrateDraft({...d,scenarioTokenOrder:'arbitrary'}),/ordering/);
 studio.d.recipients[0].recipient='0x1111111111111111111111111111111111111111';studio.d.volume='not a transaction term';assert.doesNotThrow(()=>studio.validateStep(3));
});

test('editing or leaving a vault preparation cannot surface stale plans or stale lock results',async()=>{
 let prepared=0,resolve;const chain={generation:0,plan:null,invalidate(){this.generation++;this.plan=null;}},desk=new VaultStrategyDesk(chain,{onPrepared:()=>prepared++});
 desk.client={deposit:()=>new Promise(r=>resolve=r)};const pending=desk.action('deposit');desk.result={id:'old lock'};desk.configure({vault:'new deployment'});assert.equal(desk.result,null);
 const plan={kind:'vault-deposit'};chain.plan=plan;resolve(plan);await pending;assert.equal(prepared,0);assert.equal(chain.plan,null);
 const next=desk.action('deposit');desk.unmount();chain.plan=plan;resolve(plan);await next;assert.equal(prepared,0);assert.equal(chain.plan,null);
});
