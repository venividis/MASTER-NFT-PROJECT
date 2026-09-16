import fs from "node:fs";
import path from "node:path";
import { intentStatement } from "../agent/policy-engine.mjs";

const root = path.resolve(import.meta.dirname, "..");
const intent = {
  target: "0x2222222222222222222222222222222222222222",
  value: 0n,
  dataHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  nonce: 9n,
  validAfter: 1_899_999_999n,
  validUntil: 1_900_000_600n,
  priorStateRoot: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  nextStateRoot: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  nextMemoryRoot: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  policyHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  evidenceHash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  verifierId: 1,
};
const statement = intentStatement("0x1111111111111111111111111111111111111111", 1337, intent);
fs.writeFileSync(path.join(root, "proof-kernel", "fixtures", "statement.txt"), `${statement}\n`);
console.log(statement);
