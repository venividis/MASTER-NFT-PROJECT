import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Wallet } from 'ethers';
import { createWorldServer, verifyReceipt } from '../../agent/worlds/server.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const COLLECTION = '0x1111111111111111111111111111111111111111';
async function send(server, endpoint, body, bearer, extraHeaders = {}) {
  const response = await fetch(server.url + endpoint, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
async function login(server, wallet, id, name) {
  const challenge = await send(server, '/challenge', { tokenId: String(id), address: wallet.address }); assert.equal(challenge.status, 200);
  const response = await send(server, '/session', { nonce: challenge.data.nonce, signature: await wallet.signMessage(challenge.data.message), name }); assert.equal(response.status, 200); return response.data;
}
test('real HTTP clients share authoritative movement, crafting, combat, towns, escrowed trade, signed receipts and persistent reconnect', async t => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anima-world-')), a = Wallet.createRandom(), b = Wallet.createRandom();
  const owners = { 1: { owner: a.address, epoch: '1' }, 2: { owner: b.address, epoch: '1' } };
  const options = { stateDir, collection: COLLECTION, chainId: '31337', resolveOwner: async id => owners[id], tickMs: 10, maxRequestsPerSecond: 1000 };
  let server = await createWorldServer(options); t.after(async () => { await server.close(); await fs.rm(stateDir, { recursive: true, force: true }); });
  let alice = await login(server, a, 1, 'Alice'), bob = await login(server, b, 2, 'Bob');
  const action = async (player, command) => { await sleep(40); const snapshot = await send(server, '/state', null, player.token); const sequence = snapshot.data.world.players[player.identity].clientSequence + 1; const result = await send(server, '/command', { ...command, sequence }, player.token); assert.equal(result.status, 200, result.data.error); assert.equal(verifyReceipt(result.data.receipt, server.publicKey), true); return result.data; };
  await action(alice, { type: 'gather', item: 'wood' });
  const offered = await action(alice, { type: 'offer', item: 'wood', quantity: 1, price: 3 }); assert.equal(offered.world.players[alice.identity].inventory.wood, 0);
  const bought = await action(bob, { type: 'buy', order: '1' }); assert.equal(bought.world.players[bob.identity].inventory.wood, 1); assert.equal(bought.world.players[alice.identity].coins, 23); assert.equal(bought.world.players[bob.identity].coins, 17);
  const tampered = structuredClone(bought.receipt); tampered.payload.event.detail = 'A fake reward'; assert.equal(verifyReceipt(tampered, server.publicKey), false);
  const replay = await send(server, '/command', { type: 'buy', order: '1', sequence: bought.world.players[bob.identity].clientSequence }, bob.token); assert.equal(replay.status, 400); assert.match(replay.data.error, /sequence/);
  const teleport = await send(server, '/command', { type: 'move', dx: 12, dy: 0, sequence: bought.world.players[bob.identity].clientSequence + 1 }, bob.token); assert.equal(teleport.status, 400);
  await action(alice, { type: 'gather', item: 'wood' }); await action(alice, { type: 'gather', item: 'wood' });
  await action(alice, { type: 'move', dx: 1, dy: 0 }); await action(alice, { type: 'move', dx: 1, dy: 0 }); await action(alice, { type: 'move', dx: 1, dy: 0 });
  await action(alice, { type: 'gather', item: 'ore' }); const forged = await action(alice, { type: 'craft', recipe: 'blade' }); assert.equal(forged.world.players[alice.identity].inventory.blade, 1);
  await action(alice, { type: 'gather', item: 'stone' }); await action(alice, { type: 'gather', item: 'stone' });
  await action(alice, { type: 'move', dx: -1, dy: 0 }); for (let i = 0; i < 3; ++i) await action(alice, { type: 'gather', item: 'wood' });
  await action(alice, { type: 'move', dx: 0, dy: 1 }); const town = await action(alice, { type: 'found-town', name: 'Lumen' }); assert.equal(town.world.towns[alice.identity].name, 'Lumen');
  for (let i = 0; i < 3; ++i) await action(alice, { type: 'move', dx: 1, dy: 0 }); await action(alice, { type: 'attack', target: 'wisp' }); const won = await action(alice, { type: 'attack', target: 'wisp' }); assert.equal(won.world.players[alice.identity].kills, 1); assert.equal(won.world.players[alice.identity].coins, 30);
  const bobView = await send(server, '/state', null, bob.token); assert.equal(bobView.data.world.towns[alice.identity].name, 'Lumen');
  const publicKey = server.publicKey; await server.close(); server = await createWorldServer(options);
  assert.equal(server.publicKey, publicKey); assert.equal((await send(server, '/state', null, alice.token)).status, 401);
  alice = await login(server, a, 1, 'Ignored rename'); assert.equal(alice.world.players[alice.identity].kills, 1); assert.equal(alice.world.players[alice.identity].name, 'Alice');
  assert.equal(alice.world.players[bob.identity].inventory.wood, 1); assert.equal(verifyReceipt(won.receipt, server.publicKey), true);
  owners[1] = { owner: b.address, epoch: '2' }; assert.equal((await send(server, '/state', null, alice.token)).status, 401);
  const newOwner = await login(server, b, 1, 'New owner'); assert.equal(newOwner.world.players[newOwner.identity].coins, 30);
  owners[1] = { owner: b.address, epoch: '3' }; assert.equal((await send(server, '/state', null, newOwner.token)).status, 401);
});

test('auth fails closed for forged signatures, reused nonces, origins, request floods and non-owner guests', async t => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anima-world-auth-')), wallet = Wallet.createRandom(), outsider = Wallet.createRandom();
  const server = await createWorldServer({ stateDir, collection: COLLECTION, resolveOwner: async () => ({ owner: wallet.address, epoch: '1' }), maxRequestsPerSecond: 40 });
  t.after(async () => { await server.close(); await fs.rm(stateDir, { recursive: true, force: true }); });
  assert.equal((await send(server, '/guest', { name: 'spoof' })).status, 403);
  assert.equal((await send(server, '/state')).status, 401);
  assert.equal((await send(server, '/config', null, null, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await send(server, '/challenge', { address: outsider.address, tokenId: '1' })).status, 403);
  const c = (await send(server, '/challenge', { address: wallet.address, tokenId: '1' })).data;
  assert.equal((await send(server, '/session', { nonce: c.nonce, signature: await outsider.signMessage(c.message) })).status, 401);
  assert.equal((await send(server, '/session', { nonce: c.nonce, signature: await wallet.signMessage(c.message) })).status, 401);
  const requests = await Promise.all(Array.from({ length: 45 }, () => send(server, '/config'))); assert.ok(requests.some(r => r.status === 429));
  await assert.rejects(createWorldServer({ stateDir, collection: COLLECTION, resolveOwner: async () => ({ owner: wallet.address, epoch: '1' }) }), /EEXIST/);
});

test('Guest churn beyond 128 durable characters does not exhaust live presence; concurrent admission stays bounded', async t => {
  const stateDir=await fs.mkdtemp(path.join(os.tmpdir(),'anima-world-churn-'));
  const server=await createWorldServer({stateDir,demo:true,maxActivePlayers:2,maxRequestsPerSecond:10000});
  t.after(async()=>{await server.close();await fs.rm(stateDir,{recursive:true,force:true});});
  for(let i=0;i<130;i++){
    const joined=await send(server,'/guest',{name:'Guest '+i});assert.equal(joined.status,200,joined.data.error);
    assert.equal(joined.data.presence.activePlayers,1);assert.equal(joined.data.world.guestAccess,undefined);
    assert.equal((await send(server,'/logout',{},joined.data.token)).status,200);
  }
  assert.equal(Object.keys(server.snapshot().world.players).length,130);
  assert.equal(server.snapshot().presence.activePlayers,0);
  const simultaneous=await Promise.all(Array.from({length:6},()=>send(server,'/guest',{name:'Concurrent'})));
  assert.equal(simultaneous.filter(r=>r.status===200).length,2);
  assert.equal(simultaneous.filter(r=>r.status===503).length,4);
  assert.equal(server.snapshot().presence.activePlayers,2);
  assert.equal(Object.keys(server.snapshot().world.players).length,132,'Rejected joins do not create abandoned characters');
  const first=simultaneous.find(r=>r.status===200).data;
  const resumed=await send(server,'/guest',{resumeCode:first.resumeCode});assert.equal(resumed.status,200,'Same identity can replace its session at capacity');
  assert.equal(resumed.data.identity,first.identity);assert.equal((await send(server,'/state',null,first.token)).status,401);
});

test('Guest resume survives restart, hides its credential hash, and retains offline seller goods and proceeds', async t => {
  const stateDir=await fs.mkdtemp(path.join(os.tmpdir(),'anima-world-guest-'));
  const options={stateDir,demo:true,maxActivePlayers:1,maxRequestsPerSecond:1000,tickMs:10};
  let server=await createWorldServer(options);t.after(async()=>{await server.close();await fs.rm(stateDir,{recursive:true,force:true});});
  const alice=(await send(server,'/guest',{name:'Alice'})).data;
  assert.match(alice.resumeCode,/^[a-f0-9]{64}$/);
  assert.equal((await send(server,'/command',{type:'gather',item:'wood',sequence:1},alice.token)).status,200);
  await sleep(40);
  assert.equal((await send(server,'/command',{type:'offer',item:'wood',quantity:1,price:3,sequence:2},alice.token)).status,200);
  await send(server,'/logout',{},alice.token);
  assert.equal(server.snapshot().world.orders['1'].seller,alice.identity);
  await server.close();server=await createWorldServer(options);
  assert.equal(server.snapshot().presence.activePlayers,0);assert.equal(server.snapshot().world.orders['1'].quantity,1);
  assert.equal((await send(server,'/guest',{resumeCode:'0'.repeat(64)})).status,401);
  assert.equal((await send(server,'/guest',{resumeCode:alice.identity})).status,401);
  const bob=(await send(server,'/guest',{name:'Bob',identity:alice.identity})).data;
  assert.notEqual(bob.identity,alice.identity,'Caller-supplied identity is not guest authority');
  const sale=await send(server,'/command',{type:'buy',order:'1',sequence:1},bob.token);assert.equal(sale.status,200,sale.data.error);
  assert.equal(sale.data.receipt.payload.stateHash,createHash('sha256').update(JSON.stringify(sale.data.world)).digest('hex'),'Receipt binds public game state, independently of private authentication hashes');
  assert.equal(sale.data.world.players[alice.identity].coins,23);assert.equal(sale.data.world.players[bob.identity].inventory.wood,1);
  await send(server,'/logout',{},bob.token);
  const restored=await send(server,'/guest',{resumeCode:alice.resumeCode,name:'Cannot overwrite name'});
  assert.equal(restored.status,200);assert.equal(restored.data.identity,alice.identity);
  assert.equal(restored.data.world.players[alice.identity].name,'Alice');assert.equal(restored.data.world.players[alice.identity].coins,23);
  assert.equal(restored.data.world.players[alice.identity].clientSequence,2);
  const db=new DatabaseSync(path.join(stateDir,'world.sqlite'),{readOnly:true});
  const credentials=db.prepare("SELECT id,value FROM entities WHERE kind='guestAccess'").all();db.close();
  assert.ok(!JSON.stringify(credentials).includes(alice.resumeCode));
  assert.equal(credentials.length,2);assert.equal(restored.data.world.guestAccess,undefined);
  assert.equal((await send(server,'/state',null,alice.token)).status,401);
});

test('Expired presence frees capacity without deleting a traveller or allowing its old session to act', async t => {
  const stateDir=await fs.mkdtemp(path.join(os.tmpdir(),'anima-world-expiry-'));
  const server=await createWorldServer({stateDir,demo:true,maxActivePlayers:1,sessionMs:100,maxRequestsPerSecond:1000});
  t.after(async()=>{await server.close();await fs.rm(stateDir,{recursive:true,force:true});});
  const first=(await send(server,'/guest',{name:'First'})).data;
  await sleep(130);
  const second=await send(server,'/guest',{name:'Second'});assert.equal(second.status,200);
  assert.equal(second.data.presence.activePlayers,1);assert.equal(second.data.world.players[first.identity].coins,20);
  assert.equal((await send(server,'/command',{type:'gather',item:'wood',sequence:1},first.token)).status,401);
});
