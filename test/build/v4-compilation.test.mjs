import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verifyV4Compilation} from '../../scripts/lib/v4-compilation.mjs';

test('the emitted v4 import closure catches changed upstream dependencies and runtime artifacts', t => {
  const project = path.resolve(import.meta.dirname, '../..');
  const packagePath = 'integrations/console/protocol/v4-hook';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anima-v4-freshness-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const source = path.join(project, packagePath), copy = path.join(root, packagePath);
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'artifacts/compilation-inputs.json')));
  const files = new Set(['artifacts/compilation-inputs.json', ...Object.values(manifest.sources).map(record => record.path), ...Object.keys(manifest.buildInputs), ...Object.values(manifest.artifacts).map(record => 'artifacts/' + record.file)]);
  for (const name of files) {
    fs.mkdirSync(path.dirname(path.join(copy, name)), {recursive: true});
    fs.copyFileSync(path.join(source, name), path.join(copy, name));
  }
  assert.deepEqual(verifyV4Compilation(root), manifest);
  const imported = Object.values(manifest.sources).find(record => record.path.startsWith('vendor/'));
  assert.ok(imported, 'the manifest must include actual upstream source bytes');
  const importedFile = path.join(copy, imported.path), original = fs.readFileSync(importedFile);
  fs.appendFileSync(importedFile, '\n// changed dependency\n');
  assert.throws(() => verifyV4Compilation(root), /source changed/);
  fs.writeFileSync(importedFile, original);
  const artifact = Object.values(manifest.artifacts).find(record => record.file === 'GenesisV4Launchpad.json');
  fs.appendFileSync(path.join(copy, 'artifacts', artifact.file), '\n');
  assert.throws(() => verifyV4Compilation(root), /artifact fingerprint or identity changed/);
});
