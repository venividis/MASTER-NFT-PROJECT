import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const ignored = new Set(["node_modules", "target", ".git", "integrations", "dist"]);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(root);
for (const file of files.filter((name) => name.endsWith(".js") || name.endsWith(".mjs"))) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}
for (const file of files.filter((name) => name.endsWith(".json"))) {
  try { JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) {
    console.error(`Invalid JSON: ${path.relative(root, file)}\n${error.message}`);
    process.exit(1);
  }
}
console.log(`Authored JavaScript syntax and JSON parsing passed; donor trees and generated dist excluded (${files.length} files inspected). Run integrity:verify to check release file hashes.`);
