import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {discoverModules, hashFiles, listFiles} from '../../scripts/lib/runtime-graph.mjs';
import {expandedRuntime} from '../../scripts/lib/runtime-archive.mjs';
import {verifyGenesisRuntimeSource} from '../../scripts/lib/genesis-deployment.mjs';

test('deployment rejects an internally consistent old archive when source or its rebuilt runtime changes', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anima-deployment-source-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const dist = path.join(root, 'dist'), entry = 'web/app.js';
  for (const directory of ['web', 'dist/web/cartridges', 'dist/abis']) fs.mkdirSync(path.join(root, directory), {recursive: true});
  fs.writeFileSync(path.join(root, entry), 'export const version = 1;');
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html><head></head><body><script type="module" src="web/app.js"></script></body></html>');
  fs.writeFileSync(path.join(dist, 'web/cartridges/lumen-drift.html'), '<!doctype html>');
  fs.writeFileSync(path.join(dist, 'abis/CartridgeRegistry.json'), '{"abi":[]}');
  const build = async () => {
    fs.copyFileSync(path.join(root, entry), path.join(dist, entry));
    const files = listFiles(dist).filter(name => name !== 'build-manifest.json');
    const manifest = {schema: 'anima.source-build/1', entry, inputs: hashFiles(root, [entry]), moduleGraph: await discoverModules(dist, [entry]), outputs: hashFiles(dist, files)};
    fs.writeFileSync(path.join(dist, 'build-manifest.json'), JSON.stringify(manifest));
    return expandedRuntime(root);
  };
  const first = await build();
  const runtime = {manifest: {buildManifestSha256: first.buildManifestSha256, moduleGraph: first.moduleGraph}, expanded: Buffer.from(first.html)};
  await verifyGenesisRuntimeSource(runtime, root);
  fs.writeFileSync(path.join(root, entry), 'export const version = 2;');
  await assert.rejects(verifyGenesisRuntimeSource(runtime, root), /Build source changed/);
  const second = await build();
  await assert.rejects(verifyGenesisRuntimeSource(runtime, root), /archive is stale/);
  await verifyGenesisRuntimeSource({manifest: {buildManifestSha256: second.buildManifestSha256, moduleGraph: second.moduleGraph}, expanded: Buffer.from(second.html)}, root);
});
