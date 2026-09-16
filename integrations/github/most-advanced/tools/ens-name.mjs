#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · a name that resolves to the contract, not to a server

  ERC-6821 lets a `web3://` URL be written with an ENS name instead of an
  address, which is the difference between a link somebody will click and a
  hex string they will not. This registers the name and points it at the
  premises.

  Two things are deliberate.

  The name registered on a testnet is one that is ALSO free on mainnet. A
  rehearsal that uses a name you could never actually have teaches you a
  link that will not survive, and the whole point of this deployment is
  that it is a rehearsal for something real.

  And the commitment is not a formality. ENS registration is commit then
  reveal, with a minimum age between them, because a mempool that could see
  your name before you own it is a mempool that can take it. The wait here
  is that minimum, plus a margin — the node's clock is not this process's
  clock, and the contract compares against the block's.

    node tools/ens-name.mjs ipseity4d deployments/eth-sepolia.json [years]
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RpcChain } from "./rpc.mjs";
import { sel } from "./evm.mjs";
import { keccak256 } from "ethereum-cryptography/keccak.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = process.argv[2];
const REC   = process.argv[3];
const YEARS = BigInt(process.argv[4] || 5);
const RESOLVER = process.env.RESOLVER || "";
if (!LABEL || !REC) throw new Error("usage: ens-name.mjs <label> <record.json> [years]");

/*  ENS on Sepolia. The registry sits at the same address it does on
    mainnet; the rest do not, so they are checked rather than assumed —
    a controller that is merely an address with no code would take the
    commitment transaction and lose the name.                          */
/*  The controller address and its ABI both come from ensdomains/ens-contracts
    deployments/sepolia, not from a documentation page and not from memory.
    Two earlier attempts here failed for the same reason in two different
    disguises: an address that was once right, and a register() signature
    that was once right. The controller ENS documents was not the one the
    registrar had authorised, and the eight-argument register everyone
    quotes has been replaced by a single struct carrying a uint8
    reverseRecord and a referrer. Neither failure said so — both reverted
    with nothing, after the commitment had already been paid for.       */
const ENS = {
  registry:  "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
  base:      "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85",
  ctrl:      "0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968",
  resolver:  "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD",
};

/*  register((string,address,uint256,bytes32,address,bytes[],uint8,bytes32))

    One dynamic struct, so the outer head is a single offset and everything
    else is the tuple's own encoding. `reverseRecord` is a uint8 here, not
    the bool the old ABI took, and the last word is a referrer rather than
    the fuses — same arity, different meaning, and an encoder written from
    the old shape produces a call that decodes to nonsense rather than one
    that fails to decode.                                               */
const REG_ARGS = ({ label, owner, duration, secret, resolver, reverseRecord = 0, referrer = "0x" + "00".repeat(32) }) => {
  const W = (n) => BigInt(n).toString(16).padStart(64, "0");
  const AD = (a) => "0".repeat(24) + String(a).replace(/^0x/, "").toLowerCase();
  const b = Buffer.from(label, "utf8");
  const labelPadded = Buffer.alloc(32 * Math.ceil(b.length / 32) || 32);
  b.copy(labelPadded);
  const HEAD = 8 * 32;
  const dataAt = HEAD + 32 + labelPadded.length;
  return W(32)                       // -> the tuple
    + W(HEAD)                        // -> label, from the tuple's start
    + AD(owner)
    + W(duration)
    + String(secret).replace(/^0x/, "")
    + AD(resolver)
    + W(dataAt)                      // -> data[]
    + W(reverseRecord)
    + String(referrer).replace(/^0x/, "")
    + W(b.length) + labelPadded.toString("hex")
    + W(0);                          // data.length = 0
};

const rec = JSON.parse(fs.readFileSync(path.resolve(ROOT, REC), "utf8"));
const c = await RpcChain.open(rec.rpc, fs.readFileSync(path.join(ROOT, ".testnet-key"), "utf8").trim());
if (c.chainId !== 11155111) throw new Error(`this table is Sepolia's; chain ${c.chainId} would need its own`);

const hex = (b) => Buffer.from(b).toString("hex");
const w   = (n) => BigInt(n).toString(16).padStart(64, "0");
const ad  = (a) => "0".repeat(24) + String(a).replace(/^0x/, "").toLowerCase();
const encStr = (s) => {
  const b = Buffer.from(s, "utf8");
  const p = Buffer.alloc(32 * Math.ceil(b.length / 32) || 32);
  b.copy(p);
  return w(b.length) + p.toString("hex");
};
const namehash = (name) => {
  let node = Buffer.alloc(32);
  for (const l of name.split(".").reverse())
    node = Buffer.from(keccak256(Buffer.concat([node, Buffer.from(keccak256(Buffer.from(l, "utf8")))])));
  return "0x" + hex(node);
};

for (const [k, a] of Object.entries(ENS)) {
  if ((await c.codeSize(a)) === 0) throw new Error(`no code at the ${k} — wrong chain, or a moved deployment`);
}

const me = c.from.toString();
const NAME = LABEL + ".eth";
const node = namehash(NAME);
const DUR = YEARS * 31536000n;

const free = BigInt(await c.rpc("eth_call",
  [{ to: ENS.ctrl, data: sel("available(string)") + w(32) + encStr(LABEL) }, "latest"]));
if (free !== 1n) throw new Error(`${NAME} is not available on this chain`);

const rp = await c.rpc("eth_call",
  [{ to: ENS.ctrl, data: sel("rentPrice(string,uint256)") + w(64) + w(DUR) + encStr(LABEL) }, "latest"]);
const price = BigInt("0x" + rp.slice(2, 66)) + BigInt("0x" + rp.slice(66, 130));
console.log(`\n  ${NAME} · ${YEARS} year(s) · ${(Number(price) / 1e18).toFixed(6)} ETH`);

/*  A secret nobody can guess before the reveal. It is derived from data
    this process already has rather than from randomness, because a secret
    that only has to survive sixty seconds and never leaves this container
    does not need entropy it cannot reproduce if the reveal has to be
    retried.                                                            */
const secret = "0x" + hex(keccak256(Buffer.from(`${NAME}:${me}:${rec.contracts.premises}`, "utf8")));

/*  register(string,address,uint256,bytes32,address,bytes[],bool,uint16) —
    eight words of head, the label in the tail, then an empty bytes[]. The
    resolver is set by the controller; the address record is set after,
    because encoding a populated bytes[] of resolver multicalls is exactly
    the ABI work this repository refuses to do by hand.                */
/*  The resolver the name is pointed at is this collection's own nameplate,
    set by the controller during registration, so the name resolves to the
    token from its first block rather than after a second transaction. */
const args = REG_ARGS({
  label: LABEL, owner: me, duration: DUR, secret,
  resolver: RESOLVER || ENS.resolver
});

const SIG_MAKE = "makeCommitment((string,address,uint256,bytes32,address,bytes[],uint8,bytes32))";
const SIG_REG  = "register((string,address,uint256,bytes32,address,bytes[],uint8,bytes32))";

const commitment = await c.rpc("eth_call",
  [{ to: ENS.ctrl, data: sel(SIG_MAKE) + args }, "latest"]);
console.log(`  commitment ${commitment.slice(0, 18)}…`);

await c.exec(ENS.ctrl, "commit(bytes32)", [commitment], { label: "commit" });
const minAge = Number(BigInt(await c.rpc("eth_call", [{ to: ENS.ctrl, data: sel("minCommitmentAge()") }, "latest"])));
console.log(`  committed · waiting ${minAge + 30}s (the contract compares against the block's clock, not ours)`);
await new Promise((r) => setTimeout(r, (minAge + 30) * 1000));

await c.send({ to: ENS.ctrl,
  data: sel(SIG_REG) + args,
  value: (price * 105n) / 100n,          // ENS refunds the excess
  label: "register" });

const owner = await c.rpc("eth_call", [{ to: ENS.registry, data: sel("owner(bytes32)") + node.slice(2) }, "latest"]);
console.log(`  registered · registry owner 0x${owner.slice(-40)}`);

/*  The address record: what a `web3://` gateway reads to turn the name
    back into the contract that answers.                                */
await c.exec(ENS.resolver, "setAddr(bytes32,address)", [node, rec.contracts.premises], { label: "setAddr" });
const got = await c.rpc("eth_call",
  [{ to: ENS.resolver, data: sel("addr(bytes32)") + node.slice(2) }, "latest"]);
const landed = "0x" + got.slice(-40);
console.log(`  ${NAME} -> ${landed}`);
if (landed.toLowerCase() !== String(rec.contracts.premises).toLowerCase())
  throw new Error(`the record resolves to ${landed}, not the premises`);

rec.ens = { name: NAME, node, expires: `${YEARS} year(s) from registration`, resolver: ENS.resolver };
rec.urls = { ...(rec.urls || {}), named: `https://${NAME}.sep.w3link.io/` };
fs.writeFileSync(path.resolve(ROOT, REC), JSON.stringify(rec, null, 1));
console.log(`\n  https://${NAME}.sep.w3link.io/\n  record updated\n`);
