import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { sha256, inside } from "./runtime-graph.mjs";
import {
  functionalCommitment,
  validateFunctionalEntries,
  assembleFunctionalRuntime,
} from "../../web/confluence/module-loader.mjs";

const groupFor = (name) => {
  const pieces = name.split("/");
  if (pieces[0] !== "web")
    throw Error("Module is outside the runtime web tree.");
  return pieces.length > 2 ? pieces[1] : "foundation";
};
const canonical = (value) => JSON.stringify(value);
export function packageRuntimeModules(expanded, { previous } = {}) {
  const groups = new Map();
  for (const name of Object.keys(expanded.moduleGraph)) {
    const group = groupFor(name);
    if (!groups.has(group)) groups.set(group, []);
    const uri = expanded.imports["awe/" + name];
    if (!uri?.startsWith("data:text/javascript;base64,"))
      throw Error(
        "Functional archive needs an already verified module closure.",
      );
    groups
      .get(group)
      .push({
        path: name,
        source: Buffer.from(uri.split(",")[1], "base64").toString("utf8"),
        imports: expanded.moduleGraph[name].dependencies,
      });
  }
  const names = ["core-shell", ...[...groups.keys()].sort()];
  if (names.length > 32) throw Error("Too many functional feature packages.");
  const payloads = names.map((name) =>
      name === "core-shell"
        ? {
            schema: "anima.functional-module/1",
            name,
            shell: expanded.shell,
            moduleOrder: Object.keys(expanded.moduleGraph),
          }
        : {
            schema: "anima.functional-module/1",
            name,
            files: groups.get(name),
          },
    ),
    entries = payloads.map((payload) => {
      const raw = Buffer.from(canonical(payload)),
        expandedHash = sha256(raw),
        old = previous?.modules?.find((m) => m.name === payload.name);
      const version = old
        ? old.expandedSha256 === expandedHash
          ? old.version
          : old.version + 1
        : 1;
      if (!Number.isSafeInteger(version) || version < 1 || version > 0xffffffff)
        throw Error("Functional version overflow.");
      const gzip = zlib.gzipSync(raw, { level: 9, mtime: 0 }),
        encoded = Buffer.from(
          canonical({
            schema: "anima.module-envelope/1",
            compression: "gzip",
            data: gzip.toString("base64"),
          }),
        );
      const chunks = [];
      for (let off = 0; off < encoded.length; off += 23000)
        chunks.push(encoded.subarray(off, off + 23000));
      if (chunks.length > 512)
        throw Error("Functional module exceeds one directory capacity.");
      const archiveVersion = chunks.length > 64 ? 2 : 1,
        shards = [];
      if (archiveVersion === 2)
        for (let firstChunk = 0; firstChunk < chunks.length; firstChunk += 32) {
          const parts = chunks.slice(firstChunk, firstChunk + 32),
            bytes = Buffer.concat(parts);
          shards.push({
            index: shards.length,
            firstChunk,
            chunkCount: parts.length,
            byteLength: bytes.length,
            sha256: sha256(bytes),
          });
        }
      return {
        name: payload.name,
        id: sha256(payload.name),
        version,
        archiveVersion,
        sha256: sha256(encoded),
        byteLength: encoded.length,
        expandedSha256: expandedHash,
        expandedBytes: raw.length,
        compressedBytes: gzip.length,
        dependencies: [],
        chunks,
        shards,
        encoded,
      };
    });
  for (let i = 0; i < entries.length; i++) {
    const deps =
      i === 0
        ? entries.map((_, n) => n).slice(1)
        : [
            ...new Set(
              payloads[i].files.flatMap((f) =>
                f.imports.map((dep) => names.indexOf(groupFor(dep))),
              ),
            ),
          ]
            .filter((n) => n !== i)
            .sort((a, b) => a - b);
    if (deps.some((n) => n < 0))
      throw Error("A feature dependency is missing.");
    entries[i].dependencies = deps.map((index) => ({
      index,
      version: entries[index].version,
    }));
  }
  const digest = functionalCommitment(entries, 0);
  validateFunctionalEntries(entries, 0, digest);
  const recovered = assembleFunctionalRuntime(entries, payloads, 0, digest);
  if (recovered !== expanded.html)
    throw Error(
      "Functional archive reconstruction differs from the verified runtime.",
    );
  return { entries, payloads, shellIndex: 0, sha256: digest, html: recovered };
}
export function writeRuntimeModules(stage, expanded, options = {}) {
  const packaged = packageRuntimeModules(expanded, options),
    allChunks = [];
  const modules = packaged.entries.map((entry, index) => {
    const folder = `modules/${String(index).padStart(2, "0")}-${entry.name}`;
    fs.mkdirSync(path.join(stage, folder, "chunks"), { recursive: true });
    const chunks = entry.chunks.map((bytes, n) => {
      const file = `${folder}/chunks/${String(n).padStart(2, "0")}.bin`;
      fs.writeFileSync(inside(stage, file), bytes);
      const descriptor = { file, bytes: bytes.length, sha256: sha256(bytes) };
      allChunks.push(descriptor);
      return descriptor;
    });
    const { encoded, chunks: _, ...descriptor } = entry;
    return { ...descriptor, chunks };
  });
  fs.writeFileSync(path.join(stage, "runtime.html"), packaged.html);
  const manifest = {
    schema: "awe.onchain-runtime/3",
    archiveVersion: 3,
    compression: "modular-gzip",
    shellIndex: packaged.shellIndex,
    sha256: packaged.sha256,
    runtimeHtmlSha256: sha256(packaged.html),
    byteLength: modules.reduce((n, m) => n + m.byteLength, 0),
    expandedBytes: Buffer.byteLength(packaged.html),
    chunks: allChunks,
    modules,
    buildManifestSha256: expanded.buildManifestSha256,
    moduleGraph: expanded.moduleGraph,
  };
  fs.writeFileSync(
    path.join(stage, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}
export function readRuntimeModules(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")),
    base = fs.realpathSync(path.dirname(manifestPath));
  if (
    manifest.schema !== "awe.onchain-runtime/3" ||
    manifest.archiveVersion !== 3 ||
    manifest.compression !== "modular-gzip"
  )
    throw Error("Unsupported functional runtime schema.");
  validateFunctionalEntries(
    manifest.modules,
    manifest.shellIndex,
    manifest.sha256,
  );
  const payloads = [],
    chunks = [],
    modules = manifest.modules.map((m, index) => {
      if (
        !/^[a-z0-9_-]{1,40}$/.test(m.name) ||
        sha256(m.name) !== m.id ||
        !Array.isArray(m.chunks) ||
        m.chunks.length === 0 ||
        m.chunks.length > (m.archiveVersion === 1 ? 64 : 512)
      )
        throw Error("Invalid functional archive descriptor.");
      const parts = m.chunks.map((ch, n) => {
        const expected = `modules/${String(index).padStart(2, "0")}-${m.name}/chunks/${String(n).padStart(2, "0")}.bin`;
        if (ch.file !== expected || ch.bytes < 1 || ch.bytes > 23000)
          throw Error("Unexpected functional chunk path or size.");
        const location = fs.realpathSync(inside(base, ch.file));
        if (location !== inside(base, ch.file))
          throw Error("Functional archive symlink rejected.");
        const bytes = fs.readFileSync(location);
        if (bytes.length !== ch.bytes || sha256(bytes) !== ch.sha256)
          throw Error("Functional chunk integrity mismatch.");
        chunks.push(bytes);
        return bytes;
      });
      const raw = Buffer.concat(parts);
      if (raw.length !== m.byteLength || sha256(raw) !== m.sha256)
        throw Error("Functional archive digest mismatch.");
      const envelope = JSON.parse(raw);
      if (
        envelope.schema !== "anima.module-envelope/1" ||
        envelope.compression !== "gzip" ||
        typeof envelope.data !== "string"
      )
        throw Error("Invalid functional gzip envelope.");
      const compressed = Buffer.from(envelope.data, "base64");
      if (
        compressed.toString("base64") !== envelope.data ||
        compressed.length !== m.compressedBytes
      )
        throw Error("Noncanonical functional gzip encoding or size.");
      const expanded = zlib.gunzipSync(compressed, {
        maxOutputLength: m.expandedBytes,
      });
      if (
        expanded.length !== m.expandedBytes ||
        sha256(expanded) !== m.expandedSha256
      )
        throw Error("Functional expanded digest mismatch.");
      payloads.push(JSON.parse(expanded));
      const shards = [];
      if (m.archiveVersion === 2) {
        let cursor = 0;
        if (!Array.isArray(m.shards) || m.shards.length > 16)
          throw Error("Invalid functional shards.");
        for (const [i, s] of m.shards.entries()) {
          if (
            s.index !== i ||
            s.firstChunk !== cursor ||
            s.chunkCount < 1 ||
            s.chunkCount > 32
          )
            throw Error("Invalid functional shard order.");
          const subset = parts.slice(cursor, cursor + s.chunkCount),
            bytes = Buffer.concat(subset);
          if (
            subset.length !== s.chunkCount ||
            bytes.length !== s.byteLength ||
            sha256(bytes) !== s.sha256
          )
            throw Error("Functional shard integrity mismatch.");
          shards.push({ ...s, chunks: subset });
          cursor += s.chunkCount;
        }
        if (cursor !== parts.length)
          throw Error("Incomplete functional shard coverage.");
      } else if (m.shards?.length)
        throw Error("Legacy module cannot declare shards.");
      return { ...m, chunks: parts, shards };
    });
  if (
    canonical(manifest.chunks) !==
    canonical(manifest.modules.flatMap((m) => m.chunks))
  )
    throw Error("Functional flattened chunk list differs.");
  const html = assembleFunctionalRuntime(
      manifest.modules,
      payloads,
      manifest.shellIndex,
      manifest.sha256,
    ),
    expanded = Buffer.from(html);
  if (
    expanded.length !== manifest.expandedBytes ||
    sha256(expanded) !== manifest.runtimeHtmlSha256 ||
    !expanded.equals(fs.readFileSync(path.join(base, "runtime.html"))) ||
    manifest.byteLength !== modules.reduce((n, m) => n + m.byteLength, 0)
  )
    throw Error("Functional runtime reconstruction mismatch.");
  return {
    manifest,
    modules,
    chunks,
    shards: [],
    archiveVersion: 3,
    compressedBytes: modules.reduce((n, m) => n + m.compressedBytes, 0),
    expanded,
  };
}
export function moduleConstructorEntries(modules, archives) {
  if (modules.length !== archives.length)
    throw Error("Missing module deployment.");
  return modules.map((m, i) => ({
    id: "0x" + m.id,
    version: m.version,
    archive: archives[i],
    archiveVersion: m.archiveVersion,
    digest: "0x" + m.sha256,
    storedBytes: m.byteLength,
    expandedDigest: "0x" + m.expandedSha256,
    expandedBytes: m.expandedBytes,
    dependencies: m.dependencies.map((d) => d.index),
    dependencyVersions: m.dependencies.map((d) => d.version),
  }));
}
