#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · a route that resolves is not a route that is right

  `tools/recover-record.mjs` rebuilds a deployment record by walking the
  live contracts: the Premises names its pages, the pages name their desks,
  the hub names its renderer. Every step is an `eth_call` to a public
  immutable, and every step has the same failure mode — a getter that
  exists, returns an address, and is the WRONG address.

  That is not hypothetical. `deskSeal` was first read from PageSeal's
  `DESK()`. PageSeal does hold a `DESK`, so the call succeeded, returned a
  live contract, and the recovery reported a clean run — while filing the
  generic Desk under the name of a contract PageSeal has never heard of.
  The one that holds DeskSeal is PageTalk. Nothing failed; the answer was
  just false.

  A network test could not have caught it: on chain both addresses are real
  contracts. What catches it is asking the SOURCE whether each route reads
  the immutable it claims to read, and whether two names are quietly
  drinking from one well.

  None of this touches a node.

    node tools/verify-recover.mjs
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES, VIA, EXPECTED } from "./site.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (n, c, d) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${n}`);
  if (!c && d !== undefined) console.log(`      ${d}`);
};
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);

const src = (f) => fs.readFileSync(path.join(ROOT, "src", f), "utf8");

/*  A record key to the contract that key names, by the convention the
    whole codebase already follows: pFoo is PageFoo, deskFoo is DeskFoo.
    Convention rather than a second table on purpose — a lookup table that
    mirrors a naming rule is one more thing to forget to update.       */
const FILE_OF = (key) => {
  if (/^p[A-Z]/.test(key))    return `Page${key.slice(1)}.sol`;
  if (/^desk[A-Z]/.test(key)) return `Desk${key.slice(4)}.sol`;
  return null;
};

/*  Solidity generates a getter for any `public` state variable, so the
    declaration is what proves the call is real. Matching the declaration
    rather than the word means a NAME that only appears in a comment, or as
    someone else's constructor argument, does not count as a getter.   */
const declares = (source, getter) => {
  const name = getter.replace(/\(\)$/, "");
  return new RegExp(`\\bpublic\\s+(?:immutable\\s+|constant\\s+)?${name}\\s*[;=]`).test(source);
};

/*───────────────── the Premises' own getters ─────────────────*/
head("every page route reads a getter the Premises actually declares");
{
  const prem = src("Premises.sol");
  for (const [key, getter] of Object.entries(PAGES))
    ok(`Premises declares ${getter} for ${key}`, declares(prem, getter));

  /*  And the reverse: a page the Premises holds but PAGES never asks for
      is a page that vanishes from every recovered record.            */
  const held = [...prem.matchAll(/\bpublic\s+immutable\s+(P_[A-Z_]+)\s*;/g)].map(m => m[1] + "()");
  const asked = new Set(Object.values(PAGES));
  for (const g of held)
    ok(`PAGES asks for ${g}, which Premises holds`, asked.has(g),
      `Premises has ${g} but no record key reads it — it would be lost`);
}

/*───────────────── every VIA route, against its source ─────────────────*/
head("every desk route reads a getter its source contract actually declares");
for (const [name, via, getter] of VIA) {
  const file = FILE_OF(via);
  if (!ok(`${via} maps to a source file`, !!file, `no naming rule covers "${via}"`)) continue;
  let source;
  try { source = src(file); }
  catch { ok(`src/${file} exists for ${via}`, false, `route ${name} reads from a file that is not there`); continue; }
  ok(`${name.padEnd(11)} <- ${via}.${getter}`, declares(source, getter),
    `src/${file} does not declare a public ${getter.replace(/\(\)$/, "")} — ` +
    `the call may still succeed on chain and still be the wrong contract`);
}

/*───────────────── the deskSeal shape ─────────────────*/
/*  A function rather than an inline loop so the suite can hand it the
    broken table and watch it refuse. A check that has only ever been run
    against correct input has not been run.                            */
export function sharedWells(via) {
  const wells = new Map();
  for (const [name, v, getter] of via) {
    const well = `${v}.${getter}`;
    if (!wells.has(well)) wells.set(well, new Set());
    wells.get(well).add(name);
  }
  return [...wells].filter(([, names]) => names.size > 1)
    .map(([well, names]) => ({ well, names: [...names] }));
}

head("the check itself refuses the table that was actually shipped");
{
  /*  The route as it stood when the bug was live: deskSeal read from the
      page that holds the generic desk. Both rows are real, both resolve on
      chain, and one of them is a lie.                                  */
  const BROKEN = [
    ["desk",     "pDoor", "DESK()"],
    ["deskSeal", "pSeal", "DESK()"],
    ["desk",     "pSeal", "DESK()"]
  ];
  const caught = sharedWells(BROKEN);
  ok("the historical deskSeal route is rejected", caught.length === 1,
    `expected one shared well, got ${JSON.stringify(caught)}`);
  ok("and it names both keys that collided",
    caught.length === 1 && caught[0].names.includes("desk") && caught[0].names.includes("deskSeal"),
    JSON.stringify(caught));
  ok("a table with no collision passes", sharedWells([
    ["desk", "pDoor", "DESK()"], ["deskSeal", "pTalk", "SEAL()"]
  ]).length === 0);
}

head("no two record keys drink from one well");
{
  const shared = sharedWells(VIA);
  ok("the shipped table has no shared wells", shared.length === 0,
    shared.map(x => `${x.names.join(" and ")} both read ${x.well}`).join("\n      "));
  for (const [name, via, getter] of VIA)
    ok(`${name.padEnd(11)} <- ${via}.${getter} is not shared`,
      !shared.some(x => x.names.includes(name)));
}

/*───────────────── the walk is ordered ─────────────────*/
head("no route reads from a contract the walk has not found yet");
{
  const known = new Set(["premises", "ipseity", "chrome", ...Object.keys(PAGES)]);
  for (const [name, via] of VIA) {
    ok(`${via} is known before ${name} needs it`, known.has(via),
      `VIA reads ${name} from ${via}, but ${via} is not recovered by then — ` +
      `the route silently yields null and the key goes missing`);
    known.add(name);
  }
}

/*───────────────── EXPECTED against what deploySite returns ─────────────────*/
head("the expected key set matches what a deployment actually produces");
{
  const site = fs.readFileSync(path.join(ROOT, "tools", "site.mjs"), "utf8");
  const m = site.match(/return \{\n((?:\s+[a-zA-Z0-9_,\s]+\n)+?)\s+\};\n\}/);
  ok("deploySite's return statement is readable", !!m,
    "could not find the return block — this test cannot check what it cannot parse");
  if (m) {
    const returned = m[1].split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    const expected = new Set(EXPECTED);
    for (const k of returned)
      ok(`deploySite returns ${k}, and EXPECTED knows it`, expected.has(k),
        `${k} is deployed and would never be reported missing from a record`);

    /*  The eight the collection deploys before the site: they are not in
        deploySite's return but they are certainly part of a deployment. */
    const CORE = ["engine", "sigil", "renderer", "reach", "grip", "ipseity", "pool", "lease"];
    const all = new Set([...returned, ...CORE]);
    for (const k of EXPECTED)
      ok(`EXPECTED lists ${k}, which something deploys`, all.has(k),
        `${k} is expected but nothing deploys it — the report would cry missing forever`);
  }
}

/*───────────────── everything expected is reachable ─────────────────*/
head("every expected key has a way of being found");
{
  const HUB_SIDE = ["renderer", "reach", "grip", "engine", "ipseity", "premises", "chrome"];
  const reachable = new Set([...Object.keys(PAGES), ...VIA.map(v => v[0]), ...HUB_SIDE]);
  for (const k of EXPECTED)
    ok(`${k} is reachable by some route`, reachable.has(k),
      `nothing in PAGES, VIA or the hub walk produces ${k} — a lost record could not recover it`);
}

console.log(`\n  ${fail ? "\x1b[31m" : "\x1b[32m"}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
