#!/usr/bin/env node
// Read-only chain recovery: this adapter exposes no wallet or transaction methods.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";

const HELP = `Recover and verify a published ANIMA module from chain data:
  node scripts/modules-recover.mjs --rpc HTTPS_RPC --chain CHAIN_ID --registry ADDRESS --release RELEASE_ID --output NEW_DIR

Options:
  --token ID       Recover all installed/history releases and saved states; registry is the token registry.
  --block NUMBER   Recover at an explicit decimal or hexadecimal block number.
                   When omitted, the SDK pins a chain snapshot before reading.
  --help           Show this help.

Uses HTTPS or an HTTP loopback RPC. Only read methods are permitted; there is no
signer, wallet permission request or transaction submission. Creates canonical
manifest.json, receipt.json and the exact recovered files under NEW_DIR/files/.
Verified dependencies are preserved under NEW_DIR/dependencies/RELEASE_ID/.
Existing output paths are never overwritten. Recovered code is not executed.
`;

const READ_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_call",
]);
const MAX_RPC_BYTES = 3 * 1024 * 1024;
const digest = (bytes) =>
  "0x" + createHash("sha256").update(bytes).digest("hex");

function uint(value, name) {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9][0-9]*|0x[0-9a-fA-F]+)$/.test(value)
  )
    throw Error(name + " must be an unsigned decimal or hexadecimal integer.");
  const parsed = BigInt(value);
  if (parsed >= 1n << 256n) throw Error(name + " exceeds uint256.");
  return parsed;
}

function safePath(name) {
  if (
    typeof name !== "string" ||
    !name ||
    /[\\\x00-\x1f\x7f:#?%]/.test(name) ||
    path.posix.isAbsolute(name) ||
    name.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw Error("Unsafe recovered file path: " + String(name));
  return name;
}

async function ensureFresh(target) {
  try {
    await fs.lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw Error("Output already exists. Choose a fresh path.");
}

async function responseJSON(response) {
  const advertised = response.headers.get("content-length");
  if (advertised && Number(advertised) > MAX_RPC_BYTES)
    throw Error("RPC response exceeds recovery limit.");
  if (!response.body) throw Error("RPC returned no response body.");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_RPC_BYTES) {
        await reader.cancel();
        throw Error("RPC response exceeds recovery limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks, length),
    ),
  );
}

function rpcRequest(url) {
  let nextId = 0;
  return async ({ method, params = [] }) => {
    if (!READ_METHODS.has(method) || !Array.isArray(params))
      throw Error("Recovery RPC method is not allowed: " + method);
    const id = ++nextId;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Error("RPC HTTP " + response.status);
    const body = await responseJSON(response);
    if (!body || body.jsonrpc !== "2.0" || body.id !== id)
      throw Error("RPC response does not match the request.");
    if (body.error)
      throw Error(
        "RPC error: " + String(body.error.message || body.error.code),
      );
    if (!Object.hasOwn(body, "result"))
      throw Error("RPC response has no result.");
    return body.result;
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      rpc: { type: "string" },
      chain: { type: "string" },
      registry: { type: "string" },
      release: { type: "string" },
      token: { type: "string" },
      output: { type: "string" },
      block: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  for (const name of ["rpc", "chain", "registry", "output"])
    if (!values[name]) throw Error("Missing --" + name + ". Use --help.");
  if (
    !/^0x[0-9a-fA-F]{40}$/.test(values.registry) ||
    /^0x0{40}$/i.test(values.registry)
  )
    throw Error("Registry must be a nonzero Ethereum address.");
  if (!!values.release === !!values.token) throw Error("Choose exactly one of --release or --token.");
  if (values.release && (
    !/^0x[0-9a-fA-F]{64}$/.test(values.release) ||
    /^0x0{64}$/i.test(values.release)
  ))
    throw Error("Release must be a nonzero 32-byte ID.");
  const chainId = uint(values.chain, "Chain ID");
  if (chainId === 0n) throw Error("Chain ID must be positive.");
  const block =
    values.block === undefined
      ? undefined
      : "0x" + uint(values.block, "Block").toString(16);
  const url = new URL(values.rpc);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw Error("Use HTTPS or an HTTP loopback RPC.");
  if (url.username || url.password || url.hash)
    throw Error("RPC URL must not contain userinfo or a fragment.");
  const output = path.resolve(values.output);
  await ensureFresh(output);
  const { canonicalJSON, canonicalManifest } = await import(
    "../packages/modules/sdk.mjs"
  );
  const { recoverRelease, recoverToken } = await import("../packages/modules/chain.mjs");
  if (values.token) {
    const result=await recoverToken({request:rpcRequest(url),registry:values.registry.toLowerCase(),tokenId:uint(values.token,"Token ID").toString(),chainId:chainId.toString(),...(block===undefined?{}:{block})});
    await saveTokenRecovery(output,result,canonicalJSON,canonicalManifest);
    console.log(canonicalJSON({recovered:true,tokenId:result.context.tokenId,output,releaseCount:result.packages.length,stateCount:result.states.length,snapshot:result.snapshot}));
    return;
  }
  const recovered = await recoverRelease({
    request: rpcRequest(url),
    registry: values.registry.toLowerCase(),
    releaseId: values.release.toLowerCase(),
    chainId: chainId.toString(),
    ...(block === undefined ? {} : { block }),
  });
  if (recovered.releaseId !== values.release.toLowerCase())
    throw Error("Recovered release differs from the requested release.");
  if (
    recovered.dependencies !== undefined &&
    !Array.isArray(recovered.dependencies)
  )
    throw Error("Invalid recovered dependency collection.");
  const releases = [recovered, ...(recovered.dependencies || [])];
  const seenReleases = new Set();
  for (const release of releases) {
    if (
      !/^0x[0-9a-f]{64}$/.test(release.releaseId) ||
      seenReleases.has(release.releaseId)
    )
      throw Error("Invalid or duplicate recovered release ID.");
    seenReleases.add(release.releaseId);
    const names = new Set();
    if (!Array.isArray(release.files) || release.files.length === 0)
      throw Error("Recovery returned no files.");
    for (const file of release.files) {
      safePath(file.path);
      if (names.has(file.path))
        throw Error("Duplicate recovered path: " + file.path);
      names.add(file.path);
      if (!(file.bytes instanceof Uint8Array))
        throw Error("Recovery returned invalid bytes: " + file.path);
    }
    if (!names.has(release.entrypoint))
      throw Error("Recovered entrypoint is missing.");
  }
  const fileReceipt = (release) =>
    release.files.map((file) => ({
      path: file.path,
      mime: file.mime,
      byteLength: file.bytes.length,
      sha256: digest(file.bytes),
    }));
  // Normalize potential BigInt snapshot values without changing the manifest bytes.
  const snapshot = JSON.parse(
    JSON.stringify(recovered.snapshot, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
  const receipt = {
    schema: "anima.module-recovery-receipt/1",
    releaseId: recovered.releaseId,
    registry: values.registry.toLowerCase(),
    chainId: chainId.toString(),
    snapshot,
    entrypoint: recovered.entrypoint,
    files: fileReceipt(recovered),
    dependencies: releases.slice(1).map((release) => ({
      releaseId: release.releaseId,
      directory: "dependencies/" + release.releaseId,
      entrypoint: release.entrypoint,
      files: fileReceipt(release),
    })),
  };
  let created = false;
  try {
    const parent = path.dirname(output);
    await fs.mkdir(parent, { recursive: true });
    if ((await fs.realpath(parent)) !== parent)
      throw Error("Output parent must not contain symlinks.");
    await fs.mkdir(output);
    created = true;
    for (const release of releases) {
      const releaseRoot =
        release === recovered
          ? output
          : path.join(output, "dependencies", release.releaseId);
      const fileRoot = path.join(releaseRoot, "files");
      await fs.mkdir(fileRoot, { recursive: true });
      for (const file of release.files) {
        const target = path.join(fileRoot, file.path);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, file.bytes, { flag: "wx" });
      }
      await fs.writeFile(path.join(releaseRoot,"archive.bin"),release.archive,{flag:"wx"});
      await fs.writeFile(
        path.join(releaseRoot, "manifest.json"),
        canonicalManifest(release.manifest),
        { flag: "wx" },
      );
    }
    await fs.writeFile(
      path.join(output, "receipt.json"),
      canonicalJSON(receipt) + "\n",
      { flag: "wx" },
    );
  } catch (error) {
    if (created) await fs.rm(output, { recursive: true, force: true });
    throw error;
  }
  console.log(
    canonicalJSON({
      recovered: true,
      releaseId: recovered.releaseId,
      output,
      chainId: chainId.toString(),
      snapshot,
      entrypoint: recovered.entrypoint,
      releaseCount: releases.length,
      fileCount: releases.reduce(
        (sum, release) => sum + release.files.length,
        0,
      ),
      byteLength: releases.reduce(
        (sum, release) =>
          sum +
          release.files.reduce((size, file) => size + file.bytes.length, 0),
        0,
      ),
    }),
  );
}

async function saveTokenRecovery(output,result,canonicalJSON,canonicalManifest){
 let created=false;
 try{
  const parent=path.dirname(output);await fs.mkdir(parent,{recursive:true});if(await fs.realpath(parent)!==parent)throw Error('Output parent must not contain symlinks.');await fs.mkdir(output);created=true;
  const packages=[];
  for(const release of result.packages){
   if(!/^0x[0-9a-f]{64}$/.test(release.releaseId))throw Error('Invalid recovered release ID');
   const base=path.join(output,'releases',release.releaseId);await fs.mkdir(path.join(base,'files'),{recursive:true});
   for(const file of release.files){safePath(file.path);const target=path.join(base,'files',file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,file.bytes,{flag:'wx'});}
   await fs.writeFile(path.join(base,'manifest.json'),canonicalManifest(release.manifest),{flag:'wx'});
   await fs.writeFile(path.join(base,'archive.bin'),release.archive,{flag:'wx'});
   packages.push({releaseId:release.releaseId,moduleKey:release.moduleKey,manifestHash:digest(Buffer.from(canonicalManifest(release.manifest))),directory:'releases/'+release.releaseId});
  }
  await fs.mkdir(path.join(output,'states'));const states=[];
  for(const state of result.states){if(!/^0x[0-9a-f]{64}$/.test(state.stateId))throw Error('Invalid state ID');await fs.writeFile(path.join(output,'states',state.stateId+'.bin'),state.bytes,{flag:'wx'});await fs.writeFile(path.join(output,'states',state.stateId+'.json'),canonicalJSON(state.record),{flag:'wx'});states.push({stateId:state.stateId,moduleKey:state.moduleKey,byteLength:state.bytes.length,sha256:digest(state.bytes)});}
  await fs.writeFile(path.join(output,'context.json'),canonicalJSON(result.context)+'\n',{flag:'wx'});
  await fs.writeFile(path.join(output,'receipt.json'),canonicalJSON({schema:'anima.token-recovery-receipt/1',snapshot:result.snapshot,registry:result.context.registry,collection:result.context.collection,tokenId:result.context.tokenId,root:result.context.root,expandedBytes:result.expandedBytes,packages,states})+'\n',{flag:'wx'});
 }catch(error){if(created)await fs.rm(output,{recursive:true,force:true});throw error;}
}

main().catch((error) => {
  console.error("Module recovery failed: " + error.message);
  process.exitCode = 1;
});
