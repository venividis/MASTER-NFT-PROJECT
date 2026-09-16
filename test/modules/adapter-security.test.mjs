import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface } from 'ethers';
import { RegistryAdapter } from '../../web/modules/adapter.mjs';
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
