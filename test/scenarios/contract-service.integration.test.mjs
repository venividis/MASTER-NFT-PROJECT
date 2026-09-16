import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenarioServer} from '../../agent/scenarios/server.mjs';
import {ScenarioClient} from '../../web/launchpad/scenario-client.mjs';

test('authenticated browser client drives a funded official CCA lifecycle on its isolated local chain', {timeout:180000}, async t=>{
 const service=await createScenarioServer({maxSessions:1}),client=new ScenarioClient({url:service.url,accessCode:service.accessCode});
 t.after(async()=>{await client.close();await service.close();});
 const created=await client.start({mechanism:'cca',outcome:'success',options:{protocolFeePips:10000}});
 assert.equal(created.snapshot.mode,'isolated-contract-scenario');assert.equal(created.snapshot.chainId,31337);
 const step=async command=>{const {snapshot}=await client.step(command);assert.notEqual(snapshot.last.status,'rejected',snapshot.last.error);assert.equal(snapshot.conservation.tokenResidual,'0');assert.equal(snapshot.conservation.nativeResidual,'0');return snapshot;};
 await step({action:'advance',phase:'start'});
 const funded=await step({action:'bid',actor:0,amount:'0.1',maxPrice:'0.00002'});assert.equal(funded.last.status,'confirmed');assert.ok(funded.last.receipts.length);assert.equal(funded.bids.length,1);
 await step({action:'advance',phase:'claim'});await step({action:'checkpoint'});await step({action:'exit',bidId:0});await step({action:'claim',bidId:0});
 const complete=await step({action:'migrate'});assert.equal(complete.custody.liquidityNFTs,'1');
 assert.ok(complete.balances.some(row=>row.label==='Participant 1'&&BigInt(row.token)>0n));
 await client.close();assert.equal(client.accessCode,'');assert.equal(client.session,null);assert.equal(client.current,null);
});
