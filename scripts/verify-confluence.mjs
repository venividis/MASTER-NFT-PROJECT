import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expandedRuntime } from "./lib/runtime-archive.mjs";
import {readGenesisRuntime} from "./lib/genesis-deployment.mjs";
import {
  inside,
  listFiles,
  moduleReferences,
  sha256,
} from "./lib/runtime-graph.mjs";
import { parse, elements, attr, textContent } from "./lib/runtime-html.mjs";
import { verifyCompilation } from "./lib/compiler-artifacts.mjs";
import { verifyV4Compilation } from "./lib/v4-compilation.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  archive = path.join(root, "onchain-app/confluence");
verifyCompilation(root);
verifyV4Compilation(root);
const expected = await expandedRuntime(root),
  manifest = JSON.parse(
    fs.readFileSync(path.join(archive, "manifest.json"), "utf8"),
  );
if (manifest.buildManifestSha256 !== expected.buildManifestSha256)
  throw Error("Archive was built from a different source build.");
if (
  JSON.stringify(manifest.moduleGraph) !== JSON.stringify(expected.moduleGraph)
)
  throw Error("Archive module graph changed.");
const listed = [
  "manifest.json",
  "runtime.html",
  ...manifest.chunks.map((ch) => ch.file),
].sort();
if (JSON.stringify(listFiles(archive)) !== JSON.stringify(listed))
  throw Error("Unexpected archive files or stale chunks.");
const recovered=readGenesisRuntime(path.join(archive,'manifest.json')),pieces=recovered.chunks,expanded=recovered.expanded.toString();
if(Buffer.byteLength(expanded)!==manifest.expandedBytes||expanded!==expected.html)throw Error('Recovered runtime differs from current source build.');
const document = parse(expanded),
  maps = elements(
    document,
    (n) => n.tagName === "script" && attr(n, "type") === "importmap",
  );
if (maps.length !== 1) throw Error("Expected one recovered import map.");
const imports = JSON.parse(textContent(maps[0])).imports;
const expectedKeys = Object.keys(expected.moduleGraph)
  .map((name) => "awe/" + name)
  .sort();
if (
  JSON.stringify(Object.keys(imports).sort()) !== JSON.stringify(expectedKeys)
)
  throw Error("Embedded module closure differs from current graph.");
for (const [key, url] of Object.entries(imports)) {
  if (!url.startsWith("data:text/javascript;base64,"))
    throw Error("External embedded module: " + key);
  const source = Buffer.from(url.split(",")[1], "base64").toString();
  for (const ref of await moduleReferences(source, key))
    if (!imports[ref.n]) throw Error("Missing embedded dependency " + ref.n);
  execFileSync(process.execPath, ["--input-type=module", "--check"], {
    input: source,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
for (const script of elements(
  document,
  (n) =>
    n.tagName === "script" &&
    attr(n, "type") !== "importmap" &&
    !attr(n, "src"),
)) {
  execFileSync(
    process.execPath,
    [
      ...(attr(script, "type") === "module" ? ["--input-type=module"] : []),
      "--check",
    ],
    { input: textContent(script), stdio: ["pipe", "pipe", "pipe"] },
  );
}
console.log(
  JSON.stringify({
    sourceFreshness: "passed",
    recoveredRuntime: "exact",
    syntax: "passed",
    runtimeGraph:
      "complete (static, side-effect, re-export and literal dynamic imports)",
    onchainChunks: pieces.length,
    embeddedModules: expectedKeys.length,
    expandedBytes: manifest.expandedBytes,
  }),
);
