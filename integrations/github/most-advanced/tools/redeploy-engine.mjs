#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · re-point the collection at a rebuilt instrument

  Deploys a fresh Engine, feeds it the shard plan the build wrote, freezes
  it, wraps it in a fresh Renderer, and asks the hub to look there instead.
  Possible only while the renderer is unsealed — which is the whole reason
  the seal ceremony waits for mainnet. Every token's instrument updates in
  the same block, because the artwork was always the collection's, not the
  page's.

    node tools/redeploy-engine.mjs deployments/base-sepolia.json
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RpcChain } from "./rpc.mjs";
import { compile, artifact } from "./compile.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recPath = process.argv[2] || "deployments/base-sepolia.json";
const rec = JSON.parse(fs.readFileSync(path.join(ROOT, recPath), "utf8"));
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "dist/shards.json"), "utf8"));

const c = await RpcChain.open(rec.rpc,
  fs.readFileSync(path.join(ROOT, ".testnet-key"), "utf8").trim());
console.log(`\n  chain ${c.chainId} · deployer ${c.from.toString()}`);
console.log(`  plan: ${plan.head.length} head + ${plan.body.length} body shard(s), ` +
  `${plan.storedBytes ?? "?"} stored bytes, inflates to ${plan.inflatedSize}`);

const out = compile({ quiet: true, dirs: ["src"] });
const A = (f, n) => artifact(out, f, n);
const w = (v) => BigInt(v).toString(16).padStart(64, "0");
const addr = (a) => "0".repeat(24) + a.replace(/^0x/, "").toLowerCase();

const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, w(1), "Engine");
for (const s of plan.head) await c.exec(engine, "loadHead(bytes)", [s.data]);
for (const s of plan.body) await c.exec(engine, "loadBody(bytes)", [s.data]);
await c.exec(engine, "setInflatedSize(uint32)", [plan.inflatedSize]);
await c.exec(engine, "freeze()", []);
console.log(`  Engine   ${engine} · loaded and frozen`);

const renderer = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  addr(engine) + addr(rec.contracts.sigil), "Renderer");
await c.exec(rec.contracts.ipseity, "setRenderer(address)", [renderer]);
console.log(`  Renderer ${renderer} · the hub now looks here`);

rec.contracts = { ...rec.contracts, engine, renderer };
fs.writeFileSync(path.join(ROOT, recPath), JSON.stringify(rec, null, 1));
fs.writeFileSync(path.join(ROOT, "dist/testnet.json"), JSON.stringify(rec, null, 1));
console.log(`  record updated: ${recPath}\n`);
