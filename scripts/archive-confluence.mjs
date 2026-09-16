import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { atomicDirectory, sha256 } from "./lib/runtime-graph.mjs";
import { expandedRuntime } from "./lib/runtime-archive.mjs";
import {writeRuntimeModules} from "./lib/runtime-modules.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expanded = await expandedRuntime(root);
if(!process.argv.includes('--legacy')){
  let previous;try{previous=JSON.parse(fs.readFileSync(path.join(root,'onchain-app/confluence/manifest.json'),'utf8'));}catch{}
  const manifest=await atomicDirectory(path.join(root,'onchain-app/confluence'),stage=>writeRuntimeModules(stage,expanded,{previous}));
  console.log(JSON.stringify({archiveVersion:3,functionalModules:manifest.modules.length,byteLength:manifest.byteLength,expandedBytes:manifest.expandedBytes,chunks:manifest.chunks.length,sha256:manifest.sha256,sourceFreshness:'verified'}));
}else{
if (Buffer.byteLength(expanded.html) > 64 * 1024 * 1024) throw Error("Expanded onchain runtime exceeds 64 MiB capacity");
const zipped = zlib.gzipSync(Buffer.from(expanded.html), { level: 9, mtime: 0 }),
  encoded = zipped.toString("base64");
const boot =
  '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anima Genesis · Onchain runtime</title><style>body{background:#04060a;color:#d8eaf1;font:16px system-ui;padding:8vh;text-align:center}</style></head><body><p id="status">Unfolding your artifact…</p><script>(async()=>{try{const b=Uint8Array.from(atob("' +
  encoded +
  '"),c=>c.charCodeAt(0));const stream=new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"));const html=await new Response(stream).text();document.open();document.write(html);document.close();}catch(e){document.getElementById("status").textContent="The onchain runtime needs a browser with gzip decompression: "+e.message;}})();</script></body></html>';
if (Buffer.byteLength(boot) > 512 * 23000)
  throw Error("Onchain archive exceeds 512-chunk directory capacity");
const manifest = await atomicDirectory(
  path.join(root, "onchain-app/confluence"),
  async (stage) => {
    fs.mkdirSync(path.join(stage, "chunks"));
    fs.writeFileSync(path.join(stage, "runtime.html"), boot);
    const bytes = Buffer.from(boot),
      chunks = [];
    for (let offset = 0; offset < bytes.length; offset += 23000) {
      const chunk = bytes.subarray(offset, offset + 23000),
        file = "chunks/" + String(chunks.length).padStart(2, "0") + ".bin";
      fs.writeFileSync(path.join(stage, file), chunk);
      chunks.push({ file, bytes: chunk.length, sha256: sha256(chunk) });
    }
    const shards = [];
    if (chunks.length > 64) for (let firstChunk = 0; firstChunk < chunks.length; firstChunk += 32) {
      const parts = chunks.slice(firstChunk, firstChunk + 32);
      const part = bytes.subarray(firstChunk * 23000, Math.min(bytes.length, (firstChunk + parts.length) * 23000));
      shards.push({index: shards.length, firstChunk, chunkCount: parts.length, byteLength: part.length, sha256: sha256(part)});
    }
    const result = {
      schema: shards.length ? "awe.onchain-runtime/2" : "awe.onchain-runtime/1",
      ...(shards.length ? {archiveVersion: 2, shards} : {}),
      compression: "gzip",
      expandedBytes: Buffer.byteLength(expanded.html),
      byteLength: bytes.length,
      sha256: sha256(bytes),
      chunks,
      buildManifestSha256: expanded.buildManifestSha256,
      moduleGraph: expanded.moduleGraph,
    };
    fs.writeFileSync(
      path.join(stage, "manifest.json"),
      JSON.stringify(result, null, 2) + "\n",
    );
    return result;
  },
);
console.log(
  JSON.stringify({
    byteLength: manifest.byteLength,
    expandedBytes: manifest.expandedBytes,
    chunks: manifest.chunks.length,
    sha256: manifest.sha256,
    sourceFreshness: "verified",
  }),
);

}
