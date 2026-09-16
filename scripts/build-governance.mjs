import fs from "node:fs";
import path from "node:path";
import { keccak256 } from "ethers";
import { verifyCompilation } from "./lib/compiler-artifacts.mjs";

const root = path.resolve(import.meta.dirname, ".."),
  index = verifyCompilation(root),
  result = {};
for (const name of ["OperatingNFTGovernance", "OperatingVotingShares"]) {
  const identity = index.aliases[name],
    record = index.artifacts[identity];
  if (
    !record ||
    identity !== `contracts/src/extensions/governance/${name}.sol:${name}`
  )
    throw Error("Governance source identity changed: " + name);
  const artifact = JSON.parse(
    fs.readFileSync(
      path.join(root, "contracts/artifacts", record.file),
      "utf8",
    ),
  );
  const immutableGroups = Object.values(artifact.immutableReferences);
  let code = artifact.deployedBytecode.slice(2);
  for (const group of immutableGroups)
    for (const m of group)
      code =
        code.slice(0, m.start * 2) +
        "0".repeat(m.length * 2) +
        code.slice((m.start + m.length) * 2);
  result[name] = {
    abi: artifact.abi,
    compiler: artifact.compiler,
    evmVersion: index.settings.evmVersion,
    bytes: code.length / 2,
    immutableGroups,
    normalizedHash: keccak256("0x" + code),
    bytecode: artifact.bytecode,
    creationHash: keccak256(artifact.bytecode),
  };
}
const target = path.join(root, "web/governance/artifacts.mjs");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(
  target,
  "// Generated from verified canonical Solidity artifacts.\nexport const GOVERNANCE_ARTIFACTS = " +
    JSON.stringify(result) +
    ";\n",
);
console.log(
  "Built OperatingNFTGovernance and OperatingVotingShares browser artifacts.",
);
