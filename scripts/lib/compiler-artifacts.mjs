import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export const portable = value => value.split(path.sep).join('/');

export function solidityFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.isSymbolicLink()) throw Error('Compiler sources must be regular files: ' + entry.name);
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? solidityFiles(file) : entry.name.endsWith('.sol') ? [file] : [];
  });
}

/** Preserve source-qualified identity without duplicating unique artifacts for legacy consumers. */
export function emitCompilerArtifacts({output, input, compiler, artifactDirectory, buildInputs = {}}) {
  const counts = new Map();
  for (const contracts of Object.values(output.contracts ?? {})) {
    for (const name of Object.keys(contracts)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const index = {
    schema: 'anima.compiler-artifacts/1', compiler,
    compilerInputSha256: sha256(JSON.stringify(input)),
    language: input.language, settings: input.settings,
    sources: Object.fromEntries(Object.entries(input.sources).map(([name, source]) => [name, sha256(source.content)])),
    buildInputs, aliases: {}, artifacts: {},
  };
  const sizes = [];
  fs.mkdirSync(artifactDirectory, {recursive: true});
  for (const [sourceName, contracts] of Object.entries(output.contracts ?? {})) {
    if (path.isAbsolute(sourceName) || sourceName.split('/').some(part => part === '..' || !part)) throw Error('Invalid compiler source path.');
    for (const [contractName, contract] of Object.entries(contracts)) {
      const artifact = {
        contractName, sourceName, compiler, abi: contract.abi,
        immutableReferences: contract.evm.deployedBytecode.immutableReferences ?? {},
        linkReferences: contract.evm.bytecode.linkReferences ?? {},
        deployedLinkReferences: contract.evm.deployedBytecode.linkReferences ?? {},
        bytecode: '0x' + contract.evm.bytecode.object,
        deployedBytecode: '0x' + contract.evm.deployedBytecode.object,
        methodIdentifiers: contract.evm.methodIdentifiers,
        metadata: JSON.parse(contract.metadata),
      };
      const identity = `${sourceName}:${contractName}`;
      const file = counts.get(contractName) === 1 ? `${contractName}.json` : `qualified/${sourceName}/${contractName}.json`;
      const bytes = JSON.stringify(artifact, null, 2) + '\n';
      fs.mkdirSync(path.dirname(path.join(artifactDirectory, file)), {recursive: true});
      fs.writeFileSync(path.join(artifactDirectory, file), bytes);
      index.artifacts[identity] = {file, sha256: sha256(bytes)};
      if (counts.get(contractName) === 1) index.aliases[contractName] = identity;
      sizes.push({contract: contractName, source: sourceName, deployedBytes: contract.evm.deployedBytecode.object.length / 2});
    }
  }
  fs.writeFileSync(path.join(artifactDirectory, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  return {index, sizes};
}

/** Read-only freshness check: source files, compiler recipe, aliases and every emitted artifact. */
export function verifyCompilation(root, {artifactDirectory = path.join(root, 'contracts/artifacts')} = {}) {
  const index = JSON.parse(fs.readFileSync(path.join(artifactDirectory, 'index.json'), 'utf8'));
  if (index.schema !== 'anima.compiler-artifacts/1') throw Error('Recompile: missing current compiler artifact index.');
  const sourceNames = solidityFiles(path.join(root, 'contracts/src')).map(file => portable(path.relative(root, file))).sort();
  if (JSON.stringify(sourceNames) !== JSON.stringify(Object.keys(index.sources).sort())) throw Error('Recompile: Solidity source inventory changed.');
  const sources = {};
  for (const [name, hash] of Object.entries(index.sources)) {
    const content = fs.readFileSync(path.join(root, name), 'utf8');
    if (sha256(content) !== hash) throw Error('Recompile: Solidity source changed: ' + name);
    sources[name] = {content};
  }
  for (const [name, hash] of Object.entries(index.buildInputs)) {
    if (sha256(fs.readFileSync(path.join(root, name))) !== hash) throw Error('Recompile: compiler build input changed: ' + name);
  }
  if (sha256(JSON.stringify({language: index.language, sources, settings: index.settings})) !== index.compilerInputSha256) throw Error('Compiler input fingerprint mismatch.');
  const solcVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).dependencies.solc;
  if (!index.compiler.startsWith(solcVersion + '+')) throw Error('Recompile with the pinned Solidity compiler.');
  const recorded = new Set(['index.json']);
  for (const [identity, record] of Object.entries(index.artifacts)) {
    const file = path.resolve(artifactDirectory, record.file);
    if (!file.startsWith(path.resolve(artifactDirectory) + path.sep) || recorded.has(record.file)) throw Error('Invalid or duplicate qualified artifact path.');
    const bytes = fs.readFileSync(file), artifact = JSON.parse(bytes);
    if (sha256(bytes) !== record.sha256) throw Error('Compiler artifact changed: ' + identity);
    if (`${artifact.sourceName}:${artifact.contractName}` !== identity || artifact.compiler !== index.compiler) throw Error('Compiler artifact identity mismatch: ' + identity);
    if (!artifact.immutableReferences || typeof artifact.immutableReferences !== 'object' || Array.isArray(artifact.immutableReferences)) throw Error('Artifact lacks immutable reference metadata: ' + identity);
    recorded.add(record.file);
  }
  for (const [alias, identity] of Object.entries(index.aliases)) {
    if (index.artifacts[identity]?.file !== alias + '.json' || !identity.endsWith(':' + alias)) throw Error('Artifact alias identity mismatch.');
  }
  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error('Unexpected artifact symlink.');
      if (entry.isDirectory()) inspect(file);
      else if (!recorded.has(portable(path.relative(artifactDirectory, file)))) throw Error('Unlisted compiler artifact: ' + file);
    }
  }
  inspect(artifactDirectory);
  return index;
}
