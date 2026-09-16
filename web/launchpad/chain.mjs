import {
  BrowserProvider,
  Contract,
  ContractFactory,
  Interface,
  AbiCoder,
  getAddress,
  getCreateAddress,
  keccak256,
  parseUnits,
  formatUnits,
  randomBytes,
  hexlify,
  ZeroAddress,
} from "../vendor/ethers.min.js";
import { verifyNFTAuctionReceipt } from "./auction-client.mjs";
import { verifyProtocolReceipt } from "./protocols-client.mjs";
import { verifyLifecycleReceipt } from "./lifecycle-client.mjs";
import { verifyStrategyReceipt } from "./strategies-client.mjs";
import { verifyGovernanceReceipt } from "../governance/client.mjs";
import { verifyCrosschainReceipt } from "../crosschain/client.mjs";
import { ARTIFACTS } from "../v4/artifacts.mjs";
import {
  V4_NETWORKS,
  verifiedNetwork,
  verifyContract,
  launchPlan,
  swapPlan,
  redeemPlan,
  TOKEN_ABI,
} from "../v4/client.mjs";
import { startingPrice, sqrtAtTick } from "../v4/math.mjs";
import { DEPLOYMENTS } from "./deployments.mjs";
import { NFTAccountSession } from "./account-session.mjs";

const STORAGE_KEY = "anima.launchpad.chain.v1";
const tokenInterface = new Interface(TOKEN_ABI);
const json = (value) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
const clone = (value) => JSON.parse(json(value));
const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const now = () => Math.floor(Date.now() / 1000);
const requestKey = (r) =>
  json({
    to: r.to?.toLowerCase() || null,
    data: r.data,
    value: String(r.value ?? 0),
    nonce: r.nonce ?? null,
  });
const hashKey = (r) => keccak256(new TextEncoder().encode(requestKey(r)));
function stored(storage) {
  try {
    const x = JSON.parse(storage?.getItem(STORAGE_KEY) || "{}");
    return {
      records: Array.isArray(x.records)
        ? x.records.filter((r) => /^0x[0-9a-f]{64}$/i.test(r.hash))
        : [],
      deployments:
        x.deployments && typeof x.deployments === "object" ? x.deployments : {},
    };
  } catch {
    return { records: [], deployments: {} };
  }
}
function validRequest(request) {
  const data = request?.data;
  if (!/^0x(?:[0-9a-f]{2})*$/i.test(data || ""))
    throw Error("Invalid transaction data.");
  const value = BigInt(request.value ?? 0);
  if (value < 0n) throw Error("Invalid transaction value.");
  const result = { data, value };
  if (request.to) result.to = getAddress(request.to);
  if (request.nonce !== undefined) {
    if (!Number.isSafeInteger(request.nonce) || request.nonce < 0)
      throw Error("Invalid transaction nonce.");
    result.nonce = request.nonce;
  }
  return result;
}
function tickAtPrice(sqrt) {
  let lo = -887272,
    hi = 887272;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (sqrtAtTick(mid) <= sqrt) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
export function resolveHumanRange(range, quoteDecimals, tokenIs0, spacing) {
  if (!range || range.mode === "full")
    return {
      tickLower: Math.ceil(-887272 / spacing) * spacing,
      tickUpper: Math.floor(887272 / spacing) * spacing,
    };
  const lower = range.lower ?? range.min,
    upper = range.upper ?? range.max;
  const a = startingPrice(lower, quoteDecimals, tokenIs0),
    b = startingPrice(upper, quoteDecimals, tokenIs0);
  if ((tokenIs0 && a >= b) || (!tokenIs0 && a <= b))
    throw Error("The lower human price must be below the upper price.");
  const p0 = a < b ? a : b,
    p1 = a < b ? b : a,
    lowerTick = tickAtPrice(p0),
    upperFloor = tickAtPrice(p1),
    upperTick = sqrtAtTick(upperFloor) < p1 ? upperFloor + 1 : upperFloor;
  const tickLower = Math.max(
      Math.ceil(-887272 / spacing) * spacing,
      Math.floor(lowerTick / spacing) * spacing,
    ),
    tickUpper = Math.min(
      Math.floor(887272 / spacing) * spacing,
      Math.ceil(upperTick / spacing) * spacing,
    );
  if (tickLower >= tickUpper)
    throw Error(
      "This price range is too narrow for the selected tick spacing.",
    );
  return { tickLower, tickUpper };
}

/** Wallet-signed public execution from the selected wallet or verified NFT account. Every operation is prepared, reviewed, then explicitly signed. */
export class LaunchChain {
  constructor({
    onChange = () => {},
    storage,
    deployments = {},
    receiptTimeout = 120000,
    pollInterval = 1400,
    replacementScanLimit = 256,
  } = {}) {
    if (storage === undefined) {
      try {
        storage = globalThis.localStorage;
      } catch {
        storage = null;
      }
    }
    this.onChange = onChange;
    this.storage = storage;
    this.replacementScanLimit = replacementScanLimit;
    this.nftSession = null;
    this.receiptTimeout = receiptTimeout;
    this.pollInterval = pollInterval;
    const saved = stored(storage);
    this.records = saved.records;
    this.deployments = { ...saved.deployments, ...deployments };
    this.generation = 0;
    this.config = {};
    this.plan = null;
    this.review = null;
    this.busy = false;
    this.error = null;
    this.walletChanged = () => {
      this.disconnect();
      this.error =
        "Wallet account or network changed. Connect again and prepare a fresh review.";
      this.emit();
    };
  }
  get payer() {
    return this.nftSession?.account || this.address;
  }
  get execution() {
    return (
      this.nftSession?.descriptor || {
        mode: "wallet",
        signer: this.address || null,
        payer: this.address || null,
      }
    );
  }
  get state() {
    return this.getState();
  }
  getState() {
    return {
      connected: !!this.address,
      address: this.address || null,
      payer: this.payer || null,
      execution: this.execution,
      chainId: this.chainId ? Number(this.chainId) : null,
      network:
        V4_NETWORKS[Number(this.chainId)]?.name ||
        (Number(this.chainId) === 31337 ? "Local EVM" : null),
      config: { ...this.config },
      plan: this.plan,
      review: this.review,
      busy: this.busy,
      pending: this.pending(),
      records: this.records.map((r) => ({ ...r })),
      error: this.error,
    };
  }
  emit() {
    try {
      this.onChange(this.getState());
    } catch {}
  }
  persist() {
    try {
      this.storage?.setItem(
        STORAGE_KEY,
        json({ records: this.records, deployments: this.deployments }),
      );
    } catch {
      this.error =
        "Transaction hash is available here, but browser storage could not save it. Copy the hash before closing.";
    }
  }
  pending() {
    return (
      this.records.find(
        (r) =>
          ["pending", "replacement-unresolved", "included-unverified"].includes(
            r.status,
          ) &&
          Number(r.chainId) === Number(this.chainId) &&
          r.account?.toLowerCase() === this.address?.toLowerCase(),
      ) || null
    );
  }
  invalidate() {
    this.generation++;
    this.plan = null;
    this.review = null;
    this.emit();
  }
  disconnect() {
    this.invalidate();
    this.raw?.removeListener?.("accountsChanged", this.walletChanged);
    this.raw?.removeListener?.("chainChanged", this.walletChanged);
    this.raw?.removeListener?.("disconnect", this.walletChanged);
    this.provider?.destroy();
    this.raw = null;
    this.provider = null;
    this.signer = null;
    this.nftSession = null;
    this.address = null;
    this.chainId = null;
    this.config = {};
    this.emit();
  }
  async connect(raw = globalThis.ethereum) {
    this.disconnect();
    if (!raw?.request)
      throw Error(
        "Open this page in a wallet browser or enable an Ethereum wallet.",
      );
    this.raw = raw;
    raw.on?.("accountsChanged", this.walletChanged);
    raw.on?.("chainChanged", this.walletChanged);
    raw.on?.("disconnect", this.walletChanged);
    const generation = this.generation;
    try {
      await raw.request({ method: "eth_requestAccounts" });
      this.provider = new BrowserProvider(raw, undefined, { cacheTimeout: -1 });
      this.signer = await this.provider.getSigner();
      this.address = getAddress(await this.signer.getAddress());
      this.chainId = (await this.provider.getNetwork()).chainId;
      await this.assertContext(generation);
      if (!Number.isSafeInteger(Number(this.chainId)) || this.chainId <= 0n)
        throw Error("The wallet returned an invalid chain ID.");
      const configured = this.deployments[String(this.chainId)] || {};
      this.config = {
        ...configured,
        chainId: Number(this.chainId),
        ...V4_NETWORKS[Number(this.chainId)],
      };
      this.error = null;
      await this.recoverTransactions();
      if (this.config.manager) await this.configure(this.config);
      this.emit();
      return this.getState();
    } catch (e) {
      this.disconnect();
      this.error = e.message;
      this.emit();
      throw e;
    }
  }
  async switchChain(chainId) {
    if (!this.raw) throw Error("Connect a wallet first.");
    if (!Number.isSafeInteger(Number(chainId)) || BigInt(chainId) <= 0n)
      throw Error("Choose a valid EVM chain ID.");
    const raw = this.raw;
    await raw.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + BigInt(chainId).toString(16) }],
    });
    return this.connect(raw);
  }
  async assertContext(generation = this.generation) {
    if (!this.raw || !this.address) throw Error("Connect your wallet first.");
    const [chain, accounts] = await Promise.all([
      this.raw.request({ method: "eth_chainId" }),
      this.raw.request({ method: "eth_accounts" }),
    ]);
    if (
      BigInt(chain) !== this.chainId ||
      accounts[0]?.toLowerCase() !== this.address.toLowerCase() ||
      generation !== this.generation
    )
      throw Error("Wallet context or draft changed. Prepare a new review.");
    if (this.nftSession) {
      try {
        await this.nftSession.assert(this.address);
      } catch (error) {
        this.plan = null;
        this.review = null;
        this.generation++;
        this.error = error.message;
        this.emit();
        throw error;
      }
    }
  }
  useWallet() {
    if (this.busy || this.pending())
      throw Error(
        "Recover the submitted transaction before changing its funding account.",
      );
    this.nftSession = null;
    this.error = null;
    this.invalidate();
    return this.getState();
  }
  async useNFT(identity) {
    if (this.busy || this.pending())
      throw Error(
        "Recover the submitted transaction before changing its funding account.",
      );
    this.nftSession = null;
    this.invalidate();
    const generation = this.generation;
    await this.assertContext(generation);
    const session = await NFTAccountSession.connect(
      this.provider,
      this.address,
      identity,
    );
    await this.assertContext(generation);
    this.nftSession = session;
    this.error = null;
    this.emit();
    return this.getState();
  }
  async configure(config) {
    this.invalidate();
    const generation = this.generation;
    await this.assertContext(generation);
    const c = await verifiedNetwork(this.provider, {
      ...this.config,
      ...config,
      chainId: Number(this.chainId),
    });
    for (const [field, name] of [
      ["factory", "GenesisV4Launchpad"],
      ["router", "GenesisV4Router"],
    ])
      if (c[field])
        await verifyContract(this.provider, c[field], name, c.manager);
    await this.assertContext(generation);
    this.config = c;
    this.deployments[String(this.chainId)] = { ...c };
    this.persist();
    this.emit();
    return { ...c };
  }
  async begin(requireManager = true) {
    this.error = null;
    if (this.busy || this.pending())
      throw Error(
        "A transaction is awaiting confirmation. Recover its receipt before starting another.",
      );
    this.invalidate();
    const generation = this.generation;
    await this.assertContext(generation);
    if (requireManager && !this.config.manager)
      throw Error("Configure the PoolManager before preparing a transaction.");
    return generation;
  }
  async accept(plan, generation) {
    await this.assertContext(generation);
    if (Number(plan.chainId) !== Number(this.chainId))
      throw Error("Plan network does not match the wallet.");
    if (plan.payer && getAddress(plan.payer) !== getAddress(this.payer))
      throw Error("The plan was prepared for another funding account.");
    this.plan = freeze({
      ...plan,
      payer: this.payer,
      execution: this.execution,
      request: validRequest(plan.request),
      spend: (plan.spend || []).map((s) => ({
        tokenAddress: getAddress(s.tokenAddress),
        amount: BigInt(s.amount),
      })),
      generation,
    });
    this.review = null;
    this.emit();
    return this.plan;
  }
  async prepareExternal(plan, { nftCompatible = false } = {}) {
    if (this.nftSession && !nftCompatible)
      throw Error(
        "This operation uses your wallet directly. Select wallet funding, or use its NFT-compatible route.",
      );
    const generation = await this.begin(false);
    return this.accept(
      {
        ...plan,
        deadline: plan.deadline ?? now() + 900,
        chainId: plan.chainId ?? Number(this.chainId),
        spend: plan.spend || [],
      },
      generation,
    );
  }
  async prepareCustom(plan, options) {
    return this.prepareExternal(plan, options);
  }
  async prepareSetup(kind) {
    if (this.nftSession)
      throw Error("Select wallet funding for infrastructure deployment.");
    const generation = await this.begin();
    if (!["factory", "router"].includes(kind))
      throw Error("Choose factory or router setup.");
    const config = await verifiedNetwork(this.provider, this.config);
    if (config[kind])
      throw Error("This deployment is already configured and verified.");
    if ((await this.provider.getCode(this.address)) !== "0x")
      throw Error(
        "Infrastructure deployment currently requires a normal wallet account.",
      );
    const name = kind === "factory" ? "GenesisV4Launchpad" : "GenesisV4Router",
      a = DEPLOYMENTS[name];
    if (keccak256(a.bytecode) !== a.creationHash)
      throw Error("Deployment bytecode integrity check failed.");
    const request = await new ContractFactory(
        ARTIFACTS[name].abi,
        a.bytecode,
      ).getDeployTransaction(config.manager),
      nonce = await this.provider.getTransactionCount(this.address, "pending");
    request.nonce = nonce;
    return this.accept(
      {
        kind: "setup",
        chainId: Number(this.chainId),
        deadline: now() + 900,
        request,
        spend: [],
        meta: {
          setupKind: kind,
          contractName: name,
          manager: config.manager,
          predictedAddress: getCreateAddress({ from: this.address, nonce }),
        },
        summary: {
          purpose: `Deploy ${name}`,
          manager: config.manager,
          compiler: a.compiler,
          predictedAddress: getCreateAddress({ from: this.address, nonce }),
          creationHash: a.creationHash,
        },
      },
      generation,
    );
  }
  async readToken(address) {
    await this.assertContext();
    address = getAddress(address);
    if (
      address === ZeroAddress ||
      (await this.provider.getCode(address)) === "0x"
    )
      throw Error("Choose a deployed ERC20 token.");
    const token = new Contract(
        address,
        [
          ...TOKEN_ABI,
          "function name() view returns(string)",
          "function totalSupply() view returns(uint256)",
        ],
        this.provider,
      ),
      [decimals, balance, symbol] = await Promise.all([
        token.decimals(),
        token.balanceOf(this.payer),
        token.symbol().catch(() => "TOKEN"),
      ]);
    if (Number(decimals) > 36) throw Error("Unsupported token decimals.");
    return {
      address,
      decimals: Number(decimals),
      symbol,
      balance: balance.toString(),
      formattedBalance: formatUnits(balance, decimals),
    };
  }
  async prepareLaunch(draft) {
    const generation = await this.begin();
    if (!this.config.factory)
      throw Error("Deploy or load the launch factory first.");
    const input = { ...draft, salt: draft.salt || hexlify(randomBytes(32)) };
    const quote = await this.readToken(input.quoteToken);
    const provisional = await launchPlan(
      this.provider,
      this.config,
      { ...input, tickLower: undefined, tickUpper: undefined },
      this.payer,
    );
    const tokenIs0 = BigInt(provisional.summary.token) < BigInt(quote.address);
    const ticks = input.range
      ? resolveHumanRange(
          input.range,
          quote.decimals,
          tokenIs0,
          Number(input.tickSpacing ?? 60),
        )
      : { tickLower: input.tickLower, tickUpper: input.tickUpper };
    const plan = await launchPlan(
      this.provider,
      this.config,
      { ...input, ...ticks },
      this.payer,
    );
    if (BigInt(quote.balance) < plan.terms.quoteBudget)
      throw Error(
        `Your selected funding account needs ${input.quoteBudget} ${quote.symbol}; available ${quote.formattedBalance}.`,
      );
    return this.accept(
      {
        ...plan,
        meta: {
          factory: this.config.factory,
          manager: this.config.manager,
          quote,
          tokenIs0,
        },
        summary: {
          ...plan.summary,
          name: input.name,
          symbol: input.symbol,
          supply: input.supply,
          quoteSymbol: quote.symbol,
          quoteDecimals: quote.decimals,
          tickLower: plan.terms.tickLower,
          tickUpper: plan.terms.tickUpper,
          humanRange: input.range || { mode: "full" },
        },
      },
      generation,
    );
  }
  async prepareWrap(amount, wrappedAddress = this.config.wrappedNative) {
    const generation = await this.begin();
    if (!wrappedAddress)
      throw Error("Choose the network’s wrapped native token address.");
    const token = await this.readToken(wrappedAddress);
    if (token.decimals !== 18)
      throw Error("Wrapped native currency must use 18 decimals.");
    const value = parseUnits(String(amount), 18);
    if (value <= 0n || value > (await this.provider.getBalance(this.payer)))
      throw Error(
        "Choose a positive amount and leave native currency for gas.",
      );
    return this.accept(
      {
        kind: "wrap",
        chainId: Number(this.chainId),
        deadline: now() + 900,
        request: {
          to: token.address,
          data: new Interface([
            "function deposit() payable",
          ]).encodeFunctionData("deposit"),
          value,
        },
        spend: [],
        summary: {
          purpose: "Wrap native currency",
          amount: String(amount),
          token: token.address,
          symbol: token.symbol,
        },
      },
      generation,
    );
  }
  async prepareSwap(input) {
    const generation = await this.begin();
    return this.accept(
      await swapPlan(this.provider, this.config, input, this.payer),
      generation,
    );
  }
  async prepareRedeem(input) {
    const generation = await this.begin();
    let draft = { ...input };
    if (input.minimum0 === undefined && input.minimum1 === undefined) {
      const position = await verifyContract(
          this.provider,
          input.position,
          "GenesisV4Position",
          this.config.manager,
        ),
        shares = parseUnits(String(input.shares), 18),
        [a, b] = await position.previewRedeemFor(this.payer, shares),
        key = await position.poolKey(),
        [t0, t1] = await Promise.all([
          this.readToken(key.currency0),
          this.readToken(key.currency1),
        ]),
        slippage = Number(input.slippageBps ?? 50);
      if (!Number.isSafeInteger(slippage) || slippage < 1 || slippage > 1000)
        throw Error("Use withdrawal slippage between 0.01% and 10%.");
      draft = {
        ...draft,
        minimum0: formatUnits(
          (a * BigInt(10000 - slippage)) / 10000n,
          t0.decimals,
        ),
        minimum1: formatUnits(
          (b * BigInt(10000 - slippage)) / 10000n,
          t1.decimals,
        ),
      };
    }
    const actual = await verifyContract(
        this.provider,
        input.position,
        "GenesisV4Position",
        this.config.manager,
      ),
      factory = getAddress(await actual.factory());
    if (
      ![this.config.factory, this.config.hookFactory]
        .filter(Boolean)
        .some((a) => getAddress(a) === factory)
    )
      throw Error("The position belongs to another launchpad deployment.");
    return this.accept(
      await redeemPlan(this.provider, { ...this.config, factory }, draft),
      generation,
    );
  }
  async next() {
    const p = this.plan;
    if (!p) throw Error("Prepare transaction terms first.");
    await this.assertContext(p.generation);
    if (now() >= p.deadline)
      throw Error("Transaction terms expired. Prepare again.");
    if (this.pending())
      throw Error("A submitted transaction is still pending.");
    const bounds = {};
    for (const key of ["notBeforeBlock", "notAfterBlock"]) {
      const value = p.meta?.[key];
      if (value !== undefined) {
        if (
          (typeof value === "number" && !Number.isSafeInteger(value)) ||
          !/^\d+$/.test(String(value))
        )
          throw Error("Invalid transaction block window.");
        const n = BigInt(value);
        if (n < 0n || n > (1n << 64n) - 1n)
          throw Error("Invalid transaction block window.");
        bounds[key] = n;
      }
    }
    if (
      bounds.notBeforeBlock !== undefined &&
      bounds.notAfterBlock !== undefined &&
      bounds.notBeforeBlock > bounds.notAfterBlock
    )
      throw Error("Invalid transaction block window.");
    if (Object.keys(bounds).length) {
      const block = BigInt(await this.provider.getBlockNumber());
      if (bounds.notBeforeBlock !== undefined && block < bounds.notBeforeBlock)
        throw Error(
          "This operation has not opened yet. Refresh after its opening block.",
        );
      if (bounds.notAfterBlock !== undefined && block > bounds.notAfterBlock)
        throw Error(
          "This operation’s block window has expired. Refresh the auction before signing.",
        );
    }
    for (const s of p.spend) {
      if (s.amount <= 0n) throw Error("Invalid spend budget.");
      const token = new Contract(s.tokenAddress, TOKEN_ABI, this.provider);
      if ((await token.balanceOf(this.payer)) < s.amount)
        throw Error(
          "Selected funding balance is below the reviewed spend budget.",
        );
      if (this.nftSession) continue;
      if (s.tokenAddress.toLowerCase() === p.request.to?.toLowerCase())
        continue;
      const allowance = await token.allowance(this.address, p.request.to);
      if (allowance !== s.amount) {
        const amount = allowance !== 0n ? 0n : s.amount;
        return {
          purpose:
            amount === 0n
              ? "Reset previous token approval"
              : "Approve the exact transaction budget",
          request: {
            to: s.tokenAddress,
            data: tokenInterface.encodeFunctionData("approve", [
              p.request.to,
              amount,
            ]),
            value: 0n,
          },
          final: false,
          approval: {
            token: s.tokenAddress,
            spender: p.request.to,
            amount: amount.toString(),
          },
        };
      }
    }
    const purposes = {
      launch: "Create your token, v4 pool and liquidity shares",
      swap: "Swap through the reviewed v4 pool",
      redeem: "Withdraw liquidity principal and earned fees",
      wrap: "Wrap native currency",
      setup: `Deploy ${p.meta?.contractName}`,
    };
    const step = {
      purpose: p.purpose || p.summary?.purpose || purposes[p.kind] || p.kind,
      request: p.request,
      final: true,
    };
    if (this.nftSession)
      return {
        ...step,
        ...(await this.nftSession.wrap(p)),
        innerRequest: p.request,
      };
    return step;
  }
  async reviewNext() {
    if (this.busy) throw Error("A wallet request is already in progress.");
    this.error = null;
    const plan = this.plan,
      step = await this.next();
    await this.provider.call({ ...step.request, from: this.address });
    const [gas, fees, balance] = await Promise.all([
      this.provider.estimateGas({ ...step.request, from: this.address }),
      this.provider.getFeeData(),
      this.provider.getBalance(this.address),
    ]);
    await this.assertContext(plan.generation);
    const gasLimit = (gas * 120n) / 100n,
      unitFee = fees.maxFeePerGas ?? fees.gasPrice;
    if (!unitFee || unitFee <= 0n)
      throw Error("The wallet RPC returned no usable gas fee.");
    const maximumGasCost = gasLimit * unitFee;
    if (balance < maximumGasCost + BigInt(step.request.value || 0))
      throw Error(
        "Your wallet needs more native currency for the reviewed transaction and gas.",
      );
    this.review = freeze({
      ...step,
      request: validRequest(step.request),
      generation: plan.generation,
      created: Date.now(),
      gas,
      gasLimit,
      fee: fees.maxFeePerGas
        ? {
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n,
          }
        : { gasPrice: fees.gasPrice },
      maximumGasCost,
      account: this.address,
      chainId: Number(this.chainId),
      fingerprint: hashKey(step.request),
    });
    this.emit();
    return this.review;
  }
  async sendReviewed() {
    if (this.busy) throw Error("A wallet request is already in progress.");
    const review = this.review,
      plan = this.plan;
    if (!review || !plan || Date.now() - review.created > 180000)
      throw Error("Review the next transaction before signing.");
    this.error = null;
    this.busy = true;
    this.review = null;
    this.emit();
    let record;
    try {
      await this.assertContext(review.generation);
      if (review.execution?.mode === "nft")
        await this.nftSession.assert(this.address, {
          nonce: review.execution.nonce,
        });
      const next = await this.next();
      if (requestKey(next.request) !== requestKey(review.request))
        throw Error("Transaction or token approval changed. Review again.");
      const provider = this.provider,
        raw = this.raw,
        account = this.address,
        chainId = Number(this.chainId);
      if (
        review.request.nonce !== undefined &&
        (await provider.getTransactionCount(account, "pending")) !==
          review.request.nonce
      )
        throw Error("Wallet nonce changed. Prepare a fresh deployment.");
      await provider.call({ ...review.request, from: account });
      await this.assertContext(review.generation);
      const submittedBlock = await provider.getBlockNumber(),
        nonce =
          review.request.nonce ??
          (await provider.getTransactionCount(account, "pending")),
        rpcRequest = {
          from: account,
          to: review.request.to,
          data: review.request.data,
          value: "0x" + BigInt(review.request.value || 0).toString(16),
          gas: "0x" + review.gasLimit.toString(16),
          nonce: "0x" + nonce.toString(16),
          chainId: "0x" + BigInt(chainId).toString(16),
        };
      for (const [k, v] of Object.entries(review.fee))
        rpcRequest[k] = "0x" + v.toString(16);
      if (!rpcRequest.to) delete rpcRequest.to;
      const hash = await raw.request({
        method: "eth_sendTransaction",
        params: [rpcRequest],
      });
      if (!/^0x[0-9a-f]{64}$/i.test(hash))
        throw Error(
          "Wallet did not return a transaction hash. Check its activity before trying again.",
        );
      record = {
        hash,
        account,
        chainId,
        status: "pending",
        submittedAt: Date.now(),
        nonce,
        kind: plan.kind,
        purpose: review.purpose,
        final: review.final,
        request: clone(review.request),
        fingerprint: review.fingerprint,
        meta: clone(plan.meta || {}),
        verification: clone(plan.verification || {}),
        summary: clone(plan.summary || {}),
        outputs: plan.outputs || [],
        payer: plan.payer,
        execution: clone(review.execution || plan.execution || {}),
        innerRequest: review.innerRequest ? clone(review.innerRequest) : null,
        submittedBlock,
        planFingerprint: hashKey(plan.request),
      };
      this.records.push(record);
      this.persist();
      this.emit();
      const stop = Date.now() + this.receiptTimeout;
      let receipt;
      do {
        receipt = await provider.getTransactionReceipt(hash);
        if (receipt) break;
        await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
      } while (Date.now() < stop && this.raw === raw);
      if (!receipt) return { ...record, receipt: null };
      this.error = null;
      await this.finishRecord(record, receipt, provider);
      if (review.final && this.generation === review.generation) {
        this.plan = null;
        this.review = null;
      }
      this.persist();
      this.emit();
      if (record.status === "reverted")
        throw Error(`Transaction reverted: ${hash}`);
      return { ...record, receipt };
    } catch (e) {
      if (record?.status === "pending") {
        this.error = `Transaction ${record.hash} was submitted. Recover its receipt before sending anything else.`;
        this.persist();
      } else this.error = e.message;
      if (record) this.persist();
      this.emit();
      throw e;
    } finally {
      this.busy = false;
      this.emit();
    }
  }
  async finishRecord(record, receipt, provider = this.provider) {
    const canonical = await provider.getBlock(receipt.blockNumber);
    if (!canonical?.hash || canonical.hash !== receipt.blockHash)
      throw Error(
        "The transaction block is no longer canonical. Recover the receipt again.",
      );
    record.blockNumber = Number(receipt.blockNumber);
    record.blockHash = receipt.blockHash;
    record.confirmedAt = Date.now();
    record.confirmations = Math.max(
      1,
      (await provider.getBlockNumber()) - record.blockNumber + 1,
    );
    record.confirmationState = "included";
    record.canonical = true;
    try {
      const finalized = await provider.getBlock("finalized");
      if (finalized && finalized.number >= record.blockNumber)
        record.confirmationState = "finalized";
    } catch {}
    if (
      record.replacementType === "cancelled" ||
      record.replacementType === "different-action"
    ) {
      record.status =
        record.replacementType === "cancelled" ? "cancelled" : "replaced";
      return;
    }
    record.status =
      Number(receipt.status) === 1 ? "included-unverified" : "reverted";
    if (record.status !== "included-unverified") return;
    if (record.final && record.kind === "setup") {
      const address = getAddress(receipt.contractAddress);
      if (address !== getAddress(record.meta.predictedAddress))
        throw Error(
          "Mined deployment address does not match the reviewed nonce.",
        );
      await verifyContract(
        provider,
        address,
        record.meta.contractName,
        record.meta.manager,
      );
      record.contractAddress = address;
      const stored = this.deployments[String(record.chainId)] || {};
      this.deployments[String(record.chainId)] = {
        ...stored,
        chainId: record.chainId,
        manager: record.meta.manager,
        [record.meta.setupKind]: address,
      };
      if (Number(this.chainId) === record.chainId)
        this.config = {
          ...this.config,
          ...this.deployments[String(record.chainId)],
        };
    }
    if (record.final && ["launch", "hooked-launch"].includes(record.kind)) {
      const iface = new Interface(ARTIFACTS.GenesisV4Launchpad.abi);
      const events = receipt.logs
        .filter(
          (l) =>
            l.address.toLowerCase() ===
            (record.innerRequest?.to || record.request.to).toLowerCase(),
        )
        .map((l) => {
          try {
            return iface.parseLog(l);
          } catch {
            return null;
          }
        })
        .filter((e) => e?.name === "Launched");
      if (events.length !== 1)
        throw Error(
          "The confirmed launch did not emit exactly one Launched event.",
        );
      const e = events[0];
      record.launch = {
        token: getAddress(e.args.token),
        position: getAddress(e.args.position),
        poolId: e.args.poolId,
      };
      if (
        record.summary.token &&
        record.launch.token !== getAddress(record.summary.token)
      )
        throw Error("Mined token differs from the reviewed launch prediction.");
      if (
        record.summary.position &&
        record.launch.position !== getAddress(record.summary.position)
      )
        throw Error(
          "Mined position differs from the reviewed launch prediction.",
        );
    }
    if (receipt.contractAddress)
      record.contractAddress = getAddress(receipt.contractAddress);
    if (record.final && record.kind?.startsWith("official-"))
      record.protocol = await verifyProtocolReceipt(provider, record, receipt);
    await verifyNFTAuctionReceipt(provider, record, receipt);
    await verifyLifecycleReceipt(provider, record, receipt);
    await verifyStrategyReceipt(provider, record, receipt);
    await verifyGovernanceReceipt(provider, record, receipt);
    await verifyCrosschainReceipt(provider, record, receipt);
    record.status = "confirmed";
  }
  rollbackRecord(record) {
    const key =
      record.kind === "setup"
        ? record.meta.setupKind
        : record.kind === "hook-setup" || record.kind === "hook-deploy"
          ? {
              factory: "hookFactory",
              create2: "create2",
              splitter: "splitter",
              hook: "hook",
            }[record.meta.deploymentType]
          : record.kind === "sale-setup"
            ? {
                ledger: "saleLedger",
                market: "saleMarket",
                vault: "saleVault",
                launchpad: "saleLaunchpad",
                seal: "saleLaunchpad",
              }[record.meta.setupKind]
            : record.kind === "lifecycle-setup"
              ? {LaunchRegistry:"registry",LaunchAllocationComposer:"composer",NFTAuctionFactory:"auctionFactory"}[record.meta?.contractName]
              : null;
    const deployed =
      record.contractAddress ||
      record.meta?.predictedAddress ||
      (record.meta?.setupKind === "seal" ? record.summary?.launchpad : null);
    if (key && deployed) {
      const saved = this.deployments[String(record.chainId)];
      if (saved?.[key]?.toLowerCase() === deployed.toLowerCase())
        delete saved[key];
      if (
        Number(this.chainId) === Number(record.chainId) &&
        this.config[key]?.toLowerCase() === deployed.toLowerCase()
      )
        delete this.config[key];
    }
    delete record.launchRecord;
    delete record.auction;
    delete record.crosschain;
    delete record.governance;
    delete record.strategy;
    delete record.protocol;
    delete record.launch;
    delete record.sale;
    delete record.integrated;
    delete record.contractAddress;
    delete record.blockHash;
    delete record.blockNumber;
    delete record.confirmedAt;
    record.status = "pending";
    record.canonical = false;
    record.confirmations = 0;
    record.confirmationState = "unconfirmed";
    record.reorgs = (record.reorgs || 0) + 1;
    this.invalidate();
  }
  async findReplacement(record, provider = this.provider, replacementHash) {
    if (replacementHash) {
      if (!/^0x[0-9a-f]{64}$/i.test(replacementHash))
        throw Error("Enter the wallet replacement transaction hash.");
      const tx = await provider.getTransaction(replacementHash);
      if (!tx)
        throw Error(
          "The replacement transaction is not available from this RPC.",
        );
      if (
        tx.from?.toLowerCase() !== record.account?.toLowerCase() ||
        Number(tx.nonce) !== Number(record.nonce)
      )
        throw Error("The replacement must use the original wallet and nonce.");
      return tx;
    }
    const minedNonce = await provider.getTransactionCount(
      record.account,
      "latest",
    );
    if (minedNonce <= Number(record.nonce)) {
      if (record.status === "replacement-unresolved") {
        record.status = "pending";
        delete record.recoveryMessage;
      }
      return null;
    }
    const latest = await provider.getBlockNumber(),
      limit = Math.max(
        1,
        Math.min(2048, Number(this.replacementScanLimit) || 256),
      );
    const first = Math.max(
      0,
      Number(record.submittedBlock ?? latest - limit + 1),
      latest - limit + 1,
    );
    for (let block = latest; block >= first; block--) {
      const data = await provider.send("eth_getBlockByNumber", [
        "0x" + block.toString(16),
        true,
      ]);
      for (const tx of data?.transactions || [])
        if (
          typeof tx === "object" &&
          tx.from?.toLowerCase() === record.account?.toLowerCase() &&
          Number(BigInt(tx.nonce)) === Number(record.nonce)
        )
          return {
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            data: tx.input || "0x",
            value: BigInt(tx.value || 0),
            nonce: Number(BigInt(tx.nonce)),
          };
    }
    record.status = "replacement-unresolved";
    record.recoveryMessage =
      "This wallet nonce was mined, but its replacement was outside the RPC search window. Paste its hash from wallet activity to reconcile it.";
    return null;
  }
  async recoverTransactions({ replacementHashes = {} } = {}) {
    // Read recovery remains possible after NFT transfer; authority is required again before any new preparation.
    if (!this.raw || !this.address) throw Error("Connect your wallet first.");
    const [chain, accounts] = await Promise.all([
      this.raw.request({ method: "eth_chainId" }),
      this.raw.request({ method: "eth_accounts" }),
    ]);
    if (
      BigInt(chain) !== this.chainId ||
      accounts[0]?.toLowerCase() !== this.address.toLowerCase()
    )
      throw Error("Wallet context changed. Connect again to recover.");
    this.error = null;
    const provider = this.provider;
    for (const record of this.records.filter(
      (r) => Number(r.chainId) === Number(this.chainId),
    )) {
      let receipt = await provider.getTransactionReceipt(
        record.effectiveHash || record.hash,
      );
      if (
        receipt &&
        (await provider.getBlock(receipt.blockNumber))?.hash !==
          receipt.blockHash
      )
        receipt = null;
      if (
        !receipt &&
        record.effectiveHash &&
        record.effectiveHash !== record.hash
      ) {
        receipt = await provider.getTransactionReceipt(record.hash);
        if (receipt) {
          delete record.effectiveHash;
          delete record.replacementHash;
          delete record.replacementType;
        }
      }
      if (!receipt && record.blockHash) this.rollbackRecord(record);
      if (!receipt) {
        const replacement = await this.findReplacement(
          record,
          provider,
          replacementHashes[record.hash] || record.candidateReplacementHash,
        );
        if (replacement) {
          const expected = record.request,
            sameIntent =
              (replacement.to?.toLowerCase() || null) ===
                (expected.to?.toLowerCase() || null) &&
              (replacement.data || "0x").toLowerCase() ===
                (expected.data || "0x").toLowerCase() &&
              BigInt(replacement.value || 0) === BigInt(expected.value || 0);
          record.candidateReplacementHash = replacement.hash;
          receipt = await provider.getTransactionReceipt(replacement.hash);
          if (receipt) {
            record.effectiveHash = replacement.hash;
            if (replacement.hash.toLowerCase() !== record.hash.toLowerCase()) {
              record.replacementHash = replacement.hash;
              record.replacementType = sameIntent
                ? "same-action"
                : replacement.to?.toLowerCase() ===
                      record.account.toLowerCase() &&
                    BigInt(replacement.value || 0) === 0n &&
                    (!replacement.data || replacement.data === "0x")
                  ? "cancelled"
                  : "different-action";
            } else {
              delete record.replacementHash;
              delete record.replacementType;
            }
          }
        }
      }
      if (receipt) {
        try {
          await this.finishRecord(record, receipt, provider);
        } catch (error) {
          this.error = error.message;
          this.persist();
          this.emit();
          throw error;
        }
        delete record.recoveryMessage;
        if (
          record.final &&
          this.plan &&
          (record.planFingerprint || record.fingerprint) ===
            hashKey(this.plan.request)
        ) {
          this.plan = null;
          this.review = null;
        }
      }
    }
    this.persist();
    this.emit();
    return this.records.map((r) => ({ ...r }));
  }
  async recoverReplacement(originalHash, replacementHash) {
    const record = this.records.find(
      (r) => r.hash.toLowerCase() === String(originalHash).toLowerCase(),
    );
    if (!record)
      throw Error("The original transaction is not in this journal.");
    if (Number(record.chainId) !== Number(this.chainId))
      throw Error("Connect the original transaction network first.");
    await this.findReplacement(record, this.provider, replacementHash);
    return this.recoverTransactions({
      replacementHashes: { [record.hash]: replacementHash },
    });
  }
  async inspectPosition(address) {
    await this.assertContext();
    const generation = this.generation,
      config = await verifiedNetwork(this.provider, this.config),
      position = await verifyContract(
        this.provider,
        address,
        "GenesisV4Position",
        config.manager,
      );
    const factory = getAddress(await position.factory());
    if (
      ![config.factory, config.hookFactory]
        .filter(Boolean)
        .some((a) => getAddress(a) === factory)
    )
      throw Error("The position belongs to another launchpad deployment.");
    const [key, shares, totalSupply, liquidity, tickLower, tickUpper] =
      await Promise.all([
        position.poolKey(),
        position.balanceOf(this.payer),
        position.totalSupply(),
        position.liquidity(),
        position.tickLower(),
        position.tickUpper(),
      ]);
    const [token0, token1] = await Promise.all([
      this.readToken(key.currency0),
      this.readToken(key.currency1),
    ]);
    const preview =
      shares > 0n
        ? await position.previewRedeemFor(this.payer, shares)
        : [0n, 0n];
    const poolId = keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "uint24", "int24", "address"],
        [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
      ),
    );
    const slot = keccak256(
      AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [poolId, 6]),
    );
    const manager = new Contract(
        config.manager,
        ["function extsload(bytes32) view returns(bytes32)"],
        this.provider,
      ),
      packed = BigInt(await manager.extsload(slot));
    const sqrtPriceX96 = packed & ((1n << 160n) - 1n),
      unsignedTick = Number((packed >> 160n) & 0xffffffn),
      tick = unsignedTick >= 0x800000 ? unsignedTick - 0x1000000 : unsignedTick;
    await this.assertContext(generation);
    return {
      position: getAddress(address),
      factory,
      poolId,
      key: {
        currency0: key.currency0,
        currency1: key.currency1,
        fee: Number(key.fee),
        tickSpacing: Number(key.tickSpacing),
        hooks: key.hooks,
      },
      shares: shares.toString(),
      formattedShares: formatUnits(shares, 18),
      totalSupply: totalSupply.toString(),
      liquidity: liquidity.toString(),
      tickLower: Number(tickLower),
      tickUpper: Number(tickUpper),
      tick,
      sqrtPriceX96: sqrtPriceX96.toString(),
      token0,
      token1,
      preview: {
        amount0: preview[0].toString(),
        amount1: preview[1].toString(),
        formatted0: formatUnits(preview[0], token0.decimals),
        formatted1: formatUnits(preview[1], token1.decimals),
        includes:
          "Current liquidity principal and your proportional earned fees",
      },
      blockNumber: await this.provider.getBlockNumber(),
    };
  }
}
