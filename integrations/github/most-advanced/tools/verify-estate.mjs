#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the estate — succession and consignment

  Two contracts that hold, or can move, somebody else's token. Both of them
  are therefore worth attacking rather than demonstrating, and the attacks
  are the ones that would actually be tried:

    succession
      · the phished approval          can an operator rewrite the heir?
      · the impatient heir            claim without a knock, knock too soon
      · the cancelled knock           does one touch really reset it?
      · the sale                      does a plan survive the token leaving?
      · the bolt                      a soulbound token cannot be inherited
      · the standing grant            is it really narrow, or is it a drain?

    consignment
      · the undersell                 can an agent price below the floor?
      · the front-run                 can an agent raise the price into a buyer?
      · the hostage                   can an agent keep it by going silent?
      · the walk-away                 can a seller take it back mid-term?
      · the wedge                     does a reverting seller freeze the market?
      · the use                       does the seller keep the instrument?

    node tools/verify-estate.mjs
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import * as evm from "./evm.mjs";
import { Chain, decUint, decAddr, decBool, encodeAddressArg, warp } from "./evm.mjs";
import { createAddressFromString } from "@ethereumjs/util";

let pass = 0, fail = 0;
const ok = (n, cond, d) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${n}`);
  if (!cond && d !== undefined) console.log(`      ${d}`);
};
const eq = (n, g, w) => ok(n, String(g) === String(w), `got ${g}\n      want ${w}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const DAY = 86400n;
/// The chain's clock, which the harness moves and the wall clock does not.
const now = () => evm.BLOCK.header.timestamp;

/// A call that must fail. A test that cannot tell a revert from a success
/// is not testing the refusal, so this returns the reason too.
const refuses = async (name, fn) => {
  let threw = false, why = "";
  try { await fn(); } catch (e) { threw = true; why = String(e.message || e).slice(0, 90); }
  ok(name, threw, "it went through");
  return why;
};

const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();
const me = c.from.toString();

head("deploy");
const tmpReg = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode);
await c.vm.stateManager.putCode(createAddressFromString(REGISTRY),
  await c.vm.stateManager.getCode(createAddressFromString(tmpReg)));

const impl     = await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode);
const gripImpl = await c.deploy(A("src/GripVault.sol", "GripVault").bytecode);
const engine   = await c.deploy(A("src/Engine.sol", "Engine").bytecode, "0".repeat(64));
const sigil    = await c.deploy(A("src/Sigil.sol", "Sigil").bytecode);
const renderer = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  encodeAddressArg(engine) + encodeAddressArg(sigil));
const nft = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(renderer) + encodeAddressArg(impl) + encodeAddressArg(gripImpl) + (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"));

const succ = await c.deploy(A("src/Succession.sol", "Succession").bytecode,
  encodeAddressArg(nft), "Succession");
const cons = await c.deploy(A("src/Consign.sol", "Consign").bytecode,
  encodeAddressArg(nft), "Consign");
ok("both contracts deployed", succ.length === 42 && cons.length === 42);

/*  Four hands. The heir is who the estate is left to; the thief holds a
    phished approval and nothing else; the agent sells; the buyer buys. */
const heir  = await c.as("0x" + "a1".repeat(32));
const thief = await c.as("0x" + "b2".repeat(32));
const agent = await c.as("0x" + "c3".repeat(32));
const buyer = await c.as("0x" + "d4".repeat(32));

for (let i = 0; i < 5; i++) await c.exec(nft, "mint()", [], { value: 10n ** 16n });
const ownerOf = async (id) => decAddr(await c.read(nft, "ownerOf(uint256)", [id])).toLowerCase();
eq("five tokens minted to one wallet", await ownerOf(1), me.toLowerCase());

/*════════════════════════ succession ════════════════════════*/

head("succession · a plan only its owner can write");
{
  const id = 1;
  /*  The whole point of the strict door. If an approved operator can name
      the heir, a phished approval does not have to steal anything — the
      thief writes themselves into the will and waits for the silence.  */
  await c.exec(nft, "approve(address,uint256)", [thief.from.toString(), id]);
  await refuses("an approved operator cannot name the heir",
    () => thief.exec(succ, "arrange(uint256,address,uint256,uint64,uint64)",
      [id, thief.from.toString(), 0n, 60n * DAY, 30n * DAY]));

  await c.exec(succ, "arrange(uint256,address,uint256,uint64,uint64)",
    [id, heir.from.toString(), 0n, 60n * DAY, 30n * DAY]);
  eq("the owner can, and the heir reads back",
     decAddr(await c.read(succ, "heirOf(uint256)", [id])).toLowerCase(),
     heir.from.toString().toLowerCase());

  await refuses("and the operator cannot erase it either",
    () => thief.exec(succ, "revoke(uint256)", [id]));

  /*  A silence shorter than a month is an accident waiting to fire, and
      one longer than ten years is a promise about a system that may not
      be there.                                                         */
  await refuses("a silence of one day is refused",
    () => c.exec(succ, "arrange(uint256,address,uint256,uint64,uint64)",
      [2, heir.from.toString(), 0n, DAY, 30n * DAY]));
  await refuses("and one of twenty years is too",
    () => c.exec(succ, "arrange(uint256,address,uint256,uint64,uint64)",
      [2, heir.from.toString(), 0n, 7300n * DAY, 30n * DAY]));
  await refuses("naming yourself is not a plan",
    () => c.exec(succ, "arrange(uint256,address,uint256,uint64,uint64)",
      [2, me, 0n, 60n * DAY, 30n * DAY]));
}

head("succession · two clocks, and what resets them");
{
  const id = 1;
  await c.exec(nft, "approve(address,uint256)", [succ, id]);

  await refuses("nobody may knock while the token is still in use",
    () => heir.exec(succ, "summon(uint256)", [id]));
  await refuses("and claiming without a knock is refused",
    () => heir.exec(succ, "claim(uint256)", [id]));
  eq("the plan reads as speaking", decUint(await c.read(succ, "wouldPass(uint256)", [id])), 7n);

  const seen = decUint(await c.read(succ, "lastSeen(uint256)", [id]));
  warp(seen + 61n * DAY);
  eq("after the silence, it reads as knockable",
     decUint(await c.read(succ, "wouldPass(uint256)", [id])), 9n);

  /*  Ordinary use of the instrument used to count, through the hub's own
      operation stamp, and that was the nicest thing about this contract.
      It is gone on purpose. `record` is gated to the owner or the token's
      account, so it IS an owner signal — but it lands in the same `lastOp`
      as `commit` and `setTrait`, which an approved operator or a RENTER
      can call. A switch a renter can hold open for the length of their
      lease is not a switch, and nothing on chain distinguishes the two
      stamps after the fact.                                            */
  await c.exec(nft, "record(uint256)", [id]);
  eq("the hub's own stamp no longer counts as a sign of life",
     decUint(await c.read(succ, "wouldPass(uint256)", [id])), 9n);
  ok("so the knock still lands after it",
     (await (async () => { try { await heir.exec(succ, "summon(uint256)", [id]); return true; }
                           catch { return false; } })()));
  await c.exec(succ, "stillHere(uint256)", [id]);
  eq("and only the owner saying so puts it back to speaking",
     decUint(await c.read(succ, "wouldPass(uint256)", [id])), 7n);
  await refuses("after which the knock is refused again",
    () => heir.exec(succ, "summon(uint256)", [id]));

  const seen2 = decUint(await c.read(succ, "lastSeen(uint256)", [id]));
  warp(seen2 + 61n * DAY);
  await heir.exec(succ, "summon(uint256)", [id]);
  eq("now the knock lands, and a second clock starts",
     decUint(await c.read(succ, "wouldPass(uint256)", [id])), 8n);

  await refuses("claiming during the notice is refused",
    () => heir.exec(succ, "claim(uint256)", [id]));

  /*  The knock is loud on purpose: it is public, and one touch cancels
      it. This is the difference between a dead-man's switch and a trap. */
  await c.exec(succ, "stillHere(uint256)", [id]);
  eq("and the owner speaking up cancels the knock outright",
     decUint(await c.read(succ, "wouldPass(uint256)", [id])), 7n);
  await refuses("so the heir who was mid-notice gets nothing",
    () => heir.exec(succ, "claim(uint256)", [id]));
}

/*  The griefing case, which defeated the whole feature and cost nothing.

    `lastSeen` read the hub's operation stamp so that ordinary use kept the
    switch alive with nothing to remember. `embody` is open to the world —
    the account address is deterministic and materialising it is nobody's
    privilege — and it stamped that counter. So a stranger could reset the
    silence as often as they liked and keep an heir from ever knocking.

    Both halves are pinned here: the hub no longer stamps on `embody`, and
    the succession counts only the owner's own signal, because every
    remaining stamp is reachable by an operator and a renter's ordinary use
    would hold the switch open for the length of their lease.
*/
head("succession · a stranger cannot hold the switch open");
{
  const id = 2;
  await c.exec(succ, "arrange(uint256,address,uint256,uint64,uint64)",
    [id, heir.from.toString(), 0n, 60n * DAY, 30n * DAY]);
  await c.exec(nft, "approve(address,uint256)", [succ, id]);

  const t = decUint(await c.read(succ, "lastSeen(uint256)", [id]));
  warp(t + 61n * DAY);
  eq("after the silence the plan is knockable",
     decUint(await c.read(succ, "wouldPass(uint256)", [id])), 9n);

  /*  The attack, run as the attack. `embody` is the one hub call any
      address may make against somebody else's token.                  */
  await thief.exec(nft, "embody(uint256)", [id]);
  eq("a stranger calling embody does not reset the silence",
     decUint(await c.read(succ, "wouldPass(uint256)", [id])), 9n);
  await thief.exec(nft, "embody(uint256)", [id]);
  eq("nor does doing it again", decUint(await c.read(succ, "wouldPass(uint256)", [id])), 9n);

  /*  And the hub itself no longer records that as an operation, so
      nothing else downstream can be fed a false sign of life either. */
  const before = decUint(await c.read(nft, "statsOf(uint256)", [id]), 0);
  await thief.exec(nft, "embody(uint256)", [id]);
  eq("the hub does not count it as an operation the token performed",
     decUint(await c.read(nft, "statsOf(uint256)", [id]), 0), before);

  /*  The owner is still the one who can, which is the whole point.    */
  await c.exec(succ, "stillHere(uint256)", [id]);
  eq("while the owner saying so does reset it",
     decUint(await c.read(succ, "wouldPass(uint256)", [id])), 7n);

  /*  And an operator cannot stand in for the owner here either: the door
      is the strict one, so an approved address is refused.            */
  await c.exec(nft, "approve(address,uint256)", [thief.from.toString(), id]);
  await refuses("an approved operator cannot say the owner is here",
    () => thief.exec(succ, "stillHere(uint256)", [id]));
  await c.exec(nft, "approve(address,uint256)", [succ, id]);
  await c.exec(succ, "revoke(uint256)", [id]);
  await c.exec(nft, "approve(address,uint256)", ["0x" + "00".repeat(20), id]);
}

head("succession · the token actually passes");
{
  const id = 1;
  let t = decUint(await c.read(succ, "lastSeen(uint256)", [id]));
  warp(t + 61n * DAY);
  await heir.exec(succ, "summon(uint256)", [id]);
  const opens = decUint(await c.read(succ, "opensAt(uint256)", [id]));
  warp(opens + 1n);
  eq("both clocks run out and it reads as ready",
     decUint(await c.read(succ, "wouldPass(uint256)", [id])), 0n);

  /*  Anybody may push the button; only the named party can receive. A
      claim that only the heir can call is a claim that needs the heir to
      be alive, watching, and holding gas on the right day.             */
  await thief.exec(succ, "claim(uint256)", [id]);
  eq("a stranger may press the button", await ownerOf(id), heir.from.toString().toLowerCase());
  eq("and the plan is spent", decUint(await c.read(succ, "wouldPass(uint256)", [id])), 1n);
}

head("succession · what it refuses to promise");
{
  /*  A bolt outlives its holder. The contract has no privilege the
      standard does not give it, and it says so rather than looking
      healthy until the day it is needed.                              */
  const id = 2;
  await c.exec(succ, "arrange(uint256,address,uint256,uint64,uint64)",
    [id, heir.from.toString(), 0n, 60n * DAY, 30n * DAY]);
  await c.exec(nft, "approve(address,uint256)", [succ, id]);
  await c.exec(nft, "lock(uint256)", [id]);
  eq("a soulbound token reports that it cannot be inherited",
     decUint(await c.read(succ, "wouldPass(uint256)", [id])), 4n);

  let t = decUint(await c.read(succ, "lastSeen(uint256)", [id]));
  warp(t + 61n * DAY);
  await heir.exec(succ, "summon(uint256)", [id]);
  warp(decUint(await c.read(succ, "opensAt(uint256)", [id])) + 1n);
  await refuses("and the claim reverts rather than half-working",
    () => heir.exec(succ, "claim(uint256)", [id]));
  await c.exec(nft, "unlock(uint256)", [id]);

  /*  Withdraw the approval and the plan is inert. Which is the honest
      summary of what the grant is: revocable, and doing nothing until
      two clocks the owner controls have both run out.                 */
  await c.exec(nft, "approve(address,uint256)", ["0x" + "00".repeat(20), id]);
  eq("with the approval withdrawn the plan is inert",
     decUint(await c.read(succ, "wouldPass(uint256)", [id])), 3n);

  /*  And a plan does not survive the token being sold. The buyer never
      agreed to it.                                                     */
  const id3 = 3;
  await c.exec(succ, "arrange(uint256,address,uint256,uint64,uint64)",
    [id3, heir.from.toString(), 0n, 60n * DAY, 30n * DAY]);
  await c.exec(nft, "approve(address,uint256)", [succ, id3]);
  await c.exec(nft, "transferFrom(address,address,uint256)", [me, buyer.from.toString(), id3]);
  eq("a sold token carries no inheritance to its buyer",
     decUint(await c.read(succ, "wouldPass(uint256)", [id3])), 2n);
  await refuses("and the old heir cannot knock on the new owner's door",
    () => heir.exec(succ, "summon(uint256)", [id3]));
}

head("succession · inheritance that follows an instrument");
{
  /*  Naming a token rather than an address is the version that survives
      the heir changing wallets — which is the single most likely way for
      a ten-year arrangement to rot.                                    */
  const id = 4, viaToken = 5;
  await c.exec(succ, "arrange(uint256,address,uint256,uint64,uint64)",
    [id, "0x" + "00".repeat(20), BigInt(viaToken), 60n * DAY, 30n * DAY]);
  await c.exec(nft, "approve(address,uint256)", [succ, id]);
  eq("the heir is whoever holds the named token", await ownerOf(viaToken),
     decAddr(await c.read(succ, "heirOf(uint256)", [id])).toLowerCase());

  await c.exec(nft, "transferFrom(address,address,uint256)", [me, agent.from.toString(), viaToken]);
  eq("and it follows that token when it changes hands",
     decAddr(await c.read(succ, "heirOf(uint256)", [id])).toLowerCase(),
     agent.from.toString().toLowerCase());
}

/*════════════════════════ consignment ════════════════════════*/

const ETH = 10n ** 18n;

head("consignment · the terms");
{
  const id = 2;
  const until = now() + 30n * DAY;
  await refuses("a consignment with no floor is refused",
    () => c.exec(cons, "consign(uint256,address,uint96,uint16,uint64)",
      [id, agent.from.toString(), 0n, 1000n, until]));
  await refuses("an agent's cut of more than half is refused",
    () => c.exec(cons, "consign(uint256,address,uint96,uint16,uint64)",
      [id, agent.from.toString(), ETH, 6000n, until]));
  await refuses("a term of ten minutes is refused",
    () => c.exec(cons, "consign(uint256,address,uint96,uint16,uint64)",
      [id, agent.from.toString(), ETH, 1000n, now() + 600n]));

  await c.exec(nft, "lock(uint256)", [id]);
  await refuses("and a soulbound token cannot be offered at all",
    () => c.exec(cons, "consign(uint256,address,uint96,uint16,uint64)",
      [id, agent.from.toString(), ETH, 1000n, until]));
  await c.exec(nft, "unlock(uint256)", [id]);
}

head("consignment · what the agent may and may not do");
let TERM;
{
  const id = 2;
  TERM = now() + 30n * DAY;
  await c.exec(nft, "approve(address,uint256)", [cons, id]);
  await c.exec(cons, "consign(uint256,address,uint96,uint16,uint64)",
    [id, agent.from.toString(), ETH, 1000n, TERM], { label: "consign" });

  eq("the token is in escrow", await ownerOf(id), cons.toLowerCase());
  /*  And the instrument is not. Title moved; use did not — the seller
      keeps operating what they consigned, which is the whole reason a
      dealer holding your token is tolerable at all.                   */
  eq("but the seller keeps the use of it",
     decAddr(await c.read(nft, "userOf(uint256)", [id])).toLowerCase(), me.toLowerCase());
  await c.exec(nft, "commit(uint256,uint256)", [id, 7n]);
  ok("and can still operate it while it sits in the window", true);

  await refuses("the seller cannot simply take it back mid-term",
    () => c.exec(cons, "reclaim(uint256)", [id]));
  await refuses("nor can a stranger price it",
    () => buyer.exec(cons, "ask(uint256,uint96)", [id, 2n * ETH]));
  await refuses("and the agent cannot price it below the floor",
    () => agent.exec(cons, "ask(uint256,uint96)", [id, ETH / 2n]));

  await agent.exec(cons, "ask(uint256,uint96)", [id, 2n * ETH]);
  const sp = await c.read(cons, "split(uint256)", [id]);
  eq("the split is stated to the wei before anybody agrees",
     decUint(sp, 1) + decUint(sp, 2) + decUint(sp, 3), 2n * ETH);
}

head("consignment · the sale");
{
  const id = 2;
  await refuses("a buyer who underpays gets nothing",
    () => buyer.exec(cons, "buy(uint256,uint96)", [id, 2n * ETH], { value: ETH }));

  /*  The front-run. The agent watches a buy land in the mempool and
      raises the ask into whatever the buyer sent. Naming the price you
      agreed to turns that from a windfall into a revert.              */
  await agent.exec(cons, "ask(uint256,uint96)", [id, 5n * ETH]);
  await refuses("an agent who raises the price under a buyer gets a revert, not the difference",
    () => buyer.exec(cons, "buy(uint256,uint96)", [id, 2n * ETH], { value: 5n * ETH }));
  await agent.exec(cons, "ask(uint256,uint96)", [id, 2n * ETH]);

  const before = await c.balanceOf(buyer.from.toString());
  await buyer.exec(cons, "buy(uint256,uint96)", [id, 2n * ETH], { value: 3n * ETH, label: "buy" });
  eq("the buyer gets the token", await ownerOf(id), buyer.from.toString().toLowerCase());
  const after = await c.balanceOf(buyer.from.toString());
  ok("and the overpayment comes back rather than being kept",
     before - after < 2n * ETH + ETH / 100n, `spent ${before - after}`);

  eq("the seller's lease on it is gone with the sale",
     decAddr(await c.read(nft, "userOf(uint256)", [id])).toLowerCase(), "0x" + "00".repeat(20));

  /*  Pull, never push. The money is credited and each party takes their
      own — a seller whose wallet reverts on receipt cannot wedge the
      sale for the agent, the royalty receiver, or anybody after them. */
  const owedMe    = decUint(await c.read(cons, "owed(address)", [me]));
  const owedAgent = decUint(await c.read(cons, "owed(address)", [agent.from.toString()]));
  ok("the agent's cut is credited, not sent", owedAgent > 0n);
  ok("and the seller's share is the rest", owedMe > owedAgent, `${owedMe} vs ${owedAgent}`);
  await c.exec(cons, "withdraw()", []);
  eq("what was credited can be withdrawn once",
     decUint(await c.read(cons, "owed(address)", [me])), 0n);
  await refuses("and not twice", () => c.exec(cons, "withdraw()", []));
}

head("consignment · the agent cannot keep it by going silent");
{
  const id = 4;
  const until = now() + 10n * DAY;
  await c.exec(nft, "approve(address,uint256)", [cons, id]);
  await c.exec(cons, "consign(uint256,address,uint96,uint16,uint64)",
    [id, agent.from.toString(), ETH, 500n, until]);

  await refuses("mid-term, nobody can pull it out from under the agent",
    () => buyer.exec(cons, "reclaim(uint256)", [id]));

  warp(until + 1n);
  await refuses("once the term is over the window is shut",
    () => buyer.exec(cons, "buy(uint256,uint96)", [id, ETH], { value: ETH }));

  /*  Reclaim is callable by anybody on purpose. An agent who stops
      answering must not be able to keep a token by doing nothing at
      all, and requiring the seller to be alive to ask is the same trap
      one level down.                                                  */
  await buyer.exec(cons, "reclaim(uint256)", [id]);
  eq("but a stranger can send it home, and home is the seller",
     await ownerOf(id), me.toLowerCase());
}

head("consignment · ending it early takes both sides");
{
  const id = 4;
  const until = now() + 20n * DAY;
  await c.exec(nft, "approve(address,uint256)", [cons, id]);
  await c.exec(cons, "consign(uint256,address,uint96,uint16,uint64)",
    [id, agent.from.toString(), ETH, 500n, until]);

  await refuses("the seller alone cannot end it",
    () => c.exec(cons, "release(uint256)", [id]));
  await refuses("and neither can a stranger",
    () => buyer.exec(cons, "release(uint256)", [id]));
  await agent.exec(cons, "release(uint256)", [id]);
  eq("the agent handing it back is how a dealer says no",
     await ownerOf(id), me.toLowerCase());
}

head("consignment · the only door in is the one that writes the terms");
{
  /*  There is no `onERC721Received` here, so a token cannot arrive by
      any route that would leave it without a note — and a token with no
      note has no seller to send it home to.                           */
  const id = 4;
  await refuses("a token cannot be safe-transferred into escrow",
    () => c.exec(nft, "safeTransferFrom(address,address,uint256)", [me, cons, id]));
  eq("so it never left its owner", await ownerOf(id), me.toLowerCase());
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
