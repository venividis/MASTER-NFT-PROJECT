import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenarioServer} from '../../agent/scenarios/server.mjs';
import {ScenarioClient} from '../../web/launchpad/scenario-client.mjs';
import {validateScenarioCommand,validateScenarioCreate} from '../../web/launchpad/scenario-rules.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const post=async(service,path,value,token)=>{const response=await fetch(service.url+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(value)});return{status:response.status,data:await response.json()};};
test('authenticated bounded scenario lifecycle executes one step once and clears client secrets',async t=>{
 let executed=0,closed=0;
 const service=await createScenarioServer({maxSessions:1,maxSteps:2,createRunner:async config=>({snapshot:async()=>({mechanism:config.mechanism,count:executed}),step:async command=>{executed++;await sleep(10);return {count:executed,last:{status:'confirmed',command}};},close:async()=>{closed++;}})});
 t.after(()=>service.close());
 assert.equal((await post(service,'/sessions',{mechanism:'cca'},'0'.repeat(64))).status,401);
 assert.equal((await post(service,'/sessions',{mechanism:'cca'},'é'.repeat(64))).status,401);
 assert.equal((await post(service,'/sessions',{mechanism:'cca',rpc:'https://public.invalid'},service.accessCode)).status,400);
 const started=await post(service,'/sessions',{mechanism:'cca'},service.accessCode);assert.equal(started.status,201);const {id,token}=started.data;
 assert.equal((await post(service,'/sessions',{mechanism:'cca'},service.accessCode)).status,429);
 const command={action:'bid',actor:0,amount:'0.1',maxPrice:'0.00002',commandId:'idempotent-scenario-step-1'};
 const [first,duplicate]=await Promise.all([post(service,'/sessions/'+id+'/step',command,token),post(service,'/sessions/'+id+'/step',command,token)]);
 assert.equal(first.status,200);assert.deepEqual(first.data,duplicate.data);assert.equal(executed,1);
 assert.equal((await post(service,'/sessions/'+id+'/step',{...command,amount:'0.2'},token)).status,409);
 assert.equal((await post(service,'/sessions/'+id+'/step',{action:'checkpoint',commandId:'idempotent-scenario-step-2'},token)).status,200);
 assert.equal((await post(service,'/sessions/'+id+'/step',{action:'checkpoint',commandId:'idempotent-scenario-step-3'},token)).status,429);
 const client=new ScenarioClient({url:service.url,accessCode:service.accessCode});client.session={id,token};client.pending={command:{action:'checkpoint'},commandId:'pending-command-1'};await client.close();assert.equal(client.accessCode,'');assert.equal(client.session,null);assert.equal(client.pending,null);assert.equal(closed,1);
});
test('scenario boundary rejects arbitrary execution parameters and out-of-range values',()=>{
 assert.throws(()=>validateScenarioCommand({action:'trade',actor:0,side:'buy',amount:'1',target:'0x1234'}),/Unexpected/);
 assert.throws(()=>validateScenarioCommand({action:'bid',actor:2,amount:'1',maxPrice:'1'}),/Actor/);
 assert.throws(()=>validateScenarioCommand({action:'bid',actor:0,amount:'1001',maxPrice:'1'}),/bounds/);
 assert.throws(()=>validateScenarioCommand({action:'bid',actor:0,amount:'1000.000000000000000001',maxPrice:'1'}),/bounds/);
 assert.throws(()=>validateScenarioCreate({mechanism:'doppler',outcome:'migration-failure'}),/supported/);
 assert.throws(()=>validateScenarioCreate({mechanism:'cca',options:{privateKey:'bad'}}),/Unexpected/);
 assert.deepEqual(validateScenarioCommand({action:'advance',phase:'claim'}),{action:'advance',phase:'claim'});
});
test('ambiguous post-execution failures recover state without retrying the EVM operation',async t=>{
 let count=0;
 const service=await createScenarioServer({createRunner:async()=>({snapshot:async()=>({count}),step:async()=>{count++;throw Error('Response connection failed after execution.');},close:async()=>{}})});t.after(()=>service.close());
 const {data:session}=await post(service,'/sessions',{mechanism:'cca'},service.accessCode);
 const command={action:'checkpoint',commandId:'ambiguous-execution-1'};
 const first=await post(service,'/sessions/'+session.id+'/step',command,session.token),second=await post(service,'/sessions/'+session.id+'/step',command,session.token);
 assert.equal(first.data.snapshot.last.status,'recovery-required');assert.deepEqual(first.data,second.data);assert.equal(count,1);
});
test('origin checks and cancelled startups prevent remote commands and orphan runners',async t=>{
 let aborted=false;
 const service=await createScenarioServer({allowedOrigin:'https://anima.example',createRunner:async(_, {signal})=>{await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));},{once:true});});}});t.after(()=>service.close());
 const forbidden=await fetch(service.url+'/config',{headers:{Origin:'https://evil.example'}});assert.equal(forbidden.status,403);
 const controller=new AbortController();const starting=fetch(service.url+'/sessions',{method:'POST',headers:{Authorization:'Bearer '+service.accessCode,'Content-Type':'application/json'},body:JSON.stringify({mechanism:'cca'}),signal:controller.signal}).catch(()=>{});
 await sleep(30);controller.abort();await starting;await sleep(30);assert.equal(aborted,true);
});
