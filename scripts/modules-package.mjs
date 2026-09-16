#!/usr/bin/env node
// Packages local source bytes without importing or executing application code.
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";

const HELP = `Package an immutable ANIMA module without deploying it:
  node scripts/modules-package.mjs --input APP_DIR --metadata OPTIONS.json --output NEW_DIR
  node scripts/modules-package.mjs --legacy-html APP.html --metadata OPTIONS.json --output NEW_DIR

Options:
  --entrypoint PATH       Override metadata.entrypoint (default: index.html).
  --compression FORMAT   gzip for directories; raw for legacy HTML. none aliases raw.
  --help                 Show this help.

Metadata JSON supplies name, version and publisher, and may supply entrypoint,
hostAPI, dependencies, capabilities, stateSchema and predecessor. A zero state
schema denotes a stateless module. JavaScript imports must be literal relative
paths resolving to bundled files. Source bytes are preserved, not executed.

Creates archive.bin, canonical manifest.json, receipt.json and deduplicated
23,000-byte chunks in a new directory. Existing output paths and source symlinks
are rejected. This command does not publish releases or grant permissions.
`;

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 4096;
const ZERO_HASH = "0x" + "0".repeat(64);
const digest = (bytes) =>
  "0x" + createHash("sha256").update(bytes).digest("hex");
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const MIME = {
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".cjs": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
};

function safePath(name) {
  if (
    typeof name !== "string" ||
    !name ||
    /[\\\x00-\x1f\x7f:#?%]/.test(name) ||
    path.posix.isAbsolute(name) ||
    name.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw Error("Unsafe package path: " + String(name));
  return name;
}

async function existingPath(location) {
  try {
    return await fs.lstat(location);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readRegularFile(location) {
  const resolved = path.resolve(location);
  if ((await fs.realpath(resolved)) !== resolved)
    throw Error("Source symlinks are not supported: " + resolved);
  const handle = await fs.open(
    resolved,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(MAX_BYTES))
      throw Error(
        "Source must be a regular file of at most 64 MiB: " + resolved,
      );
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      BigInt(bytes.length) !== before.size
    )
      throw Error("Source changed while being read: " + resolved);
    return bytes;
  } finally {
    await handle.close();
  }
}

async function readDirectory(root) {
  if (
    (await fs.realpath(root)) !== root ||
    !(await fs.lstat(root)).isDirectory()
  )
    throw Error("Input must be a real directory without symlink ancestors.");
  const files = [];
  let totalBytes = 0;
  async function visit(prefix) {
    const entries = await fs.readdir(path.join(root, prefix), {
      withFileTypes: true,
    });
    entries.sort((a, b) => compare(a.name, b.name));
    for (const entry of entries) {
      const name = safePath(prefix ? prefix + "/" + entry.name : entry.name);
      if (entry.isSymbolicLink())
        throw Error("Source symlinks are not supported: " + name);
      if (entry.isDirectory()) {
        await visit(name);
        continue;
      }
      if (!entry.isFile()) throw Error("Source is not a regular file: " + name);
      if (files.length >= MAX_FILES) throw Error("Package exceeds 4096 files.");
      const bytes = await readRegularFile(path.join(root, name));
      totalBytes += bytes.length;
      if (totalBytes > MAX_BYTES) throw Error("Package source exceeds 64 MiB.");
      files.push({
        path: name,
        mime:
          MIME[path.extname(name).toLowerCase()] || "application/octet-stream",
        bytes,
        imports: [],
      });
    }
  }
  await visit("");
  if (!files.length) throw Error("Input directory contains no files.");
  return files.sort((a, b) => compare(a.path, b.path));
}

async function inspectImports(files) {
  const { init, parse } = await import("es-module-lexer");
  const { parse: parseHTML } = await import("parse5");
  await init;
  const paths = new Set(files.map((file) => file.path));
  for (const file of files) {
    const imports = new Set();
    const inspectSource = (source) => {
      const [references] = parse(source, file.path);
      for (const reference of references) {
        if (reference.d === -2) continue; // import.meta is not an import edge.
        if (typeof reference.n !== "string")
          throw Error(
            "Nonliteral dynamic import in " +
              file.path +
              ". Use a literal bundled relative path.",
          );
        const specifier = reference.n;
        if (
          (!specifier.startsWith("./") && !specifier.startsWith("../")) ||
          /[\\\x00-\x1f\x7f?#%]/.test(specifier)
        )
          throw Error(
            "External or unsupported import in " + file.path + ": " + specifier,
          );
        const resolved = safePath(
          path.posix.normalize(
            path.posix.join(path.posix.dirname(file.path), specifier),
          ),
        );
        if (!paths.has(resolved))
          throw Error(
            "Import is not bundled: " + file.path + " -> " + resolved,
          );
        imports.add(resolved);
      }
    };
    if (file.mime === "text/javascript") inspectSource(utf8.decode(file.bytes));
    else if (file.mime === "text/html") {
      const visit = (node) => {
        if (node.tagName === "script") {
          const attributes = Object.fromEntries(
            (node.attrs || []).map(({ name, value }) => [name, value]),
          );
          const type = (attributes.type || "").trim().toLowerCase();
          if (
            !attributes.src &&
            [
              "",
              "module",
              "text/javascript",
              "application/javascript",
              "text/ecmascript",
              "application/ecmascript",
            ].includes(type)
          )
            inspectSource(
              (node.childNodes || [])
                .map((child) => child.value || "")
                .join(""),
            );
        }
        for (const child of node.childNodes || []) visit(child);
        if (node.content) visit(node.content);
      };
      visit(parseHTML(utf8.decode(file.bytes)));
    }
    file.imports = [...imports].sort(compare);
  }
}

async function createOutput(target) {
  const parent = path.dirname(target);
  await fs.mkdir(parent, { recursive: true });
  if ((await fs.realpath(parent)) !== parent)
    throw Error("Output parent must not contain symlinks.");
  await fs.mkdir(target); // Exclusive even when a previous output is an empty directory.
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      "legacy-html": { type: "string" },
      metadata: { type: "string" },
      output: { type: "string" },
      entrypoint: { type: "string" },
      compression: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (
    !values.input === !values["legacy-html"] ||
    !values.metadata ||
    !values.output
  )
    throw Error(
      "Specify exactly one of --input or --legacy-html, plus --metadata and --output. Use --help.",
    );
  values.compression ??= values["legacy-html"] ? "raw" : "gzip";
  if (!["gzip", "raw", "none"].includes(values.compression))
    throw Error("Compression must be gzip or raw (none is an alias).");
  const compression =
    values.compression === "none" ? "raw" : values.compression;
  const output = path.resolve(values.output);
  if (await existingPath(output))
    throw Error("Output already exists. Choose a fresh path.");
  if (values.input) {
    const root = path.resolve(values.input);
    if (output === root || output.startsWith(root + path.sep))
      throw Error("Output must be outside the input directory.");
  }
  const options = JSON.parse(
    utf8.decode(await readRegularFile(values.metadata)),
  );
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw Error("Metadata must be a JSON object.");
  const metadata = {
    hostAPI: "anima.host/1",
    dependencies: [],
    capabilities: [],
    stateSchema: ZERO_HASH,
    predecessor: ZERO_HASH,
    entrypoint: "index.html",
    ...options,
    ...(values.entrypoint ? { entrypoint: values.entrypoint } : {}),
  };
  safePath(metadata.entrypoint);
  const { packageFiles, packageLegacyHTML, canonicalJSON, canonicalManifest } =
    await import("../packages/modules/sdk.mjs");
  let packaged;
  const warnings = [];
  if (values["legacy-html"]) {
    const htmlBytes = await readRegularFile(values["legacy-html"]);
    const html = utf8.decode(htmlBytes);
    await inspectImports([
      {
        path: metadata.entrypoint,
        mime: "text/html",
        bytes: htmlBytes,
        imports: [],
      },
    ]);
    if (
      /(?:\b(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\/|\b(?:fetch|import)\s*\(\s*["']https?:|\burl\s*\(\s*["']?\s*(?:https?:)?\/\/)/i.test(
        html,
      )
    )
      warnings.push(
        "Legacy HTML contains possible external references. Those bytes are preserved; network resources are unavailable in the offline extension sandbox. Review before installation.",
      );
    packaged = await packageLegacyHTML(html, metadata, { compression });
  } else {
    const files = await readDirectory(path.resolve(values.input));
    await inspectImports(files);
    packaged = await packageFiles(files, metadata, { compression });
  }
  const archive = Buffer.from(packaged.archive);
  const chunks = [];
  const uniqueChunks = new Map();
  for (let offset = 0; offset < archive.length; offset += 23000) {
    const bytes = archive.subarray(offset, offset + 23000);
    const sha256 = digest(bytes);
    const file = "chunks/" + sha256.slice(2) + ".bin";
    chunks.push({
      index: chunks.length,
      file,
      byteLength: bytes.length,
      sha256,
    });
    uniqueChunks.set(file, bytes);
  }
  const receipt = {
    schema: "anima.module-package-receipt/1",
    manifestHash: packaged.manifestHash,
    contentId: packaged.contentId,
    archiveSha256: digest(archive),
    archiveBytes: archive.length,
    entrypoint: packaged.manifest.entrypoint,
    chunkBytes: 23000,
    chunkCount: chunks.length,
    uniqueChunkCount: uniqueChunks.size,
    chunks,
    warnings,
  };
  let created = false;
  try {
    await createOutput(output);
    created = true;
    await fs.mkdir(path.join(output, "chunks"));
    await fs.writeFile(path.join(output, "archive.bin"), archive, {
      flag: "wx",
    });
    await fs.writeFile(
      path.join(output, "manifest.json"),
      canonicalManifest(packaged.manifest),
      { flag: "wx" },
    );
    await fs.writeFile(
      path.join(output, "receipt.json"),
      canonicalJSON(receipt) + "\n",
      { flag: "wx" },
    );
    for (const [file, bytes] of uniqueChunks)
      await fs.writeFile(path.join(output, file), bytes, { flag: "wx" });
  } catch (error) {
    if (created) await fs.rm(output, { recursive: true, force: true });
    throw error;
  }
  console.log(
    canonicalJSON({
      packaged: true,
      manifestHash: packaged.manifestHash,
      contentId: packaged.contentId,
      output,
      archiveBytes: archive.length,
      chunkCount: chunks.length,
      uniqueChunkCount: uniqueChunks.size,
      warnings,
    }),
  );
}

main().catch((error) => {
  console.error("Module packaging failed: " + error.message);
  process.exitCode = 1;
});
