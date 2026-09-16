#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the sealed vault

  The claim under test: while a vault is sealed, nothing on its manifest
  leaves it, whatever the holder calls.

  A selector list cannot support that claim, so this suite does not test a
  selector list. It tests the measurement, and it attacks it the way the
  gap would actually be exploited:

    · the obvious word            transfer / transferFrom
    · a word no list has          a drainer with a bespoke function name
    · the deferred drain          approve now, pull in the next block
    · the signature               ERC-1271 as an off-chain authority
    · the ether                   a plain value send
    · the ratchet                 shortening or dodging the seal
    · the sale                    does the promise survive the buyer

    node tools/verify-vault.mjs
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import { Chain, enc, decUint, decAddr, decBool, encodeAddressArg } from "./evm.mjs";
import { createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${n}`);
  if (!c && d !== undefined) console.log(`      ${d}`);
};
const eq = (n, g, w) => ok(n, String(g) === String(w), `got ${g}\n      want ${w}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const WAD = 10n ** 18n;
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const MAX = (1n << 256n) - 1n;

const evm = await import("./evm.mjs");
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();
const me = c.from.toString();

head("deploy");
const tmpReg = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode);
await c.vm.stateManager.putCode(createAddressFromString(REGISTRY),
  await c.vm.stateManager.getCode(createAddressFromString(tmpReg)));

const impl = await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode, "", "IpseityAccount");
const gripImpl = await c.deploy(A("src/GripVault.sol", "GripVault").bytecode, "", "GripVault");
const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, "0".repeat(64));
const sigil = await c.deploy(A("src/Sigil.sol", "Sigil").bytecode);
const renderer = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  encodeAddressArg(engine) + encodeAddressArg(sigil));
const nft = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(renderer) + encodeAddressArg(impl) + encodeAddressArg(gripImpl) + (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"));
const drainer = await c.deploy(A("test/mocks/Drainer.sol", "Drainer").bytecode);

const encStr = (s) => {
  const b = Buffer.from(s, "utf8");
  return b.length.toString(16).padStart(64, "0") + b.toString("hex").padEnd(64, "0");
};
const mkToken = async (name, sym) => {
  const nameEnc = encStr(name);
  return c.deploy(A("test/mocks/MockERC20.sol", "MockERC20").bytecode,
    (0xa0).toString(16).padStart(64, "0") +
    BigInt(0xa0 + nameEnc.length / 2).toString(16).padStart(64, "0") +
    (18).toString(16).padStart(64, "0") + "0".repeat(64) + "0".repeat(64) +
    nameEnc + encStr(sym));
};
const GOLD = await mkToken("Gold", "GOLD");
ok("deployed", true);
console.log(`      account implementation ${impl}`);

/*──────────────── the vault ────────────────*/
head("a token's vault");
await c.exec(nft, "mint()", [], { value: 10n ** 16n });
const vault = decAddr(await c.read(nft, "account(uint256)", [1]));
await c.exec(nft, "embody(uint256)", [1], { label: "embody" });
ok("the account exists", (await c.codeSize(vault)) > 0);
console.log(`      ${vault}`);

const tok = await c.read(vault, "token()");
eq("it knows which token it belongs to", decUint(tok, 2), 1);
eq("and which collection", decAddr(tok, 1).toLowerCase(), nft.toLowerCase());
eq("and who holds it", decAddr(await c.read(vault, "owner()")).toLowerCase(), me.toLowerCase());

// fund it
await c.exec(GOLD, "mint(address,uint256)", [vault, 1000n * WAD]);
await c.send({ to: vault, value: 5n * WAD });
eq("it holds gold", decUint(await c.read(GOLD, "balanceOf(address)", [vault])), 1000n * WAD);

/*──────────────── unsealed, it acts freely ────────────────*/
head("unsealed, the vault is the holder's to empty");
await c.exec(vault, "execute(address,uint256,bytes,uint8)",
  [GOLD, 0, enc("transfer(address,uint256)", [me, 100n * WAD]), 0], { label: "execute" });
eq("gold left as asked", decUint(await c.read(GOLD, "balanceOf(address)", [vault])), 900n * WAD);
eq("the 6551 state counter moved", decUint(await c.read(vault, "state()")), 1);

/*──────────────── the seal ────────────────*/
head("the seal");
const T0 = evm.GENESIS_TIME;
const refuses = async (name, fn, why) => {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  ok(name, threw, "IT WENT THROUGH — " + why);
};

await c.exec(vault, "guard(address)", [GOLD], { label: "guard" });
await c.exec(vault, "seal(uint64)", [T0 + 30n * 86400n], { label: "seal" });
ok("sealed", decBool(await c.read(vault, "isSealed()")));
eq("the date is readable by anyone", decUint(await c.read(vault, "sealedUntil()")), T0 + 30n * 86400n);

const hold = await c.read(vault, "holdings()");
ok("and so is everything under it", decUint(hold, 0) === T0 + 30n * 86400n);

await refuses("shortening the seal", () =>
  c.exec(vault, "seal(uint64)", [T0 + 100n]), "the ratchet turns backwards");
await refuses("a seal nobody can outlive", () =>
  c.exec(vault, "seal(uint64)", [T0 + 400n * 86400n]), "the seal has no ceiling");

/*──────────────── the attacks ────────────────*/
head("trying to get the gold out");
const goldBefore = decUint(await c.read(GOLD, "balanceOf(address)", [vault]));

await refuses("the obvious word — transfer", () =>
  c.exec(vault, "execute(address,uint256,bytes,uint8)",
    [GOLD, 0, enc("transfer(address,uint256)", [me, WAD]), 0]),
  "a sealed vault paid out on a plain transfer");

await refuses("transferFrom, pulling from the vault itself", () =>
  c.exec(vault, "execute(address,uint256,bytes,uint8)",
    [GOLD, 0, enc("transferFrom(address,address,uint256)", [vault, me, WAD]), 0]),
  "a sealed vault paid out on transferFrom");

/* The one a selector list cannot catch. Drainer.take() is not on anybody's
   list of transfer words, and it never will be — it is a function this
   suite invented five minutes ago. Only measurement sees it. */
await c.exec(GOLD, "approve(address,uint256)", [drainer, MAX]);
await refuses("a word no list has ever heard of", () =>
  c.exec(vault, "execute(address,uint256,bytes,uint8)",
    [drainer, 0, enc("take(address,uint256)", [GOLD, WAD]), 0]),
  "measurement missed a bespoke drainer — this is the whole point of the design");

await refuses("approving a spender to pull later", () =>
  c.exec(vault, "execute(address,uint256,bytes,uint8)",
    [GOLD, 0, enc("approve(address,uint256)", [me, MAX]), 0]),
  "the deferred drain is open: approve now, take next block");

await refuses("setApprovalForAll on an NFT", () =>
  c.exec(vault, "execute(address,uint256,bytes,uint8)",
    [GOLD, 0, enc("setApprovalForAll(address,bool)", [me, true]), 0]),
  "operator approval is open");

await refuses("permit, which is an approval wearing a signature", () =>
  c.exec(vault, "execute(address,uint256,bytes,uint8)",
    [GOLD, 0, "0xd505accf" + "00".repeat(224), 0]),
  "permit is an unmeasurable approval");

await refuses("sending the vault's ether", () =>
  c.exec(vault, "execute(address,uint256,bytes,uint8)", [me, WAD, "0x", 0]),
  "ether left a sealed vault");

await refuses("delegatecall, which would rewrite the account itself", () =>
  c.exec(vault, "execute(address,uint256,bytes,uint8)", [drainer, 0, "0x", 1]),
  "delegatecall is allowed — the seal can be overwritten in storage");

eq("not one satoshi of gold moved", decUint(await c.read(GOLD, "balanceOf(address)", [vault])), goldBefore);

head("but the vault still works");
/* The reason for measuring instead of freezing: a vault that cannot act is
   a safe, not a vault. Anything that leaves it no poorer goes through. */
/*  "A sealed vault can still act" now has an edge, and the edge is where
    the promise is. A call to an asset ON THE MANIFEST must carry `transfer`
    or `transferFrom` and nothing else — deny-by-default, because the
    approval defence could not be an enumeration and stay honest. A call to
    anything else is unrestricted, which is what acting actually looks like:
    voting, claiming and compounding are calls to protocols, not to the
    token being promised. */
let acted = false;
try {
  // the collection itself: never promised, so never policed
  await c.exec(vault, "execute(address,uint256,bytes,uint8)",
    [nft, 0, enc("totalSupply()", []), 0]);
  acted = true;
} catch (e) { console.log("      " + String(e.message).slice(0, 90)); }
ok("a call to something it never promised still executes", acted);

await refuses("but an unlisted word said to a promised asset does not", () =>
  c.exec(vault, "execute(address,uint256,bytes,uint8)",
    [GOLD, 0, enc("balanceOf(address)", [vault]), 0]),
  "the manifest boundary is not deny-by-default after all");
console.log("      this is the cost, stated: a holder who wants to claim() on a");
console.log("      promised asset must unguard it first, or not promise it");

let received = false;
try { await c.exec(GOLD, "mint(address,uint256)", [vault, 50n * WAD]); received = true; } catch {}
ok("and the vault can still be paid", received &&
   decUint(await c.read(GOLD, "balanceOf(address)", [vault])) === goldBefore + 50n * WAD);

head("a signature is an authority measurement cannot see");
const sigMagic = await c.read(vault, "isValidSignature(bytes32,bytes)",
  ["0x" + "11".repeat(32), "0x" + "00".repeat(65)]);
eq("so ERC-1271 refuses while sealed", decUint(sigMagic), 0);

/*──────────────── the sale ────────────────*/
head("the promise survives the sale");
const buyer = "0x" + "b0197a".padStart(40, "0");
await c.exec(nft, "transferFrom(address,address,uint256)", [me, buyer, 1]);
eq("the token moved", decAddr(await c.read(nft, "ownerOf(uint256)", [1])).toLowerCase(), buyer);
eq("the vault followed it", decAddr(await c.read(vault, "owner()")).toLowerCase(), buyer);
eq("the seal is untouched", decUint(await c.read(vault, "sealedUntil()")), T0 + 30n * 86400n);
eq("and so is the gold", decUint(await c.read(GOLD, "balanceOf(address)", [vault])),
   goldBefore + 50n * WAD);

await refuses("the seller can no longer act as the vault", () =>
  c.exec(vault, "execute(address,uint256,bytes,uint8)",
    [GOLD, 0, enc("transfer(address,uint256)", [me, WAD]), 0]),
  "the old owner still commands the vault");

const asBuyer = async (sig, args, value = 0n) => {
  const r = await c.vm.evm.runCall({
    to: createAddressFromString(vault), caller: createAddressFromString(buyer),
    origin: createAddressFromString(buyer), data: hexToBytes(enc(sig, args)),
    gasLimit: 30_000_000n, value, block: evm.BLOCK
  });
  if (r.execResult.exceptionError) throw new Error(r.execResult.exceptionError.error);
  return bytesToHex(r.execResult.returnValue);
};
let buyerBlocked = false;
try {
  await asBuyer("execute(address,uint256,bytes,uint8)",
    [GOLD, 0, enc("transfer(address,uint256)", [buyer, WAD]), 0]);
} catch { buyerBlocked = true; }
ok("and the buyer is bound by it too, until it expires", buyerBlocked);

/*──────────────── expiry ────────────────*/
head("and then it lifts");
evm.warp(T0 + 31n * 86400n);
ok("no longer sealed", !decBool(await c.read(vault, "isSealed()")));
let freed = false;
try {
  await asBuyer("execute(address,uint256,bytes,uint8)",
    [GOLD, 0, enc("transfer(address,uint256)", [buyer, WAD]), 0]);
  freed = true;
} catch { /* ignore */ }
ok("the buyer can move what they bought", freed);
eq("the gold is theirs", decUint(await c.read(GOLD, "balanceOf(address)", [buyer])), WAD);
evm.warp(T0);

/*──────────────── manifest limits, stated honestly ────────────────*/
head("what the seal does not cover");
await c.exec(nft, "mint()", [], { value: 10n ** 16n });
const v2 = decAddr(await c.read(nft, "account(uint256)", [2]));
await c.exec(nft, "embody(uint256)", [2]);
const SILVER = await mkToken("Silver", "SLVR");
await c.exec(SILVER, "mint(address,uint256)", [v2, 100n * WAD]);
await c.exec(v2, "seal(uint64)", [T0 + 86400n]);   // sealed, but silver unlisted

let unlistedLeft = false;
try {
  await c.exec(v2, "execute(address,uint256,bytes,uint8)",
    [SILVER, 0, enc("transfer(address,uint256)", [me, WAD]), 0]);
  unlistedLeft = true;
} catch { /* ignore */ }
ok("an asset nobody put on the manifest can still leave — by design, and why manifest() is public",
   unlistedLeft);
console.log("      a buyer reads manifest(), they do not assume it");

/*════════════════ THE GRIP ════════════════*/
head("the other hand — the Grip");

const grip = decAddr(await c.read(nft, "grip(uint256)", [1]));
ok("a second account, at a second salt", grip.toLowerCase() !== vault.toLowerCase());
console.log(`      reach ${vault}`);
console.log(`      grip  ${grip}`);
await c.exec(nft, "embodyGrip(uint256)", [1], { label: "embodyGrip" });
ok("it exists", (await c.codeSize(grip)) > 0);
eq("and it knows whose it is", decAddr(await c.read(grip, "owner()")).toLowerCase(), buyer);

/* The Reach needs 35 assertions because it has a capability being policed.
   The Grip needs almost none, because the guarantee is structural — so the
   right way to test it is against the compiled ABI, not by trying calls. */
head("the guarantee is in the shape, so read the shape");
const gripAbi = A("src/GripVault.sol", "GripVault").abi;
const writes = gripAbi.filter(f => f.type === "function" &&
  f.stateMutability !== "view" && f.stateMutability !== "pure");
const receivers = writes.filter(f => /^onERC(721|1155)/.test(f.name));

eq("every state-changing function is a token receiver", writes.length, receivers.length);
console.log("      " + (writes.map(f => f.name).join(", ") || "(none)"));
ok("there is no execute", !gripAbi.some(f => f.name === "execute"));
ok("there is no withdraw, sweep, rescue or transfer",
   !gripAbi.some(f => /withdraw|sweep|rescue|transfer|send|drain|claim/i.test(f.name || "")));
ok("there is no owner override, admin or upgrade path",
   !gripAbi.some(f => /setOwner|admin|upgrade|initialize|delegate/i.test(f.name || "")));
ok("it says so itself", decBool(await c.read(grip, "isOneWay()")));
ok("and it declines to advertise IERC6551Executable",
   !decBool(await c.call(grip, "0x01ffc9a7" + "51945447".padEnd(64, "0"))),
   "a client checking before calling execute would be misled");

head("so the attacks have nothing to aim at");
await c.exec(GOLD, "mint(address,uint256)", [grip, 500n * WAD]);
await c.send({ to: grip, value: 2n * WAD });
eq("the grip holds gold", decUint(await c.read(GOLD, "balanceOf(address)", [grip])), 500n * WAD);

const asBuyer2 = async (sig, args) => {
  const r = await c.vm.evm.runCall({
    to: createAddressFromString(grip), caller: createAddressFromString(buyer),
    origin: createAddressFromString(buyer), data: hexToBytes(enc(sig, args)),
    gasLimit: 20_000_000n, value: 0n, block: evm.BLOCK
  });
  if (r.execResult.exceptionError) throw new Error(r.execResult.exceptionError.error);
  return bytesToHex(r.execResult.returnValue);
};
await refuses("the holder calling execute", () =>
  asBuyer2("execute(address,uint256,bytes,uint8)",
    [GOLD, 0, enc("transfer(address,uint256)", [buyer, WAD]), 0]),
  "the Grip has an execute after all");
await refuses("the holder calling anything that spends", () =>
  asBuyer2("withdraw(address,uint256)", [GOLD, WAD]),
  "the Grip has a withdraw after all");
eq("nothing moved, because nothing could", decUint(await c.read(GOLD, "balanceOf(address)", [grip])), 500n * WAD);
eq("no signer is ever valid",
   decUint(await c.read(grip, "isValidSigner(address,bytes)", [buyer, "0x"])), 0);

head("what a buyer reads is a floor, not a snapshot");
const h = await c.read(grip, "holdings(address[])", [[GOLD]]);
eq("ether", decUint(h, 0), 2n * WAD);
console.log("      a seller has no function with which to move either number");

/*════════════════ SESSION KEYS ════════════════*/
head("a bounded key, for something that is not you");
await c.exec(nft, "mint()", [], { value: 10n ** 16n });
const v3 = decAddr(await c.read(nft, "account(uint256)", [3]));
await c.exec(nft, "embody(uint256)", [3]);
await c.exec(GOLD, "mint(address,uint256)", [v3, 100n * WAD]);

const agent = "0x" + "a9e07".padStart(40, "0");
await c.fund(agent, 10n ** 18n);
const asAgent = async (to, sig, args) => {
  const r = await c.vm.evm.runCall({
    to: createAddressFromString(to), caller: createAddressFromString(agent),
    origin: createAddressFromString(agent), data: hexToBytes(enc(sig, args)),
    gasLimit: 20_000_000n, value: 0n, block: evm.BLOCK
  });
  if (r.execResult.exceptionError) {
    const e = new Error(r.execResult.exceptionError.error);
    e.data = bytesToHex(r.execResult.returnValue || new Uint8Array());
    throw e;
  }
  return bytesToHex(r.execResult.returnValue);
};

const SEL_TRANSFER = "0xa9059cbb";
const SEL_APPROVE  = "0x095ea7b3";
const encAddrArr = (a) => "20".padStart(64, "0") + BigInt(a.length).toString(16).padStart(64, "0") +
  a.map(x => x.slice(2).toLowerCase().padStart(64, "0")).join("");

// grantSession(address,uint64,uint128,address[],bytes4[])
const grantData = "0x" + (await import("./evm.mjs")).sel(
  "grantSession(address,uint64,uint128,address[],bytes4[])").slice(2) +
  agent.slice(2).toLowerCase().padStart(64, "0") +
  (evm.GENESIS_TIME + 86400n).toString(16).padStart(64, "0") +
  (WAD).toString(16).padStart(64, "0") +
  (0xa0).toString(16).padStart(64, "0") +
  (0xa0 + 32 + 32).toString(16).padStart(64, "0") +
  "1".padStart(64, "0") + GOLD.slice(2).toLowerCase().padStart(64, "0") +
  "1".padStart(64, "0") + SEL_TRANSFER.slice(2).padEnd(64, "0");
await c.send({ to: v3, data: grantData, label: "grantSession" });
ok("the session is live", decBool(await c.read(v3, "sessionAllows(address,address,bytes4)",
   [agent, GOLD, SEL_TRANSFER])));

let agentActed = false;
try {
  await asAgent(v3, "executeAsSession(address,uint256,bytes)",
    [GOLD, 0, enc("transfer(address,uint256)", [agent, WAD])]);
  agentActed = true;
} catch (e) { console.log("      " + (e.data || e.message).slice(0, 90)); }
ok("the agent can do the one thing it was granted", agentActed);
eq("and it happened", decUint(await c.read(GOLD, "balanceOf(address)", [agent])), WAD);

await refuses("a selector it was not granted", () =>
  asAgent(v3, "executeAsSession(address,uint256,bytes)",
    [GOLD, 0, enc("approve(address,uint256)", [agent, MAX])]),
  "the selector allowlist is not enforced");

await refuses("a target it was not granted", () =>
  asAgent(v3, "executeAsSession(address,uint256,bytes)",
    [SILVER, 0, enc("transfer(address,uint256)", [agent, WAD])]),
  "the target allowlist is not enforced");

await refuses("calling the account itself, to grant itself more", () =>
  asAgent(v3, "executeAsSession(address,uint256,bytes)",
    [v3, 0, enc("revokeSession(address)", [agent])]),
  "a session can escalate its own privilege — this is the whole game");

await refuses("granting a session at all", () =>
  asAgent(v3, "grantSession(address,uint64,uint128,address[],bytes4[])", [agent, 0, 0]),
  "a session key can mint session keys");

await refuses("sealing the vault", () =>
  asAgent(v3, "seal(uint64)", [evm.GENESIS_TIME + 1000n]),
  "a session can seal a vault it does not own");

/* An approval is called ON the token and names its spender in the argument,
   so allowlisting the target says who is being called and nothing at all
   about who is being trusted. The argument has to be checked. */
head("an approval names its spender in the argument, not in the target");
const GRANT = "grantSession(address,uint64,uint128,address[],bytes4[])";
const SEL_APPROVE_ALL = "0xa22cb465";
await c.exec(v3, GRANT,
  [agent, evm.GENESIS_TIME + 86400n, WAD, [GOLD, SILVER], [SEL_TRANSFER, SEL_APPROVE, SEL_APPROVE_ALL]],
  { label: "grantSession" });

await refuses("approving a spender nobody named", () =>
  asAgent(v3, "executeAsSession(address,uint256,bytes)",
    [GOLD, 0, enc("approve(address,uint256)", [agent, MAX])]),
  "a session with approve on an allowlisted token can approve anyone at all");

let approvedNamed = false;
try {
  await asAgent(v3, "executeAsSession(address,uint256,bytes)",
    [GOLD, 0, enc("approve(address,uint256)", [SILVER, WAD])]);
  approvedNamed = true;
} catch (e) { console.log("      " + (e.data || e.message).slice(0, 90)); }
ok("but it may approve one that was", approvedNamed);

await refuses("and setApprovalForAll is checked the same way", () =>
  asAgent(v3, "executeAsSession(address,uint256,bytes)",
    [GOLD, 0, enc("setApprovalForAll(address,bool)", [agent, true])]),
  "the operator argument is not checked");

/* The cap is cumulative over the session's life, not per call, so a session
   cannot get around it by spending the same allowance twice. */
head("the spend cap counts across the whole session, not per call");
await c.send({ to: v3, value: 10n * WAD });
await c.exec(v3, GRANT,
  [agent, evm.GENESIS_TIME + 86400n, 2n * WAD, [agent], ["0x00000000"]]);

const agentEth0 = (await c.vm.stateManager.getAccount(createAddressFromString(agent))).balance;
await asAgent(v3, "executeAsSession(address,uint256,bytes)", [agent, WAD, "0x"]);
await asAgent(v3, "executeAsSession(address,uint256,bytes)", [agent, WAD, "0x"]);
ok("two sends inside the cap go through",
   (await c.vm.stateManager.getAccount(createAddressFromString(agent))).balance - agentEth0 === 2n * WAD);
await refuses("the third, which would exceed it, does not", () =>
  asAgent(v3, "executeAsSession(address,uint256,bytes)", [agent, 1n, "0x"]),
  "the cap is per call rather than cumulative, so it is not a cap");

/* Re-granting is the only way terms change, and it is the holder's call. */
await refuses("and the session cannot raise its own cap", () =>
  asAgent(v3, GRANT, [agent, evm.GENESIS_TIME + 86400n, 100n * WAD, [agent], ["0x00000000"]]),
  "a session key can re-grant itself");

head("the expiry is a wall the key cannot move");
evm.warp(evm.GENESIS_TIME + 86401n);
ok("sessionAllows says no once it has passed",
   !decBool(await c.read(v3, "sessionAllows(address,address,bytes4)", [agent, agent, "0x00000000"])));
await refuses("and the call is refused", () =>
  asAgent(v3, "executeAsSession(address,uint256,bytes)", [agent, 1n, "0x"]),
  "an expired session still acts");
evm.warp(evm.GENESIS_TIME);

/*  Pinned rather than discovered. Two allowlists are a cross-product, not a
    set of pairs, and a holder who wants "deposit to A, withdraw from B" must
    use two keys. That is a decision with a gas reason behind it — explicit
    pairs would be up to 256 SSTOREs in one grant — and an undocumented
    decision is just a surprise with a rationale attached. */
head("two allowlists are a cross-product, and this is what that means");
await c.exec(v3, GRANT, [agent, evm.GENESIS_TIME + 86400n, 0,
  [GOLD, SILVER], [SEL_TRANSFER, SEL_APPROVE]]);
for (const [tName, tAddr] of [["GOLD", GOLD], ["SILVER", SILVER]]) {
  for (const [sName, sel] of [["transfer", SEL_TRANSFER], ["approve", SEL_APPROVE]]) {
    ok(`${tName} × ${sName} is allowed, whether or not that pair was intended`,
       decBool(await c.read(v3, "sessionAllows(address,address,bytes4)", [agent, tAddr, sel])));
  }
}
console.log("      a holder who wants one pair and not the other uses two keys;");
console.log("      sessionAllows answers for any combination before you grant it");

head("the holder takes it back");
await c.exec(v3, GRANT, [agent, evm.GENESIS_TIME + 86400n, WAD, [GOLD], [SEL_TRANSFER]]);
await c.exec(v3, "revokeSession(address)", [agent], { label: "revokeSession" });
ok("revoked instantly", !decBool(await c.read(v3, "sessionAllows(address,address,bytes4)",
   [agent, GOLD, SEL_TRANSFER])));
await refuses("and the key is dead", () =>
  asAgent(v3, "executeAsSession(address,uint256,bytes)",
    [GOLD, 0, enc("transfer(address,uint256)", [agent, WAD])]),
  "revocation does not take effect");

head("and it never had a way to the Grip");
const g3 = decAddr(await c.read(nft, "grip(uint256)", [3]));
ok("the Grip is not on any allowlist it could be given",
   !decBool(await c.read(v3, "sessionAllows(address,address,bytes4)",
     [agent, g3, SEL_TRANSFER])));
console.log("      and even allowlisted it would find no function that spends");


/*════════════ WHAT THE DAVE V2 AUDIT SENT US LOOKING FOR ════════════

  Of its vault findings, three did not apply here and one applied inverted.
  The inverted one is the interesting one and it is tested first: Dave's
  ragequit BRICKS when a listed token misbehaves, and this account instead
  went quietly BLIND. Opposite failure, same root cause — a measurement that
  does not distinguish "answered zero" from "did not answer".              */

const { secp256k1 } = await import("ethereum-cryptography/secp256k1.js");
const signHash = (h) => {
  const sig = secp256k1.sign(hexToBytes(h), c.key);
  return "0x" + sig.toCompactHex() + (27 + sig.recovery).toString(16).padStart(2, "0");
};
/* abi.encode(string, bytes32, uint64, bytes) — the preimage a sealed
   account needs so it can rebuild the digest instead of taking a hash on
   trust. The deadline is inside it, so it is signed rather than asserted. */
const encodeAttestation = (purpose, payload, deadline, sig) => {
  const pb = Buffer.from(purpose, "utf8");
  const sb = sig.replace(/^0x/, "");
  const head = (128).toString(16).padStart(64, "0") +
               payload.replace(/^0x/, "") +
               BigInt(deadline).toString(16).padStart(64, "0") +
               (128 + 32 + Math.ceil(pb.length / 32) * 32).toString(16).padStart(64, "0");
  return "0x" + head +
    pb.length.toString(16).padStart(64, "0") +
    pb.toString("hex").padEnd(Math.ceil(pb.length / 32) * 64, "0") +
    (sb.length / 2).toString(16).padStart(64, "0") +
    sb.padEnd(Math.ceil(sb.length / 2 / 32) * 64, "0");
};

head("an asset that stops answering — the hole, not the brick");
await c.exec(nft, "mint()", [], { value: 10n ** 16n });
const bId = decUint(await c.read(nft, "totalSupply()"));
const bVault = decAddr(await c.read(nft, "account(uint256)", [bId]));
await c.exec(nft, "embody(uint256)", [bId]);

const BRK = await c.deploy(A("test/mocks/Breakable.sol", "Breakable").bytecode);
await c.exec(BRK, "mint(address,uint256)", [bVault, 500n * WAD]);
await c.exec(GOLD, "mint(address,uint256)", [bVault, 500n * WAD]);
await c.exec(bVault, "guard(address)", [BRK]);
await c.exec(bVault, "guard(address)", [GOLD]);
eq("nothing is unmeasurable to begin with",
   decUint(await c.read(bVault, "unmeasurable()"), 1), 0);

await c.exec(BRK, "setBreakBalance(bool)", [true]);
const un = await c.read(bVault, "unmeasurable()");
eq("a token that stops answering is named", decUint(un, 1), 1);
eq("and it is the right one", decAddr(un, 2).toLowerCase(), BRK.toLowerCase());
console.log("      a buyer reads unmeasurable() beside holdings(), so the gap");
console.log("      in the promise is stated rather than silently taken");

await c.exec(bVault, "seal(uint64)", [evm.GENESIS_TIME + 10n * 86400n]);
let stillWorks = false;
try {
  await c.exec(bVault, "execute(address,uint256,bytes,uint8)",
    [SILVER, 0, enc("balanceOf(address)", [bVault]), 0]);
  stillWorks = true;
} catch (e) { console.log("      " + String(e.message).slice(0, 100)); }
ok("the sealed account still acts with a blind asset on the manifest", stillWorks,
   "one broken token bricked the whole account — this is Dave's C1 failure");



await refuses("and the assets it can still see are still held", () =>
  c.exec(bVault, "execute(address,uint256,bytes,uint8)",
    [GOLD, 0, enc("transfer(address,uint256)", [me, WAD]), 0]),
  "the seal stopped holding the measurable assets too");

head("going blind during a call is refused, not shrugged at");
await c.exec(BRK, "setBreakBalance(bool)", [false]);
await refuses("a call that ends with an asset unreadable", () =>
  c.exec(bVault, "execute(address,uint256,bytes,uint8)",
    [BRK, 0, enc("setBreakBalance(bool)", [true]), 0]),
  "an account could be walked into blindness inside a sealed call");

/*  And a blind asset is no longer a life sentence. A manifest asset that
    stops answering can be taken off the list even while sealed, because the
    seal was never able to promise about an asset it cannot read — and
    leaving it stuck there was a door a stranger could shut on somebody
    else's account for a year, by breaking a token they controlled.       */
head("a blind asset can be let go of; a visible one cannot");
await c.exec(BRK, "setBreakBalance(bool)", [true]);
let released = false;
try { await c.exec(bVault, "unguard(address)", [BRK]); released = true; }
catch (e) { console.log("      " + String(e.message).slice(0, 90)); }
ok("a token that stopped answering can be released mid-seal", released,
   "the account is trapped with an asset it can neither see nor remove");
await refuses("while the ones it CAN see stay exactly where they are", () =>
  c.exec(bVault, "unguard(address)", [GOLD]),
  "the manifest could be emptied instead of the vault — the whole promise");
await c.exec(BRK, "setBreakBalance(bool)", [false]);

head("the manifest is no longer append-only forever");
await c.exec(nft, "mint()", [], { value: 10n ** 16n });
const uId = decUint(await c.read(nft, "totalSupply()"));
const uVault = decAddr(await c.read(nft, "account(uint256)", [uId]));
await c.exec(nft, "embody(uint256)", [uId]);
await c.exec(uVault, "guard(address)", [GOLD]);
await c.exec(uVault, "unguard(address)", [GOLD], { label: "unguard" });
eq("it can be taken off while unsealed", decUint(await c.read(uVault, "manifest()"), 1), 0);
ok("the flag went with it", !decBool(await c.read(uVault, "onManifest(address)", [GOLD])));
await c.exec(uVault, "guard(address)", [GOLD]);
await c.exec(uVault, "seal(uint64)", [evm.GENESIS_TIME + 10n * 86400n]);
await refuses("while sealed, nobody may take one off", () =>
  c.exec(uVault, "unguard(address)", [GOLD]),
  "the manifest could be emptied instead of the vault — the whole promise");

head("a batch is one act or none");
await c.exec(nft, "mint()", [], { value: 10n ** 16n });
const bt = decUint(await c.read(nft, "totalSupply()"));
const btV = decAddr(await c.read(nft, "account(uint256)", [bt]));
await c.exec(nft, "embody(uint256)", [bt]);
await c.exec(GOLD, "mint(address,uint256)", [btV, 100n * WAD]);
await c.exec(SILVER, "mint(address,uint256)", [btV, 100n * WAD]);

const batch = (calls) => {
  const heads = [], bodies = [];
  let off = calls.length * 32;
  for (const k of calls) {
    heads.push(off.toString(16).padStart(64, "0"));
    const d = k.data.replace(/^0x/, "");
    const body = k.to.slice(2).toLowerCase().padStart(64, "0") +
      BigInt(k.value || 0).toString(16).padStart(64, "0") +
      (96).toString(16).padStart(64, "0") +
      (d.length / 2).toString(16).padStart(64, "0") +
      d.padEnd(Math.ceil(d.length / 64) * 64, "0");
    bodies.push(body); off += body.length / 2;
  }
  return "0x" + evm.sel("executeBatch((address,uint256,bytes)[])").slice(2) +
    (32).toString(16).padStart(64, "0") + calls.length.toString(16).padStart(64, "0") +
    heads.join("") + bodies.join("");
};

await c.send({ to: btV, data: batch([
  { to: GOLD, data: enc("transfer(address,uint256)", [me, WAD]) },
  { to: SILVER, data: enc("transfer(address,uint256)", [me, WAD]) }
]), label: "executeBatch" });
eq("two calls landed in one act",
   decUint(await c.read(GOLD, "balanceOf(address)", [btV])), 99n * WAD);

await c.exec(btV, "guard(address)", [GOLD]);
await c.exec(btV, "seal(uint64)", [evm.GENESIS_TIME + 10n * 86400n]);

await refuses("a sealed batch that ends poorer", () =>
  c.send({ to: btV, data: batch([
    { to: GOLD, data: enc("transfer(address,uint256)", [me, WAD]) },
    { to: SILVER, data: enc("transfer(address,uint256)", [me, WAD]) }]) }),
  "the measurement does not wrap the batch");

await refuses("and an approval anywhere inside it", () =>
  c.send({ to: btV, data: batch([
    { to: SILVER, data: enc("transfer(address,uint256)", [me, WAD]) },
    { to: GOLD, data: enc("approve(address,uint256)", [me, MAX]) }]) }),
  "an approval slipped through a batch, and it lands in a later block");

let dipped = false;
try {
  await c.send({ to: btV, data: batch([
    { to: GOLD, data: enc("transfer(address,uint256)", [drainer, WAD]) },
    { to: drainer, data: enc("give(address,address,uint256)", [GOLD, btV, WAD]) }]) });
  dipped = true;
} catch (e) { console.log("      " + String(e.message).slice(0, 110)); }
ok("but a batch that dips and comes back whole goes through", dipped,
   "per-call measurement would refuse the ordinary shape of real work");

head("a sealed vault can say who it is, and cannot promise what it holds");
const rawHash = "0x" + "11".repeat(32);
eq("a raw hash gets nothing while sealed",
   decUint(await c.read(btV, "isValidSignature(bytes32,bytes)", [rawHash, "0x" + "22".repeat(65)])), 0);
console.log("      an order hash from any venue is built under that venue's own");
console.log("      domain, so it can never be the output of attestationDigest");

const PURPOSE = "i am the token that holds this";
const PAYLOAD = "0x" + "ab".repeat(32);
const DEADLINE = evm.GENESIS_TIME + 3600n;
const digest = await c.read(btV, "attestationDigest(string,bytes32,uint64)",
  [PURPOSE, PAYLOAD, DEADLINE]);
const envelope = encodeAttestation(PURPOSE, PAYLOAD, DEADLINE, signHash(digest));
eq("but it validates the one digest it can rebuild",
   (await c.read(btV, "isValidSignature(bytes32,bytes)", [digest, envelope])).slice(0, 10),
   "0x1626ba7e");
eq("a well-formed envelope over a different hash is refused",
   decUint(await c.read(btV, "isValidSignature(bytes32,bytes)", [rawHash, envelope])), 0);
eq("garbage is a plain no rather than a revert",
   decUint(await c.read(btV, "isValidSignature(bytes32,bytes)", [rawHash, "0xdeadbeef"])), 0);

/*  A statement that cannot be retired is a statement nobody should make.
    The first version of this had no nonce and no deadline, so one signature
    authenticated the same claim to everybody, forever, and the only way out
    was waiting for the seal to lapse. */
head("and it can take it back");
const past = await c.read(btV, "attestationDigest(string,bytes32,uint64)",
  [PURPOSE, PAYLOAD, evm.GENESIS_TIME - 1n]);
eq("an expired attestation is refused",
   decUint(await c.read(btV, "isValidSignature(bytes32,bytes)",
     [past, encodeAttestation(PURPOSE, PAYLOAD, evm.GENESIS_TIME - 1n, signHash(past))])), 0);

await c.exec(btV, "retireAttestations()", [], { label: "retireAttestations" });
eq("and one bump retires every signature the account ever gave",
   decUint(await c.read(btV, "isValidSignature(bytes32,bytes)", [digest, envelope])), 0);

const fresh = await c.read(btV, "attestationDigest(string,bytes32,uint64)",
  [PURPOSE, PAYLOAD, DEADLINE]);
ok("the same statement re-signed after the bump is a different digest", fresh !== digest);
eq("and that one is honoured",
   (await c.read(btV, "isValidSignature(bytes32,bytes)",
     [fresh, encodeAttestation(PURPOSE, PAYLOAD, DEADLINE, signHash(fresh))])).slice(0, 10),
   "0x1626ba7e");

/*════════════ the manifest, moved out from under the measurement ════════════

  The seal measures by taking `pre[]` and `seen[]` aligned with the manifest
  BY INDEX, running the call, then re-reading `_manifest[i]` and comparing.
  `unguard` removes an entry by swapping the last one into its place. So an
  `unguard` re-entered from inside the very call being measured renumbers the
  manifest underneath arrays that were taken before it — and a slot whose
  `seen` flag was false, because a broken token used to sit there, now holds a
  real one, which `_verify` therefore skips entirely.

  This was found by an adversarial pass and reproduced on chain before it was
  fixed: a sealed vault holding a thousand GOLD ended holding none, and
  `isSealed()` still answered true. `nonReentrant` does not cover it, because
  the re-entry is into a different function.

  `_pieces` had the same defect and a worse version. `unguardNFT` refuses,
  while sealed, only for a piece the account STILL HOLDS — so a batch that
  transfers the piece away FIRST is then free to drop it from the list, and
  `_verifyPieces` never goes looking. That is the entire promise of guarding a
  named NFT, defeated in two calls of one batch.

  Both run here on every check, and both are run as the attack rather than as
  the rule, because the rule was already written down and was already true in
  every case anybody had tried.
*/
head("the manifest cannot move while a call is being measured");
{
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  const v = decAddr(await c.read(nft, "account(uint256)", [id]));
  await c.exec(nft, "embody(uint256)", [id]);

  const breaker = await c.deploy(A("test/mocks/SealBreaker.sol", "SealBreaker").bytecode);
  await c.send({ to: breaker, value: WAD });
  await c.exec(breaker, "setup(address,address,address)", [nft, BRK, GOLD], { value: 10n ** 16n });
  const bad = decAddr(await c.read(breaker, "acct()"));
  await c.exec(GOLD, "mint(address,uint256)", [bad, 1000n * WAD]);
  await c.exec(BRK, "mint(address,uint256)", [bad, 5n * WAD]);
  await c.exec(breaker, "sealIt(uint64)", [evm.GENESIS_TIME + 30n * 86400n]);
  eq("a contract holder sealed a vault over two assets",
     decUint(await c.read(bad, "manifest()"), 1), 2);

  /*  Control first. With both assets readable the drain is refused by the
      ordinary measurement, which is what makes the next line a finding
      rather than a coincidence.                                        */
  await refuses("with both assets readable the drain is refused",
    () => c.exec(breaker, "drain(address,uint256,address)", [GOLD, 100n * WAD, me]));

  /*  Now break the other asset so the account goes blind on it. That is
      the state `unguard`'s escape hatch was written for, and the state the
      attack needs.                                                     */
  await c.exec(BRK, "setBreakBalance(bool)", [true]);
  eq("one asset is now unmeasurable, and says so publicly",
     decUint(await c.read(bad, "unmeasurable()"), 1), 1);

  await refuses("and a batch that unguards the blind one mid-flight is refused too",
    () => c.exec(breaker, "drain(address,uint256,address)", [GOLD, 1000n * WAD, me]),
    "a sealed vault was emptied by renumbering its manifest inside the call being measured");
  eq("the gold never moved", decUint(await c.read(GOLD, "balanceOf(address)", [bad])), 1000n * WAD);
  eq("and the manifest is intact", decUint(await c.read(bad, "manifest()"), 1), 2);
  await c.exec(BRK, "setBreakBalance(bool)", [false]);
}

head("a guarded piece cannot be dropped from inside the call that moves it");
{
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  const v = decAddr(await c.read(nft, "account(uint256)", [id]));
  await c.exec(nft, "embody(uint256)", [id]);

  const PUNK = await c.deploy(A("test/mocks/MockERC721.sol", "MockERC721").bytecode);
  await c.exec(PUNK, "mint(address,uint256)", [v, 7n]);
  await c.exec(v, "guardNFT(address,uint256)", [PUNK, 7n]);
  await c.exec(v, "seal(uint64)", [evm.GENESIS_TIME + 30n * 86400n]);
  eq("one named piece is under the seal", decUint(await c.read(v, "pieces()"), 1), 1);

  /*  The plain attempt, which the piece check already refused.        */
  await refuses("the piece cannot simply be sent away",
    () => c.exec(v, "execute(address,uint256,bytes,uint8)",
      [PUNK, 0n, enc("transferFrom(address,address,uint256)", [v, me, 7n]), 0n]));

  /*  And the one that used to work: move it, then drop it from the list
      in the same batch, so nothing is left to look for.              */
  const inner = enc("transferFrom(address,address,uint256)", [v, me, 7n]);
  const drop  = enc("unguardNFT(uint256)", [0n]);
  await refuses("nor moved and then quietly dropped from the list in one batch",
    () => c.exec(v, "executeBatch((address,uint256,bytes)[])",
      [[[PUNK, 0n, inner], [v, 0n, drop]]]),
    "the whole promise of guarding a named piece, defeated in two calls");
  eq("the piece is still held by the vault",
     decAddr(await c.read(PUNK, "ownerOf(uint256)", [7n])).toLowerCase(), v.toLowerCase());
  eq("and still named by it", decUint(await c.read(v, "pieces()"), 1), 1);
}

/*════════════ a key does not survive the sale of what it spends from ════════

  `sessionOf` is storage on the account and `executeAsSession` authorises out
  of that mapping alone; the hub's `transferFrom` clears the ERC-4907 lease
  and the lease agent and nothing else. So a key the seller handed to a bot
  went on spending from the buyer's Reach, bounded only by its own expiry —
  up to a year — with nothing anywhere telling the buyer to go looking.

  The mark is the hub's transfer counter and not the granting holder's
  address, because an address is not enough: sold to a stranger and bought
  back, an identity check would wake every retired key up. Both cases run
  here.
*/
head("a session key does not survive the sale");
{
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  const v = decAddr(await c.read(nft, "account(uint256)", [id]));
  await c.exec(nft, "embody(uint256)", [id]);
  await c.exec(GOLD, "mint(address,uint256)", [v, 100n * WAD]);

  const bot = await c.as("0x" + "7e".repeat(32));
  const key = bot.from.toString();
  const move = enc("transfer(address,uint256)", [me, 1n * WAD]);
  const XFER = "0xa9059cbb";

  await c.exec(v, "grantSession(address,uint64,uint128,address[],bytes4[])",
    [key, evm.GENESIS_TIME + 300n * 86400n, 0n, [GOLD], [XFER]]);
  ok("the key is granted and current",
     decBool(await c.read(v, "sessionAllows(address,address,bytes4)", [key, GOLD, XFER])));
  await bot.exec(v, "executeAsSession(address,uint256,bytes)", [GOLD, 0n, move]);
  eq("and it spends", decUint(await c.read(GOLD, "balanceOf(address)", [v])), 99n * WAD);

  /*  Now sell the token. Nothing is called on the account; the hub does
      not know it exists.                                               */
  const buyer = await c.as("0x" + "b1".repeat(32));
  await c.exec(nft, "transferFrom(address,address,uint256)", [me, buyer.from.toString(), id]);
  eq("the Reach follows the token", decAddr(await c.read(v, "owner()")).toLowerCase(),
     buyer.from.toString().toLowerCase());

  await refuses("the seller's key cannot spend from the buyer's Reach",
    () => bot.exec(v, "executeAsSession(address,uint256,bytes)", [GOLD, 0n, move]),
    "a key granted before the sale kept spending for up to a year afterwards");
  eq("not one wei moved", decUint(await c.read(GOLD, "balanceOf(address)", [v])), 99n * WAD);
  ok("and the page-facing read says so rather than showing it as live",
     !decBool(await c.read(v, "sessionAllows(address,address,bytes4)", [key, GOLD, XFER])));
  ok("`sessionCurrent` names the reason", !decBool(await c.read(v, "sessionCurrent(address)", [key])));

  /*  The edge an address check would have missed: bought back by the very
      holder who granted the key. A counter only goes forward.          */
  await buyer.exec(nft, "transferFrom(address,address,uint256)", [buyer.from.toString(), me, id]);
  eq("the token comes back to the one who granted it",
     decAddr(await c.read(nft, "ownerOf(uint256)", [id])).toLowerCase(), me.toLowerCase());
  await refuses("and the retired key stays retired",
    () => bot.exec(v, "executeAsSession(address,uint256,bytes)", [GOLD, 0n, move]),
    "an identity check would have woken every key the seller ever granted");

  /*  And the new holder can of course grant afresh — the fix retires keys,
      it does not disable the feature.                                  */
  await c.exec(v, "grantSession(address,uint64,uint128,address[],bytes4[])",
    [key, evm.GENESIS_TIME + 300n * 86400n, 0n, [GOLD], [XFER]]);
  await bot.exec(v, "executeAsSession(address,uint256,bytes)", [GOLD, 0n, move]);
  eq("a key granted by the holder who holds it now works",
     decUint(await c.read(GOLD, "balanceOf(address)", [v])), 98n * WAD);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
