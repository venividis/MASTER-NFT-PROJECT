#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the portal — one door, any chain

  `tools/gateway.mjs` is the local one: one deployment, one chain, and two
  wallet endpoints that only make sense against a development node. This is
  the public one. It serves any ERC-5219 contract on any chain it knows an
  RPC for, routed by host:

      https://<address>.<chain>.<domain>/path      → request(["path"], [])

  where <chain> is a short name or a numeric id. It holds no content and no
  keys. Turn it off and every byte it ever served is still on the chain;
  point it at a different RPC and it serves the same bytes again.

  ── why this exists ──

  A web3:// URL needs no gateway at all: a client that speaks the scheme
  does the eth_call itself and needs nothing but an RPC. Gateways exist for
  everyone else, and the public one — w3link.io — carries a curated list of
  chains. Measured, not assumed: it answers for 1, 56, 8453, 84532 and
  42161, and returns NXDOMAIN for 4663 and 130. Robinhood Chain runs no
  gateway of its own; three plausible hostnames resolve through a wildcard
  and refuse every connection, which is exactly why DNS is not evidence.

  So a collection that wants to live on a chain nobody has added has two
  choices: ask, or carry its own door. This is the door. It changes no
  trust: relying on somebody else's gateway was already relying on
  somebody's server, and the contracts remain the only source of truth.
  What it changes is that the door covers the chains this collection chose,
  and cannot be taken away.

  ── what it deliberately does not have ──

  No signing endpoint. `gateway.mjs` carries one for the browser harness,
  guarded to chain 31337 because the keys it uses are printed in every
  hardhat banner. A public door with a signer is a wallet-shaped hole, so
  this file has no key material and no code that could use one.

  No content of its own, no rewriting, no injection. What the contract
  returned is what goes out, with the status and the headers the contract
  chose. The one thing added is a strict allowlist of which headers may
  cross, because a contract that could set arbitrary response headers on a
  shared origin could set cookies for its neighbours.

      node tools/portal.mjs --port 8080
      node tools/portal.mjs --port 8080 --domain ipseity.link
      node tools/portal.mjs --once http://0xabc….base.localhost/services.json
───────────────────────────────────────────────────────────────────────────*/
import http from "node:http";
import { RpcChain } from "./rpc.mjs";
import { encRequest, decResponse } from "./site.mjs";

const ARGV = process.argv.slice(2);
const arg = (f, d) => { const i = ARGV.indexOf(f); return i < 0 ? d : ARGV[i + 1]; };

/*  The chains this door opens onto. Short names follow EIP-3770 so a URL
    that works here works on w3link where w3link serves the chain; the
    numeric id always works too, because a chain's number is the one name
    it can never lose.                                                   */
export const CHAINS = {
  1:        { name: "eth",      rpc: "https://ethereum-rpc.publicnode.com" },
  8453:     { name: "base",     rpc: "https://mainnet.base.org" },
  56:       { name: "bnb",      rpc: "https://bsc-rpc.publicnode.com" },
  4663:     { name: "rhc",      rpc: "https://rpc.mainnet.chain.robinhood.com" },
  /*  Uniswap's own L2, and the only chain surveyed that carries the v4
      PoolManager, the v3 factory, the Universal Router and Permit2 all at
      once — measured, 24,050 / 24,535 / 19,499 / 9,152 bytes. Its base fee
      is 0.0005 gwei, the cheapest of the eight, and its prevrandao is real
      beacon randomness rather than the constant 1 that Arbitrum and Polygon
      return, so the mint seed keeps its full strength there.

      w3link returns NXDOMAIN for it, which is exactly why this file
      exists.                                                            */
  130:      { name: "unichain", rpc: "https://mainnet.unichain.org" },
  10:       { name: "op",       rpc: "https://optimism-rpc.publicnode.com" },
  42161:    { name: "arb1",     rpc: "https://arbitrum-one-rpc.publicnode.com" },
  11155111: { name: "sep",      rpc: "https://ethereum-sepolia-rpc.publicnode.com" },
  84532:    { name: "basesep",  rpc: "https://sepolia.base.org" },
};
const BY_NAME = new Map(Object.entries(CHAINS).map(([id, c]) => [c.name, Number(id)]));

/*  Only these cross. A contract choosing its own Content-Type is the point
    of ERC-5219; a contract setting Set-Cookie on a shared origin is not.  */
const ALLOW = new Set(["content-type", "cache-control", "content-language",
                       "content-disposition", "etag", "last-modified", "vary"]);

const chains = new Map();
async function chainFor(id) {
  if (chains.has(id)) return chains.get(id);
  const spec = CHAINS[id];
  if (!spec) return null;
  const c = new RpcChain(spec.rpc, "0x" + "00".repeat(31) + "01", id);
  chains.set(id, c);
  return c;
}

/*  `<address>.<chain>.<domain>` — read from the right, because a domain may
    have any number of labels and the address is always the first.        */
export function route(host) {
  const bare = String(host || "").split(":")[0].toLowerCase();
  const parts = bare.split(".");
  if (parts.length < 2) return null;
  const address = parts[0];
  if (!/^0x[0-9a-f]{40}$/.test(address)) return null;
  const label = parts[1];
  const id = /^[0-9]+$/.test(label) ? Number(label) : BY_NAME.get(label);
  if (!id || !CHAINS[id]) return { address, id: null, label };
  return { address, id, label };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

/*  Every refusal says which of the three things went wrong, because a
    blank page cannot be told apart from a chain that is down.           */
const refuse = (res, code, title, detail) => {
  const known = Object.entries(CHAINS)
    .map(([id, c]) => `${c.name} (${id})`).join(", ");
  res.writeHead(code, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset=utf-8><title>${esc(title)}</title>` +
    `<style>body{background:#030206;color:#ddd6c6;font:15px/1.7 Georgia,serif;` +
    `max-width:34rem;margin:14vh auto;padding:0 1.5rem}` +
    `h1{font-weight:200;letter-spacing:.3em;text-transform:uppercase;font-size:1rem;color:#f4dda6}` +
    `code{color:#9fb4d0}</style>` +
    `<h1>${esc(title)}</h1><p>${esc(detail)}</p>` +
    `<p><small>This door opens onto: <code>${esc(known)}</code>. ` +
    `It holds no content — every byte it serves comes from a contract.</small></p>`);
};

export async function serve(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD")
    return refuse(res, 405, "only GET", "A contract is read, not written to, through this door.");

  const r = route(req.headers.host);
  if (!r)
    return refuse(res, 400, "no address in that host",
      "A request here looks like https://<address>.<chain>.<domain>/path.");
  if (!r.id)
    return refuse(res, 404, "no such chain",
      `This door does not know a chain called "${r.label}".`);

  const c = await chainFor(r.id);
  const path = decodeURIComponent(req.url.split("?")[0]);
  const resource = path.split("/").filter(Boolean);

  /*  Four different failures reach here and they are not the same: the
      node would not answer, nothing is deployed, something is deployed
      that is not an ERC-5219 contract, or one that is reverted on this
      path. One "error" for all four sends people to debug the wrong one.

      The empty case has to be tested for rather than caught, because
      `eth_call` to an address with no code returns `0x` and succeeds. It
      was reported as "the chain did not answer", which blames a node that
      answered perfectly.                                                */
  let raw;
  try {
    raw = await c.call(r.address, encRequest(resource));
  } catch (e) {
    const m = String(e && e.message || e);
    if (/execution reverted|invalid opcode|out of gas/i.test(m))
      return refuse(res, 502, "that contract refused the request",
        `Something is deployed at ${r.address} on ${CHAINS[r.id].name}, but it reverted ` +
        `on this path rather than answering.`);
    return refuse(res, 504, `${CHAINS[r.id].name} did not answer`,
      `The node for chain ${r.id} failed this read. The contract is unaffected; ` +
      `try again, or point a client at another RPC.`);
  }

  if (!raw || raw === "0x" || raw.length <= 2)
    return refuse(res, 404, "nothing is deployed there",
      `Chain ${CHAINS[r.id].name} answered, and there is no code at ${r.address}.`);

  let out;
  try {
    out = decResponse(raw);
  } catch {
    return refuse(res, 502, "that is not an ERC-5219 contract",
      `${r.address} on ${CHAINS[r.id].name} answered with ${(raw.length - 2) / 2} bytes ` +
      `that are not a (status, body, headers) response.`);
  }

  const headers = { "Content-Type": "text/html; charset=utf-8" };
  for (const [k, v] of out.headers) {
    const key = String(k).toLowerCase();
    /*  A header value carrying CR or LF could end the header block and
        start writing a response of its own.                             */
    if (ALLOW.has(key) && !/[\r\n]/.test(String(v))) headers[k] = v;
  }
  const body = Buffer.from(out.body, "utf8");
  headers["Content-Length"] = String(body.length);
  res.writeHead(out.status || 200, headers);
  res.end(req.method === "HEAD" ? undefined : body);
}

/*───────────────── run it, or check one URL and exit ─────────────────*/
if (import.meta.url === `file://${process.argv[1]}`) {
  const once = arg("--once", null);
  if (once) {
    const u = new URL(once);
    const fake = { method: "GET", url: u.pathname, headers: { host: u.host } };
    let code = 0, hdrs = {}, chunks = [];
    await serve(fake, {
      writeHead: (c, h) => { code = c; hdrs = h || {}; },
      end: (b) => { if (b) chunks.push(b); }
    });
    const body = Buffer.concat(chunks.map((x) => Buffer.from(x)));
    console.log(`${code}  ${body.length} B  ${hdrs["Content-Type"] || hdrs["content-type"] || "?"}`);
    console.log(body.toString("utf8").slice(0, Number(arg("--show", 0))));
    process.exit(code >= 400 ? 1 : 0);
  }

  const PORT = Number(arg("--port", 8080));
  http.createServer((req, res) => {
    serve(req, res).catch(() => refuse(res, 500, "the door failed",
      "This is a defect in the gateway, not in the contract it was reading."));
  }).listen(PORT, () => {
    console.log(`\n  \x1b[1mIPSEITY · the portal\x1b[0m  :${PORT}`);
    console.log(`  \x1b[2mopens onto ${Object.values(CHAINS).map((c) => c.name).join(", ")}\x1b[0m`);
    console.log(`  \x1b[2m<address>.<chain>.${arg("--domain", "localhost")}\x1b[0m\n`);
  });
}
