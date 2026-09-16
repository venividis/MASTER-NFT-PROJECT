import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "contracts", "src");
const forbidden = [
  { pattern: /\btx\.origin\b/g, reason: "tx.origin authorization" },
  { pattern: /\bselfdestruct\b/g, reason: "selfdestruct" },
  { pattern: /\.delegatecall\s*\(/g, reason: "unbounded delegatecall" },
  { pattern: /assembly\s*\{[^}]*sstore/gs, reason: "manual storage mutation" },
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

// These pinned upstream implementations intentionally use assembly storage operations.
// The exception applies only to that one heuristic and those exact source bytes.
const vendorPins=JSON.parse(fs.readFileSync(path.join(root,'test/confluence/vendor-storage-pins.json'),'utf8'));
const findings = [];
for (const file of walk(sourceRoot).filter((name) => name.endsWith(".sol"))) {
  const source = fs.readFileSync(file, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) {
      const relative=path.relative(root,file);
      const reviewedAssembly=rule.reason==='manual storage mutation' && vendorPins[relative]===crypto.createHash('sha256').update(source).digest('hex');
      if(!reviewedAssembly)findings.push({ file: relative, issue: rule.reason });
    }
    rule.pattern.lastIndex = 0;
  }
}

if (findings.length) {
  console.error("Forbidden Solidity patterns found:");
  console.table(findings);
  process.exit(1);
}
console.log("Static heuristic scan passed. Three exact-hash pinned Solady files permit intentional assembly storage; this is not a security audit.");
