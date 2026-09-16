import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto, createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider, Contract, ContractFactory, keccak256, sha256, toUtf8Bytes} from 'ethers';
import {ConfluenceWallet} from '../../../web/confluence/wallet.mjs';

export const root = path.resolve(import.meta.dirname, '../../..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let compiled;
export function cartridgeArtifacts() {
  if (compiled) return compiled;
  const names = ['contracts/src/modules/ChunkedCartridgeRegistry.sol', 'test/modules/fixtures/cartridges-fixtures.sol'];
  const input = {language: 'Solidity', sources: Object.fromEntries(names.map(name => [name, {content: fs.readFileSync(path.join(root, name), 'utf8')}])),
    settings: {optimizer: {enabled: true, runs: 1000}, viaIR: true, evmVersion: 'shanghai', outputSelection: {'*': {'*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object']}}}};
  const output = JSON.parse(solc.compile(JSON.stringify(input), {import: name => ({contents: fs.readFileSync(path.join(root, name), 'utf8')})}));
  assert.deepEqual((output.errors ?? []).filter(error => error.severity === 'error'), [], 'focused cartridge compilation');
  compiled = Object.assign({}, ...Object.values(output.contracts));
  for (const [name, artifact] of Object.entries(compiled)) assert.ok(artifact.evm.deployedBytecode.object.length / 2 <= 24576, name + ' respects EIP-170');
  return compiled;
}

// Existing native artifacts are permitted only when both their indexed bytes and
// every source in their compiler metadata match. Adding independent module sources
// does not require recompiling the original native NFT for this compatibility test.
export function nativeArtifact(name) {
  const directory = path.join(root, 'contracts/artifacts');
  const index = JSON.parse(fs.readFileSync(path.join(directory, 'index.json')));
  const record = index.artifacts[index.aliases[name]];
  assert.ok(record, 'indexed native artifact: ' + name);
  const bytes = fs.readFileSync(path.join(directory, record.file));
  assert.equal(digest(bytes), record.sha256, 'native artifact bytes: ' + name);
  const artifact = JSON.parse(bytes);
  assert.equal(artifact.compiler, solc.version(), 'pinned native compiler: ' + name);
  for (const [file, source] of Object.entries(artifact.metadata.sources)) {
    assert.equal(keccak256(fs.readFileSync(path.join(root, file))), source.keccak256, 'unchanged native import: ' + file);
  }
  return artifact;
}

export async function deploy(artifact, signer, args = []) {
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode ?? '0x' + artifact.evm.bytecode.object, signer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

export async function localChain(t) {
  const rpc = ganache.provider({chain: {chainId: 31337, hardfork: 'shanghai'}, miner: {blockGasLimit: 50_000_000}, wallet: {totalAccounts: 5, defaultBalance: 1000}, logging: {quiet: true}});
  const provider = new BrowserProvider(rpc, undefined, {cacheTimeout: -1});
  provider.pollingInterval = 10;
  t.after(async () => {provider.destroy(); await rpc.disconnect();});
  const owner = await provider.getSigner(0), next = await provider.getSigner(1), stranger = await provider.getSigner(2);
  return {rpc, provider, owner, next, stranger};
}

export function htmlOfSize(size = 48 * 1024, version = 'one') {
  const head = '<!doctype html><html><head><meta charset="utf-8"><title>Cartridge ' + version + '</title></head><body><h1>' + version + '</h1><!--';
  const tail = '--><script>globalThis.cartridgeVersion=' + JSON.stringify(version) + ';</script></body></html>';
  assert.ok(size >= Buffer.byteLength(head + tail));
  return head + 'x'.repeat(size - Buffer.byteLength(head + tail)) + tail;
}

export async function publish(registry, signer, html) {
  const bytes = toUtf8Bytes(html), chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 23000) chunks.push(await deploy(cartridgeArtifacts().AppChunk, signer, [bytes.slice(offset, offset + 23000)]));
  const hash = sha256(bytes), manifest = JSON.stringify({spec: 'awe.cartridge/1', name: 'Chunked original-host fixture', version: '1', engine: 'html', entry: 'onchain', contentHash: hash, capabilities: []});
  const releaseId = await registry.nextReleaseId();
  const receipt = await (await registry.connect(signer).publishRelease(manifest, chunks.map(chunk => chunk.target), hash)).wait();
  return {html, bytes, chunks, hash, manifest, releaseId, receipt};
}

export async function nativeFixture(t) {
  const chain = await localChain(t), {rpc, provider, owner} = chain;
  const address = await owner.getAddress();
  const d = (name, args = []) => deploy(nativeArtifact(name), owner, args);
  // Genuine native contracts with a small immutable runtime fixture; this is not
  // a claim to have deployed the complete production Genesis application/privacy stack.
  const originalHTML = '<!doctype html><html><title>Original native runtime fixture</title><body>Original ANIMA identity</body></html>';
  const originalChunk = await d('AppChunk', [toUtf8Bytes(originalHTML)]);
  const originalRuntime = await d('OnchainApp', [[originalChunk.target], sha256(toUtf8Bytes(originalHTML))]);
  const directory = await d('GenesisManifest');
  const renderer = await d('ConfluenceRenderer', [originalRuntime.target, directory.target, originalRuntime.target]);
  const router = await d('ProofRouter', [address]);
  const verifier = await d('ThresholdAttestationVerifier', [address, 1]);
  await (await verifier.setSigner(address, true)).wait();
  await (await router.setVerifier(1, verifier.target)).wait();
  const witness = await d('OmnichainWitnessRegistry', [address]);
  const collection = await d('IDontFuckingBelieveIt', [address, renderer.target, router.target, witness.target, address, 0]);
  const factory = await d('SovereignAccountFactory', [collection.target, router.target]);
  await (await collection.setAccountFactory(factory.target)).wait();
  const secret = keccak256(toUtf8Bytes('native ANIMA predates all new cartridge releases'));
  await (await collection.commitAwakening(await collection.commitmentFor(address, secret, address))).wait();
  await rpc.request({method: 'evm_mine', params: []});
  await rpc.request({method: 'evm_mine', params: []});
  const mintReceipt = await (await collection.revealAwakening(secret, address)).wait();
  const account = new Contract(await collection.accountOf(1), nativeArtifact('SovereignAccount').abi, owner);
  function wallet(signer) {
    const w = new ConfluenceWallet();
    return signer.getAddress().then(current => Object.assign(w, {connected: true, revision: 1,
      raw: {request: q => q.method === 'eth_accounts' ? Promise.resolve([current]) : rpc.request(q)},
      provider, signer, address: current, chainId: 31337n, core: collection, collection: collection.target,
      tokenId: 1n, account: account.target, contract: account.connect(signer)}));
  }
  return {...chain, d, collection, account, factory, renderer, directory, router, verifier, witness, originalRuntime, originalHTML, mintReceipt, wallet};
}

export function legacyLauncher() {
  const source = fs.readFileSync(path.join(root, 'web/confluence/app.js'), 'utf8');
  const begin = source.indexOf('async function launchHTML(html, name) {');
  const end = source.indexOf('\nfunction worldEditor()', begin);
  assert.ok(begin > 0 && end > begin, 'unchanged original launcher function is present');
  const frame = {srcdoc: '', src: '', removed: false, remove() {this.removed = true;}}, content = {innerHTML: ''};
  const context = vm.createContext({crypto: webcrypto, TextEncoder, Uint8Array, cartridge: null, gameCleanup: null,
    $: selector => selector === '#cf-game-frame' ? frame : selector === '#cf-content' ? content : assert.fail(selector),
    esc: value => String(value), B: () => '<button>Return</button>'});
  vm.runInContext(source.slice(begin, end) + '\nglobalThis.oldLaunch=launchHTML;', context);
  return {launch: (html, name) => context.oldLaunch(html, name), frame, content, context};
}
