#!/usr/bin/env node
/*  IPSEITY · who actually secures a default LayerZero lane.
    Dumps EndpointV2.getConfig(oapp, sendLib, dstEid, 2) raw, then decodes
    UlnConfig = (uint64 confirmations, uint8 req, uint8 opt, uint8 thresh,
    address[] requiredDVNs, address[] optionalDVNs) properly.            */
import { RpcChain } from "./rpc.mjs";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { utf8ToBytes, bytesToHex } from "ethereum-cryptography/utils.js";
const sel = (s) => "0x" + bytesToHex(keccak256(utf8ToBytes(s))).slice(0, 8);
const w = (v) => BigInt(v).toString(16).padStart(64, "0");
const W = (h, i) => h.substr(i * 64, 64);
const N = (h, i) => BigInt("0x" + W(h, i));
const AD = (h, i) => "0x" + W(h, i).slice(24);

const LANES = [
  ["Ethereum", "https://ethereum-rpc.publicnode.com", "0x1a44076050125825900e736c501f859c50fE728c", [["Base",30184],["BNB",30102],["Unichain",30320],["Robinhood",30416]]],
  ["Base",     "https://base-rpc.publicnode.com",     "0x1a44076050125825900e736c501f859c50fE728c", [["Ethereum",30101],["BNB",30102],["Unichain",30320]]],
  ["Unichain", "https://unichain-rpc.publicnode.com", "0x6f475642a6e85809b1c36fa62763669b1b48dd5b", [["Ethereum",30101],["Base",30184]]],
  ["Robinhood","https://rpc.mainnet.chain.robinhood.com","0x6f475642a6e85809b1c36fa62763669b1b48dd5b",[["Ethereum",30101],["Base",30184]]],
];
const OAPP = "0x00000000000000000000000000000000000000A1";
for (const [name, url, ep, peers] of LANES) {
  console.log("\n  " + name);
  const c = new RpcChain(url, "0x" + "11".repeat(32), 1);
  for (const [pn, eid] of peers) {
    let lib;
    try { lib = AD((await c.call(ep, sel("getSendLibrary(address,uint32)") + w(OAPP) + w(eid))).replace(/^0x/,""), 0); }
    catch (e) { console.log(`    -> ${pn}: no lib (${String(e.message).slice(0,40)})`); continue; }
    for (const [ct, label] of [[2, "ULN"], [1, "EXECUTOR"]]) {
      let raw;
      try { raw = (await c.call(ep, sel("getConfig(address,address,uint32,uint32)") + w(OAPP) + w(lib) + w(eid) + w(ct))).replace(/^0x/, ""); }
      catch (e) { console.log(`    -> ${pn} ${label}: unreadable ${String(e.message).slice(0,40)}`); continue; }
      if (ct === 1) {
        const e = raw.slice(128);   // static tuple: no extra offset word
        console.log(`    -> ${pn.padEnd(10)} EXECUTOR maxMessageSize ${N(e,0)}  executor ${AD(e,1)}`);
        continue;
      }
      /*  abi.encode(dynamicStruct) prepends ONE offset word before the
          struct body. Forgetting it reads `confirmations` as 32 every
          time, which is exactly what the first version of this did.   */
      const b = raw.slice(128 + 64);
      const conf = N(b,0), rq = Number(N(b,1)), oq = Number(N(b,2)), th = Number(N(b,3));
      const rOff = Number(N(b,4)) / 32, oOff = Number(N(b,5)) / 32;
      const req = [], opt = [];
      for (let i = 0; i < Number(N(b, rOff)); i++) req.push(AD(b, rOff + 1 + i));
      for (let i = 0; i < Number(N(b, oOff)); i++) opt.push(AD(b, oOff + 1 + i));
      console.log(`    -> ${pn.padEnd(10)} ULN lib ${lib}`);
      console.log(`       confirmations ${conf}   required ${rq}   optional ${oq} of threshold ${th}`);
      console.log(`       requiredDVNs  ${req.length ? req.join("\n                     ") : "(none)"}`);
      console.log(`       optionalDVNs  ${opt.length ? opt.join("\n                     ") : "(none)"}`);
    }
  }
}
