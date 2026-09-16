import {mkdirSync, readFileSync, writeFileSync, copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {assertSetupReplacement} from './setup-guard.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const build = path.join(root, 'build');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
function run(bin, args) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules', bin), ...args], {cwd:root, stdio:'inherit'});
  if (result.status !== 0) throw Error(`${bin} failed (${result.status})`);
}
const compileOnly = process.argv.includes('--compile-only');
if (!compileOnly) assertSetupReplacement(root, {replace:process.argv.includes('--replace-development-setup')});
const compileDirectory = compileOnly ? path.join(build, 'compile-check') : build;
mkdirSync(compileDirectory, {recursive:true});
run('circom2/cli.js', ['native-quote.circom', '--r1cs', '--wasm', '--sym', '-l', 'node_modules', '-o', compileDirectory]);
if (compileOnly) {
  console.log('Circuit compiled. Existing setup, verifier and published proving artifacts were not replaced.');
  process.exit(0);
}
run('snarkjs/cli.js', ['powersoftau', 'new', 'bn128', '12', 'build/initial.ptau']);
run('snarkjs/cli.js', ['powersoftau', 'contribute', 'build/initial.ptau', 'build/contributed.ptau', '--name=LOCAL DEVELOPMENT ONLY', '-e='+randomBytes(64).toString('hex')]);
run('snarkjs/cli.js', ['powersoftau', 'prepare', 'phase2', 'build/contributed.ptau', 'build/development.ptau']);
run('snarkjs/cli.js', ['groth16', 'setup', 'build/native-quote.r1cs', 'build/development.ptau', 'build/initial.zkey']);
run('snarkjs/cli.js', ['zkey', 'contribute', 'build/initial.zkey', 'build/native-quote.zkey', '--name=LOCAL DEVELOPMENT ONLY', '-e='+randomBytes(64).toString('hex')]);
run('snarkjs/cli.js', ['zkey', 'verify', 'build/native-quote.r1cs', 'build/development.ptau', 'build/native-quote.zkey']);
run('snarkjs/cli.js', ['zkey', 'export', 'verificationkey', 'build/native-quote.zkey', 'build/verification-key.json']);
run('snarkjs/cli.js', ['zkey', 'export', 'solidityverifier', 'build/native-quote.zkey', 'build/NativeQuoteGroth16Verifier.sol']);
const generated = readFileSync(path.join(build,'NativeQuoteGroth16Verifier.sol'),'utf8')
  .replace('contract Groth16Verifier', 'contract NativeQuoteGroth16Verifier');
const verifier = path.resolve(root, '../../contracts/src/extensions/proof/NativeQuoteGroth16Verifier.sol');
mkdirSync(path.dirname(verifier), {recursive:true});
writeFileSync(verifier, generated);
const files=['native-quote.r1cs','native-quote_js/native-quote.wasm','native-quote.zkey','verification-key.json'];
const manifest={schema:'anima.native-quote-proof/1',setup:'single-machine-development-only',productionReady:false,
  circuitSha256:hash(path.join(root,'native-quote.circom')),verifierSha256:hash(verifier),
  packages:{circom2:'0.2.23',circomlib:'2.0.5',snarkjs:'0.7.6'},files:Object.fromEntries(files.map(file=>[file,hash(path.join(build,file))]))};
writeFileSync(path.join(build,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
// The published metadata makes setup changes reviewable without committing secret entropy.
writeFileSync(path.join(root,'setup-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const artifacts=path.join(root,'artifacts');mkdirSync(artifacts,{recursive:true});
const artifactsManifest={...manifest,files:{}};
for(const [source,target] of [['native-quote_js/native-quote.wasm','native-quote.wasm'],['native-quote.zkey','native-quote.zkey'],['verification-key.json','verification-key.json']]) {
  copyFileSync(path.join(build,source),path.join(artifacts,target));artifactsManifest.files[target]=manifest.files[source];
}
writeFileSync(path.join(artifacts,'manifest.json'),JSON.stringify(artifactsManifest,null,2)+'\n');
console.log('Development setup complete. Deploy the generated verifier only with the matching proving artifacts.');
