#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · replacing the site without ending the conversation

  The pages are the mutable-ish half of the system: replacing them means
  deploying new page contracts and a new Premises, and pointing whatever
  name you use at the new address. Two things are deliberately NOT
  replaced: the collection (obviously), and the Parley — every message
  ever sent is a log that contract emitted, and a new Parley would not
  migrate the conversation, it would end it.

      node tools/redeploy-site.mjs deployments/base-sepolia.json
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, artifact } from "./compile.mjs";
import { RpcChain } from "./rpc.mjs";
import { deploySite, getter, UNISWAP } from "./site.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recPath = process.argv[2];
if (!recPath) throw new Error("which deployment? pass its record file");
const rec = JSON.parse(fs.readFileSync(recPath, "utf8"));

const c = await RpcChain.open(rec.rpc, fs.readFileSync(path.join(ROOT, ".testnet-key"), "utf8").trim());
console.log(`\n  chain ${c.chainId} · deployer ${c.from.toString()}`);
console.log(`  keeping Parley ${rec.contracts.parley} — the conversation survives\n`);

const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);

const uni = UNISWAP[c.chainId];
console.log(uni
  ? `  Uniswap v3 wiring for ${uni.name}: router ${uni.router}`
  : "  no Uniswap wiring known for this chain — the swap tab will say so");
const site = await deploySite(c, A, {
  hub: rec.contracts.ipseity,
  pool: rec.contracts.pool,
  lease: rec.contracts.lease,
  sigil: rec.contracts.sigil,
  parley: rec.contracts.parley,
  ...(uni ? { uniswap: uni } : {})
});

rec.contracts = { ...rec.contracts, ...site, parley: rec.contracts.parley };
const tail = c.chainId === 1 ? "" : ":" + c.chainId;
rec.urls = {
  door: `web3://${site.premises}${tail}/`,
  terminal: `web3://${site.premises}${tail}/terminal`,
  chat: `web3://${site.premises}${tail}/chat`
};
fs.writeFileSync(recPath, JSON.stringify(rec, null, 1));
fs.writeFileSync(path.join(ROOT, "dist/testnet.json"), JSON.stringify(rec, null, 1));

const GET = getter(c, site.premises);
/*  A load-balanced public RPC answers from replicas, and a replica that has
    not seen the deploy yet answers `0x` for a contract that exists. That is
    lag, not absence — so a failed probe is retried before it is believed. */
for (const p of [[], ["terminal"], ["swap"], ["launch"], ["lock"], ["projector"], ["seal"], ["keys"], ["name"], ["chat"], ["gallery"]]) {
  let r = null, err = null;
  for (let t = 0; t < 6 && (!r || r.status !== 200); t++) {
    if (t) await new Promise((res) => setTimeout(res, 4000));
    try { r = await GET(p); err = null; } catch (e) { err = e; }
  }
  if (err) { console.log(`  FAILED /${p.join("/")} after retries: ${err.message}`); process.exit(1); }
  console.log(`  ${r.status} /${p.join("/")}  ${r.body.length}B`);
  if (r.status !== 200) process.exit(1);
}
console.log(`\n  Premises ${site.premises}`);
console.log(`  ${rec.urls.door}\n`);
