#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · an HTTP gateway, which is all a web3:// gateway is

  Maps GET /path/segments onto Premises.request(["path","segments"], []) via
  eth_call and serves what comes back, with the status, Content-Type and
  Cache-Control the contract chose. This file holds no content — turn it
  off and every byte it ever served is still on the chain.

      node tools/gateway.mjs                    # reads dist/testnet.json
      node tools/gateway.mjs --port 8080

  Two extra endpoints exist for the browser harness and for people without
  a wallet extension pointed at the node, and they are testnet furniture,
  not part of the site:

      POST /__rpc      forwarded verbatim to the node, so pages on this
                       origin can eth_call and eth_getLogs without CORS
      POST /__wallet   { from, to, data, value } — signed with one of the
                       hardhat development keys and sent. It refuses any
                       chain whose id is not 31337, because a signer that
                       would sign for a live chain with publicly-printed
                       keys is a wallet-shaped hole.
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { RpcChain, DEV_KEYS } from "./rpc.mjs";
import { encRequest, decResponse } from "./site.mjs";
import { privateToAddress, bytesToHex, hexToBytes } from "@ethereumjs/util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARGV = process.argv.slice(2);
const arg = (f, d) => { const i = ARGV.indexOf(f); return i < 0 ? d : ARGV[i + 1]; };

/*  --record picks the deployment; without it, the most recent local run
    wins, then the committed Base Sepolia record — so a fresh clone serves
    the public deployment with no setup at all.                          */
const recordPath = arg("--record",
  fs.existsSync(path.join(ROOT, "dist/testnet.json"))
    ? path.join(ROOT, "dist/testnet.json")
    : path.join(ROOT, "deployments/base-sepolia.json"));
const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
const PORT = Number(arg("--port", 8080));
const PREMISES = record.contracts.premises;

const c = await RpcChain.open(record.rpc, DEV_KEYS[0]);

/*  The dev accounts, by address, so /__wallet can sign as whichever one the
    page connected. Local chain only — checked at startup and per request. */
const signers = new Map();
if (c.chainId === 31337) {
  for (const k of DEV_KEYS) {
    signers.set(bytesToHex(privateToAddress(hexToBytes(k))).toLowerCase(),
                await c.as(k));
  }
}

const body = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on("data", (d) => chunks.push(d));
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
});

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/__rpc") {
      /*  Forwarded through the same client the pages use, because that one
          knows about proxies and this environment only has one road out. A
          bare fetch here worked on localhost and died in production, which
          is the exact bug shape this repository keeps meeting.          */
      const payload = JSON.parse(await body(req));
      res.writeHead(200, { "Content-Type": "application/json" });
      try {
        const result = await c.rpc(payload.method, payload.params || []);
        return res.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id ?? 1, result }));
      } catch (e) {
        return res.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id ?? 1,
          error: { code: -32000, message: String(e && e.message || e) } }));
      }
    }

    if (req.method === "POST" && req.url === "/__wallet") {
      if (c.chainId !== 31337) { res.writeHead(403); return res.end("live chain — bring a wallet"); }
      const { from, to, data, value } = JSON.parse(await body(req));
      const signer = signers.get(String(from || "").toLowerCase());
      if (!signer) { res.writeHead(403); return res.end("not a dev account"); }
      const r = await signer.send({ to, data, value: value ? BigInt(value) : 0n, label: "wallet" });
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ hash: r.hash }));
    }

    if (req.method !== "GET") { res.writeHead(405); return res.end(); }

    const segments = decodeURIComponent((req.url || "/").split("?")[0])
      .split("/").filter(Boolean);
    const raw = await c.call(PREMISES, encRequest(segments));
    const { status, body: page, headers } = decResponse(raw);

    const h = {};
    for (const [k, v] of headers) h[k] = v;
    res.writeHead(status, h);
    res.end(page);
  } catch (e) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("the node did not answer: " + (e && e.message || e));
  }
});

server.listen(PORT, () => {
  console.log(`
  serving ${PREMISES}
  from    ${record.rpc}  (chain ${c.chainId})
  at      http://localhost:${PORT}/

  Every page is an eth_call made when you ask. Stop this process and
  nothing is lost, because nothing is here.
`);
});
