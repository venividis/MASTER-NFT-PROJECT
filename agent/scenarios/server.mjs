import http from 'node:http';
import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateScenarioCreate,validateScenarioCommand} from '../../web/launchpad/scenario-rules.mjs';
const secret=()=>randomBytes(32).toString('hex');
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const matches=(a,b)=>typeof a==='string'&&/^[\da-f]{64}$/i.test(a)&&typeof b==='string'&&/^[\da-f]{64}$/i.test(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function body(req){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>8192)throw fail('Scenario request exceeds8KiB.',413);parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{throw fail('Expected scenario JSON.');}}
export async function createScenarioServer({host='127.0.0.1',port=0,allowedOrigin,accessCode=secret(),maxSessions=3,maxSteps=128,ttlMs=20*60*1000,createRunner}={}){
 if(!['127.0.0.1','::1'].includes(host))throw Error('The local contract scenario service binds only to loopback.');
 if(!/^[\da-f]{64}$/i.test(accessCode))throw Error('Use a random64-hex scenario access code.');
 if(!Number.isSafeInteger(maxSessions)||maxSessions<1||maxSessions>8||!Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>256||!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>3600000)throw Error('Scenario service limits are outside their allowed bounds.');
 if(allowedOrigin&&new URL(allowedOrigin).origin!==allowedOrigin)throw Error('Allowed origin must be a bare origin.');
 const sessions=new Map(),rates=new Map(),starts=new Set();let pendingStarts=0,actualOrigin,closed=false;
 const factory=createRunner||((config,options)=>import('../../integrations/official-launch/scenario/runner.mjs').then(m=>m.createOfficialScenario(config,options)));
 const closeSession=async id=>{const session=sessions.get(id);if(!session)return;sessions.delete(id);session.closed=true;await session.queue.catch(()=>{});await session.runner.close();};
 const auth=(req,expected)=>{const bearer=req.headers.authorization?.replace(/^Bearer /,'');if(!matches(bearer,expected))throw fail('Scenario access code or session is invalid.',401);};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const respond=(status,value)=>{const output=JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v);if(Buffer.byteLength(output)>1048576)throw fail('Scenario result exceeded its bounded response size.',502);res.writeHead(status,{'Content-Type':'application/json'});res.end(output);};
  try{
   const origin=req.headers.origin;if(origin&&origin!==(allowedOrigin||actualOrigin))throw fail('Origin is not allowed.',403);
   if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');}
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   const address=req.socket.remoteAddress,now=Date.now(),rate=rates.get(address);if(!rate||now-rate.at>1000)rates.set(address,{at:now,count:1});else if(++rate.count>30)throw fail('Scenario request rate exceeded.',429);
   const pathname=new URL(req.url,'http://localhost').pathname;
   if(req.method==='GET'&&pathname==='/config')return respond(200,{schema:'anima.contract-scenarios/1',mechanisms:['cca','doppler'],maxSessions,maxSteps,ttlMs,notice:'Dedicated local EVM contracts and fixed test actors. No real funds, external RPCs, wallet keys or arbitrary commands.'});
   if(req.method==='POST'&&pathname==='/sessions'){
    auth(req,accessCode);const config=validateScenarioCreate(await body(req));
    if(sessions.size+pendingStarts>=maxSessions)throw fail('Close an existing scenario before starting another.',429);
    pendingStarts++;let runner;const startup=new AbortController();starts.add(startup);const abortStart=()=>{if(!res.writableEnded)startup.abort();};res.once('close',abortStart);
    try{
     runner=await factory(config,{signal:startup.signal});if(startup.signal.aborted||res.destroyed){await runner.close();return;}const initial=await runner.snapshot();const id=secret().slice(0,32),token=secret(),expires=Date.now()+ttlMs;
     if(closed||startup.signal.aborted||res.destroyed){await runner.close();throw fail('Scenario service is closing.',503);}
     const session={id,token,runner,config,expires,steps:0,queue:Promise.resolve(),commands:new Map(),closed:false,snapshot:initial};sessions.set(id,session);
     return respond(201,{id,token,expires,steps:0,maximumSteps:maxSteps,snapshot:initial});
    }catch(error){if(runner)await runner.close().catch(()=>{});throw error;}finally{pendingStarts--;starts.delete(startup);res.removeListener('close',abortStart);}
   }
   const match=pathname.match(/^\/sessions\/([a-f0-9]{32})(\/step)?$/);if(!match)throw fail('Unknown scenario endpoint.',404);
   const session=sessions.get(match[1]);if(!session||session.expires<=Date.now()){if(session)await closeSession(session.id);throw fail('Scenario session expired. Start a fresh local chain.',410);}auth(req,session.token);
   if(req.method==='DELETE'&&!match[2]){await closeSession(session.id);return respond(200,{closed:true});}
   if(req.method==='GET'&&!match[2]){await session.queue;return respond(200,{id:session.id,expires:session.expires,steps:session.steps,maximumSteps:maxSteps,snapshot:session.snapshot});}
   if(req.method==='POST'&&match[2]){
    const input=await body(req),{commandId,...draft}=input;
    if(typeof commandId!=='string'||!/^[A-Za-z0-9_-]{16,80}$/.test(commandId))throw fail('Supply a stable16–80-character command ID.');
    const command=validateScenarioCommand(draft),fingerprint=hash(Object.fromEntries(Object.entries(command).sort(([a],[b])=>a.localeCompare(b))));
    const operation=session.queue.then(async()=>{
     if(session.closed||session.expires<=Date.now())throw fail('Scenario session expired.',410);
     const prior=session.commands.get(commandId);if(prior){if(prior.fingerprint!==fingerprint)throw fail('Command ID already belongs to another action.',409);if(prior.error)throw fail(prior.error,502);return prior.result;}
     if(session.steps>=maxSteps)throw fail('This scenario reached its bounded step limit. Start a fresh scenario.',429);
     session.steps++;session.commands.set(commandId,{fingerprint,error:'A prior execution requires state recovery; it will not be submitted twice.'});
     let snapshot;
     try{snapshot=await session.runner.step(command);}catch(error){
      try{snapshot=await session.runner.snapshot();snapshot={...snapshot,last:{status:'recovery-required',command,error:'The action may have executed before its response failed. Current chain state was recovered; this command ID will not execute again. '+String(error.message).slice(0,500)}};}
      catch{throw fail('The prior action may have executed. Its command ID is retired; close this scenario if its chain cannot be recovered.',502);}
     }
     session.snapshot=snapshot;
     const result={id:session.id,expires:session.expires,steps:session.steps,maximumSteps:maxSteps,snapshot};session.commands.set(commandId,{fingerprint,result});return result;
    });
    session.queue=operation.catch(()=>{});return respond(200,await operation);
   }
   throw fail('Unsupported scenario operation.',405);
  }catch(error){if(!res.headersSent){try{respond(error.status||400,{error:error.message});}catch{res.writeHead(500);res.end();}}else res.end();}
 });
 server.requestTimeout=180000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 actualOrigin=`http://${host==='::1'?'[::1]':host}:${server.address().port}`;
 const cleanup=setInterval(()=>{for(const [id,session]of sessions)if(session.expires<=Date.now())closeSession(id).catch(()=>{});},1000);cleanup.unref();
 return {url:actualOrigin,accessCode,server,close:async()=>{if(closed)return;closed=true;for(const startup of starts)startup.abort();clearInterval(cleanup);await Promise.all([...sessions.keys()].map(closeSession));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const service=await createScenarioServer({port:Number(process.env.ANIMA_SCENARIO_PORT||8791),allowedOrigin:process.env.ANIMA_SCENARIO_ORIGIN});
 console.log('ANIMA local contract scenarios: '+service.url+'\nPrivate access code: '+service.accessCode+'\nKeep this code in your local browser session.');
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await service.close();process.exit(0);});
}
