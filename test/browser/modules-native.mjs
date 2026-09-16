/** One CI lifecycle: actual workbench -> ConfluenceWallet -> native account -> module registry.
 * Intended project path: test/browser/modules-native.mjs. No public RPC or existing wallet.
 * --fixture-only exercises Node setup/recovery without importing or launching Playwright;
 * its report stays incomplete and never counts as browser evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const argv = process.argv.slice(2);
if (argv.includes('--help')) {
  console.log('Usage: node test/browser/modules-native.mjs [--root=PROJECT] [--output=DIRECTORY] [--fixture-only]\nRequires current Shanghai artifacts and onchain-app/module-workbench build; normal mode also requires installed Playwright Chromium. Local disposable Ganache only.');
  process.exit(0);
}
const options = {root: path.resolve(import.meta.dirname, '../..'), fixtureOnly: false};
for (const arg of argv) {
  if (arg === '--fixture-only') options.fixtureOnly = true;
  else if (arg.startsWith('--root=')) options.root = path.resolve(arg.slice(7));
  else if (arg.startsWith('--output=')) options.output = path.resolve(arg.slice(9));
  else throw Error('Unknown option: ' + arg);
}
const root = options.root, require = createRequire(path.join(root, 'package.json'));
const project = relative => import(pathToFileURL(path.join(root, relative)).href);
const dependency = name => import(pathToFileURL(require.resolve(name)).href);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const output = options.output ?? path.join(root, 'reports/production/modules-native-browser');
fs.mkdirSync(output, {recursive: true});
const run = fs.mkdtempSync(path.join(output, new Date().toISOString().replaceAll(':', '-') + '-'));
const reportFile = path.join(run, 'results.json');
const report = {
  schema: 'anima.modules-native-browser/1', startedAt: new Date().toISOString(), status: 'running',
  scope: 'One actual-browser lifecycle using genuine native NFT/account contracts and an in-process disposable local EVM.',
  fixtureOnly: options.fixtureOnly, browserExecuted: false, cases: [], walletTransactions: [],
  limitations: ['No extension or hardware wallet; injected EIP-1193 forwards exclusively to the local Ganache instance.',
    'Shanghai Bound-mode native fixture uses OnchainRenderer; this is not the entire original Genesis runtime or proof-authorized flow.',
    'No public deployment, real funds, physical device coverage or production certification.'],
};
const save = () => {
  const temporary = reportFile + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(report, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
  fs.renameSync(temporary, reportFile);
};
save();
let browser, context, server, rpc, provider, snapshotInputs, recheckInputs, verifyCompilation;
let stopped = false, deadline, signalFailure;
const interrupted = new Promise((_, reject) => { signalFailure = reject; });
const stop = signal => { if (stopped) return; stopped = true; signalFailure(Error('Native browser run interrupted: ' + signal)); };
const onInterrupt = () => stop('SIGINT'), onTerminate = () => stop('SIGTERM');
process.once('SIGINT', onInterrupt); process.once('SIGTERM', onTerminate);
const active = () => { if (stopped) throw Error('Native browser run is no longer active.'); };
const milestone = phase => { active(); report.phase = phase; save(); };
const bounded = async (task, milliseconds, label) => {
  let timer;
  try { return await Promise.race([Promise.resolve().then(task), new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' timed out')), milliseconds); timer.unref?.(); })]); }
  finally { clearTimeout(timer); }
};

function verifiedWorkbench() {
  const directory = path.join(root, 'onchain-app/module-workbench');
  const manifestBytes = fs.readFileSync(path.join(directory, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes), bytes = fs.readFileSync(path.join(directory, 'index.html'));
  assert.equal(manifest.schema, 'anima.module-workbench/1'); assert.equal(manifest.compression, 'raw');
  assert.equal(bytes.length, manifest.byteLength); assert.equal('0x' + digest(bytes), manifest.sha256);
  assert.ok(bytes.length > 0 && bytes.length <= 1048576);
  assert.ok(Object.keys(manifest.inputs).includes('web/modules/app.mjs'));
  assert.ok(Object.keys(manifest.inputs).includes('web/confluence/wallet.mjs'));
  for (const [name, hash] of Object.entries(manifest.inputs)) {
    const file = path.resolve(root, name);
    assert.ok(file.startsWith(root + path.sep), 'Workbench source escapes project');
    assert.equal('0x' + digest(fs.readFileSync(file)), hash, 'Workbench source changed: ' + name);
  }
  assert.equal(manifest.chunks.length, Math.ceil(bytes.length / 23000));
  for (let index = 0; index < manifest.chunks.length; index++) {
    const chunk = manifest.chunks[index], expectedFile = 'chunks/' + String(index).padStart(3, '0') + '.bin';
    assert.equal(chunk.file, expectedFile);
    const chunkBytes = fs.readFileSync(path.join(directory, expectedFile));
    assert.equal(chunkBytes.length, chunk.byteLength); assert.equal('0x' + digest(chunkBytes), chunk.sha256);
    assert.deepEqual(chunkBytes, bytes.subarray(index * 23000, (index + 1) * 23000));
  }
  return {directory, bytes, identity: {manifestSha256: digest(manifestBytes), htmlSha256: digest(bytes), byteLength: bytes.length}};
}

async function execute() {
  milestone('verify-candidate');
  ({verifyCompilation} = await project('scripts/lib/compiler-artifacts.mjs'));
  const {candidateInputSnapshot, candidateInputChanges} = await project('scripts/lib/local-validation.mjs');
  const compilation = verifyCompilation(root);
  assert.equal(compilation.settings.evmVersion, 'shanghai', 'Run compile:local before this Shanghai fixture.');
  const workbench = verifiedWorkbench();
  snapshotInputs = candidateInputSnapshot(root);
  report.candidate = {authoredInputs: snapshotInputs, compiler: compilation.compiler,
    compilerInputSha256: compilation.compilerInputSha256, artifactIndexSha256: digest(fs.readFileSync(path.join(root, 'contracts/artifacts/index.json'))),
    workbench: workbench.identity, runnerSha256: digest(fs.readFileSync(import.meta.filename)),
    node: process.version, tmpdir: process.env.TMPDIR ?? null};
  recheckInputs = () => {
    verifyCompilation(root);
    assert.deepEqual(verifiedWorkbench().identity, report.candidate.workbench, 'Workbench changed during execution');
    assert.equal(digest(fs.readFileSync(path.join(root, 'contracts/artifacts/index.json'))), report.candidate.artifactIndexSha256);
    assert.equal(digest(fs.readFileSync(import.meta.filename)), report.candidate.runnerSha256);
    const after = candidateInputSnapshot(root);
    report.candidate.afterSha256 = after.sha256;
    report.candidate.changes = candidateInputChanges(snapshotInputs, after);
    assert.equal(after.sha256, snapshotInputs.sha256, 'Authored candidate inputs changed during execution');
  };
  save();

  milestone('create-native-fixture');
  const ethers = await dependency('ethers'), ganacheModule = await dependency('ganache');
  const {BrowserProvider, Contract, ContractFactory, ZeroHash, keccak256, sha256, toUtf8Bytes, hexlify} = ethers;
  const {deployStack, loadArtifact} = await project('scripts/lib/deploy-stack.mjs');
  const sdk = await project('packages/modules/sdk.mjs');
  const {examplePackage} = await project('web/modules/examples.mjs');
  const ganache = ganacheModule.default ?? ganacheModule;
  rpc = ganache.provider({chain: {chainId: 31337, hardfork: 'shanghai'},
    miner: {timestampIncrement: 1, blockGasLimit: 50000000},
    wallet: {deterministic: true, totalAccounts: 3, defaultBalance: 1000}, logging: {quiet: true}});
  provider = new BrowserProvider(rpc, undefined, {cacheTimeout: -1}); provider.pollingInterval = 10;
  const owner = await provider.getSigner(0), ownerAddress = (await owner.getAddress()).toLowerCase();
  const native = await deployStack({signer: owner, attesterAddress: ownerAddress, royaltyBps: 0});
  const collection = native.collection;
  const secret = keccak256(toUtf8Bytes('anima module native browser: local disposable fixture only'));
  await (await collection.commitAwakening(await collection.commitmentFor(ownerAddress, secret, ownerAddress), {value: 1000n})).wait();
  await rpc.request({method: 'evm_mine', params: []}); await rpc.request({method: 'evm_mine', params: []});
  const mintReceipt = await (await collection.revealAwakening(secret, ownerAddress)).wait();
  const account = new Contract(await collection.accountOf(1), loadArtifact('SovereignAccount').abi, owner);
  const initial = await collection.renderSnapshot(1), initialBalance = await provider.getBalance(account.target);
  const originalAddresses = [collection.target, account.target, native.renderer.target];
  const originalCode = await Promise.all(originalAddresses.map(address => provider.getCode(address)));
  const deploy = async (name, args = []) => {
    active(); const artifact = loadArtifact(name);
    const contract = await new ContractFactory(artifact.abi, artifact.bytecode, owner).deploy(...args);
    await contract.waitForDeployment(); return contract;
  };
  const factory = await deploy('ModuleArchiveFactory');
  assert.ok((await factory.deploymentTransaction().wait()).blockNumber > mintReceipt.blockNumber);
  const releases = await deploy('ExtensionReleaseRegistry', [factory.target]);
  const modules = await deploy('TokenModuleRegistry', [collection.target, releases.target]);
  const state = new Contract(await modules.stateStore(), loadArtifact('ModuleStateStore').abi, provider);
  const packed = await examplePackage('aurora-notebook', {publisher: ownerAddress}), chunks = [];
  for (let offset = 0; offset < packed.archive.length; offset += 23000) chunks.push((await deploy('AppChunk', [hexlify(packed.archive.slice(offset, offset + 23000))])).target);
  const archived = await (await factory.createArchive(chunks, sha256(packed.archive))).wait();
  const archiveLog = archived.logs.map(log => { try { return factory.interface.parseLog(log); } catch { return null; } }).find(log => log?.name === 'ArchiveCreated');
  assert.ok(archiveLog, 'Actual archive receipt must identify the created reader');
  const archiveAddress = archiveLog.args.archive;
  const descriptor = sdk.descriptorFromManifest(packed.manifest, archiveAddress, 1, keccak256(await provider.getCode(archiveAddress)));
  const releaseInput = sdk.releaseInput(packed.manifest, descriptor);
  const releaseId = sdk.releaseIdFor(ownerAddress, releaseInput, packed.manifest);
  await (await releases.publish(releaseInput, toUtf8Bytes(sdk.canonicalManifest(packed.manifest)))).wait();
  const moduleKey = await releases.moduleKey(ownerAddress, releaseInput.moduleId);
  const request = payload => rpc.request(payload);
  const recoveredFixture = await sdk.recoverRelease({request, chainId: 31337, registry: releases.target, releaseId});
  assert.equal(recoveredFixture.releaseId, releaseId);
  assert.deepEqual(recoveredFixture.files[0].bytes, packed.files[0].bytes);
  assert.equal(await collection.totalSupply(), 1n); assert.equal(await modules.moduleCount(1), 0n);
  assert.equal((await collection.renderSnapshot(1)).actionNonce, initial.actionNonce);
  report.fixture = {status: 'passed', chainId: '31337', collection: collection.target, tokenId: '1', account: account.target,
    owner: ownerAddress, registry: modules.target, releases: releases.target, stateStore: state.target,
    releaseId, moduleKey, mintBlock: mintReceipt.blockNumber, moduleDeploymentBlock: (await modules.deploymentTransaction().wait()).blockNumber,
    archive: archiveAddress, archiveSha256: sha256(packed.archive), initialActionNonce: initial.actionNonce.toString()};
  save();
  if (options.fixtureOnly) {
    milestone('fixture-only-candidate-recheck'); recheckInputs();
    report.status = 'incomplete'; report.reason = 'Node fixture and recovery passed. Browser was explicitly not imported or executed.';
    return;
  }

  milestone('launch-browser');
  const {chromium} = await dependency('playwright');
  const {createStaticServer} = await project('scripts/lib/static-server.mjs');
  // Serve a captured copy, never rebuild or rewrite project artifacts during the test.
  const served = path.join(run, 'served'); fs.mkdirSync(served); fs.writeFileSync(path.join(served, 'index.html'), workbench.bytes);
  server = createStaticServer({directory: served});
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({timeout: 30000}); report.browser = browser.version(); report.browserExecuted = true;
  context = await browser.newContext({viewport: {width: 1440, height: 1050}, reducedMotion: 'reduce'});
  context.setDefaultTimeout(20000); context.setDefaultNavigationTimeout(30000);
  const allowedPages = new Set(), browserErrors = [], externalRequests = [], deniedRpc = [];
  const methods = new Set(['eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'net_version', 'eth_blockNumber', 'eth_getBalance', 'eth_getCode',
    'eth_getBlockByNumber', 'eth_call', 'eth_estimateGas', 'eth_getTransactionCount', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
    'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_sendTransaction']);
  let approval = null, accountRequests = 0;
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:') || new URL(url).origin === origin) return route.continue();
    externalRequests.push(url); return route.abort('blockedbyclient');
  });
  await context.exposeBinding('__animaLocalRpc', async (source, payload) => {
    active();
    assert.ok(allowedPages.has(source.page) && source.frame === source.page.mainFrame(), 'Only the approved top-level workbench gets a provider');
    assert.equal(new URL(source.frame.url()).origin, origin);
    if (!payload || !methods.has(payload.method) || (payload.params !== undefined && !Array.isArray(payload.params))) {
      deniedRpc.push(payload?.method ?? 'malformed'); throw Error('Unsupported local fixture RPC request');
    }
    if (payload.method === 'eth_requestAccounts') { accountRequests++; return [ownerAddress]; }
    if (payload.method === 'eth_accounts') return [ownerAddress];
    if (payload.method === 'eth_sendTransaction') {
      const expected = approval; approval = null;
      assert.ok(expected, 'A signing request occurred before the explicit test-controlled review click');
      const transaction = payload.params?.[0];
      assert.equal(transaction?.from?.toLowerCase(), ownerAddress);
      assert.equal(transaction?.to?.toLowerCase(), account.target.toLowerCase());
      assert.equal(BigInt(transaction?.value ?? 0), 0n);
      assert.equal((transaction?.data ?? transaction?.input)?.toLowerCase(), expected.data.toLowerCase(), 'Wallet must send the exact reviewed account.execute calldata');
      const hash = await rpc.request({method: payload.method, params: payload.params});
      report.walletTransactions.push({operation: expected.operation, reviewedAt: expected.reviewedAt, hash, data: expected.data}); save();
      return hash;
    }
    return rpc.request({method: payload.method, params: payload.params ?? []});
  });
  await context.addInitScript(() => {
    if (window !== window.top) return;
    const listeners = new Map();
    Object.defineProperty(window, 'ethereum', {configurable: false, value: Object.freeze({
      isAnimaDisposableLocalFixture: true,
      request: payload => window.__animaLocalRpc(payload),
      on: (name, listener) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); },
      removeListener: (name, listener) => listeners.get(name)?.delete(listener),
    })});
  });
  const record = {name: 'native-workbench-reviewed-install-save-disable-and-recovery', status: 'running', checkpoints: []};
  report.cases.push(record); milestone('native-ui-lifecycle');
  const note = name => { record.checkpoints.push(name); save(); };
  const url = origin + '/?' + new URLSearchParams({chainId: '31337', collection: collection.target, tokenId: '1', registry: modules.target});
  const idle = async (page, {allowError = false} = {}) => {
    await page.waitForFunction(() => document.querySelector('#workbench')?.getAttribute('aria-busy') === 'false');
    if (!allowError) assert.doesNotMatch(await page.locator('[data-node="status"]').getAttribute('class'), /am-error/, await page.locator('[data-node="status"]').textContent());
  };
  const open = async () => {
    const page = await context.newPage(); allowedPages.add(page);
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.goto(url); await page.getByRole('heading', {name: 'The same NFT. The same account.'}).waitFor();
    await page.getByRole('button', {name: 'Connect & read', exact: true}).click(); await idle(page);
    assert.match((await page.locator('[data-node="identity-summary"]').textContent()).toLowerCase(), new RegExp(account.target.toLowerCase()));
    await page.locator(`[data-node="catalog"] [data-release="${releaseId}"]`).click(); await idle(page);
    assert.match(await page.locator('[data-node="package"]').textContent(), /RECOVERED & HASH VERIFIED/);
    assert.ok((await page.locator('[data-node="package"]').textContent()).includes(releaseId));
    return page;
  };
  const page = await open();
  assert.equal(report.walletTransactions.length, 0); assert.equal(await modules.moduleCount(1), 0n);
  note('Real owner connected and exact catalog package recovered without a transaction');
  const review = async (action, expectedCount) => {
    await page.locator(`[data-action="${action}"]`).click(); await idle(page);
    assert.equal(await page.locator('[data-node="review"]').isVisible(), true);
    assert.equal(await page.locator('[data-node="confirm-review"]').isEnabled(), true);
    assert.equal(report.walletTransactions.length, expectedCount, 'Preparing a review must not send');
    const detail = (await page.locator('[data-node="review-content"]').textContent()).toLowerCase();
    assert.ok(detail.includes(account.target.toLowerCase()) && detail.includes(modules.target.toLowerCase()));
  };
  const executeData = (operation, args) => account.interface.encodeFunctionData('execute', [modules.target, 0, modules.interface.encodeFunctionData(operation, args)]);
  const sign = async (operation, args, expectedCount) => {
    const data = executeData(operation, args);
    const detail = (await page.locator('[data-node="review-content"]').textContent()).toLowerCase();
    assert.ok(detail.includes(data.toLowerCase()), 'Visible review must contain the exact account transaction');
    approval = {operation, data, reviewedAt: new Date().toISOString()};
    await page.locator('[data-node="confirm-review"]').click(); await idle(page);
    assert.equal(approval, null, 'Review must produce exactly one locally checked send');
    assert.equal(report.walletTransactions.length, expectedCount);
    const tx = report.walletTransactions.at(-1), receipt = await rpc.request({method: 'eth_getTransactionReceipt', params: [tx.hash]});
    const mined = await rpc.request({method: 'eth_getTransactionByHash', params: [tx.hash]});
    assert.equal(BigInt(receipt.status), 1n); assert.equal(mined.input.toLowerCase(), data.toLowerCase());
    assert.equal(mined.from.toLowerCase(), ownerAddress); assert.equal(mined.to.toLowerCase(), account.target.toLowerCase());
    assert.ok((await page.locator('[data-node="status"]').textContent()).includes(tx.hash), 'UI must display the real mined receipt hash');
    Object.assign(tx, {blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, gasUsed: receipt.gasUsed}); save();
    return receipt;
  };
  await review('install', 0);
  assert.equal((await modules.installation(1, moduleKey)).enabled, false);
  await page.locator('[data-action="cancel-review"]').click(); await idle(page);
  assert.equal(report.walletTransactions.length, 0); assert.equal(await modules.moduleCount(1), 0n);
  note('Cancelled installation review sent nothing');
  await review('install', 0);
  await sign('activate', [1, releaseId, await modules.rootOf(1), await account.sessionEpoch(), ZeroHash, ZeroHash], 1);
  assert.equal((await modules.installation(1, moduleKey)).enabled, true);
  assert.equal(await modules.moduleCount(1), 1n); assert.equal((await collection.renderSnapshot(1)).actionNonce, initial.actionNonce + 1n);
  note('Explicit installation signature executed through the native account');

  await page.locator('[data-action="launch"]').click(); await idle(page);
  const frame = page.frameLocator('[data-node="runtime-container"] iframe');
  await frame.getByRole('status').filter({hasText: 'Isolated module ready'}).waitFor();
  assert.equal(await frame.locator('body').evaluate(() => typeof window.ethereum), 'undefined', 'The module iframe must not inherit the injected provider');
  const savedText = 'Native browser fixture save — exact 🫧', savedValue = {notebook: {note: savedText}};
  await frame.getByLabel('A thought to keep').fill(savedText); await frame.getByRole('button', {name: 'Save draft', exact: true}).click();
  await frame.getByRole('status').filter({hasText: 'browser-draft'}).waitFor();
  assert.equal(report.walletTransactions.length, 1); assert.equal((await modules.installation(1, moduleKey)).stateHead, ZeroHash);
  await page.locator('.am-state > summary').click(); await page.locator('[data-node="state-consent"]').check();
  await review('save-state', 1);
  assert.equal((await modules.installation(1, moduleKey)).stateHead, ZeroHash); assert.equal(await state.countOf(1, moduleKey), 0n);
  const stateBytes = toUtf8Bytes(sdk.canonicalJSON(savedValue));
  const saveReceipt = await sign('writeState', [1, moduleKey, await modules.rootOf(1), await account.sessionEpoch(), stateBytes, sdk.EMPTY_ARCHIVE], 2);
  const stateEvent = saveReceipt.logs.filter(log => log.address.toLowerCase() === state.target.toLowerCase()).map(log => state.interface.parseLog(log)).find(log => log?.name === 'StateStaged');
  assert.ok(stateEvent, 'State save must be recoverable from an actual emitted receipt');
  const savedHead = stateEvent.args.stateId;
  assert.equal((await modules.installation(1, moduleKey)).stateHead, savedHead);
  const recoveredState = await sdk.recoverState({request, chainId: 31337, stateStore: state.target, stateId: savedHead, collection: collection.target, tokenId: 1, moduleKey});
  assert.deepEqual(recoveredState.bytes, stateBytes);
  await page.locator('[data-node="migration-json"]').fill('{"notTheChainState":true}');
  await page.locator('[data-action="restore-chain"]').click(); await idle(page);
  assert.deepEqual(JSON.parse(await page.locator('[data-node="migration-json"]').inputValue()), savedValue);
  assert.equal(report.walletTransactions.length, 2);
  note('Draft stayed local until signature; UI and independent SDK recovered exact saved chain bytes');

  // A second read-only UI session proves onchain revocation closes a live session,
  // rather than only observing the primary UI's normal close-before-review behavior.
  const observer = await open();
  await observer.locator('[data-action="launch"]').click(); await idle(observer);
  await observer.frameLocator('[data-node="runtime-container"] iframe').getByRole('status').filter({hasText: 'Isolated module ready'}).waitFor();
  await review('disable', 2);
  assert.equal((await modules.installation(1, moduleKey)).enabled, true);
  assert.equal(await observer.locator('[data-node="runtime-container"] iframe').count(), 1);
  await sign('disable', [1, moduleKey, await modules.rootOf(1), await account.sessionEpoch()], 3);
  assert.equal((await modules.installation(1, moduleKey)).enabled, false);
  await observer.locator('[data-node="runtime-container"] iframe').waitFor({state: 'detached', timeout: 15000});
  await observer.locator('[data-action="launch"]').click(); await idle(observer, {allowError: true});
  assert.match(await observer.locator('[data-node="status"]').textContent(), /no longer the enabled module/);
  assert.equal(await observer.locator('iframe').count(), 0); assert.equal(report.walletTransactions.length, 3);
  note('Reviewed disable mined; another live UI session closed and disabled relaunch was rejected');

  milestone('receipt-and-identity-recovery');
  const recoveredToken = await sdk.recoverToken({request, registry: modules.target, tokenId: 1, chainId: 31337});
  assert.equal(recoveredToken.context.modules.length, 1); assert.equal(recoveredToken.context.modules[0].enabled, false);
  assert.equal(recoveredToken.context.modules[0].stateHead, savedHead);
  assert.deepEqual(recoveredToken.context.history.map(entry => Number(entry.operation)), [1, 3, 2]);
  assert.equal(recoveredToken.states.length, 1); assert.deepEqual(recoveredToken.states[0].bytes, stateBytes);
  const final = await collection.renderSnapshot(1);
  for (const key of ['seed', 'genome', 'stateRoot', 'memoryRoot', 'lineageRoot', 'constitutionHash', 'bornAt', 'evolvedAt', 'generation', 'evolutions', 'parentId', 'sovereign', 'account', 'owner']) assert.equal(final[key], initial[key], 'Original identity field changed: ' + key);
  assert.equal(final.actionNonce, initial.actionNonce + 3n); assert.notEqual(final.auditRoot, initial.auditRoot);
  assert.equal(await collection.totalSupply(), 1n); assert.equal(await collection.accountOf(1), account.target);
  assert.equal(await collection.renderer(), native.renderer.target); assert.equal(await provider.getBalance(account.target), initialBalance);
  assert.equal(await account.instrumentGrantCount(), 0n); assert.deepEqual(await Promise.all(originalAddresses.map(address => provider.getCode(address))), originalCode);
  assert.equal(accountRequests, 2); assert.deepEqual(browserErrors, []); assert.deepEqual(externalRequests, []); assert.deepEqual(deniedRpc, []);
  assert.deepEqual(report.walletTransactions.map(tx => tx.operation), ['activate', 'writeState', 'disable']);
  record.recovery = {stateHead: savedHead, stateSha256: sha256(stateBytes), historyOperations: [1, 3, 2], masterSupply: '1', finalActionNonce: final.actionNonce.toString()};
  await page.screenshot({path: path.join(run, 'native-workbench.png'), fullPage: true});
  note('Receipts, disabled installation, retained state and original native identity independently rechecked');
  milestone('candidate-recheck'); recheckInputs(); record.status = 'passed'; report.status = 'passed';
}

try {
  deadline = setTimeout(() => stop('seven-minute deadline'), 7 * 60 * 1000);
  await Promise.race([execute(), interrupted]);
} catch (error) {
  report.status = 'failed'; report.error = error.stack ?? String(error);
  for (const entry of report.cases) if (entry.status === 'running') { entry.status = 'failed'; entry.error = report.error; }
} finally {
  stopped = true; clearTimeout(deadline);
  process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onTerminate);
  for (const [name, cleanup] of [
    ['context', () => context?.close()], ['browser', () => browser?.close()],
    ['server', () => new Promise(resolve => { if (!server) return resolve(); server.closeAllConnections?.(); server.close(resolve); })],
    ['provider', () => provider?.destroy()], ['local EVM', () => rpc?.disconnect()],
  ]) {
    try { await bounded(cleanup, 7000, name + ' cleanup'); }
    catch (error) { report.status = 'failed'; (report.cleanupErrors ??= []).push(String(error)); }
  }
  if (recheckInputs) {
    try { recheckInputs(); } catch (error) { report.status = 'failed'; report.finalProvenanceError = String(error); }
  }
  report.finishedAt = new Date().toISOString(); save();
  console.log('Native module browser evidence:', reportFile);
  console.log(options.fixtureOnly ? 'Fixture-only: browser NOT EXECUTED; browser gate remains incomplete.' : 'Native module browser status: ' + report.status);
  if (report.status !== 'passed' && !(options.fixtureOnly && report.status === 'incomplete' && report.fixture?.status === 'passed')) process.exitCode = 1;
}
