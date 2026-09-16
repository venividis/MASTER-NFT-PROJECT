import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface, parseEther } from 'ethers';
import { ConfluenceWallet } from '../../web/confluence/wallet.mjs';

const EOA = '0x' + '1'.repeat(40), NEXT = '0x' + '2'.repeat(40), NFT_ACCOUNT = '0x' + '3'.repeat(40), EXTENSION = '0x' + '4'.repeat(40), COLLECTION = '0x' + '5'.repeat(40);
const execute = new Interface(['function execute(address,uint256,bytes) payable returns(bytes)']);
function fixture({ owner = false } = {}) {
  const state = { chain: '0x7a69', accounts: [EOA], code: '0x60006000f3', epoch: 1n, sent: [], calls: [], onCall: null, nftReads: 0 };
  const wallet = new ConfluenceWallet();
  wallet.revision = 1; wallet.connected = owner; wallet.address = EOA; wallet.chainId = 31337n; wallet.account = NFT_ACCOUNT; wallet.collection = COLLECTION; wallet.tokenId = 1n;
  wallet.raw = { request: async ({ method }) => { if (method === 'eth_chainId') return state.chain; if (method === 'eth_accounts') return [...state.accounts]; throw Error('Unexpected signer RPC: ' + method); } };
  wallet.provider = { getCode: async () => state.code, call: async transaction => { state.calls.push({ ...transaction }); await state.onCall?.(); return '0x'; }, estimateGas: async () => 50000n, getBalance: async () => parseEther('2') };
  wallet.signer = { sendTransaction: async transaction => { state.sent.push({ ...transaction }); return { hash: '0x' + 'a'.repeat(64), wait: async () => ({ status: 1, blockNumber: 99, logs: [] }) }; } };
  wallet.core = { ownerOf: async () => { ++state.nftReads; if (!owner) throw Error('Shareholder has no NFT'); return EOA; } };
  wallet.contract = { mode: async () => 0n, sessionEpoch: async () => state.epoch,
    execute: { populateTransaction: async (target, value, data) => ({ to: NFT_ACCOUNT, data: execute.encodeFunctionData('execute', [target, value, data]) }) } };
  return { wallet, state };
}

test('an external participant with no NFT can prepare and send a payable EOA transaction; NFT path still spends through its account', async () => {
  const external = fixture();
  assert.equal(await external.wallet.connectSigner(), EOA);
  const plan = await external.wallet.prepareExternal({ target: EXTENSION, value: parseEther('.125'), data: '0xaabb' });
  assert.equal(plan.execution, 'external'); assert.equal(plan.account, EOA); assert.equal(plan.transaction.from, EOA); assert.equal(plan.transaction.to, EXTENSION); assert.equal(plan.transaction.value, parseEther('.125')); assert.equal(plan.value, '0.125'); assert.equal(external.state.nftReads, 0);
  await external.wallet.send(); assert.equal(external.state.sent.length, 1); assert.equal(external.state.sent[0].to, EXTENSION); assert.equal(external.state.sent[0].value, parseEther('.125')); assert.equal(external.state.nftReads, 0);
  const owned = fixture({ owner: true });
  await owned.wallet.prepare({ target: EXTENSION, value: '.125', data: '0xaabb' }); await owned.wallet.send();
  assert.equal(owned.state.sent[0].to, NFT_ACCOUNT); assert.equal(owned.state.sent[0].value ?? 0n, 0n);
  const decoded = execute.decodeFunctionData('execute', owned.state.sent[0].data); assert.equal(decoded[0].toLowerCase(), EXTENSION); assert.equal(decoded[1], parseEther('.125')); assert.equal(decoded[2], '0xaabb'); assert.ok(owned.state.nftReads > 0);
});

test('external review rejects changed account, chain, revision and runtime code before broadcasting', async () => {
  const changes = [
    s => { s.state.accounts = [NEXT]; },
    s => { s.state.chain = '0x1'; },
    s => { s.wallet.invalidation(); },
    s => { s.state.code = '0x60016000f3'; }
  ];
  for (const change of changes) {
    const s = fixture(); await s.wallet.prepareExternal({ target: EXTENSION, value: 1n });
    let mutationBlocked = false; try { change(s); } catch (error) { if (!(error instanceof TypeError)) throw error; mutationBlocked = true; }
    if (!mutationBlocked) await assert.rejects(s.wallet.send(), /changed|expired/i);
    assert.equal(s.state.sent.length, 0); if (!mutationBlocked) assert.equal(s.wallet.plan, null);
  }
});

test('an external review expires after five minutes even though its timestamp is sealed', async t => {
  const s = fixture(); await s.wallet.prepareExternal({ target: EXTENSION }); const now = Date.now();
  t.mock.method(Date, 'now', () => now + 300001);
  await assert.rejects(s.wallet.send(), /expired/); assert.equal(s.state.sent.length, 0); assert.equal(s.wallet.plan, null);
});

test('a fresh injected signer connects without selecting or owning an NFT and registers account invalidation', async t => {
  const priorWindow = globalThis.window, handlers = new Map(), requests = [];
  const raw = { request: async ({ method }) => { requests.push(method); if (method === 'eth_chainId') return '0x7a69'; if (['eth_requestAccounts', 'eth_accounts'].includes(method)) return [EOA]; throw Error('Unexpected RPC: ' + method); }, on: (name, callback) => handlers.set(name, callback), removeListener: name => handlers.delete(name) };
  globalThis.window = { ethereum: raw }; t.after(() => { if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow; });
  const wallet = new ConfluenceWallet(); assert.equal(await wallet.connectSigner(), EOA); assert.equal(wallet.chainId, 31337n); assert.equal(wallet.connected, false); assert.ok(requests.includes('eth_requestAccounts')); assert.equal(wallet.collection, undefined);
  const revision = wallet.revision; wallet.plan = { review: 'pending' }; handlers.get('accountsChanged')([NEXT]); assert.equal(wallet.plan, null); assert.equal(wallet.revision, revision + 1); wallet.provider.destroy();
});

test('external review rechecks wallet context after final simulation; an account switch during that await cannot broadcast', async () => {
  const s = fixture(); await s.wallet.prepareExternal({ target: EXTENSION, data: '0xaabb' });
  s.state.onCall = async () => { s.state.accounts = [NEXT]; };
  await assert.rejects(s.wallet.send(), /changed/); assert.equal(s.state.sent.length, 0);
});

test('edited external transaction bytes or value cannot bypass the exact reviewed payload', async () => {
  for (const edit of [p => { p.transaction.to = NEXT; }, p => { p.transaction.value = parseEther('1'); }, p => { p.transaction.data = '0xdeadbeef'; }, p => { p.transaction.from = NEXT; }, p => { p.transaction.chainId = 1n; }]) {
    const s = fixture(); const p = await s.wallet.prepareExternal({ target: EXTENSION, data: '0xaabb', value: 123n });
    let mutationBlocked = false;
    try { edit(p); } catch (error) { if (!(error instanceof TypeError)) throw error; mutationBlocked = true; }
    if (!mutationBlocked) await assert.rejects(s.wallet.send(), /changed|review|payload|transaction/i);
    assert.equal(s.state.sent.length, 0);
  }
});

test('external preparation refuses an EOA target, malformed calldata, negative value and context changes during simulation', async () => {
  const s = fixture(); s.state.code = '0x'; await assert.rejects(s.wallet.prepareExternal({ target: EXTENSION }), /no deployed code/);
  s.state.code = '0x60006000f3'; await assert.rejects(s.wallet.prepareExternal({ target: EXTENSION, data: '0xa' }), /Invalid/); await assert.rejects(s.wallet.prepareExternal({ target: EXTENSION, value: -1n }), /Invalid/);
  s.state.onCall = async () => { s.state.accounts = [NEXT]; };
  await assert.rejects(s.wallet.prepareExternal({ target: EXTENSION }), /changed/); assert.equal(s.wallet.plan, null); assert.equal(s.state.sent.length, 0);
});
