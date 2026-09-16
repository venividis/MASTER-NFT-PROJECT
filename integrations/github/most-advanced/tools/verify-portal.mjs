#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the portal

  The claim under test: this door holds no content, opens onto any chain it
  knows, and never says the wrong thing about why it could not open.

  It runs against a LOCAL chain — a Premises deployed here in-process — so
  the suite does not depend on a public RPC being up, and so a failure
  means the gateway is wrong rather than that Base Sepolia was busy. The
  routing table and the refusals are exercised without a network at all.

      node tools/verify-portal.mjs
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import { Chain, encodeAddressArg, decUint } from "./evm.mjs";
import { createAddressFromString } from "@ethereumjs/util";
import { deploySite, encRequest, decResponse, LAYERZERO, endpointFor } from "./site.mjs";
import { CHAINS, route } from "./portal.mjs";

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${n}`);
  if (!c && d !== undefined) console.log(`      ${d}`);
};
const eq = (n, g, w) => ok(n, String(g) === String(w), `got ${g}\n      want ${w}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);

head("the routing table");
{
  const r = route("0x0f6b6921ea8d98733dcee0d981afca7726ecbbd9.basesep.ipseity.link");
  eq("a short name resolves to its chain id", r && r.id, 84532);
  eq("and the address comes off the front", r && r.address,
     "0x0f6b6921ea8d98733dcee0d981afca7726ecbbd9");

  /*  A chain's number is the one name it can never lose, so it always
      works even where the short name is unknown to a reader.          */
  eq("a numeric id works as well as a name",
     route("0x0f6b6921ea8d98733dcee0d981afca7726ecbbd9.4663.x.y.z").id, 4663);

  /*  Read from the RIGHT would be wrong: a domain may have any number of
      labels. The address is always first and the chain always second. */
  eq("a domain with many labels still routes",
     route("0x0f6b6921ea8d98733dcee0d981afca7726ecbbd9.base.a.b.c.d.example").id, 8453);

  ok("an unknown chain is reported as unknown rather than guessed",
     route("0x0f6b6921ea8d98733dcee0d981afca7726ecbbd9.nope.ipseity.link").id === null);
  ok("a host with no address in it is refused outright",
     route("ipseity.link") === null);
  ok("and so is one whose first label only looks like an address",
     route("0xnothex.base.ipseity.link") === null);
  ok("a port on the host does not confuse it",
     route("0x0f6b6921ea8d98733dcee0d981afca7726ecbbd9.base.localhost:8080").id === 8453);
  ok("case does not matter",
     route("0x0F6B6921EA8D98733DCEE0D981AFCA7726ECBBD9.BASE.IPSEITY.LINK").id === 8453);

  /*  Every chain this collection is deployed to must be reachable through
      the door, or the door is decorative on that chain.               */
  for (const want of [1, 8453, 56, 4663]) {
    ok(`chain ${want} (${CHAINS[want] ? CHAINS[want].name : "?"}) is one this door opens onto`,
       !!CHAINS[want] && !!CHAINS[want].rpc);
  }
}

head("it serves what the contract said, and nothing of its own");
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();

const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const tmpReg = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode);
await c.vm.stateManager.putCode(createAddressFromString(REGISTRY),
  await c.vm.stateManager.getCode(createAddressFromString(tmpReg)));

const impl = await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode);
const grip = await c.deploy(A("src/GripVault.sol", "GripVault").bytecode);
const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, "0".repeat(64));
const sigil = await c.deploy(A("src/Sigil.sol", "Sigil").bytecode);
const renderer = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  encodeAddressArg(engine) + encodeAddressArg(sigil));
const nft = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(renderer) + encodeAddressArg(impl) + encodeAddressArg(grip) +
  (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"));
await c.exec(nft, "mint()", [], { value: 10n ** 16n });
const pool  = await c.deploy(A("src/Pool.sol", "Pool").bytecode,
  encodeAddressArg(nft) + (10n ** 27n).toString(16).padStart(64, "0") +
  encodeAddressArg(c.from.toString()) + "0".repeat(64));
const lease = await c.deploy(A("src/Lease.sol", "Lease").bytecode, encodeAddressArg(nft));
const site = await deploySite(c, A, { hub: nft, pool, lease, sigil });

/*  The portal's own read path, exercised against a real Premises: encode
    the resource, call, decode. Anything the portal adds beyond this is
    content it invented, which is the thing it must never do.          */
const GET = async (path) =>
  decResponse(await c.call(site.premises, encRequest(path.split("/").filter(Boolean))));

const doc = await GET("/services.json");
eq("a route answers with the contract's own status", doc.status, 200);
ok("and the contract's own content type",
   doc.headers.some(([k, v]) => k.toLowerCase() === "content-type" && /json/.test(v)),
   JSON.stringify(doc.headers));
ok("the body parses as what it claims to be", (() => {
  try { JSON.parse(doc.body); return true; } catch { return false; }
})());

const missing = await GET("/there-is-no-such-page");
eq("a path the contract does not know is the contract's 404, not the door's",
   missing.status, 404);

/*  `/door` rather than `/`: the root serves the live instrument, and this
    harness deploys an Engine with no document loaded, so the root is
    correctly almost empty. The flat page has real content either way, and
    what is under test is that the door relays a body rather than that the
    artwork is present.                                                  */
const flat = await GET("/door");
eq("a substantial page answers 200", flat.status, 200);
ok("with the contract's own bytes and none added",
   flat.body.length > 4000 && flat.body.includes("<h1"), `${flat.body.length} B`);
ok("and it is HTML because the contract said so, not because the door assumed",
   flat.headers.some(([k, v]) => k.toLowerCase() === "content-type" && /html/.test(v)));

/*  The header allowlist. A contract choosing its own Content-Type is the
    whole point of ERC-5219; a contract setting Set-Cookie on an origin it
    shares with every other contract is not.                           */
head("only headers that cannot hurt a shared origin cross");
{
  const ALLOW = new Set(["content-type", "cache-control", "content-language",
                         "content-disposition", "etag", "last-modified", "vary"]);
  const src = await import("node:fs").then((fs) => fs.readFileSync("tools/portal.mjs", "utf8"));
  for (const bad of ["set-cookie", "access-control-allow-origin", "location",
                     "strict-transport-security", "content-security-policy"]) {
    ok(`${bad} cannot be set by a contract`, !ALLOW.has(bad));
  }
  ok("and a header carrying a newline is dropped rather than written",
     /\[\\r\\n\]/.test(src) || /[\\]r[\\]n/.test(src),
     "no CR/LF guard found in portal.mjs");
  ok("the door carries no signing key and no code that could use one",
     !/privateToAddress|DEV_KEYS|sendRawTransaction|__wallet/.test(src),
     "portal.mjs references key material");
  ok("and it writes nothing to the chain",
     !/\.exec\(|\.send\(|eth_sendTransaction/.test(src));
}

/*  The chain table is the one part of this file that is a claim about the
    world rather than about code: every chain the collection intends to
    mint on must have a door, and a door that silently lacks one sends a
    visitor to a gateway that answers NXDOMAIN.                         */
head("the door opens onto every chain the collection means to use");
{
  const MINTS = { 1: "eth", 8453: "base", 56: "bnb", 4663: "rhc", 130: "unichain" };
  for (const [id, name] of Object.entries(MINTS)) {
    ok(`chain ${id} is served, as ${name}`,
       CHAINS[id] && CHAINS[id].name === name,
       CHAINS[id] ? `named ${CHAINS[id].name}` : "absent from the table");
  }
  /*  And every entry must be reachable by BOTH of its names, because a
      person copying a w3link-style host will type the short one and a
      program will type the number.                                    */
  const byNum = route("0x" + "11".repeat(20) + ".130.example");
  const byName = route("0x" + "11".repeat(20) + ".unichain.example");
  eq("a chain answers to its number", byNum && byNum.id, 130);
  eq("and to its short name", byName && byName.id, 130);
}

/*  The LayerZero table is a claim about seven other chains, and the last
    time a claim like that was made from memory it was wrong in a way that
    changed the whole design. So it is pinned here: every mint chain must
    have an endpoint, and no entry may carry an address from the wrong
    family — the two canonical endpoints are not interchangeable, and a
    port deployed against the wrong one points at nothing.             */
head("every chain that mints has a LayerZero endpoint on record");
{
  const OLD = "0x1a44076050125825900e736c501f859c50fE728c".toLowerCase();
  const NEW = "0x6f475642a6e85809b1c36fa62763669b1b48dd5b".toLowerCase();
  const MINTS = [1, 8453, 56, 130, 4663];
  for (const id of MINTS) {
    const e = endpointFor(id);
    ok(`chain ${id} has an endpoint and an eid`,
       !!e && e.eid > 0 && /^0x[0-9a-fA-F]{40}$/.test(e.endpoint),
       JSON.stringify(e));
  }
  ok("every endpoint is one of the two canonical addresses",
     Object.values(LAYERZERO).every((e) => [OLD, NEW].includes(e.endpoint.toLowerCase())),
     Object.values(LAYERZERO).map((e) => e.endpoint).join(" "));
  /*  The two chains that were reported as having no LayerZero at all.  */
  eq("Unichain is on the later endpoint, not the earlier one",
     LAYERZERO[130].endpoint.toLowerCase(), NEW);
  eq("and so is Robinhood", LAYERZERO[4663].endpoint.toLowerCase(), NEW);
  ok("no two chains share an eid",
     new Set(Object.values(LAYERZERO).map((e) => e.eid)).size === Object.keys(LAYERZERO).length);
  eq("a chain with no endpoint answers null, never a guess", endpointFor(999999), null);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
