#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · reading a deployment back out of the chain that holds it

  A deployment record is a convenience, not a source of truth: the chain
  is. This walks the other way — hand it a Premises address and it recovers
  every address the site is built from, because each one is a public
  immutable on the contract that uses it. The Premises names its pages, the
  pages name their desks, the hub names its renderer.

  That makes a lost record a nuisance rather than a redeployment, and it
  makes an existing record checkable: what the file says and what the chain
  says are two answers to the same question, and they should agree.

      node tools/recover-record.mjs deployments/base-sepolia.json
      node tools/recover-record.mjs deployments/base-sepolia.json --write
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RpcChain } from "./rpc.mjs";
import { sel } from "./evm.mjs";
import { PAGES, VIA, EXPECTED } from "./site.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recPath = process.argv[2];
const WRITE = process.argv.includes("--write");
if (!recPath) throw new Error("which deployment? pass its record file");
const rec = JSON.parse(fs.readFileSync(path.resolve(ROOT, recPath), "utf8"));

const c = await RpcChain.open(rec.rpc,
  fs.readFileSync(path.join(ROOT, ".testnet-key"), "utf8").trim());

const ZERO = "0x0000000000000000000000000000000000000000";

/*  A getter that returns an address, or null. Null covers three different
    things — no code there, no such getter, a getter that reverted — and
    the caller treats all three the same way: that pointer is not on this
    deployment, so do not record a guess.                               */
async function addrOf(at, signature) {
  if (!at || at === ZERO) return null;
  try {
    const out = await c.rpc("eth_call", [{ to: at, data: sel(signature) }, "latest"]);
    if (!out || out === "0x") return null;
    const a = "0x" + out.slice(-40);
    return a === ZERO ? null : a;
  } catch { return null; }
}

const found = {};
const put = (name, a) => { if (a) found[name] = a; return a; };

const premises = rec.contracts?.premises;
if (!premises) throw new Error("the record has no premises to walk from");
put("premises", premises);


put("ipseity", await addrOf(premises, "HUB()"));
put("chrome", await addrOf(premises, "CHROME()"));
for (const [key, g] of Object.entries(PAGES)) put(key, await addrOf(premises, g));


/*  Two routes to the same key must land on the same address. `put` keeps
    the first answer and records the contradiction rather than letting a
    later route overwrite an earlier one — silently taking the last write
    is how a tool reports a clean recovery of a mixed deployment.       */
const conflicts = [];
for (const [name, via, g] of VIA) {
  const a = await addrOf(found[via], g);
  if (!a) continue;
  if (found[name] && found[name].toLowerCase() !== a.toLowerCase())
    conflicts.push({ name, via, was: found[name], now: a });
  else put(name, a);
}

/*  The hub's own pointers. `renderer` is the one that moves — every
    engine redeploy repoints it — so reading it here is the only way to
    know which instrument the collection is actually showing.           */
put("renderer", await addrOf(found.ipseity, "renderer()"));
put("reach",    await addrOf(found.ipseity, "ACCOUNT_IMPL()"));
put("grip",     await addrOf(found.ipseity, "GRIP_IMPL()"));
put("engine",   await addrOf(found.renderer, "engine()"));


/*───────────────── report, then agree or disagree ─────────────────*/
const on = Object.keys(found).length;
console.log(`\n  chain ${c.chainId} · recovered ${on} address(es) from ${premises}\n`);

let drift = 0, gained = 0;
for (const k of Object.keys(found).sort()) {
  const was = (rec.contracts[k] || "").toLowerCase();
  const now = found[k].toLowerCase();
  if (!was) { gained++; console.log(`  + ${k.padEnd(12)} ${now}`); }
  else if (was !== now) { drift++; console.log(`  ! ${k.padEnd(12)} ${was} -> ${now}`); }
}
const orphan = Object.keys(rec.contracts).filter(k => !found[k]);
for (const k of orphan) console.log(`  ? ${k.padEnd(12)} ${rec.contracts[k]}  (not reachable from the premises)`);

/*  A key the deployment should have that neither the file nor the walk
    produced. Distinct from `orphan`, which is a key the file has and the
    walk could not confirm.                                             */
const missing = EXPECTED.filter(k => !found[k] && !rec.contracts[k]);
for (const k of missing) console.log(`  - ${k.padEnd(12)} MISSING — expected in a complete deployment, in neither the record nor the chain`);

for (const x of conflicts)
  console.log(`  ✗ ${x.name.padEnd(12)} ${x.was} via an earlier route, ${x.now} via ${x.via} — two routes, two answers`);

console.log(`\n  ${gained} new, ${drift} disagreeing, ${orphan.length} unreachable, ` +
  `${missing.length} missing, ${conflicts.length} contradicted`);
if (drift) console.log("  a disagreement means the record and the chain describe different deployments");
if (conflicts.length) console.log("  a contradiction means two contracts in this deployment disagree about a third");

if (WRITE) {
  /*  Recovered addresses win: the chain is the record's source, not the
      other way round. Anything unreachable is kept rather than dropped —
      a contract the premises does not point at (a port, a facet) is still
      part of the deployment.                                           */
  rec.contracts = { ...rec.contracts, ...found };
  fs.writeFileSync(path.resolve(ROOT, recPath), JSON.stringify(rec, null, 1) + "\n");
  console.log(`  wrote ${recPath}`);
} else if (gained || drift) {
  console.log("  pass --write to fold these into the record");
}

/*  Non-zero on anything that means the recovery is not trustworthy, so
    this can be a check rather than only a report. A missing key is not
    fatal — some deployments predate some contracts — but a contradiction
    or a drift is.                                                       */
if (conflicts.length || drift) process.exitCode = 1;
