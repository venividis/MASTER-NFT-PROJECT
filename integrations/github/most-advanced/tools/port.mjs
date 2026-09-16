#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the port, deployed over a wire

  `verify-port.mjs` proves the port's behaviour on an in-process EVM;
  this tool puts one on a real chain and drives it there. Four verbs:

    RPC_URL=… node tools/port.mjs status
        what this chain carries: its LayerZero endpoint, measured (code
        size, eid()), and where a port would land for this key.

    RPC_URL=… PRIVATE_KEY=0x… node tools/port.mjs deploy --peers 84532,11155111
        deploy a ParleyPort wired to those chains' ports. The peer
        addresses are not asked for, because they are computed: run the
        deploy from a FRESH key whose nonce is zero on every chain, and
        CREATE puts the port at the same address everywhere — an address
        that depends on (deployer, nonce) and on nothing in the
        constructor. Each port then names its peers as its own address
        on the other chains' eids, and the circle closes with no second
        pass and no admin to do the closing. A nonce that is not zero
        refuses (--nonce N overrides, for a key holding the same nonzero
        nonce everywhere — you get to be sure, not the tool).

    RPC_URL=… PRIVATE_KEY=0x… node tools/port.mjs echo --port 0x… --from 1 --text "…"
        quote, then pay exactly the quote, and say it to every peer.
        `quote` is the same verb without the transaction.

    RPC_URL=… node tools/port.mjs walk --port 0x…
        read the echoed conversation backwards, one single-block
        eth_getLogs per message, the same step Parley's own walk takes —
        measured proof that the federated archive needs no indexer
        either.

  The endpoint and eid come from the measured tables in site.mjs
  (LAYERZERO for the edition's chains, LAYERZERO_TESTNETS for the
  rehearsals); the local Parley address comes from deployments/<chain>.json
  or --parley. Pinning the security stack at construction is available as
  repeatable flags (--lane-lib eid:sendLib:recvLib, --config-pin
  lib:eid:type:0xbytes); passing none floats on the endpoint's defaults,
  which the contract's header argues is admissible for speech and would
  not be for custody.
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { compile, artifact } from "./compile.mjs";
import { RpcChain, DEV_KEYS } from "./rpc.mjs";
import { LAYERZERO, LAYERZERO_TESTNETS, predictCreate, portPeers } from "./site.mjs";
import { sel, enc } from "./evm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const verb = argv[0];
const flag = (name, dflt) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const flags = (name) => {
  const out = [];
  for (let i = 0; i < argv.length; i++)
    if (argv[i] === "--" + name) out.push(argv[i + 1]);
  return out;
};

const w = (n) => BigInt(n).toString(16).padStart(64, "0");
const b32 = (a) => String(a).toLowerCase().replace(/^0x/, "").padStart(64, "0");
const hex = (t) => "0x" + Buffer.from(t, "utf8").toString("hex");

const RPC = process.env.RPC_URL || "http://127.0.0.1:8545";
const KEY = process.env.PRIVATE_KEY || DEV_KEYS[0];

const lzFor = (chainId) =>
  LAYERZERO[Number(chainId)] || LAYERZERO_TESTNETS[Number(chainId)] || null;

const recordFor = (chainId) => {
  const dir = path.join(ROOT, "deployments");
  if (!fs.existsSync(dir)) return null;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (Number(j.chainId) === Number(chainId)) return j;
  }
  return null;
};

const c = await RpcChain.open(RPC, KEY);
const lz = lzFor(c.chainId);

if (verb === "status") {
  console.log(`\n  chain ${c.chainId}, key ${c.from}`);
  if (!lz) {
    console.log("  no LayerZero endpoint in the measured tables for this chain —");
    console.log("  a chain with no endpoint deploys no port, rather than one pointed at nothing.\n");
    process.exit(0);
  }
  const size = await c.codeSize(lz.endpoint);
  const eid = size ? Number(BigInt(await c.call(lz.endpoint, sel("eid()")))) : 0;
  console.log(`  endpoint ${lz.endpoint}: ${size} bytes of code, eid() = ${eid}`
    + (eid === lz.eid ? "" : `  (TABLE SAYS ${lz.eid} — the table or the chain is wrong)`));
  const nonce = await c.nonceNow();
  console.log(`  this key's nonce here is ${nonce}; a nonce-0 deploy lands at ${predictCreate(c.from.toString(), 0n)}`);
  const rec = recordFor(c.chainId);
  console.log(`  parley on record: ${rec && rec.contracts && (rec.contracts.parley || rec.parley) || "none — pass --parley"}\n`);
  process.exit(0);
}

if (verb === "deploy") {
  if (!lz) throw new Error(`no LayerZero endpoint known for chain ${c.chainId} — it deploys no port`);
  /*  The default peers are the EDITION's other chains — the bands, not
      every chain LayerZero reaches. A testnet has no band, so a
      rehearsal names its peers explicitly.                             */
  const peersArg = flag("peers") || portPeers(c.chainId).map((p) => p.chainId).join(",");
  const peerChains = peersArg.split(",").map((s) => Number(s.trim())).filter(Boolean);
  if (!peerChains.length) throw new Error("no peers — a port that hears nobody carries nothing (testnets: --peers)");
  for (const id of peerChains)
    if (!lzFor(id)) throw new Error(`chain ${id} has no endpoint in the tables — it cannot be a peer`);

  const rec = recordFor(c.chainId);
  const parley = flag("parley", rec && (rec.contracts && rec.contracts.parley || rec.parley));
  if (!parley) throw new Error("no Parley address — deployments/ has no record for this chain; pass --parley");

  const wantNonce = BigInt(flag("nonce", "0"));
  const nonce = await c.nonceNow();
  if (nonce !== wantNonce)
    throw new Error(`this key's nonce here is ${nonce}, not ${wantNonce} — the same-address trick `
      + `needs the same nonce on every chain. Use a fresh key, or --nonce if you are sure.`);
  const self = predictCreate(c.from.toString(), wantNonce);

  /*  Six constructor args: parley, endpoint, eids[], peers[], lanes[], pins[].
      Every peer is this same address, on that chain's eid.              */
  const eids = peerChains.map((id) => lzFor(id).eid);
  const eidsTail = w(eids.length) + eids.map((e) => w(e)).join("");
  const peersTail = w(eids.length) + eids.map(() => b32(self)).join("");

  const lanePins = flags("lane-lib").map((s) => {
    const [eid, send, recv] = s.split(":");
    return w(eid) + b32(send || 0) + b32(recv || 0);
  });
  const lanesTail = w(lanePins.length) + lanePins.join("");

  const cfgEntries = flags("config-pin").map((s) => {
    const [lib, eid, type, bytes] = s.split(":");
    const body = bytes.replace(/^0x/, "");
    return b32(lib) + w(eid) + w(type) + w(0x80) +
      w(body.length / 2) + body.padEnd(Math.ceil(body.length / 64) * 64, "0");
  });
  let cfgTail = w(cfgEntries.length);
  let off = cfgEntries.length * 32;
  for (const e of cfgEntries) { cfgTail += w(off); off += e.length / 2; }
  cfgTail += cfgEntries.join("");

  const offEids = 0xc0;
  const offPeers = offEids + eidsTail.length / 2;
  const offLanes = offPeers + peersTail.length / 2;
  const offCfg = offLanes + lanesTail.length / 2;
  const args = b32(parley) + b32(lz.endpoint) +
    w(offEids) + w(offPeers) + w(offLanes) + w(offCfg) +
    eidsTail + peersTail + lanesTail + cfgTail;

  console.log(`\n  deploying the port for chain ${c.chainId} (eid ${lz.eid})`);
  console.log(`  peers: ${peerChains.map((id) => `${id} (eid ${lzFor(id).eid})`).join(", ")}`);
  console.log(`  every one of them at ${self} — this deploy's own address, on their chain\n`);

  /*  --dry stops here: everything above is computed from the chain and
      the tables, nothing was sent, and no funds were needed. Run it
      against each peer chain with the same fresh key and the printed
      address must be identical everywhere — that equality is the whole
      wiring, checked before a single transaction exists.               */
  if (argv.includes("--dry")) {
    console.log(`  constructor args: ${args.length / 2} bytes`);
    console.log(`  (dry run — nothing sent)\n`);
    process.exit(0);
  }

  const out = compile({ quiet: true });
  const port = await c.deploy(artifact(out, "src/ParleyPort.sol", "ParleyPort").bytecode, args, "port");
  if (port.toLowerCase() !== self.toLowerCase())
    throw new Error(`the port landed at ${port}, not the predicted ${self} — every peer is now wrong`);

  /*  Read it back off the chain, because a deploy that is not read back
      is a hope. eid, peers, and the delegate the constructor zeroed.

      Read it back PATIENTLY: a load-balanced public endpoint answers
      each request from whichever replica the balancer picks, and a
      replica one block behind serves an eth_call against the deploy's
      address as `0x` — an empty answer, not an error, so the transport
      retry never fires. The first run of this tool crashed here on
      exactly that, one line after a successful deploy. An empty answer
      is "not yet visible", never a value.                              */
  const patient = async (data) => {
    for (let i = 0; i < 20; i++) {
      const r = await c.call(port, data).catch(() => "0x");
      if (r && r !== "0x") return r;
      await new Promise((s) => setTimeout(s, 3000));
    }
    throw new Error("the chain never showed the deployed port to a read — check it by hand");
  };
  const localEid = Number(BigInt(await patient(sel("LOCAL_EID()"))));
  const delegate = "0x" + (await c.call(lz.endpoint, sel("delegates(address)") + b32(port))).slice(-40);
  console.log(`  landed at ${port}`);
  console.log(`  LOCAL_EID reads ${localEid}${localEid === lz.eid ? "" : "  (WRONG — expected " + lz.eid + ")"}`);
  console.log(`  delegate reads ${delegate}${/^0x0+$/.test(delegate) ? " — nobody, as constructed" : "  (WRONG — should be zero)"}`);
  for (const id of peerChains) {
    const got = "0x" + (await patient(sel("peerOf(uint32)") + w(lzFor(id).eid))).slice(-40);
    console.log(`  peerOf(${lzFor(id).eid}) reads ${got}${got.toLowerCase() === self.toLowerCase() ? "" : "  (WRONG)"}`);
  }

  fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
  const recPath = path.join(ROOT, "dist", `port-${c.chainId}.json`);
  fs.writeFileSync(recPath, JSON.stringify({
    chainId: c.chainId, eid: lz.eid, endpoint: lz.endpoint, port,
    parley, peers: peerChains.map((id) => ({ chainId: id, eid: lzFor(id).eid, port: self })),
  }, null, 2) + "\n");
  console.log(`\n  recorded in ${path.relative(ROOT, recPath)} — the same deploy, from the same`);
  console.log(`  fresh key, now runs on each peer chain, and the lanes exist.\n`);
  process.exit(0);
}

if (verb === "quote" || verb === "echo") {
  const port = flag("port");
  const from = BigInt(flag("from", "1"));
  const text = flag("text", "");
  if (!port || !text) throw new Error(`${verb} needs --port 0x… and --text "…"`);
  const body = hex(text);
  const quoted = BigInt(await c.read(port, "quoteEcho(uint256,uint8,bytes,bytes)",
    [from, 0, body, "0x"]));
  console.log(`\n  echoing ${body.length / 2 - 1} bytes to every peer costs ${quoted} wei`);
  if (verb === "quote") process.exit(0);
  const r = await c.exec(port, "echo(uint256,uint8,bytes,bytes)",
    [from, 0, body, "0x"], { value: quoted, label: "echo" });
  console.log(`  sent in ${r.hash} for ${r.gas} gas — the DVNs attest, then anyone may deliver\n`);
  process.exit(0);
}

if (verb === "walk") {
  const port = flag("port");
  if (!port) throw new Error("walk needs --port 0x…");
  const topic0 = "0x" + Buffer.from(
    keccak256(Buffer.from("Echoed(uint32,uint256,uint64,uint64,uint8,bytes)", "utf8"))
  ).toString("hex");
  let at = BigInt(await c.call(port, sel("lastEcho()")));
  let queries = 0;
  console.log("");
  while (at !== 0n) {
    const logs = await c.getLogs({
      address: port, topics: [topic0],
      fromBlock: "0x" + at.toString(16), toBlock: "0x" + at.toString(16),
    });
    queries += 1;
    if (!logs.length) { console.log(`  block ${at}: the pointer dangles — a pruned log or a lying node`); break; }
    let next = 0n;
    for (const l of logs.reverse()) {
      const eid = Number(BigInt(l.topics[1]));
      const token = BigInt(l.topics[2]);
      const d = l.data.slice(2);
      const prev = BigInt("0x" + d.slice(0, 64));
      const len = Number(BigInt("0x" + d.slice(256, 320)));
      const body = Buffer.from(d.slice(320, 320 + len * 2), "hex").toString("utf8");
      console.log(`  block ${at} · from eid ${eid}, token ${token}: ${JSON.stringify(body)}`);
      next = prev;
    }
    at = next;
  }
  console.log(`\n  ${queries} single-block queries, no range scan, no indexer.\n`);
  process.exit(0);
}

console.log(`\n  verbs: status | deploy | quote | echo | walk   (see the header)\n`);
process.exit(verb ? 1 : 0);
