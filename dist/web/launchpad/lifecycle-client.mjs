import {
  Contract,
  ContractFactory,
  Interface,
  getAddress,
  getCreateAddress,
  keccak256,
  toUtf8Bytes,
  AbiCoder,
  ZeroAddress,
  ZeroHash,
  parseUnits,
  hexlify,
  randomBytes,
} from "../vendor/ethers.min.js";
import { ARTIFACTS as V4_ARTIFACTS } from "../v4/artifacts.mjs";
import { SALE_ARTIFACTS } from "./sale-artifacts.mjs";
import { AUCTION_ARTIFACT } from "./auction-artifacts.mjs";
import { LIFECYCLE_ARTIFACTS } from "./lifecycle-artifacts.mjs";
import { normalizeRuntime, launchPlan, verifyContract } from "../v4/client.mjs";
import { verifyHookContract, inspectHook } from "./hook-client.mjs";
import { rate, validateIdentity } from "./model.mjs";
import { VaultStrategyClient } from "./vault-client.mjs";
import { readCommunitySale } from "./sale-client.mjs";
import { inspectAuction } from "./auction-client.mjs";
import { readPoolLaunch } from "./pool-participant.mjs";

export const mechanismHash = (name) => keccak256(toUtf8Bytes(name));
export const MECHANISMS = [
  "v4",
  "v4-hook",
  "community",
  "auction",
  "official-cca",
  "official-doppler",
];
const stringify = (x) =>
  JSON.stringify(x, (_, v) => (typeof v === "bigint" ? String(v) : v));
const payer = (c) => getAddress(c.payer || c.address);
const same = (a, b) => getAddress(a) === getAddress(b);
const positiveId = (x) => {
  if (!/^[1-9]\d*$/.test(String(x))) throw Error("Use a positive record ID.");
  return BigInt(x);
};
const page = (offset, limit) => {
  offset = Number(offset);
  limit = Number(limit);
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 32
  )
    throw Error("Use a nonnegative offset and a page size from 1 to 32.");
  return { offset, limit };
};
export async function verifyLifecycleContract(
  provider,
  address,
  name,
  block = "latest",
) {
  const a = LIFECYCLE_ARTIFACTS[name];
  if (!a) throw Error("Unknown lifecycle contract.");
  address = getAddress(address);
  if (
    normalizeRuntime(await provider.getCode(address, block), a) !==
    a.normalizedHash
  )
    throw Error(`${name} runtime differs from this release.`);
  return new Contract(address, a.abi, provider);
}
function unpackRecord(id, r) {
  const d = r.descriptor;
  return {
    id: String(id),
    payer: d.payer,
    collection: d.collection,
    tokenId: String(d.tokenId),
    token: d.token,
    mechanism:
      MECHANISMS.find((x) => mechanismHash(x) === d.mechanism) || d.mechanism,
    mechanismHash: d.mechanism,
    target: d.target,
    mechanismId: String(d.mechanismId),
    position: d.position,
    poolId: d.poolId,
    termsHash: d.termsHash,
    registrar: r.registrar,
    createdAt: Number(r.createdAt),
    createdBlock: Number(r.createdBlock),
  };
}
function unpackLink(l, index) {
  return {
    index,
    kind:
      [
        "allocation",
        "vesting",
        "fee-policy",
        "exit",
        "settlement",
        "protocol",
        "source-transaction",
        "pool",
      ].find((x) => mechanismHash(x) === l.kind) || l.kind,
    target: l.target,
    referenceId: String(l.referenceId),
    asset: l.asset,
    beneficiary: l.beneficiary,
    amount: String(l.amount),
    detail: l.detail,
  };
}
export async function readLaunchRecord(
  provider,
  { registry, id, blockTag = "latest" },
) {
  const block = await provider.getBlock(blockTag);
  if (!block?.hash) throw Error("Record block is unavailable.");
  const contract = await verifyLifecycleContract(
      provider,
      registry,
      "LaunchRegistry",
      block.number,
    ),
    at = { blockTag: block.number },
    record = unpackRecord(id, await contract.get(positiveId(id), at)),
    count = Number(await contract.linkCount(id, at));
  if (count > 256) throw Error("Record exceeds the verified registry bounds.");
  const links = [];
  for (let i = 0; i < count; i++)
    links.push(unpackLink(await contract.linkAt(id, i, at), i));
  if ((await provider.getBlock(block.number))?.hash !== block.hash)
    throw Error("Record block changed. Refresh.");
  return {
    ...record,
    registry: contract.target,
    chainId: Number((await provider.getNetwork()).chainId),
    links,
    blockNumber: block.number,
    blockHash: block.hash,
    provenance: same(record.registrar, record.payer)
      ? "Payer-authored observation; verify the underlying mechanism."
      : "Recorded by a registrar explicitly authorized by the payer; verify registrar and mechanism.",
  };
}
async function contractBirth(provider, address, tip) {
  let lo = 0,
    hi = tip;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await provider.getCode(address, mid)) === "0x") lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
export class LaunchLifecycleClient {
  constructor(chain) {
    this.chain = chain;
  }
  async context() {
    const generation = this.chain.generation;
    await this.chain.assertContext(generation);
    const provider = this.chain.provider,
      account = payer(this.chain),
      block = await provider.getBlock("latest");
    if (!block?.hash) throw Error("Current block unavailable.");
    return {
      generation,
      provider,
      account,
      block,
      chainId: Number(this.chain.chainId),
    };
  }
  async assert(c) {
    await this.chain.assertContext(c.generation);
    if (
      c.provider !== this.chain.provider ||
      !same(c.account, payer(this.chain)) ||
      (await c.provider.getBlock(c.block.number))?.hash !== c.block.hash
    )
      throw Error("Funding identity or chain state changed. Prepare again.");
  }
  async prepare(c, plan) {
    await this.assert(c);
    return this.chain.prepareExternal(
      {
        ...plan,
        payer: c.account,
        chainId: c.chainId,
        deadline: plan.deadline ?? c.block.timestamp + 900,
      },
      { nftCompatible: true },
    );
  }
  async setup({
    kind,
    registry,
    vault,
    factory = this.chain.config.factory,
    hookFactory = this.chain.config.hookFactory || ZeroAddress,
  }) {
    const c = await this.context();
    if (this.chain.nftSession)
      throw Error("Select wallet funding for infrastructure deployment.");
    const name =
      kind === "registry"
        ? "LaunchRegistry"
        : kind === "composer"
          ? "LaunchAllocationComposer"
          : kind === "auction-factory"
            ? "NFTAuctionFactory"
            : null;
    if (!name)
      throw Error("Choose registry, composer or NFT auction factory setup.");
    let args = [];
    if (kind === "composer") {
      await verifyLifecycleContract(
        c.provider,
        registry,
        "LaunchRegistry",
        c.block.number,
      );
      await new VaultStrategyClient(this.chain).verify(vault);
      await verifyContract(
        c.provider,
        factory,
        "GenesisV4Launchpad",
        this.chain.config.manager,
      );
      if (hookFactory !== ZeroAddress)
        await verifyHookContract(
          c.provider,
          hookFactory,
          "GenesisV4HookLaunchpad",
          { manager: this.chain.config.manager },
        );
      args = [
        getAddress(registry),
        getAddress(vault),
        getAddress(factory),
        getAddress(hookFactory),
      ];
    }
    const a = LIFECYCLE_ARTIFACTS[name];
    if (keccak256(a.bytecode) !== a.creationHash)
      throw Error("Deployment artifact integrity failed.");
    const nonce = await c.provider.getTransactionCount(c.account, "pending"),
      predictedAddress = getCreateAddress({ from: c.account, nonce }),
      request = await new ContractFactory(
        a.abi,
        a.bytecode,
      ).getDeployTransaction(...args);
    return this.prepare(c, {
      kind: "lifecycle-setup",
      purpose:
        "Deploy " +
        (kind === "registry"
          ? "the immutable launch registry"
          : kind === "composer"
            ? "atomic launch allocations"
            : "the NFT-compatible auction factory"),
      request: { data: request.data, value: 0n, nonce },
      spend: [],
      summary: {
        contract: name,
        predictedAddress,
        ...(kind === "composer"
          ? { registry, vault, factory, hookFactory }
          : {}),
        rights:
          "Immutable dependencies. Each payer separately authorizes record creation.",
      },
      meta: { contractName: name, predictedAddress, args },
    });
  }
  async authorize({ registry, composer, allowed = true }) {
    const c = await this.context(),
      r = await verifyLifecycleContract(
        c.provider,
        registry,
        "LaunchRegistry",
        c.block.number,
      ),
      o = await verifyLifecycleContract(
        c.provider,
        composer,
        "LaunchAllocationComposer",
        c.block.number,
      );
    if (!same(await o.registry(), registry))
      throw Error("Composer points to another registry.");
    return this.prepare(c, {
      kind: "lifecycle-authorization",
      purpose: allowed
        ? "Authorize this composer to record your launches"
        : "Revoke this composer’s registry authorization",
      request: {
        to: r.target,
        data: r.interface.encodeFunctionData("authorizeRegistrar", [
          o.target,
          Boolean(allowed),
        ]),
        value: 0n,
      },
      spend: [],
      summary: {
        registry,
        composer,
        payer: c.account,
        allowed: Boolean(allowed),
        rights:
          "Registrar may add public records and links attributed to this payer. This permission never transfers assets; revoke it independently.",
      },
      meta: { registry, composer },
    });
  }
  async discover({
    registry,
    address,
    by = "payer",
    offset = 0,
    limit = 12,
    provider = this.chain.provider,
  }) {
    const p = page(offset, limit),
      block = await provider.getBlock("latest"),
      r = await verifyLifecycleContract(
        provider,
        registry,
        "LaunchRegistry",
        block.number,
      ),
      at = { blockTag: block.number };
    if (!["payer", "token", "all"].includes(by))
      throw Error("Choose payer, token or all records.");
    if (by !== "all") address = getAddress(address || payer(this.chain));
    const count =
        by === "all" ? await r.count(at) : await r[by + "Count"](address, at),
      end = Math.min(Number(count), p.offset + p.limit),
      records = [];
    for (let i = p.offset; i < end; i++) {
      const id =
        by === "all" ? BigInt(i + 1) : await r[by + "At"](address, i, at);
      records.push(unpackRecord(id, await r.get(id, at)));
    }
    if ((await provider.getBlock(block.number))?.hash !== block.hash)
      throw Error("Discovery block changed. Refresh.");
    return {
      registry: r.target,
      chainId: Number((await provider.getNetwork()).chainId),
      total: String(count),
      records,
      next: end < Number(count) ? end : null,
      blockNumber: block.number,
      blockHash: block.hash,
    };
  }
  read(input) {
    return readLaunchRecord(input.provider || this.chain.provider, input);
  }
  async register({ registry, descriptor, links = [] }) {
    const c = await this.context(),
      r = await verifyLifecycleContract(
        c.provider,
        registry,
        "LaunchRegistry",
        c.block.number,
      );
    if (descriptor.payer && !same(descriptor.payer, c.account))
      throw Error("Register only the currently selected payer’s record.");
    const execution = this.chain.execution;
    const d = {
      payer: c.account,
      collection: execution.mode === "nft" ? execution.collection : ZeroAddress,
      tokenId: execution.mode === "nft" ? execution.tokenId : 0,
      token: getAddress(descriptor.token),
      mechanism: /^0x[0-9a-f]{64}$/i.test(descriptor.mechanism)
        ? descriptor.mechanism
        : mechanismHash(descriptor.mechanism),
      target: getAddress(descriptor.target),
      mechanismId: BigInt(descriptor.mechanismId || 0),
      position: getAddress(descriptor.position || ZeroAddress),
      poolId: descriptor.poolId || ZeroHash,
      termsHash: descriptor.termsHash,
    };
    if (!/^0x[0-9a-f]{64}$/i.test(d.termsHash) || d.termsHash === ZeroHash)
      throw Error("Provide the exact source terms commitment.");
    const normalized = links.map((l) => ({
      kind: mechanismHash(l.kind),
      target: getAddress(l.target || ZeroAddress),
      referenceId: BigInt(l.referenceId || 0),
      asset: getAddress(l.asset || ZeroAddress),
      beneficiary: getAddress(l.beneficiary || ZeroAddress),
      amount: BigInt(l.amount || 0),
      detail: l.detail || ZeroHash,
    }));
    return this.prepare(c, {
      kind: "lifecycle-register",
      purpose: "Publish the permanent launch record",
      request: {
        to: r.target,
        data: r.interface.encodeFunctionData("register", [d, normalized]),
        value: 0n,
      },
      spend: [],
      summary: {
        ...d,
        mechanism: descriptor.mechanism,
        privacy:
          "This permanently links the selected payer/NFT account to the public launch.",
        provenance:
          "A payer-authored observation. Registration does not certify arbitrary token or protocol behavior.",
      },
      meta: { registry, descriptor: d },
    });
  }
  async registerObserved({ registry, kind, target, id }) {
    const c = await this.context();
    let descriptor,
      links = [];
    if (kind === "community") {
      const s = await readCommunitySale(c.provider, {
        chainId: c.chainId,
        launchpad: target,
        id,
      });
      if (!same(s.creator, c.account))
        throw Error("Only the observed creator can author this launch record.");
      descriptor = {
        token: s.token,
        mechanism: kind,
        target,
        mechanismId: id,
        termsHash: keccak256(
          toUtf8Bytes(
            stringify({
              token: s.token,
              supply: s.supply,
              opens: s.opens,
              closes: s.closes,
              softCap: s.softCap,
              hardCap: s.hardCap,
              publicTokens: s.publicTokens,
              lpTokens: s.lpTokens,
              founderTokens: s.founderTokens,
              liquidityBps: s.liquidityBps,
              vestingSeconds: s.vestingSeconds,
            }),
          ),
        ),
      };
      for (const l of [s.founderLock, s.treasuryLock].filter(Boolean))
        links.push({
          kind: "vesting",
          target: s.vault,
          referenceId: l.id,
          asset: l.asset,
          beneficiary: l.beneficiary,
          amount: l.amount,
          detail: keccak256(toUtf8Bytes(stringify(l))),
        });
    } else if (kind === "auction") {
      const a = await inspectAuction(c.provider, {
        auction: target,
        owner: c.account,
      });
      if (!same(a.state.seller, c.account))
        throw Error("Only the observed seller can author this auction record.");
      descriptor = {
        token: a.token.address,
        mechanism: kind,
        target,
        termsHash: keccak256(
          toUtf8Bytes(
            stringify({
              token: a.token.address,
              seller: a.state.seller,
              totalLots: a.state.totalLots,
              lotSize: a.state.lotSize,
              reservePrice: a.state.reservePrice,
              startBlock: a.state.startBlock,
              endBlock: a.state.endBlock,
            }),
          ),
        ),
      };
    } else if (kind === "v4") {
      const p = await readPoolLaunch(c.provider, {
        position: target,
        chainId: c.chainId,
        account: c.account,
      });
      let lo = 0,
        hi = c.block.number;
      // Find immutable contract creation without a local launch receipt or unbounded log scan.
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if ((await c.provider.getCode(p.position, mid)) === "0x") lo = mid + 1;
        else hi = mid;
      }
      const transfer = new Interface([
          "event Transfer(address indexed from,address indexed to,uint256 amount)",
        ]),
        minted = await c.provider.getLogs({
          address: p.position,
          fromBlock: lo,
          toBlock: lo,
          topics: [transfer.getEvent("Transfer").topicHash, ZeroHash],
        }),
        mints = minted.map((l) => transfer.parseLog(l));
      if (mints.length !== 1 || !same(mints[0].args.to, c.account))
        throw Error(
          "Only the original LP-share recipient can register this direct launch. Holding purchased shares does not prove original funding.",
        );
      const launched = new Interface([
          "event Launched(address indexed token,address indexed position,bytes32 indexed poolId)",
        ]),
        events = await c.provider.getLogs({
          address: p.factory,
          fromBlock: lo,
          toBlock: lo,
          topics: [
            launched.getEvent("Launched").topicHash,
            null,
            "0x" + p.position.slice(2).toLowerCase().padStart(64, "0"),
            p.poolId,
          ],
        });
      if (events.length !== 1)
        throw Error(
          "The original factory launch receipt is unavailable or ambiguous.",
        );
      const event = launched.parseLog(events[0]),
        tx = await c.provider.getTransaction(events[0].transactionHash);
      if (!tx?.data)
        throw Error("The original launch transaction input is unavailable.");
      descriptor = {
        token: event.args.token,
        mechanism: p.hook ? "v4-hook" : "v4",
        target: p.factory,
        position: p.position,
        poolId: p.poolId,
        termsHash: keccak256(tx.data),
      };
      links.push({
        kind: "source-transaction",
        target: tx.to,
        referenceId: lo,
        detail: tx.hash,
      });
    } else
      throw Error(
        "Use the verified mechanism client to supply the descriptor for this strategy.",
      );
    await this.assert(c);
    return this.register({ registry, descriptor, links });
  }
  async append({ registry, id, links }) {
    const c = await this.context(),
      r = await verifyLifecycleContract(
        c.provider,
        registry,
        "LaunchRegistry",
        c.block.number,
      ),
      record = await r.get(positiveId(id));
    if (!same(record.descriptor.payer, c.account))
      throw Error("Select the launch record’s payer before adding links.");
    const normalized = links.map((l) => ({
      kind: mechanismHash(l.kind),
      target: getAddress(l.target || ZeroAddress),
      referenceId: BigInt(l.referenceId || 0),
      asset: getAddress(l.asset || ZeroAddress),
      beneficiary: getAddress(l.beneficiary || ZeroAddress),
      amount: BigInt(l.amount || 0),
      detail: l.detail || ZeroHash,
    }));
    return this.prepare(c, {
      kind: "lifecycle-append",
      purpose: "Append permanent launch lifecycle links",
      request: {
        to: r.target,
        data: r.interface.encodeFunctionData("append", [id, normalized]),
        value: 0n,
      },
      spend: [],
      summary: {
        registry,
        id,
        links: normalized,
        rights:
          "Existing record and links cannot be edited or deleted. Additional links are payer-authored observations.",
      },
      meta: { registry, recordId: String(id) },
    });
  }
  async appendVault({ registry, id, vault, lockId }) {
    const c = await this.context(),
      record = await this.read({ registry, id }),
      lock = await new VaultStrategyClient(this.chain).read({
        vault,
        id: lockId,
      });
    if (!same(record.payer, c.account))
      throw Error("Choose the launch record’s payer before linking custody.");
    if (
      ![record.token, record.position].some(
        (a) => a !== ZeroAddress && same(a, lock.asset),
      )
    )
      throw Error(
        "This vault lock must hold the recorded launch token or liquidity shares.",
      );
    if (
      !same(lock.depositor, c.account) &&
      !same(lock.depositor, record.registrar)
    )
      throw Error(
        "This lock was not funded by the payer or the recorded launch composer.",
      );
    await this.assert(c);
    return this.append({
      registry,
      id,
      links: [
        {
          kind: "vesting",
          target: vault,
          referenceId: lockId,
          asset: lock.asset,
          beneficiary: lock.beneficiary,
          amount: lock.amount,
          detail: keccak256(
            AbiCoder.defaultAbiCoder().encode(
              ["uint64", "uint64", "uint64", "bool"],
              [lock.start, lock.cliff, lock.end, lock.linear],
            ),
          ),
        },
      ],
    });
  }
  async compose({ composer, draft, allocations = [] }) {
    const c = await this.context(),
      o = await verifyLifecycleContract(
        c.provider,
        composer,
        "LaunchAllocationComposer",
        c.block.number,
      ),
      [registry, vault, factory, hookFactory] = await Promise.all([
        o.registry(),
        o.vault(),
        o.factory(),
        o.hookFactory(),
      ]);
    await verifyLifecycleContract(
      c.provider,
      registry,
      "LaunchRegistry",
      c.block.number,
    );
    await new VaultStrategyClient(this.chain).verify(vault);
    const r = new Contract(
      registry,
      LIFECYCLE_ARTIFACTS.LaunchRegistry.abi,
      c.provider,
    );
    if (!(await r.authorizedRegistrar(c.account, o.target)))
      throw Error(
        "Authorize this composer in the registry before preparing the atomic launch.",
      );
    const config = {
        ...this.chain.config,
        chainId: c.chainId,
        factory,
        hookFactory,
      },
      input = {
        ...draft,
        expectedHookOwner: draft.expectedHookOwner || c.account,
      },
      p = await launchPlan(c.provider, config, input, o.target),
      hook = draft.creatorHook
        ? getAddress(draft.hook || config.hook)
        : ZeroAddress;
    if (allocations.length > 32) throw Error("Use at most 32 allocations.");
    const rows = allocations.map((a) => {
      const asset =
        a.asset === "lp" || a.asset === 1
          ? 1
          : a.asset === "token" || a.asset === 0
            ? 0
            : -1;
      if (asset < 0) throw Error("Choose retained tokens or LP shares.");
      const value = String(a.amount ?? "").trim(),
        bps = value.endsWith("%") ? parseUnits(value.slice(0, -1), 2) : null;
      if (bps !== null && (bps <= 0n || bps > 10000n))
        throw Error("Choose a percentage above zero and no greater than 100%.");
      const amount =
          a.rawAmount !== undefined
            ? BigInt(a.rawAmount)
            : bps !== null
              ? ((asset === 0
                  ? p.terms.supply - p.terms.tokenBudget
                  : p.terms.liquidity) *
                  bps) /
                10000n
              : parseUnits(value, 18),
        beneficiary = getAddress(a.beneficiary || c.account),
        start = Number(a.start || 0),
        cliff = Number(a.cliff || 0),
        end = Number(a.end || 0),
        linear = Boolean(a.linear);
      if (
        amount <= 0n ||
        amount >= 1n << 112n ||
        beneficiary === ZeroAddress ||
        same(beneficiary, composer)
      )
        throw Error(
          "Choose a positive uint112 allocation and valid beneficiary.",
        );
      if ([start, cliff, end].some((v) => !Number.isSafeInteger(v) || v < 0))
        throw Error("Use exact UTC timestamps.");
      if (
        end &&
        (start < c.block.timestamp + 60 ||
          cliff < start ||
          end <= start ||
          end < cliff ||
          end > c.block.timestamp + 3650 * 86400 ||
          (!linear && cliff !== end))
      )
        throw Error(
          "Allow at least 60 seconds before vesting starts; use a valid cliff/end within ten years.",
        );
      if (!end && (start || cliff || linear))
        throw Error("Direct allocations have no vesting schedule.");
      return { asset, beneficiary, amount, start, cliff, end, linear };
    });
    const tokenAllocated = rows
        .filter((a) => a.asset === 0)
        .reduce((n, a) => n + a.amount, 0n),
      lpAllocated = rows
        .filter((a) => a.asset === 1)
        .reduce((n, a) => n + a.amount, 0n);
    if (tokenAllocated > p.terms.supply - p.terms.tokenBudget)
      throw Error(
        "Allocate no more than the guaranteed retained-token amount; unused pool seed tokens return to the payer.",
      );
    if (lpAllocated > p.terms.liquidity)
      throw Error("LP allocation exceeds the newly issued liquidity shares.");
    const execution = this.chain.execution,
      collection =
        execution.mode === "nft" ? execution.collection : ZeroAddress,
      tokenId = execution.mode === "nft" ? execution.tokenId : 0;
    const selected = hook === ZeroAddress ? factory : hookFactory,
      termType =
        "tuple(string name,string symbol,uint256 supply,address quoteToken,uint256 tokenBudget,uint256 quoteBudget,uint24 fee,int24 tickSpacing,int24 tickLower,int24 tickUpper,uint160 sqrtPriceX96,uint128 liquidity,uint256 deadline,bytes32 salt)",
      allocationType =
        "tuple(uint8 asset,address beneficiary,uint112 amount,uint64 start,uint64 cliff,uint64 end,bool linear)[]",
      recipeHash = keccak256(
        AbiCoder.defaultAbiCoder().encode(
          ["address", "address", termType, allocationType],
          [selected, hook, p.terms, rows],
        ),
      );
    return this.prepare(c, {
      kind: "lifecycle-compose",
      purpose: "Launch, allocate, vest and record atomically",
      deadline: Math.min(
        p.deadline,
        ...rows.filter((a) => a.end).map((a) => a.start),
      ),
      request: {
        to: o.target,
        data: o.interface.encodeFunctionData("compose", [
          p.terms,
          hook,
          rows,
          collection,
          tokenId,
        ]),
        value: 0n,
      },
      spend: p.spend,
      summary: {
        ...p.summary,
        payer: c.account,
        registry,
        vault,
        composer,
        allocations: rows,
        remaining:
          "All unallocated retained tokens, LP shares and quote refunds return to the selected payer.",
        privacy:
          "Public funding and permanent public provenance. Use the separate shielded launch flow when funding linkage must remain shielded.",
        failure:
          "A failed allocation, vault deposit or registry write reverts the entire launch.",
      },
      meta: {
        registry,
        composer: o.target,
        token: p.summary.token,
        position: p.summary.position,
        recipeHash,
      },
    });
  }
  async history({ registry, id, fromBlock, toBlock, limitBlocks = 2000 }) {
    const record = await this.read({ registry, id }),
      provider = this.chain.provider;
    const sourceLinks = record.links
      .filter((l) => l.kind === "source-transaction")
      .map((l) => Number(l.referenceId));
    const historyAddress =
      record.position !== ZeroAddress
        ? record.position
        : ["auction", "official-cca"].includes(record.mechanism)
          ? record.target
          : record.token;
    const firstBlock = sourceLinks.length
      ? Math.min(record.createdBlock, ...sourceLinks)
      : await contractBirth(provider, historyAddress, record.blockNumber);
    const from = Number(fromBlock ?? firstBlock),
      to = Math.min(
        Number(toBlock ?? record.blockNumber),
        from + Number(limitBlocks) - 1,
      );
    if (
      !Number.isSafeInteger(from) ||
      from < firstBlock ||
      !Number.isSafeInteger(to) ||
      to < from ||
      !Number.isSafeInteger(limitBlocks) ||
      limitBlocks < 1 ||
      limitBlocks > 10000
    )
      throw Error("Choose a bounded launch-history range.");
    const pinned = await provider.getBlock(to),
      r = await verifyLifecycleContract(provider, registry, "LaunchRegistry"),
      topicId = "0x" + BigInt(id).toString(16).padStart(64, "0"),
      filters = [
        {
          scope: "registry",
          filter: {
            address: registry,
            topics: [
              [
                r.interface.getEvent("LaunchRegistered").topicHash,
                r.interface.getEvent("LaunchLinked").topicHash,
              ],
              topicId,
            ],
          },
          iface: r.interface,
        },
      ];
    filters.push({
      scope: "token",
      filter: {
        address: record.token,
        topics: [keccak256(toUtf8Bytes("Transfer(address,address,uint256)"))],
      },
      iface: new Interface([
        "event Transfer(address indexed from,address indexed to,uint256 amount)",
      ]),
    });
    if (record.position !== ZeroAddress) {
      const p = new Contract(
          record.position,
          ["function manager() view returns(address)"],
          provider,
        ),
        manager = await p.manager({ blockTag: to });
      filters.push({
        scope: "position",
        filter: { address: record.position },
        iface: new Interface(V4_ARTIFACTS.GenesisV4Position.abi),
      });
      if (record.poolId !== ZeroHash)
        filters.push({
          scope: "pool",
          filter: { address: manager, topics: [null, record.poolId] },
          iface: new Interface([
            "event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)",
            "event ModifyLiquidity(bytes32 indexed id,address indexed sender,int24 tickLower,int24 tickUpper,int256 liquidityDelta,bytes32 salt)",
            "event Initialize(bytes32 indexed id,address indexed currency0,address indexed currency1,uint24 fee,int24 tickSpacing,address hooks,uint160 sqrtPriceX96,int24 tick)",
          ]),
        });
    } else if (record.mechanism === "community")
      filters.push({
        scope: "mechanism",
        filter: {
          address: record.target,
          topics: [
            null,
            "0x" + BigInt(record.mechanismId).toString(16).padStart(64, "0"),
          ],
        },
        iface: new Interface(SALE_ARTIFACTS.GenesisLaunchpad.abi),
      });
    else if (
      record.mechanism === "auction" ||
      record.mechanism === "official-cca"
    )
      filters.push({
        scope: "mechanism",
        filter: { address: record.target },
        iface:
          record.mechanism === "auction"
            ? new Interface(AUCTION_ARTIFACT.abi)
            : undefined,
      });
    if (record.mechanism === "official-doppler") {
      const iface = new Interface([
        "event Create(address asset,address indexed numeraire,address initializer,address poolOrHook)",
        "event Migrate(address indexed asset,address indexed pool)",
      ]);
      filters.push({
        scope: "mechanism",
        filter: {
          address: record.target,
          topics: [iface.getEvent("Create").topicHash],
        },
        iface,
        accept: (p) =>
          p?.args?.asset?.toLowerCase() === record.token.toLowerCase(),
      });
      filters.push({
        scope: "mechanism",
        filter: {
          address: record.target,
          topics: [
            iface.getEvent("Migrate").topicHash,
            "0x" + record.token.slice(2).toLowerCase().padStart(64, "0"),
          ],
        },
        iface,
      });
      const airlock = new Contract(
          record.target,
          [
            "function getAssetData(address) view returns(address numeraire,address timelock,address governance,address liquidityMigrator,address poolInitializer,address pool,address migrationPool,uint256 numTokensToSell,uint256 totalSupply,address integrator)",
          ],
          provider,
        ),
        asset = await airlock.getAssetData(record.token, { blockTag: to });
      if (asset.pool !== ZeroAddress) {
        const hook = new Contract(
            asset.pool,
            ["function poolManager() view returns(address)"],
            provider,
          ),
          manager = await hook.poolManager({ blockTag: to });
        filters.push({ scope: "launch-hook", filter: { address: asset.pool } });
        if (record.poolId !== ZeroHash)
          filters.push({
            scope: "pool",
            filter: { address: manager, topics: [null, record.poolId] },
          });
      }
    }
    for (const link of record.links.filter(
      (l) => l.kind === "pool" && l.target !== ZeroAddress,
    ))
      filters.push({
        scope: "migrated-pool",
        filter: {
          address: link.target,
          ...(link.detail !== ZeroHash ? { topics: [null, link.detail] } : {}),
        },
      });
    const linkedVaults = [
      ...new Set(
        record.links.filter((l) => l.kind === "vesting").map((l) => l.target),
      ),
    ];
    for (const target of linkedVaults) {
      const ids = record.links
        .filter((l) => l.kind === "vesting" && l.target === target)
        .map(
          (l) => "0x" + BigInt(l.referenceId).toString(16).padStart(64, "0"),
        );
      filters.push({
        scope: "vesting",
        filter: { address: target, topics: [null, ids] },
        iface: new Interface(SALE_ARTIFACTS.TimeVault.abi),
      });
    }
    const results = await Promise.all(
      filters.map(async ({ scope, filter, iface, accept }) => {
        const logs = await provider.getLogs({
          ...filter,
          fromBlock: from,
          toBlock: to,
        });
        return logs.map((e) => {
          let parsed;
          try {
            parsed = iface?.parseLog(e);
          } catch {}
          if (accept && !accept(parsed)) return null;
          return {
            scope,
            name: parsed?.name || "Contract event",
            address: e.address,
            transactionHash: e.transactionHash,
            blockNumber: e.blockNumber,
            blockHash: e.blockHash,
            index: e.index,
            topics: e.topics,
            data: e.data,
            args: parsed ? Array.from(parsed.args) : [],
          };
        });
      }),
    );
    if ((await provider.getBlock(to))?.hash !== pinned.hash)
      throw Error("History block changed. Refresh.");
    const events = results
      .flat()
      .filter(Boolean)
      .sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
    return {
      events,
      fromBlock: from,
      toBlock: to,
      blockHash: pinned.hash,
      next: to < record.blockNumber ? to + 1 : null,
    };
  }
}
export async function verifyLifecycleReceipt(provider, record, receipt) {
  if (!record.final) return;
  if (record.kind === "lifecycle-setup") {
    const address = getAddress(receipt.contractAddress);
    if (!same(address, record.meta.predictedAddress))
      throw Error(
        "Lifecycle deployment address differs from the reviewed nonce.",
      );
    await verifyLifecycleContract(
      provider,
      address,
      record.meta.contractName,
      receipt.blockNumber,
    );
    record.contractAddress = address;
  }
  if (record.kind === "lifecycle-compose") {
    const contract = await verifyLifecycleContract(
        provider,
        record.meta.composer,
        "LaunchAllocationComposer",
        receipt.blockNumber,
      ),
      events = receipt.logs
        .filter((l) => same(l.address, contract.target))
        .map((l) => {
          try {
            return contract.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .filter((e) => e?.name === "Composed");
    if (events.length !== 1)
      throw Error("Expected one atomic composition receipt.");
    const e = events[0];
    if (
      !same(e.args.token, record.meta.token) ||
      !same(e.args.position, record.meta.position) ||
      e.args.recipeHash !== record.meta.recipeHash
    )
      throw Error("Composed launch differs from the reviewed recipe.");
    record.launchRecord = await readLaunchRecord(provider, {
      registry: record.meta.registry,
      id: e.args.recordId,
      blockTag: receipt.blockNumber,
    });
    record.launch = {
      token: e.args.token,
      position: e.args.position,
      poolId: record.launchRecord.poolId,
    };
  }
  if (record.kind === "lifecycle-register") {
    const r = await verifyLifecycleContract(
        provider,
        record.meta.registry,
        "LaunchRegistry",
        receipt.blockNumber,
      ),
      events = receipt.logs
        .filter((l) => same(l.address, r.target))
        .map((l) => {
          try {
            return r.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .filter((e) => e?.name === "LaunchRegistered");
    if (events.length !== 1)
      throw Error("Expected one launch registration event.");
    record.launchRecord = await readLaunchRecord(provider, {
      registry: r.target,
      id: events[0].args.id,
      blockTag: receipt.blockNumber,
    });
  }
}

/** Map the reviewed creator studio to the same atomic lifecycle recipe, without replacing privacy or sale mechanisms. */
export async function mainDraftToLifecycle(chain, studioDraft) {
  const generation = chain.generation,
    d = {
      ...studioDraft,
      recipients: (studioDraft.recipients || []).map((r) => ({ ...r })),
    };
  await chain.assertContext(generation);
  if (d.mode !== "pool")
    throw Error(
      "Atomic v4 allocation uses an instant pool. Complete community sales through their own settlement and registry flow.",
    );
  if (d.funding !== "public")
    throw Error(
      "This composer publishes payer and NFT linkage. Your shielded funding choice stays in the separate private launch flow.",
    );
  validateIdentity(d);
  if (!d.quoteToken)
    throw Error("Choose the actual paired token in launch setup first.");
  const quote = await chain.readToken(d.quoteToken);
  if (
    quote.decimals !== Number(d.quoteDecimals) ||
    quote.symbol !== d.quoteSymbol
  )
    throw Error(
      `The paired contract is ${quote.symbol} with ${quote.decimals} decimals. Update the main launch form and review price and funding in its actual units.`,
    );
  if (!["full", "custom"].includes(d.range))
    throw Error("Choose a full or custom liquidity range.");
  const draft = {
    name: d.name,
    symbol: d.symbol,
    supply: d.supply,
    quoteToken: quote.address,
    tokenBudget: d.tokenBudget,
    quoteBudget: d.quoteBudget,
    price: d.price,
    fee: rate(d.feePercent),
    tickSpacing: Number(d.tickSpacing),
    range:
      d.range === "full"
        ? { mode: "full" }
        : { lower: d.lowerPrice, upper: d.upperPrice },
    salt: hexlify(randomBytes(32)),
    creatorHook: Boolean(d.hookEnabled),
  };
  if (d.hookEnabled) {
    const config = chain.config;
    if (!config.hookFactory || !config.hook)
      throw Error("Deploy and select the creator hook and factory first.");
    const hook = await inspectHook(chain.provider, config, {}),
      fee = rate(d.hookPercent, 999999);
    if (Number(hook.feePpm) !== fee)
      throw Error(
        "The live creator-hook fee differs from the main launch form. Apply the selected fee before continuing.",
      );
    if (!hook.viaSplitter || !hook.splitter)
      throw Error(
        "The main recipient composition requires its live fee splitter.",
      );
    const recipients = d.recipients.map((r) => getAddress(r.recipient)),
      weights = d.recipients.map((r) => BigInt(r.weight));
    if (
      recipients.length !== hook.splitter.recipients.length ||
      weights.some((w) => w <= 0n) ||
      recipients.some((a, i) => !same(a, hook.splitter.recipients[i])) ||
      weights.some((w, i) => w !== BigInt(hook.splitter.weights[i]))
    )
      throw Error(
        "The deployed recipient list or weights differ from the main launch form. Apply those choices before continuing.",
      );
    Object.assign(draft, {
      hookFactory: config.hookFactory,
      hook: hook.hook,
      expectedHookOwner: hook.owner,
      expectedHookFeePpm: String(fee),
      expectedHookRecipient: hook.recipient,
      expectedHookViaSplitter: true,
      expectedSplitRecipients: recipients,
      expectedSplitWeights: weights.map(String),
    });
  }
  await chain.assertContext(generation);
  return draft;
}
