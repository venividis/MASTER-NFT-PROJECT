import {
  AbiCoder,
  Contract,
  ContractFactory,
  getAddress,
  getCreateAddress,
  keccak256,
  parseUnits,
  formatUnits,
  ZeroAddress,
} from "../vendor/ethers.min.js";
import { STRATEGY_ARTIFACTS } from "./strategies-artifacts.mjs";
import {
  normalizeRuntime,
  verifyContract,
  verifiedNetwork,
} from "../v4/client.mjs";
import { verifyHookContract } from "./hook-client.mjs";
import { MIN_SQRT, MAX_SQRT } from "../v4/math.mjs";
const coder = AbiCoder.defaultAbiCoder(),
  PAIR =
    "tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
const TOKEN = [
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
  "function balanceOf(address) view returns(uint256)",
];
const POSITION = [
  "function poolKey() view returns(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)",
  "function pendingFees(address) view returns(uint256,uint256)",
  "function previewReinvest(address) view returns(uint128)",
  "function liquidity() view returns(uint128)",
  "function totalSupply() view returns(uint256)",
  "function balanceOf(address) view returns(uint256)",
  "function collectFees(uint256,uint256,uint256) returns(uint256,uint256)",
  "function reinvestFees(uint128,uint256,uint256,uint256,uint256) returns(uint256)",
  "function addLiquidity(uint128,uint256,uint256,uint256,uint256) returns(uint256)",
];
const nz = (v) => {
  const a = getAddress(v);
  if (a === ZeroAddress) throw Error("Choose a nonzero deployed address.");
  return a;
};
const uint = (v, label, max = (1n << 127n) - 1n) => {
  if (!/^\d+$/.test(String(v))) throw Error(`${label} must be a whole number.`);
  const n = BigInt(v);
  if (n > max) throw Error(`${label} is too large.`);
  return n;
};
const positive = (v, label, max) => {
  const n = uint(v, label, max);
  if (n === 0n) throw Error(`${label} must be positive.`);
  return n;
};
const plain = (p) => ({
  currency0: p.currency0,
  currency1: p.currency1,
  fee: p.fee,
  tickSpacing: p.tickSpacing,
  hooks: p.hooks,
});
export async function verifyStrategy(
  provider,
  address,
  name,
  blockTag = "latest",
) {
  const a = nz(address),
    artifact = STRATEGY_ARTIFACTS[name];
  if (
    !artifact ||
    normalizeRuntime(await provider.getCode(a, blockTag), artifact) !==
      artifact.normalizedHash
  )
    throw Error(`${name} does not match this release.`);
  const c = new Contract(a, artifact.abi, provider),
    at = { blockTag };
  if (name === "V4SettlementConverter") {
    const router = await c.router(at),
      manager = await c.manager(at);
    await verifyContract(provider, router, "GenesisV4Router", manager);
    if (
      keccak256(await provider.getCode(router, blockTag)) !==
      (await c.routerCodeHash(at))
    )
      throw Error("Converter router code changed.");
  } else if (name === "V4FeeCompounder") {
    const position = await c.position(at),
      p = new Contract(
        position,
        ["function manager() view returns(address)"],
        provider,
      );
    await verifyContract(
      provider,
      position,
      "GenesisV4Position",
      await p.manager(at),
    );
    if (
      keccak256(await provider.getCode(position, blockTag)) !==
      (await c.positionCodeHash(at))
    )
      throw Error("Compounder position changed.");
  } else {
    const converter = await c.converter(at);
    await verifyStrategy(
      provider,
      converter,
      "V4SettlementConverter",
      blockTag,
    );
    if (
      keccak256(await provider.getCode(converter, blockTag)) !==
      (await c.converterCodeHash(at))
    )
      throw Error("Exit converter changed.");
  }
  return c;
}
export class StrategiesClient {
  constructor(chain) {
    this.chain = chain;
  }
  async context() {
    const generation = this.chain.generation;
    await this.chain.assertContext(generation);
    const provider = this.chain.provider,
      block = await provider.getBlock("latest"),
      payer = nz(this.chain.payer || this.chain.address);
    if (!block?.hash) throw Error("Current chain state unavailable.");
    const network = await verifiedNetwork(provider, {
      ...this.chain.config,
      chainId: Number(this.chain.chainId),
    });
    return {
      generation,
      provider,
      block,
      payer,
      manager: network.manager,
      at: { blockTag: block.number },
      chainId: Number(this.chain.chainId),
    };
  }
  async accept(
    c,
    kind,
    target,
    method,
    args,
    { spend = [], value = 0n, summary = {} } = {},
  ) {
    await this.chain.assertContext(c.generation);
    if (
      nz(this.chain.payer || this.chain.address) !== c.payer ||
      (await c.provider.getBlock(c.block.number))?.hash !== c.block.hash
    )
      throw Error("Funding account or reviewed block changed.");
    return this.chain.prepareExternal(
      {
        kind,
        payer: c.payer,
        chainId: c.chainId,
        request: {
          to: target.target,
          data: target.interface.encodeFunctionData(method, args),
          value,
        },
        spend,
        summary,
        meta: {
          stateBlock: c.block.number,
          stateBlockHash: c.block.hash,
          contract: target.target,
          manager: c.manager,
        },
      },
      { nftCompatible: true },
    );
  }
  async token(c, address) {
    address = nz(address);
    const t = new Contract(address, TOKEN, c.provider),
      [decimals, symbol, balance] = await Promise.all([
        t.decimals(c.at),
        t.symbol(c.at),
        t.balanceOf(c.payer, c.at),
      ]);
    if (Number(decimals) > 36) throw Error("Unsupported decimals.");
    return { address, decimals: Number(decimals), symbol, balance };
  }
  amount(v, t) {
    const n = parseUnits(String(v), t.decimals);
    return positive(n, "Amount");
  }
  async setup({ kind, router, converter, position, compoundOwner }) {
    const c = await this.context();
    if (this.chain.execution?.mode === "nft")
      throw Error("Select wallet funding to deploy infrastructure.");
    let name, args;
    if (kind === "converter") {
      name = "V4SettlementConverter";
      const network = await verifiedNetwork(c.provider, {
        ...this.chain.config,
        chainId: c.chainId,
      });
      await verifyContract(
        c.provider,
        nz(router),
        "GenesisV4Router",
        network.manager,
      );
      args = [nz(router)];
    } else if (kind === "exit") {
      name = "V4ScheduledExit";
      await verifyStrategy(
        c.provider,
        converter,
        "V4SettlementConverter",
        c.block.number,
      );
      args = [nz(converter)];
    } else if (kind === "compounder") {
      name = "V4FeeCompounder";
      await this.position(c, position);
      args = [nz(position), nz(compoundOwner || c.payer)];
    } else
      throw Error(
        "Choose converter, compounder or scheduled-exit infrastructure.",
      );
    const a = STRATEGY_ARTIFACTS[name],
      nonce = await c.provider.getTransactionCount(c.payer, "pending"),
      request = {
        ...(await new ContractFactory(a.abi, a.bytecode).getDeployTransaction(
          ...args,
        )),
        nonce,
        value: 0n,
      },
      predictedAddress = getCreateAddress({ from: c.payer, nonce });
    return this.chain.prepareExternal({
      kind: "strategy-setup",
      payer: c.payer,
      chainId: c.chainId,
      request,
      spend: [],
      predictedAddress,
      summary: {
        purpose: `Deploy ${name}`,
        predictedAddress,
        constructorArguments: args,
        ...(name==="V4FeeCompounder"?{fixedOwner:args[1],position:args[0]}:{}),
      },
      meta: { contractName: name, predictedAddress },
    });
  }
  async position(c, address) {
    await verifyContract(
      c.provider,
      nz(address),
      "GenesisV4Position",
      c.manager,
    );
    return new Contract(nz(address), POSITION, c.provider);
  }
  async inspectPosition({ position }) {
    const c = await this.context(),
      p = await this.position(c, position),
      key = plain(await p.poolKey(c.at)),
      [t0, t1, fees, liquidity, supply, shares] = await Promise.all([
        this.token(c, key.currency0),
        this.token(c, key.currency1),
        p.pendingFees(c.payer, c.at),
        p.liquidity(c.at),
        p.totalSupply(c.at),
        p.balanceOf(c.payer, c.at),
      ]);
    return {
      position: p.target,
      payer: c.payer,
      key,
      token0: t0,
      token1: t1,
      asset0: t0.symbol + " · " + t0.address,
      asset1: t1.symbol + " · " + t1.address,
      fees0: formatUnits(fees[0], t0.decimals),
      fees1: formatUnits(fees[1], t1.decimals),
      liquidity: String(liquidity),
      totalShares: String(supply),
      yourShares: String(shares),
      block: c.block.number,
    };
  }
  async collect({ position }) {
    const c = await this.context(),
      p = await this.position(c, position),
      fees = await p.pendingFees(c.payer, c.at);
    if (fees[0] + fees[1] === 0n) throw Error("No fees are currently earned.");
    return this.accept(
      c,
      "lp-collect-fees",
      p,
      "collectFees",
      [fees[0], fees[1], c.block.timestamp + 900],
      {
        summary: {
          purpose:
            "Collect your LP fees while preserving all principal and shares",
          payer: c.payer,
          amount0: String(fees[0]),
          amount1: String(fees[1]),
          rights:
            "Only the selected payer’s accrued fees. Principal and share supply do not decrease.",
        },
      },
    );
  }
  async reinvest({ position, liquidity }) {
    const c = await this.context(),
      p = await this.position(c, position),
      amount = liquidity
        ? positive(liquidity, "Liquidity increment")
        : ((await p.previewReinvest(c.payer, c.at)) * 99n) / 100n,
      fees = await p.pendingFees(c.payer, c.at),
      [supply, current] = await Promise.all([
        p.totalSupply(c.at),
        p.liquidity(c.at),
      ]);
    if (current === 0n) throw Error("The position is fully redeemed.");
    if (amount === 0n)
      throw Error(
        "Earn fees in both pool assets before reinvesting inside the active range.",
      );
    const minimum = (amount * supply) / current;
    if (minimum === 0n) throw Error("Liquidity increment is too small.");
    return this.accept(
      c,
      "lp-reinvest-fees",
      p,
      "reinvestFees",
      [amount, fees[0], fees[1], minimum, c.block.timestamp + 900],
      {
        summary: {
          purpose: "Reinvest only your earned LP fees in the same position",
          liquidityAdded: String(amount),
          minimumShares: String(minimum),
          maximum0: String(fees[0]),
          maximum1: String(fees[1]),
          rights:
            "Existing holder principal is preserved. Exact unused fee budgets return to the funding account. If either fee asset is insufficient, the operation reverts.",
        },
      },
    );
  }
  async route(c, { position, inputToken }) {
    const p = await this.position(c, position),
      key = plain(await p.poolKey(c.at)),
      input = nz(inputToken),
      direction = input === getAddress(key.currency0);
    if (!direction && input !== getAddress(key.currency1))
      throw Error("Input asset is not in this pool.");
    let hookData = "0x";
    if (key.hooks !== ZeroAddress) {
      const hook = await verifyHookContract(
        c.provider,
        key.hooks,
        "OwnerV4FeeHook",
        { manager: c.manager },
      );
      hookData = coder.encode(
        ["uint24", "uint64"],
        [await hook.feePpm(c.at), c.block.timestamp + 900],
      );
    }
    return {
      key,
      direction,
      outputToken: direction ? key.currency1 : key.currency0,
      hookData,
    };
  }
  encodedRoute(r, expires) {
    if (r.hookData !== "0x") {
      const [rate] = coder.decode(["uint24", "uint64"], r.hookData);
      r = {
        ...r,
        hookData: coder.encode(["uint24", "uint64"], [rate, expires]),
      };
    }
    return coder.encode(
      [PAIR, "bool", "uint160", "bytes"],
      [
        r.key,
        r.direction,
        r.direction ? MIN_SQRT + 1n : MAX_SQRT - 1n,
        r.hookData,
      ],
    );
  }
  async convert({
    splitter,
    converter,
    position,
    inputToken,
    amount,
    minimumOutput,
    recipient,
  }) {
    const c = await this.context(),
      fee = await verifyHookContract(c.provider, splitter, "OwnerFeeRouter"),
      conv = await verifyStrategy(
        c.provider,
        converter,
        "V4SettlementConverter",
        c.block.number,
      ),
      r = await this.route(c, { position, inputToken }),
      input = await this.token(c, inputToken),
      output = await this.token(c, r.outputToken),
      raw = this.amount(amount, input),
      minimum = this.amount(minimumOutput, output),
      deadline = c.block.timestamp + 900;
    if (!(await fee.converterAllowed(conv.target, c.at)))
      throw Error(
        "The splitter owner must enable this verified converter first.",
      );
    if ((await fee.claimable(input.address, c.payer, c.at)) < raw)
      throw Error("The funding account does not own enough earned fee claims.");
    const request = {
      tokenIn: input.address,
      amountIn: raw,
      tokenOut: output.address,
      converter: conv.target,
      minAmountOut: minimum,
      deadline,
      route: this.encodedRoute(r, deadline),
    };
    return this.accept(
      c,
      "fee-conversion",
      fee,
      "claimConverted",
      [request, nz(recipient || c.payer)],
      {
        summary: {
          purpose:
            "Convert your earned creator fees through the selected real v4 pool",
          input: formatUnits(raw, input.decimals) + " " + input.symbol,
          minimumOutput:
            formatUnits(minimum, output.decimals) + " " + output.symbol,
          recipient: nz(recipient || c.payer),
          rights:
            "Exact input, bounded output, no residual approvals. Other beneficiaries’ claims are untouched.",
        },
      },
    );
  }
  async enableConverter({ splitter, converter }) {
    const c = await this.context(),
      fee = await verifyHookContract(c.provider, splitter, "OwnerFeeRouter", {
        owner: c.payer,
      }),
      conv = await verifyStrategy(
        c.provider,
        converter,
        "V4SettlementConverter",
        c.block.number,
      );
    return this.accept(
      c,
      "fee-enable-converter",
      fee,
      "setConverter",
      [conv.target, true],
      {
        summary: {
          purpose:
            "Allow this verified v4 converter for beneficiary-selected payouts",
          converter: conv.target,
        },
      },
    );
  }
  async commitSplit({ splitter }) {
    const c = await this.context(),
      fee = await verifyHookContract(c.provider, splitter, "OwnerFeeRouter", {
        owner: c.payer,
      });
    if (await fee.splitCommitted(c.at))
      throw Error("This split is already irrevocably fixed.");
    const [recipients, weights] = await fee.recipients(c.at);
    return this.accept(c, "fee-commit-split", fee, "commitSplit", [], {
      summary: {
        purpose:
          "Irrevocably fix recipient weights for every future fee deposit",
        recipients: [...recipients],
        weights: [...weights].map(String),
        rights:
          "No future owner can change the split. Existing beneficiary claims remain independently withdrawable. Converter allowlisting is a separate revocable policy.",
      },
    });
  }
  async commit({ hook, maximumFeePpm, exactFee = false }) {
    const c = await this.context(),
      h = await verifyHookContract(c.provider, hook, "OwnerV4FeeHook", {
        owner: c.payer,
      }),
      recipient = await h.recipient(c.at),
      splitter = await h.routeToSplitter(c.at),
      maximum = uint(maximumFeePpm, "Maximum fee ppm", 999999n);
    if (await h.policyCommitted(c.at))
      throw Error("This fee policy is already irrevocably committed.");
    return this.accept(
      c,
      "fee-commit-policy",
      h,
      "commitPolicy",
      [maximum, recipient, splitter, Boolean(exactFee)],
      {
        summary: {
          purpose: "Irrevocably commit the hook fee policy",
          maximumFeePpm: String(maximum),
          fixedRecipient: recipient,
          exactFee: Boolean(exactFee),
          rights: splitter
            ? "The hook destination is fixed. Splitter beneficiary weights are a separate policy; freeze them separately if required."
            : "The destination cannot change, even after ownership transfer. The fee cannot exceed this ceiling; exact mode fixes the fee itself.",
        },
      },
    );
  }
  async createExit({
    exit,
    position,
    inputToken,
    amount,
    minimumOutput,
    beneficiary,
    slices = "12",
    intervalSeconds = "86400",
    start,
    expiry,
    rewardPerSlice = "0",
  }) {
    const c = await this.context(),
      e = await verifyStrategy(
        c.provider,
        exit,
        "V4ScheduledExit",
        c.block.number,
      ),
      r = await this.route(c, { position, inputToken }),
      input = await this.token(c, inputToken),
      output = await this.token(c, r.outputToken),
      total = this.amount(amount, input),
      minimum = this.amount(minimumOutput, output),
      count = positive(slices, "Slices", 10000n),
      interval = positive(
        intervalSeconds,
        "Interval seconds",
        (1n << 64n) - 1n,
      ),
      begins = start
        ? positive(start, "Start timestamp")
        : BigInt(c.block.timestamp + 300),
      last = begins + interval * (count - 1n),
      expires = expiry ? positive(expiry, "Expiry timestamp") : last + 86400n,
      reward = parseUnits(String(rewardPerSlice), 18);
    if (total > input.balance || total < count)
      throw Error("Insufficient input balance or slices below one token unit.");
    if (
      begins <= BigInt(c.block.timestamp) ||
      expires < last ||
      expires >= 1n << 64n ||
      reward < 0n ||
      reward >= 1n << 96n
    )
      throw Error("Invalid schedule or reward.");
    const terms = {
      tokenIn: input.address,
      tokenOut: output.address,
      beneficiary: nz(beneficiary || c.payer),
      totalInput: total,
      minimumTotalOutput: minimum,
      start: begins,
      interval,
      expires,
      slices: count,
      rewardPerSlice: reward,
      route: this.encodedRoute(r, expires),
    };
    return this.accept(c, "v4-exit-create", e, "create", [terms], {
      spend: [{ tokenAddress: input.address, amount: total }],
      value: reward * count,
      summary: {
        purpose: "Fund a bounded v4 sell schedule",
        input: formatUnits(total, input.decimals) + " " + input.symbol,
        minimumTotalOutput:
          formatUnits(minimum, output.decimals) + " " + output.symbol,
        beneficiary: terms.beneficiary,
        slices: String(count),
        intervalSeconds: String(interval),
        starts: String(begins),
        expires: String(expires),
        keeperRewardsETH: formatUnits(reward * count, 18),
        rights:
          "An external caller executes each due slice. Minimum price is enforced for each slice, so trades can remain pending. The creating account can pause or cancel and recover unsold input and unearned rewards.",
      },
    });
  }
  async compoundAction({
    compounder,
    action,
    amount,
    rewardAmount = "0",
    maximum0 = "0",
    maximum1 = "0",
    minimumLiquidity = "1",
    intervalSeconds = "86400",
    expiry,
    enabled = true,
  }) {
    const c = await this.context(),
      v = await verifyStrategy(
        c.provider,
        compounder,
        "V4FeeCompounder",
        c.block.number,
      ),
      owner = await v.owner(c.at);
    if (action === "read") {
      const p = await v.policy(c.at),
        n = await v.nextCompound(c.at),
        position = await v.position(c.at),
        token = new Contract(position, TOKEN, c.provider);
      return {
        compounder: v.target,
        owner,
        position,
        shares: formatUnits(await token.balanceOf(v.target, c.at), 18),
        enabled: p.enabled,
        nextLiquidity: String(n[0]),
        executable: n[2],
        intervalSeconds: String(p.interval),
        expires: String(p.expires),
        rewardBalanceETH: formatUnits(await v.rewardBalance(c.at), 18),
        yourRewardCreditETH: formatUnits(
          await v.rewardCredit(c.payer, c.at),
          18,
        ),
      };
    }
    if (action === "execute")
      return this.accept(c, "v4-compound-execute", v, "execute", [], {
        summary: {
          purpose:
            "Execute the owner’s bounded compounding policy; shares stay in their vault",
        },
      });
    if (action === "reward")
      return this.accept(
        c,
        "v4-compound-reward",
        v,
        "withdrawReward",
        [c.payer],
        { summary: { purpose: "Withdraw your earned compounder reward" } },
      );
    if (action === "fundRewards")
      return this.accept(c, "v4-compound-fund-rewards", v, "fundRewards", [], {
        value: parseUnits(String(rewardAmount), 18),
        summary: { purpose: "Prepay external compounding rewards", owner },
      });
    if (getAddress(owner) !== c.payer)
      throw Error(
        "Only the creating owner account can change compounder custody or policy.",
      );
    if (action === "fund" || action === "withdraw") {
      const position = await v.position(c.at),
        raw = positive(parseUnits(String(amount), 18), "LP shares");
      return this.accept(
        c,
        "v4-compound-" + action,
        v,
        action === "fund" ? "fundShares" : "withdrawShares",
        [raw],
        {
          spend:
            action === "fund" ? [{ tokenAddress: position, amount: raw }] : [],
          summary: {
            purpose:
              action === "fund"
                ? "Move selected LP shares into your revocable compounding vault"
                : "Withdraw your LP shares and their uncollected earnings",
            owner,
            shares: String(amount),
          },
        },
      );
    }
    if (action === "refundRewards")
      return this.accept(
        c,
        "v4-compound-refund",
        v,
        "refundRewards",
        [positive(parseUnits(String(rewardAmount), 18), "Refund amount")],
        {
          summary: {
            purpose: "Return unused keeper funding to owner reward credit",
            owner,
          },
        },
      );
    if (action === "collect")
      return this.accept(c, "v4-compound-collect", v, "collectFees", [], {
        summary: {
          purpose:
            "Collect compounded-position fees directly to the fixed owner",
          owner,
        },
      });
    if (action === "configure") {
      const t0 = await this.token(c, await v.token0(c.at)),
        t1 = await this.token(c, await v.token1(c.at)),
        policy = {
          maximumFee0: parseUnits(String(maximum0), t0.decimals),
          maximumFee1: parseUnits(String(maximum1), t1.decimals),
          minimumLiquidity: positive(minimumLiquidity, "Minimum liquidity"),
          interval: positive(intervalSeconds, "Interval seconds"),
          expires: expiry
            ? positive(expiry, "Expiry")
            : BigInt(c.block.timestamp + 30 * 86400),
          reward: parseUnits(String(rewardAmount), 18),
          enabled: Boolean(enabled),
        };
      return this.accept(c, "v4-compound-policy", v, "configure", [policy], {
        summary: {
          purpose: enabled
            ? "Enable bounded, externally executed fee compounding"
            : "Pause automatic compounding",
          owner,
          maximumToken0: maximum0,
          maximumToken1: maximum1,
          rewardPerExecutionETH: rewardAmount,
          intervalSeconds: String(policy.interval),
          expires: String(policy.expires),
          rights:
            "Shares and earned fees remain withdrawable by the fixed owner. Keepers cannot redirect assets, choose a different position or exceed these per-execution fee budgets.",
        },
      });
    }
    throw Error("Unknown compounder action.");
  }
  async inspectExit({ exit, id }) {
    const c = await this.context(),
      e = await verifyStrategy(
        c.provider,
        exit,
        "V4ScheduledExit",
        c.block.number,
      ),
      n = positive(id, "Plan ID"),
      [p, next] = await Promise.all([e.plan(n, c.at), e.nextSlice(n, c.at)]);
    if (p.owner === ZeroAddress) throw Error("Plan does not exist.");
    const input = await this.token(c, p.tokenIn),
      output = await this.token(c, p.tokenOut);
    return {
      id: String(n),
      owner: p.owner,
      beneficiary: p.beneficiary,
      remaining: formatUnits(p.remaining, input.decimals) + " " + input.symbol,
      executed: String(p.executed),
      slices: String(p.slices),
      nextAt: String(next[2]),
      executable: next[3],
      paused: p.paused,
      cancelled: p.cancelled,
      expires: String(p.expires),
      minimumNextOutput:
        formatUnits(next[1], output.decimals) + " " + output.symbol,
      rewardRemainingETH: formatUnits(p.rewardRemaining, 18),
      yourRewardCreditETH: formatUnits(await e.rewardCredit(c.payer, c.at), 18),
      minimumTotalOutput: String(p.minimumTotalOutput),
      block: c.block.number,
    };
  }
  async exitAction({ exit, id, action, paused, minimumTotalOutput }) {
    const c = await this.context(),
      e = await verifyStrategy(
        c.provider,
        exit,
        "V4ScheduledExit",
        c.block.number,
      ),
      n = positive(id, "Plan ID");
    if (action === "execute")
      return this.accept(c, "v4-exit-execute", e, "execute", [n], {
        summary: {
          purpose: "Execute one due slice to its recorded beneficiary",
          id: String(n),
        },
      });
    if (action === "withdraw")
      return this.accept(c, "v4-exit-reward", e, "withdrawReward", [c.payer], {
        summary: {
          purpose: "Withdraw your earned or refunded keeper rewards",
          recipient: c.payer,
        },
      });
    const p = await e.plan(n, c.at);
    if (getAddress(p.owner) !== c.payer)
      throw Error("Only the creating account can change this plan.");
    if (action === "cancel")
      return this.accept(c, "v4-exit-cancel", e, "cancel", [n], {
        summary: {
          purpose:
            "Cancel the schedule and recover unsold input and unearned rewards",
          id: String(n),
          recipient: c.payer,
        },
      });
    if (action === "pause")
      return this.accept(
        c,
        "v4-exit-configure",
        e,
        "configure",
        [
          n,
          minimumTotalOutput
            ? positive(minimumTotalOutput, "Minimum total output")
            : p.minimumTotalOutput,
          Boolean(paused),
        ],
        {
          summary: {
            purpose: paused ? "Pause future slices" : "Resume scheduled slices",
            id: String(n),
          },
        },
      );
    throw Error("Unknown exit action.");
  }
}

/** Receipt verification used by the shared owner transaction controller. */
export async function verifyStrategyReceipt(provider, record, receipt) {
  if (!record.final) return false;
  const kind = record.kind,
    request = record.innerRequest || record.request,
    at = { blockTag: receipt.blockNumber };
  if (kind === "strategy-setup") {
    const name = record.meta?.contractName,
      a = STRATEGY_ARTIFACTS[name],
      args = record.summary?.constructorArguments;
    if (!a || !Array.isArray(args))
      throw Error("Strategy deployment provenance is missing.");
    const expected = (
      await new ContractFactory(a.abi, a.bytecode).getDeployTransaction(...args)
    ).data;
    if (
      request?.data?.toLowerCase() !== expected.toLowerCase() ||
      !receipt.contractAddress ||
      getAddress(receipt.contractAddress) !==
        getAddress(record.meta.predictedAddress)
    )
      throw Error(
        "Strategy deployment differs from the reviewed constructor or predicted address.",
      );
    const c = await verifyStrategy(
      provider,
      receipt.contractAddress,
      name,
      receipt.blockNumber,
    );
    if (
      name === "V4SettlementConverter" &&
      getAddress(await c.router(at)) !== getAddress(args[0])
    )
      throw Error("Deployed converter has another router.");
    if (
      name === "V4ScheduledExit" &&
      getAddress(await c.converter(at)) !== getAddress(args[0])
    )
      throw Error("Deployed schedule has another converter.");
    if (
      name === "V4FeeCompounder" &&
      (getAddress(await c.position(at)) !== getAddress(args[0]) ||
        getAddress(await c.owner(at)) !== getAddress(args[1]))
    )
      throw Error("Deployed compounder has another position or owner.");
    record.meta.deployedAddress = c.target;
    return true;
  }
  const methods = {
    "lp-collect-fees": ["GenesisV4Position", "collectFees", "FeesCollected"],
    "lp-reinvest-fees": ["GenesisV4Position", "reinvestFees", "LiquidityAdded"],
    "fee-conversion": ["OwnerFeeRouter", "claimConverted", "Converted"],
    "fee-enable-converter": [
      "OwnerFeeRouter",
      "setConverter",
      "ConverterPermission",
    ],
    "fee-commit-policy": ["OwnerV4FeeHook", "commitPolicy", "PolicyCommitted"],
    "fee-commit-split": ["OwnerFeeRouter", "commitSplit", "SplitCommitted"],
    "v4-exit-create": ["V4ScheduledExit", "create", "PlanCreated"],
    "v4-exit-execute": ["V4ScheduledExit", "execute", "SliceExecuted"],
    "v4-exit-configure": ["V4ScheduledExit", "configure", "PlanChanged"],
    "v4-exit-cancel": ["V4ScheduledExit", "cancel", "PlanCancelled"],
    "v4-exit-reward": ["V4ScheduledExit", "withdrawReward", "RewardWithdrawn"],
    "v4-compound-execute": ["V4FeeCompounder", "execute", "Compounded"],
    "v4-compound-reward": [
      "V4FeeCompounder",
      "withdrawReward",
      "RewardWithdrawn",
    ],
    "v4-compound-fund-rewards": [
      "V4FeeCompounder",
      "fundRewards",
      "RewardsFunded",
    ],
    "v4-compound-fund": ["V4FeeCompounder", "fundShares", "SharesFunded"],
    "v4-compound-withdraw": [
      "V4FeeCompounder",
      "withdrawShares",
      "SharesWithdrawn",
    ],
    "v4-compound-refund": [
      "V4FeeCompounder",
      "refundRewards",
      "RewardsRefunded",
    ],
    "v4-compound-collect": ["V4FeeCompounder", "collectFees", null],
    "v4-compound-policy": ["V4FeeCompounder", "configure", "PolicyChanged"],
  };
  const selection = methods[kind];
  if (!selection) return false;
  const [name, method, eventName] = selection,
    address = getAddress(record.meta?.contract || request.to);
  if (getAddress(request.to) !== address)
    throw Error("Strategy target changed.");
  let c;
  if (STRATEGY_ARTIFACTS[name])
    c = await verifyStrategy(provider, address, name, receipt.blockNumber);
  else if (name === "GenesisV4Position")
    c = await verifyContract(provider, address, name, record.meta.manager);
  else
    c = await verifyHookContract(
      provider,
      address,
      name,
      name === "OwnerV4FeeHook" ? { manager: record.meta.manager } : {},
    );
  const decoded = c.interface.parseTransaction({
    data: request.data,
    value: request.value || 0,
  });
  if (decoded?.name !== method)
    throw Error("Strategy action differs from the reviewed method.");
  const logs = receipt.logs
    .filter((l) => getAddress(l.address) === address)
    .map((l) => {
      try {
        return c.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const event = eventName ? logs.find((l) => l.name === eventName) : null;
  if (eventName && !event)
    throw Error(
      "Confirmed transaction is missing its required strategy event.",
    );
  const payer = getAddress(record.payer || record.account);
  if (kind === "v4-exit-create") {
    if (
      getAddress(event.args.owner) !== payer ||
      getAddress(event.args.beneficiary) !==
        getAddress(decoded.args[0].beneficiary) ||
      event.args.totalInput !== decoded.args[0].totalInput
    )
      throw Error(
        "Created exit does not match the reviewed funding or recipient.",
      );
    const p = await c.plan(event.args.id, at);
    if (
      getAddress(p.owner) !== payer ||
      p.totalInput !== decoded.args[0].totalInput
    )
      throw Error("Created exit state differs from receipt.");
    record.meta.strategyId = String(event.args.id);
  }
  if (kind === "lp-collect-fees" || kind === "lp-reinvest-fees")
    if (getAddress(event.args.holder) !== payer)
      throw Error("LP earnings were credited to another holder.");
  if (kind === "fee-conversion" && getAddress(event.args.beneficiary) !== payer)
    throw Error("Another beneficiary’s conversion was observed.");
  if (kind === "fee-commit-policy") {
    const p = await c.committedPolicy(at);
    if (
      !p[0] ||
      p[1] !== decoded.args[0] ||
      getAddress(p[2]) !== getAddress(decoded.args[1]) ||
      p[3] !== decoded.args[2] ||
      p[4] !== decoded.args[3]
    )
      throw Error("Fee policy commitment differs from reviewed terms.");
  }
  if (kind === "fee-commit-split" && !(await c.splitCommitted(at)))
    throw Error("Splitter weights were not committed.");
  if (
    kind === "v4-exit-cancel" &&
    !(await c.plan(decoded.args[0], at)).cancelled
  )
    throw Error("Exit was not cancelled.");
  if (
    kind.endsWith("-reward") &&
    (getAddress(event.args.beneficiary) !== payer ||
      getAddress(event.args.recipient) !== getAddress(decoded.args[0]))
  )
    throw Error(
      "Reward withdrawal differs from the reviewed beneficiary or destination.",
    );
  return true;
}
