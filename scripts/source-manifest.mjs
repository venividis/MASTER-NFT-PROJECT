import path from 'node:path';
import {writeSourceManifest, verifySourceManifest} from './lib/source-integrity.mjs';

const args = process.argv.slice(2), command = args.shift() ?? 'generate';
let root = path.resolve(import.meta.dirname, '..');
if (args[0] === '--root' && args[1]) { root = path.resolve(args[1]); args.splice(0, 2); }
if (args.length || !['generate', 'verify'].includes(command)) throw Error('Usage: node scripts/source-manifest.mjs generate|verify [--root extracted-project-directory]');
const manifest = command === 'generate' ? writeSourceManifest(root) : verifySourceManifest(root);
console.log(`${command === 'generate' ? 'Recorded' : 'Verified'} ${Object.keys(manifest.files).length} distributable files. No tests or security certification are implied.`);
