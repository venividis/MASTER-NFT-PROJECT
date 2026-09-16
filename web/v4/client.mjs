import {
  Contract,
  Interface,
  getAddress,
  keccak256,
  parseUnits,
  formatUnits,
  ZeroAddress,
} from "../vendor/ethers.min.js";
import { ARTIFACTS } from "./artifacts.mjs";
import {hookedLaunchPlan, hookedSwapPlan, verifyHookContract} from "../launchpad/hook-client.mjs";
import {
  sqrtAtTick,
  startingPrice,
  resolveHumanRange,
  liquidityForBudgets,
  MIN_SQRT,
  MAX_SQRT,
} from "./math.mjs";
export const TOKEN_ABI = [
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
];
export const POOL =
  "tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
const QUOTER_ABI = [
  `function quoteExactInputSingle(tuple(${POOL} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData)) returns(uint256 amountOut,uint256 gasEstimate)`,
  "function poolManager() view returns(address)",
];
export const V4_NETWORKS = {
  1: {
    name: "Ethereum",
    manager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
    quoter: "0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203",
  },
  42161: {
    name: "Arbitrum",
    manager: "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
    quoter: "0x3972c00f7ed4885e145823eb7c655375d275a1c5",
  },
  137: {
    name: "Polygon",
    manager: "0x67366782805870060151383f4bbff9dab53e5cd6",
    quoter: "0xb3d5c3dfc3a7aebff71895a7191796bffc2c81b9",
  },
};
export function endpoint(value) {
  const u = new URL(value);
  if (u.username || u.password || u.hash || u.protocol !== "https:")
    throw Error(
      "Use an HTTPS endpoint without embedded username, password or fragment.",
    );
  return u.href;
}
export function normalizeRuntime(code, artifact) {
  if ((code.length - 2) / 2 !== artifact.bytes)
    throw Error("Contract bytecode does not match this release.");
  // Every use of one Solidity immutable must contain the same constructor word.
  // Checking only its getter after masking would miss a substituted call-site copy.
  for (const group of artifact.immutableGroups || []) {
    if (group.length < 2) continue;
    const first = group[0];
    const expected = code.slice(2 + first.start * 2, 2 + (first.start + first.length) * 2).toLowerCase();
    for (const ref of group.slice(1)) {
      const value = code.slice(2 + ref.start * 2, 2 + (ref.start + ref.length) * 2).toLowerCase();
      if (value !== expected) throw Error("Contract immutable values are inconsistent across executable code.");
    }
  }
  let s = code.slice(2);
  for (const r of artifact.masks)
    s =
      s.slice(0, r.start * 2) +
      "0".repeat(r.length * 2) +
      s.slice((r.start + r.length) * 2);
  return keccak256("0x" + s);
}
export async function verifyContract(provider, address, name, manager) {
  address = getAddress(address);
  const a = ARTIFACTS[name];
  if (normalizeRuntime(await provider.getCode(address), a) !== a.normalizedHash)
    throw Error(`${name} bytecode does not match the reviewed build.`);
  const c = new Contract(address, a.abi, provider);
  if (getAddress(await c.manager()) !== getAddress(manager))
    throw Error("The contract uses a different PoolManager.");
  return c;
}
export async function verifiedNetwork(provider, config) {
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(config.chainId))
    throw Error("RPC or wallet chain changed.");
  const official = V4_NETWORKS[config.chainId];
  if (!official && Number(config.chainId) !== 31337)
    throw Error("This network is not supported by this release.");
  const manager = getAddress(official?.manager || config.manager);
  if ((await provider.getCode(manager)) === "0x")
    throw Error("PoolManager is not deployed on this network.");
  return { ...config, manager, quoter: official?.quoter || config.quoter };
}
async function token(provider, address) {
  address = getAddress(address);
  if (address === ZeroAddress || (await provider.getCode(address)) === "0x")
    throw Error(
      "Use a deployed standard ERC20 token; wrap native currency first.",
    );
  const c = new Contract(address, TOKEN_ABI, provider);
  const decimals = Number(await c.decimals());
  if (decimals > 36) throw Error("Token decimals are unsupported.");
  return { address, decimals };
}
function amount(value, decimals) {
  const n = parseUnits(String(value), decimals);
  if (n <= 0n || n > (1n << 127n) - 1n)
    throw Error("Amount must be positive and fit v4 settlement bounds.");
  return n;
}
function int(value, lo, hi) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < lo || n > hi)
    throw Error("Invalid integer setting.");
  return n;
}
const tx = (to, data) => ({ to, data, value: 0n });
export async function launchPlan(provider, config, input, payer) {
  if (input.creatorHook === true) {
    const hooked = await hookedLaunchPlan(provider, {
      ...config,
      hookFactory: input.hookFactory || config.hookFactory,
      hook: input.hook || config.hook,
    }, input, payer, {privateFunding: config.privateFunding === true});
    return {...hooked, kind: "launch", mechanism: "creator-hook"};
  }
  config = await verifiedNetwork(provider, config);
  const factory = await verifyContract(
      provider,
      config.factory,
      "GenesisV4Launchpad",
      config.manager,
    ),
    quote = await token(provider, input.quoteToken);
  const humanLower = String(input.humanLowerPrice ?? "").trim(),
    humanUpper = String(input.humanUpperPrice ?? "").trim();
  if (Boolean(humanLower) !== Boolean(humanUpper))
    throw Error("Enter both lower and upper human price limits, or leave both blank.");
  const humanRange = humanLower ? {lower: humanLower, upper: humanUpper} : input.range;
  const spacing = int(input.tickSpacing ?? 60, 1, 32767),
    lower = int(
      (humanRange ? undefined : input.tickLower) ?? Math.ceil(-887272 / spacing) * spacing,
      -887272,
      887272,
    ),
    upper = int(
      (humanRange ? undefined : input.tickUpper) ?? Math.floor(887272 / spacing) * spacing,
      -887272,
      887272,
    );
  if (lower >= upper || lower % spacing || upper % spacing)
    throw Error("Range ticks must be ordered and aligned to tick spacing.");
  const block = await provider.getBlock("latest");
  const terms = {
    name: String(input.name).trim(),
    symbol: String(input.symbol).trim(),
    supply: amount(input.supply, 18),
    quoteToken: quote.address,
    tokenBudget: amount(input.tokenBudget, 18),
    quoteBudget: amount(input.quoteBudget, quote.decimals),
    fee: int(input.fee ?? 3000, 0, 100000),
    tickSpacing: spacing,
    tickLower: lower,
    tickUpper: upper,
    sqrtPriceX96: 1n << 96n,
    liquidity: 1n,
    deadline: block.timestamp + 1800,
    salt: input.salt,
  };
  if (
    !terms.name ||
    new TextEncoder().encode(terms.name).length > 128 ||
    !terms.symbol ||
    new TextEncoder().encode(terms.symbol).length > 32 ||
    terms.tokenBudget > terms.supply ||
    !/^0x[0-9a-f]{64}$/i.test(terms.salt)
  )
    throw Error(
      "Check the name, symbol, supply, token budget and random launch salt.",
    );
  const [newToken] = await factory.predict(terms, payer);
  const tokenIs0 = BigInt(newToken) < BigInt(quote.address);
  if (humanRange) Object.assign(terms, resolveHumanRange(humanRange, quote.decimals, tokenIs0, spacing));
  terms.sqrtPriceX96 = startingPrice(input.price, quote.decimals, tokenIs0);
  terms.liquidity = liquidityForBudgets(
    terms.sqrtPriceX96,
    sqrtAtTick(terms.tickLower),
    sqrtAtTick(terms.tickUpper),
    tokenIs0 ? terms.tokenBudget : terms.quoteBudget,
    tokenIs0 ? terms.quoteBudget : terms.tokenBudget,
  );
  const [predictedToken, position] = await factory.predict(terms, payer);
  if (predictedToken !== newToken) throw Error("Token prediction changed while resolving the price range.");
  if (
    (await provider.getCode(predictedToken)) !== "0x" ||
    (await provider.getCode(position)) !== "0x"
  )
    throw Error("That launch salt is already used. Generate a fresh salt.");
  return {
    kind: "launch",
    chainId: Number(config.chainId),
    deadline: terms.deadline,
    request: tx(
      getAddress(config.factory),
      factory.interface.encodeFunctionData("launch", [terms]),
    ),
    spend: [{ tokenAddress: quote.address, amount: terms.quoteBudget }],
    outputs: [quote.address, predictedToken, position],
    terms,
    summary: {
      token: predictedToken,
      position,
      price: String(input.price) + " quote per token",
      liquidity: terms.liquidity.toString(),
      tokenBudget: input.tokenBudget,
      quoteBudget: input.quoteBudget,
      fee: terms.fee / 10000 + "% to liquidity owners",
      range: humanRange && humanRange.mode !== "full"
        ? `${humanRange.lower ?? humanRange.min} to ${humanRange.upper ?? humanRange.max} quote per token`
        : terms.tickLower + " to " + terms.tickUpper,
      rangeTicks: terms.tickLower + " to " + terms.tickUpper,
      ownership: "Redeemable ERC20 shares; no administrator",
    },
  };
}
export async function swapPlan(provider, config, input) {
  if (input.hook && getAddress(input.hook) !== ZeroAddress) {
    const hooked = await hookedSwapPlan(provider, {...config, hook: input.hook}, input);
    return {...hooked, kind: "swap", mechanism: "creator-hook"};
  }
  config = await verifiedNetwork(provider, config);
  const router = await verifyContract(
    provider,
    config.router,
    "GenesisV4Router",
    config.manager,
  );
  const [a, b] = await Promise.all([
    token(provider, input.inputToken),
    token(provider, input.outputToken),
  ]);
  if (a.address === b.address)
    throw Error("Choose different input and output tokens.");
  const direction = BigInt(a.address) < BigInt(b.address),
    key = {
      currency0: direction ? a.address : b.address,
      currency1: direction ? b.address : a.address,
      fee: int(input.fee ?? 3000, 0, 100000),
      tickSpacing: int(input.tickSpacing ?? 60, 1, 32767),
      hooks: ZeroAddress,
    };
  const exact = amount(input.amount, a.decimals),
    slippage = int(input.slippageBps ?? 50, 1, 1000);
  const block = await provider.getBlock("latest");
  const quoter = new Contract(getAddress(config.quoter), QUOTER_ABI, provider);
  if (getAddress(await quoter.poolManager()) !== getAddress(config.manager))
    throw Error("Quoter uses a different PoolManager.");
  const [expected] = await quoter.quoteExactInputSingle.staticCall([
    key,
    direction,
    exact,
    "0x",
  ]);
  const minimum = (expected * BigInt(10000 - slippage)) / 10000n;
  if (minimum === 0n || minimum > (1n << 127n) - 1n)
    throw Error("Quote output is outside supported limits.");
  const deadline = block.timestamp + 600;
  return {
    kind: "swap",
    chainId: Number(config.chainId),
    deadline,
    request: tx(
      getAddress(config.router),
      router.interface.encodeFunctionData("swap", [
        key,
        direction,
        exact,
        minimum,
        direction ? MIN_SQRT + 1n : MAX_SQRT - 1n,
        deadline,
        "0x",
      ]),
    ),
    spend: [{ tokenAddress: a.address, amount: exact }],
    outputs: [a.address, b.address],
    summary: {
      inputToken: a.address,
      outputToken: b.address,
      input: input.amount,
      expectedOutput: formatUnits(expected, b.decimals),
      minimumPoolOutput: formatUnits(minimum, b.decimals),
      maximumSlippage: slippage / 100 + "%",
    },
  };
}
export async function redeemPlan(provider, config, input) {
  config = await verifiedNetwork(provider, config);
  const p = await verifyContract(
    provider,
    input.position,
    "GenesisV4Position",
    config.manager,
  );
  await verifyPositionFactory(provider, config, input, p);
  const key = await p.poolKey(),
    shares = amount(input.shares, 18),
    deadline = (await provider.getBlock("latest")).timestamp + 600;
  const [t0, t1] = await Promise.all([
    token(provider, key.currency0),
    token(provider, key.currency1),
  ]);
  const minimum0 = parseUnits(String(input.minimum0 || "0"), t0.decimals),
    minimum1 = parseUnits(String(input.minimum1 || "0"), t1.decimals);
  if (minimum0 < 0n || minimum1 < 0n || (minimum0 === 0n && minimum1 === 0n))
    throw Error(
      "Set at least one nonzero minimum withdrawal amount to bound price movement.",
    );
  return {
    kind: "redeem",
    chainId: Number(config.chainId),
    deadline,
    request: tx(
      getAddress(input.position),
      p.interface.encodeFunctionData("redeem", [
        shares,
        minimum0,
        minimum1,
        deadline,
      ]),
    ),
    spend: [{ tokenAddress: getAddress(input.position), amount: shares }],
    outputs: [getAddress(input.position), key.currency0, key.currency1],
    summary: {
      position: getAddress(input.position),
      shares: input.shares,
      minimum0: input.minimum0,
      minimum1: input.minimum1,
      currency0: key.currency0,
      currency1: key.currency1,
      fees: "Your share of all earned fees is included",
    },
  };
}
export function crossContractCalls(plan) {
  const iface = new Interface(TOKEN_ABI),
    calls = [];
  for (const s of plan.spend)
    if (s.tokenAddress.toLowerCase() !== plan.request.to.toLowerCase()) {
      calls.push(
        tx(
          s.tokenAddress,
          iface.encodeFunctionData("approve", [plan.request.to, 0n]),
        ),
      );
      calls.push(
        tx(
          s.tokenAddress,
          iface.encodeFunctionData("approve", [plan.request.to, s.amount]),
        ),
      );
    }
  calls.push(plan.request);
  for (const s of plan.spend)
    if (s.tokenAddress.toLowerCase() !== plan.request.to.toLowerCase())
      calls.push(
        tx(
          s.tokenAddress,
          iface.encodeFunctionData("approve", [plan.request.to, 0n]),
        ),
      );
  return calls;
}
export async function inspectPosition(provider, config, input) {
  config = await verifiedNetwork(provider, config);
  const position = await verifyContract(
    provider,
    input.position,
    "GenesisV4Position",
    config.manager,
  );
  await verifyPositionFactory(provider, config, input, position);
  const key = await position.poolKey(),
    shares = amount(input.shares, 18),
    [amount0, amount1] = input.holder ? await position.previewRedeemFor(getAddress(input.holder),shares) : await position.previewRedeem(shares);
  const [token0, token1] = await Promise.all([
    token(provider, key.currency0),
    token(provider, key.currency1),
  ]);
  return {
    position: getAddress(input.position),
    currency0: key.currency0,
    currency1: key.currency1,
    amount0,
    amount1,
    decimals0: token0.decimals,
    decimals1: token1.decimals,
  };
}

async function verifyPositionFactory(provider, config, input, position) {
  const actual = getAddress(await position.factory()), key = await position.poolKey();
  if (getAddress(key.hooks) === ZeroAddress) {
    if (!config.factory || actual !== getAddress(config.factory)) throw Error("Position belongs to another launchpad.");
    await verifyContract(provider, actual, "GenesisV4Launchpad", config.manager);
  } else {
    const expected = input.hookFactory || config.hookFactory || config.factory;
    if (!expected || actual !== getAddress(expected)) throw Error("Position belongs to another hooked launchpad.");
    await verifyHookContract(provider, actual, "GenesisV4HookLaunchpad", {manager: config.manager});
    await verifyHookContract(provider, key.hooks, "OwnerV4FeeHook", {manager: config.manager});
  }
}
