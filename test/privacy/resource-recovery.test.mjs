import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { recoverResource, resourceSha256 } from '../../web/privacy/recover-resource.mjs';

// Solidity ABI selectors are constants so these fixtures need no Web3 library.
const SELECTOR = {
  schemaVersion: '0x4e2ce6d3',
  shardCount: '0x04e9c77a',
  shards: '0x16faae90',
  shardByteLengths: '0xe2345b11',
  shardChunkCounts: '0x6c1fb5ba',
  shardSha256: '0xfcd5661c',
  compressedByteLength: '0x20d169ff',
  byteLength: '0x02823108',
  compressedSha256: '0xb3db7758',
  contentSha256: '0xefad39b0',
  totalChunkCount: '0x1b02192e',
  chunkCount: '0xf91f0937',
  readChunk: '0x8f5281bf',
};
const ROOT = `0x${'ab'.repeat(20)}`;
const BLOCK = '0x1234';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const word = (value) => BigInt(value).toString(16).padStart(64, '0');
const uint = (value) => `0x${word(value)}`;
const bytes32 = (hex) => `0x${hex}`;
const address = (hex) => `0x${hex.slice(2).padStart(64, '0')}`;
const dynamicBytes = (bytes) => {
  const hex = Buffer.from(bytes).toString('hex');
  return `0x${word(32)}${word(bytes.length)}${hex.padEnd(Math.ceil(bytes.length / 32) * 64, '0')}`;
};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

function fixture({ chainId = '0x7a69', override, delay = 0, gateChunk } = {}) {
  const source = `export const records = ${JSON.stringify(Array.from({ length: 80 }, (_, i) => ({
    key: i,
    label: `item-${i}-${(i * 7919).toString(36)}`,
    value: i * i,
  })))};\n`;
  const raw = Buffer.from(source);
  const compressed = gzipSync(raw);
  const shards = Array.from({ length: 3 }, (_, i) => {
    const bytes = compressed.subarray(Math.floor(i * compressed.length / 3), Math.floor((i + 1) * compressed.length / 3));
    return {
      address: `0x${(i + 1).toString(16).padStart(40, '0')}`,
      bytes,
      chunks: Array.from({ length: Math.ceil(bytes.length / 29) }, (_, j) => bytes.subarray(j * 29, (j + 1) * 29)),
    };
  });
  const descriptor = { resource: ROOT, chainId: 31337, sha256: hash(raw), byteLength: raw.length };
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const request = async ({ method, params = [] }) => {
    calls.push({ method, params });
    if (method === 'eth_chainId') return chainId;
    if (method === 'eth_blockNumber') return BLOCK;
    assert.equal(method, 'eth_call', `Unexpected RPC method: ${method}`);
    assert.equal(params[1], BLOCK, 'Every contract read must use the same pinned block');
    const [{ to, data }] = params;
    const selector = data.slice(0, 10);
    const index = data.length > 10 ? Number(BigInt(`0x${data.slice(10)}`)) : undefined;
    const shard = shards.find((item) => item.address.toLowerCase() === to.toLowerCase());
    const context = { to, data, selector, index, shard, raw, compressed, shards, descriptor };
    active += 1;
    maxActive = Math.max(maxActive, active);
    try {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (selector === SELECTOR.readChunk && gateChunk) await gateChunk(context);
      const replacement = override?.(context);
      if (replacement !== undefined) return replacement;
      if (to.toLowerCase() === ROOT.toLowerCase()) {
        if (selector === SELECTOR.schemaVersion) return uint(1);
        if (selector === SELECTOR.shardCount) return uint(shards.length);
        if (selector === SELECTOR.shards) return address(shards[index].address);
        if (selector === SELECTOR.shardByteLengths) return uint(shards[index].bytes.length);
        if (selector === SELECTOR.shardChunkCounts) return uint(shards[index].chunks.length);
        if (selector === SELECTOR.shardSha256) return bytes32(hash(shards[index].bytes));
        if (selector === SELECTOR.compressedByteLength) return uint(compressed.length);
        if (selector === SELECTOR.byteLength) return uint(raw.length);
        if (selector === SELECTOR.compressedSha256) return bytes32(hash(compressed));
        if (selector === SELECTOR.contentSha256) return bytes32(descriptor.sha256);
        if (selector === SELECTOR.totalChunkCount) return uint(shards.reduce((count, shard) => count + shard.chunks.length, 0));
      } else if (shard) {
        if (selector === SELECTOR.chunkCount) return uint(shard.chunks.length);
        if (selector === SELECTOR.byteLength) return uint(shard.bytes.length);
        if (selector === SELECTOR.contentSha256) return bytes32(hash(shard.bytes));
        if (selector === SELECTOR.readChunk) return dynamicBytes(shard.chunks[index]);
      }
      assert.fail(`Unexpected contract call: ${to} ${data}`);
    } finally {
      active -= 1;
    }
  };
  return { request, descriptor, calls, raw, compressed, shards, get maxActive() { return maxActive; } };
}

test('reconstructs and verifies gzip bytes spread across several shards at one block', async () => {
  const f = fixture();
  const bytes = await recoverResource(f.request, f.descriptor, { concurrency: 3 });
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual(Buffer.from(bytes), f.raw);
  assert.equal(f.calls.filter((call) => call.method === 'eth_blockNumber').length, 1);
  const chunks = f.calls.filter((call) => call.method === 'eth_call' && call.params[0].data.startsWith(SELECTOR.readChunk));
  assert.equal(chunks.length, f.shards.reduce((total, shard) => total + shard.chunks.length, 0));
  assert.equal(new Set(chunks.map((call) => call.params[0].to)).size, 3);
});

test('rejects another chain before reading any contract', async () => {
  const f = fixture({ chainId: '0x1' });
  await assert.rejects(recoverResource(f.request, f.descriptor));
  assert.equal(f.calls.filter((call) => call.method === 'eth_call').length, 0);
});

test('rejects a compressed SHA-256 mismatch', async () => {
  const f = fixture({ override: ({ selector }) => selector === SELECTOR.compressedSha256 ? bytes32('01'.repeat(32)) : undefined });
  await assert.rejects(recoverResource(f.request, f.descriptor), /Compressed resource digest mismatch/);
});

test('rejects expanded bytes whose SHA-256 does not match both trusted and onchain metadata', async () => {
  const f = fixture();
  // The responder reads this same descriptor, so both claimed raw hashes agree.
  // Only hashing the actual decompressed bytes can detect the mismatch.
  f.descriptor.sha256 = '01'.repeat(32);
  await assert.rejects(recoverResource(f.request, f.descriptor), /Expanded resource digest mismatch/);
});

test('rejects a corrupted individual shard hash', async () => {
  const f = fixture({ override: ({ selector, shard }) => shard && selector === SELECTOR.contentSha256 ? bytes32('01'.repeat(32)) : undefined });
  await assert.rejects(recoverResource(f.request, f.descriptor), /Resource shard metadata changed or does not match the directory/);
});

test('rejects changed chunk bytes even when their ABI encoding and length remain valid', async () => {
  const f = fixture({ override: ({ selector, shard, index }) => {
    if (selector !== SELECTOR.readChunk || index !== 0) return undefined;
    const changed = Buffer.from(shard.chunks[index]);
    changed[0] ^= 1;
    return dynamicBytes(changed);
  } });
  await assert.rejects(recoverResource(f.request, f.descriptor), /Resource shard digest mismatch/);
});

for (const [name, delta, expectedError] of [
  ['more expanded bytes than pinned', -1, /Expanded resource exceeds its pinned byte length/],
  ['fewer expanded bytes than pinned', 1, /Expanded resource byte length mismatch/],
]) {
  test(`rejects ${name} while decompressing despite matching descriptor and directory lengths`, async () => {
    const f = fixture({ override: ({ to, selector, descriptor }) => (
      to.toLowerCase() === ROOT.toLowerCase() && selector === SELECTOR.byteLength
        ? uint(descriptor.byteLength)
        : undefined
    ) });
    f.descriptor.byteLength = f.raw.length + delta;
    await assert.rejects(recoverResource(f.request, f.descriptor), expectedError);
  });
}

test('SHA-256 fallback matches standard vectors and Node crypto across padding boundaries', () => {
  const standardVectors = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ];
  for (const [input, expected] of standardVectors) {
    assert.equal(resourceSha256(Buffer.from(input)), expected, `Standard vector ${JSON.stringify(input)}`);
  }
  for (const length of [1, 3, 55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 4097]) {
    // A nonzero offset catches implementations that accidentally hash the full
    // underlying ArrayBuffer rather than the supplied Uint8Array view.
    const backing = Uint8Array.from({ length: length + 17 }, (_, i) => (i * 73 + 19) & 255);
    const bytes = backing.subarray(7, 7 + length);
    assert.equal(resourceSha256(bytes), hash(bytes), `Binary vector length ${length}`);
  }
});

for (const { name, override, options } of [
  { name: 'an unsupported schema', override: ({ selector }) => selector === SELECTOR.schemaVersion ? uint(2) : undefined },
  { name: 'zero shards', override: ({ selector }) => selector === SELECTOR.shardCount ? uint(0) : undefined },
  { name: 'too many shards', options: { maxShards: 2 } },
  { name: 'zero chunks in a shard', override: ({ selector }) => selector === SELECTOR.chunkCount ? uint(0) : undefined },
  { name: 'too many chunks in a shard', options: { maxChunksPerShard: 1 } },
  { name: 'unsafe shard count', override: ({ selector }) => selector === SELECTOR.shardCount ? uint(2n ** 255n) : undefined },
  { name: 'unsafe chunk count', override: ({ selector }) => selector === SELECTOR.chunkCount ? uint(2n ** 255n) : undefined },
  { name: 'compressed size above the cap', options: { maxCompressedBytes: 1 } },
  { name: 'expanded size above the cap', options: { maxExpandedBytes: 1 } },
  { name: 'a directory chunk-total mismatch', override: ({ selector }) => selector === SELECTOR.totalChunkCount ? uint(1) : undefined },
  { name: 'a directory shard-length mismatch', override: ({ selector }) => selector === SELECTOR.shardByteLengths ? uint(1) : undefined },
  { name: 'a directory shard-hash mismatch', override: ({ selector }) => selector === SELECTOR.shardSha256 ? bytes32('01'.repeat(32)) : undefined },
]) {
  test(`rejects ${name}`, async () => {
    const f = fixture({ override });
    await assert.rejects(recoverResource(f.request, f.descriptor, options));
    const chunkCalls = f.calls.filter((call) => call.method === 'eth_call' && call.params[0].data.startsWith(SELECTOR.readChunk));
    assert.equal(chunkCalls.length, 0, 'Invalid metadata must fail before downloading chunks');
  });
}

for (const [name, malformed] of [
  ['incorrect ABI offset', `0x${word(0)}${word(1)}${'ff'.padEnd(64, '0')}`],
  ['truncated ABI header', `0x${word(32)}`],
  ['declared length beyond returned bytes', `0x${word(32)}${word(1024)}${'ff'.padEnd(64, '0')}`],
  ['unsafe ABI byte length', `0x${word(32)}${word(2n ** 255n)}`],
  ['non-hex ABI data', `0x${word(32)}${word(1)}${'zz'.padEnd(64, '0')}`],
]) {
  test(`rejects readChunk response with ${name}`, async () => {
    const f = fixture({ override: ({ selector }) => selector === SELECTOR.readChunk ? malformed : undefined });
    await assert.rejects(recoverResource(f.request, f.descriptor));
  });
}

test('respects the configured maximum simultaneous provider requests', async () => {
  const f = fixture({ delay: 2 });
  const bytes = await recoverResource(f.request, f.descriptor, { concurrency: 2 });
  assert.deepEqual(Buffer.from(bytes), f.raw);
  assert.ok(f.maxActive <= 2, `Observed ${f.maxActive} concurrent requests with limit 2`);
});

test('a pre-aborted signal fails without making provider requests', async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(recoverResource(f.request, f.descriptor, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(f.calls.length, 0);
});

test('abort during concurrent chunk reads stops queued requests', { timeout: 5000 }, async () => {
  const started = deferred();
  const gate = deferred();
  const controller = new AbortController();
  const f = fixture({ gateChunk: async () => { started.resolve(); await gate.promise; } });
  const recovering = recoverResource(f.request, f.descriptor, { concurrency: 2, signal: controller.signal });
  await Promise.race([started.promise, recovering.then(() => assert.fail('Recovery completed without waiting for chunks'))]);
  controller.abort();
  const callsAtAbort = f.calls.length;
  gate.resolve();
  await assert.rejects(recovering, { name: 'AbortError' });
  assert.equal(f.calls.length, callsAtAbort, 'Abort must prevent workers from launching further RPC calls');
  assert.ok(f.maxActive <= 2);
});
