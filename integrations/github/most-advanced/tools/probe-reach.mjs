#!/usr/bin/env node
/* SCRATCH PROBE — what a sealed Reach can and cannot do with a third-party NFT/1155. */
import { compile, artifact } from "./compile.mjs";
import * as evm from "./evm.mjs";
import { Chain, enc, decUint, decAddr, encodeAddressArg } from "./evm.mjs";
import { createAddressFromString } from "@ethereumjs/util";

const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();
const me = c.from.toString();
const T0 = evm.GENESIS_TIME;
let pass = 0, fail = 0;
const ok = (n, cond, d) => { cond ? pass++ : fail++;
  console.log(`  ${cond ? "\x1b[32mYES \x1b[0m" : "\x1b[31mNO  \x1b[0m"} ${n}${d ? "\n         " + d : ""}`); };
const reverts = async (p, n) => { try { await p; ok(n + " -> ALLOWED", false); return null; }
  catch (e) { ok(n + " -> REFUSED", true, String(e.message).slice(0, 160)); return e; } };
const allows = async (p, n) => { try { await p; ok(n + " -> ALLOWED", true); return true; }
  catch (e) { ok(n + " -> REFUSED", false, String(e.message).slice(0, 200)); return false; } };

const tmpReg = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode);
await c.vm.stateManager.putCode(createAddressFromString(REGISTRY),
  await c.vm.stateManager.getCode(createAddressFromString(tmpReg)));
const impl = await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode);
const gripImpl = await c.deploy(A("src/GripVault.sol", "GripVault").bytecode);
const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, "0".repeat(64));
const sigil = await c.deploy(A("src/Sigil.sol", "Sigil").bytecode);
const renderer = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  encodeAddressArg(engine) + encodeAddressArg(sigil));
const nft = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(renderer) + encodeAddressArg(impl) + encodeAddressArg(gripImpl) +
  (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"));

await c.exec(nft, "mint()", [], { value: 10n ** 16n });
const reach = decAddr(await c.read(nft, "account(uint256)", [1]));
await c.exec(nft, "embody(uint256)", [1]);
console.log("\n  \x1b[1mHOLDING\x1b[0m");
ok("Reach embodied at " + reach, (await c.codeSize(reach)) > 0);

const foreign = await c.deploy(A("test/mocks/MockERC721.sol", "MockERC721").bytecode);
await c.exec(foreign, "mint(address,uint256)", [reach, 7]);
await c.exec(foreign, "mint(address,uint256)", [reach, 8]);
ok("a THIRD-PARTY ERC-721 lands in the Reach with no permission asked",
   decAddr(await c.read(foreign, "ownerOf(uint256)", [7])).toLowerCase() === reach.toLowerCase());

const via = (to, sig, args, opts = {}) =>
  c.exec(reach, "execute(address,uint256,bytes,uint8)",
    [to, 0, "0x" + enc(sig, args).replace(/^0x/, ""), 0], opts);

console.log("\n  \x1b[1mCALLING, UNSEALED\x1b[0m");
await allows(via(foreign, "setApprovalForAll(address,bool)", [me, true]),
  "unsealed: Reach calls an arbitrary function on a foreign NFT");

console.log("\n  \x1b[1mSEALING\x1b[0m");
await c.exec(reach, "guardNFT(address,uint256)", [foreign, 7]);
ok("guardNFT accepts a foreign ERC-721 by identity", true);
await c.exec(reach, "seal(uint64)", [T0 + 30n * 86400n]);
ok("sealed for 30 days", decUint(await c.read(reach, "isSealed()")) === 1n);

console.log("\n  \x1b[1mWHAT THE SEAL DOES TO A THIRD-PARTY NFT\x1b[0m");
await allows(via(foreign, "setApprovalForAll(address,bool)", [me, true]),
  "SEALED: approve-for-all on a foreign NFT that is NOT on the manifest");
await reverts(via(foreign, "transferFrom(address,address,uint256)", [reach, me, 7]),
  "SEALED: move the GUARDED piece #7 out");
await allows(via(foreign, "transferFrom(address,address,uint256)", [reach, me, 8]),
  "SEALED: move the UNGUARDED piece #8 out");
ok("  ...#8 really left", decAddr(await c.read(foreign, "ownerOf(uint256)", [8])).toLowerCase() === me.toLowerCase());

console.log("\n  \x1b[1mCAN THE SEAL SEE AN ERC-1155 AT ALL?\x1b[0m");
await reverts(c.exec(reach, "guardNFT(address,uint256)", [engine, 1]),
  "guardNFT on a contract with no ownerOf()  (stands in for ERC-1155)");
console.log("\n  \x1b[1mCALLING A FOREIGN CONTRACT WITH ARBITRARY CALLDATA, SEALED\x1b[0m");
await allows(via(nft, "record(uint256)", [1]).catch(e => { throw e; }),
  "SEALED: Reach calls a completely unrelated contract (the hub)");

console.log(`\n  ${pass} confirmed, ${fail} not\n`);

/*── the mitigation: put the FOREIGN COLLECTION on the ERC-20 manifest too ──
   balanceOf(address) on an ERC-721 is a COUNT, so _measure() succeeds and the
   selector allowlist starts applying to that contract. Does it hold? ──*/
console.log("\n  \x1b[1mMITIGATION: guard() the foreign COLLECTION as if it were an ERC-20\x1b[0m");
const f2 = await c.deploy(A("test/mocks/MockERC721.sol", "MockERC721").bytecode);
await c.exec(nft, "mint()", [], { value: 10n ** 16n });
const r2 = decAddr(await c.read(nft, "account(uint256)", [2]));
await c.exec(nft, "embody(uint256)", [2]);
await c.exec(f2, "mint(address,uint256)", [r2, 1]);
await c.exec(f2, "mint(address,uint256)", [r2, 2]);
const via2 = (to, sig, args) => c.exec(r2, "execute(address,uint256,bytes,uint8)",
  [to, 0, "0x" + enc(sig, args).replace(/^0x/, ""), 0]);
await c.exec(r2, "guard(address)", [f2]);
const um = await c.read(r2, "unmeasurable()");
ok("the collection is MEASURABLE on the manifest (balanceOf = a count)",
   decUint(um, 1) === 0n, "unmeasurable() length word = " + decUint(um, 1));
await c.exec(r2, "seal(uint64)", [T0 + 30n * 86400n]);
await reverts(via2(f2, "setApprovalForAll(address,bool)", [me, true]),
  "SEALED + guarded-as-ERC20: setApprovalForAll on the collection");
await reverts(via2(f2, "trade(uint256,uint256,address)", [1, 99, me]),
  "SEALED + guarded-as-ERC20: a bespoke swap word");
await allows(via2(f2, "transferFrom(address,address,uint256)", [r2, me, 1]),
  "SEALED + guarded-as-ERC20 ONLY: transferFrom one of two (count drops 2->1?)");
console.log("         count after:", decUint(await c.read(f2, "balanceOf(address)", [r2])));
console.log(`\n  ${pass} confirmed, ${fail} not\n`);
