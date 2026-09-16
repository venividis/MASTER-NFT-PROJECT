import * as sdk from "@railgun-community/wallet";
import {
  NETWORK_CONFIG,
  TXIDVersion,
  EVMGasType,
} from "@railgun-community/shared-models";
import {
  WakuBroadcasterClient as Waku,
  BroadcasterTransaction,
} from "@railgun-community/waku-broadcaster-client-web";
import { groth16 } from "snarkjs";
import memdown from "memdown";
import {
  JsonRpcProvider,
  Contract,
  getAddress,
  keccak256,
} from "ethers";
import {
  launchPlan,
  swapPlan,
  redeemPlan,
  inspectPosition,
  endpoint,
  TOKEN_ABI,
} from "../../../web/v4/client.mjs";
import { inspectSubmission } from "../../../web/privacy/submission.mjs";
import {composePrivateCalls, verifyPrivatePlan} from "./composition.mjs";

const VERSION = TXIDVersion.V2_PoseidonMerkle;
const NETWORKS = { 1: "Ethereum", 42161: "Arbitrum", 137: "Polygon" };
const nonce = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const SAFE = new Set([
  "Private wallet is locked.",
  "Terms changed. Prepare a new review.",
  "No compatible broadcaster is available. Private mode never falls back to a public wallet.",
  "The broadcaster fee expired. Prepare a new review and proof.",
  "Generate the reviewed proof before submitting.",
  "A private transaction is already being submitted.",
  "Creator fee settings changed. Prepare a new review.",
]);
export class RailgunRuntime {
  constructor(event = () => {}) {
    this.event = event;
    this.generation = 0;
    this.prepared = null;
    this.submitting = false;
    this.started = false;
    this.initializing = false;
  }
  async initialize({ mnemonic, settings }) {
    if (this.started || this.initializing)
      throw Error("Wallet is already open. Lock before changing networks.");
    this.initializing = true;
    const network = NETWORKS[Number(settings.chainId)];
    if (!network) throw Error("This chain has no supported private v4 path.");
    const rpc = endpoint(settings.rpc),
      poi = endpoint(settings.poi);
    sdk.assertValidRailgunAddress(settings.trustedFeeSigner);
    this.network = network;
    this.config = { ...settings, rpc, poi };
    this.chain = NETWORK_CONFIG[network].chain;
    this.provider = new JsonRpcProvider(rpc, Number(settings.chainId), {
      staticNetwork: false,
      cacheTimeout: -1,
    });
    if ((await this.provider.getNetwork()).chainId !== BigInt(settings.chainId))
      throw Error("RPC chain does not match the selected network.");
    sdk.setLoggers(
      () => {},
      () => {},
    );
    // The wallet's decrypted notes and all Merkle scan indexes live only in this worker's RAM.
    // Only public proving artifacts are cacheable. There is no persistent wallet/balance database.
    const artifacts = new Map();
    const store = new sdk.ArtifactStore(
      async (p) => artifacts.get(p) ?? null,
      async (d, p, item) => artifacts.set(p, item),
      async (p) => artifacts.has(p),
    );
    await sdk.startRailgunEngine(
      "animagenesis",
      memdown(),
      false,
      store,
      false,
      false,
      [poi],
      undefined,
      false,
    );
    sdk.getProver().setSnarkJSGroth16(groth16);
    this.encryptionKey = nonce();
    this.info = await sdk.createRailgunWallet(
      this.encryptionKey,
      mnemonic,
      undefined,
    );
    sdk.setOnUTXOMerkletreeScanCallback(({ progress, scanStatus }) =>
      this.event({ type: "scan", progress, status: scanStatus }),
    );
    sdk.setOnBalanceUpdateCallback((event) => {
      if (event.railgunWalletID === this.info.id)
        this.event({
          type: "balances",
          bucket: event.balanceBucket,
          balances: event.erc20Amounts,
        });
    });
    const loaded = await sdk.loadProvider(
      {
        chainId: Number(settings.chainId),
        providers: [
          { provider: rpc, priority: 1, weight: 1, maxLogsPerBatch: 1000 },
        ],
      },
      network,
      15000,
    );
    this.fees = loaded.feesSerialized;
    this.relay = getAddress(NETWORK_CONFIG[network].relayAdaptContract);
    if ((await this.provider.getCode(this.relay)) === "0x")
      throw Error("RAILGUN RelayAdapt is unavailable on this chain.");
    const poiActiveListKeys =
      await sdk.POIRequired.getRequiredListKeys(network);
    await Waku.start(
      this.chain,
      {
        trustedFeeSigner: settings.trustedFeeSigner,
        poiActiveListKeys,
        enableHealthcheckLogs: false,
      },
      (chain, status) => this.event({ type: "broadcaster", status }),
      { log: () => {}, error: () => {} },
    );
    Waku.setHealthcheckLoggingEnabled(false);
    this.started = true;
    this.initializing = false;
    return {
      address: this.info.railgunAddress,
      chainId: Number(settings.chainId),
      relay: this.relay,
      fees: this.fees,
    };
  }
  assertOpen() {
    if (!this.started) throw Error("Private wallet is locked.");
  }
  invalidate() {
    this.generation++;
    this.prepared = null;
  }
  async balance(token) {
    this.assertOpen();
    return sdk.balanceForERC20Token(
      VERSION,
      sdk.walletForID(this.info.id),
      this.network,
      getAddress(token),
      true,
    );
  }
  async balanceView(token) {
    this.assertOpen();
    const address = getAddress(token),
      asset = new Contract(address, TOKEN_ABI, this.provider),
      [amount, decimals] = await Promise.all([
        this.balance(address),
        asset.decimals(),
      ]);
    if (Number(decimals) > 36) throw Error("Unsupported token decimals.");
    let symbol = "tokens";
    try {
      symbol = String(await asset.symbol()).slice(0, 24);
    } catch {}
    return { amount, decimals: Number(decimals), symbol };
  }
  async prepare({ kind, input, feeToken }) {
    this.assertOpen();
    if (this.submitting)
      throw Error("A private transaction is already being submitted.");
    this.invalidate();
    const generation = this.generation;
    const builders = { launch: launchPlan, swap: swapPlan, redeem: redeemPlan };
    if (!builders[kind]) throw Error("Unsupported private operation.");
    const plan = await builders[kind](
      this.provider,
      {...this.config, privateFunding: true},
      input,
      this.relay,
    );
    const feeContract = new Contract(
      NETWORK_CONFIG[this.network].proxyContract,
      [
        "function unshieldFee() view returns(uint256)",
        "function shieldFee() view returns(uint256)",
      ],
      this.provider,
    );
    const [unshieldFee, shieldFee] = await Promise.all([
      feeContract.unshieldFee(),
      feeContract.shieldFee(),
    ]);
    const {spend, refunds, calls, planFingerprint} = await composePrivateCalls(
      plan, this.relay, this.info.railgunAddress, unshieldFee, nonce().slice(0, 32),
    );
    const broadcaster = await Waku.findBestBroadcaster(
      this.chain,
      getAddress(feeToken),
      true,
    );
    if (
      !broadcaster ||
      getAddress(broadcaster.tokenFee.relayAdapt) !== this.relay
    )
      throw Error(
        "No compatible broadcaster is available. Private mode never falls back to a public wallet.",
      );
    const gasPrice = (await this.provider.getFeeData()).gasPrice;
    if (!gasPrice || gasPrice <= 0n) throw Error("Gas pricing is unavailable.");
    const feeDetails = {
      tokenAddress: getAddress(feeToken),
      feePerUnitGas: BigInt(broadcaster.tokenFee.feePerUnitGas),
    };
    const originalGas = {
      evmGasType: EVMGasType.Type0,
      gasEstimate: 0n,
      gasPrice,
    };
    const minGasLimit = kind === "launch" ? 8000000n : undefined;
    const estimated = await sdk.gasEstimateForUnprovenCrossContractCalls(
      VERSION,
      this.network,
      this.info.id,
      this.encryptionKey,
      spend,
      [],
      refunds,
      [],
      calls,
      originalGas,
      feeDetails,
      false,
      minGasLimit,
    );
    const gasDetails = {
      ...originalGas,
      gasEstimate: (estimated.gasEstimate * 120n) / 100n,
    };
    const fee = {
      ...sdk.calculateBroadcasterFeeERC20Amount(feeDetails, gasDetails),
      recipientAddress: broadcaster.railgunAddress,
    };
    const required = new Map();
    for (const item of [...spend, fee]) {
      const a = getAddress(item.tokenAddress);
      required.set(a, (required.get(a) || 0n) + item.amount);
    }
    for (const [a, needed] of required)
      if ((await this.balance(a)) < needed)
        throw Error(
          "Insufficient spendable shielded balance, including protocol and broadcaster fees. Finish synchronization and any required POI processing first.",
        );
    if (generation !== this.generation)
      throw Error("Terms changed. Prepare a new review.");
    const id = nonce();
    this.prepared = {
      id,
      generation,
      plan,
      planFingerprint,
      spend,
      outputs: refunds,
      calls,
      broadcaster,
      fee,
      gasDetails,
      minGasLimit,
      gasPrice,
      expires: Math.min(
        Number(broadcaster.tokenFee.expiration) - 40000,
        plan.deadline * 1000,
      ),
      proof: null,
    };
    this.assertFresh(id);
    const feeAsset = new Contract(fee.tokenAddress, TOKEN_ABI, this.provider),
      feeDecimals = Number(await feeAsset.decimals());
    if (feeDecimals > 36) throw Error("Unsupported fee token decimals.");
    let feeSymbol = "tokens";
    try {
      feeSymbol = String(await feeAsset.symbol()).slice(0, 24);
    } catch {}
    this.assertFresh(id);
    return {
      id,
      summary: plan.summary,
      kind,
      spend,
      fee: { ...fee, decimals: feeDecimals, symbol: feeSymbol },
      unshieldFeeBps: String(unshieldFee),
      shieldFeeBps: String(shieldFee),
      expires: this.prepared.expires,
      outputs: plan.outputs,
      planFingerprint,
      disclosure:
        "Pool, token addresses, amounts, price and timing remain public. The funding note, returned balances and private recipient are shielded. Deposits and later public withdrawals can reveal links." + (plan.hook ? " Hook ownership, fee recipients and splitter weights are public. Reusing these addresses can link launches. The hook owner can change future fees and routing." : ""),
    };
  }
  assertFresh(id) {
    this.assertOpen();
    const p = this.prepared;
    if (!p || p.id !== id || p.generation !== this.generation)
      throw Error("Terms changed. Prepare a new review.");
    if (Date.now() >= p.expires)
      throw Error(
        "The broadcaster fee expired. Prepare a new review and proof.",
      );
    return p;
  }
  async prove({ id }) {
    const p = this.assertFresh(id);
    p.proof = null;
    await verifyPrivatePlan(this.provider, this.config, p.plan, this.relay, p.planFingerprint);
    this.assertFresh(id);
    await sdk.generateCrossContractCallsProof(
      VERSION,
      this.network,
      this.info.id,
      this.encryptionKey,
      p.spend,
      [],
      p.outputs,
      [],
      p.calls,
      p.fee,
      false,
      p.gasPrice,
      p.minGasLimit,
      (progress, status) => this.event({ type: "proof", progress, status }),
    );
    this.assertFresh(id);
    const proof = await sdk.populateProvedCrossContractCalls(
      VERSION,
      this.network,
      this.info.id,
      p.spend,
      [],
      p.outputs,
      [],
      p.calls,
      p.fee,
      false,
      p.gasPrice,
      p.gasDetails,
    );
    this.assertFresh(id);
    await verifyPrivatePlan(this.provider, this.config, p.plan, this.relay, p.planFingerprint);
    this.assertFresh(id);
    if (
      getAddress(proof.transaction.to) !== this.relay ||
      proof.transaction.from ||
      BigInt(proof.transaction.value || 0) !== 0n
    )
      throw Error("Unexpected private transaction envelope.");
    p.proof = proof;
    return {
      id,
      ready: true,
      expires: p.expires,
      requestHash: keccak256(proof.transaction.data),
      relay: this.relay,
      chainId: Number(this.config.chainId),
    };
  }
  async send({ id }) {
    if (this.submitting)
      throw Error("A private transaction is already being submitted.");
    const p = this.prepared;
    if (!p || p.id !== id || !p.proof) throw Error("Generate the reviewed proof before submitting.");
    this.submitting = true;
    let broadcastAttempted = false;
    try {
      this.assertFresh(id);
      await verifyPrivatePlan(this.provider, this.config, p.plan, this.relay, p.planFingerprint);
      this.assertFresh(id);
      const broad = await BroadcasterTransaction.create(
        VERSION,
        p.proof.transaction.to,
        p.proof.transaction.data,
        p.broadcaster.railgunAddress,
        p.broadcaster.tokenFee.feesID,
        this.chain,
        p.proof.nullifiers ?? [],
        p.gasPrice,
        true,
        p.proof.preTransactionPOIsPerTxidLeafPerList,
      );
      this.assertFresh(id);
      // Once send is entered, even a rejected promise may have reached a peer.
      // Only failures strictly before this boundary can release a reservation.
      broadcastAttempted = true;
      const hash = await broad.send();
      this.invalidate();
      await this.event({
        type: "submission",
        id,
        hash,
        requestHash: keccak256(p.proof.transaction.data),
        relay: this.relay,
        chainId: Number(this.config.chainId),
      });
      // No signer or eth_sendTransaction API exists in this private path.
      const receipt = await this.provider.waitForTransaction(hash, 2, 180000);
      if (!receipt || receipt.status !== 1)
        throw Error(
          "Broadcast returned a hash but successful inclusion is not confirmed. Check private history before retrying.",
        );
      const error = sdk.getRelayAdaptTransactionError(VERSION, receipt.logs);
      if (error)
        throw Error(
          "The RelayAdapt operation reverted. Check private history before retrying.",
        );
      return {
        hash,
        state: "confirmed",
        blockNumber: receipt.blockNumber,
        chainId: this.config.chainId,
      };
    } catch (error) {
      if (broadcastAttempted) throw error;
      this.invalidate();
      return {
        state: "not-submitted", broadcastAttempted: false, id,
        requestHash: keccak256(p.proof.transaction.data),
        relay: this.relay, chainId: Number(this.config.chainId),
        message: publicError(error, "prepare"),
      };
    } finally {
      this.submitting = false;
    }
  }
  async recover(input) {
    this.assertOpen();
    return inspectSubmission(this.provider, input, (logs) =>
      sdk.getRelayAdaptTransactionError(VERSION, logs),
    );
  }
  async inspect(input) {
    this.assertOpen();
    return inspectPosition(this.provider, this.config, input);
  }
  async shield({ tokenAddress, amount }) {
    this.assertOpen();
    tokenAddress = getAddress(tokenAddress);
    amount = BigInt(amount);
    if (amount <= 0n) throw Error("Amount must be positive.");
    const result = await sdk.populateShield(
      VERSION,
      this.network,
      nonce(),
      [{ tokenAddress, amount, recipientAddress: this.info.railgunAddress }],
      [],
    );
    return {
      transaction: result.transaction,
      spender: NETWORK_CONFIG[this.network].proxyContract,
      tokenAddress,
      amount,
      disclosure:
        "Shielding is a public deposit: the funding address, token, amount and timing are visible. It does not erase earlier links.",
    };
  }
  async stop() {
    this.invalidate();
    this.started = false;
    this.encryptionKey = null;
    this.info = null;
    await Waku.stop();
    await sdk.stopRailgunEngine();
    this.provider?.destroy();
  }
}
export function publicError(error, method) {
  const text = String(error?.message || "");
  if (SAFE.has(text)) return text;
  if (method === "send")
    return "Broadcast status is uncertain. Check the private wallet history before trying again; do not assume nothing was submitted.";
  if (
    /Insufficient spendable|unsupported|Unsupported|expired|minimum|Minimum|range|Range|bytecode|PoolManager|RPC chain|different|salt|decimals|Amount|amount must|quote|budgets|Budgets/i.test(
      text,
    ) &&
    text.length < 260 &&
    !/https?:|0x[0-9a-f]{64}/i.test(text)
  )
    return text;
  return "The private operation could not complete. Check the network settings, spendable balance, synchronization and broadcaster availability. No public fallback was attempted.";
}
