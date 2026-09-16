import {
  Contract,
  getAddress,
  AbiCoder,
  keccak256,
  formatUnits,
  ZeroAddress,
} from "../vendor/ethers.min.js";
import { ARTIFACTS } from "../v4/artifacts.mjs";
import { HOOK_ARTIFACTS } from "./hook-artifacts.mjs";
import { normalizeRuntime, verifiedNetwork } from "../v4/client.mjs";
const ABI = [
  "function name() view returns(string)",
  "function symbol() view returns(string)",
  "function decimals() view returns(uint8)",
  "function totalSupply() view returns(uint256)",
  "function balanceOf(address) view returns(uint256)",
];
export async function readPoolLaunch(provider, { position, chainId, account }) {
  const actual = Number((await provider.getNetwork()).chainId);
  if (actual !== Number(chainId))
    throw Error("Pool link and read provider use different chains.");
  const block = await provider.getBlock("latest");
  if (!block?.hash) throw Error("Pool state block unavailable.");
  const at = { blockTag: block.number },
    address = getAddress(position),
    a = ARTIFACTS.GenesisV4Position;
  if (
    normalizeRuntime(await provider.getCode(address, block.number), a) !==
    a.normalizedHash
  )
    throw Error("Position runtime differs from this release.");
  const p = new Contract(address, a.abi, provider),
    [manager, factory, key, lower, upper, liquidity, supply, shares] =
      await Promise.all([
        p.manager(at),
        p.factory(at),
        p.poolKey(at),
        p.tickLower(at),
        p.tickUpper(at),
        p.liquidity(at),
        p.totalSupply(at),
        account ? p.balanceOf(account, at) : null,
      ]);
  const f =
    key.hooks === ZeroAddress
      ? ARTIFACTS.GenesisV4Launchpad
      : HOOK_ARTIFACTS.GenesisV4HookLaunchpad;
  if (
    normalizeRuntime(await provider.getCode(factory, block.number), f) !==
    f.normalizedHash
  )
    throw Error("The launch factory runtime differs from this release.");
  const fc = new Contract(factory, f.abi, provider);
  if (getAddress(await fc.manager(at)) !== getAddress(manager))
    throw Error("Factory and position use different PoolManagers.");
  const canonicalNetwork = await verifiedNetwork(provider, {
    chainId: actual,
    manager,
  });
  if (getAddress(canonicalNetwork.manager) !== getAddress(manager))
    throw Error(
      "This position uses another PoolManager than the verified network deployment.",
    );
  async function token(address) {
    const c = new Contract(address, ABI, provider),
      [name, symbol, decimals, totalSupply, balance] = await Promise.all([
        c.name(at),
        c.symbol(at),
        c.decimals(at),
        c.totalSupply(at),
        account ? c.balanceOf(account, at) : null,
      ]);
    if (Number(decimals) > 36 || name.length > 256 || symbol.length > 128)
      throw Error("Unsupported token metadata.");
    return {
      address,
      name,
      symbol,
      decimals: Number(decimals),
      totalSupply: String(totalSupply),
      balance: balance === null ? null : String(balance),
      formattedSupply: formatUnits(totalSupply, decimals),
      formattedBalance:
        balance === null ? null : formatUnits(balance, decimals),
    };
  }
  const [token0, token1] = await Promise.all([
      token(key.currency0),
      token(key.currency1),
    ]),
    poolId = keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "uint24", "int24", "address"],
        Array.from(key),
      ),
    ),
    slot = keccak256(
      AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [poolId, 6]),
    ),
    m = new Contract(
      manager,
      ["function extsload(bytes32) view returns(bytes32)"],
      provider,
    ),
    packed = BigInt(await m.extsload(slot, at)),
    sqrtPriceX96 = packed & ((1n << 160n) - 1n),
    unsignedTick = Number((packed >> 160n) & 0xffffffn),
    tick = unsignedTick >= 0x800000 ? unsignedTick - 0x1000000 : unsignedTick;
  let hook = null;
  if (key.hooks !== ZeroAddress) {
    const h = HOOK_ARTIFACTS.OwnerV4FeeHook;
    if (
      normalizeRuntime(await provider.getCode(key.hooks, block.number), h) !==
      h.normalizedHash
    )
      throw Error("Creator hook runtime differs from this release.");
    const hc = new Contract(key.hooks, h.abi, provider),
      [owner, feePpm, recipient, viaSplitter] = await Promise.all([
        hc.owner(at),
        hc.feePpm(at),
        hc.recipient(at),
        hc.routeToSplitter(at),
      ]);
    hook = {
      address: key.hooks,
      owner,
      feePpm: String(feePpm),
      recipient,
      viaSplitter,
    };
  }
  const preview =
    shares && shares > 0n
      ? await p.previewRedeemFor(account, shares, at)
      : null;
  if ((await provider.getBlock(block.number))?.hash !== block.hash)
    throw Error("Pool state block changed. Refresh.");
  return {
    position: address,
    chainId: actual,
    manager,
    factory,
    poolId,
    key: {
      currency0: key.currency0,
      currency1: key.currency1,
      fee: Number(key.fee),
      tickSpacing: Number(key.tickSpacing),
      hooks: key.hooks,
    },
    token0,
    token1,
    hook,
    tickLower: Number(lower),
    tickUpper: Number(upper),
    tick,
    sqrtPriceX96: String(sqrtPriceX96),
    liquidity: String(liquidity),
    totalShares: String(supply),
    shares: shares === null ? null : String(shares),
    formattedShares: shares === null ? null : formatUnits(shares, 18),
    account: account || null,
    preview: preview
      ? {
          token0: formatUnits(preview[0], token0.decimals),
          token1: formatUnits(preview[1], token1.decimals),
        }
      : null,
    blockNumber: block.number,
    blockHash: block.hash,
  };
}
