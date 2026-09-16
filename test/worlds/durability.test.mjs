import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createWorldServer, verifyReceipt } from '../../agent/worlds/server.mjs';
import { WorldStore } from '../../agent/worlds/store.mjs';
import { newWorld, joinWorld } from '../../worlds/model.mjs';
import { applyWorldPacket } from '../../worlds/transport.mjs';
const request=async(url,endpoint,body,token)=>{const response=await fetch(url+endpoint,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};

test('acknowledged commands survive SIGKILL; retry returns original receipt without spending twice',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'anima-wal-crash-'));
 const launch=()=>spawn(process.execPath,['--input-type=module','-e',`import { createWorldServer } from './agent/worlds/server.mjs';const s=await createWorldServer({stateDir:${JSON.stringify(dir)},demo:true,tickMs:20,maxRequestsPerSecond:1000});console.log(s.url);`],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
 const child=launch();const [line]=await once(child.stdout,'data');const url=line.toString().trim();
 const guest=(await request(url,'/guest',{name:'Durable'})).data;
 const command={type:'gather',item:'wood',sequence:1,commandId:'durable-command-0001'};
 const committed=await request(url,'/command',command,guest.token);assert.equal(committed.status,200);
 child.kill('SIGKILL');await once(child,'exit');
 const service=await createWorldServer({stateDir:dir,demo:true,tickMs:20,maxRequestsPerSecond:1000});
 t.after(async()=>{await service.close();await fs.rm(dir,{recursive:true,force:true});});
 const resumed=(await request(service.url,'/guest',{resumeCode:guest.resumeCode})).data;
 const retry=await request(service.url,'/command',command,resumed.token);
 assert.equal(retry.status,200);assert.deepEqual(retry.data.receipt,committed.data.receipt);assert.equal(verifyReceipt(retry.data.receipt,service.publicKey),true);
 assert.equal(retry.data.world.players[guest.identity].inventory.wood,1);
 assert.equal((await request(service.url,'/command',{...command,item:'ore'},resumed.token)).status,409);
});

test('normalized storage preserves >4MB records; public pages are bounded and journal gaps demand a reset',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'anima-world-pages-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const world=newWorld();for(let n=0;n<20000;n++)joinWorld(world,'guest:'+String(n).padStart(8,'0'),'Traveller '+n);
 assert.ok(Buffer.byteLength(JSON.stringify(world))>4_000_000);
 const store=new WorldStore(dir,world,{historyLimit:3});t.after(()=>store.close());
 const page=store.page('players','',128);assert.equal(Object.keys(page.entities).length,128);assert.ok(page.nextCursor);
 assert.throws(()=>store.page('guestAccess'));assert.throws(()=>store.page('players','',129));
 let state=store.load();state.players['guest:00000000'].coins=77;store.commit(state);
 assert.equal(store.page('players','',1).entities['guest:00000000'].coins,77);
 const original=store.revision;
 for(let i=0;i<5;i++){state.tick++;store.commit(state);}
 assert.equal(store.changes(original).reset,true);assert.equal(store.changes(store.revision-2).deltas.length,2);
 assert.equal(store.load().players['guest:00014999'].name,'Traveller 14999');
});

test('stream uses bearer headers, sends contiguous bounded deltas, and resets cleanly on reconnect',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'anima-world-stream-'));
 const service=await createWorldServer({stateDir:dir,demo:true,tickMs:20,maxRequestsPerSecond:1000});
 t.after(async()=>{await service.close();await fs.rm(dir,{recursive:true,force:true});});
 const guest=(await request(service.url,'/guest',{name:'Stream'})).data;
 assert.equal((await request(service.url,'/stream')).status,401);
 const abort=new AbortController();const response=await fetch(service.url+'/stream',{headers:{Authorization:'Bearer '+guest.token},signal:abort.signal});
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',state,packets=0;
 while(packets<3){const {value}=await reader.read();buffer+=decoder.decode(value);let split;while((split=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);const data=frame.split('\n').find(x=>x.startsWith('data: '));if(data){const packet=JSON.parse(data.slice(6));state=applyWorldPacket(state,packet);packets++;}}}
 assert.equal(state.world.players[guest.identity].name,'Stream');assert.equal(state.view.bounded,true);
 assert.throws(()=>applyWorldPacket(state,{type:'delta',previousRevision:state.revision-1}),/revision gap/);
 abort.abort();await reader.cancel().catch(()=>{});
 const page=await request(service.url,'/state/page?kind=players&limit=1',null,guest.token);assert.equal(Object.keys(page.data.entities).length,1);
});

test('legacy snapshot import is atomic and subsequent starts use the database even if the obsolete snapshot is corrupt',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'anima-world-import-'));
 const initial=newWorld();joinWorld(initial,'guest:legacy','Preserved');initial.players['guest:legacy'].coins=123;initial.orders['1']={id:'1',seller:'guest:legacy',item:'wood',quantity:3,price:8};
 await fs.writeFile(path.join(dir,'world.json'),JSON.stringify(initial));
 let service=await createWorldServer({stateDir:dir,demo:true,tickMs:1000});
 assert.equal(service.snapshot().world.players['guest:legacy'].coins,123);assert.equal(service.snapshot().world.orders['1'].quantity,3);
 await service.close();await fs.writeFile(path.join(dir,'world.json'),'obsolete corrupted import file');
 service=await createWorldServer({stateDir:dir,demo:true,tickMs:1000});
 t.after(async()=>{await service.close();await fs.rm(dir,{recursive:true,force:true});});
 assert.equal(service.snapshot().world.players['guest:legacy'].coins,123);
});
