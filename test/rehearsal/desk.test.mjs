import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveProtocolDesk} from '../../web/genesis/live-desk.mjs';
import {intentHash,publicIntent} from '../../web/rehearsal/intent.mjs';

const address=n=>'0x'+String(n).repeat(40);
const element=value=>({value,innerHTML:'',replaceChildren(){this.innerHTML='';}});
function fixture(){
  const wallet={plan:null,provider:{}},review=element(),summary=element(),token=element('a'.repeat(64));
  const nodes={'#cf-transaction-review':review,'#ag-live-summary':summary,'#ag-live-rehearsal-url':element('http://127.0.0.1:8788'),'#ag-live-rehearsal-token':token};
  const container={querySelector:s=>nodes[s]||element('')};
  let sequence=0,shown;
  const desk=new LiveProtocolDesk(wallet,plan=>{shown=plan;review.innerHTML=plan.data;},()=>({}),()=>{});
  desk.api.swap=async()=>{
    const data='0x'+(++sequence).toString(16).padStart(2,'0');
    const plan={data,chainId:'31337',collection:address(1),tokenId:'1',epoch:'0',transaction:{to:address(2),from:address(3),data,value:'0'}};
    wallet.plan=plan;return {plan};
  };
  return {wallet,desk,container,review,summary,token,get shown(){return shown;}};
}
function report(plan,status='succeeded'){
  const authority={owner:address(3),epoch:'0',nonce:'0'};
  return {intentHash:intentHash(publicIntent(plan)),status,sourceBlock:{number:'1',hash:'0x'+'a'.repeat(64)},balances:[],allowances:[],locks:[],gas:{used:'21000',cost:'21000'},authority:{before:authority,after:authority}};
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('a failed requested rehearsal retires the old signing review and leaves no unbound replacement',async t=>{
  for(const failure of ['configuration','service'])await t.test(failure,async()=>{
    const x=fixture();await x.desk.submit(x.container);assert.equal(x.wallet.plan,x.shown);assert.ok(x.review.innerHTML);
    if(failure==='configuration')x.token.value='invalid';
    else x.desk.rehearsal.run=async()=>{throw Error('service unavailable');};
    await assert.rejects(x.desk.submit(x.container,true),failure==='configuration'?/session token/:/service unavailable/);
    assert.equal(x.wallet.plan,null);assert.equal(x.review.innerHTML,'');
  });
});

test('a pending rehearsal cannot be signed; success exposes only the matching bound plan',async()=>{
  const x=fixture();await x.desk.submit(x.container);
  const entered=deferred(),completion=deferred();let candidate;
  x.desk.rehearsal.run=async plan=>{candidate=plan;entered.resolve();return completion.promise;};
  const pending=x.desk.submit(x.container,true);await entered.promise;
  assert.equal(x.wallet.plan,null);assert.equal(x.review.innerHTML,'');
  completion.resolve(report(candidate));await pending;
  assert.equal(x.wallet.plan,candidate);assert.equal(x.shown,candidate);assert.equal(x.review.innerHTML,candidate.data);
  assert.equal(candidate.rehearsalBinding.intentHash,intentHash(publicIntent(candidate)));
});

test('reverted or mismatched reports cannot expose a signing plan',async t=>{
  for(const status of ['reverted','mismatched'])await t.test(status,async()=>{
    const x=fixture();await x.desk.submit(x.container);
    x.desk.rehearsal.run=async plan=>status==='reverted'?report(plan,'reverted'):{...report(plan),intentHash:'0x'+'0'.repeat(64)};
    if(status==='reverted')await x.desk.submit(x.container,true);
    else await assert.rejects(x.desk.submit(x.container,true),/mismatched/);
    assert.equal(x.wallet.plan,null);assert.equal(x.review.innerHTML,'');
  });
});

test('late completion of an invalidated rehearsal cannot clear or replace a newer reviewed transaction',async()=>{
  const x=fixture(),entered=deferred(),completion=deferred();let candidate;
  x.desk.rehearsal.run=async plan=>{candidate=plan;entered.resolve();return completion.promise;};
  const pending=x.desk.submit(x.container,true);await entered.promise;
  await x.desk.submit(x.container);const next=x.wallet.plan;
  const rejected=assert.rejects(pending,/Terms changed during rehearsal/);
  completion.resolve(report(candidate));await rejected;
  assert.equal(x.wallet.plan,next);assert.equal(x.shown,next);assert.equal(x.review.innerHTML,next.data);
});

test('preparation failure clears a previously displayed review immediately',async()=>{
  const x=fixture();await x.desk.submit(x.container);
  x.desk.api.swap=async()=>{throw Error('quote unavailable');};
  await assert.rejects(x.desk.submit(x.container),/quote unavailable/);
  assert.equal(x.wallet.plan,null);assert.equal(x.review.innerHTML,'');
});
