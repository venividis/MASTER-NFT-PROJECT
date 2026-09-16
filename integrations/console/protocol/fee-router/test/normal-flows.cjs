const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dependency = require('../scripts/dependency.cjs');
const ganache = dependency('ganache');
const { ethers } = dependency('ethers');
const { compile } = require('../scripts/compile.cjs');

async function main() {
  const compiled = compile(true);
  const local = ganache.provider({ logging: { quiet: true }, chain: { hardfork: 'shanghai' }, wallet: { totalAccounts: 6 } });
  const provider = new ethers.BrowserProvider(local);
  provider.pollingInterval = 10;
  const signers = await Promise.all([0, 1, 2, 3, 4, 5].map(index => provider.getSigner(index)));
  const [owner, alice, bob, carol, payer, destination] = signers;
  const [ownerAddress, aliceAddress, bobAddress, carolAddress, payerAddress, destinationAddress] = await Promise.all(signers.map(signer => signer.getAddress()));
  const passed = [];
  const zero = ethers.ZeroAddress;
  const send = async transaction => (await transaction).wait();
  const balance = async address => BigInt(await provider.send('eth_getBalance', [address, 'latest']));
  const deploy = async (source, name, args = [], signer = owner) => {
    const artifact = compiled[source][name];
    const contract = await new ethers.ContractFactory(artifact.abi, '0x' + artifact.evm.bytecode.object, signer).deploy(...args);
    await contract.waitForDeployment();
    return contract;
  };
  const router = await deploy('src/OwnerFeeRouter.sol', 'OwnerFeeRouter', [ownerAddress, [aliceAddress, bobAddress], [60, 40]]);
  const routerAddress = await router.getAddress();
  const tokenA = await deploy('src/OwnerLaunchFactory.sol', 'OwnerLaunchToken', ['Payment Asset', 'PAY', 1_000_000n, payerAddress]);
  const tokenB = await deploy('src/OwnerLaunchFactory.sol', 'OwnerLaunchToken', ['Output Asset', 'OUT', 1_000_000n, payerAddress]);
  const addressA = await tokenA.getAddress();
  const addressB = await tokenB.getAddress();

  await send(router.connect(payer).depositNative({ value: 1000n }));
  assert.equal(await router.claimable(zero, aliceAddress), 600n);
  assert.equal(await router.claimable(zero, bobAddress), 400n);
  await send(router.configureSplit([carolAddress], [1]));
  await send(payer.sendTransaction({ to: routerAddress, value: 200n }));
  assert.equal(await router.claimable(zero, aliceAddress), 600n);
  assert.equal(await router.claimable(zero, bobAddress), 400n);
  assert.equal(await router.claimable(zero, carolAddress), 200n);
  const destinationBefore = await balance(destinationAddress);
  await send(router.connect(alice).claim(zero, 600n, destinationAddress));
  assert.equal(await balance(destinationAddress), destinationBefore + 600n);
  assert.equal(await router.totalClaimable(zero), 600n);
  passed.push('Native deposits and direct sends allocate immediately; split changes preserve old claims; partial treasury accounting remains backed.');

  await send(router.connect(payer).claimFor(zero, bobAddress));
  assert.equal(await router.claimable(zero, bobAddress), 0n);
  assert.equal(await router.totalClaimable(zero), 200n);
  passed.push('A third-party caller can execute a payout only to the beneficiary’s own address.');

  await send(router.configureSplit([aliceAddress, bobAddress], [1, 2]));
  await send(tokenA.connect(payer).approve(routerAddress, 101n));
  await send(router.connect(payer).depositToken(addressA, 101n));
  assert.equal(await router.claimable(addressA, aliceAddress), 33n);
  assert.equal(await router.claimable(addressA, bobAddress), 68n);
  assert.equal(await router.totalClaimable(addressA), 101n);
  await send(router.connect(alice).claim(addressA, 10n, carolAddress));
  assert.equal(await tokenA.balanceOf(carolAddress), 10n);
  assert.equal(await router.claimable(addressA, aliceAddress), 23n);
  passed.push('Standard ERC20 accounting conserves deposits including deterministic rounding; recipients may claim partially to a chosen destination.');

  const converter = await deploy('test/NormalFlowConverter.sol', 'NormalFlowConverter');
  const converterAddress = await converter.getAddress();
  await send(router.setConverter(converterAddress, true));
  await send(tokenB.connect(payer).transfer(converterAddress, 10000n));
  await send(payer.sendTransaction({ to: converterAddress, value: 10000n }));
  const route = ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256'], [2n, 1n]);
  const deadline = BigInt((await provider.getBlock('latest')).timestamp) + 3600n;
  const request = (tokenIn, amountIn, tokenOut, minAmountOut = amountIn * 2n) => ({ tokenIn, amountIn, tokenOut, converter: converterAddress, minAmountOut, deadline, route });
  await send(router.connect(bob).claimConverted(request(addressA, 20n, addressB), bobAddress));
  assert.equal(await tokenB.balanceOf(bobAddress), 40n);
  assert.equal(await tokenA.allowance(routerAddress, converterAddress), 0n);
  assert.equal(await router.claimable(addressA, bobAddress), 48n);
  assert.equal(await router.totalClaimable(addressA), 71n);
  passed.push('Recipient-chosen ERC20 conversion measures output, debits only that recipient and resets the exact-input allowance.');

  const carolBefore = await balance(carolAddress);
  await send(router.connect(bob).claimConverted(request(addressA, 5n, zero), carolAddress));
  assert.equal(await balance(carolAddress), carolBefore + 10n);
  assert.equal(await router.totalClaimable(zero), 200n);
  assert.equal(await router.claimable(zero, aliceAddress), 0n);
  await send(router.connect(carol).claimConverted(request(zero, 20n, addressB), carolAddress));
  assert.equal(await tokenB.balanceOf(carolAddress), 40n);
  assert.equal(await router.claimable(zero, carolAddress), 180n);
  passed.push('ERC20-to-native and native-to-ERC20 conversion preserve unrelated native claims and avoid double-crediting converter output.');

  await send(router.connect(alice).claimConverted({ ...request(addressA, 3n, addressA, 3n), converter: zero }, aliceAddress));
  assert.equal(await tokenA.balanceOf(aliceAddress), 3n);
  await send(router.connect(payer).depositConverted(request(zero, 9n, addressB), { value: 9n }));
  assert.equal(await router.claimable(addressB, aliceAddress), 6n);
  assert.equal(await router.claimable(addressB, bobAddress), 12n);
  passed.push('Same-token settlement needs no converter; new payments can be converted first and split into output-token claims.');

  const beforeRejected = await router.claimable(addressA, bobAddress);
  await assert.rejects(router.connect(bob).claimConverted.staticCall({ ...request(addressA, 2n, addressB), deadline: 1n }, bobAddress));
  await assert.rejects(router.connect(bob).claimConverted.staticCall({ ...request(addressA, 2n, addressB), minAmountOut: 5n }, bobAddress));
  assert.equal(await router.claimable(addressA, bobAddress), beforeRejected);
  passed.push('Expired quotes and unmet output minimums reject without changing earned claims.');

  await send(router.setConverter(converterAddress, false));
  await send(router.connect(alice).claim(addressA, 1n, aliceAddress));
  await send(tokenA.connect(payer).transfer(routerAddress, 3n));
  await send(router.connect(payer).allocateSurplus(addressA));
  assert.equal(await tokenA.balanceOf(routerAddress), await router.totalClaimable(addressA));
  passed.push('Plain withdrawals remain available after converter removal; explicitly allocated direct-transfer surplus remains fully backed.');

  await send(router.proposeOwner(carolAddress));
  await send(router.connect(carol).acceptOwnership());
  assert.equal(await router.owner(), carolAddress);
  await assert.rejects(router.configureSplit.staticCall([ownerAddress], [1]));
  await send(router.connect(carol).configureSplit([carolAddress], [1]));
  passed.push('Two-step ownership handover changes future configuration authority without changing old allocations.');

  const factory = await deploy('src/OwnerLaunchFactory.sol', 'OwnerLaunchFactory');
  const configuration = { selectedHook: zero, poolConfigurationHash: ethers.id('owner-authored pool configuration'), metadataHash: ethers.id('owner-authored launch manifest') };
  const launchReceipt = await send(factory.connect(alice).launch('Indie World', 'INDIE', 500_000n, bobAddress, configuration));
  const launched = launchReceipt.logs.map(log => { try { return factory.interface.parseLog(log); } catch { return null; } }).find(log => log?.name === 'TokenLaunched');
  assert.ok(launched);
  const launchAddress = launched.args.token;
  const launchToken = new ethers.Contract(launchAddress, compiled['src/OwnerLaunchFactory.sol'].OwnerLaunchToken.abi, provider);
  assert.equal(await launchToken.name(), 'Indie World');
  assert.equal(await launchToken.totalSupply(), 500_000n);
  assert.equal(await launchToken.balanceOf(bobAddress), 500_000n);
  assert.equal(await factory.creatorOf(launchAddress), aliceAddress);
  assert.equal((await factory.configurationOf(launchAddress)).metadataHash, configuration.metadataHash);
  const updated = { ...configuration, selectedHook: converterAddress, metadataHash: ethers.id('updated owner manifest') };
  await send(factory.connect(alice).recordConfiguration(launchAddress, updated));
  assert.equal((await factory.configurationOf(launchAddress)).selectedHook, converterAddress);
  await assert.rejects(factory.connect(bob).recordConfiguration.staticCall(launchAddress, configuration));
  await send(launchToken.connect(bob).transfer(carolAddress, 123n));
  assert.equal(await launchToken.balanceOf(carolAddress), 123n);
  passed.push('Permissionless launches create fixed-supply ERC20s at the chosen recipient; only the creator updates descriptive hook/pool commitments.');

  for (const token of [zero, addressA, addressB]) {
    const held = token === zero ? await balance(routerAddress) : await new ethers.Contract(token, tokenA.interface, provider).balanceOf(routerAddress);
    assert.equal(held, await router.totalClaimable(token));
  }
  passed.push('Final native and both ERC20 balances exactly reconcile with outstanding claims across the complete normal-flow sequence.');
  const summary = { status: 'passed', environment: 'in-process Ganache; no external RPC or broadcast', scenarios: passed.length, passed };
  fs.writeFileSync(path.resolve(__dirname, '../artifacts/test-results.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
  await local.disconnect();
}

main().catch(error => { console.error(error); process.exitCode = 1; });
