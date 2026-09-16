import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { SETUP_ARTIFACTS, assertSetupReplacement } from '../../packages/rehearsal-proof/setup-guard.mjs';

test('Every existing setup artifact requires explicit replacement, even without transient build manifest', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'anima-setup-guard-'));
  t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  const root = path.join(temp,'packages','rehearsal-proof');
  await fs.mkdir(root,{recursive:true});
  assert.deepEqual(assertSetupReplacement(root), []);
  for (const relative of SETUP_ARTIFACTS) {
    const file=path.resolve(root,relative); await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,'existing setup');
    assert.throws(()=>assertSetupReplacement(root), /replace-development-setup/);
    assert.deepEqual(assertSetupReplacement(root,{replace:true}),[relative]);
    assert.equal(await fs.readFile(file,'utf8'),'existing setup'); await fs.unlink(file);
  }
});

test('Fresh checkout setup command fails before invoking tooling or writing build files', async t => {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'anima-setup-cli-'));
  t.after(()=>fs.rm(temp,{recursive:true,force:true}));
  for (const file of ['setup.mjs','setup-guard.mjs']) await fs.copyFile(new URL('../../packages/rehearsal-proof/'+file,import.meta.url),path.join(temp,file));
  await fs.writeFile(path.join(temp,'setup-manifest.json'),'unchanged manifest');
  const result=spawnSync(process.execPath,[path.join(temp,'setup.mjs')],{encoding:'utf8'});
  assert.notEqual(result.status,0); assert.match(result.stderr,/committed or build artifacts/); assert.doesNotMatch(result.stderr,/Cannot find module/);
  assert.equal(await fs.readFile(path.join(temp,'setup-manifest.json'),'utf8'),'unchanged manifest');
  await assert.rejects(fs.stat(path.join(temp,'build')), {code:'ENOENT'});
});
