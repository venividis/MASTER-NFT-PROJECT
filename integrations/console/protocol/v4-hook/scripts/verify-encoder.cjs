const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const solc = require('./dependency.cjs')('solc');
const { ethers } = require('./dependency.cjs')('ethers');
const root = path.resolve(__dirname, '..');

function resolveSource(name) {
  for (const [prefix, directory] of [
    ['@uniswap/v4-core/', 'vendor/v4-core/'],
    ['@uniswap/v4-periphery/', 'vendor/v4-periphery/'],
    ['permit2/', 'vendor/v4-periphery/lib/permit2/']
  ]) if (name.startsWith(prefix)) return path.join(root, directory, name.slice(prefix.length));
  throw new Error('Unexpected source import: ' + name);
}

async function main() {
  const names = ['@uniswap/v4-periphery/src/interfaces/IPositionManager.sol', 'permit2/src/interfaces/IAllowanceTransfer.sol'];
  const result = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity',
    sources: Object.fromEntries(names.map(name => [name, { content: fs.readFileSync(resolveSource(name), 'utf8') }])),
    settings: { outputSelection: { '*': { '*': ['abi'] } } }
  }), { import(name) { try { return { contents: fs.readFileSync(resolveSource(name), 'utf8') }; }
    catch (error) { return { error: String(error) }; } } }));
  const errors = (result.errors || []).filter(error => error.severity === 'error');
  if (errors.length) throw new Error(errors.map(error => error.formattedMessage).join('\n'));
  for (const [sourceName, name] of [[names[0], 'IPositionManager'], [names[1], 'IAllowanceTransfer']]) {
    fs.writeFileSync(path.join(root, 'artifacts', name + '.json'), JSON.stringify({ contractName: name,
      sourceName, abi: result.contracts[sourceName][name].abi, bytecode: '0x',
      verification: 'ABI compiled from pinned official interface; not a deployable implementation.' }, null, 2) + '\n');
  }
  const { createPositionManagerEncoder, ACTIONS, POOL_KEY_TYPE, PERIPHERY_COMMIT, PERMIT2_COMMIT } =
    await import(pathToFileURL(path.join(__dirname, 'position-manager-encoder.mjs')));
  const encoder = createPositionManagerEncoder(ethers);
  const officialPosition = new ethers.Interface(result.contracts[names[0]].IPositionManager.abi);
  const officialPermit2 = new ethers.Interface(result.contracts[names[1]].IAllowanceTransfer.abi);
  const actionsSource = fs.readFileSync(path.join(root, 'vendor/v4-periphery/src/libraries/Actions.sol'), 'utf8');
  for (const [name, value] of Object.entries(ACTIONS)) {
    const match = actionsSource.match(new RegExp('constant\\s+' + name + '\\s*=\\s*(0x[0-9a-f]+)'));
    assert.ok(match);
    assert.equal(Number(match[1]), value);
  }
  assert.equal(encoder.positionInterface.getFunction('modifyLiquidities').selector,
    officialPosition.getFunction('modifyLiquidities').selector);
  assert.equal(encoder.permit2Interface.getFunction('approve').selector,
    officialPermit2.getFunction('approve').selector);
  assert.equal(encoder.permit2Interface.getFunction('allowance').selector,
    officialPermit2.getFunction('allowance').selector);
  const base = {
    positionManager: '0x0000000000000000000000000000000000001001',
    permit2: '0x0000000000000000000000000000000000001002',
    poolKey: { currency0: '0x0000000000000000000000000000000000002001',
      currency1: '0x0000000000000000000000000000000000002002', fee: 3000, tickSpacing: 60,
      hooks: '0x00000000000000000000000000000000000040c8' },
    tickLower: -600, tickUpper: 600, liquidity: 1000000000000000000n,
    amount0Max: 30000000000000000n, amount1Max: 30000000000000000n,
    recipient: '0x0000000000000000000000000000000000003001',
    refundRecipient: '0x0000000000000000000000000000000000003002',
    deadline: 2000000000n, hookData: '0x12345678'
  };
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const fixtures = [];
  for (const native of [false, true]) {
    const options = { ...base, poolKey: { ...base.poolKey,
      currency0: native ? ethers.ZeroAddress : base.poolKey.currency0 } };
    const plan = encoder.buildMintPosition(options);
    const outer = officialPosition.decodeFunctionData('modifyLiquidities', plan.request.data);
    assert.equal(outer.deadline, base.deadline);
    const [actions, params] = coder.decode(['bytes', 'bytes[]'], outer.unlockData);
    assert.equal(actions, native ? '0x020d14' : '0x020d');
    assert.equal(params.length, native ? 3 : 2);
    const decoded = coder.decode([POOL_KEY_TYPE, 'int24', 'int24', 'uint256', 'uint128', 'uint128', 'address', 'bytes'], params[0]);
    assert.equal(decoded[0].currency0, options.poolKey.currency0);
    assert.equal(decoded[0].currency1, options.poolKey.currency1);
    assert.equal(decoded[1], -600n);
    assert.equal(decoded[2], 600n);
    assert.equal(decoded[3], base.liquidity);
    assert.equal(decoded[4], base.amount0Max);
    assert.equal(decoded[5], base.amount1Max);
    assert.equal(decoded[6], base.recipient);
    assert.equal(decoded[7], base.hookData);
    // Assert the exact byte offsets used by the pinned optimized CalldataDecoder.
    const raw = ethers.getBytes(params[0]);
    const word = offset => ethers.toBigInt(ethers.hexlify(raw.slice(offset, offset + 32)));
    assert.equal(BigInt.asIntN(24, word(0xa0)), -600n);
    assert.equal(word(0xc0), 600n);
    assert.equal(word(0xe0), base.liquidity);
    assert.equal(word(0x100), base.amount0Max);
    assert.equal(word(0x120), base.amount1Max);
    assert.equal(word(0x140), BigInt(base.recipient));
    assert.equal(word(11 * 32), 12n * 32n);
    assert.deepEqual(Array.from(coder.decode(['address', 'address'], params[1])), [options.poolKey.currency0, options.poolKey.currency1]);
    assert.equal(plan.request.value, native ? base.amount0Max : 0n);
    assert.equal(plan.approvalRequirements.length, native ? 1 : 2);
    if (native) assert.deepEqual(Array.from(coder.decode(['address', 'address'], params[2])), [ethers.ZeroAddress, base.refundRecipient]);
    for (const requirement of plan.approvalRequirements) {
      const call = encoder.permit2Interface.encodeFunctionData('approve', [requirement.token, requirement.spender, requirement.amount, requirement.expiration]);
      const permit = officialPermit2.decodeFunctionData('approve', call);
      assert.equal(permit.spender, base.positionManager);
      assert.equal(permit.amount, requirement.amount);
      assert.equal(permit.expiration, base.deadline);
    }
    fixtures.push({ mode: native ? 'native/ERC20' : 'ERC20/ERC20', request: plan.request,
      actions: plan.actions, unlockData: plan.unlockData, approvalRequirements: plan.approvalRequirements });
  }
  assert.throws(() => encoder.buildMintPosition({ ...base, tickLower: -599 }));
  assert.throws(() => encoder.buildMintPosition({ ...base, recipient: '0x0000000000000000000000000000000000000002' }));
  const summary = { status: 'ABI and source verified', positionManagerExecution: 'not run',
    peripheryCommit: PERIPHERY_COMMIT, permit2Commit: PERMIT2_COMMIT,
    verified: ['Official compiled modifyLiquidities ABI and selector', 'Pinned MINT_POSITION / SETTLE_PAIR / SWEEP action bytes',
      'Mint fields and optimized official decoder byte offsets', 'Native value and explicit refund sweep',
      'Permit2 approve/allowance ABI, bounded amount and expiry', 'Tick alignment and literal recipient validation'],
    fixtures };
  fs.writeFileSync(path.join(root, 'artifacts/position-encoder-verification.json'), JSON.stringify(summary,
    (_, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
  console.log(JSON.stringify({ status: summary.status, positionManagerExecution: summary.positionManagerExecution,
    peripheryCommit: PERIPHERY_COMMIT, verified: summary.verified }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
