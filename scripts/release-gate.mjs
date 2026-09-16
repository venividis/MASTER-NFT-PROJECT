import fs from 'node:fs';
import path from 'node:path';
import {verifyCompilation} from './lib/compiler-artifacts.mjs';

const root = path.resolve(import.meta.dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
try { verifyCompilation(root); console.error(`ANIMA ${version}: compiled source fingerprints are current.`); }
catch (error) { console.error(`ANIMA ${version}: ${error.message}`); }
console.error('This package has no automatic public deployment command. Prepare an unsigned, chain-specific plan with genesis:deployment, extensions:deployment, or v4:deployment; review its constructor arguments, trust configuration and current validation evidence before using the corresponding explicit deployment workflow. For the disposable local fixture use genesis:local. No transaction was sent.');
process.exitCode = 1;
