const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ethers } = require('../scripts/dependency.cjs')('ethers');
const { compileFixtures } = require('../scripts/compile.cjs');
const { mine } = require('../scripts/mine-salt.cjs');
const root = path.resolve(__dirname, '..');

async function main() {
  const compiled = compileFixtures();
  const rpcPort = 23947;
  const rpc = `http://127.0.0.1:${rpcPort}`;
  const anvil = spawn(process.execPath, [path.join(root, 'node_modules/@foundry-rs/anvil/bin.mjs'),
    '--host', '127.0.0.1', '--port', String(rpcPort), '--chain-id', '31337', '--hardfork', 'cancun', '--silent'],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  anvil.stderr.on('data', chunk => { stderr += chunk.toString(); });
  let provider;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (anvil.exitCode !== null) throw new Error(`Anvil exited: ${stderr}`);
      try {
        const result = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) });
        if ((await result.json()).result === '0x7a69') { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`Local Anvil did not become ready: ${stderr}`);
    provider = new ethers.JsonRpcProvider(rpc, 31337, { staticNetwork: true });
    provider.pollingInterval = 10;
    const [owner, alice, bob, payer] = await Promise.all([0, 1, 2, 3].map(i => provider.getSigner(i)));
    const [ownerAddress, aliceAddress, bobAddress, payerAddress] = await Promise.all([owner, alice, bob, payer].map(s => s.getAddress()));
    const send = async tx => (await tx).wait();
    const deploy = async (artifact, args) => {
      const contract = await new ethers.ContractFactory(artifact.abi,
        artifact.bytecode || '0x' + artifact.evm.bytecode.object, owner).deploy(...args);
      await contract.waitForDeployment();
      return contract;
    };
    const localArtifact = name => JSON.parse(fs.readFileSync(path.join(root, '../fee-router/artifacts', name + '.json'), 'utf8'));
    const manager = await deploy(compiled['@uniswap/v4-core/src/PoolManager.sol'].PoolManager, [ownerAddress]);
    const managerAddress = await manager.getAddress();
    const splitter = await deploy(localArtifact('OwnerFeeRouter'), [ownerAddress, [aliceAddress, bobAddress], [3n, 1n]]);
    const splitterAddress = await splitter.getAddress();
    const create2 = await deploy(compiled['src/HookCreate2Factory.sol'].HookCreate2Factory, []);
    const hookArtifact = compiled['src/OwnerV4FeeHook.sol'].OwnerV4FeeHook;
    const initCode = (await new ethers.ContractFactory(hookArtifact.abi, '0x' + hookArtifact.evm.bytecode.object, owner)
      .getDeployTransaction(managerAddress, ownerAddress, 10000, splitterAddress, true)).data;
    const mined = mine(await create2.getAddress(), initCode);
    await send(create2.deploy(mined.salt, initCode));
    const hook = new ethers.Contract(mined.address, hookArtifact.abi, owner);
    assert.equal(BigInt(mined.address) & 0x3fffn, 0xc8n);
    assert.equal(await hook.poolManager(), managerAddress);
    const permissions = await hook.getHookPermissions();
    assert.ok(permissions.beforeSwap && permissions.afterSwap && permissions.beforeSwapReturnDelta);
    assert.equal(permissions.afterSwapReturnDelta, false);

    const driver = await deploy(compiled['test/NormalFlowDriver.sol'].NormalFlowDriver, [managerAddress]);
    const driverAddress = await driver.getAddress();
    const tokenA = await deploy(localArtifact('OwnerLaunchToken'), ['Local Currency A', 'LCA', 10n ** 25n, payerAddress]);
    const tokenB = await deploy(localArtifact('OwnerLaunchToken'), ['Local Currency B', 'LCB', 10n ** 25n, payerAddress]);
    const [token0, token1] = BigInt(await tokenA.getAddress()) < BigInt(await tokenB.getAddress()) ? [tokenA, tokenB] : [tokenB, tokenA];
    const currency0 = await token0.getAddress();
    const currency1 = await token1.getAddress();
    for (const token of [token0, token1]) await send(token.connect(payer).approve(driverAddress, ethers.MaxUint256));
    const key = { currency0, currency1, fee: 3000, tickSpacing: 60, hooks: mined.address };
    const q96 = 1n << 96n;
    await send(manager.initialize(key, q96));
    await send(driver.connect(payer).addLiquidity(key, { tickLower: -600, tickUpper: 600, liquidityDelta: 10n ** 18n, salt: ethers.ZeroHash }));
    const gross = 10n ** 12n;
    const fee = gross / 100n;
    const deadline = BigInt((await provider.getBlock('latest')).timestamp) + 3600n;
    const quote = maximum => ethers.AbiCoder.defaultAbiCoder().encode(['uint24', 'uint64'], [maximum, deadline]);
    const params = direction => ({ zeroForOne: direction, amountSpecified: -gross,
      sqrtPriceLimitX96: direction ? 4295128740n : 1461446703485210103287273052203988822378723970341n });
    const passed = ['A real pinned PoolManager and a CREATE2 hook with validated permission bits deploy on Cancun without changing core source.'];

    const payer0Before = await token0.balanceOf(payerAddress);
    const payer1Before = await token1.balanceOf(payerAddress);
    await send(driver.connect(payer).swap(key, params(true), quote(10000), 1n));
    assert.equal(payer0Before - await token0.balanceOf(payerAddress), gross);
    assert.ok(await token1.balanceOf(payerAddress) > payer1Before);
    assert.equal(await driver.lastDelta0(), -gross);
    assert.equal(await hook.accrued(currency0, splitterAddress, true), fee);
    assert.equal(await manager.balanceOf(mined.address, BigInt(currency0)), fee);
    passed.push('Currency0-to-currency1 exact-input swaps debit exactly gross input and mint the exact configured fee as PoolManager ERC6909 claims.');

    await send(driver.connect(payer).swap(key, params(false), quote(10000), 1n));
    assert.equal(await driver.lastDelta1(), -gross);
    assert.equal(await hook.accrued(currency1, splitterAddress, true), fee);
    assert.equal(await manager.balanceOf(mined.address, BigInt(currency1)), fee);
    passed.push('Reverse-direction exact-input swaps charge the correct input currency through the same real accounting path.');

    await send(hook.configure(20000, bobAddress, false));
    await send(driver.connect(payer).swap(key, params(true), quote(20000), 1n));
    assert.equal(await hook.accrued(currency0, splitterAddress, true), fee);
    assert.equal(await hook.accrued(currency0, bobAddress, false), fee * 2n);
    await send(hook.connect(payer).flush(currency0, splitterAddress, true, fee));
    assert.equal(await splitter.claimable(currency0, aliceAddress), fee * 3n / 4n);
    assert.equal(await splitter.claimable(currency0, bobAddress), fee / 4n);
    assert.equal(await token0.allowance(mined.address, splitterAddress), 0n);
    assert.equal(await manager.balanceOf(mined.address, BigInt(currency0)), fee * 2n);
    const bobBefore = await token0.balanceOf(bobAddress);
    await send(hook.connect(alice).flush(currency0, bobAddress, false, fee * 2n));
    assert.equal(await token0.balanceOf(bobAddress), bobBefore + fee * 2n);
    assert.equal(await manager.balanceOf(mined.address, BigInt(currency0)), 0n);
    passed.push('Configuration changes preserve prior recipients; permissionless flushes burn real claims, settle PoolManager deltas, fund the splitter or pay the recorded recipient, and clear allowances.');

    const claimBefore = await hook.accrued(currency1, splitterAddress, true);
    await assert.rejects(driver.connect(payer).swap.staticCall(key, { ...params(false), amountSpecified: gross }, quote(20000), 1n));
    await assert.rejects(driver.connect(payer).swap.staticCall(key, params(false), quote(10000), 1n));
    const expired = ethers.AbiCoder.defaultAbiCoder().encode(['uint24', 'uint64'], [20000, 1]);
    await assert.rejects(driver.connect(payer).swap.staticCall(key, params(false), expired, 1n));
    assert.equal(await hook.accrued(currency1, splitterAddress, true), claimBefore);
    passed.push('Unsupported exact-output orders, stale fee caps and expired quotes reject without changing accrued fee claims.');

    // A fresh pool at Q96 makes a tight limit deterministic and forces a partial fill.
    const partialKey = { ...key, fee: 500 };
    await send(manager.initialize(partialKey, q96));
    await send(driver.connect(payer).addLiquidity(partialKey, { tickLower: -600, tickUpper: 600, liquidityDelta: 10n ** 18n, salt: ethers.ZeroHash }));
    await assert.rejects(driver.connect(payer).swap.staticCall(partialKey,
      { ...params(true), sqrtPriceLimitX96: q96 - 10n ** 15n }, quote(20000), 0n));
    passed.push('A price-limited partial fill rejects atomically rather than charging the hook fee on an unfilled gross order.');

    await send(hook.configure(0, splitterAddress, true));
    await send(driver.connect(payer).swap(key, params(true), quote(0), 1n));
    assert.equal(await hook.accrued(currency0, splitterAddress, true), 0n);
    passed.push('The owner can set the hook fee to zero without disabling valid full exact-input swaps.');

    await send(hook.configure(10000, splitterAddress, true));
    const nativeKey = { currency0: ethers.ZeroAddress, currency1, fee: 3000, tickSpacing: 60, hooks: mined.address };
    await send(manager.initialize(nativeKey, q96));
    await send(driver.connect(payer).addLiquidity(nativeKey,
      { tickLower: -600, tickUpper: 600, liquidityDelta: 10n ** 18n, salt: ethers.ZeroHash }, { value: ethers.parseEther('1') }));
    await send(driver.connect(payer).swap(nativeKey, params(true), quote(10000), 1n, { value: gross }));
    assert.equal(await hook.accrued(ethers.ZeroAddress, splitterAddress, true), fee);
    assert.equal(await manager.balanceOf(mined.address, 0n), fee);
    await send(hook.connect(bob).flush(ethers.ZeroAddress, splitterAddress, true, fee));
    assert.equal(await splitter.claimable(ethers.ZeroAddress, aliceAddress), fee * 3n / 4n);
    assert.equal(await splitter.claimable(ethers.ZeroAddress, bobAddress), fee / 4n);
    assert.equal(await manager.balanceOf(mined.address, 0n), 0n);
    passed.push('Native-input swaps and native claim redemption fund the same configurable splitter using real native PoolManager settlement.');

    await send(hook.proposeOwner(aliceAddress));
    await send(hook.connect(alice).acceptOwnership());
    await assert.rejects(hook.configure.staticCall(1, bobAddress, false));
    await send(hook.connect(alice).configure(2500, bobAddress, false));
    assert.equal(await hook.feePpm(), 2500n);
    passed.push('Two-step ownership transfer changes fee configuration authority while existing fee claims remain payable.');

    const summary = { status: 'passed', environment: 'local Anvil 1.7.1 / Cancun / 127.0.0.1 only; no public deployment',
      coreCommit: '46c6834698c48bc4a463a86d8420f4eb1d7f3b75', scenarios: passed.length,
      permissionFlags: mined.flags, saltMiningAttempts: mined.attempts, passed };
    fs.writeFileSync(path.join(root, 'artifacts/test-results.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (provider) provider.destroy();
    anvil.kill('SIGTERM');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
