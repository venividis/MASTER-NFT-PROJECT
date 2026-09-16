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
  ZeroAddress,
  ZeroHash,
  keccak256,
  toUtf8Bytes,
  toBeHex,
} from "../../web/vendor/ethers.min.js";
import { launchPlan } from "../../web/v4/client.mjs";
import { defaults } from "../../web/launchpad/model.mjs";
import { LaunchChain } from "../../web/launchpad/chain.mjs";
import {
  LaunchLifecycleClient,
  readLaunchRecord,
  verifyLifecycleReceipt,
  mechanismHash,
  mainDraftToLifecycle,
} from "../../web/launchpad/lifecycle-client.mjs";
import { LaunchLifecycleDesk } from "../../web/launchpad/lifecycle.mjs";
import { LIFECYCLE_ARTIFACTS } from "../../web/launchpad/lifecycle-artifacts.mjs";
import { SALE_ARTIFACTS } from "../../web/launchpad/sale-artifacts.mjs";
import { DEPLOYMENTS } from "../../web/launchpad/deployments.mjs";
import { HOOK_ARTIFACTS } from "../../web/launchpad/hook-artifacts.mjs";
import { ARTIFACTS } from "../../web/v4/artifacts.mjs";
import { hookDeployPlan } from "../../web/launchpad/hook-client.mjs";
import { LaunchParticipant } from "../../web/launchpad/participant.mjs";
import { readPoolLaunch } from "../../web/launchpad/pool-participant.mjs";
import {
  parseLaunchHash,
  buildLaunchHash,
  buildLaunchLink,
  recordToRoute,
} from "../../web/launchpad/links.mjs";
const root = path.resolve(import.meta.dirname, "../.."),
  v4 = path.join(root, "integrations/console/protocol/v4-hook"),
  require = createRequire(import.meta.url);
const u = (x) => parseUnits(String(x), 18);
function fixtures() {
  const solc = require(path.join(v4, "scripts/dependency.cjs"))("solc");
  const resolve = (name) =>
    name.startsWith("@uniswap/v4-core/")
      ? path.join(v4, "vendor/v4-core", name.slice(17))
      : name.startsWith("solmate/")
        ? path.join(v4, "vendor/v4-core/lib/solmate", name.slice(8))
        : path.join(v4, name);
  const sources = Object.fromEntries(
    [
      "@uniswap/v4-core/src/PoolManager.sol",
      "vendor/v4-periphery/src/lens/V4Quoter.sol",
    ].map((n) => [n, { content: fs.readFileSync(resolve(n), "utf8") }]),
  );
  sources["LifecycleFixture.sol"] = {
    content: `pragma solidity 0.8.26;
contract Quote {string public name="Quote";string public symbol="QUOTE";uint8 public constant decimals=18;uint public totalSupply=1000000000 ether;mapping(address=>uint)public balanceOf;mapping(address=>mapping(address=>uint))public allowance;constructor(){balanceOf[msg.sender]=totalSupply;}function approve(address a,uint n)external returns(bool){allowance[msg.sender][a]=n;return true;}function transfer(address a,uint n)external returns(bool){balanceOf[msg.sender]-=n;balanceOf[a]+=n;return true;}function transferFrom(address a,address b,uint n)external returns(bool){allowance[a][msg.sender]-=n;balanceOf[a]-=n;balanceOf[b]+=n;return true;}}
contract Collection {mapping(uint=>address)public accountOf;function bind(uint id,address a)external{accountOf[id]=a;}function ownerOf(uint)external view returns(address){return msg.sender;}}
contract EpochAccount {address public currentOwner;uint64 public sessionEpoch=1;constructor(){currentOwner=msg.sender;}function changeOwner(address who)external{require(msg.sender==currentOwner);currentOwner=who;sessionEpoch++;}function callTarget(address t,bytes calldata d)external returns(bytes memory){require(msg.sender==currentOwner);(bool ok,bytes memory r)=t.call(d);require(ok);return r;}}
`,
  };
  const result = JSON.parse(
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
        import: (n) => {
          try {
            return { contents: fs.readFileSync(resolve(n), "utf8") };
          } catch (e) {
            return { error: String(e) };
          }
        },
      },
    ),
  );
  const errors = (result.errors || []).filter((e) => e.severity === "error");
  assert.deepEqual(errors, []);
  return result.contracts;
}

test("pool and permanent-record links keep exact chain identity without provider credentials", () => {
  for (const route of [
    {
      kind: "pool",
      chainId: 1,
      contract: "0x0000000000000000000000000000000000000007",
    },
    {
      kind: "record",
      chainId: 1,
      contract: "0x0000000000000000000000000000000000000007",
      id: "3",
    },
  ]) {
    assert.deepEqual(parseLaunchHash(buildLaunchHash(route)), route);
    const link = buildLaunchLink(
      route,
      "https://anima.example/?rpc=SECRET#old",
    );
    assert.equal(new URL(link).search, "");
  }
  assert.throws(
    () =>
      parseLaunchHash(
        "#launch/pool/1/0x0000000000000000000000000000000000000007/3",
      ),
    /malformed/,
  );
  assert.throws(
    () =>
      parseLaunchHash(
        "#launch/record/1/0x0000000000000000000000000000000000000007",
      ),
    /malformed/,
  );
});

test("official launch records reopen their exact official strategy without an owner history", () => {
  const contract = "0x0000000000000000000000000000000000000007",
    token = "0x0000000000000000000000000000000000000008";
  assert.deepEqual(
    recordToRoute({
      mechanism: "official-cca",
      chainId: 1,
      target: contract,
      token,
      position: ZeroAddress,
    }),
    { kind: "cca", chainId: 1, contract },
  );
  assert.deepEqual(
    recordToRoute({
      mechanism: "official-doppler",
      chainId: 1,
      target: contract,
      token,
      position: ZeroAddress,
    }),
    { kind: "doppler", chainId: 1, contract, asset: token },
  );
  const identity = recordToRoute({
    mechanism: "official-doppler",
    chainId: 1,
    target: contract,
    token,
    position: contract,
  });
  assert.equal(identity.kind, "doppler");
  assert.deepEqual(parseLaunchHash(buildLaunchHash(identity)), identity);
});

test(
  "real v4 atomic allocations, TimeVault custody, discoverable records and failure recovery",
  { timeout: 240000 },
  async (t) => {
    const compiled = fixtures(),
      port = 25149,
      url = `http://127.0.0.1:${port}`,
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
    let provider, chain;
    let stderr = "";
    anvil.stderr.on("data", (b) => (stderr += b));
    t.after(() => {
      chain?.disconnect();
      provider?.destroy();
      anvil.kill("SIGTERM");
    });
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_chainId",
            params: [],
          }),
        });
        if ((await r.json()).result === "0x7a69") break;
      } catch {}
      if (i === 99) throw Error(stderr || "Anvil startup failed");
      await new Promise((r) => setTimeout(r, 50));
    }
    provider = new JsonRpcProvider(url, 31337, {
      staticNetwork: true,
      cacheTimeout: -1,
    });
    provider.pollingInterval = 10;
    const owner = await provider.getSigner(0),
      beneficiary = await provider.getSigner(1),
      other = await provider.getSigner(2),
      o = await owner.getAddress(),
      b = await beneficiary.getAddress(),
      z = await other.getAddress();
    const deploy = async (a, args = []) => {
        const c = await new ContractFactory(
          a.abi,
          a.bytecode || "0x" + a.evm.bytecode.object,
          owner,
        ).deploy(...args);
        await c.waitForDeployment();
        return c;
      },
      send = async (p) => (await p).wait();
    const manager = await deploy(
        compiled["@uniswap/v4-core/src/PoolManager.sol"].PoolManager,
        [o],
      ),
      quoter = await deploy(
        compiled["vendor/v4-periphery/src/lens/V4Quoter.sol"].V4Quoter,
        [manager.target],
      ),
      quote = await deploy(compiled["LifecycleFixture.sol"].Quote),
      collection = await deploy(compiled["LifecycleFixture.sol"].Collection),
      ledger = await deploy(SALE_ARTIFACTS.WorldLedger, [collection.target]),
      vault = await deploy(SALE_ARTIFACTS.TimeVault, [ledger.target]),
      market = await deploy(SALE_ARTIFACTS.NativeMarket, [ledger.target]),
      sale = await deploy(SALE_ARTIFACTS.GenesisLaunchpad, [ledger.target]);
    await send(ledger.sealModules(market.target, vault.target, sale.target));
    const factory = await deploy(
        {
          ...DEPLOYMENTS.GenesisV4Launchpad,
          abi: ARTIFACTS.GenesisV4Launchpad.abi,
        },
        [manager.target],
      ),
      router = await deploy(
        { ...DEPLOYMENTS.GenesisV4Router, abi: ARTIFACTS.GenesisV4Router.abi },
        [manager.target],
      ),
      hookFactory = await deploy(HOOK_ARTIFACTS.GenesisV4HookLaunchpad, [
        manager.target,
      ]),
      create2 = await deploy(HOOK_ARTIFACTS.HookCreate2Factory);
    class Wallet extends EventEmitter {
      async request({ method, params = [] }) {
        if (method === "eth_requestAccounts") return [o];
        if (method === "eth_accounts") return [o];
        return provider.send(method, params);
      }
    }
    chain = new LaunchChain({
      storage: null,
      pollInterval: 10,
      receiptTimeout: 5000,
    });
    await chain.connect(new Wallet());
    await chain.configure({
      manager: manager.target,
      factory: factory.target,
      hookFactory: hookFactory.target,
      router: router.target,
      quoter: quoter.target,
      create2: create2.target,
    });
    const client = new LaunchLifecycleClient(chain),
      receiptDesk = new LaunchLifecycleDesk({ chain });
    const execute = async (plan) => {
      let record;
      do {
        await chain.reviewNext();
        record = await chain.sendReviewed();
        assert.equal(record.status, "confirmed");
        if (record.final) {
          await verifyLifecycleReceipt(
            provider,
            record,
            await provider.getTransactionReceipt(record.hash),
          );
          if (record.kind.startsWith("lifecycle-")) {
            assert.equal(await receiptDesk.applyReceipt(record), true);
            assert.equal(await receiptDesk.applyReceipt(record), false);
          }
        }
      } while (chain.plan);
      return record;
    };
    const registryAddress = (
        await execute(await client.setup({ kind: "registry" }))
      ).contractAddress,
      composerAddress = (
        await execute(
          await client.setup({
            kind: "composer",
            registry: registryAddress,
            vault: vault.target,
          }),
        )
      ).contractAddress,
      registry = new Contract(
        registryAddress,
        LIFECYCLE_ARTIFACTS.LaunchRegistry.abi,
        owner,
      ),
      composer = new Contract(
        composerAddress,
        LIFECYCLE_ARTIFACTS.LaunchAllocationComposer.abi,
        owner,
      );
    assert.equal(chain.config.registry, registryAddress);
    assert.equal(chain.config.composer, composerAddress);
    assert.equal(receiptDesk.values.registry, registryAddress);
    assert.equal(receiptDesk.values.composer, composerAddress);
    const recoveredDesk = new LaunchLifecycleDesk({ chain }),
      setupRecord = chain.records.find((r) => r.kind === "lifecycle-setup");
    assert.equal(recoveredDesk.values.registry, registryAddress);
    assert.equal(
      await recoveredDesk.applyReceipt({ ...setupRecord, status: "pending" }),
      false,
    );
    await assert.rejects(
      recoveredDesk.applyReceipt({ ...setupRecord, blockHash: ZeroHash }),
      /receipt changed/,
    );
    assert.equal(await recoveredDesk.applyReceipt(setupRecord), true);
    const base = {
      name: "Bounded allocation",
      symbol: "BOUND",
      supply: "1000000",
      tokenBudget: "10000",
      quoteBudget: "10000",
      quoteToken: quote.target,
      price: "1",
      fee: 3000,
      tickSpacing: 60,
      salt: toBeHex(801, 32),
    };
    await assert.rejects(
      client.compose({ composer: composerAddress, draft: base }),
      /Authorize/,
    );
    await execute(
      await client.authorize({
        registry: registryAddress,
        composer: composerAddress,
      }),
    );
    const now = (await provider.getBlock("latest")).timestamp,
      start = now + 600,
      end = start + 86400;
    const rows = [
      {
        asset: "token",
        amount: "1200",
        beneficiary: b,
        start,
        cliff: end,
        end,
        linear: false,
      },
      { asset: "token", amount: "300", beneficiary: z },
      {
        asset: "lp",
        amount: "25%",
        beneficiary: b,
        start,
        cliff: start,
        end,
        linear: true,
      },
    ];
    const before = await quote.balanceOf(o),
      plan = await client.compose({
        composer: composerAddress,
        draft: base,
        allocations: rows,
      });
    assert.match(plan.summary.privacy, /permanent public/);
    assert.equal(plan.spend[0].amount, u("10000"));
    const record = await execute(plan),
      launch = record.launchRecord;
    assert.equal(launch.payer, o);
    assert.equal(launch.registrar, composerAddress);
    assert.equal(launch.links.length, 3);
    assert.equal(launch.termsHash, record.meta.recipeHash);
    assert.equal(await registry.count(), 1n);
    const token = new Contract(
        launch.token,
        [
          "function balanceOf(address) view returns(uint256)",
          "function allowance(address,address) view returns(uint256)",
        ],
        provider,
      ),
      position = new Contract(
        launch.position,
        ARTIFACTS.GenesisV4Position.abi,
        provider,
      );
    assert.equal(await token.balanceOf(vault.target), u("1200"));
    assert.equal(await token.balanceOf(z), u("300"));
    assert.equal(await token.balanceOf(composerAddress), 0n);
    assert.equal(
      await position.balanceOf(vault.target),
      BigInt(plan.summary.liquidity) / 4n,
    );
    assert.equal(await position.balanceOf(composerAddress), 0n);
    assert.equal(await quote.balanceOf(composerAddress), 0n);
    assert.equal(await quote.allowance(composerAddress, factory.target), 0n);
    assert.equal(await token.allowance(composerAddress, vault.target), 0n);
    assert.ok((await quote.balanceOf(o)) < before);
    const fresh = new LaunchLifecycleClient({ provider }),
      discovered = await fresh.discover({
        registry: registryAddress,
        by: "payer",
        address: o,
      });
    assert.equal(discovered.records[0].id, launch.id);
    const recovered = await fresh.read({
      registry: registryAddress,
      id: launch.id,
    });
    assert.equal(recovered.position, launch.position);
    assert.equal(recovered.links[0].beneficiary, b);
    const history = await client.history({
      registry: registryAddress,
      id: launch.id,
    });
    assert.ok(
      history.events.some(
        (e) =>
          e.name === "LaunchRegistered" && e.transactionHash === record.hash,
      ),
    );
    const wrong = {
      payer: o,
      collection: ZeroAddress,
      tokenId: 0,
      token: launch.token,
      mechanism: mechanismHash("v4"),
      target: factory.target,
      mechanismId: 0,
      position: launch.position,
      poolId: launch.poolId,
      termsHash: launch.termsHash,
    };
    await assert.rejects(registry.register(wrong, []));
    await assert.rejects(registry.connect(other).register(wrong, []));
    await assert.rejects(registry.connect(other).append(launch.id, []));
    const badDraft = { ...base, salt: toBeHex(802, 32) },
      goodPlan = await client.compose({
        composer: composerAddress,
        draft: badDraft,
        allocations: [],
      }),
      decoded = composer.interface.decodeFunctionData(
        "compose",
        goodPlan.request.data,
      ),
      terms = Array.from(decoded[0]);
    await send(quote.approve(composerAddress, u("10000")));
    const predicted = await factory.predict(terms, composerAddress),
      count = await registry.count(),
      balance = await quote.balanceOf(o);
    await assert.rejects(
      send(
        composer.compose(
          terms,
          ZeroAddress,
          [[0, b, u("1"), 1, 1, 2, true]],
          ZeroAddress,
          0,
          { gasLimit: 15_000_000 },
        ),
      ),
    );
    assert.equal(await registry.count(), count);
    assert.equal(await provider.getCode(predicted[0]), "0x");
    assert.equal(await quote.balanceOf(o), balance);
    chain.invalidate();
    await provider.send("evm_increaseTime", [600 + 86400]);
    await provider.send("evm_mine", []);
    await send(vault.connect(other).release(1));
    await send(vault.connect(other).release(2));
    assert.equal(await token.balanceOf(b), u("1200"));
    assert.equal(
      await position.balanceOf(b),
      BigInt(plan.summary.liquidity) / 4n,
    );
    const hp = await hookDeployPlan(
      provider,
      chain.config,
      { owner: o, recipient: b, viaSplitter: false, feePpm: 10000 },
      o,
    );
    await send(owner.sendTransaction(hp.request));
    const hook = hp.predictedAddress;
    const hooked = await execute(
      await client.compose({
        composer: composerAddress,
        draft: {
          ...base,
          salt: toBeHex(803, 32),
          creatorHook: true,
          hook,
          expectedHookOwner: o,
        },
        allocations: [],
      }),
    );
    assert.equal(hooked.launchRecord.mechanism, "v4-hook");
    assert.equal(await registry.count(), 2n);
    await execute(
      await client.authorize({
        registry: registryAddress,
        composer: composerAddress,
        allowed: false,
      }),
    );
    await assert.rejects(
      client.compose({
        composer: composerAddress,
        draft: { ...base, salt: toBeHex(804, 32) },
      }),
      /Authorize/,
    );
    const pool = await readPoolLaunch(provider, {
      position: launch.position,
      chainId: 31337,
      account: o,
    });
    assert.equal(pool.poolId, launch.poolId);
    assert.ok(BigInt(pool.shares) > 0n);
    const participant = new LaunchParticipant({
      chain,
      baseURL: "https://anima.example/",
    });
    participant.open({
      kind: "pool",
      chainId: 31337,
      contract: launch.position,
    });
    await participant.refresh();
    assert.match(participant.render(), /Get real quote/);
    participant.values.amount = "1";
    participant.values.router = router.target;
    participant.values.quoter = quoter.target;
    await execute(await participant.prepare("pool:swap"));
    const readonly = new LaunchParticipant({
      chain: new LaunchChain({ storage: null }),
    });
    readonly.open({
      kind: "record",
      chainId: 31337,
      contract: registryAddress,
      id: launch.id,
    });
    await readonly.useReadProvider(provider);
    assert.match(readonly.render(), /Permanent launch provenance/);
    assert.match(readonly.render(), /Open this launch/);
    readonly.destroy();
    const account = await deploy(compiled["LifecycleFixture.sol"].EpochAccount);
    await send(collection.bind(1, account.target));
    await send(
      account.callTarget(
        registryAddress,
        registry.interface.encodeFunctionData("authorizeRegistrar", [o, true]),
      ),
    );
    assert.equal(await registry.authorizedRegistrar(account.target, o), true);
    await send(account.changeOwner(b));
    assert.equal(await registry.authorizedRegistrar(account.target, o), false);
    await assert.rejects(
      registry.register(
        {
          ...wrong,
          payer: account.target,
          collection: collection.target,
          tokenId: 1,
        },
        [],
      ),
    );
    const directPlan = await launchPlan(
      provider,
      chain.config,
      { ...base, salt: toBeHex(880, 32) },
      o,
    );
    await send(quote.approve(factory.target, directPlan.spend[0].amount));
    await send(owner.sendTransaction(directPlan.request));
    const registered = await execute(
      await client.registerObserved({
        registry: registryAddress,
        kind: "v4",
        target: directPlan.summary.position,
      }),
    );
    assert.equal(registered.launchRecord.payer, o);
    assert.equal(registered.launchRecord.position, directPlan.summary.position);
    assert.equal(registered.launchRecord.links[0].kind, "source-transaction");
    const studio = {
      ...defaults(),
      ...base,
      quoteDecimals: "18",
      quoteSymbol: "QUOTE",
      feePercent: "0.30",
      funding: "public",
      range: "custom",
      lowerPrice: ".5",
      upperPrice: "2",
    };
    const mapped = await mainDraftToLifecycle(chain, studio);
    assert.equal(mapped.fee, 3000);
    assert.deepEqual(mapped.range, { lower: ".5", upper: "2" });
    assert.equal(mapped.quoteToken, quote.target);
    await assert.rejects(
      mainDraftToLifecycle(chain, { ...studio, funding: "private" }),
      /shielded/,
    );
    await assert.rejects(
      mainDraftToLifecycle(chain, { ...studio, mode: "sale" }),
      /community/,
    );
    await assert.rejects(
      mainDraftToLifecycle(chain, { ...studio, quoteDecimals: "6" }),
      /actual units/,
    );
    const split = await deploy(HOOK_ARTIFACTS.OwnerFeeRouter, [o, [b], [1]]),
      hookContract = new Contract(
        hook,
        HOOK_ARTIFACTS.OwnerV4FeeHook.abi,
        owner,
      );
    await send(hookContract.configure(10000, split.target, true));
    await chain.configure({ hook, splitter: split.target });
    const hookedDraft = {
      ...studio,
      hookEnabled: true,
      hookPercent: "1",
      recipients: [{ recipient: b, weight: "1" }],
    };
    const hookMapped = await mainDraftToLifecycle(chain, hookedDraft);
    assert.equal(hookMapped.expectedHookOwner, o);
    assert.deepEqual(hookMapped.expectedSplitRecipients, [b]);
    await assert.rejects(
      mainDraftToLifecycle(chain, {
        ...hookedDraft,
        recipients: [{ recipient: z, weight: "1" }],
      }),
      /weights differ/,
    );
    const desk = new LaunchLifecycleDesk({ chain });
    desk.configure({
      registry: registryAddress,
      composer: composerAddress,
      vault: vault.target,
    });
    desk.record = await client.read({
      registry: registryAddress,
      id: launch.id,
    });
    assert.match(desk.render(), /One atomic launch/);
    assert.match(desk.render(), /permanent record/i);
    assert.match(desk.render(), /launch\/pool/);
  },
);
