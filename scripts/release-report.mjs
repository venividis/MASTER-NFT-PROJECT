/** Read-only status. Never overwrite historical evidence or certify a release from hashes. */
import fs from 'node:fs';
import path from 'node:path';
import {verifySourceManifest} from './lib/source-integrity.mjs';
import {verifyCompilation} from './lib/compiler-artifacts.mjs';

const root = path.resolve(import.meta.dirname, '..');
const checks = {};
for (const [name, check] of Object.entries({releaseIntegrity: verifySourceManifest, compiledSourceFreshness: verifyCompilation})) {
  try { check(root); checks[name] = {status: 'passed'}; }
  catch (error) { checks[name] = {status: 'failed', reason: error.message}; process.exitCode = 1; }
}
console.log(JSON.stringify({version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version, checks, testExecution: 'Not performed by this command. See the dated validation record for actual test scope.'}, null, 2));
