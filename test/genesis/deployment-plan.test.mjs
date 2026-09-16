import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {spawnSync} from 'node:child_process';
import ganache from 'ganache';
import {BrowserProvider, Contract, getCreateAddress} from 'ethers';
import {archivePrivacyResource} from '../../scripts/archive-privacy-resource.mjs';
import {loadArtifact} from '../../scripts/lib/deploy-stack.mjs';
import {prepareGenesisDeployment, readGenesisRuntime, validateGenesisDeploymentConfig, verifyGenesisDeploymentPlan} from '../../scripts/lib/genesis-deployment.mjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const alice = '0x1111111111111111111111111111111111111111';
const bob = '0x2222222222222222222222222222222222222222';
const config = overrides => ({chainId: 11155111, deployer: alice, startingNonce: 7, attesters: [alice, bob], threshold: 2,
  royaltyReceiver: bob, royaltyBps: 500, freezeTrustRoots: true, experimentGuardian: alice, ...overrides});

function archives(t, directory = false) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'anima-genesis-plan-'));
  t.after(() => fs.rmSync(base, {recursive: true, force: true}));
  const expanded = Buffer.from('<!doctype html><html><body>' + crypto.randomBytes(directory ? 1100000 : 26000).toString('hex') + '</body></html>');
  const encoded = zlib.gzipSync(expanded).toString('base64');
  const runtime = Buffer.from('<!doctype html><script>const b=Uint8Array.from(atob("' + encoded + '"),c=>c.charCodeAt(0));</script>');
  const dir = path.join(base, 'app');
  fs.mkdirSync(path.join(dir, 'chunks'), {recursive: true});
  const chunks = [];
  for (let offset = 0; offset < runtime.length; offset += 23000) {
    const bytes = runtime.subarray(offset, offset + 23000), file = 'chunks/' + String(chunks.length).padStart(2, '0') + '.bin';
    fs.writeFileSync(path.join(dir, file), bytes);
    chunks.push({file, bytes: bytes.length, sha256: hash(bytes)});
  }
  const manifest = {schema: directory ? 'awe.onchain-runtime/2' : 'awe.onchain-runtime/1', compression: 'gzip', byteLength: runtime.length,
    expandedBytes: expanded.length, sha256: hash(runtime), chunks};
  if(directory){
    manifest.archiveVersion=2;manifest.shards=[];
    for(let firstChunk=0;firstChunk<chunks.length;firstChunk+=32){
      const n=Math.min(32,chunks.length-firstChunk),bytes=runtime.subarray(firstChunk*23000,Math.min(runtime.length,(firstChunk+n)*23000));
      manifest.shards.push({index:manifest.shards.length,firstChunk,chunkCount:n,byteLength:bytes.length,sha256:hash(bytes)});
    }
  }
  const runtimeManifest = path.join(dir, 'manifest.json');
  fs.writeFileSync(runtimeManifest, JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'runtime.html'), runtime);
  // Valid worker comment with enough incompressible content to exercise multiple chunks.
  const worker = Buffer.from('// ' + crypto.randomBytes(36000).toString('hex'));
  const source = path.join(base, 'worker.js'), output = path.join(base, 'privacy');
  const expectedPrivacy = {bytes: worker.length, sha256: hash(worker)};
  fs.writeFileSync(source, worker);
  const privacy = archivePrivacyResource({source, output, expected: expectedPrivacy});
  return {base, runtime, worker, manifest, privacy, options: {runtimeManifest, privacyManifest: path.join(output, 'manifest.json'), expectedPrivacy}};
}

test('deployment choices reject mainnet, missing decisions, duplicate attesters and impossible royalty/threshold settings', () => {
  assert.equal(validateGenesisDeploymentConfig(config({chainId: 84532})).chainId, 84532);
  for (const change of [{chainId: 1}, {chainId: undefined}, {startingNonce: -1}, {freezeTrustRoots: undefined},
    {threshold: 3}, {royaltyBps: 1001}, {attesters: [alice, alice]}, {deployer: '0x' + '0'.repeat(40)},
    {experimentGuardian: undefined}, {privateKey: 'unaccepted'}]) {
    assert.throws(() => validateGenesisDeploymentConfig(config(change)));
  }
});

test('offline plan predicts CREATE addresses across configuration nonces and reconstructs exact reviewed bytes', async t => {
  const fixture = archives(t), plan = await prepareGenesisDeployment(config(), fixture.options);
  assert.equal(plan.status, 'unsigned-offline-preparation');
  assert.equal(plan.summary.gasAndFees, 'unestimated');
  assert.equal(plan.summary.transferValueWei, '0');
  assert.equal(plan.summary.totalStoredArchiveBytes, fixture.runtime.length + fixture.privacy.compressedByteLength);
  assert.ok(plan.archives.privacy.chunks > 1);
  assert.equal(plan.summary.nextNonce, 7 + plan.requests.length);
  for (const [i, request] of plan.requests.entries()) {
    assert.equal(request.transaction.nonce, 7 + i);
    assert.equal(request.transaction.chainId, 11155111);
    assert.equal(request.transaction.value, '0');
    assert.equal(request.transaction.gasLimit, undefined);
    if (request.kind === 'create') assert.equal(request.address, getCreateAddress({from: alice, nonce: 7 + i}));
  }
  const ids = plan.requests.map(item => item.id);
  assert.ok(ids.indexOf('configure:WorldLedger.configureEstateMarket') < ids.indexOf('configure:WorldLedger.sealModules'));
  assert.equal(ids.at(-1), 'configure:GenesisManifest.publish');
  assert.ok(!ids.some(id => /commitAwakening|revealAwakening|OwnerFeeRouter/.test(id)));
  assert.deepEqual(await verifyGenesisDeploymentPlan(plan, fixture.options), plan);
  for (const mutate of [
    copy => { copy.requests[0].transaction.value = '1'; },
    copy => { copy.requests[1].address = bob; },
    copy => { copy.requests.reverse(); },
    copy => { copy.requests[0].transaction.nonce++; },
    copy => { copy.manifestModules[0] = bob; },
    copy => { copy.requests[0].transaction.authorizationList = []; },
    copy => { copy.archives.privacy.sha256 = '0'.repeat(64); },
  ]) {
    const changed = structuredClone(plan); mutate(changed);
    await assert.rejects(verifyGenesisDeploymentPlan(changed, fixture.options), /differs/);
  }
  const mutable = await prepareGenesisDeployment(config({freezeTrustRoots: false}), fixture.options);
  assert.equal(mutable.requests.filter(item => item.method === 'freeze').length, 0);
  assert.notEqual(mutable.modules.IDontFuckingBelieveIt, plan.modules.IDontFuckingBelieveIt);
});

test('archive validation rejects corruption, path traversal, substituted runtime and worker integrity drift', async t => {
  const fixture = archives(t), file = path.join(fixture.base, 'app/chunks/00.bin');
  const original = fs.readFileSync(file);
  fs.writeFileSync(file, Buffer.alloc(original.length));
  await assert.rejects(prepareGenesisDeployment(config(), fixture.options), /chunk differs/);
  fs.writeFileSync(file, original);
  fixture.manifest.chunks[0].file = '../worker.js';
  fs.writeFileSync(fixture.options.runtimeManifest, JSON.stringify(fixture.manifest));
  assert.throws(() => readGenesisRuntime(fixture.options.runtimeManifest), /chunk path/);
  fixture.manifest.chunks[0].file = 'chunks/00.bin';
  fs.writeFileSync(fixture.options.runtimeManifest, JSON.stringify(fixture.manifest));
  fs.writeFileSync(path.join(fixture.base, 'app/runtime.html'), 'substituted');
  await assert.rejects(prepareGenesisDeployment(config(), fixture.options), /Runtime HTML differs/);
  fs.writeFileSync(path.join(fixture.base, 'app/runtime.html'), fixture.runtime);
  fixture.manifest.expandedBytes++;
  fs.writeFileSync(fixture.options.runtimeManifest, JSON.stringify(fixture.manifest));
  await assert.rejects(prepareGenesisDeployment(config(), fixture.options), /Expanded runtime length differs/);
  fixture.manifest.expandedBytes--;
  fs.writeFileSync(fixture.options.runtimeManifest, JSON.stringify(fixture.manifest));
  await assert.rejects(prepareGenesisDeployment(config(), {...fixture.options, expectedPrivacy: {...fixture.options.expectedPrivacy, sha256: '0'.repeat(64)}}), /reviewed privacy runtime/);
});

test('compiler identity is required even before deployment bytecode is encoded', async t => {
  const fixture = archives(t), directory = path.join(fixture.base, 'artifacts');
  fs.mkdirSync(directory);
  const chunk = loadArtifact('AppChunk'); delete chunk.compiler;
  fs.writeFileSync(path.join(directory, 'AppChunk.json'), JSON.stringify(chunk));
  await assert.rejects(prepareGenesisDeployment(config(), {...fixture.options, artifactDirectory: directory}), /compiler identity/);
});

test('CLI refuses broadcast and refuses replacing a configuration file', t => {
  const fixture = archives(t), script = new URL('../../scripts/genesis-deployment.mjs', import.meta.url);
  const invalid = spawnSync(process.execPath, [script.pathname, '--broadcast'], {encoding: 'utf8'});
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /no broadcast mode/);
  const input = path.join(fixture.base, 'config.json');
  fs.writeFileSync(input, JSON.stringify(config()));
  const before = fs.readFileSync(input, 'utf8');
  const same = spawnSync(process.execPath, [script.pathname, '--config', input, '--output', input], {encoding: 'utf8'});
  assert.equal(same.status, 1); assert.match(same.stderr, /must differ/);
  assert.equal(fs.readFileSync(input, 'utf8'), before);
  for (const [name, link] of [['symlink', fs.symlinkSync], ['hardlink', fs.linkSync]]) {
    const alias = path.join(fixture.base, name + '.json'); link(input, alias);
    const attempt = spawnSync(process.execPath, [script.pathname, '--config', input, '--output', alias], {encoding: 'utf8'});
    assert.equal(attempt.status, 1); assert.match(attempt.stderr, /already exists/);
    assert.equal(fs.readFileSync(input, 'utf8'), before);
  }
});

test('the unsigned sequence executes on an isolated EVM with exact archives, complete constructor wiring and immutable manifest', async t => {
  const fixture = archives(t);
  const rpc = ganache.provider({chain: {chainId: 31337, hardfork: 'shanghai'}, miner: {blockGasLimit: 30000000}, logging: {quiet: true}});
  const provider = new BrowserProvider(rpc, undefined, {cacheTimeout: -1}); provider.pollingInterval = 10;
  t.after(async () => { provider.destroy(); await rpc.disconnect(); });
  const signer = await provider.getSigner(), deployer = await signer.getAddress(), other = await (await provider.getSigner(1)).getAddress();
  const plan = await prepareGenesisDeployment(config({chainId: 31337, deployer, startingNonce: 0, attesters: [deployer, other]}), fixture.options);
  for (const request of plan.requests) {
    const receipt = await (await signer.sendTransaction({...request.transaction, gasLimit: 15000000})).wait();
    assert.equal(receipt.status, 1, request.id);
    if (request.kind === 'create') assert.equal(receipt.contractAddress, request.address, request.id);
  }
  const contract = name => new Contract(plan.modules[name], loadArtifact(name).abi, signer);
  const collection = contract('IDontFuckingBelieveIt'), ledger = contract('WorldLedger'), manifest = contract('GenesisManifest');
  assert.equal(await collection.totalSupply(), 0n);
  assert.equal(await collection.accountFactory(), plan.modules.SovereignAccountFactory);
  assert.equal(await collection.renderer(), plan.modules.ConfluenceRenderer);
  assert.equal(await contract('ThresholdAttestationVerifier').threshold(), 2n);
  assert.equal(await contract('ThresholdAttestationVerifier').frozen(), true);
  assert.equal(await contract('ProofRouter').frozen(), true);
  assert.equal(await contract('ProofRouter').verifierOf(1), plan.modules.ThresholdAttestationVerifier);
  assert.equal(await contract('MemoryLedger').router(), plan.modules.JournalSwapRouter);
  const renderer = contract('ConfluenceRenderer');
  assert.equal(await renderer.runtime(), plan.modules.OnchainApp);
  assert.equal(await renderer.privacyResource(), plan.modules.privacyResource);
  assert.equal(await renderer.deploymentManifest(), plan.modules.GenesisManifest);
  assert.equal(await ledger.isSealed(), true);
  assert.equal(await ledger.market(), plan.modules.NativeMarket);
  assert.equal(await ledger.vault(), plan.modules.TimeVault);
  assert.equal(await ledger.estateMarket(), plan.modules.EstateExchange);
  assert.equal(await ledger.launchpad(), plan.modules.GenesisLaunchpad);
  assert.deepEqual([...await manifest.modulesOf(collection.target)], plan.manifestModules);
  await assert.rejects(manifest.publish.staticCall(collection.target, plan.manifestModules));
  await assert.rejects(ledger.configureEstateMarket.staticCall(plan.modules.EstateExchange));
  assert.equal(await contract('OnchainApp').readAll(), '0x' + fixture.runtime.toString('hex'));
  const resource = new Contract(plan.modules.privacyResource, loadArtifact('ShardedResource').abi, provider);
  assert.equal(await resource.contentSha256(), '0x' + hash(fixture.worker));
  assert.equal(await resource.compressedSha256(), '0x' + fixture.privacy.compressedSha256);
  const reconstructed = [];
  for (let i = 0; i < Number(await resource.shardCount()); i++) {
    const shard = new Contract(await resource.shards(i), loadArtifact('OnchainApp').abi, provider);
    reconstructed.push(Buffer.from((await shard.readAll()).slice(2), 'hex'));
  }
  assert.equal(hash(Buffer.concat(reconstructed)), fixture.privacy.compressedSha256);
  assert.deepEqual(zlib.gunzipSync(Buffer.concat(reconstructed)), fixture.worker);
  const index = contract('CommitmentIndex');
  assert.equal(await index.moduleCount(), 8n);
  const expectedModules = ['CommissionedCartridges', 'VestedExitVault', 'TimeVault', 'EditionRegistry', 'CommissionEscrow', 'BondedShelf', 'ConsentGiftRouter', 'InstrumentRouter']
    .map(name => plan.modules[name]).sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
  assert.deepEqual(await Promise.all(expectedModules.map((_, i) => index.modules(i))), expectedModules);
});


test('large runtime manifests produce bounded leaf deployment plans and reject gaps, overlaps and wrong hashes',async t=>{
 const fixture=archives(t,true),read=()=>readGenesisRuntime(fixture.options.runtimeManifest);
 const runtime=read();assert.equal(runtime.archiveVersion,2);assert(runtime.chunks.length>64);assert(runtime.shards.length>=3);assert(runtime.expanded.length>1472000);
 const plan=await prepareGenesisDeployment(config(),fixture.options);assert.equal(plan.archives.runtime.archiveVersion,2);assert.equal(plan.archives.runtime.shards,runtime.shards.length);assert.equal(plan.archives.runtime.address,plan.modules.OnchainAppDirectory);
 const requests=plan.requests.filter(x=>x.id.startsWith('deploy:runtimeLeaf'));assert.equal(requests.length,runtime.shards.length);assert(plan.requests.find(x=>x.id==='deploy:OnchainAppDirectory'));assert.equal(plan.requests.some(x=>x.id==='deploy:OnchainApp'),false);
 const renderer=plan.requests.find(x=>x.id==='deploy:ConfluenceRenderer');assert(renderer.transaction.data.toLowerCase().includes(plan.modules.OnchainAppDirectory.slice(2).toLowerCase()));
 const original=structuredClone(fixture.manifest);
 for(const mutate of [m=>m.shards[1].firstChunk--,m=>m.shards[1].firstChunk++,m=>m.shards.pop(),m=>m.shards[0].sha256='0'.repeat(64),m=>m.shards[0].chunkCount=33,m=>m.archiveVersion=1,m=>m.shards=Array(17).fill(m.shards[0])]){
  const changed=structuredClone(original);mutate(changed);fs.writeFileSync(fixture.options.runtimeManifest,JSON.stringify(changed));assert.throws(read,/shard|version/);
 }
});
