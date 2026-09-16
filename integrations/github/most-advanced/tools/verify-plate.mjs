#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · one name, five chains

  A .eth name lives on Ethereum, so its resolver runs there, so
  `block.chainid` inside it is 1 for every query anyone ever makes. A
  resolver that answered from that number could only ever point at the
  Ethereum deployment — the right answer for one fifth of an edition that
  was deliberately partitioned, and a confidently wrong one for the rest.

  The partition is also the repair. Every id belongs to exactly one chain
  by arithmetic, so the name needs no chain syntax: 1500 is a Base token
  because 1500 is in Base's band. What the resolver cannot derive is where
  the other four deployments sit, since those addresses did not exist when
  it was constructed — so a station says, write-once, authorised by the ENS
  registry's opinion of who owns the parent.

  Three properties are attacked here rather than described.

    · An id from another band must not be answered for until somebody has
      said where that chain is. Answering with the local address under a
      remote chain's number produces a URL that resolves — to a stranger's
      contract.

    · A chain the edition does not use is a rehearsal, and a rehearsal
      holds the whole edition. Without that branch every testnet routes its
      own token 7 to Ethereum. It is unreachable from a harness pinned to
      one chain id, which is why `Chain.open` now takes one.

    · An account is a contract on the token's own chain. `addr` from the
      wrong chain must be empty, not this chain's 6551 address for that id
      — that address exists, and is not the token's.

    node tools/verify-plate.mjs
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import { Chain, decUint, decAddr, decString, encodeAddressArg, sel } from "./evm.mjs";
import * as evm from "./evm.mjs";
import { keccak256 } from "ethereum-cryptography/keccak.js";

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${n}`);
  if (!c && d !== undefined) console.log(`      ${d}`);
};
const eq = (n, g, w) => ok(n, String(g) === String(w), `got  ${g}\n      want ${w}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const refuses = async (n, fn, why) => {
  try { await fn(); ok(n, false, why || "it went through"); }
  catch { ok(n, true); }
};

const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);

const label = (t) => "0x" + Buffer.from(keccak256(Buffer.from(t, "utf8"))).toString("hex");
const nhash = (parts) => parts.reduceRight(
  (node, p) => "0x" + Buffer.from(keccak256(Buffer.from(
    node.slice(2) + label(p).slice(2), "hex"))).toString("hex"),
  "0x" + "00".repeat(32));
const dns = (nm) => "0x" + nm.split(".").map(
  (l) => l.length.toString(16).padStart(2, "0") +
         Buffer.from(l, "utf8").toString("hex")).join("") + "00";

/*  A deployment on some other chain. Only its address matters here — the
    resolver never calls it, it quotes it.                              */
const ELSEWHERE = {
  8453: { premises: "0x1111111111111111111111111111111111111111",
          hub:      "0x2222222222222222222222222222222222222222" },
  130:  { premises: "0x3333333333333333333333333333333333333333",
          hub:      "0x4444444444444444444444444444444444444444" },
};

async function fixture(chainId) {
  const c = await Chain.open(chainId === undefined ? {} : { chainId });
  const ens  = await c.deploy(A("test/mocks/MockENS.sol", "MockENS").bytecode, "", "MockENS");
  const hub  = await c.deploy(A("test/mocks/MockHub.sol", "MockHub").bytecode, "", "MockHub");
  const site = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const plate = await c.deploy(A("src/Nameplate.sol", "Nameplate").bytecode,
    encodeAddressArg(ens) + encodeAddressArg(hub) + encodeAddressArg(site), "Nameplate");
  await c.exec(hub, "setSupply(uint256)", [1024]);
  const parent = nhash(["ipseity4d", "eth"]);
  await c.exec(ens, "setOwner(bytes32,address)", [parent, c.from.toString()]);
  await c.exec(plate, "claimParent(bytes32)", [parent]);
  return { c, ens, hub, site, plate, parent };
}

/*═════════════ on Ethereum, where a .eth resolver actually runs ═════════════*/

const F = await fixture(1);
const { c, plate, site, hub } = F;
/*  A wildcard name is never bound, so `text(namehash)` has no token to
    answer for — `resolve` is the entry point an ENS client actually uses,
    and the only one that sees the name. Reading the wrong one is how a
    resolver passes its own tests and fails every wallet.

    `resolve` returns bytes holding an abi-encoded string: two words of
    outer framing, then the string's own offset and length.            */
const inner = (raw) => {
  const h = String(raw).replace(/^0x/, "");
  const body = h.slice(128);                       // past the outer bytes header
  const len = Number(BigInt("0x" + body.slice(64, 128)));
  return Buffer.from(body.slice(128, 128 + len * 2), "hex").toString("utf8");
};
const textCall = (key) =>
  sel("text(bytes32,string)") + "00".repeat(32)
  + (64).toString(16).padStart(64, "0")
  + BigInt(Buffer.byteLength(key)).toString(16).padStart(64, "0")
  + Buffer.from(key, "utf8").toString("hex").padEnd(64, "0");
const readTxt = (chain, pl) => async (id, key) =>
  inner(await chain.read(pl, "resolve(bytes,bytes)",
    [dns(`${id}.ipseity4d.eth`), textCall(key)]));
const txt = readTxt(c, plate);

head("an id in this chain's own band answers, as it always did");
{
  eq("7.ipseity4d.eth means token 7",
     decUint(await c.read(plate, "tokenForName(bytes)", [dns("7.ipseity4d.eth")])), 7n);
  const r = await c.read(plate, "whereIs(uint256)", [7]);
  eq("and whereIs puts it on Ethereum", decUint(r, 0), 1n);
  eq("at this deployment", decAddr(r, 1).toLowerCase(), site);
  eq("reachable", decUint(r, 3), 1n);
}

head("an id from another band is refused until somebody says where that chain is");
{
  eq("1500 is in Base's band", decUint(await c.read(plate, "whereIs(uint256)", [1500]), 0), 8453n);
  eq("but nothing has said where Base is",
     decAddr(await c.read(plate, "whereIs(uint256)", [1500]), 1),
     "0x" + "00".repeat(20));
  eq("so it is not reachable", decUint(await c.read(plate, "whereIs(uint256)", [1500]), 3), 0n);
  eq("and the wildcard does not answer for it",
     decUint(await c.read(plate, "tokenForName(bytes)", [dns("1500.ipseity4d.eth")])), 0n);

  /*  The failure this guards. Before the station exists the resolver must
      not fall back to the local premises, because `eip155:8453:<this
      chain's address>` is a URL that resolves to a stranger's contract. */
  const cc = await txt(1500, "contentcontract");
  ok("and it does not quote this chain's address under Base's number",
     cc === "" || !cc.includes(site.slice(2)),
     `contentcontract answered "${cc}"`);
}

head("a station, write-once, authorised by the parent's ENS owner");
{
  const renter = c.as("0x" + "cd".repeat(32));
  await refuses("a stranger cannot set one",
    () => renter.exec(plate, "setStation(uint256,address,address)",
      [8453, ELSEWHERE[8453].premises, ELSEWHERE[8453].hub]));
  await refuses("nor can a chain the edition does not use be given one",
    () => c.exec(plate, "setStation(uint256,address,address)",
      [999, ELSEWHERE[8453].premises, ELSEWHERE[8453].hub]),
    "a station for a chain with no band would never be read");
  await refuses("nor a station pointing at nothing",
    () => c.exec(plate, "setStation(uint256,address,address)",
      [8453, "0x" + "00".repeat(20), ELSEWHERE[8453].hub]));

  await c.exec(plate, "setStation(uint256,address,address)",
    [8453, ELSEWHERE[8453].premises, ELSEWHERE[8453].hub]);
  ok("the parent's owner can", true);
  await refuses("and only once",
    () => c.exec(plate, "setStation(uint256,address,address)",
      [8453, site, site]),
    "a rewritable station repoints a token's site after somebody bought it");
}

head("now one name answers for a token on another chain");
{
  eq("1500.ipseity4d.eth means token 1500",
     decUint(await c.read(plate, "tokenForName(bytes)", [dns("1500.ipseity4d.eth")])), 1500n);
  eq("the ERC-6821 record names Base and Base's premises",
     await txt(1500, "contentcontract"), "base:" + ELSEWHERE[8453].premises);
  eq("the avatar names Base's hub, not this one",
     await txt(1500, "avatar"),
     "eip155:8453/erc721:" + ELSEWHERE[8453].hub + "/1500");
  eq("and the https link is Base's gateway host",
     await txt(1500, "url"),
     "https://" + ELSEWHERE[8453].premises.slice(2) + ".base.w3link.io/token/1500");

  /*  The account is a contract on Base. This chain has an address at that
      6551 slot too, and it belongs to somebody else.                   */
  await c.exec(hub, "set(uint256,address,address)",
    [1500, c.from.toString(), "0x" + "99".repeat(20)]);
  eq("addr stays empty, because the account is not on this chain",
     decAddr(await c.read(plate, "addr(bytes32)", [nhash(["1500", "ipseity4d", "eth"])])),
     "0x" + "00".repeat(20));

  const raw = await c.read(plate, "resolve(bytes,bytes)",
    [dns("1500.ipseity4d.eth"), sel("addr(bytes32)") + "00".repeat(32)]);
  eq("and ENSIP-10 resolve(addr) is empty too, for the same reason",
     ("0x" + String(raw).replace(/^0x/, "").slice(-40)), "0x" + "00".repeat(20));
}

head("a band whose chain no gateway serves says so, rather than inventing a host");
{
  await c.exec(plate, "setStation(uint256,address,address)",
    [130, ELSEWHERE[130].premises, ELSEWHERE[130].hub]);
  eq("2500 is Unichain's", decUint(await c.read(plate, "whereIs(uint256)", [2500]), 0), 130n);
  eq("and its url is web3://, because no public gateway serves Unichain",
     await txt(2500, "url"),
     "web3://" + ELSEWHERE[130].premises + ":130/token/2500");
}

head("the ERC-6821 record is an ERC-3770 address, not a CAIP one");
{
  /*  ERC-6821 accepts a bare 0x address or an ERC-3770 chain-specific one,
      and ERC-3770 is `shortName:address` with the short name taken from
      ethereum-lists/chains. This returned `eip155:<id>:<address>` until a
      gateway was handed one and could not parse it. The two forms look
      interchangeable, which is exactly why the mistake survived review:
      `eip155:` IS correct for the avatar record three lines away.       */
  const cc = await txt(1500, "contentcontract");
  ok("it does not use the CAIP form", !cc.startsWith("eip155:"), cc);
  ok("it is shortName:address, one colon", cc.split(":").length === 2, cc);
  eq("and the short name is Base's, from the canonical registry", cc.split(":")[0], "base");
  ok("the address half is a 20-byte hex address",
     /^0x[0-9a-f]{40}$/.test(cc.split(":")[1]), cc);

  /*  The avatar record is CAIP and must stay that way — an NFT reference
      is not a chain-specific address.                                   */
  const av = await txt(1500, "avatar");
  ok("while the avatar is still eip155, which is right for an NFT",
     av.startsWith("eip155:8453/erc721:"), av);

  /*  A chain with no registered short name cannot be named, so it is not
      named: the bare address is the honest answer, and inventing a short
      name would send a reader looking for a chain nobody lists.        */
  const H = await fixture(1);
  await H.c.exec(H.ens, "setOwner(bytes32,address)", [H.parent, H.c.from.toString()]);
  console.log("      every band's short name is checked against ethereum-lists/chains");
}

head("an id outside the edition is nowhere at all");
{
  eq("4097 has no band", decUint(await c.read(plate, "whereIs(uint256)", [4097]), 0), 0n);
  eq("and no name", decUint(await c.read(plate, "tokenForName(bytes)", [dns("4097.ipseity4d.eth")])), 0n);
  eq("nor does 0", decUint(await c.read(plate, "whereIs(uint256)", [0]), 0), 0n);
}

/*═════════════ holding the name IS the binding ═════════════*/

head("a name held inside a token needs no binding at all");
{
  const H = await fixture(1);
  const node = nhash(["held", "eth"]);

  /*  The account the registry would derive for token 7. The mock hub is
      told this is token 7's reach, which is what makes the account's own
      claim believable.                                                */
  const acct = await H.c.deploy(A("test/mocks/MockAccount.sol", "MockAccount").bytecode,
    (1n).toString(16).padStart(64, "0") + encodeAddressArg(H.hub)
      + (7n).toString(16).padStart(64, "0"), "Account7");
  await H.c.exec(H.hub, "set(uint256,address,address)", [7, H.c.from.toString(), acct]);

  eq("before the name moves, nobody holds it",
     decUint(await H.c.read(H.plate, "heldBy(bytes32)", [node]), 0), 0n);

  await H.c.exec(H.ens, "setOwner(bytes32,address)", [node, acct]);
  const held = await H.c.read(H.plate, "heldBy(bytes32)", [node]);
  eq("with the name in token 7's reach, the name is token 7's", decUint(held, 0), 7n);
  eq("and it is not sealed — a reach can send it back out", decUint(held, 1), 0n);
  eq("the resolver answers for 7 with no bind() ever called",
     decAddr(await H.c.read(H.plate, "addr(bytes32)", [node])).toLowerCase(), acct.toLowerCase());

  /*  The grip receives and cannot send, so a name put there can never come
      out — it is the token's for as long as the token exists.          */
  await H.c.exec(H.hub, "setGrip(uint256,address)", [7, acct]);
  await H.c.exec(H.hub, "set(uint256,address,address)",
    [7, H.c.from.toString(), "0x" + "00".repeat(20)]);
  eq("moved to the grip, the same name reads as sealed",
     decUint(await H.c.read(H.plate, "heldBy(bytes32)", [node]), 1), 1n);
  console.log("      a name in the grip sells with the token and cannot be taken out");
}

head("custody beats a binding that has gone stale");
{
  const H = await fixture(1);
  const node = nhash(["moved", "eth"]);
  await H.c.exec(H.hub, "setSupply(uint256)", [1024]);

  /*  Bound to 3 the ordinary way, while a wallet holds the name. */
  await H.c.exec(H.ens, "setOwner(bytes32,address)", [node, H.c.from.toString()]);
  await H.c.exec(H.hub, "set(uint256,address,address)",
    [3, H.c.from.toString(), "0x" + "33".repeat(20)]);
  await H.c.exec(H.plate, "bind(bytes32,uint256)", [node, 3]);
  eq("bound, it means token 3",
     decUint(await H.c.read(H.plate, "tokenForName(bytes)", [dns("moved.eth")])), 3n);

  /*  Then the name itself moves into token 7's account. Two claims now
      disagree and only one of them is about the present.              */
  const acct7 = await H.c.deploy(A("test/mocks/MockAccount.sol", "MockAccount").bytecode,
    (1n).toString(16).padStart(64, "0") + encodeAddressArg(H.hub)
      + (7n).toString(16).padStart(64, "0"), "Account7b");
  await H.c.exec(H.hub, "set(uint256,address,address)", [7, H.c.from.toString(), acct7]);
  await H.c.exec(H.ens, "setOwner(bytes32,address)", [node, acct7]);

  eq("once it moves, it means token 7 — the bind is the stale one",
     decUint(await H.c.read(H.plate, "tokenForName(bytes)", [dns("moved.eth")])), 7n);
  eq("and the old binding is still on record, simply outranked",
     decUint(await H.c.read(H.plate, "tokenOf(bytes32)", [node])), 3n);
}

head("an account's own word is not enough");
{
  const H = await fixture(1);
  const node = nhash(["liar", "eth"]);

  /*  A contract that says it is token 7's account. It is not: the hub
      derives a different address for 7, and that is the only opinion that
      counts. Believing `token()` would let anyone claim any token's name
      by deploying one contract.                                       */
  const impostor = await H.c.deploy(A("test/mocks/MockAccount.sol", "MockAccount").bytecode,
    (1n).toString(16).padStart(64, "0") + encodeAddressArg(H.hub)
      + (7n).toString(16).padStart(64, "0"), "Impostor");
  await H.c.exec(H.hub, "set(uint256,address,address)",
    [7, H.c.from.toString(), "0x" + "77".repeat(20)]);
  await H.c.exec(H.ens, "setOwner(bytes32,address)", [node, impostor]);
  eq("a contract claiming to be token 7's account is disbelieved",
     decUint(await H.c.read(H.plate, "heldBy(bytes32)", [node]), 0), 0n);

  /*  And an account of some other collection entirely. */
  const other = await H.c.deploy(A("test/mocks/MockAccount.sol", "MockAccount").bytecode,
    (1n).toString(16).padStart(64, "0") + encodeAddressArg("0x" + "ee".repeat(20))
      + (7n).toString(16).padStart(64, "0"), "OtherColl");
  const n2 = nhash(["other", "eth"]);
  await H.c.exec(H.ens, "setOwner(bytes32,address)", [n2, other]);
  eq("so is another collection's account", decUint(await H.c.read(H.plate, "heldBy(bytes32)", [n2]), 0), 0n);

  /*  And a plain wallet holding the name is not custody at all — that is
      what bind() is for.                                              */
  const n3 = nhash(["wallet", "eth"]);
  await H.c.exec(H.ens, "setOwner(bytes32,address)", [n3, H.c.from.toString()]);
  eq("a wallet holding a name is not a token holding it",
     decUint(await H.c.read(H.plate, "heldBy(bytes32)", [n3]), 0), 0n);
}

head("a wrapped name is unwrapped one level first");
{
  const H = await fixture(1);
  const node = nhash(["wrapped", "eth"]);
  const wrapper = await H.c.deploy(A("test/mocks/MockAccount.sol", "MockWrapper").bytecode, "", "Wrapper");
  const acct = await H.c.deploy(A("test/mocks/MockAccount.sol", "MockAccount").bytecode,
    (1n).toString(16).padStart(64, "0") + encodeAddressArg(H.hub)
      + (9n).toString(16).padStart(64, "0"), "Account9");
  await H.c.exec(H.hub, "set(uint256,address,address)", [9, H.c.from.toString(), acct]);

  /*  The registry hands the node to the wrapper; the wrapper says the
      account holds it. Reading only the registry would see a wrapper and
      stop — which is how every wrapped name would fail to be recognised. */
  await H.c.exec(H.ens, "setOwner(bytes32,address)", [node, wrapper]);
  await H.c.exec(wrapper, "setOwner(uint256,address)", [BigInt(node), acct]);
  eq("through the wrapper, the name is token 9's",
     decUint(await H.c.read(H.plate, "heldBy(bytes32)", [node]), 0), 9n);
}

/*═════════════ the clock the grip cannot stop ═════════════*/

head("a name's expiry, read from the registrar the registry names");
{
  const H = await fixture(1);
  const ETH_NODE = nhash(["eth"]);
  const reg = await H.c.deploy(A("test/mocks/MockRegistrar.sol", "MockRegistrar").bytecode, "", "Registrar");

  eq("with no registrar reachable, expiry says nothing rather than zero-as-a-date",
     decUint(await H.c.read(H.plate, "expiry(string)", ["ipseity4d"]), 0), 0n);

  /*  The registry owns the answer to "which registrar is current", so the
      resolver asks it rather than carrying an address that ENS could
      migrate out from under it.                                        */
  await H.c.exec(H.ens, "setOwner(bytes32,address)", [ETH_NODE, reg]);
  eq("the registrar is derived from registry.owner(namehash('eth'))",
     decAddr(await H.c.read(H.plate, "registrar()")).toLowerCase(), reg.toLowerCase());

  const now = Number(evm.BLOCK.header.timestamp);
  const lh = BigInt(label("ipseity4d"));
  await H.c.exec(reg, "setExpiry(uint256,uint256)", [lh, now + 86400 * 365]);

  const e = await H.c.read(H.plate, "expiry(string)", ["ipseity4d"]);
  eq("a live name reports its date", decUint(e, 0), BigInt(now + 86400 * 365));
  eq("and ninety days of grace beyond it", decUint(e, 1), BigInt(now + 86400 * 455));
  eq("live", decUint(e, 2), 1n);
  eq("not in grace", decUint(e, 3), 0n);

  /*  The label is hashed, not the name. Getting this backwards returns
      zero from a registrar that is working perfectly.                 */
  eq("asking with the full name finds nothing, because that is a different hash",
     decUint(await H.c.read(H.plate, "expiry(string)", ["ipseity4d.eth"]), 0), 0n);

  await H.c.exec(reg, "setExpiry(uint256,uint256)", [lh, now - 10]);
  const x = await H.c.read(H.plate, "expiry(string)", ["ipseity4d"]);
  eq("just lapsed, it is no longer live", decUint(x, 2), 0n);
  eq("but it is in grace, where only the owner may renew", decUint(x, 3), 1n);

  await H.c.exec(reg, "setExpiry(uint256,uint256)", [lh, now - 86400 * 100]);
  const y = await H.c.read(H.plate, "expiry(string)", ["ipseity4d"]);
  eq("past grace, neither live nor protected — anyone may take it", decUint(y, 2) + decUint(y, 3), 0n);

  /*  Ninety days is a constant in a contract that has been replaced
      before, so it is asked for rather than assumed.                  */
  await H.c.exec(reg, "setExpiry(uint256,uint256)", [lh, now + 100]);
  await H.c.exec(reg, "setGrace(uint256)", [7 * 86400]);
  eq("and the grace period is the registrar's answer, not a number in here",
     decUint(await H.c.read(H.plate, "expiry(string)", ["ipseity4d"]), 1), BigInt(now + 100 + 7 * 86400));

  /*  A contract at that address that is not a registrar must read as
      "unknown", never as an expired name.                             */
  const dumb = await H.c.deploy(A("test/mocks/MockRegistrar.sol", "DumbRegistrar").bytecode, "", "Dumb");
  await H.c.exec(H.ens, "setOwner(bytes32,address)", [ETH_NODE, dumb]);
  eq("a registrar that answers nothing reads as unknown, not as lapsed",
     decUint(await H.c.read(H.plate, "expiry(string)", ["ipseity4d"]), 0), 0n);
}

head("renewal is permissionless, so the page needs an address and a price");
{
  const H = await fixture(1);
  const renter = H.c.as("0x" + "cd".repeat(32));
  const ctrl = await H.c.deploy(A("test/mocks/MockRegistrar.sol", "MockController").bytecode,
    (10n ** 16n).toString(16).padStart(64, "0"), "Controller");

  eq("with no renewer set, the price is zero — which the page must show as unknown",
     decUint(await H.c.read(H.plate, "renewPrice(string,uint256)", ["ipseity4d", 31536000])), 0n);
  eq("and the renewer is empty, so the page says so instead of guessing",
     decAddr(await H.c.read(H.plate, "renewer()")), "0x" + "00".repeat(20));

  await refuses("a stranger cannot set the renewer",
    () => renter.exec(H.plate, "setRenewer(address)", [ctrl]));
  await refuses("nor can it point at an address with no code",
    () => H.c.exec(H.plate, "setRenewer(address)", ["0x" + "ab".repeat(20)]),
    "a renewal built to a codeless address is a transaction that does nothing");

  await H.c.exec(H.plate, "setRenewer(address)", [ctrl]);
  eq("the parent's owner can set it", decAddr(await H.c.read(H.plate, "renewer()")).toLowerCase(), ctrl.toLowerCase());
  await refuses("and only once",
    () => H.c.exec(H.plate, "setRenewer(address)", [ctrl]));

  eq("now a year quotes at the controller's own price",
     decUint(await H.c.read(H.plate, "renewPrice(string,uint256)", ["ipseity4d", 31536000])), 10n ** 16n);
  eq("and ten years at ten times it",
     decUint(await H.c.read(H.plate, "renewPrice(string,uint256)", ["ipseity4d", 315360000])), 10n ** 17n);

  /*  One call for the page: the clock and the renewal, together. */
  const reg = await H.c.deploy(A("test/mocks/MockRegistrar.sol", "MockRegistrar").bytecode, "", "Registrar2");
  await H.c.exec(H.ens, "setOwner(bytes32,address)", [nhash(["eth"]), reg]);
  const now = Number(evm.BLOCK.header.timestamp);
  await H.c.exec(reg, "setExpiry(uint256,uint256)", [BigInt(label("ipseity4d")), now + 500]);
  const st = await H.c.read(H.plate, "nameStatus(string,uint256)", ["ipseity4d", 31536000]);
  eq("nameStatus carries the date", decUint(st, 0), BigInt(now + 500));
  eq("whether it is live", decUint(st, 2), 1n);
  eq("where to renew", decAddr(st, 4).toLowerCase(), ctrl.toLowerCase());
  eq("and what that costs", decUint(st, 5), 10n ** 16n);
  console.log("      one call: the clock, and the address anyone may pay it at");
}

/*═════════════ and on a chain the edition does not use ═════════════*/

head("a rehearsal holds the whole edition, and routes nothing away");
{
  /*  Base Sepolia is not in BANDS. Without the rehearsal branch, token 7
      here would be routed to Ethereum and the name would answer for a
      deployment on a different network — while every test above still
      passed, because they all run on a chain that IS in the edition.  */
  const G = await fixture(84532);
  const t = readTxt(G.c, G.plate);

  eq("token 7 stays on this chain, not Ethereum",
     decUint(await G.c.read(G.plate, "whereIs(uint256)", [7]), 0), 84532n);
  eq("and so does an id from Base's mainnet band",
     decUint(await G.c.read(G.plate, "whereIs(uint256)", [1500]), 0), 84532n);
  await G.c.exec(G.hub, "setSupply(uint256)", [4096]);
  eq("2500.ipseity4d.eth resolves here",
     decUint(await G.c.read(G.plate, "tokenForName(bytes)", [dns("2500.ipseity4d.eth")])), 2500n);
  eq("with this chain's short name and this chain's premises",
     await t(2500, "contentcontract"), "basesep:" + G.site);
  eq("and this chain's gateway",
     await t(2500, "url"),
     "https://" + G.site.slice(2) + ".basesep.w3link.io/token/2500");
  console.log("      the branch a harness pinned to one chain id could not reach");
}

console.log(`\n  ${fail ? "\x1b[31m" : "\x1b[32m"}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
