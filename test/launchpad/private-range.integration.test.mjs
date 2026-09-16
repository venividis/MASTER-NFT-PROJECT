import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {JsonRpcProvider, ContractFactory, Contract, parseUnits, toBeHex} from '../../web/vendor/ethers.min.js';
import {launchPlan} from '../../web/v4/client.mjs';
import {resolveHumanRange, startingPrice, sqrtAtTick} from '../../web/v4/math.mjs';
import {V4Desk} from '../../web/v4/desk.mjs';
import {ARTIFACTS} from '../../web/v4/artifacts.mjs';
import {DEPLOYMENTS} from '../../web/launchpad/deployments.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const v4 = path.join(root, 'integrations/console/protocol/v4-hook');
const require = createRequire(import.meta.url);
const salt = toBeHex(1, 32);

function assertBounds(terms, decimals, tokenIs0) {
  const a = startingPrice('0.5', decimals, tokenIs0), b = startingPrice('2', decimals, tokenIs0);
  assert.ok(sqrtAtTick(Number(terms.tickLower)) <= (a < b ? a : b));
  assert.ok(sqrtAtTick(Number(terms.tickUpper)) >= (a < b ? b : a));
  assert.ok(Number(terms.tickLower) % 60 === 0);
  assert.ok(Number(terms.tickUpper) % 60 === 0);
}

test('human limits round outward for either currency order and reject invalid pairs', () => {
  for (const decimals of [6, 18, 36]) for (const tokenIs0 of [true, false]) {
    assertBounds(resolveHumanRange({lower: '0.5', upper: '2'}, decimals, tokenIs0, 60), decimals, tokenIs0);
  }
  assert.deepEqual(resolveHumanRange({mode: 'full'}, 6, true, 60), {tickLower: -887220, tickUpper: 887220});
  assert.throws(() => resolveHumanRange({lower: '2', upper: '0.5'}, 6, false, 60), /lower human price/);
  assert.throws(() => resolveHumanRange({lower: '0.5'}, 6, false, 60), /positive decimal/);
  assert.throws(() => resolveHumanRange({lower: '0.5', upper: '2'}, 6, false, 0), /tick spacing/);
});

test('private desk carries editable human limits and locking preserves the launchpad container', () => {
  const values = {humanLowerPrice: '0.5', humanUpperPrice: '2', salt};
  const form = V4Desk.prototype.operationPage.call({values, kind: 'launch', private: true, bridge: {info: {}}});
  assert.match(form, /name="humanLowerPrice"[^>]*value="0.5"/);
  assert.match(form, /name="humanUpperPrice"[^>]*value="2"/);
  const read = V4Desk.prototype.read.call({}, {querySelectorAll: () => [
    {name: 'humanLowerPrice', type: 'text', value: '0.5'},
    {name: 'humanUpperPrice', type: 'text', value: '2'},
  ]});
  assert.deepEqual(read, {humanLowerPrice: '0.5', humanUpperPrice: '2'});
  let cleared = 0, disconnected = 0, locked = 0;
  const privateContainer = {querySelector: () => ({}), innerHTML: 'open wallet'};
  const content = {querySelector: () => ({}), replaceChildren: () => cleared++};
  const previous = globalThis.document;
  globalThis.document = {querySelector: selector => selector === '#ld-private' ? privateContainer : content};
  const desk = {invalidate() {}, bridge: {lock() {locked++;}}, vault: {lock() {locked++;}}, public: {disconnect() {disconnected++;}}, onLock() {disconnected++;}, render() {assert.equal(this.view, 'wallet'); return 'locked wallet';}};
  try {
    V4Desk.prototype.lock.call(desk);
    assert.equal(privateContainer.innerHTML, 'locked wallet');
    assert.equal(cleared, 0);
    assert.equal(locked, 2);
    assert.equal(disconnected, 2);
    globalThis.document.querySelector = selector => selector === '#ld-private' ? null : content;
    V4Desk.prototype.lock.call(desk);
    assert.equal(cleared, 1);
  } finally {
    if (previous === undefined) delete globalThis.document; else globalThis.document = previous;
  }
});

function compileFixtures() {
  const solc = require(path.join(v4, 'scripts/dependency.cjs'))('solc');
  const resolve = name => name.startsWith('@uniswap/v4-core/') ? path.join(v4, 'vendor/v4-core', name.slice('@uniswap/v4-core/'.length)) : name.startsWith('solmate/') ? path.join(v4, 'vendor/v4-core/lib/solmate', name.slice('solmate/'.length)) : path.join(v4, name);
  const source = '@uniswap/v4-core/src/PoolManager.sol';
  const sources = {[source]: {content: fs.readFileSync(resolve(source), 'utf8')}, 'Fixture.sol': {content: `
    pragma solidity 0.8.26;
    contract Quote {
      uint8 public constant decimals = 6;
      mapping(address => uint256) public balanceOf;
      mapping(address => mapping(address => uint256)) public allowance;
      constructor() { balanceOf[msg.sender] = 1_000_000_000e6; }
      function approve(address to, uint256 amount) external returns(bool) { allowance[msg.sender][to] = amount; return true; }
      function transfer(address to, uint256 amount) external returns(bool) { balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true; }
      function transferFrom(address from, address to, uint256 amount) external returns(bool) { allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount; return true; }
    }
    // A contract payer exercises the same factory address ordering boundary as a
    // private relay. It intentionally does not model shielded proofs or relaying.
    contract Payer {
      address public immutable owner = msg.sender;
      function execute(address to, bytes calldata data) external returns(bytes memory) {
        require(msg.sender == owner); (bool ok, bytes memory result) = to.call(data);
        if (!ok) assembly { revert(add(result, 32), mload(result)) }
        return result;
      }
    }
  `}};
  const result = JSON.parse(solc.compile(JSON.stringify({language: 'Solidity', sources, settings: {optimizer: {enabled: true, runs: 200}, viaIR: true, evmVersion: 'cancun', outputSelection: {'*': {'*': ['abi', 'evm.bytecode.object']}}}}), {import: name => {
    try { return {contents: fs.readFileSync(resolve(name), 'utf8')}; } catch (error) { return {error: String(error)}; }
  }}));
  assert.deepEqual((result.errors || []).filter(error => error.severity === 'error'), []);
  return result.contracts;
}

test('real PoolManager launch resolves human limits for the contract payer after prediction', {timeout: 180000}, async () => {
  const compiled = compileFixtures(), port = 24929, rpc = `http://127.0.0.1:${port}`;
  const anvil = spawn(process.execPath, [path.join(v4, 'node_modules/@foundry-rs/anvil/bin.mjs'), '--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337', '--hardfork', 'cancun', '--silent'], {stdio: ['ignore', 'ignore', 'pipe']});
  let provider, stderr = '';
  anvil.stderr.on('data', bytes => stderr += bytes);
  try {
    for (let i = 0; i < 100; i++) {
      try {
        const response = await fetch(rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: []})});
        if ((await response.json()).result === '0x7a69') break;
      } catch {}
      if (i === 99) throw Error(stderr || 'Anvil did not start.');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    provider = new JsonRpcProvider(rpc, 31337, {staticNetwork: true, cacheTimeout: -1});
    provider.pollingInterval = 10;
    const signer = await provider.getSigner(0), publicPayer = await signer.getAddress();
    const deploy = async (artifact, args = []) => {
      const instance = await new ContractFactory(artifact.abi, '0x' + artifact.evm.bytecode.object, signer).deploy(...args);
      await instance.waitForDeployment(); return instance;
    };
    const manager = await deploy(compiled['@uniswap/v4-core/src/PoolManager.sol'].PoolManager, [publicPayer]);
    const quote = await deploy(compiled['Fixture.sol'].Quote);
    const factory = await new ContractFactory(ARTIFACTS.GenesisV4Launchpad.abi, DEPLOYMENTS.GenesisV4Launchpad.bytecode, signer).deploy(await manager.getAddress());
    await factory.waitForDeployment();
    const relay = await deploy(compiled['Fixture.sol'].Payer), actualPayer = await relay.getAddress();
    const config = {chainId: 31337, manager: await manager.getAddress(), factory: await factory.getAddress()};
    const draft = {name: 'Private Human Range', symbol: 'PHR', supply: '1000000', quoteToken: await quote.getAddress(), tokenBudget: '10000', quoteBudget: '10000', price: '1', fee: 3000, tickSpacing: 60, tickLower: -60, tickUpper: 60, humanLowerPrice: '0.5', humanUpperPrice: '2', salt};
    let publicPlan, plan;
    // Deterministically find an identity whose currency ordering changes with the payer.
    for (let i = 1; i <= 128; i++) {
      draft.salt = toBeHex(i, 32);
      publicPlan = await launchPlan(provider, config, draft, publicPayer);
      plan = await launchPlan(provider, config, draft, actualPayer);
      if ((BigInt(publicPlan.summary.token) < BigInt(draft.quoteToken)) !== (BigInt(plan.summary.token) < BigInt(draft.quoteToken))) break;
      if (i === 128) throw Error('Could not find opposite payer ordering.');
    }
    const tokenIs0 = BigInt(plan.summary.token) < BigInt(draft.quoteToken);
    assert.notEqual(publicPlan.summary.token, plan.summary.token);
    assert.notEqual(Math.sign(publicPlan.terms.tickLower), Math.sign(plan.terms.tickLower));
    assertBounds(plan.terms, 6, tokenIs0);
    assert.equal(plan.summary.range, '0.5 to 2 quote per token');
    assert.equal(plan.terms.sqrtPriceX96, startingPrice('1', 6, tokenIs0));
    const viaRange = await launchPlan(provider, config, {...draft, humanLowerPrice: '', humanUpperPrice: '', range: {mode: 'custom', lower: '0.5', upper: '2'}}, actualPayer);
    assert.equal(viaRange.request.data, plan.request.data);
    await assert.rejects(launchPlan(provider, config, {...draft, humanUpperPrice: ''}, actualPayer), /both lower and upper/);
    await (await quote.transfer(actualPayer, parseUnits('10000', 6))).wait();
    await (await relay.execute(await quote.getAddress(), quote.interface.encodeFunctionData('approve', [config.factory, plan.terms.quoteBudget]))).wait();
    const receipt = await (await relay.execute(plan.request.to, plan.request.data)).wait();
    assert.equal(receipt.status, 1);
    const position = new Contract(plan.summary.position, ARTIFACTS.GenesisV4Position.abi, provider);
    assert.equal(await position.manager(), config.manager);
    assert.equal(await position.tickLower(), BigInt(plan.terms.tickLower));
    assert.equal(await position.tickUpper(), BigInt(plan.terms.tickUpper));
    const key = await position.poolKey();
    assert.equal(key.currency0, tokenIs0 ? plan.summary.token : draft.quoteToken);
    assert.equal(key.currency1, tokenIs0 ? draft.quoteToken : plan.summary.token);
    assert.ok(await position.balanceOf(actualPayer) > 0n);
    assert.equal(await position.balanceOf(publicPayer), 0n);
    const minted = new Contract(plan.summary.token, ['function balanceOf(address) view returns(uint256)'], provider);
    assert.ok(await minted.balanceOf(actualPayer) >= parseUnits('990000', 18));
    assert.equal(await minted.balanceOf(publicPayer), 0n);
  } finally {
    provider?.destroy(); anvil.kill('SIGTERM');
  }
});
