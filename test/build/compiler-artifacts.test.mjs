import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import solc from 'solc';
import {emitCompilerArtifacts, verifyCompilation, sha256} from '../../scripts/lib/compiler-artifacts.mjs';

test('real Base64 libraries retain distinct identities and compiler freshness rejects source/output/recipe drift', t => {
  const project = path.resolve(import.meta.dirname, '../..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anima-qualified-artifacts-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const names = ['contracts/src/confluence/vendor/solady/utils/Base64.sol', 'contracts/src/lib/Base64.sol', 'contracts/src/extensions/privacy/PrivacyKeys.sol'];
  const sources = {};
  for (const name of names) {
    const content = fs.readFileSync(path.join(project, name), 'utf8');
    fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
    fs.writeFileSync(path.join(root, name), content);
    sources[name] = {content};
  }
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({dependencies: {solc: '0.8.30'}}));
  fs.writeFileSync(path.join(root, 'recipe.mjs'), 'export const recipe = 1;');
  const input = {language: 'Solidity', sources, settings: {optimizer: {enabled: true, runs: 1000}, evmVersion: 'shanghai', outputSelection: {'*': {'*': ['abi', 'metadata', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.deployedBytecode.immutableReferences']}}}};
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  assert.deepEqual((output.errors ?? []).filter(diagnostic => diagnostic.severity === 'error'), []);
  const artifactDirectory = path.join(root, 'contracts/artifacts');
  const {index} = emitCompilerArtifacts({output, input, compiler: solc.version(), artifactDirectory, buildInputs: {'recipe.mjs': sha256(fs.readFileSync(path.join(root, 'recipe.mjs')))}});
  assert.equal(index.aliases.Base64, undefined, 'ambiguous basename must not silently select a library');
  assert.equal(fs.existsSync(path.join(artifactDirectory, 'Base64.json')), false);
  const base64 = Object.entries(index.artifacts).filter(([identity]) => identity.endsWith(':Base64'));
  assert.equal(base64.length, 2);
  assert.notEqual(base64[0][1].file, base64[1][1].file);
  assert.notEqual(base64[0][1].sha256, base64[1][1].sha256);
  assert.deepEqual(verifyCompilation(root), index);
  const file = path.join(artifactDirectory, 'PrivacyKeys.json'), original = fs.readFileSync(file);
  const changed = JSON.parse(original); delete changed.immutableReferences;
  fs.writeFileSync(file, JSON.stringify(changed));
  assert.throws(() => verifyCompilation(root), /artifact changed/);
  fs.writeFileSync(file, original);
  const source = path.join(root, names[2]); fs.appendFileSync(source, '\n// changed source\n');
  assert.throws(() => verifyCompilation(root), /Solidity source changed/);
  fs.writeFileSync(source, sources[names[2]].content);
  fs.writeFileSync(path.join(root, 'recipe.mjs'), 'export const recipe = 2;');
  assert.throws(() => verifyCompilation(root), /compiler build input changed/);
});
