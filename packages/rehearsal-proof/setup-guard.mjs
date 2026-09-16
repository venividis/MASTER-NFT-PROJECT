import { existsSync } from 'node:fs';
import path from 'node:path';

export const SETUP_ARTIFACTS = Object.freeze([
  'build/manifest.json', 'build/native-quote.zkey', 'build/initial.zkey',
  'build/initial.ptau', 'build/contributed.ptau', 'build/development.ptau',
  'build/verification-key.json', 'build/NativeQuoteGroth16Verifier.sol',
  'setup-manifest.json', 'artifacts/manifest.json',
  'artifacts/native-quote.wasm', 'artifacts/native-quote.zkey',
  'artifacts/verification-key.json',
  '../../contracts/src/extensions/proof/NativeQuoteGroth16Verifier.sol'
]);

export function assertSetupReplacement(root, { replace = false } = {}) {
  const existing = SETUP_ARTIFACTS.filter(file => existsSync(path.resolve(root, file)));
  if (existing.length && !replace) {
    throw Error('Setup already exists in committed or build artifacts. Use --replace-development-setup to generate a NEW development key and verifier. Use --compile-only to check the circuit without replacing its setup.');
  }
  return existing;
}
