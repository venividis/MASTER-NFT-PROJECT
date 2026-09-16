import { EXIT_ARTIFACT } from "./artifacts.mjs";
import { normalizeRuntime } from "../v4/client.mjs";
import {
  Contract,
  Interface,
  getAddress,
  ZeroAddress,
  formatEther,
  parseUnits,
  formatUnits,
  keccak256,
  toUtf8Bytes,
} from "../vendor/ethers.min.js";
export const EXIT_ABI = [
  "function collection() view returns(address)",
  "function market() view returns(address)",
  "function marketCodeHash() view returns(bytes32)",
  "function createPlan(uint256 identity,address input,address output,(uint112 amount,uint112 minOut,uint48 due,uint48 expires,uint8 status,uint112 received)[] terms,bytes32 decision) payable returns(uint256)",
  "function plans(uint256) view returns(address account,address owner,address input,address output,uint64 epoch,bool paused,bool cancelled,bytes32 decision)",
  "function sliceCount(uint256) view returns(uint256)",
  "function sliceAt(uint256,uint256) view returns(uint112 amount,uint112 minOut,uint48 due,uint48 expires,uint8 status,uint112 received)",
  "function eligible(uint256,uint256) view returns(bool)",
  "function executeSlice(uint256,uint256) returns(uint256)",
  "function recover(uint256,uint256)",
  "function control(uint256,uint8)",
  "event Funded(uint256 indexed plan,address indexed account,address input,address output,uint256 amount,bytes32 decision)",
];
const MAX = (1n << 112n) - 1n;
export function liveExitTerms(text, now) {
  let last = 0,
    total = 0n;
  const rows = String(text).trim().split("\n");
  if (!rows.length || rows.length > 64) throw Error("Use 1–64 installments.");
  const slices = rows.map((line) => {
    const v = line.split(",").map((s) => s.trim());
    if (v.length !== 4 || v.some((s) => !/^\d+$/.test(s)))
      throw Error(
        "Each row needs whole numbers: days from now, input raw units, minimum raw units, window days.",
      );
    const [days, amount, minOut, window] = v.map(BigInt);
    if (
      days < 1n ||
      days > 3650n ||
      window < 1n ||
      window > 365n ||
      amount < 1n ||
      amount > MAX ||
      minOut < 1n ||
      minOut > MAX
    )
      throw Error("Installment terms exceed supported bounds.");
    const due = now + Number(days) * 86400,
      expires = due + Number(window) * 86400;
    if (due <= last) throw Error("Installment dates must increase.");
    last = due;
    total += amount;
    return {
      amount: String(amount),
      minOut: String(minOut),
      due,
      expires,
      status: 0,
      received: "0",
    };
  });
  if (total > MAX) throw Error("Total exceeds the funded-vault amount limit.");
  return { slices, total: String(total) };
}
export async function exitAsset(provider, address) {
  address = getAddress(address);
  if (address === ZeroAddress)
    return { address, decimals: 18, symbol: "native" };
  const asset = new Contract(
    address,
    [
      "function decimals() view returns(uint8)",
      "function symbol() view returns(string)",
    ],
    provider,
  );
  const decimals = Number(await asset.decimals());
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36)
    throw Error("Unsupported token decimals.");
  let symbol = "tokens";
  try {
    symbol = String(await asset.symbol()).slice(0, 24) || symbol;
  } catch {}
  return { address, decimals, symbol };
}
export function humanExitTerms(text, now, inputDecimals, outputDecimals) {
  const rows = String(text)
    .trim()
    .split("\n")
    .map((line) => {
      const values = line.split(",").map((value) => value.trim());
      if (
        values.length !== 4 ||
        !/^\d+$/.test(values[0]) ||
        !/^\d+$/.test(values[3]) ||
        values.slice(1, 3).some((value) => !/^\d+(\.\d+)?$/.test(value))
      )
        throw Error(
          "Each row needs: days from now, token amount, minimum received, sale window days.",
        );
      return [
        values[0],
        String(parseUnits(values[1], inputDecimals)),
        String(parseUnits(values[2], outputDecimals)),
        values[3],
      ].join(",");
    })
    .join("\n");
  return liveExitTerms(rows, now);
}
export const formatExitAmount = (value, asset) =>
  formatUnits(value, asset.decimals) + " " + asset.symbol;
export async function connectedExitVault(wallet, address) {
  await wallet.assertOwner();
  const target = getAddress(address);
  const code = await wallet.provider.getCode(target);
  if (code === "0x") throw Error("No exit vault is deployed at this address.");
  if (normalizeRuntime(code, EXIT_ARTIFACT) !== EXIT_ARTIFACT.normalizedHash)
    throw Error("Exit vault bytecode does not match this reviewed release.");
  const vault = new Contract(target, EXIT_ABI, wallet.provider);
  if (getAddress(await vault.collection()) !== getAddress(wallet.collection))
    throw Error("Exit vault belongs to a different NFT collection.");
  const market = getAddress(await vault.market());
  if (
    keccak256(await wallet.provider.getCode(market)) !==
    (await vault.marketCodeHash())
  )
    throw Error("The configured market code changed.");
  return vault;
}
export async function prepareLiveExit(
  wallet,
  { vault: address, input, output, rows, decision, units = "human" },
) {
  const vault = await connectedExitVault(wallet, address);
  input = getAddress(input);
  output = getAddress(output);
  if (input === output)
    throw Error("Choose different input and output assets.");
  if (!/^0x[0-9a-f]{64}$/i.test(decision))
    throw Error("Use a full memory digest or the zero digest.");
  const [inputAsset, outputAsset] = await Promise.all([
    exitAsset(wallet.provider, input),
    exitAsset(wallet.provider, output),
  ]);
  const block = await wallet.provider.getBlock("latest"),
    { slices, total } =
      units === "raw"
        ? liveExitTerms(rows, block.timestamp)
        : humanExitTerms(
            rows,
            block.timestamp,
            inputAsset.decimals,
            outputAsset.decimals,
          ),
    market = new Contract(
      await vault.market(),
      [
        "function quote(address,address,uint256) view returns(uint256,uint256,uint8)",
      ],
      wallet.provider,
    );
  const quotes = [];
  try {
    for (const s of slices) {
      const q = await market.quote(input, output, s.amount);
      quotes.push(String(q[0]));
    }
  } catch (error) {
    const v4 = new Contract(
      market.target,
      [
        "function version() pure returns(bytes32)",
        "function pools(address) view returns(uint128 liquidity,uint64 born,uint256,address,uint112,uint112)",
      ],
      wallet.provider,
    );
    try {
      if (
        (await v4.version()) !==
        keccak256(toUtf8Bytes("idfbi/phoenix-v4-market/1.4"))
      )
        throw Error("Unknown adapter.");
      for (const token of [input, output].filter((t) => t !== ZeroAddress)) {
        const pool = await v4.pools(token);
        if (pool.born === 0n || pool.liquidity === 0n)
          throw Error("V4 route is not seeded.");
      }
    } catch {
      throw Error(
        "The configured market could not verify this route. Check deployed pools before funding.",
      );
    }
    quotes.splice(0, quotes.length, ...slices.map(() => null));
  }
  const data = vault.interface.encodeFunctionData("createPlan", [
    wallet.tokenId,
    input,
    output,
    slices,
    decision,
  ]);
  const plan = await wallet.prepareUtility({
    target: vault.target,
    asset: input,
    amount: input === ZeroAddress ? "0" : total,
    value: input === ZeroAddress ? formatEther(total) : "0",
    data,
  });
  return {
    plan,
    total,
    input,
    output,
    inputAsset,
    outputAsset,
    slices,
    quotes,
    decision,
  };
}
