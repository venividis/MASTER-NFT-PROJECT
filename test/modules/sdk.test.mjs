import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalJSON,canonicalManifest,manifestHash,parseManifest,validateManifest,packageFiles,packageLegacyHTML,verifyArchive,resolveReleaseGraph,planChunks,sha256,ZERO_HASH,LIMITS} from '../../packages/modules/sdk.mjs';
const owner='0x'+'11'.repeat(20),meta={name:'notes',version:1,publisher:owner,entrypoint:'index.html'};
const files=[{path:'index.html',mime:'text/html',bytes:new TextEncoder().encode('<h1>ANIMA</h1>'),imports:[]}];

test('portable digest matches independent SHA-256 for empty, boundary and binary inputs',()=>{
 for(const size of [0,1,55,56,63,64,65,8192,23000]){const bytes=Uint8Array.from({length:size},(_,i)=>i%251);assert.equal(sha256(bytes),'0x'+createHash('sha256').update(bytes).digest('hex'));}
});
test('canonical manifest commits capabilities, entrypoint, exact dependencies and format',async()=>{
 const p=await packageFiles(files,meta);assert.equal(parseManifest(canonicalManifest(p.manifest),p.manifestHash).name,'notes');
 for(const change of [{entrypoint:'other.html'},{dependencies:['0x'+'22'.repeat(32)]},{capabilities:['identity.read']},{version:2}])assert.notEqual(manifestHash({...p.manifest,...change}),p.manifestHash);
 assert.throws(()=>parseManifest(JSON.stringify(p.manifest),p.manifestHash),/Noncanonical/);
 assert.throws(()=>canonicalJSON({a:undefined}));assert.throws(()=>canonicalJSON({n:1.5}));assert.throws(()=>canonicalJSON({n:-0}));
});
test('packaging is deterministic and verifies raw and gzip without executing payloads',async()=>{
 globalThis.__animaModuleExecuted=false;
 const inputs=[...files,{path:'program.mjs',mime:'text/javascript',bytes:'globalThis.__animaModuleExecuted=true;',imports:[]}];
 for(const compression of ['raw','gzip']){const a=await packageFiles(inputs,meta,{compression}),b=await packageFiles([...inputs].reverse(),meta,{compression});assert.deepEqual(a.archive,b.archive);assert.equal(a.manifestHash,b.manifestHash);const recovered=await verifyArchive(a.manifest,a.archive);assert.deepEqual(recovered.files.map(f=>f.path),['index.html','program.mjs']);assert.equal(new TextDecoder().decode(recovered.files[1].bytes),inputs[1].bytes);}
 assert.equal(globalThis.__animaModuleExecuted,false);delete globalThis.__animaModuleExecuted;
});
test('unsafe paths, duplicate files, absent entrypoints/imports and unsupported permissions fail',async()=>{
 for(const path of ['../escape','/root.html','a/../b.js','a\\b.js','a//b.js','a/%2e.js'])await assert.rejects(()=>packageFiles([{...files[0],path}],{...meta,entrypoint:path}),/Unsafe/);
 await assert.rejects(()=>packageFiles([...files,...files],meta),/Duplicate/);
 await assert.rejects(()=>packageFiles(files,{...meta,entrypoint:'absent.html'}),/entrypoint/);
 await assert.rejects(()=>packageFiles([{...files[0],imports:['missing.js']}],meta),/Missing imported/);
 await assert.rejects(()=>packageFiles(files,{...meta,capabilities:['wallet.unlimited']}),/capability/);
 await assert.rejects(()=>packageFiles(files,{...meta,capabilities:['state.write']}),/state schema/);
});
test('stored corruption and bounded decompression fail before any code is returned',async()=>{
 const p=await packageFiles([{...files[0],bytes:'X'.repeat(100000)}],meta);const changed=p.archive.slice();changed[changed.length-1]^=1;
 await assert.rejects(()=>verifyArchive(p.manifest,changed),/Stored archive/);
 const short=structuredClone(p.manifest);short.archive.expandedBytes=64;await assert.rejects(()=>verifyArchive(short,p.archive),/budget/);
 const wrong=structuredClone(p.manifest);wrong.archive.expandedHash='0x'+'ff'.repeat(32);await assert.rejects(()=>verifyArchive(wrong,p.archive),/Expanded archive/);
 const future={...p.manifest,hostAPI:'anima.host/100'};assert.throws(()=>validateManifest(future),/Unsupported/);
});
test('HTML packaging preserves exact original bytes and enforces the old host bound',async()=>{
 const html='<!doctype html>\n<p>Original \u{1f30a}</p>';const p=await packageLegacyHTML(html,meta);assert.equal(p.manifest.format,'html');assert.equal(p.manifest.archive.compression,'raw');assert.equal(new TextDecoder().decode((await verifyArchive(p.manifest,p.archive)).files[0].bytes),html);
 await assert.rejects(()=>packageLegacyHTML('x'.repeat(1048577),meta),/Legacy HTML/);
});
test('dependency closure fetches only selected releases and detects substitution/bounds',async()=>{
 const dep=await packageFiles(files,{...meta,name:'dependency'}),selected=await packageFiles(files,{...meta,dependencies:[dep.manifestHash]}),unrelated=await packageFiles(files,{...meta,name:'unrelated'});
 const entries=new Map([dep,selected,unrelated].map(p=>[p.manifestHash,p.manifest]));const fetched=[];
 const ordered=await resolveReleaseGraph([selected.manifestHash],async id=>{fetched.push(id);return entries.get(id);});assert.deepEqual(ordered.map(m=>m.name),['dependency','notes']);assert.equal(fetched.includes(unrelated.manifestHash),false);
 await assert.rejects(()=>resolveReleaseGraph([selected.manifestHash],async()=>unrelated.manifest),/hash mismatch/);
 await assert.rejects(()=>resolveReleaseGraph([selected.manifestHash],id=>entries.get(id),{maxDepth:1}),/budget/);
});
test('chunk plans reuse repeated payloads and supplied addresses without changing order',()=>{
 const bytes=new Uint8Array(23000*2+8).fill(7),first=planChunks(bytes);assert.equal(first.references.length,3);assert.equal(first.chunks.length,2);assert.equal(first.deployBytes,23008);
 const reused=planChunks(bytes,{existing:{[first.references[0]]:owner}});assert.equal(reused.deployBytes,8);assert.deepEqual(reused.references,first.references);assert.equal(reused.chunks[0].address,owner);
 assert.throws(()=>planChunks(bytes,{existing:{[first.references[0]]:'not-an-address'}}),/address/);
 assert.equal(LIMITS.dependencies,16);assert.equal(ZERO_HASH.length,66);
});
