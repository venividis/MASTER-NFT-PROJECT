import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const manifestName = 'SOURCE-SHA256.json';
export const exclusionPolicy = {
  directoryNames: ['.git', 'node_modules', 'target', '__pycache__', '.cache', 'coverage', '.sites-runtime', '.local-genesis'],
  generatedDirectoryPrefixes: ['release.stage-', 'release.previous-', 'dist.stage-', 'dist.previous-', 'onchain-app/confluence.stage-', 'onchain-app/confluence.previous-'],
  fileNames: ['.DS_Store'],
  suffixes: ['.log', '.pyc'],
  rootPaths: ['web/deployment.local.json'],
  environment: 'Exclude .env and .env.* except .env.example; never package local credentials.',
  manifest: manifestName,
};
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const portable = name => name.split(path.sep).join('/');

/** Filesystem enumeration is identical in Git checkouts and extracted source archives. */
export function releaseFiles(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name), relative = portable(path.relative(root, file));
      if (entry.isDirectory() && exclusionPolicy.generatedDirectoryPrefixes.some(prefix => relative.startsWith(prefix))) continue;
      if (exclusionPolicy.directoryNames.includes(entry.name) || exclusionPolicy.fileNames.includes(entry.name) ||
          exclusionPolicy.suffixes.some(suffix => entry.name.endsWith(suffix)) || exclusionPolicy.rootPaths.includes(relative) ||
          (entry.name !== '.env.example' && (entry.name === '.env' || entry.name.startsWith('.env.'))) || relative === manifestName) continue;
      if (entry.isSymbolicLink()) throw Error('Release contains a symlink; replace it with reviewed regular bytes: ' + relative);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.push(relative);
      else throw Error('Unsupported release file type: ' + relative);
    }
  }
  walk(path.resolve(root));
  return files.sort();
}

export function createSourceManifest(root) {
  const files = Object.fromEntries(releaseFiles(root).map(name => [name, digest(fs.readFileSync(path.join(root, name)))]));
  return {
    schema: 'anima.release-integrity/3', algorithm: 'sha256',
    scope: 'All distributable regular files: source, generated outputs, references, tests and evidence. Hashes establish file integrity, not security or test execution.',
    exclusionPolicy, files,
  };
}

export function writeSourceManifest(root) {
  const manifest = createSourceManifest(root);
  fs.writeFileSync(path.join(root, manifestName), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export function verifySourceManifest(root) {
  const recorded = JSON.parse(fs.readFileSync(path.join(root, manifestName), 'utf8'));
  if (recorded.schema !== 'anima.release-integrity/3' || recorded.algorithm !== 'sha256' || JSON.stringify(recorded.exclusionPolicy) !== JSON.stringify(exclusionPolicy)) throw Error('Regenerate the integrity manifest with the current explicit release policy.');
  if (!recorded.files || typeof recorded.files !== 'object' || Array.isArray(recorded.files)) throw Error('Malformed integrity manifest.');
  const current = createSourceManifest(root), changed = [], missing = [], unlisted = [];
  for (const [name, hash] of Object.entries(recorded.files)) {
    if (!Object.hasOwn(current.files, name)) missing.push(name);
    else if (current.files[name] !== hash) changed.push(name);
  }
  for (const name of Object.keys(current.files)) if (!Object.hasOwn(recorded.files, name)) unlisted.push(name);
  if (changed.length || missing.length || unlisted.length) {
    const details = Object.entries({changed, missing, unlisted}).filter(([, names]) => names.length).map(([kind, names]) => `${kind} (${names.length}): ${names.slice(0, 20).join(', ')}${names.length > 20 ? ', …' : ''}`).join('\n');
    throw Error('Release integrity verification failed.\n' + details);
  }
  return current;
}
