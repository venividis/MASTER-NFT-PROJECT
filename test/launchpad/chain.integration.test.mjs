import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  JsonRpcProvider,
  ContractFactory,
  Contract,
  parseUnits,
  formatUnits,
  keccak256,
} from "../../web/vendor/ethers.min.js";
import { LaunchChain, resolveHumanRange } from "../../web/launchpad/chain.mjs";
import { DEPLOYMENTS } from "../../web/launchpad/deployments.mjs";
import { ARTIFACTS } from "../../web/v4/artifacts.mjs";
import { deployStack } from "../../scripts/lib/deploy-stack.mjs";
import {
  NFTAccountSession,
  verifyAccountRuntime,
} from "../../web/launchpad/account-session.mjs";
import { ARTIFACTS as CORE_ARTIFACTS } from "../../web/extensions/artifacts.mjs";
import { defaults, poolModel, poolTrade } from "../../web/launchpad/model.mjs";
import { startingPrice, sqrtAtTick } from "../../web/v4/math.mjs";
const root = path.resolve(import.meta.dirname, "../.."),
  v4 = path.join(root, "integrations/console/protocol/v4-hook"),
  require = createRequire(import.meta.url);
const memory = () => {
  const items = new Map();
  return {
    getItem: (k) => items.get(k) || null,
    setItem: (k, v) => items.set(k, v),
    items,
  };
};
function compileFixtures() {
  const solc = require(path.join(v4, "scripts/dependency.cjs"))("solc");
  const resolve = (name) =>
    name.startsWith("@uniswap/v4-core/")
      ? path.join(v4, "vendor/v4-core", name.slice("@uniswap/v4-core/".length))
      : name.startsWith("solmate/")
        ? path.join(
            v4,
            "vendor/v4-core/lib/solmate",
            name.slice("solmate/".length),
          )
        : path.join(v4, name);
  const sources = Object.fromEntries(
    [
      "@uniswap/v4-core/src/PoolManager.sol",
      "vendor/v4-periphery/src/lens/V4Quoter.sol",
    ].map((name) => [
      name,
      { content: fs.readFileSync(resolve(name), "utf8") },
    ]),
  );
  sources["Fixture.sol"] = {
    content:
      'pragma solidity 0.8.26; contract Fixture {string public name="Quote"; string public symbol="QUOTE"; uint8 public immutable decimals; uint public totalSupply; mapping(address=>uint) public balanceOf; mapping(address=>mapping(address=>uint)) public allowance; constructor(uint8 d){decimals=d; totalSupply=1000000000*10**d; balanceOf[msg.sender]=totalSupply;} function approve(address a,uint n)external returns(bool){allowance[msg.sender][a]=n;return true;}function transfer(address a,uint n)external returns(bool){balanceOf[msg.sender]-=n;balanceOf[a]+=n;return true;}function transferFrom(address a,address b,uint n)external returns(bool){allowance[a][msg.sender]-=n;balanceOf[a]-=n;balanceOf[b]+=n;return true;}}',
  };
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources,
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: "cancun",
          outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
        },
      }),
      {
        import: (name) => {
          try {
            return { contents: fs.readFileSync(resolve(name), "utf8") };
          } catch (e) {
            return { error: String(e) };
          }
        },
      },
    ),
  );
  const errors = (output.errors || []).filter((x) => x.severity === "error");
  assert.equal(
    errors.length,
    0,
    errors.map((e) => e.formattedMessage).join("\n"),
  );
  return output.contracts;
}
test("unavailable localStorage does not break an onchain opaque-origin controller", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException(
        "Opaque origin storage is unavailable",
        "SecurityError",
      );
    },
  });
  try {
    const chain = new LaunchChain();
    assert.equal(chain.storage, null);
    assert.equal(chain.getState().connected, false);
    assert.doesNotThrow(() => chain.persist());
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});
test("expired auction windows stop before token approvals and fresh reviews clear old failures", async () => {
  const chain = new LaunchChain({ storage: memory() });
  let block = 100,
    tokenReads = 0;
  chain.assertContext = async () => {};
  chain.config = { manager: "0x0000000000000000000000000000000000000001" };
  chain.address = "0x0000000000000000000000000000000000000002";
  chain.chainId = 31337n;
  chain.provider = {
    getBlockNumber: async () => block,
    call: async () => {
      tokenReads++;
      return "0x";
    },
    estimateGas: async () => 21000n,
    getFeeData: async () => ({ gasPrice: 1n }),
    getBalance: async () => 10n ** 18n,
  };
  const plan = () => ({
    kind: "auction-fund",
    generation: chain.generation,
    deadline: Math.floor(Date.now() / 1000) + 600,
    request: {
      to: "0x0000000000000000000000000000000000000003",
      data: "0x1234",
      value: 0n,
    },
    spend: [
      {
        tokenAddress: "0x0000000000000000000000000000000000000004",
        amount: 1n,
      },
    ],
    meta: { notAfterBlock: "99" },
  });
  chain.plan = plan();
  await assert.rejects(chain.next(), /expired/);
  assert.equal(tokenReads, 0);
  chain.plan = { ...plan(), meta: { notBeforeBlock: "101" } };
  await assert.rejects(chain.next(), /not opened/);
  assert.equal(tokenReads, 0);
  for (const value of ["1e3", "-1", "1.5", 2 ** 64]) {
    chain.plan = { ...plan(), meta: { notAfterBlock: value } };
    await assert.rejects(chain.next(), /Invalid transaction block window/);
  }
  chain.plan = {
    ...plan(),
    meta: { notBeforeBlock: "102", notAfterBlock: "101" },
  };
  await assert.rejects(chain.next(), /Invalid transaction block window/);
  chain.error = "A previously rejected signature";
  await chain.begin();
  assert.equal(chain.error, null);
  chain.plan = {
    ...plan(),
    spend: [],
    meta: { notBeforeBlock: "100", notAfterBlock: "100" },
  };
  chain.error = "A previous fee failure";
  const review = await chain.reviewNext();
  assert.equal(review.final, true);
  assert.equal(chain.error, null);
  block = 101;
  await assert.rejects(chain.next(), /expired/);
});
test("human range rounds outward after token ordering and decimals are known", () => {
  for (const decimals of [6, 18])
    for (const tokenIs0 of [true, false]) {
      const range = resolveHumanRange(
          { lower: "0.001", upper: "0.004" },
          decimals,
          tokenIs0,
          60,
        ),
        a = startingPrice("0.001", decimals, tokenIs0),
        b = startingPrice("0.004", decimals, tokenIs0);
      assert.ok(sqrtAtTick(range.tickLower) <= (a < b ? a : b));
      assert.ok(sqrtAtTick(range.tickUpper) >= (a < b ? b : a));
      assert.ok(range.tickLower % 60 === 0);
      assert.ok(range.tickUpper % 60 === 0);
    }
  assert.throws(
    () => resolveHumanRange({ lower: "2", upper: "1" }, 18, true, 60),
    /lower human price/,
  );
});
test(
  "wallet controller deploys, funds, launches, trades, exits and recovers real v4 transactions",
  { timeout: 240000 },
  async (t) => {
    const compiled = compileFixtures(),
      port = 24919,
      rpc = `http://127.0.0.1:${port}`,
      anvil = spawn(
        process.execPath,
        [
          path.join(v4, "node_modules/@foundry-rs/anvil/bin.mjs"),
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
    let provider,
      chain,
      stderr = "";
    anvil.stderr.on("data", (b) => (stderr += b));
    try {
      for (let i = 0; i < 100; i++) {
        try {
          const x = await fetch(rpc, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "eth_chainId",
              params: [],
            }),
          });
          if ((await x.json()).result === "0x7a69") break;
        } catch {}
        if (i === 99) throw Error(stderr || "Anvil failed to start");
        await new Promise((r) => setTimeout(r, 50));
      }
      provider = new JsonRpcProvider(rpc, 31337, {
        staticNetwork: true,
        cacheTimeout: -1,
      });
      provider.pollingInterval = 10;
      const signer = await provider.getSigner(0),
        address = await signer.getAddress();
      const deploy = async (a, args = []) => {
        const contract = await new ContractFactory(
          a.abi,
          "0x" + a.evm.bytecode.object,
          signer,
        ).deploy(...args);
        await contract.waitForDeployment();
        return contract;
      };
      const manager = await deploy(
          compiled["@uniswap/v4-core/src/PoolManager.sol"].PoolManager,
          [address],
        ),
        quoter = await deploy(
          compiled["vendor/v4-periphery/src/lens/V4Quoter.sol"].V4Quoter,
          [await manager.getAddress()],
        ),
        quote = await deploy(compiled["Fixture.sol"].Fixture, [6]);
      class Wallet extends EventEmitter {
        constructor() {
          super();
          this.sends = 0;
          this.beforeSend = null;
          this.accountIndex = 0;
        }
        async request({ method, params = [] }) {
          if (method === "eth_requestAccounts") method = "eth_accounts";
          if (method === "eth_accounts") {
            const accounts = await provider.send(method, params);
            return [accounts[this.accountIndex]];
          }
          if (method === "eth_sendTransaction") {
            this.sends++;
            await this.beforeSend?.();
          }
          return provider.send(method, params);
        }
      }
      const wallet = new Wallet(),
        storage = memory();
      chain = new LaunchChain({
        storage,
        receiptTimeout: 3000,
        pollInterval: 10,
        deployments: {
          31337: {
            manager: await manager.getAddress(),
            quoter: await quoter.getAddress(),
          },
        },
      });
      await chain.connect(wallet);
      assert.equal(chain.getState().connected, true);
      assert.equal(wallet.sends, 0);
      assert.equal(chain.config.factory, undefined);
      for (const kind of ["factory", "router"]) {
        const plan = await chain.prepareSetup(kind);
        assert.equal(
          keccak256(DEPLOYMENTS[plan.meta.contractName].bytecode),
          DEPLOYMENTS[plan.meta.contractName].creationHash,
        );
        const review = await chain.reviewNext();
        assert.equal(review.final, true);
        assert.equal(wallet.sends, kind === "factory" ? 0 : 1);
        const sent = await chain.sendReviewed();
        assert.equal(sent.status, "confirmed");
        assert.equal(sent.contractAddress, plan.meta.predictedAddress);
        assert.equal(chain.config[kind], sent.contractAddress);
      }
      const draft = {
        name: "Anima Actual Launch",
        symbol: "AAL",
        supply: "1000000",
        quoteToken: await quote.getAddress(),
        tokenBudget: "10000",
        quoteBudget: "10000",
        price: "1",
        fee: 3000,
        tickSpacing: 60,
        range: { lower: "0.5", upper: "2" },
      };
      let plan = await chain.prepareLaunch(draft);
      assert.equal(plan.meta.quote.decimals, 6);
      assert.equal(plan.terms.quoteBudget, parseUnits("10000", 6));
      assert.ok(
        plan.terms.tickLower > 200000 || plan.terms.tickUpper < -200000,
      );
      await chain.reviewNext();
      const staleSends = wallet.sends;
      chain.invalidate();
      await assert.rejects(chain.sendReviewed(), /Review/);
      assert.equal(wallet.sends, staleSends);
      await (
        await quote
          .connect(signer)
          .approve(chain.config.factory, parseUnits("20000", 6))
      ).wait();
      plan = await chain.prepareLaunch(draft);
      const reset = await chain.reviewNext();
      assert.equal(reset.approval.amount, "0");
      await chain.sendReviewed();
      assert.equal(await quote.allowance(address, chain.config.factory), 0n);
      const approval = await chain.reviewNext();
      assert.equal(approval.final, false);
      assert.equal(approval.approval.amount, parseUnits("10000", 6).toString());
      let unlock;
      wallet.beforeSend = () => new Promise((r) => (unlock = r));
      const first = chain.sendReviewed();
      for (let i = 0; i < 50 && !unlock; i++)
        await new Promise((r) => setTimeout(r, 10));
      await assert.rejects(chain.sendReviewed(), /already in progress/);
      wallet.beforeSend = null;
      unlock();
      await first;
      assert.equal(
        await quote.allowance(address, chain.config.factory),
        plan.terms.quoteBudget,
      );
      const review = await chain.reviewNext();
      assert.equal(review.final, true);
      const sent = await chain.sendReviewed();
      assert.equal(sent.status, "confirmed");
      assert.equal(sent.launch.token, plan.summary.token);
      assert.equal(sent.launch.position, plan.summary.position);
      assert.equal(await quote.allowance(address, chain.config.factory), 0n);
      const token = new Contract(
        sent.launch.token,
        [
          "function totalSupply()view returns(uint256)",
          "function balanceOf(address)view returns(uint256)",
        ],
        provider,
      );
      assert.equal(await token.totalSupply(), parseUnits("1000000", 18));
      assert.ok((await token.balanceOf(address)) > parseUnits("990000", 18));
      const position = await chain.inspectPosition(sent.launch.position);
      assert.ok(BigInt(position.shares) > 0n);
      assert.equal(position.poolId, sent.launch.poolId);
      assert.ok(
        BigInt(position.preview.amount0) > 0n &&
          BigInt(position.preview.amount1) > 0n,
      );
      const modeledPool = poolModel(
        {
          ...defaults(),
          name: draft.name,
          symbol: draft.symbol,
          supply: draft.supply,
          tokenBudget: draft.tokenBudget,
          quoteBudget: draft.quoteBudget,
          quoteDecimals: "6",
          quoteSymbol: "QUOTE",
          price: draft.price,
          range: "custom",
          lowerPrice: "0.5",
          upperPrice: "2",
          feePercent: "0.30",
          tickSpacing: "60",
          hookEnabled: false,
        },
        BigInt(sent.launch.token) < BigInt(quote.target),
      );
      assert.equal(modeledPool.l, BigInt(position.liquidity));
      assert.equal(
        modeledPool.usedToken,
        parseUnits(draft.supply, 18) - (await token.balanceOf(address)),
      );
      assert.equal(
        modeledPool.usedQuote,
        await quote.balanceOf(manager.target),
      );
      const modeledTrade = poolTrade(modeledPool, "buy", "1");
      const beforeToken = await token.balanceOf(address);
      await chain.prepareSwap({
        inputToken: await quote.getAddress(),
        outputToken: sent.launch.token,
        amount: "1",
        fee: 3000,
        tickSpacing: 60,
        slippageBps: 50,
      });
      await chain.reviewNext();
      await chain.sendReviewed();
      await chain.reviewNext();
      const swap = await chain.sendReviewed();
      assert.equal(swap.status, "confirmed");
      assert.ok((await token.balanceOf(address)) > beforeToken);
      assert.equal(
        (await token.balanceOf(address)) - beforeToken,
        modeledTrade.out,
      );
      assert.equal(
        BigInt(
          (await chain.inspectPosition(sent.launch.position)).sqrtPriceX96,
        ),
        modeledTrade.next,
      );
      await chain.prepareRedeem({
        position: sent.launch.position,
        shares: position.formattedShares,
        slippageBps: 50,
      });
      const redeemReview = await chain.reviewNext();
      assert.equal(redeemReview.final, true);
      await chain.sendReviewed();
      const exited = await chain.inspectPosition(sent.launch.position);
      assert.equal(exited.shares, "0");
      assert.equal(exited.totalSupply, "0");
      await t.test(
        "a real minted NFT funds launch, swaps and LP redemption with atomic allowances and transfer-safe reviews",
        async () => {
          const stack = await deployStack({
              signer,
              attesterAddress: address,
              royaltyReceiver: address,
              royaltyBps: 0,
            }),
            collection = stack.collection;
          const secret = keccak256(
              new TextEncoder().encode("launch-account-custody"),
            ),
            commit = await collection.commitmentFor(address, secret, address);
          await (await collection.commitAwakening(commit)).wait();
          await provider.send("evm_mine", []);
          await provider.send("evm_mine", []);
          await (await collection.revealAwakening(secret, address)).wait();
          const nftAddress = await collection.accountOf(1),
            nft = new Contract(
              nftAddress,
              CORE_ARTIFACTS.SovereignAccount.abi,
              signer,
            );
          await (
            await quote.transfer(nftAddress, parseUnits("100000", 6))
          ).wait();
          await (
            await signer.sendTransaction({
              to: nftAddress,
              value: parseUnits("1", 18),
            })
          ).wait();
          const nftState = await chain.useNFT({
            collection: collection.target,
            tokenId: 1,
            account: nftAddress,
            chainId: 31337,
          });
          assert.equal(chain.address, address);
          assert.equal(chain.payer, nftAddress);
          assert.equal(nftState.execution.mode, "nft");
          assert.equal(
            (await chain.readToken(quote.target)).balance,
            parseUnits("100000", 6).toString(),
          );
          await assert.rejects(
            chain.prepareSetup("router"),
            /Select wallet funding/,
          );
          await assert.rejects(chain.prepareExternal({}), /wallet directly/);
          await (
            await nft.execute(
              quote.target,
              0,
              quote.interface.encodeFunctionData("approve", [
                chain.config.factory,
                parseUnits("20000", 6),
              ]),
            )
          ).wait();
          const nftPlan = await chain.prepareLaunch({
              ...draft,
              name: "NFT Account Launch",
              symbol: "NFT",
            }),
            nftReview = await chain.reviewNext();
          assert.equal(nftPlan.payer, nftAddress);
          assert.equal(nftReview.final, true);
          assert.equal(nftReview.request.to, nftAddress);
          assert.equal(nftReview.allowance.atomic, true);
          assert.equal(nftReview.allowance.resetAfter, true);
          const accountNonce = await nft.actionNonce(),
            created = await chain.sendReviewed();
          assert.equal(created.status, "confirmed");
          assert.equal(created.launch.token, nftPlan.summary.token);
          assert.equal(created.payer, nftAddress);
          assert.equal(await nft.actionNonce(), accountNonce + 1n);
          assert.equal(
            await quote.allowance(nftAddress, chain.config.factory),
            0n,
          );
          const createdToken = new Contract(
            created.launch.token,
            ["function balanceOf(address)view returns(uint256)"],
            provider,
          );
          assert.ok(
            (await createdToken.balanceOf(nftAddress)) >
              parseUnits("990000", 18),
          );
          assert.equal(await createdToken.balanceOf(address), 0n);
          const ownedPosition = await chain.inspectPosition(
            created.launch.position,
          );
          assert.ok(BigInt(ownedPosition.shares) > 0n);
          const priorTokens = await createdToken.balanceOf(nftAddress);
          await chain.prepareSwap({
            inputToken: quote.target,
            outputToken: created.launch.token,
            amount: "1",
            fee: 3000,
            tickSpacing: 60,
            slippageBps: 50,
          });
          assert.equal((await chain.reviewNext()).final, true);
          await chain.sendReviewed();
          assert.ok((await createdToken.balanceOf(nftAddress)) > priorTokens);
          assert.equal(
            await quote.allowance(nftAddress, chain.config.router),
            0n,
          );
          await chain.prepareRedeem({
            position: created.launch.position,
            shares: ownedPosition.formattedShares,
            slippageBps: 50,
          });
          assert.equal((await chain.reviewNext()).allowance, null);
          await chain.sendReviewed();
          assert.equal(
            (await chain.inspectPosition(created.launch.position)).shares,
            "0",
          );
          await chain.prepareLaunch({ ...draft, name: "Stale account nonce" });
          await chain.reviewNext();
          const oldSends = wallet.sends;
          await (
            await nft.execute(
              quote.target,
              0,
              quote.interface.encodeFunctionData("approve", [
                chain.config.factory,
                0,
              ]),
            )
          ).wait();
          await assert.rejects(chain.sendReviewed(), /another action/);
          assert.equal(wallet.sends, oldSends);
          await chain.prepareLaunch({ ...draft, name: "Stale NFT owner" });
          await chain.reviewNext();
          const buyer = await provider.getSigner(1),
            buyerAddress = await buyer.getAddress(),
            oldEpoch = await nft.sessionEpoch();
          await (
            await collection.transferFrom(address, buyerAddress, 1)
          ).wait();
          assert.ok((await nft.sessionEpoch()) > oldEpoch);
          await assert.rejects(chain.sendReviewed(), /ownership changed/);
          assert.equal(wallet.sends, oldSends);
          wallet.accountIndex = 1;
          wallet.emit("accountsChanged", [buyerAddress]);
          await chain.connect(wallet);
          await chain.useNFT({ collection: collection.target, tokenId: 1 });
          assert.equal(chain.payer, nftAddress);
          assert.equal(chain.address, buyerAddress);
          await chain.prepareLaunch({
            ...draft,
            name: "Current NFT owner",
            symbol: "NEXT",
          });
          await chain.reviewNext();
          const nextOwnerLaunch = await chain.sendReviewed();
          assert.equal(nextOwnerLaunch.status, "confirmed");
          assert.equal(nextOwnerLaunch.payer, nftAddress);
          const runtime = await provider.getCode(nftAddress),
            groups = Object.values(
              CORE_ARTIFACTS.SovereignAccount.immutableReferences,
            ),
            location = groups.find((g) => g.length > 1)[0];
          const altered =
            runtime.slice(0, 2 + location.start * 2) +
            "f".repeat(location.length * 2) +
            runtime.slice(2 + (location.start + location.length) * 2);
          assert.throws(
            () => verifyAccountRuntime(altered, "SovereignAccount"),
            /inconsistent immutable/,
          );
          await provider.send("anvil_setCode", [nftAddress, altered]);
          await assert.rejects(
            NFTAccountSession.connect(provider, buyerAddress, {
              collection: collection.target,
              tokenId: 1,
            }),
            /inconsistent immutable/,
          );
          await provider.send("anvil_setCode", [nftAddress, runtime]);
          chain.useWallet();
          assert.equal(chain.payer, buyerAddress);
          wallet.accountIndex = 0;
          wallet.emit("accountsChanged", [address]);
          await chain.connect(wallet);
        },
      );
      // A mined-but-unobserved approval is journaled before polling; reload finds it and never sends a duplicate.
      await chain.prepareLaunch({ ...draft, name: "Recovered", symbol: "REC" });
      await chain.reviewNext();
      await provider.send("evm_setAutomine", [false]);
      chain.receiptTimeout = 25;
      const pending = await chain.sendReviewed();
      assert.equal(pending.status, "pending");
      assert.ok(
        [...storage.items.values()].some((s) => s.includes(pending.hash)),
      );
      await assert.rejects(chain.prepareLaunch(draft), /awaiting confirmation/);
      const sends = wallet.sends;
      chain.disconnect();
      await provider.send("evm_mine", []);
      await provider.send("evm_setAutomine", [true]);
      chain = new LaunchChain({
        storage,
        pollInterval: 10,
        receiptTimeout: 1000,
      });
      await chain.connect(wallet);
      assert.equal(
        chain.records.find((r) => r.hash === pending.hash).status,
        "confirmed",
      );
      assert.equal(wallet.sends, sends);
      assert.ok(chain.config.factory && chain.config.router);
      await chain.prepareLaunch({ ...draft, name: "Account change" });
      await chain.reviewNext();
      wallet.emit("accountsChanged", [
        "0x0000000000000000000000000000000000000001",
      ]);
      await assert.rejects(chain.sendReviewed(), /Review/);
      assert.equal(wallet.sends, sends);
      await chain.connect(wallet);
      await t.test(
        "wallet cancellation, speed-up and a reorg reconcile receipts without resending",
        async () => {
          const pendingApproval = async (name) => {
            await chain.prepareLaunch({ ...draft, name, quoteBudget: "12000" });
            const r = await chain.reviewNext();
            assert.equal(r.final, false);
            await provider.send("evm_setAutomine", [false]);
            chain.receiptTimeout = 25;
            return { review: r, record: await chain.sendReviewed() };
          };
          let pending = await pendingApproval("Cancel this approval"),
            sendCount = wallet.sends;
          const cancellation = await signer.sendTransaction({
            to: address,
            value: 0n,
            data: "0x",
            nonce: pending.record.nonce,
            gasLimit: 21000n,
            maxFeePerGas: parseUnits("100", 9),
            maxPriorityFeePerGas: parseUnits("10", 9),
          });
          await provider.send("evm_mine", []);
          await provider.send("evm_setAutomine", [true]);
          await chain.recoverTransactions();
          let recovered = chain.records.find(
            (r) => r.hash === pending.record.hash,
          );
          assert.equal(recovered.status, "cancelled");
          assert.equal(recovered.replacementHash, cancellation.hash);
          assert.equal(chain.pending(), null);
          assert.equal(wallet.sends, sendCount);
          pending = await pendingApproval("Speed up this approval");
          sendCount = wallet.sends;
          const speedup = await signer.sendTransaction({
            ...pending.review.request,
            nonce: pending.record.nonce,
            gasLimit: pending.review.gasLimit,
            maxFeePerGas: parseUnits("100", 9),
            maxPriorityFeePerGas: parseUnits("10", 9),
          });
          await provider.send("evm_mine", []);
          await provider.send("evm_setAutomine", [true]);
          await provider.send("evm_mine", []);
          await provider.send("evm_mine", []);
          chain.replacementScanLimit = 1;
          await chain.recoverTransactions();
          recovered = chain.records.find((r) => r.hash === pending.record.hash);
          assert.equal(recovered.status, "replacement-unresolved");
          assert.ok(chain.pending());
          await assert.rejects(
            chain.recoverReplacement(pending.record.hash, cancellation.hash),
            /original wallet and nonce/,
          );
          await chain.recoverReplacement(pending.record.hash, speedup.hash);
          chain.replacementScanLimit = 256;
          recovered = chain.records.find((r) => r.hash === pending.record.hash);
          assert.equal(recovered.status, "confirmed");
          assert.equal(recovered.replacementType, "same-action");
          assert.equal(recovered.effectiveHash, speedup.hash);
          assert.ok(recovered.blockHash);
          assert.ok(recovered.confirmations >= 1);
          assert.equal(wallet.sends, sendCount);
          await assert.rejects(
            chain.recoverReplacement(
              pending.record.hash,
              "0x" + "00".repeat(32),
            ),
            /not available/,
          );
          await chain.prepareLaunch({
            ...draft,
            name: "Reorg receipt",
            quoteBudget: "13000",
          });
          await chain.reviewNext();
          const snapshot = await provider.send("evm_snapshot", []);
          chain.receiptTimeout = 3000;
          const included = await chain.sendReviewed();
          assert.equal(included.status, "confirmed");
          await provider.send("evm_revert", [snapshot]);
          await chain.recoverTransactions();
          const reorganized = chain.records.find(
            (r) => r.hash === included.hash,
          );
          assert.equal(reorganized.status, "pending");
          assert.equal(reorganized.canonical, false);
          assert.equal(reorganized.confirmations, 0);
          assert.equal(reorganized.reorgs, 1);
          assert.equal(reorganized.blockHash, undefined);
          assert.ok(chain.pending());
          assert.equal(wallet.sends, sendCount + 1);
        },
      );
    } finally {
      chain?.disconnect();
      provider?.destroy();
      anvil.kill("SIGTERM");
    }
  },
);
