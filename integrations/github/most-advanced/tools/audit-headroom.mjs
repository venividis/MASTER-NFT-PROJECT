/* Does jsnes + an NES ROM actually fit inside tokenURI?
   The design documents answer with a linear extrapolation from an
   undefined unit. This answers by adding the bytes and reading the meter. */
import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, artifact } from "./compile.mjs";
import { Chain, enc, encodeAddressArg } from "./evm.mjs";
import { createAddressFromString, hexToBytes } from "@ethereumjs/util";
import { BLOCK } from "./evm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "dist/shards.json"), "utf8"));
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = {
  Engine: artifact(out, "src/Engine.sol", "Engine"),
  Sigil: artifact(out, "src/Sigil.sol", "Sigil"),
  Renderer: artifact(out, "src/Renderer.sol", "Renderer"),
  Ipseity: artifact(out, "src/Ipseity.sol", "Ipseity"),
  Account: artifact(out, "src/IpseityAccount.sol", "IpseityAccount"),
  Grip: artifact(out, "src/GripVault.sol", "GripVault"),
  Registry: artifact(out, "test/mocks/ERC6551Registry.sol", "ERC6551Registry")
};
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";

async function run(extraStored) {
  const c = await Chain.open();
  const tmp = await c.deploy(A.Registry.bytecode, "", "registry");
  await c.vm.stateManager.putCode(createAddressFromString(REGISTRY),
    await c.vm.stateManager.getCode(createAddressFromString(tmp)));
  const engine = await c.deploy(A.Engine.bytecode, "0".repeat(63) + "1", "Engine");
  const sigil = await c.deploy(A.Sigil.bytecode, "", "Sigil");
  const renderer = await c.deploy(A.Renderer.bytecode,
    encodeAddressArg(engine) + encodeAddressArg(sigil), "Renderer");
  const nft = await c.deploy(A.Ipseity.bytecode,
    encodeAddressArg(renderer) +
    encodeAddressArg(await c.deploy(A.Account.bytecode, "", "acct")) +
    encodeAddressArg(await c.deploy(A.Grip.bytecode, "", "grip")) +
    (1).toString(16).padStart(64,"0") + (4096).toString(16).padStart(64,"0"), "Ipseity");
  for (const s of plan.head) await c.exec(engine, "loadHead(bytes)", [s.data]);
  for (const s of plan.body) await c.exec(engine, "loadBody(bytes)", [s.data]);
  let left = extraStored;
  while (left > 0) { const k = Math.min(left, 24575);
    await c.exec(engine, "loadBody(bytes)", ["0x" + "5a".repeat(k)]); left -= k; }
  await c.exec(engine, "setInflatedSize(uint32)", [plan.inflatedSize]);
  await c.exec(engine, "freeze()", []);
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const res = await c.vm.evm.runCall({
    to: createAddressFromString(nft), caller: c.from, origin: c.from,
    data: hexToBytes(enc("tokenURI(uint256)", [1])), gasLimit: 5_000_000_000n, value: 0n, block: BLOCK });
  if (res.execResult.exceptionError) return { err: res.execResult.exceptionError.error };
  return { gas: Number(res.execResult.executionGasUsed),
           bytes: (res.execResult.returnValue || []).length };
}

const CAP = 50_000_000;
const cases = [
  [0,      "as shipped"],
  [5588,   "MINIMAL: Octo + median CHIP-8 cart, stored"],
  [31524,  "jsnes alone (gz)"],
  [72500,  "EMULATOR: jsnes + NES NROM-256  <- the disputed row"],
  [96668,  "if 'doc bytes' were the unit instead"]
];
let base = null;
for (const [extra, label] of cases) {
  const r = await run(extra);
  if (r.err) { console.log(`+${String(extra).padStart(6)}  REVERTED ${r.err}  (${label})`); continue; }
  if (base === null) base = r;
  const marg = extra ? ((r.gas - base.gas) / extra).toFixed(1) : "-";
  console.log(`+${String(extra).padStart(6)} stored  gas=${String(r.gas).padStart(10)}  ret=${String(r.bytes).padStart(7)}B  ` +
    `${r.gas <= CAP ? "FITS  " : "OVER  "}50M  marginal=${String(marg).padStart(6)}/stored-byte   ${label}`);
}
