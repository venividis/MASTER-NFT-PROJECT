import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  JsonRpcProvider,
  ContractFactory,
  Contract,
  parseUnits,
  keccak256,
  toUtf8Bytes,
} from "../../web/vendor/ethers.min.js";
import { deployStack } from "../../scripts/lib/deploy-stack.mjs";
import { LaunchChain } from "../../web/launchpad/chain.mjs";
import { CommunitySaleClient } from "../../web/launchpad/sale-client.mjs";
import {
  LaunchLifecycleClient,
  verifyLifecycleReceipt,
} from "../../web/launchpad/lifecycle-client.mjs";
import {
  auctionDeployPlan,
  auctionFundPlan,
  auctionActionPlan,
  prepareAuctionOperation,
  verifyNFTAuctionReceipt,
  inspectAuction,
} from "../../web/launchpad/auction-client.mjs";
import { LaunchParticipant } from "../../web/launchpad/participant.mjs";
import { LaunchLifecycleDesk } from "../../web/launchpad/lifecycle.mjs";
import { SALE_ARTIFACTS } from "../../web/launchpad/sale-artifacts.mjs";
import { AUCTION_ARTIFACT } from "../../web/launchpad/auction-artifacts.mjs";
const root = path.resolve(import.meta.dirname, "../.."),
  v4 = path.join(root, "integrations/console/protocol/v4-hook"),
  u = (x) => parseUnits(String(x), 18);

test(
  "actual minted NFT accounts own community-sale allocations and auction seller/bid/claim rights; transfer invalidates stale reviews",
  { timeout: 180000 },
  async (t) => {
    const port = 25157,
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
      buyer = await provider.getSigner(1),
      o = await owner.getAddress(),
      b = await buyer.getAddress(),
      send = async (p) => (await p).wait(),
      deploy = async (a, args = []) => {
        const c = await new ContractFactory(a.abi, a.bytecode, owner).deploy(
          ...args,
        );
        await c.waitForDeployment();
        return c;
      };
    const stack = await deployStack({
        signer: owner,
        attesterAddress: o,
        royaltyBps: 0,
      }),
      collection = stack.collection;
    for (const n of [1, 2]) {
      const secret = keccak256(toUtf8Bytes("actual-nft-sale-auction-" + n));
      await send(
        collection.commitAwakening(
          await collection.commitmentFor(o, secret, o),
        ),
      );
      await provider.send("evm_mine", []);
      await provider.send("evm_mine", []);
      await send(collection.revealAwakening(secret, o));
    }
    const seller = await collection.accountOf(1),
      bidder = await collection.accountOf(2);
    await send(owner.sendTransaction({ to: seller, value: u(20) }));
    await send(owner.sendTransaction({ to: bidder, value: u(5) }));
    class Wallet extends EventEmitter {
      constructor(address) {
        super();
        this.address = address;
      }
      async request({ method, params = [] }) {
        if (method === "eth_requestAccounts" || method === "eth_accounts")
          return [this.address];
        return provider.send(method, params);
      }
    }
    chain = new LaunchChain({
      storage: null,
      pollInterval: 10,
      receiptTimeout: 5000,
    });
    await chain.connect(new Wallet(o));
    const lifecycle = new LaunchLifecycleClient(chain),
      lifecycleDesk = new LaunchLifecycleDesk({ chain }),
      client = new CommunitySaleClient(chain);
    const execute = async (plan) => {
      let r;
      do {
        await chain.reviewNext();
        r = await chain.sendReviewed();
        assert.equal(r.status, "confirmed");
        if (r.final) {
          const receipt = await provider.getTransactionReceipt(r.hash);
          await verifyLifecycleReceipt(provider, r, receipt);
          await verifyNFTAuctionReceipt(provider, r, receipt);
          if (r.kind.startsWith("lifecycle-"))
            await lifecycleDesk.applyReceipt(r);
        }
      } while (chain.plan);
      return r;
    };
    const ledger = (
        await execute(
          await client.setup({ kind: "ledger", collection: collection.target }),
        )
      ).contractAddress,
      modules = {};
    for (const kind of ["market", "vault", "launchpad"])
      modules[kind] = (
        await execute(await client.setup({ kind, ledger }))
      ).contractAddress;
    await execute(await client.setup({ kind: "seal", ledger, ...modules }));
    const auctionFactory = (
        await execute(await lifecycle.setup({ kind: "auction-factory" }))
      ).contractAddress,
      config = { chainId: 31337, auctionFactory };
    assert.equal(chain.config.auctionFactory, auctionFactory);
    assert.equal(lifecycleDesk.values.auctionFactory, auctionFactory);
    await chain.useNFT({ collection: collection.target, tokenId: 1 });
    let now = (await provider.getBlock("latest")).timestamp;
    const created = await execute(
      await client.create({
        launchpad: modules.launchpad,
        name: "NFT community",
        symbol: "NCOM",
        about: "NFT-owned community launch",
        supply: "1000000",
        softCap: "2",
        hardCap: "10",
        founderBps: 1000,
        liquidityBps: 8000,
        vestingDays: 180,
        opens: now + 600,
        closes: now + 4600,
      }),
    );
    assert.equal(created.execution.payer, seller);
    const launch = new Contract(
        modules.launchpad,
        SALE_ARTIFACTS.GenesisLaunchpad.abi,
        provider,
      ),
      saleInfo = await client.read({ launchpad: modules.launchpad, id: "1" });
    assert.equal(saleInfo.creator, seller);
    await provider.send("evm_increaseTime", [601]);
    await provider.send("evm_mine", []);
    await execute(
      await client.contribute({
        launchpad: modules.launchpad,
        id: "1",
        amount: "3",
      }),
    );
    await execute(
      await client.withdraw({
        launchpad: modules.launchpad,
        id: "1",
        amount: ".5",
      }),
    );
    assert.equal(await launch.contribution(1, seller), u("2.5"));
    assert.equal(await launch.contribution(1, o), 0n);
    await provider.send("evm_increaseTime", [4001]);
    await provider.send("evm_mine", []);
    await execute(
      await client.settle({ launchpad: modules.launchpad, id: "1" }),
    );
    await execute(
      await client.claim({ launchpad: modules.launchpad, id: "1" }),
    );
    const sale = await client.read({ launchpad: modules.launchpad, id: "1" });
    assert.equal(sale.founderLock.beneficiary, seller);
    assert.equal(sale.treasuryLock.beneficiary, seller);
    const token = new Contract(
      sale.token,
      [
        "function balanceOf(address)view returns(uint256)",
        "function allowance(address,address)view returns(uint256)",
      ],
      provider,
    );
    assert.equal(await token.balanceOf(seller), u("500000"));
    assert.equal(await token.balanceOf(o), 0n);
    const start = BigInt(await provider.getBlockNumber()) + 40n,
      end = start + 40n,
      plan = await auctionDeployPlan(
        provider,
        config,
        {
          saleToken: sale.token,
          lotSize: "100",
          totalLots: "10",
          reservePrice: ".1",
          startBlock: start,
          endBlock: end,
          salt: keccak256(toUtf8Bytes("NFT sale one")),
        },
        seller,
      );
    assert.equal(plan.kind, "auction-create");
    await assert.rejects(
      prepareAuctionOperation(chain, { ...plan, kind: "auction-claimTokens" }),
      /runtime|calldata|bytecode/,
    );
    const deployed = await execute(await prepareAuctionOperation(chain, plan)),
      auction = deployed.contractAddress;
    assert.equal(
      (
        await inspectAuction(provider, { auction, owner: seller })
      ).state.seller.toLowerCase(),
      seller.toLowerCase(),
    );
    const fund = await auctionFundPlan(provider, config, { auction }, seller);
    await execute(await prepareAuctionOperation(chain, fund));
    assert.equal(await token.allowance(seller, auction), 0n);
    assert.equal(
      (await inspectAuction(provider, { auction, owner: seller })).funded,
      true,
    );
    const page = new LaunchParticipant({ chain });
    page.open({ kind: "auction", chainId: 31337, contract: auction });
    assert.equal(
      chain.payer,
      o,
      "Participant opens with explicit wallet funding, not inherited NFT custody",
    );
    page.values.nftCollection = collection.target;
    page.values.nftId = "2";
    await page.act("use-nft");
    assert.equal(chain.payer, bidder);
    assert.match(page.render(), /Selling the NFT transfers/);
    while (BigInt(await provider.getBlockNumber()) < start + 1n)
      await provider.send("evm_mine", []);
    await page.refresh();
    page.values.lots = "2";
    page.values.limitPrice = ".2";
    await page.prepare("auction:bid");
    await page.act("review");
    await send(collection.transferFrom(o, b, 2));
    await assert.rejects(page.act("send"), /ownership|owner|epoch/i);
    await page.connect(new Wallet(b));
    page.values.nftCollection = collection.target;
    page.values.nftId = "2";
    await page.act("use-nft");
    await page.prepare("auction:bid");
    await execute(chain.plan);
    const a = new Contract(auction, AUCTION_ARTIFACT.abi, provider);
    assert.equal(
      (await inspectAuction(provider, { auction, owner: bidder })).ownBids
        .length,
      1,
    );
    while (BigInt(await provider.getBlockNumber()) < end + 1n)
      await provider.send("evm_mine", []);
    await page.refresh();
    await execute(await page.prepare("auction:checkpoint"));
    await execute(await page.prepare("auction:claimTokens"));
    assert.equal(await token.balanceOf(bidder), u("200"));
    assert.equal(await token.balanceOf(b), 0n);
    if (
      (await inspectAuction(provider, { auction, owner: bidder })).claims
        .refund !== "0"
    )
      await execute(await page.prepare("auction:claimRefund"));
    assert.equal(await a.refunds(bidder), 0n);
    await chain.connect(new Wallet(o));
    await chain.useNFT({ collection: collection.target, tokenId: 1 });
    await execute(
      await prepareAuctionOperation(
        chain,
        await auctionActionPlan(
          provider,
          config,
          { auction, action: "claimProceeds" },
          seller,
        ),
      ),
    );
    assert.equal(await a.sellerCredit(), 0n);
    assert.equal(
      (await inspectAuction(provider, { auction, owner: seller })).claims
        .proceeds,
      "0",
    );
    const epochPlan = await client.create({
      launchpad: modules.launchpad,
      name: "Stale NFT sale",
      symbol: "STALE",
      supply: "1000",
      softCap: "2",
      hardCap: "3",
      founderBps: 0,
      liquidityBps: 10000,
      vestingDays: 180,
      opens: (await provider.getBlock("latest")).timestamp + 600,
      closes: (await provider.getBlock("latest")).timestamp + 4600,
    });
    await chain.reviewNext();
    await send(collection.transferFrom(o, b, 1));
    await assert.rejects(chain.sendReviewed(), /ownership|owner|epoch/i);
    assert.equal(await launch.launchCount(), 1n);
    page.destroy();
  },
);
