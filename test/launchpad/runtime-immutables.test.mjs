import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ARTIFACTS} from '../../web/v4/artifacts.mjs';
import {HOOK_ARTIFACTS} from '../../web/launchpad/hook-artifacts.mjs';
import {SALE_ARTIFACTS} from '../../web/launchpad/sale-artifacts.mjs';
import {normalizeRuntime,verifyContract} from '../../web/v4/client.mjs';
import {verifyHookContract} from '../../web/launchpad/hook-client.mjs';
import {verifySaleContract} from '../../web/launchpad/sale-client.mjs';

const root=new URL('../../',import.meta.url);
const load=path=>JSON.parse(fs.readFileSync(new URL(path,root),'utf8'));
const at=(code,ref,word)=>code.slice(0,2+ref.start*2)+word.padStart(ref.length*2,'0')+code.slice(2+(ref.start+ref.length)*2);
function populated(compiled,artifact){let code=compiled.deployedBytecode;for(const [i,group] of artifact.immutableGroups.entries())for(const ref of group)code=at(code,ref,(i+1).toString(16));return code;}
function forged(code,artifact){const group=artifact.immutableGroups.find(refs=>refs.length>1);assert.ok(group,'This regression needs a repeated immutable.');return at(code,group.at(-1),'dead');}
const cases=[
 ['GenesisV4Launchpad',ARTIFACTS,'integrations/console/protocol/v4-hook/artifacts/GenesisV4Launchpad.json'],
 ['GenesisV4Router',ARTIFACTS,'integrations/console/protocol/v4-hook/artifacts/GenesisV4Router.json'],
 ['GenesisV4HookLaunchpad',HOOK_ARTIFACTS,'integrations/console/protocol/v4-hook/artifacts/GenesisV4HookLaunchpad.json'],
 ['OwnerV4FeeHook',HOOK_ARTIFACTS,'integrations/console/protocol/v4-hook/artifacts/OwnerV4FeeHook.json'],
 ['GenesisLaunchpad',SALE_ARTIFACTS,'contracts/artifacts/GenesisLaunchpad.json'],
];

test('generated immutable groups preserve compiler identity and reject a single substituted executable copy',()=>{
 for(const [name,collection,path] of cases){
  const artifact=collection[name],compiled=load(path);assert.deepEqual(artifact.immutableGroups,Object.values(compiled.immutableReferences),name+' retains immutable grouping');assert.deepEqual(artifact.immutableGroups.flat(),artifact.masks);
  const good=populated(compiled,artifact);assert.equal(normalizeRuntime(good,artifact),artifact.normalizedHash,name+' accepts consistent constructor words');
  const bad=forged(good,artifact);assert.throws(()=>normalizeRuntime(bad,artifact),/immutable values are inconsistent/,name+' rejects a mismatched call-site copy');
  // This is precisely the previously missed case: masking alone gives the original fingerprint.
  assert.equal(normalizeRuntime(bad,{...artifact,immutableGroups:[]}),artifact.normalizedHash);
 }
});

test('factory, hook and community public verifiers reject forged copies before any reassuring getter can run',async()=>{
 let reads=0;
 for(const [name,collection,path] of [cases[0],cases[3],cases[4]]){
  const artifact=collection[name],bad=forged(populated(load(path),artifact),artifact),provider={getCode:async()=>bad,call:async()=>{reads++;throw Error('Getter must not run before executable consistency verification.');}},address='0x00000000000000000000000000000000000000c8',manager='0x0000000000000000000000000000000000000001';
  const run=name==='GenesisV4Launchpad'?()=>verifyContract(provider,address,name,manager):name==='OwnerV4FeeHook'?()=>verifyHookContract(provider,address,name,{manager}):()=>verifySaleContract(provider,address,name);
  await assert.rejects(run(),/immutable values are inconsistent/);assert.equal(reads,0);
 }
 const name='GenesisLaunchpad',artifact=SALE_ARTIFACTS[name],runtime=populated(load(cases[4][2]),artifact);const contract=await verifySaleContract({getCode:async()=>runtime},'0x0000000000000000000000000000000000000001',name);assert.equal(contract.target,'0x0000000000000000000000000000000000000001');
});
