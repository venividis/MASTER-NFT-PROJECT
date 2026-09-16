import fs from 'node:fs';
import path from 'node:path';
import {sha256} from './compiler-artifacts.mjs';

export function verifyV4Compilation(projectRoot) {
  const root = path.join(projectRoot, 'integrations/console/protocol/v4-hook');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/compilation-inputs.json'), 'utf8'));
  if (manifest.schema !== 'anima.v4-compilation/1' || !manifest.compiler.startsWith('0.8.26+') || manifest.settings?.evmVersion !== 'cancun') throw Error('Recompile v4 with the pinned Cancun compiler and current manifest.');
  const read = name => {
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep)) throw Error('Invalid v4 fingerprint path.');
    return fs.readFileSync(file);
  };
  for (const [name, record] of Object.entries(manifest.sources)) {
    if (sha256(read(record.path)) !== record.sha256) throw Error('Recompile v4: source changed: ' + name);
  }
  for (const [name, hash] of Object.entries(manifest.buildInputs)) {
    if (sha256(read(name)) !== hash) throw Error('Recompile v4: compiler build input changed: ' + name);
  }
  for (const [identity, record] of Object.entries(manifest.artifacts)) {
    const bytes = read('artifacts/' + record.file), artifact = JSON.parse(bytes);
    if (sha256(bytes) !== record.sha256 || artifact.sourceName + ':' + artifact.contractName !== identity || artifact.compiler !== manifest.compiler) throw Error('Recompile v4: artifact fingerprint or identity changed: ' + identity);
  }
  return manifest;
}
