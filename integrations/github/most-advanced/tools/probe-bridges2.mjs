#!/usr/bin/env node
/*  Make the Hyperlane number comparable (it quotes the DEFAULT gas limit
    unless you hand it StandardHookMetadata), and check whether the CCIP
    routers/selectors I used for Unichain are real before reporting an
    absence as a fact.                                                    */
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
const RPC = { Ethereum:"https://ethereum-rpc.publicnode.com", Base:"https://base-rpc.publicnode.com",
              Unichain:"https://unichain-rpc.publicnode.com", BNB:"https://bsc-rpc.publicnode.com" };
const MB = { Ethereum:"0xc005dc82818d67AF737725bD4bf75435d065D239", Base:"0xeA87ae93Fa0019a82A727bfd3eBd1cFCa8f64f1D",
             Unichain:"0x3a464f746D23Ab22155710f44dB16dcA53e0775E", BNB:"0x2971b9Aec44bE4eb673DF1B88cDB57b96eefe8a4" };
const DOM = { Ethereum:1, Base:8453, Unichain:130, BNB:56 };
const ROUTER = { Ethereum:"0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D", Base:"0x881e3A65B4d4a04dD529061dd0071cf975F58bCD",
                 Unichain:"0x27b8E0142ffF14a9EE9F9d9AAAA5A34C6F5f0d13", BNB:"0x34B03Cb9086d7D758AC55af71584F81A598759FE" };
const SELEC = { Ethereum:5009297550715157269n, Base:15971525489660198786n, Unichain:1843853579389769336n, BNB:11344663589394136015n };
/*  StandardHookMetadata, packed: variant uint16 | msgValue uint256 |
    gasLimit uint256 | refund address                                    */
const meta = (gas) => "0x0001" + "0".repeat(64) + BigInt(gas).toString(16).padStart(64, "0") +
                      "2222222222222222222222222222222222222222";

for (const src of ["Ethereum", "Base", "Unichain", "BNB"]) {
  console.log("\n  from " + src);
  const c = new RpcChain(RPC[src], "0x" + "11".repeat(32), 1);
  console.log(`    mailbox code ${await c.codeSize(MB[src]).catch(()=>-1)} B   ccip router code ${await c.codeSize(ROUTER[src]).catch(()=>-1)} B`);
  for (const dst of ["Ethereum", "Base", "Unichain", "BNB"]) {
    if (dst === src) continue;
    let hyp50 = "-", hyp300 = "-", supp = "-";
    try { hyp50 = (Number(N(await c.call(MB[src], sel("quoteDispatch(uint32,bytes32,bytes)") + w(DOM[dst]) + w("0x2222222222222222222222222222222222222222") + w(0x60) + barg(MSG))))/1e18).toExponential(4); } catch (e) { hyp50 = "x"; }
    try { hyp300 = (Number(N(await c.call(MB[src], sel("quoteDispatch(uint32,bytes32,bytes,bytes)") + w(DOM[dst]) + w("0x2222222222222222222222222222222222222222") + w(0x80) + w(0x80 + 32 + pad(MSG).length/2) + barg(MSG) + barg(meta(300000)))))/1e18).toExponential(4); } catch (e) { hyp300 = "x " + String(e.message).slice(0,30); }
    try { supp = String(N(await c.call(ROUTER[src], sel("isChainSupported(uint64)") + w(SELEC[dst])))); } catch (e) { supp = "?" ; }
    console.log(`    -> ${dst.padEnd(9)} hyperlane default-gas ${hyp50}   at 300k gas ${hyp300}   ccip isChainSupported(${SELEC[dst]}) = ${supp}`);
  }
}
