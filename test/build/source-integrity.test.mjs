import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {writeSourceManifest, verifySourceManifest} from '../../scripts/lib/source-integrity.mjs';

test('release integrity works without git and detects changed, missing and unlisted source or generated outputs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anima-integrity-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const directory of ['web', 'dist', 'node_modules', '.git']) fs.mkdirSync(path.join(root, directory));
  fs.writeFileSync(path.join(root, 'web/app.mjs'), 'export const version = 1;');
  fs.writeFileSync(path.join(root, 'dist/index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(root, 'node_modules/local-only'), 'dependency');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=never-package');
  fs.writeFileSync(path.join(root, '.env.example'), 'RPC_URL=');
  const manifest = writeSourceManifest(root);
  assert.deepEqual(Object.keys(manifest.files), ['.env.example', 'dist/index.html', 'web/app.mjs']);
  assert.deepEqual(verifySourceManifest(root), manifest);
  fs.rmSync(path.join(root, '.git'), {recursive: true});
  assert.deepEqual(verifySourceManifest(root), manifest, 'extracted ZIP has the same distributable inventory');
  fs.writeFileSync(path.join(root, 'web/app.mjs'), 'export const version = 2;');
  assert.throws(() => verifySourceManifest(root), /changed \(1\): web\/app.mjs/);
  writeSourceManifest(root);
  fs.unlinkSync(path.join(root, 'dist/index.html'));
  assert.throws(() => verifySourceManifest(root), /missing \(1\): dist\/index.html/);
  writeSourceManifest(root);
  fs.writeFileSync(path.join(root, 'web/new.mjs'), 'export {};');
  assert.throws(() => verifySourceManifest(root), /unlisted \(1\): web\/new.mjs/);
});

test('release integrity refuses symlinks and detects changed exclusion policy', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anima-integrity-policy-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.writeFileSync(path.join(root, 'source.mjs'), 'export {};');
  const manifest = writeSourceManifest(root);
  manifest.exclusionPolicy = {...manifest.exclusionPolicy, rootPaths: ['source.mjs']};
  fs.writeFileSync(path.join(root, 'SOURCE-SHA256.json'), JSON.stringify(manifest));
  assert.throws(() => verifySourceManifest(root), /explicit release policy/);
  fs.symlinkSync('source.mjs', path.join(root, 'alias.mjs'));
  assert.throws(() => writeSourceManifest(root), /symlink/);
});

test('abandoned atomic output stages are excluded only at their reserved project paths', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anima-integrity-stages-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const name of ['release.stage-old', 'release.previous-123', 'dist.stage-old', 'dist.previous-123', 'onchain-app/confluence.stage-old', 'onchain-app/confluence.previous-123', 'docs/dist.stage-authored']) {
    fs.mkdirSync(path.join(root, name), {recursive: true});
    fs.writeFileSync(path.join(root, name, 'keep.txt'), 'content');
  }
  const manifest = writeSourceManifest(root);
  assert.deepEqual(Object.keys(manifest.files), ['docs/dist.stage-authored/keep.txt']);
  assert.deepEqual(verifySourceManifest(root), manifest);
});
