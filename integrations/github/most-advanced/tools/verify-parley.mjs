#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the tokens talking, on a real EVM

  `test/Parley.t.sol` checks what the contract stores. This checks the thing
  the contract exists for: that a conversation written as logs can be read
  back by something with no index, no server and no memory of what happened
  — by walking the back-links, one block at a time, the way a browser does.

  The walker below is deliberately a *second* implementation. The one that
  ships lives in `DeskTalk.sol` and is driven by `tools/verify-site.mjs`
  against a DOM. Two independent readers of the same archive have to agree,
  and if they ever stop, one of them is wrong in a way a single reader could
  never have reported.

    node tools/verify-parley.mjs
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import { Chain, sel, decUint, decBool, encodeAddressArg, roll, BLOCK } from "./evm.mjs";
import * as evm from "./evm.mjs";
import { keccak256 } from "ethereum-cryptography/keccak.js";

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${name}`);
  if (!cond && detail !== undefined) console.log(`      ${detail}`);
};
const eq = (name, got, want) =>
  ok(name, String(got) === String(want), `got ${got}\n      want ${want}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const w = (n) => BigInt(n).toString(16).padStart(64, "0");
const topic0 = (sig) => "0x" + Buffer.from(keccak256(Buffer.from(sig))).toString("hex");

console.log("\n  \x1b[1mIPSEITY · the tokens talking\x1b[0m");

/*──────────────── stand it all up ────────────────*/
head("a collection, and a place to talk");
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();

{
  const { createAddressFromString } = await import("@ethereumjs/util");
  const tmp = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode);
  await c.vm.stateManager.putCode(
    createAddressFromString("0x000000006551c19487814612e58FE06813775758"),
    await c.vm.stateManager.getCode(createAddressFromString(tmp)));
}
const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, w(0), "Engine");
await c.exec(engine, "loadHead(bytes)", ["0x" + Buffer.from("<html><head></head>").toString("hex")]);
await c.exec(engine, "loadBody(bytes)", ["0x" + Buffer.from("<body></body></html>").toString("hex")]);
await c.exec(engine, "freeze()", []);
const renderer = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  encodeAddressArg(engine) + encodeAddressArg(await c.deploy(A("src/Sigil.sol", "Sigil").bytecode)),
  "Renderer");
const nft = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(renderer) +
  encodeAddressArg(await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode)) +
  encodeAddressArg(await c.deploy(A("src/GripVault.sol", "GripVault").bytecode)) + (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"), "Ipseity");
const parley = await c.deploy(A("src/Parley.sol", "Parley").bytecode,
  encodeAddressArg(nft), "Parley");
ok("the parley is deployed", (await c.codeSize(parley)) > 0);

const alice = c;
const bob = await c.as("0x" + "b0".repeat(32));
await alice.exec(nft, "mint()", [], { value: 10n ** 16n });       // #1 alice
await alice.exec(nft, "mint()", [], { value: 10n ** 16n });       // #2 alice → bob
await alice.exec(nft, "transferFrom(address,address,uint256)",
  [alice.from.toString(), bob.from.toString(), 2]);
eq("two tokens, two holders",
   (await c.read(nft, "ownerOf(uint256)", [2])).slice(-40), bob.from.toString().slice(2));

const SAID = topic0("Said(uint256,uint256,uint64,uint64,uint64,uint8,bytes)");
{
  const t = await c.read(parley, "topics()");
  eq("the contract derives the same topic the events carry",
     "0x" + t.slice(2, 66), SAID);
}

/*──────────────── a second reader ────────────────

  Everything below this line is written as if it had no idea how the
  contract works: it knows the address, the topic and the room, and it asks
  the node one block at a time. `asked` counts the queries, because "it
  found the messages" and "it found them without scanning the chain" are
  different claims and only one of them is the point.                    */
let asked = 0;
const readBody = (log) => {
  const d = log.data.replace(/^0x/, "");
  const at = (i) => BigInt("0x" + d.slice(i * 64, i * 64 + 64));
  const off = Number(at(4)) * 2;
  const len = Number(BigInt("0x" + d.slice(off, off + 64)));
  return {
    room: BigInt(log.topics[1]),
    from: BigInt(log.topics[2]),
    prev: at(0), prevFrom: at(1), seq: at(2), kind: Number(at(3)),
    body: Buffer.from(d.slice(off + 64, off + 64 + len * 2), "hex").toString("utf8"),
    raw: d.slice(off + 64, off + 64 + len * 2),
    block: BigInt(log.blockNumber)
  };
};

async function walk(room, want = 100) {
  const st = await c.read(parley, "stateOf(uint256)", [room]);
  let at = decUint(st, 0);
  const out = [];
  let guard = 0;
  while (at > 0n && out.length < want) {
    if (++guard > 200) throw new Error("the walk did not terminate");
    asked++;
    const ls = c.getLogs({
      address: parley,
      fromBlock: "0x" + at.toString(16),
      toBlock: "0x" + at.toString(16),
      topics: [SAID, "0x" + w(room)]
    });
    if (!ls.length) break;
    const ms = ls.map(readBody);
    for (let i = ms.length - 1; i >= 0; --i) out.push(ms[i]);
    const step = ms[0].prev;
    if (!(step < at)) break;         // the guard that makes it terminate
    at = step;
  }
  return out.reverse();
}

const say = async (actor, room, from, text, kind = 0) =>
  actor.exec(parley, "speak(uint256,uint256,uint8,bytes)",
    [room, from, kind, "0x" + Buffer.from(text, "utf8").toString("hex")], { label: "speak" });

/*──────────────── the commons ────────────────*/
head("the commons, written across several blocks");
const at0 = BLOCK.header.number;
await say(alice, 0n, 1n, "first");
await say(alice, 0n, 1n, "second, same block");
roll(at0 + 5n);
await say(bob, 0n, 2n, "third, five blocks later");
roll(at0 + 400n);
await say(alice, 0n, 1n, "fourth, four hundred blocks later");

asked = 0;
const commons = await walk(0n);
eq("every message came back", commons.length, 4);
eq("in the order they were said",
   commons.map((m) => m.body).join(" | "),
   "first | second, same block | third, five blocks later | fourth, four hundred blocks later");
eq("and each is attributed to the token that said it",
   commons.map((m) => m.from).join(","), "1,1,2,1");
eq("the sequence numbers are the room's, not the block's",
   commons.map((m) => m.seq).join(","), "1,2,3,4");

/*  Three blocks hold messages and 400 blocks separate the first from the
    last. A reader that scanned would have asked for 401.               */
eq("and it took one query per block that had a message, not one per block",
   asked, 3);
console.log(`      405 blocks of history, read in ${asked} single-block queries`);

/*  The failure this guard exists for: the second message in a block points
    at its own block, because the head had already moved. A walker that
    followed that pointer asks the node for the same block forever.     */
ok("two messages in one block do not send the walk in a circle",
   commons[1].prev === commons[1].block,
   `prev ${commons[1].prev} block ${commons[1].block}`);

/*  And the guard is load-bearing rather than decorative. A walker that
    followed the newest log in a block instead of the oldest asks for the
    block it is already in — forever. Written out here because a rule
    nobody has watched fail is a rule nobody knows they need.           */
{
  let looped = false, steps = 0;
  let at = commons[commons.length - 1].block;
  while (steps++ < 12) {
    const ls = c.getLogs({
      address: parley, fromBlock: "0x" + at.toString(16), toBlock: "0x" + at.toString(16),
      topics: [SAID, "0x" + w(0n)]
    });
    if (!ls.length) break;
    const naive = readBody(ls[ls.length - 1]).prev;   // the newest, not the oldest
    if (naive === at) { looped = true; break; }
    if (naive === 0n) break;
    at = naive;
  }
  ok("and following the newest log instead would have looped, which is why it does not",
     looped, "the naive walk happened to terminate, so this control proves nothing");
}
console.log("      (the walk follows the oldest log in a block, which is why it terminates)");

/*──────────────── who may speak ────────────────*/
head("a message is signed by the token, not by an address");
let refused = false;
try { await say(bob, 0n, 1n, "I am alice"); } catch { refused = true; }
ok("a wallet cannot speak as a token it does not hold", refused);

await alice.exec(nft, "embody(uint256)", [1], { label: "embody" });
const bound = "0x" + (await c.read(nft, "account(uint256)", [1])).slice(-40);
ok("but the token's own account may speak for it",
   decBool(await c.read(parley, "mayActAs(uint256,address)", [1, bound])));
ok("and a renter may not",
   !decBool(await c.read(parley, "mayActAs(uint256,address)", [1, bob.from.toString()])));

/*──────────────── pairs ────────────────*/
head("two tokens, one room, derived rather than founded");
const pair = decUint(await c.read(parley, "pairKey(uint256,uint256)", [1, 2]));
eq("the key is the same from both sides",
   pair, decUint(await c.read(parley, "pairKey(uint256,uint256)", [2, 1])));

roll(BLOCK.header.number + 3n);
await alice.exec(parley, "whisper(uint256,uint256,uint8,bytes)",
  [1, 2, 0, "0x" + Buffer.from("just us").toString("hex")], { label: "whisper" });
roll(BLOCK.header.number + 3n);
await bob.exec(parley, "whisper(uint256,uint256,uint8,bytes)",
  [2, 1, 0, "0x" + Buffer.from("and nobody else").toString("hex")], { label: "whisper" });

const dm = await walk(pair);
eq("both halves of the conversation are in it", dm.length, 2);
eq("and it reads in order", dm.map((m) => m.body).join(" | "), "just us | and nobody else");
eq("the commons did not gain them", (await walk(0n)).length, 4);

let sneaked = false;
try { await say(alice, pair, 1n, "through the front"); } catch { sneaked = true; }
ok("and the raw key is not a door into it", sneaked);

/*──────────────── groups ────────────────*/
head("a group");
const key = decUint(
  await c.read(parley, "groupKey(uint256)", [1]));
await alice.exec(parley, "found(uint256,string,bool)", [1, "the workshop", false],
  { label: "found" });
eq("the first group takes the first key",
   decUint(await c.read(parley, "groups()")), 1);
{
  const st = await c.read(parley, "stateOf(uint256)", [key]);
  eq("and it is a group", decUint(st, 4), 1);
  eq("with one member", decUint(st, 3), 1);
  eq("and a steward", decUint(st, 6), 1);
}

let uninvited = false;
try {
  await bob.exec(parley, "join(uint256,uint256)", [key, 2]);
} catch { uninvited = true; }
ok("a closed door stays closed", uninvited);
eq("and nothing was added to the uninvited token's list",
   decUint(await c.read(parley, "roomCount(uint256)", [2])), 0);

await alice.exec(parley, "invite(uint256,uint256,uint256)", [key, 1, 2], { label: "invite" });
eq("an invitation alone still adds nothing to it",
   decUint(await c.read(parley, "roomCount(uint256)", [2])), 0);
await bob.exec(parley, "join(uint256,uint256)", [key, 2], { label: "join" });
eq("joining is what adds it, and only the token can join",
   decUint(await c.read(parley, "roomCount(uint256)", [2])), 1);

roll(BLOCK.header.number + 2n);
await say(bob, key, 2n, "thanks for the invitation");
const group = await walk(key);
eq("the group has its own archive", group.length, 1);
eq("kept apart from every other room's", (await walk(0n)).length, 4);

/*──────────────── what a body may be ────────────────*/
head("a body is bytes, and stays the bytes it was");
const nasty = "</script><img src=x onerror=alert(1)>é→🔥";
roll(BLOCK.header.number + 2n);
await say(alice, 0n, 1n, nasty);
const back = (await walk(0n)).pop();
eq("a body that is markup comes back as the same characters", back.body, nasty);
eq("byte for byte", back.raw, Buffer.from(nasty, "utf8").toString("hex"));
console.log("      (what stops it being markup is the client, and that is checked in verify-site)");

roll(BLOCK.header.number + 2n);
await say(alice, 0n, 1n, "not really sealed", 1);
const sealed = (await walk(0n)).pop();
eq("a sealed body is flagged rather than interpreted", sealed.kind, 1);

let tooBig = false;
const max = Number(decUint(await c.read(parley, "MAX_BODY()")));
try {
  await alice.exec(parley, "speak(uint256,uint256,uint8,bytes)",
    [0, 1, 0, "0x" + "61".repeat(max + 1)]);
} catch { tooBig = true; }
ok(`a body over ${max} bytes is refused`, tooBig);

/*──────────────── the head, which is how a client knows to look ────────────────*/
head("polling is one call and two numbers");
{
  /*  `heads(uint256[])` by hand: one offset, one length, three words. The
      harness's tiny coder does not do arrays, and a coder that guessed
      would be a coder nobody checked.                                   */
  const rooms = [0n, key, pair];
  const r = await c.call(parley,
    sel("heads(uint256[])") + w(32) + w(rooms.length) + rooms.map(w).join(""));
  const d = r.replace(/^0x/, "");
  const at = (i) => BigInt("0x" + d.slice(i * 64, i * 64 + 64));
  const lastOff = Number(at(0)) / 32;
  const countOff = Number(at(1)) / 32;
  eq("three rooms in, three counts out", at(countOff), 3n);
  eq("the commons count", at(countOff + 1), 6n);
  eq("the group count", at(countOff + 2), 1n);
  eq("the pair count", at(countOff + 3), 2n);
  ok("and a head block for each",
     at(lastOff + 1) > 0n && at(lastOff + 2) > 0n && at(lastOff + 3) > 0n);
}

console.log(`\n  ${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
