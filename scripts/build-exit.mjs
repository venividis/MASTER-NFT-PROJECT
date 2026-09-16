import fs from 'node:fs';
import path from 'node:path';
import {keccak256} from 'ethers';

const root = path.resolve(import.meta.dirname, '..');
const artifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/artifacts/VestedExitVault.json'), 'utf8'));
if (artifact.contractName !== 'VestedExitVault' || !artifact.immutableReferences) throw Error('Compile the current VestedExitVault before generating its runtime pin.');
const masks = Object.values(artifact.immutableReferences).flat();
const runtime = Buffer.from(artifact.deployedBytecode.slice(2), 'hex');
for (const {start, length} of masks) {
  if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length < 1 || start + length > runtime.length) throw Error('Invalid immutable runtime span.');
  runtime.fill(0, start, start + length);
}
const expected = {contractName: artifact.contractName, sourceName: artifact.sourceName, abi: artifact.abi, bytes: runtime.length, masks, normalizedHash: keccak256(runtime)};
fs.writeFileSync(path.join(root, 'web/exit/artifacts.mjs'), '// Generated from the current compiled VestedExitVault.\nexport const EXIT_ARTIFACT=' + JSON.stringify(expected) + ';\n');
console.log('Exit vault ABI and normalized runtime fingerprint generated.');
