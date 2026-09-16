import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2), suite = args.find(value => value.startsWith('--suite='))?.slice(8) ?? 'javascript';
if (!['javascript', 'ui'].includes(suite) || args.some(value => !['--suite=' + suite, '--list'].includes(value))) throw Error('Usage: node scripts/test-all.mjs [--suite=javascript|ui] [--list]');
const walk = directory => fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
  if (entry.isSymbolicLink()) return [];
  const full = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(full) : entry.name.endsWith('.test.mjs') ? [full] : [];
});
const uiFiles = new Set([
  'sensory.test.mjs', 'web.test.mjs', 'evm.test.mjs', 'field.test.mjs',
  'kingdom/model.test.mjs', 'instruments/engine.test.mjs', 'operating/engine.test.mjs',
  'memory/engine.test.mjs', 'memory/controller.test.mjs', 'burners/vault.test.mjs',
  'extensions/desk-dom.test.mjs', 'extensions/desk.test.mjs',
]);
const files = walk(path.join(root, 'test')).filter(file => suite === 'javascript' || uiFiles.has(path.relative(path.join(root, 'test'), file).split(path.sep).join('/'))).sort();
console.log(`Suite ${suite}: ${files.length} JavaScript test files; concurrency 2. Python/browser, Rust, v4 launch flows and privacy SDK offline checks are separate commands.`);
if (args.includes('--list')) {
  for (const file of files) console.log(path.relative(root, file));
} else {
  // A release gate must fail explicitly if its real DOM coverage cannot run.
  try { createRequire(path.join(root, 'agent/extensions/package.json')).resolve('linkedom'); }
  catch { throw Error('Required real-DOM dependency missing. Run npm run setup:validation (or setup:ui).'); }
  if (suite === 'javascript') {
    for (const [manifest, dependency] of [['packages/rehearsal-proof/package.json', 'snarkjs'], ['agent/extensions/package.json', '@x402/core']]) {
      try { createRequire(path.join(root, manifest)).resolve(dependency); }
      catch { throw Error('Required isolated dependency missing: ' + dependency + '. Run npm run setup:validation.'); }
    }
  }
  const child = spawn(process.execPath, ['--test', '--test-concurrency=2', ...files], {cwd: root, stdio: 'inherit'});
  child.once('error', error => { console.error(error); process.exitCode = 1; });
  child.once('exit', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
}
