import fs from "node:fs";
import path from "node:path";
import { keccak256 } from "ethers";
import { verifyCompilation } from "./lib/compiler-artifacts.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  index = verifyCompilation(root),
  result = {};
for (const name of [
  "LaunchRegistry",
  "LaunchAllocationComposer",
  "NFTAuctionFactory",
]) {
  const identity = index.aliases[name],
    record = index.artifacts[identity];
  if (
    !record ||
    identity !== `contracts/src/extensions/launch/${name}.sol:${name}`
  )
    throw Error("Lifecycle contract identity changed: " + name);
  const artifact = JSON.parse(
    fs.readFileSync(
      path.join(root, "contracts/artifacts", record.file),
      "utf8",
    ),
  );
  const immutableGroups = Object.values(artifact.immutableReferences),
    masks = immutableGroups.flat();
  let code = artifact.deployedBytecode.slice(2);
  for (const m of masks)
    code =
      code.slice(0, m.start * 2) +
      "0".repeat(m.length * 2) +
      code.slice((m.start + m.length) * 2);
  result[name] = {
    abi: artifact.abi,
    bytes: code.length / 2,
    masks,
    immutableGroups,
    normalizedHash: keccak256("0x" + code),
    bytecode: artifact.bytecode,
    creationHash: keccak256(artifact.bytecode),
  };
}
fs.writeFileSync(
  path.join(root, "web/launchpad/lifecycle-artifacts.mjs"),
  "// Generated from verified canonical Solidity artifacts by scripts/build-launch-lifecycle.mjs.\nexport const LIFECYCLE_ARTIFACTS = " +
    JSON.stringify(result) +
    ";\n",
);
console.log("Built registry and atomic launch allocation artifacts.");
