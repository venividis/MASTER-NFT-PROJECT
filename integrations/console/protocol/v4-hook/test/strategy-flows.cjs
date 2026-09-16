const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");
const { ethers } = require("../scripts/dependency.cjs")("ethers");
const { compileFixtures } = require("../scripts/compile.cjs");
const root = path.resolve(__dirname, ".."),
  project = path.resolve(root, "../../../..");
const solc = require(path.join(project, "node_modules/solc"));
async function main() {
  const compiled = compileFixtures(),
    source = "contracts/src/extensions/strategies/V4Strategies.sol";
  execFileSync(process.execPath, [path.join(project, "scripts/build-v4.mjs")]);
  const sources = {
    [source]: { content: fs.readFileSync(path.join(project, source), "utf8") },
  };
  const feeSource = "contracts/src/confluence/fees/OwnerFeeRouter.sol",
    ifaceSource =
      "contracts/src/confluence/fees/interfaces/ISettlementConverter.sol";
  for (const s of [feeSource, ifaceSource])
    sources[s] = { content: fs.readFileSync(path.join(project, s), "utf8") };
  const strategy = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources,
        settings: {
          optimizer: { enabled: true, runs: 1000 },
          viaIR: true,
          evmVersion: "cancun",
          outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
        },
      }),
    ),
  );
  assert.equal(
    (strategy.errors || []).filter((x) => x.severity === "error").length,
    0,
    JSON.stringify(strategy.errors),
  );
  const port = 23958,
    rpc = `http://127.0.0.1:${port}`,
    anvil = spawn(
      process.execPath,
      [
        path.join(root, "node_modules/@foundry-rs/anvil/bin.mjs"),
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--chain-id",
        "31337",
        "--hardfork",
        "cancun",
        "--silent",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  let errors = "",
    provider;
  anvil.stderr.on("data", (b) => (errors += b));
  try {
    for (let i = 0; i < 100; i++) {
      if (anvil.exitCode !== null) throw Error(errors);
      try {
        await fetch(rpc, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_chainId",
            params: [],
          }),
        });
        break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    provider = new ethers.JsonRpcProvider(rpc, 31337, {
      staticNetwork: true,
      cacheTimeout: -1,
    });
    provider.pollingInterval = 10;
    const [alice, bob] = await Promise.all(
        [0, 1].map((i) => provider.getSigner(i)),
      ),
      a = await alice.getAddress(),
      b = await bob.getAddress();
    const deploy = async (art, args = []) => {
      const c = await new ethers.ContractFactory(
        art.abi,
        "0x" + art.evm.bytecode.object,
        alice,
      ).deploy(...args);
      await c.waitForDeployment();
      return c;
    };
    const send = async (p) => (await p).wait(),
      src = "src/GenesisV4Launchpad.sol";
    const manager = await deploy(
      compiled["@uniswap/v4-core/src/PoolManager.sol"].PoolManager,
      [a],
    );
    const factory = await deploy(compiled[src].GenesisV4Launchpad, [
      manager.target,
    ]);
    const router = await deploy(
      compiled["src/GenesisV4Router.sol"].GenesisV4Router,
      [manager.target],
    );
    const quote = await deploy(compiled[src].GenesisFixedToken, [
      "Quote",
      "Q",
      10n ** 26n,
    ]);
    const now = (await provider.getBlock("latest")).timestamp,
      t = {
        name: "Strategy test",
        symbol: "ST",
        supply: 10n ** 24n,
        quoteToken: quote.target,
        tokenBudget: 10n ** 22n,
        quoteBudget: 10n ** 22n,
        fee: 3000,
        tickSpacing: 60,
        tickLower: -600,
        tickUpper: 600,
        sqrtPriceX96: 1n << 96n,
        liquidity: 10n ** 23n,
        deadline: now + 20000,
        salt: ethers.id("strategies"),
      };
    const [tokenAddress, positionAddress] = await factory.predict(t, a);
    await send(quote.approve(factory.target, t.quoteBudget));
    const quoteBeforeLaunch = await quote.balanceOf(a);
    await send(factory.launch(t));
    const position = new ethers.Contract(
        positionAddress,
        compiled[src].GenesisV4Position.abi,
        alice,
      ),
      key = await position.poolKey(),
      k = {
        currency0: key.currency0,
        currency1: key.currency1,
        fee: key.fee,
        tickSpacing: key.tickSpacing,
        hooks: key.hooks,
      };
    const c0 = new ethers.Contract(
        k.currency0,
        compiled[src].GenesisFixedToken.abi,
        alice,
      ),
      c1 = new ethers.Contract(
        k.currency1,
        compiled[src].GenesisFixedToken.abi,
        alice,
      );
    const economics = await import(
        path.join(project, "web/launchpad/economics-engine.mjs")
      ),
      models = await import(path.join(project, "web/launchpad/model.mjs")),
      math = await import(path.join(project, "web/v4/math.mjs"));
    const draft = {
        ...models.defaults(),
        name: t.name,
        symbol: t.symbol,
        supply: "1000000",
        tokenBudget: "10000",
        quoteBudget: "10000",
        price: "1",
        feePercent: "0.30",
      },
      is0 = tokenAddress.toLowerCase() === k.currency0.toLowerCase(),
      minted = new ethers.Contract(
        tokenAddress,
        compiled[src].GenesisFixedToken.abi,
        alice,
      );
    const usedToken = t.supply - (await minted.balanceOf(a)),
      usedQuote = quoteBeforeLaunch - (await quote.balanceOf(a));
    const opening = {
      ...models.poolModel(draft, is0),
      l: t.liquidity,
      p: t.sqrtPriceX96,
      a: math.sqrtAtTick(t.tickLower),
      b: math.sqrtAtTick(t.tickUpper),
      tick: 0,
      ticks: { lower: t.tickLower, upper: t.tickUpper, spacing: t.tickSpacing },
      usedToken,
      usedQuote,
      retained: t.supply - usedToken,
      quoteRefund: t.quoteBudget - usedQuote,
    };
    const economicState = economics.initialEconomics(draft, { model: opening });
    let trackEconomics = true;
    const lo = 4295128740n,
      hi = 1461446703485210103287273052203988822378723970341n,
      amount = 10n ** 19n;
    await send(position.transfer(b, t.liquidity / 2n));
    economics.applyEconomics(
      economicState,
      `shares creator bob ${t.liquidity / 2n}`,
    );
    await send(c0.approve(router.target, 10n ** 22n));
    await send(c1.approve(router.target, 10n ** 22n));
    const swap = async (direction) => {
      const outputToken = direction ? c1 : c0,
        before = await outputToken.balanceOf(a);
      const receipt = await send(
        router.swap(
          k,
          direction,
          amount,
          1,
          direction ? lo : hi,
          t.deadline,
          "0x",
        ),
      );
      if (trackEconomics) {
        const op = direction === is0 ? "sell" : "buy",
          effect = economics.applyEconomics(
            economicState,
            `${op} creator ${ethers.formatUnits(amount, 18)}`,
          ).trade;
        assert.equal(
          (await outputToken.balanceOf(a)) - before,
          effect.out,
          "Integer model output must equal genuine PoolManager output",
        );
      }
      return receipt;
    };
    await swap(true);
    await swap(false);
    const held = await position.balanceOf(a),
      liq = await position.liquidity(),
      supply = await position.totalSupply();
    const bFees = await position.pendingFees(b),
      aFees = await position.pendingFees(a);
    assert.ok(aFees[0] > 0n && aFees[1] > 0n);
    const before0 = await c0.balanceOf(a),
      before1 = await c1.balanceOf(a);
    await send(position.collectFees(aFees[0], aFees[1], t.deadline));
    const modelCollected = economics.applyEconomics(
      economicState,
      "collect creator",
    ).collected;
    assert.equal(is0 ? modelCollected.token : modelCollected.quote, aFees[0]);
    assert.equal(is0 ? modelCollected.quote : modelCollected.token, aFees[1]);
    assert.equal((await c0.balanceOf(a)) - before0, aFees[0]);
    assert.equal((await c1.balanceOf(a)) - before1, aFees[1]);
    assert.equal(await position.liquidity(), liq);
    assert.equal(await position.totalSupply(), supply);
    assert.equal(await position.balanceOf(a), held);
    await assert.rejects(position.collectFees.staticCall(1, 1, t.deadline));
    const stillB = await position.pendingFees(b);
    assert.equal(stillB[0], bFees[0]);
    assert.equal(stillB[1], bFees[1]);
    await swap(true);
    await swap(false);
    const reinvest = 10n ** 15n;
    const fees = await position.pendingFees(a),
      newShares = await position.reinvestFees.staticCall(
        reinvest,
        fees[0],
        fees[1],
        reinvest,
        t.deadline,
      );
    await send(
      position.reinvestFees(reinvest, fees[0], fees[1], newShares, t.deadline),
    );
    const modelReinvested = economics.applyEconomics(
      economicState,
      `reinvest creator ${reinvest}`,
    ).reinvested;
    assert.equal(modelReinvested.shares, newShares);
    assert.equal(economicState.model.l, await position.liquidity());
    assert.equal(await position.liquidity(), liq + reinvest);
    assert.equal(await position.totalSupply(), supply + newShares);
    assert.equal(await position.balanceOf(b), held);
    await assert.rejects(
      position.reinvestFees.staticCall(10n ** 20n, 1, 1, 1, t.deadline),
    );
    const transferFees = await position.pendingFees(b);
    await send(position.connect(bob).transfer(a, held));
    economics.applyEconomics(economicState, `shares bob creator ${held}`);
    assert.equal(economics.economicsConservation(economicState).balanced, true);
    trackEconomics = false;
    const afterTransfer = await position.pendingFees(b);
    assert.ok(afterTransfer[0] <= 1n && afterTransfer[1] <= 1n);
    assert.ok((await position.pendingFees(a))[0] >= transferFees[0]);
    // Partial transfer and partial redemption preserve the other holder's dividend claim.
    const partial = (await position.balanceOf(a)) / 3n;
    await send(position.transfer(b, partial));
    const feeBeforePartial = await position.pendingFees(b),
      aliceFeesBefore = await position.pendingFees(a);
    const redeemPart = partial / 2n,
      previewPartial = await position.connect(bob).previewRedeem(redeemPart);
    const bobBefore0 = await c0.balanceOf(b),
      bobBefore1 = await c1.balanceOf(b);
    await send(
      position
        .connect(bob)
        .redeem(redeemPart, previewPartial[0], previewPartial[1], t.deadline),
    );
    assert.equal((await c0.balanceOf(b)) - bobBefore0, previewPartial[0]);
    assert.equal((await c1.balanceOf(b)) - bobBefore1, previewPartial[1]);
    const aliceAfterPartial = await position.pendingFees(a);
    assert.deepEqual([...aliceAfterPartial], [...aliceFeesBefore]);
    const bobRemainingFees = await position.pendingFees(b);
    assert.ok(
      bobRemainingFees[0] <= feeBeforePartial[0] &&
        bobRemainingFees[1] <= feeBeforePartial[1],
    );
    const converter = await deploy(
      strategy.contracts[source].V4SettlementConverter,
      [router.target],
    );
    const route = ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)",
        "bool",
        "uint160",
        "bytes",
      ],
      [k, true, lo, "0x"],
    );
    const splitter = await deploy(
      strategy.contracts[feeSource].OwnerFeeRouter,
      [a, [a, b], [1, 1]],
    );
    await send(splitter.commitSplit());
    assert.equal(await splitter.splitCommitted(), true);
    await assert.rejects(splitter.configureSplit.staticCall([a], [1]));
    await assert.rejects(splitter.commitSplit.staticCall());
    const expectedSplitHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256[]"],
        [
          [a, b],
          [1, 1],
        ],
      ),
    );
    assert.equal(await splitter.committedSplitHash(), expectedSplitHash);
    await send(splitter.setConverter(converter.target, true));
    await send(c0.approve(splitter.target, amount));
    await send(splitter.depositToken(c0.target, amount));
    const claim = await splitter.claimable(c0.target, a),
      outBefore = await c1.balanceOf(a),
      req = {
        tokenIn: c0.target,
        amountIn: claim,
        tokenOut: c1.target,
        converter: converter.target,
        minAmountOut: 1,
        deadline: t.deadline,
        route,
      };
    await send(splitter.claimConverted(req, a));
    assert.ok((await c1.balanceOf(a)) > outBefore);
    assert.equal(await splitter.claimable(c0.target, a), 0n);
    assert.equal(await splitter.claimable(c0.target, b), amount - claim);
    assert.equal(await c0.allowance(splitter.target, converter.target), 0n);
    assert.equal(await c0.allowance(converter.target, router.target), 0n);
    await send(c0.approve(converter.target, amount));
    await assert.rejects(
      converter.convert.staticCall(
        c0.target,
        c1.target,
        amount,
        10n ** 25n,
        t.deadline,
        route,
      ),
    );
    assert.equal(await c0.balanceOf(converter.target), 0n);
    const exit = await deploy(strategy.contracts[source].V4ScheduledExit, [
      converter.target,
    ]);
    await send(c0.approve(exit.target, amount));
    const begins = (await provider.getBlock("latest")).timestamp + 100;
    const terms = {
      tokenIn: c0.target,
      tokenOut: c1.target,
      beneficiary: b,
      totalInput: amount,
      minimumTotalOutput: (amount * 9n) / 10n,
      start: begins,
      interval: 60,
      expires: begins + 1000,
      slices: 3,
      rewardPerSlice: 1000,
      route,
    };
    await send(exit.create(terms, { value: 3000 }));
    await assert.rejects(exit.execute.staticCall(1));
    await provider.send("evm_setNextBlockTimestamp", [begins]);
    await provider.send("evm_mine", []);
    const beneficiaryBefore = await c1.balanceOf(b);
    await send(exit.connect(bob).execute(1));
    assert.ok((await c1.balanceOf(b)) > beneficiaryBefore);
    assert.equal(await exit.rewardCredit(b), 1000n);
    const p = await exit.plan(1);
    assert.equal(p.executed, 1n);
    assert.equal(p.remaining, amount - amount / 3n);
    assert.equal(await c0.allowance(exit.target, converter.target), 0n);
    await send(exit.configure(1, 10n ** 25n, false));
    await provider.send("evm_setNextBlockTimestamp", [begins + 60]);
    await provider.send("evm_mine", []);
    await assert.rejects(exit.execute.staticCall(1));
    assert.equal((await exit.plan(1)).remaining, p.remaining);
    await assert.rejects(exit.connect(bob).cancel.staticCall(1));
    const refundBefore = await c0.balanceOf(a);
    await send(exit.cancel(1));
    assert.equal((await c0.balanceOf(a)) - refundBefore, p.remaining);
    assert.equal(await exit.rewardCredit(a), 2000n);
    await send(exit.connect(bob).withdrawReward(b));
    await send(exit.withdrawReward(a));
    assert.equal(await provider.getBalance(exit.target), 0n);
    // Mine the actual required hook flags and test immutable policies across ownership changes.
    const create2 = await deploy(
        compiled["src/HookCreate2Factory.sol"].HookCreate2Factory,
      ),
      hookArtifact = compiled["src/OwnerV4FeeHook.sol"].OwnerV4FeeHook;
    const init = (
      await new ethers.ContractFactory(
        hookArtifact.abi,
        "0x" + hookArtifact.evm.bytecode.object,
      ).getDeployTransaction(manager.target, a, 10000, a, false)
    ).data;
    const initHash = ethers.keccak256(init);
    let salt, hookAddress;
    for (let i = 0; i < 1000000; i++) {
      const candidate = ethers.zeroPadValue(ethers.toBeHex(i), 32),
        address = ethers.getCreate2Address(create2.target, candidate, initHash);
      if ((BigInt(address) & 0x3fffn) === 0xc8n) {
        salt = candidate;
        hookAddress = address;
        break;
      }
    }
    assert.ok(hookAddress);
    await send(create2.deploy(salt, init));
    const hook = new ethers.Contract(hookAddress, hookArtifact.abi, alice);
    await send(hook.commitPolicy(20000, a, false, false));
    await send(hook.configure(15000, a, false));
    await assert.rejects(hook.configure.staticCall(20001, a, false));
    await assert.rejects(hook.configure.staticCall(10000, b, false));
    await assert.rejects(hook.commitPolicy.staticCall(20000, a, false, false));
    await send(hook.proposeOwner(b));
    await send(hook.connect(bob).acceptOwnership());
    await assert.rejects(
      hook.connect(bob).configure.staticCall(10000, b, false),
    );
    const compounder = await deploy(
      strategy.contracts[source].V4FeeCompounder,
      [position.target, a],
    );
    const compoundedShares = (await position.balanceOf(a)) / 2n;
    await send(position.approve(compounder.target, compoundedShares));
    await send(compounder.fundShares(compoundedShares));
    await swap(true);
    await swap(false);
    const compoundPolicy = {
      maximumFee0: 10n ** 20n,
      maximumFee1: 10n ** 20n,
      minimumLiquidity: 1,
      interval: 1,
      expires: t.deadline,
      reward: 1000,
      enabled: true,
    };
    await send(compounder.configure(compoundPolicy));
    await send(compounder.fundRewards({ value: 2000 }));
    const nextCompound = await compounder.nextCompound();
    assert.equal(nextCompound[2], true);
    assert.ok(nextCompound[0] > 0n);
    const initialVaultShares = await position.balanceOf(compounder.target),
      initialLiquidity = await position.liquidity();
    await send(compounder.connect(bob).execute());
    assert.ok(
      (await position.balanceOf(compounder.target)) > initialVaultShares,
    );
    assert.ok((await position.liquidity()) > initialLiquidity);
    assert.equal(await compounder.rewardCredit(b), 1000n);
    await assert.rejects(compounder.connect(bob).withdrawShares.staticCall(1));
    await send(compounder.configure({ ...compoundPolicy, enabled: false }));
    await assert.rejects(compounder.execute.staticCall());
    await send(
      compounder.withdrawShares(await position.balanceOf(compounder.target)),
    );
    assert.equal(await position.balanceOf(compounder.target), 0n);
    await send(compounder.refundRewards(1000));
    await send(compounder.withdrawReward(a));
    await send(compounder.connect(bob).withdrawReward(b));
    assert.equal(await provider.getBalance(compounder.target), 0n);
    // Exercise actual browser planners and the shared review/receipt lifecycle with real bytecode.
    const [{ LaunchChain }, { StrategiesClient }] = await Promise.all([
      import(path.join(project, "web/launchpad/chain.mjs")),
      import(path.join(project, "web/launchpad/strategies-client.mjs")),
    ]);
    const rawWallet = {
      request: ({ method, params = [] }) =>
        provider.send(
          method === "eth_requestAccounts" ? "eth_accounts" : method,
          params,
        ),
      on() {},
      removeListener() {},
    };
    const chain = new LaunchChain({
      storage: null,
      receiptTimeout: 5000,
      pollInterval: 10,
      deployments: {
        31337: {
          manager: manager.target,
          factory: factory.target,
          router: router.target,
        },
      },
    });
    await chain.connect(rawWallet);
    const browserClient = new StrategiesClient(chain);
    const executeBrowser = async (plan) => {
      let record;
      do {
        await chain.reviewNext();
        record = await chain.sendReviewed();
        assert.equal(record.status, "confirmed", JSON.stringify(record));
      } while (chain.plan);
      return record;
    };
    const converterPlan = await browserClient.setup({
        kind: "converter",
        router: router.target,
      }),
      converterRecord = await executeBrowser(converterPlan),
      browserConverter = converterRecord.contractAddress;
    assert.equal(
      browserConverter.toLowerCase(),
      converterPlan.predictedAddress.toLowerCase(),
    );
    const exitPlan = await browserClient.setup({
        kind: "exit",
        converter: browserConverter,
      }),
      exitRecord = await executeBrowser(exitPlan),
      browserExit = exitRecord.contractAddress;
    const createPlan = await browserClient.createExit({
        exit: browserExit,
        position: position.target,
        inputToken: c0.target,
        amount: "1",
        minimumOutput: "0.1",
        slices: "2",
        intervalSeconds: "60",
        rewardPerSlice: "0.00001",
      }),
      created = await executeBrowser(createPlan);
    assert.equal(created.meta.strategyId, "1");
    const readPlan = await browserClient.inspectExit({
      exit: browserExit,
      id: "1",
    });
    assert.equal(readPlan.owner.toLowerCase(), a.toLowerCase());
    assert.equal(readPlan.slices, "2");
    await executeBrowser(
      await browserClient.exitAction({
        exit: browserExit,
        id: "1",
        action: "cancel",
      }),
    );
    await executeBrowser(
      await browserClient.exitAction({
        exit: browserExit,
        id: "1",
        action: "withdraw",
      }),
    );
    const compoundPlan = await browserClient.setup({
        kind: "compounder",
        position: position.target,
      }),
      compoundRecord = await executeBrowser(compoundPlan),
      browserCompounder = compoundRecord.contractAddress;
    await executeBrowser(
      await browserClient.compoundAction({
        compounder: browserCompounder,
        action: "configure",
        maximum0: "1",
        maximum1: "1",
        intervalSeconds: "60",
        rewardAmount: "0.00001",
      }),
    );
    await executeBrowser(
      await browserClient.compoundAction({
        compounder: browserCompounder,
        action: "fund",
        amount: "1",
      }),
    );
    await executeBrowser(
      await browserClient.compoundAction({
        compounder: browserCompounder,
        action: "withdraw",
        amount: "1",
      }),
    );
    const inspected = await browserClient.compoundAction({
      compounder: browserCompounder,
      action: "read",
    });
    assert.equal(inspected.shares, "0.0");
    chain.disconnect();
    // Finish all principal; any arithmetic remainder is bounded rounding, never available for theft.
    for (const signer of [alice, bob]) {
      const address = await signer.getAddress(),
        owned = await position.balanceOf(address);
      if (owned)
        await send(position.connect(signer).redeem(owned, 0, 0, t.deadline));
    }
    assert.equal(await position.liquidity(), 0n);
    assert.equal(await position.totalSupply(), 0n);
    assert.equal(await c0.balanceOf(position.target), 0n);
    assert.equal(await c1.balanceOf(position.target), 0n);
    const report = {
      status: "passed",
      environment:
        "Local Anvil Cancun with genuine pinned Uniswap v4 PoolManager",
      checks: [
        "Fee-only collection preserves all principal and shares; repeated claims cannot take another holder’s earned fees",
        "Fee reinvestment adds actual PoolManager liquidity and proportional shares; insufficient fee budgets revert",
        "Uncollected earnings move with transferred shares, preserving vesting custody",
        "OwnerFeeRouter converts only caller-owned claims through the actual v4 pool; output and approval accounting verified",
        "Funded scheduled exits enforce due time and beneficiary; failed prices remain recoverable; owner cancel refunds remaining input and unearned rewards",
        "Partial share transfer/redemption preserves other holder claims; the final redemption receives residual dividend rounding and leaves no stranded position assets",
        "Irrevocable hook ceilings and destinations survive ownership transfer; splitter recipient weights cannot change after opt-in commitment",
        "Opt-in compounder executes actual liquidity reinvestment with prepaid keeper rewards; unauthorized withdrawal fails; pause and full principal/reward recovery succeed",
        "Extended integer economic model reconciles every real swap output, fee-only payout and reinvestment share amount in the tested sequence against the genuine PoolManager",
        "Actual browser builders and shared review verify converter/exit/compounder deployment, funded schedule creation, cancellation/reward recovery and revocable LP custody receipts",
        "No funded public Ethereum or private-proof claim is made",
      ],
    };
    fs.writeFileSync(
      path.join(root, "artifacts/strategy-test-results.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    provider?.destroy();
    anvil.kill("SIGTERM");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
