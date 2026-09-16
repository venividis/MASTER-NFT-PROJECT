#!/usr/bin/env node
/** Funded external executor. Read-only by default; --execute authorizes bounded signing. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  JsonRpcProvider,
  Wallet,
  Contract,
  keccak256,
  parseUnits,
} from "ethers";
const json = (v) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? String(x) : x));
export function saveKeeperState(file, value) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temp = file + ".next",
    fd = fs.openSync(temp, "w", 0o600);
  try {
    fs.writeFileSync(fd, json(value) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, file);
  const dir = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(dir);
  } finally {
    fs.closeSync(dir);
  }
}
export async function scanV4Exits(vault, ids) {
  const result = [];
  for (const id of ids) {
    const [plan, next] = await Promise.all([
      vault.plan(id),
      vault.nextSlice(id),
    ]);
    result.push({
      id: String(id),
      owner: plan.owner,
      beneficiary: plan.beneficiary,
      remaining: String(plan.remaining),
      executed: String(plan.executed),
      slices: String(plan.slices),
      dueAt: String(next[2]),
      executable: next[3],
      input: String(next[0]),
      minimumOutput: String(next[1]),
      reward: String(plan.rewardPerSlice),
      rewardRemaining: String(plan.rewardRemaining),
      paused: plan.paused,
      cancelled: plan.cancelled,
    });
  }
  return result;
}
export async function recoverV4ExitTransaction(
  provider,
  pending,
  { confirmations = 2 } = {},
) {
  let receipt = await provider.getTransactionReceipt(pending.hash),
    replacement = null;
  if (
    !receipt &&
    (await provider.getTransactionCount(pending.sender, "latest")) >
      pending.nonce
  ) {
    const latest = await provider.getBlockNumber(),
      start = Math.max(pending.blockNumber, latest - 255);
    for (let n = latest; n >= start; n--) {
      const b = await provider.getBlock(n, true);
      for (const t of b?.prefetchedTransactions || []) {
        if (
          t.from.toLowerCase() === pending.sender.toLowerCase() &&
          t.nonce === pending.nonce
        ) {
          replacement = t.hash;
          receipt = await provider.getTransactionReceipt(t.hash);
          break;
        }
      }
      if (receipt) break;
    }
    if (!receipt) return { status: "nonce-used-receipt-unresolved", pending };
  }
  if (!receipt) return { status: "pending-or-unbroadcast", pending };
  const block = await provider.getBlock(receipt.blockNumber);
  if (!block || block.hash !== receipt.blockHash)
    return { status: "reorganized", pending };
  if (
    (await provider.getBlockNumber()) - receipt.blockNumber + 1 <
    confirmations
  )
    return { status: "confirming", pending, hash: receipt.hash };
  return {
    status: replacement
      ? "replaced"
      : receipt.status === 1
        ? "confirmed"
        : "reverted",
    hash: receipt.hash,
    replacement,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    gasPaid: String(receipt.gasUsed * receipt.gasPrice),
    resolved: true,
  };
}
async function main() {
  const [{ STRATEGY_ARTIFACTS }, { verifyStrategy }] = await Promise.all([
    import("../web/launchpad/strategies-artifacts.mjs"),
    import("../web/launchpad/strategies-client.mjs"),
  ]);
  const env = { ...process.env },
    execute = process.argv.includes("--execute"),
    watch = process.argv.includes("--watch"),
    compound = process.argv.includes("--compound");
  for (const suffix of [
    "RPC",
    "CHAIN_ID",
    "VAULT",
    "IDS",
    "STATE",
    "KEEPER_KEY",
    "GAS_BUDGET_WEI",
    "MAX_FEE_GWEI",
  ])
    env["ANIMA_V4_EXIT_" + suffix] ||= env["ANIMA_V4_STRATEGY_" + suffix];
  if (
    !env.ANIMA_V4_EXIT_RPC ||
    !env.ANIMA_V4_EXIT_CHAIN_ID ||
    !env.ANIMA_V4_EXIT_VAULT ||
    (!compound && !env.ANIMA_V4_EXIT_IDS)
  )
    throw Error(
      "Set ANIMA_V4_EXIT_RPC, ANIMA_V4_EXIT_CHAIN_ID, ANIMA_V4_EXIT_VAULT and ANIMA_V4_EXIT_IDS.",
    );
  const ids = compound ? ["1"] : env.ANIMA_V4_EXIT_IDS.split(",");
  if (
    !ids.length ||
    ids.length > 32 ||
    ids.some((v) => !/^\d{1,78}$/.test(v) || BigInt(v) < 1n)
  )
    throw Error("Choose 1–32 explicit positive plan IDs.");
  const provider = new JsonRpcProvider(env.ANIMA_V4_EXIT_RPC, undefined, {
    cacheTimeout: -1,
  });
  provider.pollingInterval = 1000;
  try {
    const chainId = String((await provider.getNetwork()).chainId);
    if (chainId !== env.ANIMA_V4_EXIT_CHAIN_ID)
      throw Error("RPC chain differs from the selected chain.");
    const verified = await verifyStrategy(
        provider,
        env.ANIMA_V4_EXIT_VAULT,
        compound ? "V4FeeCompounder" : "V4ScheduledExit",
      ),
      codeHash = keccak256(await provider.getCode(verified.target));
    const stateFile =
      env.ANIMA_V4_EXIT_STATE ||
      path.resolve(
        compound
          ? "reports/v4-compound-keeper-state.json"
          : "reports/v4-exit-keeper-state.json",
      );
    let state = fs.existsSync(stateFile)
      ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
      : {
          schema: "anima.v4-exit-keeper/1",
          chainId,
          vault: verified.target,
          codeHash,
          pending: null,
          receipts: [],
        };
    if (
      state.chainId !== chainId ||
      state.vault.toLowerCase() !== verified.target.toLowerCase() ||
      state.codeHash !== codeHash
    )
      throw Error("Keeper state belongs to another chain, vault or bytecode.");
    let signer,
      vault,
      remaining = 0n,
      maxFee = 0n;
    if (execute) {
      if (
        !env.ANIMA_V4_EXIT_KEEPER_KEY ||
        !env.ANIMA_V4_EXIT_GAS_BUDGET_WEI ||
        !env.ANIMA_V4_EXIT_MAX_FEE_GWEI
      )
        throw Error(
          "Execution requires a separately funded keeper key, gas budget in wei and gas-price cap in gwei.",
        );
      if (!["1", "11155111", "31337", "1337"].includes(chainId))
        throw Error(
          "This operator supports Ethereum execution gas; an L2 data-fee budget adapter is required for other networks.",
        );
      signer = new Wallet(env.ANIMA_V4_EXIT_KEEPER_KEY, provider);
      vault = new Contract(
        verified.target,
        STRATEGY_ARTIFACTS[
          compound ? "V4FeeCompounder" : "V4ScheduledExit"
        ].abi,
        signer,
      );
      remaining = BigInt(env.ANIMA_V4_EXIT_GAS_BUDGET_WEI);
      maxFee = parseUnits(env.ANIMA_V4_EXIT_MAX_FEE_GWEI, "gwei");
      if (remaining <= 0n || maxFee <= 0n)
        throw Error("Gas limits must be positive.");
    }
    let stop = false;
    const onStop = () => {
      stop = true;
    };
    process.once("SIGINT", onStop);
    process.once("SIGTERM", onStop);
    do {
      if (state.pending) {
        const recovery = await recoverV4ExitTransaction(
          provider,
          state.pending,
        );
        console.log(json({ recovery }));
        if (recovery.resolved) {
          state.receipts.push(recovery);
          state.receipts = state.receipts.slice(-1000);
          state.pending = null;
          if (execute) saveKeeperState(stateFile, state);
        } else if (execute)
          throw Error(
            "Prior submission is unresolved. No new transaction was signed; inspect its hash or replacement before restarting.",
          );
      }
      let jobs;
      if (compound) {
        const [next, policy, balance] = await Promise.all([
          verified.nextCompound(),
          verified.policy(),
          verified.rewardBalance(),
        ]);
        jobs = [
          {
            id: "compound",
            executable: next[2],
            liquidity: String(next[0]),
            minimumShares: String(next[1]),
            reward: String(policy.reward),
            rewardRemaining: String(balance),
          },
        ];
      } else jobs = await scanV4Exits(verified, ids);
      console.log(
        json({
          mode: execute ? "funded execution" : "read-only",
          chainId,
          vault: verified.target,
          codeHash,
          jobs,
        }),
      );
      if (execute)
        for (const job of jobs) {
          if (stop || !job.executable) continue;
          let gas;
          try {
            gas = await vault.execute.estimateGas(
              ...(compound ? [] : [job.id]),
            );
          } catch {
            console.log(
              json({
                id: job.id,
                status:
                  "Price or execution dependency blocks this slice; input remains recoverable.",
              }),
            );
            continue;
          }
          const fees = await provider.getFeeData(),
            fee = fees.maxFeePerGas || fees.gasPrice,
            gasLimit = (gas * 120n) / 100n + 1n;
          if (!fee || fee > maxFee) continue;
          const reserve = gasLimit * fee;
          if (
            reserve > remaining ||
            reserve > (await provider.getBalance(signer.address, "pending"))
          )
            throw Error("Keeper gas budget or funded balance is exhausted.");
          const request = await signer.populateTransaction({
            to: verified.target,
            data: vault.interface.encodeFunctionData(
              "execute",
              compound ? [] : [job.id],
            ),
            gasLimit,
            ...(fees.maxFeePerGas
              ? {
                  maxFeePerGas: fee,
                  maxPriorityFeePerGas: fees.maxPriorityFeePerGas || 0n,
                }
              : { gasPrice: fee }),
          });
          const signed = await signer.signTransaction(request),
            hash = keccak256(signed);
          state.pending = {
            hash,
            sender: signer.address,
            nonce: request.nonce,
            blockNumber: await provider.getBlockNumber(),
            planId: job.id,
          };
          saveKeeperState(stateFile, state);
          remaining -= reserve;
          await provider.broadcastTransaction(signed);
          console.log(json({ id: job.id, status: "submitted", hash }));
          // Receipt uncertainty leaves durable pending state and stops new signatures.
          const receipt = await provider.waitForTransaction(hash, 2, 60000);
          if (!receipt)
            throw Error(
              "Receipt confirmation is pending. Restart to recover the durable submission.",
            );
          const recovery = await recoverV4ExitTransaction(
            provider,
            state.pending,
          );
          if (!recovery.resolved)
            throw Error(
              "Receipt is not canonical and confirmed; no further signing.",
            );
          remaining += reserve - BigInt(recovery.gasPaid);
          state.receipts.push(recovery);
          state.receipts = state.receipts.slice(-1000);
          state.pending = null;
          saveKeeperState(stateFile, state);
          console.log(json(recovery));
        }
      if (!watch || stop) break;
      await new Promise((resolve) => setTimeout(resolve, 15000));
    } while (!stop);
  } finally {
    provider.destroy();
  }
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  main().catch((error) => {
    console.error(error.shortMessage || error.message);
    process.exitCode = 1;
  });
