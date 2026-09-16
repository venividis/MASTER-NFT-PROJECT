import { Contract, getAddress, keccak256 } from "ethers";

export const GUARD_ABI = [
  "function getGrant(uint256) view returns(tuple(address account,address owner,address worker,address target,bytes32 dataHash,bytes32 targetCodeHash,bytes4 selector,uint96 value,uint112 remaining,uint48 validAfter,uint48 validUntil,uint48 lastRun,uint32 minInterval,uint32 callsRemaining,uint64 epoch,bool revoked,uint256 instrumentId,address asset,uint112 perCall))",
  "function run(uint256 id,uint256 expectedNonce,bytes data) returns(bytes)",
  "event ActionExecuted(uint256 indexed id,uint256 indexed nonce,address indexed worker,bytes32 resultHash,bytes32 auditRoot)",
];
const ACCOUNT_ABI = [
  "function currentOwner() view returns(address)",
  "function actionNonce() view returns(uint256)",
  "function sessionEpoch() view returns(uint64)",
  "function mode() view returns(uint8)",
];

/** A proposal provider sees public state only. It cannot change the owner-approved calldata. */
export function scheduledProposal({ grantId, data }) {
  return async (snapshot) => ({
    grantId: String(grantId),
    expectedNonce: snapshot.nonce,
    data,
  });
}

/** RPC and signer are injected by the launcher; generated content never chooses a transport. */
export class BoundedOperator {
  constructor({
    provider,
    signer,
    guard,
    grantId,
    data,
    chainId,
    propose,
    receipt = async () => {},
    execute = false,
    maxGasPerAction = 1000000,
    maxGasPriceWei = 100000000000,
  }) {
    this.provider = provider;
    this.signer = signer;
    this.guard = new Contract(getAddress(guard), GUARD_ABI, signer);
    this.grantId = BigInt(grantId);
    this.data = data;
    this.chainId = BigInt(chainId);
    this.propose = propose ?? scheduledProposal({ grantId, data });
    this.receipt = receipt;
    this.execute = execute;
    this.busy = false;
    this.maxGasPerAction = BigInt(maxGasPerAction);
    this.maxGasPriceWei = BigInt(maxGasPriceWei);
    if (
      this.maxGasPerAction < 25000n ||
      this.maxGasPerAction > 10000000n ||
      this.maxGasPriceWei <= 0n
    )
      throw Error("Invalid operator gas limits");
  }
  async tick() {
    if (this.busy) throw Error("Operator is already processing an action");
    this.busy = true;
    try {
      if ((await this.provider.getNetwork()).chainId !== this.chainId)
        throw Error("Configured chain mismatch");
      const g = await this.guard.getGrant(this.grantId);
      if (g.worker !== getAddress(await this.signer.getAddress()))
        throw Error("Worker does not own this grant");
      const account = new Contract(g.account, ACCOUNT_ABI, this.provider);
      const [owner, epoch, mode, nonce, block] = await Promise.all([
        account.currentOwner(),
        account.sessionEpoch(),
        account.mode(),
        account.actionNonce(),
        this.provider.getBlock("latest"),
      ]);
      const now = BigInt(block.timestamp);
      if (g.revoked || g.owner !== owner || g.epoch !== epoch || mode !== 0n)
        throw Error("Grant revoked or NFT custody changed");
      if (
        keccak256(this.data) !== g.dataHash ||
        now >= g.validUntil ||
        g.callsRemaining === 0n ||
        g.remaining === 0n ||
        g.remaining < g.value
      )
        throw Error("Grant expired, exhausted, or calldata changed");
      if (
        now < g.validAfter ||
        (g.lastRun !== 0n && now < g.lastRun + g.minInterval)
      )
        return { status: "waiting" };
      const snapshot = Object.freeze({
        grantId: String(this.grantId),
        account: g.account,
        owner,
        nonce: String(nonce),
        time: block.timestamp,
        callsRemaining: String(g.callsRemaining),
        remaining: String(g.remaining),
      });
      const p = await this.propose(snapshot);
      if (p == null) return { status: "idle" };
      if (
        String(p.grantId) !== String(this.grantId) ||
        BigInt(p.expectedNonce) !== nonce ||
        typeof p.data !== "string" ||
        keccak256(p.data) !== g.dataHash
      )
        throw Error("Proposal exceeds exact owner authorization");
      // Both this simulation and the submitted transaction re-check nonce, session, custody and budgets.
      await this.guard.run.staticCall(this.grantId, nonce, p.data);
      if (!this.execute) return { status: "simulated", ...snapshot };
      const [estimated, fees] = await Promise.all([
        this.guard.run.estimateGas(this.grantId, nonce, p.data),
        this.provider.getFeeData(),
      ]);
      const gasLimit = (estimated * 120n) / 100n;
      const gasPrice = fees.gasPrice ?? fees.maxFeePerGas;
      if (
        gasLimit > this.maxGasPerAction ||
        gasPrice == null ||
        gasPrice > this.maxGasPriceWei
      )
        throw Error("Operator gas budget exceeded");
      const tx = await this.guard.run(this.grantId, nonce, p.data, {
        gasLimit,
        gasPrice,
      });
      await this.receipt({
        status: "submitted",
        grantId: String(this.grantId),
        nonce: String(nonce),
        transaction: tx.hash,
      });
      const r = await tx.wait();
      if (r.status !== 1) throw Error("Action transaction reverted");
      const event = r.logs
        .map((log) => {
          try {
            return this.guard.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e?.name === "ActionExecuted");
      if (!event) throw Error("Missing guard action receipt");
      const record = {
        status: "executed",
        grantId: String(this.grantId),
        nonce: String(nonce),
        transaction: tx.hash,
        blockNumber: r.blockNumber,
        resultHash: event.args.resultHash,
        auditRoot: event.args.auditRoot,
      };
      await this.receipt(record);
      return record;
    } finally {
      this.busy = false;
    }
  }
  async run({ signal, intervalMs = 5000, maxTicks = Infinity } = {}) {
    if (intervalMs < 1000 || intervalMs > 60000)
      throw Error("Polling interval must be 1–60 seconds");
    let ticks = 0;
    while (!signal?.aborted && ticks++ < maxTicks) {
      await this.tick();
      if (ticks < maxTicks && !signal?.aborted)
        await new Promise((resolve) => {
          const timer = setTimeout(done, intervalMs);
          function done() {
            clearTimeout(timer);
            signal?.removeEventListener("abort", done);
            resolve();
          }
          signal?.addEventListener("abort", done, { once: true });
        });
    }
  }
}
