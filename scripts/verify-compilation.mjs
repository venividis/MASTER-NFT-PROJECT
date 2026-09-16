import path from 'node:path';
import {verifyCompilation} from './lib/compiler-artifacts.mjs';

const index = verifyCompilation(path.resolve(import.meta.dirname, '..'));
console.log(`Verified ${Object.keys(index.artifacts).length} source-qualified artifacts against current Solidity and compiler inputs (${index.settings.evmVersion}).`);
