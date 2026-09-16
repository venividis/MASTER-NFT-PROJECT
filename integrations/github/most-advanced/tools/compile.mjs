#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  Compile every contract in src/ with solc-js and report deployed sizes
  against the EIP-170 ceiling.

    node tools/compile.mjs            compile, report, write out/
    node tools/compile.mjs --quiet    exit code only
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const solc = require("solc");

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUIET = process.argv.includes("--quiet");

function sources(dir, out = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (e.name.endsWith(".sol")) {
      out[path.relative(ROOT, p)] = { content: fs.readFileSync(p, "utf8") };
    }
  }
  return out;
}

export function compile({ quiet = false, dirs = ["src"] } = {}) {
  const input = {
    language: "Solidity",
    sources: dirs.reduce((a, d) => Object.assign(a, sources(path.join(ROOT, d))), {}),
    settings: {
      optimizer: { enabled: true, runs: 800 },
      viaIR: true,
      evmVersion: "cancun",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
    }
  };

  /* remappings.txt, honoured the same way forge honours it, so a path that
     resolves for `forge build` resolves here too */
  const remaps = fs.existsSync(path.join(ROOT, "remappings.txt"))
    ? fs.readFileSync(path.join(ROOT, "remappings.txt"), "utf8")
        .split("\n").map((l) => l.trim()).filter((l) => l.includes("="))
        .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
    : [];

  const findImport = (p) => {
    for (const [from, to] of remaps) {
      if (p.startsWith(from)) {
        const full = path.join(ROOT, to + p.slice(from.length));
        if (fs.existsSync(full)) return { contents: fs.readFileSync(full, "utf8") };
      }
    }
    for (const base of ["", "src/", "src/lib/", "src/interfaces/"]) {
      const full = path.join(ROOT, base, p);
      if (fs.existsSync(full)) return { contents: fs.readFileSync(full, "utf8") };
    }
    return { error: "not found: " + p };
  };

  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

  const errors = (out.errors || []).filter((e) => e.severity === "error");
  const warnings = (out.errors || []).filter((e) => e.severity === "warning");

  if (!quiet) {
    for (const e of errors) console.error("\x1b[31m" + e.formattedMessage + "\x1b[0m");
    for (const w of warnings) {
      // shadowing and unused-parameter noise from interface conformance is expected
      if (/Unused (function parameter|local variable)/.test(w.message)) continue;
      console.warn("\x1b[33m" + (w.formattedMessage || w.message).split("\n").slice(0, 3).join("\n") + "\x1b[0m");
    }
  }
  if (errors.length) {
    const err = new Error(errors.length + " compile error(s)");
    err.errors = errors;
    throw err;
  }
  return out;
}

export function artifact(out, file, name) {
  const c = out.contracts?.[file]?.[name];
  if (!c) throw new Error("no artifact for " + file + ":" + name);
  return {
    abi: c.abi,
    bytecode: "0x" + c.evm.bytecode.object,
    deployed: "0x" + c.evm.deployedBytecode.object
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const out = compile({ quiet: QUIET });
  const LIMIT = 24576;
  const rows = [];
  for (const [file, cs] of Object.entries(out.contracts)) {
    for (const [name, c] of Object.entries(cs)) {
      const n = c.evm.deployedBytecode.object.length / 2;
      if (n === 0) continue;                       // interfaces and libraries
      rows.push({ name, file, n });
    }
  }
  rows.sort((a, b) => b.n - a.n);
  if (!QUIET) {
    console.log(`\n  compiled in ${((Date.now() - t0) / 1000).toFixed(1)}s — deployed sizes\n`);
    for (const r of rows) {
      const pct = (r.n / LIMIT) * 100;
      const bar = "█".repeat(Math.round(pct / 4)).padEnd(25, "·");
      const col = pct > 100 ? "\x1b[31m" : pct > 85 ? "\x1b[33m" : "\x1b[32m";
      console.log(`  ${col}${bar}\x1b[0m ${String(r.n).padStart(6)} B  ${pct.toFixed(0).padStart(3)}%  ${r.name}`);
    }
    const over = rows.filter((r) => r.n > LIMIT);
    console.log(over.length
      ? `\n  \x1b[31m${over.length} contract(s) exceed the EIP-170 ceiling of ${LIMIT} bytes\x1b[0m\n`
      : `\n  \x1b[32mall contracts fit under the EIP-170 ceiling of ${LIMIT} bytes\x1b[0m\n`);
    if (over.length) process.exit(1);
  }
  fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "out/solc.json"), JSON.stringify(out));
}
