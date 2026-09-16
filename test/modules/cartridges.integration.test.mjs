import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Contract, Interface, ZeroAddress, ZeroHash, keccak256, sha256, toUtf8Bytes} from 'ethers';
import {workshopContext} from '../../web/workshop/client.mjs';
import {cartridgeArtifacts, nativeArtifact, deploy, localChain, nativeFixture, publish, htmlOfSize, legacyLauncher, root} from './fixtures/cartridges.mjs';
const plain = value => Array.isArray(value) ? Array.from(value, plain) : value;

test('an already minted native ANIMA acquires a 48 KiB three-chunk edition through the unchanged wallet and launcher', async t => {
  const preserved = ['contracts/src/core/IDontFuckingBelieveIt.sol', 'contracts/src/core/SovereignAccount.sol',
    'contracts/src/confluence/ConfluenceRenderer.sol', 'contracts/src/confluence/GenesisSVG.sol',
    'web/reference/approved-1.2.html', 'web/confluence/app.js', 'web/confluence/wallet.mjs', 'web/confluence/chain-loader.mjs'];
  const sourceHashes = () => Object.fromEntries(preserved.map(name => [name, sha256(fs.readFileSync(path.join(root, name)))]));
  const originalSources = sourceHashes();
  const x = await nativeFixture(t), {collection, account, owner, next, stranger, provider, renderer, originalRuntime, mintReceipt} = x;
  const ownerAddress = await owner.getAddress(), nextAddress = await next.getAddress(), strangerAddress = await stranger.getAddress();
  const w = await x.wallet(owner);
  const before = await collection.renderSnapshot(1), originalOrganism = Array.from(await collection.organismOf(1));
  const beforeMetadata = JSON.parse(Buffer.from((await collection.tokenURI(1)).split(',')[1], 'base64'));
  const originalBindings = [await collection.renderer(), await renderer.runtime(), await renderer.runtimeSha256(), await renderer.loaderStore(), await renderer.deploymentManifest(), await renderer.privacyResource()];
  const originalCode = await Promise.all([collection.target, account.target, renderer.target, originalRuntime.target, originalBindings[3]].map(address => provider.getCode(address)));
  const epoch = await account.sessionEpoch(), grants = await account.instrumentGrantCount();
  const registry = await deploy(cartridgeArtifacts().ChunkedCartridgeRegistry, owner, [collection.target]);
  assert.ok((await registry.deploymentTransaction().wait()).blockNumber > mintReceipt.blockNumber, 'native NFT existed before new registry');
  const binding = new Contract(await registry.artifact(), nativeArtifact('ArtifactBinding').abi, provider);
  assert.equal(await binding.collection(), collection.target);
  assert.equal(await binding.artifactIdOfAccount(account.target), 1n);

  const edition = await publish(registry, owner, htmlOfSize());
  assert.equal(edition.bytes.length, 48 * 1024);
  assert.equal(edition.chunks.length, 3);
  const published = await registry.releaseOf(edition.releaseId);
  assert.equal(published.byteLength, 49152n);
  assert.equal(published.archiveCodeHash, keccak256(await provider.getCode(published.archive)));
  assert.deepEqual(Array.from(published.chunkByteLengths), [23000n, 23000n, 3152n]);
  for (let i = 0; i < 3; i++) assert.equal(published.chunkCodeHashes[i], keccak256(await provider.getCode(edition.chunks[i].target)));
  const archive = new Contract(published.archive, cartridgeArtifacts().OnchainApp.abi, provider);
  assert.equal(await archive.readAll(), '0x' + Buffer.from(edition.bytes).toString('hex'));

  const oldABI = nativeArtifact('CartridgeRegistry').abi;
  const oldInterface = new Interface(oldABI);
  for (const name of ['launchManifest', 'contentOf', 'manifestOf']) {
    assert.equal(oldInterface.getFunction(name).format('sighash'), registry.interface.getFunction(name).format('sighash'));
    assert.deepEqual(oldInterface.getFunction(name).outputs.map(output => output.format('full')), registry.interface.getFunction(name).outputs.map(output => output.format('full')));
  }
  await assert.rejects(account.connect(stranger).execute(registry.target, 0, registry.interface.encodeFunctionData('acquire', [edition.releaseId])));
  await w.prepare({target: registry.target, data: registry.interface.encodeFunctionData('acquire', [edition.releaseId])});
  await w.send();
  assert.equal(await registry.ownerOf(1), account.target);
  assert.equal(await registry.releaseOfCartridge(1), edition.releaseId);
  const oldRegistry = new Contract(registry.target, oldABI, provider);
  const info = await oldRegistry.launchManifest(1, ownerAddress);
  assert.equal(info.authorized, true);
  assert.equal(info.holder, account.target);
  assert.equal(info.controller, ownerAddress);
  assert.equal(info.parentArtifactId, 1n);
  assert.equal(info.parentOwnershipEpoch, epoch);
  assert.equal(info.frozen, true);
  assert.equal(info.onchainContentAvailable, true);
  assert.equal(info.manifestHash, keccak256(toUtf8Bytes(edition.manifest)));
  assert.equal(await registry.supportsInterface('0x80ac58cd'), true);
  assert.equal(await registry.balanceOf(account.target), 1n);

  const previousWindow = globalThis.window;
  globalThis.window = {CONFLUENCE_BUNDLED: {'abis/CartridgeRegistry.json': JSON.stringify({abi: oldABI})}};
  t.after(() => {if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;});
  const recovered = await w.readCartridge(registry.target, 1);
  assert.equal(recovered.html, edition.html);
  assert.equal(recovered.hash, edition.hash);
  const launcher = legacyLauncher();
  await launcher.launch(recovered.html, recovered.name);
  assert.ok(launcher.frame.srcdoc.endsWith(edition.html));
  assert.match(launcher.frame.srcdoc, /connect-src 'none'/);
  assert.match(launcher.content.innerHTML, /sandbox="allow-scripts allow-pointer-lock"/);
  assert.doesNotMatch(launcher.content.innerHTML, /allow-same-origin/);
  assert.equal(launcher.context.cartridge.contentHash, edition.hash);
  await assert.rejects(launcher.launch('x'.repeat(1048577), 'too large'), /1 MiB/);
  launcher.context.gameCleanup();
  assert.equal(launcher.frame.removed, true);

  // The ordinary execute call has its expected audit trail. It never replaces
  // immutable identity/proof state, renderer code, original runtime or loader binding.
  const after = await collection.renderSnapshot(1);
  for (const field of ['seed', 'genome', 'stateRoot', 'memoryRoot', 'lineageRoot', 'constitutionHash', 'bornAt', 'evolvedAt', 'generation', 'evolutions', 'parentId', 'sovereign', 'account', 'owner']) assert.equal(after[field], before[field], field);
  assert.equal(after.actionNonce, before.actionNonce + 1n);
  assert.notEqual(after.auditRoot, before.auditRoot);
  assert.deepEqual(Array.from(await collection.organismOf(1)), originalOrganism);
  const afterMetadata = JSON.parse(Buffer.from((await collection.tokenURI(1)).split(',')[1], 'base64'));
  assert.equal(afterMetadata.animation_url, beforeMetadata.animation_url, 'immutable runtime recovery binding is unchanged');
  assert.notEqual(afterMetadata.image, beforeMetadata.image, 'normal audited activity remains visible in live artwork');
  assert.deepEqual([await collection.renderer(), await renderer.runtime(), await renderer.runtimeSha256(), await renderer.loaderStore(), await renderer.deploymentManifest(), await renderer.privacyResource()], originalBindings);
  assert.deepEqual(await Promise.all([collection.target, account.target, renderer.target, originalRuntime.target, originalBindings[3]].map(address => provider.getCode(address))), originalCode);
  assert.equal(await originalRuntime.readAll(), '0x' + Buffer.from(x.originalHTML).toString('hex'));
  assert.equal(await account.instrumentGrantCount(), grants);
  assert.equal(await account.sessionEpoch(), epoch);
  assert.equal((await account.sessions(registry.target)).active, false);

  // The unchanged workshop correctly refuses a different registry fingerprint.
  const escrow = await x.d('CommissionEscrow');
  const publisher = await x.d('CommissionedCartridges', [collection.target, escrow.target, registry.target]);
  await assert.rejects(workshopContext(w, publisher.target), /CartridgeRegistry.*(match|code)/);
  await assert.rejects(w.prepare({target: registry.target, data: oldInterface.encodeFunctionData('updateManifest', [1, edition.manifest, edition.hash])}));
  await assert.rejects(w.prepare({target: registry.target, data: oldInterface.encodeFunctionData('publishContent', [1, edition.bytes])}));

  const nextEdition = await publish(registry, owner, htmlOfSize(48 * 1024, 'two'));
  await w.prepare({target: registry.target, data: registry.interface.encodeFunctionData('acquire', [nextEdition.releaseId])});
  await w.send();
  assert.equal(await registry.releaseOfCartridge(2), 2n);
  assert.notEqual(nextEdition.hash, edition.hash);
  assert.equal((await w.readCartridge(registry.target, 1)).html, edition.html);
  assert.equal((await w.readCartridge(registry.target, 2)).html, nextEdition.html);
  assert.deepEqual(plain(await registry.releaseOf(1)), plain(published));
  assert.equal(await collection.totalSupply(), 1n, 'new release and cartridge never remint master NFT');

  await assert.rejects(registry.connect(stranger).transferFrom(account.target, strangerAddress, 1));
  await assert.rejects(registry.transferFrom(account.target, ownerAddress, 1), /revert|estimateGas|missing revert/i);
  await w.prepare({target: registry.target, data: registry.interface.encodeFunctionData('acquire', [1])});
  await (await collection.transferFrom(ownerAddress, nextAddress, 1)).wait();
  await assert.rejects(w.send(), /Ownership|context|Connect/);
  await assert.rejects(w.readCartridge(registry.target, 1));
  await assert.rejects(account.execute(registry.target, 0, registry.interface.encodeFunctionData('acquire', [1])));
  assert.equal(await registry.canLaunch(1, ownerAddress), false);
  assert.equal(await registry.canLaunch(1, ZeroAddress), false);
  const newInfo = await oldRegistry.launchManifest(1, nextAddress);
  assert.equal(newInfo.authorized, true);
  assert.equal(newInfo.parentOwnershipEpoch, epoch + 1n);
  const nextWallet = await x.wallet(next);
  assert.equal((await nextWallet.readCartridge(registry.target, 1)).html, edition.html);
  await nextWallet.prepare({target: registry.target, data: registry.interface.encodeFunctionData('acquire', [1])});
  await nextWallet.send();
  assert.equal(await registry.ownerOf(3), account.target);
  assert.equal(await collection.totalSupply(), 1n);

  // A separately held cartridge is real ERC721 property but cannot masquerade as
  // an installation in the selected master NFT's canonical account.
  await (await registry.connect(stranger).acquire(1)).wait();
  const standalone = await oldRegistry.launchManifest(4, strangerAddress);
  assert.equal(standalone.parentArtifactId, 0n);
  assert.equal(standalone.parentOwnershipEpoch, 0n);
  assert.equal(standalone.controller, strangerAddress);
  assert.equal(standalone.authorized, true);
  await assert.rejects(nextWallet.readCartridge(registry.target, 4), /selected NFT/);
  assert.deepEqual(sourceHashes(), originalSources);
  t.diagnostic(JSON.stringify({nativeMintBlock: mintReceipt.blockNumber, registryDeploymentBlock: (await registry.deploymentTransaction().wait()).blockNumber,
    htmlBytes: edition.bytes.length, chunks: edition.chunks.length, legacyWalletAndLauncher: 'unmodified source executed in Node DOM harness', masterSupply: '1', currentEpoch: String(await account.sessionEpoch()), originalSourceAndBindings: 'unchanged', normalAccountAudit: 'advanced'}));
});

test('chunked publication rejects missing, oversized, non-data, reordered or hash-mismatched bytes without minting', async t => {
  const {owner, stranger} = await localChain(t), artifacts = cartridgeArtifacts();
  const collection = await deploy(artifacts.CartridgeTestCollection, owner);
  await assert.rejects(deploy(artifacts.ChunkedCartridgeRegistry, owner, [await stranger.getAddress()]));
  const registry = await deploy(artifacts.ChunkedCartridgeRegistry, owner, [collection.target]);
  const a = await deploy(artifacts.AppChunk, owner, [toUtf8Bytes('first')]), b = await deploy(artifacts.AppChunk, owner, [toUtf8Bytes('second')]);
  const hash = sha256(toUtf8Bytes('firstsecond'));
  const invalid = (manifest, chunks, digest = hash) => assert.rejects(registry.publishRelease(manifest, chunks, digest));
  await invalid('', [a.target]);
  await invalid('x'.repeat(16385), [a.target]);
  await invalid('{}', [a.target], ZeroHash);
  await invalid('{}', []);
  await invalid('{}', Array(65).fill(a.target));
  await invalid('{}', [await stranger.getAddress()]);
  await invalid('{}', [b.target, a.target]);
  await invalid('{}', [a.target, b.target], sha256(toUtf8Bytes('substituted bytes')));
  for (const code of ['0x00', '0x010203', '0x00' + '61'.repeat(23001)]) {
    const bad = await deploy(artifacts.CartridgeRawCode, owner, [code]);
    await invalid('{}', [bad.target]);
  }
  const full = await deploy(artifacts.AppChunk, owner, [new Uint8Array(23000).fill(120)]);
  await invalid('{}', Array(46).fill(full.target)); // 1,058,000 bytes exceeds the old host's 1 MiB.
  assert.equal(await registry.MAX_CONTENT_BYTES(), 1048576n);
  assert.equal(await registry.nextReleaseId(), 1n);
  assert.equal(await registry.nextId(), 1n);
  await assert.rejects(registry.acquire(1));
  await assert.rejects(registry.contentOf(1));
  await assert.rejects(registry.releaseOf(1));
  await (await registry.publishRelease('{}', [a.target, b.target], hash)).wait();
  await (await registry.acquire(1)).wait();
  assert.equal(await registry.contentOf(1), '0x' + Buffer.from('firstsecond').toString('hex'));
  assert.equal((await registry.manifestOf(1)).frozen, true);
});
