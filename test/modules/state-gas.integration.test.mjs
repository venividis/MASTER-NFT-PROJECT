import test from 'node:test';
import assert from 'node:assert/strict';
import { ZeroHash, hexlify, sha256 } from 'ethers';
import { fixture, emptyArchive, event } from './contracts.fixture.mjs';

// EIP-7825 caps the transaction gas limit at 2^24, independently of block gas.
// Enforce that budget explicitly even though the disposable EVM uses Shanghai.
const TRANSACTION_GAS_CAP = 2n ** 24n;
test('maximum direct state and chunk boundaries recover exactly within the transaction gas cap', async t => {
  const { account, modules, state, archive, publish, call, context } = await fixture(t, { mint: true });
  const payload = await archive('<p>Gas-bounded state</p>'), release = await publish(payload.descriptor);
  let c = await context();
  await call('activate', [1, release.id, c.root, c.epoch, ZeroHash, ZeroHash]);
  const retained = [], measurements = [];
  const transact = async (method, bytes) => {
    c = await context();
    const args = method === 'stageState'
      ? [1, release.key, c.root, c.epoch, release.input.stateSchema, bytes, emptyArchive]
      : [1, release.key, c.root, c.epoch, bytes, emptyArchive];
    const data = modules.interface.encodeFunctionData(method, args);
    const estimate = await account.execute.estimateGas(modules.target, 0, data);
    const limit = (estimate * 120n + 99n) / 100n;
    assert.ok(limit <= TRANSACTION_GAS_CAP, `${method}(${bytes.length}) needs ${limit} gas with review headroom; cap is ${TRANSACTION_GAS_CAP}`);
    const receipt = await (await account.execute(modules.target, 0, data, { gasLimit: limit })).wait();
    assert.equal(receipt.status, 1);
    const id = event(receipt, state, 'StateStaged').stateId;
    const record = await state.record(id);
    assert.equal(await state.dataOf(id), hexlify(bytes));
    assert.equal(record.dataHash, sha256(bytes));
    retained.push({ id, bytes });
    measurements.push({ method, bytes: bytes.length, gasUsed: String(receipt.gasUsed), gasLimit: String(limit) });
    return id;
  };
  for (const size of [32768, 23001, 23000, 1, 0]) {
    await transact('stageState', Uint8Array.from({ length: size }, (_, i) => 1 + (i * 37) % 255));
  }
  c = await context();
  await call('activate', [1, release.id, c.root, c.epoch, ZeroHash, retained[0].id]);
  const head = await transact('writeState', Uint8Array.from({ length: 32768 }, (_, i) => 1 + (i * 71) % 255));
  assert.equal((await modules.installation(1, release.key)).stateHead, head);
  assert.equal((await state.record(head)).parent, retained[0].id);
  for (const item of retained) assert.equal(await state.dataOf(item.id), hexlify(item.bytes), 'later snapshots retain every prior byte');
  t.diagnostic(JSON.stringify({ transactionGasCap: String(TRANSACTION_GAS_CAP), measurements }));
});
