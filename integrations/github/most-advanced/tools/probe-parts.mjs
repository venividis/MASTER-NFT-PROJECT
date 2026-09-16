#!/usr/bin/env node
/*  Measures probe/Parts.sol: deployed size, the FIELD gate, mint gas per
    kind, and read gas for partOf(). Delete freely.                      */
import { Chain, enc, sel, decUint } from "./evm.mjs";
import { compile, artifact } from "./compile.mjs";

const out = compile({ dirs: ["probe", "src/lib"], quiet: true });
const A = artifact(out, "probe/Parts.sol", "Parts");
const chain = await Chain.open();
const parts = await chain.deploy(A.bytecode, "", "deploy");
const dep = (A.deployed.length - 2) / 2;
console.log(`\n  Parts deployed runtime: ${dep} bytes  (${(dep/24576*100).toFixed(1)}% of EIP-170)`);
console.log(`  deploy gas: ${chain.gas.deploy}`);

const hexOf = (s) => "0x" + Buffer.from(s, "utf8").toString("hex");
const encMint = (kind, bodyHex) => {
  const b = bodyHex.replace(/^0x/, "");
  const len = b.length / 2;
  const pad = (len % 32) ? "0".repeat((32 - (len % 32)) * 2) : "";
  return sel("mint(uint8,bytes)")
    + kind.toString(16).padStart(64, "0")
    + (64).toString(16).padStart(64, "0")
    + len.toString(16).padStart(64, "0")
    + b + pad;
};

/* a real 4-D SDF body: a duocylinder cut by a rounded tesseract */
const FIELD = `float a=length(q.xy)-0.72;
float b=length(q.zw)-0.36;
float d=min(max(a,b),0.0)+length(max(vec2(a,b),0.0));
vec4 r=abs(q)-vec4(0.58);
float e=length(max(r,0.0))+min(max(max(r.x,r.y),max(r.z,r.w)),0.0);
return max(d,-e*0.85);`;
console.log(`  FIELD body under test: ${Buffer.byteLength(FIELD)} bytes`);

async function mint(kind, hex, label) {
  const r = await chain.send({ to: parts, data: encMint(kind, hex), label });
  return r;
}
async function mustRevert(kind, hex, why) {
  try { await chain.send({ to: parts, data: encMint(kind, hex) }); return `NO  — ${why} was ACCEPTED`; }
  catch (e) { return `yes — ${why} refused (${String(e.message).match(/data=(0x[0-9a-f]{10})/)?.[1] || "revert"})`; }
}

console.log("\n  the gate");
console.log("   ", await mustRevert(1, hexOf(FIELD + "\nfor(int i=0;i<9;i++){d+=0.1;}"), "a for loop"));
console.log("   ", await mustRevert(1, hexOf(FIELD + "\nwhile(d>0.0) d-=0.1;"), "a while loop"));
console.log("   ", await mustRevert(1, hexOf(FIELD + "\ndo{d-=0.1;}while(d>0.0);"), "a do-while"));
console.log("   ", await mustRevert(1, hexOf("/*for*/" + FIELD), "a comment"));
console.log("   ", await mustRevert(1, hexOf("//x\n" + FIELD), "a line comment"));
console.log("   ", await mustRevert(1, hexOf("#define X 1\n" + FIELD), "a preprocessor directive"));
console.log("   ", await mustRevert(1, hexOf('float s=1.0;"' + FIELD), "a double quote"));
console.log("   ", await mustRevert(1, hexOf(FIELD).replace(/^0x/, "0x00"), "a control byte"));
console.log("   ", await mustRevert(1, "0x" + "61".repeat(1025), "1025 bytes of FIELD"));

/* the false-positive check: identifiers that CONTAIN the keywords must pass */
const TRICKY = `float deform=0.1;
float dot2=dot(q,q);
vec4 window=q;
float doing=length(window)-0.5;
return min(doing,dot2*deform);`;

console.log("\n  mints");
let r;
r = await mint(1, hexOf(FIELD), "mint.field");
console.log(`    FIELD  ${Buffer.byteLength(FIELD).toString().padStart(6)} B   ${r.gas.toString().padStart(9)} gas`);
r = await mint(1, hexOf(TRICKY), "mint.tricky");
console.log(`    FIELD (deform/dot/window/doing — near-miss identifiers) ACCEPTED, ${r.gas} gas`);
r = await mint(1, "0x" + "61".repeat(1024), "mint.field.max");
console.log(`    FIELD  ${(1024).toString().padStart(6)} B   ${r.gas.toString().padStart(9)} gas   (MAX_FIELD, worst-case gate)`);
r = await mint(2, "0x" + "5a".repeat(604), "mint.score");
console.log(`    SCORE  ${(604).toString().padStart(6)} B   ${r.gas.toString().padStart(9)} gas   (SoundBox "wilderness")`);
r = await mint(2, "0x" + "5a".repeat(3070), "mint.score.five");
console.log(`    SCORE  ${(3070).toString().padStart(6)} B   ${r.gas.toString().padStart(9)} gas   (five songs, 11 minutes)`);
r = await mint(3, "0x" + "a2".repeat(2270), "mint.rom");
console.log(`    ROM    ${(2270).toString().padStart(6)} B   ${r.gas.toString().padStart(9)} gas   (chip8Archive median)`);
r = await mint(3, "0x" + "a2".repeat(24575), "mint.rom.max");
console.log(`    ROM    ${(24575).toString().padStart(6)} B   ${r.gas.toString().padStart(9)} gas   (MAX_ROM = one shard)`);

console.log("\n  reads (eth_call — free to the reader; this is what a contract would pay)");
for (const [id, label] of [[1,"FIELD 291 B"],[4,"SCORE 604 B"],[6,"ROM 2,270 B"],[7,"ROM 24,575 B"]]) {
  const res = await chain.vm.evm.runCall({
    to: (await import("@ethereumjs/util")).createAddressFromString(parts),
    caller: (await import("@ethereumjs/util")).createAddressFromString(chain.from.toString()),
    data: Buffer.from(enc("partOf(uint256)", [BigInt(id)]).replace(/^0x/, ""), "hex"),
    gasLimit: 3_000_000_000n
  });
  console.log(`    partOf(${id})  ${label.padEnd(14)} ${res.execResult.executionGasUsed.toString().padStart(9)} gas, ` +
    `${((res.execResult.returnValue.length))} bytes returned`);
}

console.log("\n  supportsInterface(IPart)");
const iid = sel("partOf(uint256)");
const sres = await chain.call(parts, sel("supportsInterface(bytes4)") + iid.slice(2).padEnd(64, "0"));
console.log(`    IPart interfaceId = ${iid}   supported = ${BigInt(sres) === 1n}`);
console.log();

console.log("\n  brace escape");
console.log("   ", await mustRevert(1, hexOf("return 0.0;} float g(){ return 1.0;"), "closing its own function"));
console.log("   ", await mustRevert(1, hexOf("if(q.x>0.0){ return 1.0;"), "an unclosed brace"));
console.log("   ", await mustRevert(1, hexOf("return 0.0;}}"), "an extra closing brace"));
r = await mint(1, hexOf("if(q.x>0.0){ return length(q)-0.5; } return length(q)-0.9;"), "mint.braced");
console.log(`    balanced braces ACCEPTED, ${r.gas} gas`);
console.log("\n  moving one into a holder's Reach");
const REACH = "0x00000000000000000000000000000000000abcde";
r = await chain.send({ to: parts,
  data: enc("transferFrom(address,address,uint256)", [chain.from.toString(), REACH, 1n]),
  label: "transferFrom" });
console.log(`    transferFrom (mint recipient -> Reach)  ${r.gas} gas`);
console.log();
