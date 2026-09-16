import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createOfficialScenario} from '../scenario/runner.mjs';
const evidence=[];
function conserved(s){assert.equal(s.conservation.tokenResidual,'0');assert.equal(s.conservation.nativeResidual,'0');if(s.custody.lpResidual!==undefined)assert.equal(s.custody.lpResidual,'0');}
async function execute(session,c,status='confirmed'){const s=await session.step(c);assert.equal(s.last.status,status,s.last.error);conserved(s);return s;}
for(const outcome of ['success','failed-minimum','migration-failure'])test(`real CCA sequence conserves every asset: ${outcome}`,{timeout:180000},async()=>{
  const session=await createOfficialScenario({mechanism:'cca',outcome});try{
    let s=await session.snapshot();conserved(s);await execute(session,{action:'bid',amount:'1',maxPrice:'0.001'},'rejected');
    await execute(session,{action:'advance',phase:'start'},'advanced');await execute(session,{action:'bid',actor:0,amount:'1',maxPrice:'0.001'});await execute(session,{action:'bid',actor:1,amount:'0.2',maxPrice:'0.002'});
    await execute(session,{action:'advance',phase:'claim'},'advanced');await execute(session,{action:'checkpoint'});await execute(session,{action:'exit',bidId:0});s=await execute(session,{action:'exit',bidId:1});
    if(outcome==='failed-minimum'){for(const a of s.actors)assert.equal(s.balances.find(x=>x.address===a.address).economicNativeDelta,'0');await execute(session,{action:'claim',bidId:0},'rejected');await execute(session,{action:'sweepTokens'});await execute(session,{action:'migrate'});}
    else{await execute(session,{action:'claim',bidId:0});await execute(session,{action:'claim',bidId:1});s=await execute(session,{action:'migrate'});assert.equal(s.custody.migrationOutcome,outcome==='migration-failure'?'recovered':'migrated');assert.equal(BigInt(s.custody.liquidityNFTs)>0n,outcome==='success');assert.ok(BigInt(s.protocolFees.receivedNative)>0n);await execute(session,{action:'claim',bidId:0},'rejected');}
    evidence.push({mechanism:'cca',outcome,steps:s.history.length,conservation:s.conservation});
  }finally{await session.close();}
});
for(const outcome of ['success','failed-minimum'])test(`real Doppler sequence conserves every asset: ${outcome}`,{timeout:180000},async()=>{
  const session=await createOfficialScenario({mechanism:'doppler',outcome,options:{proceedsShare:'0.1',tradingFee:300}});try{
    await execute(session,{action:'migrate'},'rejected');await execute(session,{action:'advance',phase:'start'},'advanced');const q=await execute(session,{action:'quote',side:'buy',actor:0,amount:'1'},'quoted');
    let s=await execute(session,{action:'trade',side:'buy',actor:0,amount:'1'});assert.equal(s.last.verification.effects[0].received,q.last.quote.received);await execute(session,{action:'trade',side:'buy',actor:1,amount:'0.1'});await execute(session,{action:'advance',phase:'end'},'advanced');
    if(outcome==='success'){s=await execute(session,{action:'migrate'});assert.equal(s.custody.migrated,true);assert.ok(BigInt(s.protocolFees.native)>0n);assert.ok(BigInt(s.protocolFees.integratorNative)>0n);await execute(session,{action:'collectProtocolFees'});await execute(session,{action:'collectIntegratorFees'});await execute(session,{action:'migrate'},'rejected');await execute(session,{action:'exitLockedLP'},'rejected');await execute(session,{action:'advance',phase:'unlock'},'advanced');s=await execute(session,{action:'exitLockedLP'});assert.equal(s.custody.lpBalances.some(x=>x.label==='Protocol LP locker'),false);}
    else{for(const actor of s.actors){s=await session.snapshot();const row=s.balances.find(x=>x.address===actor.address);s=await execute(session,{action:'trade',side:'sell',actor:actor.id,amount:row.tokenFormatted});assert.equal(s.balances.find(x=>x.address===actor.address).token,'0');}await execute(session,{action:'trade',side:'buy',amount:'1'},'rejected');await execute(session,{action:'migrate'},'rejected');}
    evidence.push({mechanism:'doppler',outcome,steps:s.history.length,conservation:s.conservation});
  }finally{await session.close();}
});
test('runner rejects untrusted controls and honors cancellation',async()=>{await assert.rejects(createOfficialScenario({mechanism:'cca',options:{rpc:'https://mainnet.example'}}));await assert.rejects(createOfficialScenario({mechanism:'doppler',outcome:'migration-failure'}));const c=new AbortController();c.abort();await assert.rejects(createOfficialScenario({mechanism:'cca'},{signal:c.signal}));});
test.after(()=>fs.writeFileSync(new URL('../artifacts/scenario-evidence.json',import.meta.url),JSON.stringify({source:'Actual pinned contracts on isolated funded Anvil; no public RPC',evidence},null,2)+'\n'));
