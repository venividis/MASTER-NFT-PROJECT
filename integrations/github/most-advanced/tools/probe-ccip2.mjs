#!/usr/bin/env node
/*  CCIP again, with the selectors read from smartcontractkit/chain-selectors
    rather than guessed. The first run reported Unichain unreachable; that
    was my selector being wrong, which is exactly the failure mode that
    turns a bad guess into a confident false claim.                       */
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
const RPC = { Ethereum:"https://ethereum-rpc.publicnode.com", Base:"https://base-rpc.publicnode.com", BNB:"https://bsc-rpc.publicnode.com" };
const ROUTER = { Ethereum:"0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D", Base:"0x881e3A65B4d4a04dD529061dd0071cf975F58bCD", BNB:"0x34B03Cb9086d7D758AC55af71584F81A598759FE" };
const S = { Ethereum:5009297550715157269n, Base:15971525489660198786n, Unichain:1923510103922296319n,
            BNB:11344663589394136015n, Robinhood:6180753054346818345n };
const EXTRA = "0x97a657c9" + w(300000);
const msgArg = () => {
  const recv = "0x" + w("0x2222222222222222222222222222222222222222");
  const a = 0xa0, b = a + 32 + pad(recv).length / 2, c2 = b + 32 + pad(MSG).length / 2, d = c2 + 32;
  return w(a) + w(b) + w(c2) + w(0) + w(d) + barg(recv) + barg(MSG) + w(0) + barg(EXTRA);
};
for (const src of ["Ethereum", "Base", "BNB"]) {
  console.log("\n  from " + src);
  const c = new RpcChain(RPC[src], "0x" + "11".repeat(32), 1);
  for (const [dst, s] of Object.entries(S)) {
    if (dst === src) continue;
    let sup = "?", fee = "-";
    try { sup = N(await c.call(ROUTER[src], sel("isChainSupported(uint64)") + w(s))) === 1n ? "yes" : "NO"; } catch { sup = "?"; }
    try { fee = (Number(N(await c.call(ROUTER[src], sel("getFee(uint64,(bytes,bytes,(address,uint256)[],address,bytes))") + w(s) + w(0x40) + msgArg())))/1e18).toExponential(4); }
    catch (e) { fee = "revert"; }
    console.log(`    -> ${dst.padEnd(10)} selector ${String(s).padEnd(20)} supported ${sup.padEnd(4)} fee ${fee}`);
  }
}
