#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · what LayerZero actually is on a chain

  Twice I recorded a wrong answer about this from memory or from the wrong
  address, so it is a script now. It asks the chain three questions and
  prints what it says:

    · is there an EndpointV2 at any of the THREE canonical addresses —
      mainnet-early, mainnet-late, and the testnet one, which is different
      and is the one an earlier probe of mine forgot;
    · which message libraries are registered, with their type and version,
      so a read library (v10.x, 23,471 bytes) is visible rather than
      inferred;
    · whether a read channel resolves to a send library, which is the only
      direct evidence a chain can originate a read.

  Run it with a control — a chain you KNOW has read — or the absence of a
  library and the absence of a working probe look identical.

      node tools/probe-lz.mjs
───────────────────────────────────────────────────────────────────────────*/
import { RpcChain } from "./rpc.mjs";
/*  Three canonical EndpointV2 addresses, not two: mainnet-early,
    mainnet-late, and the TESTNET one — which is what I should have used
    against a testnet in the first place.                               */
const EPS = {
  "mainnet-early": "0x1a44076050125825900e736c501f859c50fE728c",
  "mainnet-late":  "0x6f475642a6e85809b1c36fa62763669b1b48dd5b",
  "testnet":       "0x6EDCE65403992e310A62460808c4b910D972f10f",
};
const dec = (h, i = 0) => BigInt("0x" + (h.replace(/^0x/, "").substr(i * 64, 64) || "0"));
const NETS = process.argv.length > 2
  ? [[process.argv[2], process.argv[3]]]
  : [
      ["Ethereum",              "https://ethereum-rpc.publicnode.com"],
      ["Base",                  "https://mainnet.base.org"],
      ["Unichain",              "https://mainnet.unichain.org"],
      ["BNB",                   "https://bsc-rpc.publicnode.com"],
      ["Robinhood mainnet",     "https://rpc.mainnet.chain.robinhood.com"],
      ["Robinhood testnet",     "https://rpc.testnet.chain.robinhood.com"],
      ["Base Sepolia (control)","https://sepolia.base.org"],
    ];

for (const [name, url] of NETS) {
  console.log("\n  " + name);
  let c;
  try { c = new RpcChain(url, "0x" + "11".repeat(32), 1);
        console.log("    chain id  " + Number(await c.rpc("eth_chainId")));
  } catch (e) { console.log("    UNREACHABLE"); continue; }

  for (const [label, a] of Object.entries(EPS)) {
    const size = await c.codeSize(a).catch(() => 0);
    let eid = "-";
    if (size > 0) { try { eid = String(dec(await c.read(a, "eid()", []))); } catch { eid = "no eid()"; } }
    console.log(`    ${label.padEnd(14)} ${String(size).padStart(6)} B   eid ${eid}`);
    if (size > 0 && /^\d+$/.test(eid)) {
      /*  Retry, and say which it was. A public RPC drops calls under
          load, and a dropped `getRegisteredLibraries()` prints an
          endpoint with no libraries — which looks exactly like a chain
          that has none. That is the bug this whole file exists to avoid,
          and the first version of it had the bug.                      */
      const tryRead = async (to, sig, args = []) => {
        for (let i = 0; i < 4; i++) {
          try { return { ok: await c.read(to, sig, args) }; }
          catch (e) { if (i === 3) return { err: String(e.message).slice(0, 40) };
                      await new Promise((r) => setTimeout(r, 400 * (i + 1))); }
        }
      };

      const reg = await tryRead(a, "getRegisteredLibraries()");
      if (reg.err) { console.log(`        libraries UNREADABLE (${reg.err}) — not the same as none`); continue; }
      const n = Number(dec(reg.ok, 1));
      const libs = [];
      for (let i = 0; i < n; i++) libs.push("0x" + reg.ok.replace(/^0x/, "").substr((2 + i) * 64 + 24, 40));
      if (!libs.length) console.log("        no message libraries registered");

      let sawRead = false, unknown = 0;
      for (const L of libs) {
        const t = await tryRead(L, "messageLibType()");
        const x = await tryRead(L, "version()");
        const v = x.ok ? [0, 1, 2].map((i) => dec(x.ok, i)).join(".") : null;
        const size = await c.codeSize(L).catch(() => 0);
        if (v === null) unknown++;
        const isRead = v !== null && v.startsWith("10.");
        if (isRead) sawRead = true;
        console.log(`        ${L} type ${t.ok !== undefined ? dec(t.ok) : "?"} ` +
                    `v${(v === null ? "UNREADABLE" : v).padEnd(11)} ${String(size).padStart(6)} B` +
                    (isRead ? "  <-- READ LIBRARY" : ""));
      }

      let channel = null;
      for (const ch of [4294967295, 4294967294]) {
        const r = await tryRead(a, "defaultSendLibrary(uint32)", [BigInt(ch)]);
        if (!r.ok) continue;
        const x = "0x" + r.ok.replace(/^0x/, "").slice(24);
        if (!/^0x0+$/.test(x)) { channel = x; console.log(`        read channel ${ch} -> ${x}`); }
      }
      console.log("        VERDICT  " +
        (channel ? "can originate a read"
         : sawRead ? "read library present, no channel resolved"
         : unknown ? `NO read library seen, but ${unknown} librar${unknown === 1 ? "y" : "ies"} unreadable — inconclusive`
         : "no read library, no read channel"));
    }
  }
}
