import fs from "node:fs";
import path from "node:path";
import { keccak256 } from "ethers";
import { verifyCompilation } from "./lib/compiler-artifacts.mjs";
const root = path.resolve(import.meta.dirname, "..");
const manifest = verifyCompilation(root),
  result = {};
for (const name of [
  "V4SettlementConverter",
  "V4ScheduledExit",
  "V4FeeCompounder",
]) {
  const key = `contracts/src/extensions/strategies/V4Strategies.sol:${name}`,
    record = manifest.artifacts[key];
  if (!record || manifest.aliases[name] !== key)
    throw Error("Missing verified strategy artifact " + name);
  const a = JSON.parse(
    fs.readFileSync(
      path.join(root, "contracts/artifacts", record.file),
      "utf8",
    ),
  );
  const masks = Object.values(a.immutableReferences || {}).flat();
  let code = a.deployedBytecode.slice(2);
  for (const m of masks) {
    if (m.length !== 32 || m.start < 0 || m.start + m.length > code.length / 2)
      throw Error("Invalid immutable mask");
    code =
      code.slice(0, m.start * 2) +
      "0".repeat(m.length * 2) +
      code.slice((m.start + m.length) * 2);
  }
  result[name] = {
    abi: a.abi,
    bytecode: a.bytecode,
    compiler: a.compiler,
    bytes: code.length / 2,
    masks,
    immutableGroups: Object.values(a.immutableReferences || {}),
    normalizedHash: keccak256("0x" + code),
    creationHash: keccak256(a.bytecode),
  };
}
fs.writeFileSync(
  path.join(root, "web/launchpad/strategies-artifacts.mjs"),
  "// Generated from verified canonical Solidity compilation.\nexport const STRATEGY_ARTIFACTS=" +
    JSON.stringify(result) +
    ";\n",
);
console.log("Built verified conversion and scheduled-exit strategy artifacts.");
