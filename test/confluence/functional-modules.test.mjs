import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {archiveModule,sha256} from '../../scripts/lib/runtime-graph.mjs';
import {packageRuntimeModules,writeRuntimeModules,readRuntimeModules} from '../../scripts/lib/runtime-modules.mjs';
import {functionalCommitment,validateFunctionalEntries,expandFunctionalModule,assembleFunctionalRuntime,MODULE_IMPORT_MARKER} from '../../web/confluence/module-loader.mjs';

import {fixtureExpanded} from './functional-fixture.mjs';

test('functional archives reconstruct the exact runtime; only changed features increment their independent versions',async()=>{
 const first=packageRuntimeModules(await fixtureExpanded()),second=packageRuntimeModules(await fixtureExpanded('two'),{previous:{modules:first.entries}});assert.equal(first.entries.length,4);assert.equal(second.entries.find(m=>m.name==='launchpad').version,2);for(const name of ['core-shell','confluence','vendor']){const before=first.entries.find(m=>m.name===name),after=second.entries.find(m=>m.name===name);assert.equal(after.version,1);assert.equal(after.sha256,before.sha256);}
 const confluence=second.entries.find(m=>m.name==='confluence'),launchIndex=second.entries.findIndex(m=>m.name==='launchpad');assert.equal(confluence.dependencies.find(d=>d.index===launchIndex).version,2);assert.notEqual(first.sha256,second.sha256);
 const recovered=[];for(let i=0;i<first.entries.length;i++)recovered.push(await expandFunctionalModule(first.entries[i].encoded.toString(),first.entries[i]));assert.equal(assembleFunctionalRuntime(first.entries,recovered,0,first.sha256),(await fixtureExpanded()).html);
});

test('missing dependencies, changed version requirements, substituted bytes and decompression overrun fail before execution',async()=>{
 const p=packageRuntimeModules(await fixtureExpanded()),clone=()=>structuredClone(p.entries);let entries=clone();entries[1].dependencies[0].version++;assert.throws(()=>validateFunctionalEntries(entries,0,functionalCommitment(entries,0)),/mismatched/);entries=clone();entries[1].dependencies=[];assert.throws(()=>assembleFunctionalRuntime(entries,p.payloads,0,functionalCommitment(entries,0)),/Declared dependencies/);
 const payloads=structuredClone(p.payloads);payloads[2].files[0].imports=['web/absent.mjs'];assert.throws(()=>assembleFunctionalRuntime(p.entries,payloads,0,p.sha256),/Missing imported/);
 await assert.rejects(()=>expandFunctionalModule(p.entries[0].encoded.toString().replace('gzip','xxxx'),p.entries[0]),/stored digest/);
 const wrong={...p.entries[1],expandedBytes:1};await assert.rejects(()=>expandFunctionalModule(p.entries[1].encoded.toString(),wrong),/exceeds/);
 const corrupt={...p.entries[1],expandedSha256:'1'.repeat(64)};await assert.rejects(()=>expandFunctionalModule(p.entries[1].encoded.toString(),corrupt),/expanded module digest/i);
 const unsafe=structuredClone(p.payloads);unsafe[1].files[0].path='../escape.mjs';assert.throws(()=>assembleFunctionalRuntime(p.entries,unsafe,0,p.sha256),/unsafe/);
});

test('filesystem module archive verifies every chunk, expanded hash, dependency version and exact source reconstruction',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anima-functional-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const expanded=await fixtureExpanded(),manifest=writeRuntimeModules(dir,expanded),file=path.join(dir,'manifest.json'),read=readRuntimeModules(file);assert.equal(read.archiveVersion,3);assert.equal(read.expanded.toString(),expanded.html);assert.equal(read.modules.length,4);
 const chunk=path.join(dir,manifest.chunks[0].file),original=fs.readFileSync(chunk);fs.writeFileSync(chunk,Buffer.from('changed'));assert.throws(()=>readRuntimeModules(file),/chunk integrity/);fs.writeFileSync(chunk,original);
 const altered=structuredClone(manifest);altered.modules[1].dependencies[0].version++;fs.writeFileSync(file,JSON.stringify(altered));assert.throws(()=>readRuntimeModules(file),/mismatched/);
});
