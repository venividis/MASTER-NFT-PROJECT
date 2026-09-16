import {
  Contract,
  ContractFactory,
  getAddress,
  getCreateAddress,
  keccak256,
  parseUnits,
  formatUnits,
  ZeroAddress,
  toUtf8Bytes,
} from "../vendor/ethers.min.js";
import { SALE_ARTIFACTS } from "./sale-artifacts.mjs";

const MAX112 = (1n << 112n) - 1n,
  DAY = 86400;
const same = (a, b) => getAddress(a) === getAddress(b);
const integer = (value, label, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!/^\d+$/.test(String(value)))
    throw Error(`${label} must be a whole number.`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw Error(`${label} is outside its supported range.`);
  return n;
};
const idOf = (value) => {
  if (
    !/^\d+$/.test(String(value)) ||
    BigInt(value) <= 0n ||
    BigInt(value) >= 1n << 256n
  )
    throw Error("Choose a valid sale ID.");
  return BigInt(value);
};
const amount = (value, label) => {
  const n = parseUnits(String(value), 18);
  if (n <= 0n || n > MAX112)
    throw Error(`${label} must be positive and fit uint112.`);
  return n;
};
const raw = (value) => String(value),
  human = (value) => formatUnits(value, 18);

/** Verify this release's executable code at one block, masking only compiler-recorded immutables. */
export async function verifySaleContract(
  provider,
  address,
  name,
  blockTag = "latest",
) {
  address = getAddress(address);
  const artifact = SALE_ARTIFACTS[name];
  if (!artifact) throw Error("Unknown community-sale contract.");
  const runtime = await provider.getCode(address, blockTag);
  if ((runtime.length - 2) / 2 !== artifact.bytes)
    throw Error(`${name} bytecode does not match this release.`);
  // A forged call-site immutable must not be hidden by the normalization mask.
  for (const group of artifact.immutableGroups || []) {
    if (group.length < 2) continue;
    const first = group[0],
      expected = runtime
        .slice(2 + first.start * 2, 2 + (first.start + first.length) * 2)
        .toLowerCase();
    for (const ref of group.slice(1))
      if (
        runtime
          .slice(2 + ref.start * 2, 2 + (ref.start + ref.length) * 2)
          .toLowerCase() !== expected
      )
        throw Error(
          `${name} immutable values are inconsistent across executable code.`,
        );
  }
  let code = runtime.slice(2);
  for (const m of artifact.masks)
    code =
      code.slice(0, m.start * 2) +
      "0".repeat(m.length * 2) +
      code.slice((m.start + m.length) * 2);
  if (keccak256("0x" + code) !== artifact.normalizedHash)
    throw Error(`${name} bytecode does not match this release.`);
  return new Contract(address, artifact.abi, provider);
}

/** Human-unit, unsigned community funding lifecycle. Identity zero makes no NFT ownership claim. */
export class CommunitySaleClient {
  constructor(chain) {
    this.chain = chain;
  }
  async context() {
    const chain = this.chain,
      generation = chain.generation,
      provider = chain.provider,
      account = chain.payer || chain.address;
    await chain.assertContext(generation);
    if (!provider || !account) throw Error("Connect a wallet first.");
    const block = await provider.getBlock("latest");
    if (!block?.hash) throw Error("The current block is unavailable.");
    return {
      generation,
      provider,
      account: getAddress(account),
      chainId: Number(chain.chainId),
      block,
      at: { blockTag: block.number },
    };
  }
  async publicContext(provider, chainId) {
    if (!provider?.getNetwork) throw Error("Choose a read provider first.");
    const actual = (await provider.getNetwork()).chainId;
    if (chainId !== undefined && actual !== BigInt(chainId))
      throw Error(
        "The read provider uses a different chain from this launch link.",
      );
    if (actual > BigInt(Number.MAX_SAFE_INTEGER))
      throw Error("Unsupported chain identifier.");
    const block = await provider.getBlock("latest");
    if (!block?.hash) throw Error("The current block is unavailable.");
    return {
      provider,
      account: null,
      readOnly: true,
      chainId: Number(actual),
      block,
      at: { blockTag: block.number },
    };
  }
  async assert(c) {
    if (c.readOnly) {
      if ((await c.provider.getNetwork()).chainId !== BigInt(c.chainId))
        throw Error("The read provider network changed.");
    } else {
      if (
        this.chain.provider !== c.provider ||
        !this.chain.address ||
        !same(this.chain.payer || this.chain.address, c.account)
      )
        throw Error("Wallet changed during sale preparation.");
      await this.chain.assertContext(c.generation);
    }
    const block = await c.provider.getBlock(c.block.number);
    if (block?.hash !== c.block.hash)
      throw Error("The sale state block changed. Refresh before continuing.");
  }
  async scope(launchpad, c) {
    const launch = await verifySaleContract(
        c.provider,
        launchpad,
        "GenesisLaunchpad",
        c.block.number,
      ),
      ledgerAddress = await launch.ledger(c.at),
      ledger = await verifySaleContract(
        c.provider,
        ledgerAddress,
        "WorldLedger",
        c.block.number,
      );
    const [sealed, installed, marketAddress, vaultAddress, collection] =
      await Promise.all([
        ledger.isSealed(c.at),
        ledger.launchpad(c.at),
        ledger.market(c.at),
        ledger.vault(c.at),
        ledger.collection(c.at),
      ]);
    if (!sealed || !same(installed, launch.target))
      throw Error("Choose the launchpad installed in a sealed Genesis ledger.");
    const [market, vault] = await Promise.all([
      verifySaleContract(
        c.provider,
        marketAddress,
        "NativeMarket",
        c.block.number,
      ),
      verifySaleContract(c.provider, vaultAddress, "TimeVault", c.block.number),
    ]);
    const [marketLedger, vaultLedger] = await Promise.all([
      market.ledger(c.at),
      vault.ledger(c.at),
    ]);
    if (!same(marketLedger, ledger.target) || !same(vaultLedger, ledger.target))
      throw Error("Sale modules belong to another ledger.");
    if (
      collection === ZeroAddress ||
      (await c.provider.getCode(collection, c.block.number)) === "0x"
    )
      throw Error("The ledger collection has no deployed code.");
    return {
      ...c,
      launch,
      ledger,
      market,
      vault,
      collection: getAddress(collection),
    };
  }
  publicScope(c) {
    return {
      launchpad: c.launch.target,
      ledger: c.ledger.target,
      market: c.market.target,
      vault: c.vault.target,
      collection: c.collection,
      marketType: "Genesis native constant-product market",
      chainId: c.chainId,
      blockNumber: c.block.number,
      blockHash: c.block.hash,
      timestamp: c.block.timestamp,
    };
  }
  async verify(launchpad) {
    const c = await this.scope(launchpad, await this.context());
    await this.assert(c);
    return this.publicScope(c);
  }
  async lock(c, id) {
    if (id === 0n) return null;
    const [l, releasable] = await Promise.all([
      c.vault.lockInfo(id, c.at),
      c.vault.releasable(id, c.at),
    ]);
    return {
      id: raw(id),
      depositor: l[0],
      beneficiary: l[1],
      asset: l[2],
      amount: raw(l[3]),
      released: raw(l[4]),
      releasable: raw(releasable),
      start: Number(l[5]),
      cliff: Number(l[6]),
      end: Number(l[7]),
      linear: l[8],
      identity: raw(l[9]),
      formatted: {
        amount: human(l[3]),
        released: human(l[4]),
        releasable: human(releasable),
      },
    };
  }
  async sale(c, value) {
    const id = idOf(value),
      [info, a, about, paid, claimed] = await Promise.all([
        c.launch.launchInfo(id, c.at),
        c.launch.launchAllocation(id, c.at),
        c.launch.description(id, c.at),
        c.account ? c.launch.contribution(id, c.account, c.at) : 0n,
        c.account ? c.launch.claimed(id, c.account, c.at) : false,
      ]);
    if (info[0] === ZeroAddress) throw Error("This sale does not exist.");
    const token = await verifySaleContract(
      c.provider,
      info[0],
      "GenesisToken",
      c.block.number,
    );
    const [name, symbol, founderLock, treasuryLock] = await Promise.all([
      token.name(c.at),
      token.symbol(c.at),
      this.lock(c, a[5]),
      this.lock(c, a[6]),
    ]);
    const status = Number(info[9]),
      raised = info[4],
      now = c.block.timestamp,
      opens = Number(info[7]),
      closes = Number(info[8]);
    const claimable = claimed
      ? 0n
      : status === 3
        ? paid
        : status === 2 && raised > 0n
          ? (paid * a[0]) / raised
          : 0n;
    const phase =
      status === 2
        ? "settled"
        : status === 3
          ? "refundable"
          : now < opens
            ? "scheduled"
            : now >= closes
              ? "awaiting-settlement"
              : "funding";
    return {
      ...this.publicScope(c),
      id: raw(id),
      name,
      symbol,
      about,
      token: info[0],
      creator: info[1],
      identity: raw(info[2]),
      supply: raw(info[3]),
      raised: raw(raised),
      softCap: raw(info[5]),
      hardCap: raw(info[6]),
      opens,
      closes,
      status,
      phase,
      room: raw(info[10]),
      publicTokens: raw(a[0]),
      lpTokens: raw(a[1]),
      founderTokens: raw(a[2]),
      liquidityBps: Number(a[3]),
      vestingSeconds: Number(a[4]),
      vestingDays: Number(a[4]) / DAY,
      founderLock,
      treasuryLock,
      account: c.account,
      personalKnown: !!c.account,
      contribution: c.account ? raw(paid) : null,
      claimed: c.account ? claimed : null,
      claimable: c.account ? raw(claimable) : null,
      claimAsset: status === 3 ? ZeroAddress : info[0],
      contributionPrice:
        raised > 0n ? { native: raw(raised), tokens: raw(a[0]) } : null,
      formatted: {
        supply: human(info[3]),
        raised: human(raised),
        softCap: human(info[5]),
        hardCap: human(info[6]),
        publicTokens: human(a[0]),
        lpTokens: human(a[1]),
        founderTokens: human(a[2]),
        contribution: c.account ? human(paid) : null,
        claimable: c.account ? human(claimable) : null,
      },
      actions: {
        contribute: phase === "funding" && raised < info[6],
        withdraw: status === 1 && now < closes && paid > 0n,
        settle: phase === "awaiting-settlement",
        claim: (status === 2 || status === 3) && claimable > 0n,
      },
    };
  }
  async readPublic({ provider, chainId, launchpad, id }) {
    const c = await this.scope(
        launchpad,
        await this.publicContext(provider, chainId),
      ),
      sale = await this.sale(c, id);
    await this.assert(c);
    return sale;
  }
  async read({ launchpad, id }) {
    const c = await this.scope(launchpad, await this.context()),
      sale = await this.sale(c, id);
    await this.assert(c);
    return sale;
  }
  async list({ launchpad, start = "1", limit = 12 }) {
    const c = await this.scope(launchpad, await this.context()),
      first = idOf(start),
      size = integer(limit, "Page size", 1, 20),
      total = await c.launch.launchCount(c.at),
      end =
        first + BigInt(size) - 1n > total ? total : first + BigInt(size) - 1n;
    const sales =
      first > total
        ? []
        : await Promise.all(
            Array.from({ length: Number(end - first + 1n) }, (_, i) =>
              this.sale(c, first + BigInt(i)),
            ),
          );
    await this.assert(c);
    return {
      ...this.publicScope(c),
      total: raw(total),
      sales,
      next: end < total ? raw(end + 1n) : null,
    };
  }
  async prepare(
    c,
    method,
    args,
    {
      value = 0n,
      kind,
      purpose,
      summary,
      deadline = c.block.timestamp + 900,
      meta = {},
    },
  ) {
    if (
      ![
        "create",
        "contribute",
        "withdrawContribution",
        "settle",
        "claim",
      ].includes(method)
    )
      throw Error("This sale method has no reviewed account recipe.");
    if (method === "contribute" ? BigInt(value) <= 0n : BigInt(value) !== 0n)
      throw Error(
        "Only a contribution may spend native currency through this sale recipe.",
      );
    await this.assert(c);
    return this.chain.prepareExternal(
      {
        kind,
        purpose,
        chainId: c.chainId,
        request: {
          to: c.launch.target,
          data: c.launch.interface.encodeFunctionData(method, args),
          value,
        },
        spend: [],
        deadline,
        meta: { ...this.publicScope(c), ...meta },
        summary: {
          purpose,
          payer: c.account,
          rights:
            "Assets, sale allocations and fixed-beneficiary rights held by an NFT account follow its current owner. Existing external beneficiaries and vesting dates remain fixed.",
          ...summary,
        },
      },
      { nftCompatible: true },
    );
  }
  async create(input) {
    this.chain.invalidate();
    const c = await this.scope(input.launchpad, await this.context());
    const name = String(input.name || "").trim(),
      symbol = String(input.symbol || "").trim(),
      about = String(input.about || "");
    if (
      !name ||
      toUtf8Bytes(name).length > 48 ||
      !symbol ||
      toUtf8Bytes(symbol).length > 10 ||
      toUtf8Bytes(about).length > 1024
    )
      throw Error(
        "Use a name up to 48 bytes, symbol up to 10 bytes, and description up to 1,024 bytes.",
      );
    const supply = amount(input.supply, "Supply"),
      softCap = amount(input.softCap, "Minimum raise"),
      hardCap = amount(input.hardCap, "Maximum raise"),
      founderBps = integer(
        input.founderBps ?? 0,
        "Founder allocation",
        0,
        2000,
      ),
      liquidityBps = integer(
        input.liquidityBps ?? 10000,
        "Liquidity allocation",
        5000,
        10000,
      ),
      vestingDays = integer(input.vestingDays ?? 180, "Vesting days", 30, 1825),
      opens = integer(input.opens ?? 0, "Opening time"),
      closes = integer(input.closes ?? c.block.timestamp + DAY, "Closing time");
    const opening = opens || c.block.timestamp;
    if (supply < 10n ** 18n || softCap < 1_000_000_000n || softCap > hardCap)
      throw Error("Check supply and minimum/maximum raise amounts.");
    if (
      opening < c.block.timestamp ||
      opening > c.block.timestamp + 30 * DAY ||
      closes < opening + 3600 ||
      closes > opening + 30 * DAY
    )
      throw Error(
        "Choose an opening within 30 days and a contribution window of 1 hour to 30 days.",
      );
    const deadline = Math.min(c.block.timestamp + 900, opens || closes - 3600);
    if (deadline <= c.block.timestamp)
      throw Error(
        "Allow time for transaction confirmation before the opening or minimum contribution window. Schedule an opening in the future.",
      );
    const founder = (supply * BigInt(founderBps)) / 10000n,
      publicTokens =
        ((supply - founder) * 10000n) / BigInt(10000 + liquidityBps),
      lpTokens = supply - founder - publicTokens;
    return this.prepare(
      c,
      "create",
      [
        name,
        symbol,
        about,
        supply,
        opens,
        closes,
        softCap,
        hardCap,
        founderBps,
        liquidityBps,
        vestingDays * DAY,
        0,
      ],
      {
        kind: "sale-create",
        purpose: "Create the community raise and its fixed-supply token",
        deadline,
        summary: {
          name,
          symbol,
          supply: human(supply),
          minimumRaise: human(softCap),
          maximumRaise: human(hardCap),
          publicTokens: human(publicTokens),
          lpTokens: human(lpTokens),
          founderTokens: human(founder),
          liquidityBps,
          vestingDays,
          opens: opening,
          closes,
          creator: c.account,
          privacy: "Public native-currency contributions and launch room",
          liquidity:
            "Permanent Genesis market seed; this is not a Uniswap pool",
        },
        meta: { name, symbol },
      },
    );
  }
  async action(input, method) {
    this.chain.invalidate();
    const c = await this.scope(input.launchpad, await this.context()),
      s = await this.sale(c, input.id),
      id = idOf(input.id),
      n = ["contribute", "withdrawContribution"].includes(method)
        ? amount(input.amount, "Contribution")
        : 0n;
    let args,
      purpose,
      kind,
      summary,
      deadline = c.block.timestamp + 900,
      value = 0n;
    if (method === "contribute") {
      if (!s.actions.contribute)
        throw Error("This sale is not accepting contributions.");
      if (BigInt(s.raised) + n > BigInt(s.hardCap))
        throw Error("This contribution exceeds the remaining hard cap.");
      if (
        ((BigInt(s.contribution) + n) * BigInt(s.publicTokens)) /
          BigInt(s.hardCap) ===
        0n
      )
        throw Error("The contribution would receive no token units.");
      args = [id, 0];
      value = n;
      kind = "sale-contribute";
      purpose = "Contribute native currency to the community raise";
      deadline = Math.min(deadline, s.closes);
      summary = {
        amount: human(n),
        refund: "Full recorded contribution if the minimum raise is missed",
        allocation: "Pro-rata at the final raised amount",
      };
    } else if (method === "withdrawContribution") {
      if (!s.actions.withdraw || n > BigInt(s.contribution))
        throw Error("This contribution cannot be withdrawn.");
      const remaining = BigInt(s.contribution) - n;
      if (
        remaining > 0n &&
        (remaining * BigInt(s.publicTokens)) / BigInt(s.hardCap) === 0n
      )
        throw Error("The remaining contribution would receive no token units.");
      args = [id, n, 0];
      kind = "sale-withdraw";
      purpose = "Withdraw part of your open contribution";
      deadline = Math.min(deadline, s.closes);
      summary = { amount: human(n), remaining: human(remaining) };
    } else if (method === "settle") {
      if (!s.actions.settle)
        throw Error(
          "Settlement becomes available after the contribution window closes.",
        );
      args = [id];
      kind = "sale-settle";
      purpose =
        BigInt(s.raised) >= BigInt(s.softCap)
          ? "Settle the raise, seed permanent liquidity and create vesting locks"
          : "Close the unsuccessful raise and enable full refunds";
      summary = {
        raised: s.formatted.raised,
        outcome:
          BigInt(s.raised) >= BigInt(s.softCap) ? "Successful" : "Refundable",
      };
    } else {
      if (!s.actions.claim)
        throw Error(
          "There is no unclaimed token allocation or refund for this wallet.",
        );
      args = [id, 0];
      kind = "sale-claim";
      purpose =
        s.status === 3
          ? "Claim your full native-currency refund"
          : "Claim your purchased tokens";
      summary = {
        amount: s.formatted.claimable,
        asset: s.status === 3 ? "Native currency" : s.symbol,
        recipient: c.account,
      };
    }
    return this.prepare(c, method, args, {
      value,
      kind,
      purpose,
      summary: { saleId: s.id, name: s.name, ...summary },
      deadline,
      meta: { saleId: s.id, token: s.token },
    });
  }
  contribute(input) {
    return this.action(input, "contribute");
  }
  withdraw(input) {
    return this.action(input, "withdrawContribution");
  }
  settle(input) {
    return this.action(input, "settle");
  }
  claim(input) {
    return this.action(input, "claim");
  }
  async release({ launchpad, id, lock }) {
    this.chain.invalidate();
    const c = await this.scope(launchpad, await this.context()),
      s = await this.sale(c, id);
    if (!["founder", "treasury"].includes(lock))
      throw Error(
        "Choose the founder or treasury lock belonging to this sale.",
      );
    const chosen = s[lock + "Lock"];
    if (!chosen || BigInt(chosen.releasable) === 0n)
      throw Error("Nothing has vested for release from this sale lock yet.");
    await this.assert(c);
    const purpose =
      lock === "founder"
        ? "Release vested founder tokens to their committed beneficiary"
        : "Release the matured treasury to its committed beneficiary";
    return this.chain.prepareExternal(
      {
        kind: "sale-release",
        purpose,
        chainId: c.chainId,
        request: {
          to: c.vault.target,
          data: c.vault.interface.encodeFunctionData("release", [chosen.id]),
          value: 0n,
        },
        spend: [],
        deadline: c.block.timestamp + 900,
        summary: {
          purpose,
          saleId: s.id,
          lockId: chosen.id,
          recipient: chosen.beneficiary,
          amount: chosen.formatted.releasable,
          asset: lock === "founder" ? s.symbol : "Native currency",
          effect:
            "Anyone may trigger release; the recipient and vesting dates cannot change",
        },
        meta: { ...this.publicScope(c), saleId: s.id, lock, lockId: chosen.id },
      },
      { nftCompatible: true },
    );
  }
  /** Optional real infrastructure setup, one reviewed transaction at a time. No addresses are invented. */
  async setup(input) {
    if (this.chain.nftSession)
      throw Error(
        "Select wallet funding to deploy or seal shared sale infrastructure.",
      );
    this.chain.invalidate();
    const c = await this.context();
    let name, args, request, summary;
    if (input.kind === "ledger") {
      const collection = getAddress(input.collection);
      if ((await c.provider.getCode(collection, c.block.number)) === "0x")
        throw Error("Choose an existing collection contract.");
      name = "WorldLedger";
      args = [collection];
      summary = { collection };
    } else {
      const ledger = await verifySaleContract(
        c.provider,
        input.ledger,
        "WorldLedger",
        c.block.number,
      );
      if (await ledger.isSealed(c.at))
        throw Error("The ledger modules are already sealed.");
      if (input.kind === "seal") {
        const names = [
            ["market", "NativeMarket"],
            ["vault", "TimeVault"],
            ["launchpad", "GenesisLaunchpad"],
          ],
          targets = [];
        for (const [key, contractName] of names) {
          const target = await verifySaleContract(
            c.provider,
            input[key],
            contractName,
            c.block.number,
          );
          if (!same(await target.ledger(c.at), ledger.target))
            throw Error("A module belongs to another ledger.");
          targets.push(target.target);
        }
        request = {
          to: ledger.target,
          data: ledger.interface.encodeFunctionData("sealModules", targets),
          value: 0n,
        };
        summary = {
          ledger: ledger.target,
          market: targets[0],
          vault: targets[1],
          launchpad: targets[2],
          effect: "Permanently install these three modules",
        };
      } else {
        name = {
          market: "NativeMarket",
          vault: "TimeVault",
          launchpad: "GenesisLaunchpad",
        }[input.kind];
        if (!name) throw Error("Unknown community infrastructure step.");
        args = [ledger.target];
        summary = { ledger: ledger.target };
      }
    }
    let predictedAddress;
    if (name) {
      const a = SALE_ARTIFACTS[name];
      if (keccak256(a.bytecode) !== a.creationHash)
        throw Error("Community deployment bytecode integrity check failed.");
      if ((await c.provider.getCode(c.account, c.block.number)) !== "0x")
        throw Error(
          "Contract deployment currently requires an ordinary wallet account.",
        );
      const nonce = await c.provider.getTransactionCount(c.account, "pending");
      request = {
        ...(await new ContractFactory(a.abi, a.bytecode).getDeployTransaction(
          ...args,
        )),
        nonce,
        value: 0n,
      };
      predictedAddress = getCreateAddress({ from: c.account, nonce });
    }
    await this.assert(c);
    return this.chain.prepareExternal({
      kind: "sale-setup",
      purpose: name
        ? `Deploy ${name}`
        : "Seal the community launch infrastructure",
      chainId: c.chainId,
      request,
      spend: [],
      deadline: c.block.timestamp + 900,
      summary: {
        ...summary,
        contract: name || "WorldLedger",
        predictedAddress,
      },
      meta: { setupKind: input.kind, contractName: name, predictedAddress },
    });
  }
}

/** Explicit read-only entry: no wallet identity, personal balance assumptions, or signing authority. */
export async function readCommunitySale(provider, { chainId, launchpad, id }) {
  return new CommunitySaleClient(null).readPublic({
    provider,
    chainId,
    launchpad,
    id,
  });
}
