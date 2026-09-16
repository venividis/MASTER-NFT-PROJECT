#!/usr/bin/env node
/*  A LayerZero fee is almost entirely the destination gas the executor is
    being paid to burn. Quote the same 160-byte settle at several gas
    limits so the shape is visible rather than asserted, and print each
    chain's base fee so the USD figures elsewhere can be checked.        */
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
const opts = (g) => "0x0003" + "01" + "0011" + "01" + BigInt(g).toString(16).padStart(32, "0");
const q = (dstEid, o, sender) =>
  sel("quote((uint32,bytes32,bytes,bytes,bool),address)") + w(0x40) + w(sender) +
  w(dstEid) + B32.replace(/^0x/, "") + w(0xa0) + w(0xa0 + 32 + pad(MSG).length / 2) + w(0) + barg(MSG) + barg(o);
const OAPP = "0x00000000000000000000000000000000000000A1";
const LANES = [
  ["Base -> Ethereum","https://base-rpc.publicnode.com","0x1a44076050125825900e736c501f859c50fE728c",30101],
  ["Ethereum -> Base","https://ethereum-rpc.publicnode.com","0x1a44076050125825900e736c501f859c50fE728c",30184],
  ["BNB -> Ethereum","https://bsc-rpc.publicnode.com","0x1a44076050125825900e736c501f859c50fE728c",30101],
];
for (const [name, url, ep, dst] of LANES) {
  const c = new RpcChain(url, "0x" + "11".repeat(32), 1);
  const bf = BigInt(await c.rpc("eth_gasPrice"));
  const row = [];
  for (const g of [60000, 100000, 200000, 300000, 500000, 1000000]) {
    try { row.push(`${(g/1000)+"k"}: ${(Number(N(await c.call(ep, q(dst, opts(g), OAPP))))/1e18).toExponential(3)}`); }
    catch (e) { row.push(`${(g/1000)+"k"}: revert`); }
  }
  console.log(`  ${name.padEnd(18)} gasPrice ${(Number(bf)/1e9).toFixed(6)} gwei\n      ${row.join("   ")}`);
}
