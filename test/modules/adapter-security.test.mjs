import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface } from 'ethers';
import { RegistryAdapter } from '../../web/modules/adapter.mjs';
import { LiveProtocol, MEMORY_ABI } from '../../web/genesis/live-protocol.mjs';
import { prepareJournal } from '../../web/modules/journal.mjs';
import { ModuleHostSession, ReviewedAction, HOST_LIMITS, boundedJSON } from '../../web/modules/host.mjs';
import { ACCOUNT_ABI, TOKEN_REGISTRY_ABI, RELEASE_REGISTRY_ABI, ZERO_HASH, packageLegacyHTML, releaseInput, releaseIdFor, moduleKeyFor, sha256, canonicalManifest, manifestHash } from '../../packages/modules/sdk.mjs';

const address = byte => '0x' + byte.repeat(20);
const hash = byte => '0x' + byte.repeat(32);
const RELEASE_A = hash('aa'), RELEASE_B = hash('bb'), MODULE = hash('cc');
const SCHEMA_A = hash('dd'), SCHEMA_B = hash('ee');
const context = {
  chainId: '31337', collection: address('11'), tokenId: '1', account: address('22'),
  owner: address('33'), registry: address('44'), epoch: '2', root: hash('ff'),
  actionNonce: '3', mode: 0, snapshot: { chainId: '31337', block: '0x10', blockHash: hash('11') },
};
context.identity = { ...context };
function fixture({ enabled = true, releaseId = RELEASE_A } = {}) {
  const adapter = new RegistryAdapter({ raw: { request() { throw Error('Unexpected wallet call'); } } }, { registry: context.registry });
  adapter.context = async () => context;
  adapter.installation = async () => ({ moduleKey: MODULE, releaseId, stateHead: ZERO_HASH, enabled, epoch: '2' });
  return adapter;
}
const release = (releaseId = RELEASE_A, stateSchema = SCHEMA_A) => ({
  releaseId, moduleKey: MODULE, input: { stateSchema }, manifest: { stateSchema, capabilities: ['state.write'] },
});
const decode = intent => {
  const outer = new Interface(ACCOUNT_ABI).parseTransaction({ data: intent.recipe.data });
  assert.equal(outer.name, 'execute');
  assert.equal(outer.args[0].toLowerCase(), context.registry);
  return new Interface(TOKEN_REGISTRY_ABI).parseTransaction({ data: outer.args[2] });
};

test('a full 32 KiB state snapshot reaches exact reviewed calldata without increasing frame request limits', async () => {
  const adapter = fixture(), value = { note: 'x'.repeat(32768 - 11) };
  assert.equal(new TextEncoder().encode(JSON.stringify(value)).length, 32768);
  const intent = await adapter.intent('writeState', release(), { value });
  let preparations = 0, sends = 0;
  const review = new ReviewedAction({ verifyContext: async () => context.identity,
    prepare: async candidate => { preparations++; return candidate.recipe; },
    send: async (prepared, candidate) => { sends++; assert.equal(prepared.data, intent.recipe.data); assert.deepEqual(candidate.state, value); return { hash: hash('ab') }; },
  });
  assert.equal(HOST_LIMITS.requestBytes, 16384);
  assert.throws(() => boundedJSON({ id: 'large', method: 'state.set', params: { key: 'note', value: value.note } }), /byte limit/);
  await review.review(intent, context.identity);
  assert.equal(preparations, 1); assert.equal(sends, 0);
  const bytes = Buffer.from(decode(review.pending.intent).args.data.slice(2), 'hex');
  assert.equal(bytes.toString(), JSON.stringify(value));
  await review.confirm(); assert.equal(sends, 1);
  await assert.rejects(review.confirm(), /already been used/);
  await assert.rejects(review.review({ padding: 'x'.repeat(HOST_LIMITS.reviewBytes) }, context.identity), /byte limit/);
  assert.equal(preparations, 1, 'oversized review must fail before wallet preparation');
  assert.equal(review.pending, null);
});

test('a draft for an unactivated version cannot be written under the installed version schema', async () => {
  const adapter = fixture();
  await assert.rejects(adapter.intent('writeState', release(RELEASE_B, SCHEMA_B), { value: { v2: true } }), /enabled release.*staged migration/);
  // Even a schema-compatible different release requires selecting the edition
  // whose state the review says it will update.
  await assert.rejects(adapter.intent('writeState', release(RELEASE_B, SCHEMA_A), { value: { v2: true } }), /enabled release/);
  const staged = await adapter.intent('stageState', release(RELEASE_B, SCHEMA_B), { value: { v2: true } });
  const call = decode(staged);
  assert.equal(call.name, 'stageState');
  assert.equal(call.args.schema, SCHEMA_B);
  assert.equal(staged.releaseId, RELEASE_B);
});

test('finite decimal draft state survives both reviewed save and migration calldata', async () => {
  const value = { position: { x: 0.125, y: -2.75 }, volume: 0.7, tiny: 1e-9 };
  for (const kind of ['writeState', 'stageState']) {
    const intent = await fixture().intent(kind, release(), { value });
    assert.deepEqual(JSON.parse(Buffer.from(decode(intent).args.data.slice(2), 'hex')), value);
    assert.deepEqual(intent.state, value);
    await assert.rejects(fixture().intent(kind, release(), { value: { invalid: Infinity } }), /finite numbers/);
    await assert.rejects(fixture().intent(kind, release(), { value: { text: 'x'.repeat(32768) } }), /byte limit/);
  }
});

test('reviewed state preserves the full draft depth limit without expanding frame request depth', async () => {
  const nested = depth => { let value = 0.125; for (let i = 0; i < depth; i++) value = { draft: value }; return value; };
  const value = nested(HOST_LIMITS.valueDepth), excessive = nested(HOST_LIMITS.valueDepth + 1);
  assert.deepEqual(boundedJSON(value, 32768), value);
  for (const kind of ['writeState', 'stageState']) {
    const adapter = fixture(), intent = await adapter.intent(kind, release(), { value });
    let preparations = 0, sends = 0;
    const review = new ReviewedAction({ verifyContext: async () => context.identity,
      prepare: async candidate => { preparations++; return candidate.recipe; },
      send: async (prepared, candidate) => { sends++; assert.equal(prepared.data, intent.recipe.data); assert.deepEqual(candidate.state, value); return {}; },
    });
    await review.review(intent, context.identity);
    assert.equal(preparations, 1);
    assert.equal(Buffer.from(decode(review.pending.intent).args.data.slice(2), 'hex').toString(), JSON.stringify(value));
    await review.confirm(); assert.equal(sends, 1);
    await assert.rejects(adapter.intent(kind, release(), { value: excessive }), /nested too deeply/);
    await assert.rejects(review.review({ ...intent, state: excessive }, context.identity), /nested too deeply/);
    assert.equal(preparations, 1, 'excess depth must fail before wallet preparation');
    assert.equal(review.pending, null);
  }
  const drafts = new Map(), host = new ModuleHostSession({
    identity: context.identity, releaseId: RELEASE_A, moduleKey: MODULE,
    manifest: { stateSchema: SCHEMA_A, capabilities: ['state.write'] },
    storage: { getItem: key => drafts.get(key) ?? null, setItem: (key, text) => drafts.set(key, text) },
    verifyContext: async () => context.identity,
  });
  // The frame's params and value fields still count toward its depth limit.
  const message = (id, depth) => ({ id, method: 'state.set', params: { key: 'draft', value: nested(depth) } });
  await host.handle(message('accepted', HOST_LIMITS.valueDepth - 2));
  const before = [...drafts];
  await assert.rejects(host.handle(message('excessive', HOST_LIMITS.valueDepth - 1)), /nested too deeply/);
  assert.deepEqual([...drafts], before);
  host.close();
});

test('state snapshots require an enabled release and its verified nonzero schema', async () => {
  await assert.rejects(fixture({ enabled: false }).intent('writeState', release()), /enabled release/);
  const inconsistent = release(); inconsistent.manifest.stateSchema = SCHEMA_B;
  await assert.rejects(fixture().intent('writeState', inconsistent), /verified active release/);
  await assert.rejects(fixture().intent('writeState', release(RELEASE_A, ZERO_HASH)), /verified active release/);
  const intent = await fixture().intent('writeState', release(), { value: { draft: { version: 1 } } });
  const call = decode(intent);
  assert.equal(call.name, 'writeState');
  assert.equal(call.args.moduleKey, MODULE);
  assert.equal(call.args.expectedRoot, context.root);
  assert.equal(call.args.expectedEpoch, 2n);
  assert.equal(new TextDecoder().decode(Uint8Array.from(Buffer.from(call.args.data.slice(2), 'hex'))), '{"draft":{"version":1}}');
});

test('malformed public releases are isolated rows and cannot hide later valid releases', async () => {
  const publisher = address('55'), releases = address('66');
  const packaged = await packageLegacyHTML('<p>A valid recoverable module</p>', { name: 'valid-module', version: 1, publisher });
  const descriptor = { archive: address('77'), schema: 1, ...packaged.manifest.archive, codeHash: hash('88') };
  const input = releaseInput(packaged.manifest, descriptor);
  const validId = releaseIdFor(publisher, input, packaged.manifest);
  const moduleKey = moduleKeyFor(publisher, input.moduleId);
  const invalidId = hash('99'), malformed = new TextEncoder().encode('not JSON');
  const abi = new Interface(RELEASE_REGISTRY_ABI), requests = [];
  const request = async ({ method, params }) => {
    assert.equal(method, 'eth_call');
    assert.equal(params[0].to, releases);
    const call = abi.parseTransaction({ data: params[0].data }), id = call.args[0];
    requests.push([call.name, id]);
    assert.ok(id === validId || id === invalidId);
    if (call.name === 'release') return abi.encodeFunctionResult('release', [{ publisher, moduleKey, manifestHash: id === validId ? manifestHash(packaged.manifest) : sha256(malformed), publishedAt: 1, input }]);
    if (call.name === 'manifest') return abi.encodeFunctionResult('manifest', [id === validId ? new TextEncoder().encode(canonicalManifest(packaged.manifest)) : malformed]);
    throw Error('Unexpected release read');
  };
  const adapter = new RegistryAdapter({ raw: { request } }, { registry: context.registry });
  const rows = await adapter.catalogEntries([invalidId, validId], { ...context, releases });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].releaseId, invalidId);
  assert.equal(rows[0].invalid, true);
  assert.equal(rows[0].manifest, null);
  assert.ok(rows[0].error.length > 0 && rows[0].error.length <= 240);
  assert.equal(rows[1].releaseId, validId);
  assert.equal(rows[1].manifest.name, 'valid-module');
  assert.equal(rows[1].invalid, undefined);
  assert.ok(requests.some(([method, id]) => method === 'manifest' && id === validId));
  await assert.rejects(adapter.catalogEntries(Array(17).fill(validId), context), /catalog page/);
});

function journalFixture() {
  const ledger = address('77'), head = hash('88'), abi = new Interface(MEMORY_ABI), prepared = [];
  const wallet = {
    collection: context.collection, tokenId: 1n, account: context.account, address: context.owner,
    raw: { request() { throw Error('Unexpected wallet RPC'); } },
    async assertOwner() {},
    provider: { async call(tx) {
      assert.equal(tx.to.toLowerCase(), ledger);
      const call = abi.parseTransaction({ data: tx.data });
      if (call.name === 'collection') return abi.encodeFunctionResult('collection', [context.collection]);
      assert.equal(call.name, 'head'); assert.equal(call.args[0], 1n);
      return abi.encodeFunctionResult('head', [head]);
    } },
    async preparePersonal(plan) { prepared.push(plan); this.plan = plan; return plan; },
  };
  const adapter = new RegistryAdapter(wallet, { registry: context.registry });
  return { adapter, wallet, ledger, head, abi, prepared };
}

test('journal transaction encoding preserves explicit public/encrypted modes and exact payload bytes', async () => {
  const { adapter, wallet, ledger, head, abi, prepared } = journalFixture();
  const text = '  private orchid memory 🫧\n', passphrase = 'a test-only private memory passphrase';
  for (const mode of ['public', 'encrypted']) {
    const result = await prepareJournal({ mode, text, passphrase, identity: context.identity });
    const plan = await adapter.prepare({ kind: 'journal', ledger, text: result.chainText, privacyMode: mode, identity: context.identity });
    assert.equal(plan.target.toLowerCase(), ledger);
    const call = abi.parseTransaction({ data: plan.data });
    assert.equal(call.name, 'appendPersonal');
    assert.deepEqual([...call.args.slice(0, 5)], [1n, 0n, mode === 'encrypted' ? 1n : 0n, true, head]);
    const payload = new TextDecoder().decode(Buffer.from(call.args[5].slice(2), 'hex'));
    assert.equal(payload, result.chainText);
    if (mode === 'encrypted') {
      assert.equal(payload.includes('private orchid memory'), false);
      assert.equal(payload.includes(passphrase), false);
    }
    assert.equal(wallet.plan, plan);
  }
  assert.equal(prepared.length, 2);
  // Other existing inscription flows retain their explicit-public default.
  const legacy = await new LiveProtocol(wallet).inscribe({ journal: ledger, text, publicConsent: true });
  assert.equal(abi.parseTransaction({ data: legacy.plan.data }).args[2], 0n);
});

test('journal review rejects invalid encrypted packets, another custody epoch and unspecified privacy', async () => {
  const { adapter, wallet, ledger, prepared } = journalFixture();
  const encrypted = await prepareJournal({ mode: 'encrypted', text: 'private entry', passphrase: 'a test-only encrypted phrase', identity: context.identity });
  const intent = { kind: 'journal', ledger, text: encrypted.chainText, privacyMode: 'encrypted', identity: context.identity };
  for (const invalid of [
    { ...intent, text: 'plaintext is not an encrypted packet' },
    { ...intent, text: JSON.stringify(encrypted.packet, null, 2) },
    { ...intent, identity: { ...context.identity, epoch: '3' } },
    { ...intent, privacyMode: undefined },
    { ...intent, privacyMode: 'public', text: 'é'.repeat(1501) },
  ]) {
    wallet.plan = { stale: true };
    await assert.rejects(adapter.prepare(invalid));
    assert.equal(wallet.plan, null);
  }
  assert.equal(prepared.length, 0);
});
