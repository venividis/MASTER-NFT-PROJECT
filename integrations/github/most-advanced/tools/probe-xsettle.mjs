#!/usr/bin/env node
/*  Real gas for the two halves of a cross-chain sale, plus the repo's own
    single-chain Consign for comparison. Numbers, not adjectives.        */
import { compile, artifact } from "./compile.mjs";
import { Chain, encodeAddressArg, decAddr } from "./evm.mjs";
import { createAddressFromString } from "@ethereumjs/util";
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();
const me = c.from.toString();
const w = (n) => BigInt(n).toString(16).padStart(64, "0");

const tmpReg = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode);
await c.vm.stateManager.putCode(createAddressFromString(REGISTRY),
  await c.vm.stateManager.getCode(createAddressFromString(tmpReg)));
const impl = await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode);
const grip = await c.deploy(A("src/GripVault.sol", "GripVault").bytecode);
const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, "0".repeat(64));
const sigil = await c.deploy(A("src/Sigil.sol", "Sigil").bytecode);
const rend = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode, encodeAddressArg(engine) + encodeAddressArg(sigil));
const nft = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(rend) + encodeAddressArg(impl) + encodeAddressArg(grip) + w(1) + w(4096));
const cons = await c.deploy(A("src/Consign.sol", "Consign").bytecode, encodeAddressArg(nft));
const home = await c.deploy(A("test/mocks/XSettle.sol", "HomeEscrow").bytecode, encodeAddressArg(me));
const away = await c.deploy(A("test/mocks/XSettle.sol", "AwayEscrow").bytecode);
const mock = await c.deploy(A("test/mocks/MockERC721.sol", "MockERC721").bytecode).catch(() => null);

const agent = await c.as("0x" + "c3".repeat(32));
const buyer = await c.as("0x" + "d4".repeat(32));
for (let i = 0; i < 4; i++) await c.exec(nft, "mint()", [], { value: 10n ** 16n });

const G = {};
const run = async (label, p) => { const r = await p; G[label] = r.gas; return r; };

console.log("\n  single chain, the contract that already exists (src/Consign.sol)");
/*  The harness runs its own clock, so deadlines are absolute rather
    than now-relative — a lesson from the first run, which set an
    "expired" deadline that was still in the future.                */
const T0 = 1_733_000_000n;              // tools/evm.mjs GENESIS_TIME
const FAR = T0 + 30n * 86400n, PAST = T0 - 1n;
await run("consign.approve", c.exec(nft, "approve(address,uint256)", [cons, 1]));
await run("consign.consign", c.exec(cons, "consign(uint256,address,uint96,uint16,uint64)",
  [1, agent.from.toString(), 10n ** 17n, 500, FAR]));
await run("consign.ask", agent.exec(cons, "ask(uint256,uint96)", [1, 2n * 10n ** 17n]));
await run("consign.buy", buyer.exec(cons, "buy(uint256,uint96)", [1, 2n * 10n ** 17n], { value: 2n * 10n ** 17n }));
await run("consign.withdraw", c.exec(cons, "withdraw()", []));

console.log("\n  cross chain, the two halves measured apart (test/mocks/XSettle.sol)");
const OID = "0x" + "77".repeat(32);
await run("away.commit  (buyer's chain: money in)", buyer.exec(away, "commit(bytes32,uint64)", [OID, FAR], { value: 2n * 10n ** 17n }));
await run("home.approve (seller's chain)", c.exec(nft, "approve(address,uint256)", [home, 2]));
await run("home.list    (seller's chain: asset in)", c.exec(home, "list(bytes32,address,uint256,uint96,uint64)",
  [OID, nft, 2, 2n * 10n ** 17n, FAR]));
await run("home.settle  (SELLER'S CHAIN, run by the executor)", c.exec(home, "settle(bytes32,address,uint256)",
  [OID, buyer.from.toString(), 2n * 10n ** 17n]));

const OID2 = "0x" + "88".repeat(32);
await c.exec(nft, "approve(address,uint256)", [home, 3]);
await run("home.list    (a second lot, warm slots)", c.exec(home, "list(bytes32,address,uint256,uint96,uint64)",
  [OID2, nft, 3, 10n ** 17n, PAST]));
await run("home.reclaim (nothing ever arrived)", c.exec(home, "reclaim(bytes32)", [OID2]));

console.log("");
for (const [k, v] of Object.entries(G)) console.log(`    ${k.padEnd(46)} ${String(v).padStart(9)} gas`);
console.log(`\n    owner of #2 after settle: ${decAddr(await c.read(nft, "ownerOf(uint256)", [2]))}`);
console.log(`    buyer was:                ${buyer.from.toString()}`);
