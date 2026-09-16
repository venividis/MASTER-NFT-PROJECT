import test from 'node:test';
import assert from 'node:assert/strict';
import { ZeroAddress, parseEther, toUtf8Bytes, keccak256, Wallet } from 'ethers';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorldServer, chainOwnerResolver } from '../../agent/worlds/server.mjs';
import { compileGeneratedInstrument, validateGeneratedInstrument, approveInstrument, exactProposalGrant, consumeProposalGrant } from '../../worlds/instruments.mjs';
import { fundGeneratedInstrument, decideGeneratedInstrument, acquireGeneratedInstrument, refundGeneratedInstrument } from '../../worlds/commissions.mjs';
import { mintedFixture } from '../helpers/minted-fixture.mjs';

const basic = { schema: 'anima.generated-request/1', name: 'A living geometry instrument', description: 'Render a new procedurally generated geometry using plain HTML and JavaScript.', chainId: '31337', collection: '0x' + '1'.repeat(40), tokenId: '1', account: '0x' + '2'.repeat(40), capabilities: ['read-snapshot', 'propose-transaction'], snapshot: { publicValue: 12 } };
const html = '<!doctype html><title>Living geometry</title><canvas id="art"></canvas><script>const c=document.getElementById("art").getContext("2d");c.fillStyle="#69ccff";c.fillRect(20,20,50,50);</script>';
const review = artifact => approveInstrument(artifact, { contentHash: artifact.contentHash, manifestHash: artifact.manifestHash, reviewedSource: true });

test('arbitrary generated source is content-pinned, separately reviewed, and has no inherited transaction authority', () => {
  const a = compileGeneratedInstrument(basic, html, ['read-snapshot']); assert.deepEqual(validateGeneratedInstrument(a), a);
  assert.throws(() => validateGeneratedInstrument({ ...a, html: html + '<script>evil()</script>' }), /changed/);
  assert.throws(() => approveInstrument(a, { contentHash: a.contentHash, manifestHash: a.manifestHash }), /Review/);
  assert.throws(() => compileGeneratedInstrument({ ...basic, capabilities: [] }, html, ['propose-transaction']), /outside/);
  const altered = compileGeneratedInstrument(basic, html + '<p>A new version</p>', []); assert.notEqual(review(a).contentHash, review(altered).contentHash);
  const grant = exactProposalGrant({ contentHash: a.contentHash, chainId: '31337', account: basic.account, epoch: '4', target: basic.collection, value: '123', data: '0xaabb', expires: Date.now() + 20000 });
  const context = { contentHash: a.contentHash, chainId: '31337', account: basic.account, epoch: '4' }, proposal = { target: basic.collection, value: '123', data: '0xaabb' };
  assert.throws(() => consumeProposalGrant(grant, { ...proposal, value: '124' }, context), /value/); assert.equal(grant.remaining, 1);
  assert.throws(() => consumeProposalGrant(grant, proposal, { ...context, epoch: '5' }), /epoch/);
  assert.deepEqual(consumeProposalGrant(grant, proposal, context), proposal); assert.throws(() => consumeProposalGrant(grant, proposal, context), /expired/);
});

test('generated commission goes through real escrow payment and exact frozen onchain cartridge acquisition; rejection and expiry refund', async t => {
  const x = await mintedFixture(t), { w, d, stack, worker, rpc } = x;
  const escrow = await d('CommissionEscrow'), binding = await d('ArtifactBinding', [stack.collection.target]), registry = await d('CartridgeRegistry', [binding.target]), publisher = await d('CommissionedCartridges', [stack.collection.target, escrow.target, registry.target]);
  const request = { ...basic, collection: w.collection, account: w.account, tokenId: String(w.tokenId), capabilities: [] }, artifact = compileGeneratedInstrument(request, html, []), approved = review(artifact);
  const grantsBefore = await w.contract.instrumentGrantCount();
  await fundGeneratedInstrument(w, publisher.target, request, { worker: await worker.getAddress(), amount: '.01', days: 1 }); await w.send();
  await (await escrow.connect(worker).accept(1)).wait(); await (await escrow.connect(worker).submit(1, artifact.deliverable)).wait();
  await assert.rejects(decideGeneratedInstrument(w, publisher.target, 1, request, artifact, null, true), /approval/);
  await decideGeneratedInstrument(w, publisher.target, 1, request, artifact, approved, true); await w.send();
  assert.equal(await escrow.claimable(await worker.getAddress(), ZeroAddress), parseEther('.01'));
  await acquireGeneratedInstrument(w, publisher.target, 1, artifact, approved); await w.send();
  const id = await publisher.cartridgeOfWork(1), manifest = await registry.manifestOf(id);
  assert.equal(manifest.frozen, true); assert.equal(manifest.contentHash, artifact.contentHash); assert.equal(await registry.contentOf(id), '0x' + Buffer.from(html).toString('hex')); assert.equal(await registry.ownerOf(id), w.account); assert.equal(await w.contract.instrumentGrantCount(), grantsBefore);
  assert.equal(await publisher.deliverableHash(artifact.terms, artifact.manifestJSON, toUtf8Bytes(html)), artifact.deliverable);
  await fundGeneratedInstrument(w, publisher.target, request, { worker: await worker.getAddress(), amount: '.01', days: 1 }); await w.send();
  await (await escrow.connect(worker).accept(2)).wait(); await (await escrow.connect(worker).submit(2, keccak256(toUtf8Bytes('bad provider output')))).wait();
  await assert.rejects(decideGeneratedInstrument(w, publisher.target, 2, request, artifact, approved, true), /differs/);
  await decideGeneratedInstrument(w, publisher.target, 2, request, null, null, false); await w.send(); assert.equal(await escrow.claimable(w.account, ZeroAddress), parseEther('.01'));
  await fundGeneratedInstrument(w, publisher.target, request, { worker: await worker.getAddress(), amount: '.02', days: 1 }); await w.send();
  const work = await escrow.work(3); await rpc.request({ method: 'evm_setTime', params: [(Number(work.submitBy) + 1) * 1000] }); await rpc.request({ method: 'evm_mine', params: [] });
  await refundGeneratedInstrument(w, publisher.target, 3, request); await w.send(); assert.equal(await escrow.claimable(w.account, ZeroAddress), parseEther('.03'));

  // Exercise the real HTTP RPC ownership adapter against the minted native collection and its account epoch.
  const proxy = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk); const input = JSON.parse(Buffer.concat(chunks));
    const handle = async call => { try { return { jsonrpc: '2.0', id: call.id, result: await rpc.request(call) }; } catch (error) { return { jsonrpc: '2.0', id: call.id, error: { code: -32000, message: error.message } }; } };
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(Array.isArray(input) ? await Promise.all(input.map(handle)) : await handle(input)));
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'anima-native-world-'));
  const service = await createWorldServer({ stateDir: dir, collection: w.collection, chainId: '31337', resolveOwner: chainOwnerResolver({ rpcUrl: `http://127.0.0.1:${proxy.address().port}`, collection: w.collection, chainId: '31337' }) });
  t.after(async () => { await service.close(); proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); });
  const post = async (route, body) => { const r = await fetch(service.url + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() }; };
  const signer = new Wallet(rpc.getInitialAccounts()[w.address.toLowerCase()].secretKey);
  const challenge = await post('/challenge', { address: signer.address, tokenId: '1' }); assert.equal(challenge.status, 200);
  const joined = await post('/session', { nonce: challenge.data.nonce, signature: await signer.signMessage(challenge.data.message), name: 'Native owner' }); assert.equal(joined.status, 200);
  await (await stack.collection.transferFrom(w.address, await x.next.getAddress(), 1)).wait();
  const retired = await fetch(service.url + '/state', { headers: { Authorization: 'Bearer ' + joined.data.token } }); assert.equal(retired.status, 401);
});
