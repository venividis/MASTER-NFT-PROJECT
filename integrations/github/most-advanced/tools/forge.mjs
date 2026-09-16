#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · running the Foundry suite without Foundry

  Seventy-three Solidity test functions have been sitting in test/ since the
  beginning, and not one of them had ever executed. Foundry's installer is
  unreachable from this environment, and so are GitHub, codeload and the
  crates.io API — there is no route to it. The suite type-checked against a
  stub, which was worth something, and the stub's assertions were empty
  `pure` functions, which was worth nothing at all: every assertEq in the
  file compiled to a no-op.

  So this runs them. The pieces needed turn out to be small:

    · a cheatcode precompile at the address forge-std points `vm` at, which
      is 0x7109709ECfa91a80626fF3989D68f67F5b1DD12D — keccak("hevm cheat
      code") truncated to twenty bytes;
    · a beforeMessage hook, so `prank` can rewrite the caller of the next
      call the test makes;
    · an afterMessage hook, so `expectRevert` can turn a revert into a
      success at the call boundary, which is the only way the calling
      contract survives to run its next line — and a second check against
      the test's own revert, because an `internal` library reverting has no
      call frame to catch it at;
    · a block whose header is not frozen, so `warp` can move the clock in
      the middle of a call that is already executing.

  Four more things were needed that were not obvious until each one broke:

    · code on the cheat address. The precompile is what runs, but Solidity
      guards every external call to a typed interface with EXTCODESIZE and
      reverts — with no data, from inside setUp — when the target is empty.
      Foundry etches a byte there for exactly this reason;
    · deal and etch applied at the moment they are called, which means an
      async precompile. Recording the intention and applying it later is
      indistinguishable from not applying it, since setUp etches the 6551
      registry and the next line derives an account against it;
    · a swallowed revert must hand the caller a block of zeroes, not an
      empty buffer, or Solidity's ABI decoder reverts on the return of the
      call the test just proved reverts correctly;
    · the swallow pinned to the frame the cheatcode was issued in front of,
      because a revert two frames down that the caller catches is not the
      revert the test asked about.

  And a self-check, described where it is defined, which exists because
  for one afternoon this runner reported 72 passing tests while executing
  no EVM code at all.

  What this is NOT: forge. There is no invariant campaign, no coverage
  guidance, no gas snapshotting, no trace on failure beyond a revert
  string. It runs the stated tests and reports which pass. When Foundry is
  reachable, run the real thing — it does strictly more.

  It also writes its own minimal forge-std into lib/ when none is present,
  so `forge install` overwrites it and both paths work.

    node tools/forge.mjs
    node tools/forge.mjs --runs 64 --seed 3      fuzz depth
    node tools/forge.mjs --match seal            only matching names
    FORGE_TRACE=1 node tools/forge.mjs           message-level trace
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { createVM } from "@ethereumjs/vm";
import { Common, Mainnet, Hardfork } from "@ethereumjs/common";
import { createBlock } from "@ethereumjs/block";
import {
  Account, createAddressFromString, hexToBytes, bytesToHex
} from "@ethereumjs/util";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { ROOT, compile, artifact } from "./compile.mjs";

/*──────────────── dials ────────────────*/
const arg = (n, d) => {
  const i = process.argv.indexOf("--" + n);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const RUNS = Number(arg("runs", 24));
const SEED = BigInt(arg("seed", "20260727"));
const MATCH = arg("match", "");

let s0 = SEED ^ 0x9e3779b97f4a7c15n, s1 = SEED * 0xbf58476d1ce4e5b9n + 1n;
const M64 = (1n << 64n) - 1n;
const next = () => {
  s1 = (s1 ^ (s1 << 13n)) & M64; s1 ^= s1 >> 7n; s1 = (s1 ^ (s1 << 17n)) & M64;
  s0 = (s0 + 0x9e3779b97f4a7c15n) & M64;
  return (s0 ^ s1) & M64;
};
const rand = (bits) => {
  let v = 0n;
  for (let i = 0; i < Math.ceil(bits / 64); i++) v = (v << 64n) | next();
  return v & ((1n << BigInt(bits)) - 1n);
};

/*──────────────── the forge-std this runner needs ────────────────*/
/*  Written only when none is installed. The assertions are real — the stub
    this replaces had them as empty `pure` bodies, so a suite that
    "type-checked" was a suite in which every assertEq did nothing.       */
const STD = path.join(ROOT, "lib", "forge-std", "src");
function provisionStd() {
  if (fs.existsSync(path.join(STD, "Test.sol")) &&
      fs.readFileSync(path.join(STD, "Test.sol"), "utf8").includes("REAL-ASSERTIONS-SHIM")) {
    return "reused";
  }
  if (fs.existsSync(path.join(STD, "Test.sol"))) return "found an installed forge-std";
  fs.mkdirSync(STD, { recursive: true });

  const cmp = (t) => `
    function assertEq(${t} a, ${t} b) internal pure { if (a != b) revert("assertEq"); }
    function assertEq(${t} a, ${t} b, string memory m) internal pure { if (a != b) revert(m); }`;

  fs.writeFileSync(path.join(STD, "Vm.sol"), `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function warp(uint256) external;
    function roll(uint256) external;
    function deal(address, uint256) external;
    function etch(address, bytes calldata) external;
    function prevrandao(bytes32) external;
    function assume(bool) external;
    function readFile(string calldata) external view returns (string memory);
    function envAddress(string calldata) external view returns (address);
    function toString(uint256) external pure returns (string memory);
    function startBroadcast() external;
    function stopBroadcast() external;
}
`);
  fs.writeFileSync(path.join(STD, "Test.sol"), `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// REAL-ASSERTIONS-SHIM — written by tools/forge.mjs when forge-std is not
// installed. Every assertion below actually reverts on failure, which the
// previous type-check-only stub did not.
import {Vm} from "./Vm.sol";

library console {
    function log(string memory) internal pure {}
    function log(string memory, uint256) internal pure {}
    function log(string memory, address) internal pure {}
}

abstract contract Test {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
${cmp("uint256")}${cmp("int256")}${cmp("address")}${cmp("bool")}${cmp("bytes32")}${cmp("bytes6")}
    function assertEq(bytes memory a, bytes memory b) internal pure {
        if (keccak256(a) != keccak256(b)) revert("assertEq(bytes)");
    }
    function assertEq(bytes memory a, bytes memory b, string memory m) internal pure {
        if (keccak256(a) != keccak256(b)) revert(m);
    }
    function assertEq(string memory a, string memory b) internal pure {
        if (keccak256(bytes(a)) != keccak256(bytes(b))) revert("assertEq(string)");
    }
    function assertGe(uint256 a, uint256 b) internal pure { if (a < b) revert("assertGe"); }
    function assertGe(uint256 a, uint256 b, string memory m) internal pure { if (a < b) revert(m); }
    function assertGt(uint256 a, uint256 b) internal pure { if (a <= b) revert("assertGt"); }
    function assertGt(uint256 a, uint256 b, string memory m) internal pure { if (a <= b) revert(m); }
    function assertLe(uint256 a, uint256 b) internal pure { if (a > b) revert("assertLe"); }
    function assertLe(uint256 a, uint256 b, string memory m) internal pure { if (a > b) revert(m); }
    function assertLt(uint256 a, uint256 b) internal pure { if (a >= b) revert("assertLt"); }
    function assertLt(uint256 a, uint256 b, string memory m) internal pure { if (a >= b) revert(m); }
    function assertTrue(bool a) internal pure { if (!a) revert("assertTrue"); }
    function assertTrue(bool a, string memory m) internal pure { if (!a) revert(m); }
    function assertFalse(bool a) internal pure { if (a) revert("assertFalse"); }
    function assertFalse(bool a, string memory m) internal pure { if (a) revert(m); }
    function assertApproxEqAbs(int256 a, int256 b, uint256 d) internal pure {
        int256 diff = a > b ? a - b : b - a;
        if (uint256(diff) > d) revert("assertApproxEqAbs");
    }
    function assertApproxEqAbs(int256 a, int256 b, uint256 d, string memory m) internal pure {
        int256 diff = a > b ? a - b : b - a;
        if (uint256(diff) > d) revert(m);
    }
    /// @dev forge-std's own arithmetic, so a bounded fuzz input lands in range.
    function bound(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) {
        if (lo > hi) revert("bound: lo > hi");
        if (x >= lo && x <= hi) return x;
        uint256 span = hi - lo + 1;
        return lo + (x % span);
    }
    function bound(int256 x, int256 lo, int256 hi) internal pure returns (int256) {
        if (lo > hi) revert("bound: lo > hi");
        if (x >= lo && x <= hi) return x;
        uint256 span = uint256(hi - lo) + 1;
        /*  The whole signed range is reinterpreted as unsigned before the
            modulus. Negating first is what the obvious version does, and it
            panics on int256.min, whose negation does not fit — which a fuzzer
            reaches by drawing one word of all ones. Now that signed types are
            drawn signed, it reaches it often.                              */
        uint256 off;
        unchecked { off = uint256(x) % span; }
        return lo + int256(off);
    }
}
`);
  fs.writeFileSync(path.join(STD, "Script.sol"), `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Vm} from "./Vm.sol";
library console {
    function log(string memory) internal pure {}
    function log(string memory, uint256) internal pure {}
    function log(string memory, address) internal pure {}
    function log(string memory, string memory) internal pure {}
}
abstract contract Script {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
}
`);
  fs.writeFileSync(path.join(STD, "StdJson.sol"), `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
library stdJson {
    function readString(string memory, string memory) internal pure returns (string memory) { return ""; }
    function readUint(string memory, string memory) internal pure returns (uint256) { return 0; }
    function readBytes(string memory, string memory) internal pure returns (bytes memory) { return ""; }
}
`);
  return "wrote a minimal forge-std into lib/";
}

/*──────────────── the cheatcode address ────────────────*/
const VM_ADDR = "0x" + Buffer.from(keccak256(Buffer.from("hevm cheat code", "utf8")))
  .toString("hex").slice(24);

const sel = (sig) =>
  "0x" + Buffer.from(keccak256(Buffer.from(sig, "utf8"))).toString("hex").slice(0, 8);

/*  Every cheatcode the suite uses, and nothing it does not. A runner that
    silently accepts an unimplemented cheatcode is a runner that reports
    green for a test it did not run, so an unknown selector is a failure. */
const CHEATS = {
  [sel("prank(address)")]: "prank",
  [sel("startPrank(address)")]: "startPrank",
  [sel("stopPrank()")]: "stopPrank",
  [sel("expectRevert()")]: "expectRevert",
  [sel("expectRevert(bytes4)")]: "expectRevert4",
  [sel("expectRevert(bytes)")]: "expectRevertBytes",
  [sel("warp(uint256)")]: "warp",
  [sel("roll(uint256)")]: "roll",
  [sel("deal(address,uint256)")]: "deal",
  [sel("etch(address,bytes)")]: "etch",
  [sel("prevrandao(bytes32)")]: "prevrandao",
  [sel("assume(bool)")]: "assume"
};

/*═══════════════════ the runner ═══════════════════*/
console.log("\n  \x1b[1mIPSEITY · the Foundry suite, without Foundry\x1b[0m");
console.log(`  \x1b[2mcheatcodes at ${VM_ADDR}\x1b[0m`);
console.log(`  \x1b[2m${provisionStd()}\x1b[0m`);

const out = compile({ quiet: true, dirs: ["src", "test", "lib/forge-std/src"] });
const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });

const GENESIS = 1_733_000_000n;
let PASS = 0, FAIL = 0;
const failures = [];

/*  One VM per test function. Foundry gives every test a fresh fork of the
    post-setUp state; building a whole new world each time is slower and
    exactly equivalent, and this suite is small enough that it does not
    matter. */
async function freshWorld() {
  const state = {
    prank: null, prankPersistent: false, prankUsed: false,
    expect: null, expectSatisfied: false, assumeFailed: false,
    unknownCheat: null
  };

  const block = createBlock(
    { header: { number: 21_000_000n, timestamp: GENESIS, gasLimit: 4_000_000_000n,
                baseFeePerGas: 7n, difficulty: 0n, mixHash: "0x" + "5e".repeat(32) } },
    { common, skipConsensusFormatValidation: true, freeze: false }
  );

  const cheat = {
    address: createAddressFromString(VM_ADDR),
    /*  async, because deal and etch write state and the state manager is
        async. A precompile that only *records* what it was asked to do is
        a cheatcode that silently does nothing — see the note above deal. */
    function: async (input) => {
      const sm = input.stateManager;
      const data = bytesToHex(input.data);
      const s = data.slice(0, 10);
      const word = (i) => "0x" + data.slice(10 + i * 64, 10 + (i + 1) * 64);
      const name = CHEATS[s];
      const done = { executionGasUsed: 0n, returnValue: new Uint8Array() };

      switch (name) {
        case "prank":
          state.prank = "0x" + word(0).slice(-40); state.prankPersistent = false;
          state.prankUsed = false; return done;
        case "startPrank":
          state.prank = "0x" + word(0).slice(-40); state.prankPersistent = true; return done;
        case "stopPrank":
          state.prank = null; state.prankPersistent = false; return done;
        case "expectRevert":
          state.expect = { any: true }; state.expectSatisfied = false; return done;
        case "expectRevert4":
          state.expect = { data: word(0).slice(0, 10) }; state.expectSatisfied = false; return done;
        case "expectRevertBytes":
          state.expect = { any: true }; state.expectSatisfied = false; return done;
        case "warp":
          block.header.timestamp = BigInt(word(0)); return done;
        /*  The same unfrozen header the clock moves in. A protocol whose
            archive is a chain of block numbers has tests that need more
            than one block to happen in.                                 */
        case "roll":
          block.header.number = BigInt(word(0)); return done;
        case "prevrandao":
          // prevRandao is a getter over mixHash post-merge; setting the
          // storage field is what moves what PREVRANDAO reads.
          block.header.mixHash = hexToBytes(word(0));
          return done;
        case "assume":
          if (BigInt(word(0)) === 0n) state.assumeFailed = true;
          return done;

        /*  deal and etch have to land in state here and now. Recording an
            intention and applying it later is the same as not applying it:
            setUp() etches the 6551 registry and the very next line derives
            an account against it.                                        */
        case "deal": {
          const a = createAddressFromString("0x" + word(0).slice(-40));
          const acc = (await sm.getAccount(a)) ?? new Account();
          acc.balance = BigInt(word(1));
          await sm.putAccount(a, acc);
          return done;
        }
        case "etch": {
          const a = createAddressFromString("0x" + word(0).slice(-40));
          const off = Number(BigInt(word(1))) * 2 + 10;      // tail is bytes
          const len = Number(BigInt("0x" + data.slice(off, off + 64)));
          const code = hexToBytes("0x" + data.slice(off + 64, off + 64 + len * 2));
          if (!(await sm.getAccount(a))) await sm.putAccount(a, new Account());
          await sm.putCode(a, code);
          return done;
        }
        default:
          state.unknownCheat = s;
          return { executionGasUsed: 0n, returnValue: new Uint8Array(), exceptionError: null };
      }
    }
  };

  /*  Both limits off, exactly as `forge test` runs. A test contract that
      deploys the whole collection in setUp() has initcode far past
      EIP-3860's 49,152 bytes and runtime past EIP-170's 24,576 — neither is
      a property of the contracts under test, both are properties of the
      harness. The real EIP-170 ceiling is asserted separately, against the
      deployed artefacts, in the README's size table.                       */
  const vm = await createVM({
    common,
    evmOpts: {
      customPrecompiles: [cheat],
      allowUnlimitedContractSize: true,
      allowUnlimitedInitCodeSize: true
    }
  });

  /*  The cheat address needs code on it, even though the precompile is what
      actually runs. Solidity guards every external call to a typed
      interface with EXTCODESIZE and reverts — with no data, from inside
      setUp, giving nothing to read — when the target is empty. Foundry
      etches a byte there for exactly this reason. Precompile dispatch is
      checked before code, so the byte is never executed.                 */
  const vmAddr = createAddressFromString(VM_ADDR);
  await vm.stateManager.putAccount(vmAddr, new Account());
  await vm.stateManager.putCode(vmAddr, hexToBytes("0x00"));

  /*  prank rewrites the caller of the next message the test sends. It has
      to happen here rather than in the precompile, because a precompile
      cannot reach forward into a call that has not been made yet.        */
  vm.evm.events.on("beforeMessage", (msg) => {
    if (!state.prank || msg.depth !== 1) return;
    if (msg.to && msg.to.toString().toLowerCase() === VM_ADDR.toLowerCase()) return;
    msg.caller = createAddressFromString(state.prank);
    if (!state.prankPersistent) { state.prank = null; state.prankUsed = true; }
  });

  /*  expectRevert turns a revert into a success at the call boundary. The
      calling contract has to survive to run its next line, and the only
      place that decision can be made is where the result crosses back.

      Two details that are easy to get wrong, and both were:

      The depth. A revert two frames down that the caller catches is not
      the revert the test asked about, so the swallow is pinned to the
      frame the cheatcode was issued in front of — depth 1, a call made by
      the test itself. afterMessage carries no depth, so beforeMessage
      keeps the stack.

      The return data. Handing the caller success with nothing attached
      makes Solidity's ABI decoder revert on the empty buffer, with no
      data, from the line after the one under test — which reads as the
      test failing and is really the harness lying. Foundry returns a
      block of zeroes for this; so does this. A zero word decodes as 0 for
      any static type, and as offset 0 / length 0 for any dynamic one.  */
  const DUMMY = new Uint8Array(8192);
  const depths = [];
  vm.evm.events.on("beforeMessage", (msg) => { depths.push(msg.depth); });
  vm.evm.events.on("afterMessage", (res) => {
    const d = depths.pop();
    if (!state.expect || !res.execResult) return;
    if (d !== 1) return;
    if (!res.execResult.exceptionError) return;
    const got = bytesToHex(res.execResult.returnValue || new Uint8Array());
    if (state.expect.data && !got.startsWith(state.expect.data)) return;
    res.execResult.exceptionError = undefined;
    res.execResult.returnValue = DUMMY;
    state.expect = null;
    state.expectSatisfied = true;
  });

  if (process.env.FORGE_TRACE) {
    vm.evm.events.on("beforeMessage", (m) => console.log("  ->", "d"+m.depth,
      m.to ? "call "+m.to.toString().slice(0,12) : "create", "gas", String(m.gasLimit),
      "data", bytesToHex(m.data||new Uint8Array()).slice(0,12)));
    vm.evm.events.on("afterMessage", (r) => console.log("  <-",
      r.execResult && r.execResult.exceptionError ? "ERR "+r.execResult.exceptionError.error : "ok",
      "gas", String(r.execResult && r.execResult.executionGasUsed),
      "ret", bytesToHex((r.execResult&&r.execResult.returnValue)||new Uint8Array()).slice(0,20)));
  }

  return { vm, block, state };
}

const DEPLOYER = createAddressFromString("0x" + "11".repeat(20));

async function deploy(vm, block, bytecode, args = "") {
  const res = await vm.evm.runCall({
    caller: DEPLOYER, origin: DEPLOYER,
    data: hexToBytes(bytecode + args),
    gasLimit: 3_000_000_000n, value: 0n, block
  });
  if (res.execResult.exceptionError) {
    throw new Error("deploy: " + res.execResult.exceptionError.error);
  }
  return res.createdAddress;
}

/*  Fuzz arguments, generated from the ABI. bound() inside the test does the
    narrowing; the generator's job is to hand over hostile 256-bit values
    and let the test say what it can accept.

    Dynamic types get real head/tail encoding, because "we don't generate
    that shape" is a test that never ran wearing the costume of one that
    passed. Lengths are drawn from the boundaries first — 0, 1, 31, 32, 33,
    then a long one — since that is where a byte-copier breaks, not at 6144.
    A test that refuses a length says so with vm.assume, and the run is
    discarded exactly as forge would discard it.                          */
const W = (v) => BigInt(v).toString(16).padStart(64, "0");
const LENGTHS = [0, 1, 31, 32, 33, 63, 64, 65, 96, 127, 255, 1000, 8000];

function encDynamic(t) {                      // returns hex of a tail blob
  if (t === "bytes" || t === "string") {
    const n = LENGTHS[Number(next() % BigInt(LENGTHS.length))];
    let body = "";
    for (let i = 0; i < n; i++) {
      // string must stay valid UTF-8 or solc's abi.decode is within rights
      // to hand back something the test never meant to receive.
      body += (t === "string" ? 0x20 + Number(next() % 95n)
                              : Number(next() % 256n)).toString(16).padStart(2, "0");
    }
    return W(n) + body.padEnd(Math.ceil(n / 32) * 64, "0");
  }
  const m = t.match(/^(.*)\[(\d*)\]$/);
  if (!m) return null;
  const [, base, fixed] = m;
  const n = fixed === "" ? Number(next() % 5n) : Number(fixed);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const p = encOne(base);
    if (p === null) return null;
    parts.push(p);
  }
  const dyn = isDynamic(base);
  let head = "", tail = "";
  if (dyn) {
    let off = n * 32;
    for (const p of parts) { head += W(off); off += p.length / 2; }
    tail = parts.join("");
  } else head = parts.join("");
  return (fixed === "" ? W(n) : "") + head + tail;
}

const isDynamic = (t) =>
  t === "bytes" || t === "string" || /\[\]$/.test(t) ||
  (/\[\d+\]$/.test(t) && isDynamic(t.replace(/\[\d+\]$/, "")));

function encOne(t) {                          // one value, head-form if static
  if (isDynamic(t)) return encDynamic(t);
  if (t === "bool") return W(next() & 1n);
  if (t === "address") return W(rand(160));
  /*  A signed type is not an unsigned one with a smaller range.

      This used to be `W(rand(bits))` for both, and the consequence was
      worse than "negative numbers were never tried". For `int24` it drew a
      24-bit *unsigned* value, so:

        · every value above 8388607 is not a valid int24 at all, and solc's
          decoder rejects it by reverting with no returndata — which the
          runner reported as a failing test with no message, on a test that
          was fine;
        · the half of the domain below zero was never generated once. Every
          tick in this collection is negative for any pair priced below
          parity, which is most of them, so the fuzzers over tick maths
          were exercising the easy half and reporting full coverage.

      A signed draw takes the same random bits, reads the top one as a sign,
      and sign-extends to a full word — which is what the ABI expects and
      what forge does.                                                    */
  if (/^u?int(\d+)?$/.test(t)) {
    const bits = Number((t.match(/\d+/) || [256])[0]);
    let v = rand(bits);
    if (t[0] === "i") {
      const span = 1n << BigInt(bits);
      if (v >= span >> 1n) v -= span;              // two's complement
      if (v < 0n) v += 1n << 256n;                 // sign-extended to 256
    }
    return W(v);
  }
  if (/^bytes(\d+)$/.test(t)) {
    const n = Number(t.match(/\d+/)[0]);
    return rand(n * 8).toString(16).padStart(n * 2, "0").padEnd(64, "0");
  }
  if (/^(.*)\[(\d+)\]$/.test(t)) return encDynamic(t);
  return null;                                // tuples: still not generated
}

function fuzzArgs(inputs) {
  const parts = inputs.map((i) => encOne(i.type));
  if (parts.some((p) => p === null)) return null;
  let off = inputs.length * 32, head = "", tail = "";
  inputs.forEach((inp, i) => {
    if (isDynamic(inp.type)) {
      head += W(off); off += parts[i].length / 2; tail += parts[i];
    } else head += parts[i];
  });
  return head + tail;
}

const decodeRevert = (ret) => {
  const h = String(ret).replace(/^0x/, "");
  if (h.startsWith("08c379a0")) {
    try {
      const len = Number(BigInt("0x" + h.substr(72, 64)));
      return Buffer.from(h.substr(136, len * 2), "hex").toString("utf8");
    } catch { return "Error(string)"; }
  }
  if (h.length >= 8) return "0x" + h.slice(0, 8);
  return "no data";
};

/*══════════════ does the runner run anything? ══════════════

  This exists because for one afternoon it did not, and said 72 passed.

  The bug was a single line: the test contract was funded with
  `putAccount(addr, new Account(0n, 1e24))`, and a fresh Account carries a
  null codeHash, so funding the contract erased it. Every subsequent call
  hit an empty account, returned success having executed nothing, and was
  counted as a pass. Seventy-two green ticks, no EVM.

  Nothing in the suite could have caught that, because the suite was what
  was not running. So the check has to sit outside it and be about the
  harness rather than the contracts: a probe whose runtime is three bytes
  of REVERT, and the demand that the runner see it revert, having burned
  gas to do so. The gas is the part that matters — an empty account also
  "does not revert", and only the gas counter tells the two apart.

  Each cheatcode that writes state is checked the same way: not that the
  call was accepted, but that the state moved.                          */
const REVERTER = "0x6460006000fd6000526005601bf3";   // runtime: PUSH1 0 PUSH1 0 REVERT
const STOPPER  = "0x60016000f3";                     // runtime: STOP (one byte, 0x00)

async function selfCheck() {
  const bad = [];
  const { vm, block, state } = await freshWorld();
  const call = (to, data = "0x") => vm.evm.runCall({
    to, caller: DEPLOYER, origin: DEPLOYER, data: hexToBytes(data),
    gasLimit: 100_000_000n, value: 0n, block
  });

  await vm.stateManager.putAccount(DEPLOYER, new Account(0n, 10n ** 24n));

  const rev = await deploy(vm, block, REVERTER);
  const r1 = await call(rev, "0xdeadbeef");
  if (!r1.execResult.exceptionError) bad.push("a contract that only reverts did not revert");
  if (r1.execResult.executionGasUsed === 0n) {
    bad.push("the call burned no gas — the account has no code and nothing ran");
  }

  const stop = await deploy(vm, block, STOPPER);
  if ((await vm.stateManager.getCode(stop)).length === 0) {
    bad.push("a deployed contract has no code in state");
  }

  if ((await vm.stateManager.getCode(createAddressFromString(VM_ADDR))).length === 0) {
    bad.push("the cheat address has no code — Solidity's EXTCODESIZE guard " +
             "will revert every vm.* call with no data");
  }

  // etch, and then read the code back out rather than trusting the return
  const target = "0x" + "ab".repeat(20);
  await call(createAddressFromString(VM_ADDR),
    sel("etch(address,bytes)") + target.slice(2).padStart(64, "0") +
    W(64) + W(3) + "600000".padEnd(64, "0"));
  if ((await vm.stateManager.getCode(createAddressFromString(target))).length !== 3) {
    bad.push("vm.etch was accepted but no code landed");
  }

  await call(createAddressFromString(VM_ADDR),
    sel("deal(address,uint256)") + target.slice(2).padStart(64, "0") + W(12345));
  const acc = await vm.stateManager.getAccount(createAddressFromString(target));
  if (!acc || acc.balance !== 12345n) bad.push("vm.deal was accepted but no balance moved");

  const t0 = block.header.timestamp;
  await call(createAddressFromString(VM_ADDR), sel("warp(uint256)") + W(t0 + 999n));
  if (block.header.timestamp !== t0 + 999n) bad.push("vm.warp did not move the clock");

  const n0 = block.header.number;
  await call(createAddressFromString(VM_ADDR), sel("roll(uint256)") + W(n0 + 7n));
  if (block.header.number !== n0 + 7n) bad.push("vm.roll did not move the block number");

  await call(createAddressFromString(VM_ADDR), sel("assume(bool)") + W(0));
  if (!state.assumeFailed) bad.push("vm.assume(false) did not mark the run discarded");

  /*  The generator, checked against the two ways it was silently wrong.

      A signed parameter must be *drawn* signed. The version before this
      drew `int24` as a 24-bit unsigned value, which meant every draw above
      8388607 was not a valid int24 and solc's decoder rejected it with an
      empty revert — reported as a failing test with no message — while the
      entire negative half of the domain was never generated at all. Every
      tick in this collection is negative for a pair priced below parity,
      so the tick fuzzers were covering the easy half and saying so.

      Both halves are checked here rather than in a test, because this is a
      property of the harness and a harness cannot be trusted to notice its
      own blind spot from inside a suite it is generating.                */
  {
    let neg = 0, tooBig = 0;
    const LIMIT = (1n << 23n) - 1n;                      // int24 max
    for (let i = 0; i < 256; i++) {
      const word = BigInt("0x" + encOne("int24"));
      const signed = word >= 1n << 255n ? word - (1n << 256n) : word;
      if (signed < 0n) neg++;
      if (signed > LIMIT || signed < -(LIMIT + 1n)) tooBig++;
    }
    if (tooBig) bad.push(
      `${tooBig} of 256 generated int24 values are not valid int24 — solc's ` +
      "decoder rejects them with an empty revert, which reads as a failing test");
    if (neg < 64) bad.push(
      `only ${neg} of 256 generated int24 values were negative — a signed ` +
      "fuzz parameter is being drawn unsigned, so half the domain is never tried");
    let uNeg = 0;
    for (let i = 0; i < 64; i++) {
      if (BigInt("0x" + encOne("uint24")) >= 1n << 255n) uNeg++;
    }
    if (uNeg) bad.push("an unsigned parameter was sign-extended");
  }

  if (bad.length) {
    console.log("\n  \x1b[31mthe runner is not running anything\x1b[0m");
    for (const b of bad) console.log("    \x1b[31m· " + b + "\x1b[0m");
    console.log("\n  \x1b[2mRefusing to report on the suite. A green tick from a harness" +
                "\n  that does not execute is worse than no harness at all.\x1b[0m\n");
    process.exit(2);
  }
}
await selfCheck();

/*══════════════ run every test contract ══════════════*/
const files = fs.readdirSync(path.join(ROOT, "test"))
  .filter((f) => f.endsWith(".t.sol")).map((f) => "test/" + f);

for (const file of files) {
  const contracts = out.contracts[file] || {};
  for (const [cname, c] of Object.entries(contracts)) {
    const abi = c.abi || [];
    const tests = abi.filter((f) =>
      f.type === "function" && /^test/.test(f.name || "") &&
      (!MATCH || f.name.includes(MATCH)));
    if (!tests.length) continue;

    console.log(`\n  \x1b[1m${cname}\x1b[0m  \x1b[2m${file}\x1b[0m`);
    const hasSetUp = abi.some((f) => f.name === "setUp");

    for (const t of tests) {
      const isFuzz = t.inputs.length > 0;
      const runs = isFuzz ? RUNS : 1;
      let failed = null, ran = 0;

      for (let r = 0; r < runs && !failed; r++) {
        let world;
        try { world = await freshWorld(); }
        catch (e) { failed = "world: " + e.message; break; }
        const { vm, block, state } = world;

        await vm.stateManager.putAccount(DEPLOYER, new Account(0n, 10n ** 24n));
        let addr;
        try {
          addr = await deploy(vm, block, artifact(out, file, cname).bytecode);
        } catch (e) { failed = e.message; break; }
        /*  Fund the test contract without erasing it. `new Account(...)`
            carries a null codeHash, so putAccount on a freshly deployed
            address wipes the code and every subsequent call returns
            success having executed nothing — a suite that reports green
            without running. Read, adjust the one field, write back.     */
        const tc = (await vm.stateManager.getAccount(addr)) ?? new Account();
        tc.balance = 10n ** 24n;
        await vm.stateManager.putAccount(addr, tc);

        if (hasSetUp) {
          const s = await vm.evm.runCall({
            to: addr, caller: DEPLOYER, origin: DEPLOYER,
            data: hexToBytes(sel("setUp()")), gasLimit: 3_000_000_000n, value: 0n, block
          });
          if (s.execResult.exceptionError) {
            failed = "setUp reverted: " +
              decodeRevert(bytesToHex(s.execResult.returnValue || new Uint8Array()));
            break;
          }
        }

        const sig = t.name + "(" + t.inputs.map((i) => i.type).join(",") + ")";
        const args = isFuzz ? fuzzArgs(t.inputs) : "";
        if (args === null) { failed = "SKIP: dynamic fuzz argument"; break; }

        const res = await vm.evm.runCall({
          to: addr, caller: DEPLOYER, origin: DEPLOYER,
          data: hexToBytes(sel(sig) + args), gasLimit: 3_000_000_000n, value: 0n, block
        });
        ran++;
        if (state.unknownCheat) {
          failed = "unimplemented cheatcode " + state.unknownCheat; break;
        }
        if (state.assumeFailed) { ran--; continue; }   // forge discards the run
        if (res.execResult.exceptionError) {
          const got = bytesToHex(res.execResult.returnValue || new Uint8Array());

          /*  A revert with no call frame around it.

              expectRevert is handled at the message boundary, which is
              where it has to be for the common case: the calling contract
              must survive to run its next line. But a `revert` inside an
              `internal` library function is not a message at all — it is
              the test's own frame unwinding — so there is no boundary to
              catch it at, and an expectation left standing looked exactly
              like a test that failed.

              That is the worst shape a harness gap can take: the assertion
              was right, the code was right, and the report said otherwise.
              So an outstanding expectation is also matched against the
              test's own revert.                                          */
          if (state.expect && (!state.expect.data || got.startsWith(state.expect.data))) {
            state.expect = null;
            state.expectSatisfied = true;
            continue;
          }
          failed = decodeRevert(got);
          if (isFuzz) failed += `  (run ${r + 1}, seed ${SEED})`;
          break;
        }
      }

      if (failed && failed.startsWith("SKIP")) {
        console.log(`  \x1b[33m—\x1b[0m ${t.name}  \x1b[2m${failed.slice(6)}\x1b[0m`);
        continue;
      }
      if (failed) {
        FAIL++; failures.push({ cname, name: t.name, why: failed });
        console.log(`  \x1b[31m✗\x1b[0m ${t.name}\n      \x1b[31m${failed}\x1b[0m`);
      } else {
        PASS++;
        console.log(`  \x1b[32m✓\x1b[0m ${t.name}${isFuzz ? `  \x1b[2m${ran} runs\x1b[0m` : ""}`);
      }
    }
  }
}

console.log(`\n  ${FAIL === 0 ? "\x1b[32m" : "\x1b[31m"}${PASS} passed, ${FAIL} failed\x1b[0m`);
if (FAIL) {
  console.log("  \x1b[2mthis runner is not forge: no invariant campaigns, no coverage");
  console.log("  guidance, no traces. Run the real one when it is reachable.\x1b[0m");
}
console.log("");
process.exit(FAIL === 0 ? 0 : 1);
