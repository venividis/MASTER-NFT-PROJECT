import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { init, parse } from "es-module-lexer";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function inside(root, name) {
  if (
    typeof name !== "string" ||
    name.includes("\\") ||
    name.includes("\0") ||
    path.posix.isAbsolute(name)
  )
    throw Error("Invalid runtime path: " + name);
  const resolved = path.resolve(root, name);
  if (!resolved.startsWith(path.resolve(root) + path.sep))
    throw Error("Runtime path escapes root: " + name);
  return resolved;
}
export async function moduleReferences(source, filename) {
  await init;
  const [imports] = parse(source, filename);
  return imports
    .filter((ref) => ref.d !== -2)
    .map((ref) => {
      if (ref.n === undefined)
        throw Error("Runtime imports must use literal paths: " + filename);
      return ref;
    });
}
export function resolveModule(importer, specifier) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../"))
    throw Error("Unresolved runtime module " + specifier + " in " + importer);
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(importer), specifier),
  );
  if (resolved.startsWith("../") || !/\.(m?js)$/.test(resolved))
    throw Error("Unsupported runtime module path " + resolved);
  return resolved;
}
export async function discoverModules(root, entries) {
  const queue = [...entries],
    graph = {};
  for (let i = 0; i < queue.length; i++) {
    const name = queue[i];
    if (graph[name]) continue;
    const file = inside(root, name),
      real = fs.realpathSync(file);
    if (real !== file)
      throw Error("Runtime symlinks are not supported: " + name);
    const source = fs.readFileSync(file, "utf8"),
      references = await moduleReferences(source, name);
    const dependencies = references.map((ref) => resolveModule(name, ref.n));
    graph[name] = { sha256: sha256(source), dependencies };
    for (const dependency of dependencies)
      if (!graph[dependency]) queue.push(dependency);
  }
  return Object.fromEntries(
    Object.entries(graph).sort(([a], [b]) => a.localeCompare(b)),
  );
}
export async function archiveModule(source, filename) {
  const refs = await moduleReferences(source, filename);
  let output = source;
  for (const ref of refs.toReversed()) {
    const specifier = "awe/" + resolveModule(filename, ref.n);
    output =
      output.slice(0, ref.s) +
      (ref.d >= 0 ? JSON.stringify(specifier) : specifier) +
      output.slice(ref.e);
  }
  return output;
}
export function atomicDirectory(target, generate) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const stage = fs.mkdtempSync(target + ".stage-"),
    backup = target + ".previous-" + process.pid;
  return Promise.resolve()
    .then(() => generate(stage))
    .then((result) => {
      if (fs.existsSync(target)) fs.renameSync(target, backup);
      try {
        fs.renameSync(stage, target);
      } catch (error) {
        if (fs.existsSync(backup)) fs.renameSync(backup, target);
        throw error;
      }
      fs.rmSync(backup, { recursive: true, force: true });
      return result;
    })
    .finally(() => fs.rmSync(stage, { recursive: true, force: true }));
}
export function listFiles(root, prefix = "") {
  return fs
    .readdirSync(path.join(root, prefix), { withFileTypes: true })
    .flatMap((entry) => {
      const name = path.posix.join(prefix, entry.name);
      if (entry.isSymbolicLink())
        throw Error("Release symlinks are not supported: " + name);
      return entry.isDirectory() ? listFiles(root, name) : [name];
    })
    .sort();
}
export function hashFiles(root, names) {
  return Object.fromEntries(
    [...new Set(names)]
      .sort()
      .map((name) => [name, sha256(fs.readFileSync(inside(root, name)))]),
  );
}
export function verifyHashes(root, hashes, label = "Build input") {
  for (const [name, hash] of Object.entries(hashes))
    if (
      !fs.existsSync(inside(root, name)) ||
      sha256(fs.readFileSync(inside(root, name))) !== hash
    )
      throw Error(label + " changed: " + name);
}
export function verifyBuild(root, dist = path.join(root, "dist")) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dist, "build-manifest.json"), "utf8"),
  );
  if (manifest.schema !== "anima.source-build/1")
    throw Error(
      "Unsupported source build manifest. Rebuild current application.",
    );
  verifyHashes(root, manifest.inputs, "Build source");
  verifyHashes(dist, manifest.outputs, "Runtime output");
  const actual = listFiles(dist).filter(
    (name) => name !== "build-manifest.json",
  );
  if (
    JSON.stringify(actual) !==
    JSON.stringify(Object.keys(manifest.outputs).sort())
  )
    throw Error("Unexpected runtime outputs. Rebuild to remove stale files.");
  return manifest;
}
