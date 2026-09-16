#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · what a settle message costs on each transport, priced today

  One payload — (bytes32 orderId, address collection, uint256 tokenId,
  address buyer, uint256 price) = 160 bytes — quoted live against
  LayerZero V2, Chainlink CCIP and Hyperlane on the lanes a cross-chain
  sale would actually use. Nothing here is from a docs page.

      node tools/probe-bridges.mjs
───────────────────────────────────────────────────────────────────────────*/
import { RpcChain } from "./rpc.mjs";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { utf8ToBytes, bytesToHex } from "ethereum-cryptography/utils.js";
const sel = (s) => "0x" + bytesToHex(keccak256(utf8ToBytes(s))).slice(0, 8);
const w = (v) => BigInt(v).toString(16).padStart(64, "0");
const pad = (h) => { h = h.replace(/^0x/, ""); return h + "0".repeat((64 - h.length % 64) % 64); };
const barg = (h) => w(h.replace(/^0x/, "").length / 2) + pad(h);
const N = (h, i = 0) => BigInt("0x" + h.replace(/^0x/, "").substr(i * 64, 64));

const MSG = "0x" + w(1) + w("0x1111111111111111111111111111111111111111") + w(7) +
                   w("0x2222222222222222222222222222222222222222") + w(10n ** 17n);
const B32 = "0x" + w("0x2222222222222222222222222222222222222222");
const GAS = 300000n;

/* ── prices ── */
const px = async (u, f) => { try { const r = await (await import("undici")).fetch(u, { dispatcher: (await import("undici")).getGlobalDispatcher() }); return f(await r.json()); } catch { return null; } };
const priceOf = async (sym) => {
  const { fetch: uf, ProxyAgent } = await import("undici");
  const fs = await import("node:fs");
  const p = process.env.HTTPS_PROXY || process.env.https_proxy;
  const d = p ? new ProxyAgent({ uri: p, requestTls: { ca: fs.readFileSync("/root/.ccr/ca-bundle.crt") } }) : undefined;
  const r = await uf(`https://api.coinbase.com/v2/prices/${sym}-USD/spot`, { dispatcher: d });
  return Number((await r.json()).data.amount);
};
const ETH = await priceOf("ETH").catch(() => null);
const BNB = await priceOf("BNB").catch(() => null);
console.log(`\n  ETH $${ETH}   BNB $${BNB}   (coinbase spot, now)`);

const RPC = {
  Ethereum: "https://ethereum-rpc.publicnode.com",
  Base: "https://base-rpc.publicnode.com",
  Unichain: "https://unichain-rpc.publicnode.com",
  BNB: "https://bsc-rpc.publicnode.com",
};
const LZ = { ep: { Ethereum:"0x1a44076050125825900e736c501f859c50fE728c", Base:"0x1a44076050125825900e736c501f859c50fE728c",
                   Unichain:"0x6f475642a6e85809b1c36fa62763669b1b48dd5b", BNB:"0x1a44076050125825900e736c501f859c50fE728c" },
             eid:{ Ethereum:30101, Base:30184, Unichain:30320, BNB:30102 } };
/* Chainlink CCIP routers + chain selectors, from the on-chain router itself
   where possible.                                                        */
const CCIP = { router: { Ethereum:"0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D",
                         Base:"0x881e3A65B4d4a04dD529061dd0071cf975F58bCD",
                         Unichain:"0x27b8E0142ffF14a9EE9F9d9AAAA5A34C6F5f0d13",
                         BNB:"0x34B03Cb9086d7D758AC55af71584F81A598759FE" },
               selector:{ Ethereum:5009297550715157269n, Base:15971525489660198786n,
                          Unichain:1843853579389769336n, BNB:11344663589394136015n } };
const HYP = { mailbox: { Ethereum:"0xc005dc82818d67AF737725bD4bf75435d065D239",
                         Base:"0xeA87ae93Fa0019a82A727bfd3eBd1cFCa8f64f1D",
                         Unichain:"0x3a464f746D23Ab22155710f44dB16dcA53e0775E",
                         BNB:"0x2971b9Aec44bE4eb673DF1B88cDB57b96eefe8a4" },
              domain:{ Ethereum:1, Base:8453, Unichain:130, BNB:56 } };

const lzOpts = "0x0003" + "01" + "0011" + "01" + GAS.toString(16).padStart(32, "0");
const lzData = (dstEid, recv, msg, opts, sender) =>
  sel("quote((uint32,bytes32,bytes,bytes,bool),address)") + w(0x40) + w(sender) +
  w(dstEid) + recv.replace(/^0x/, "").padStart(64, "0") + w(0xa0) +
  w(0xa0 + 32 + pad(msg).length / 2) + w(0) + barg(msg) + barg(opts);

/*  EVM2AnyMessage{bytes receiver; bytes data; EVMTokenAmount[] tokenAmounts;
    address feeToken; bytes extraArgs}.  extraArgs = EVMExtraArgsV1 tag +
    abi.encode(gasLimit).                                                 */
const EXTRA = "0x97a657c9" + w(GAS);
const ccipData = (selctor) => {
  const recv = "0x" + w("0x2222222222222222222222222222222222222222");
  const inner =
    w(0xa0) + w(0xa0 + 32 + pad(recv).length / 2) +
    w(0xa0 + 32 + pad(recv).length / 2 + 32 + pad(MSG).length / 2) +
    w(0) /* feeToken = address(0) => native */ +
    w(0xa0 + 32 + pad(recv).length / 2 + 32 + pad(MSG).length / 2 + 32) +
    barg(recv) + barg(MSG) + w(0) /* empty tokenAmounts */ + barg(EXTRA);
  return sel("getFee(uint64,(bytes,bytes,(address,uint256)[],address,bytes))") +
         w(selctor) + w(0x40) + inner;
};
const hypData = (dom) =>
  sel("quoteDispatch(uint32,bytes32,bytes)") + w(dom) + w("0x2222222222222222222222222222222222222222") +
  w(0x60) + barg(MSG);

const usd = (v, chain) => {
  const p = chain === "BNB" ? BNB : ETH;
  return p ? "$" + (Number(v) / 1e18 * p).toFixed(4) : "?";
};

for (const src of ["Ethereum", "Base", "Unichain", "BNB"]) {
  console.log("\n" + "─".repeat(70) + "\n  from " + src);
  const c = new RpcChain(RPC[src], "0x" + "11".repeat(32), 1);
  for (const dst of ["Ethereum", "Base", "Unichain", "BNB"]) {
    if (dst === src) continue;
    const row = [];
    try { const r = await c.call(LZ.ep[src], lzData(LZ.eid[dst], B32, MSG, lzOpts, "0x00000000000000000000000000000000000000A1"));
          row.push(`LayerZero ${(Number(N(r,0))/1e18).toExponential(4)} = ${usd(N(r,0), src)}`); }
    catch (e) { row.push("LayerZero  " + (String(e.message).includes("DVNs") ? "no default DVN config" : String(e.message).slice(0, 44))); }
    try { const r = await c.call(CCIP.router[src], ccipData(CCIP.selector[dst]));
          row.push(`CCIP      ${(Number(N(r,0))/1e18).toExponential(4)} = ${usd(N(r,0), src)}`); }
    catch (e) { row.push("CCIP       " + String(e.message).replace(/^eth_call: /, "").slice(0, 44)); }
    try { const r = await c.call(HYP.mailbox[src], hypData(HYP.domain[dst]));
          row.push(`Hyperlane ${(Number(N(r,0))/1e18).toExponential(4)} = ${usd(N(r,0), src)}`); }
    catch (e) { row.push("Hyperlane  " + String(e.message).replace(/^eth_call: /, "").slice(0, 44)); }
    console.log(`    -> ${dst.padEnd(9)} ${row.join("\n                 ")}`);
  }
}
