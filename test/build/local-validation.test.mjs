import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {parseValidationArgs, validationStages, runLocalValidation, candidateInputPolicy, candidateInputSnapshot, candidateGitDiff, validationProvenance} from '../../scripts/lib/local-validation.mjs';
import {writeSourceManifest} from '../../scripts/lib/source-integrity.mjs';

const project = path.resolve(import.meta.dirname, '../..');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anima-validation-runner-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
}
const step = (id, source, dependencies = [], extra = {}) => ({id, label: id, command: process.execPath, args: ['--input-type=module', '-e', source], dependencies, timeoutMs: 10_000, ...extra});
const run = (root, stages, options = {}) => runLocalValidation({root, stages, echo: false, provenance: {fixture: true}, ...options});
const status = (report, id) => report.stages.find(stage => stage.id === id);

test('input verification precedes writes, preserves the supplied manifest and cannot be repaired by later successful stages', async t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'web'));
  fs.writeFileSync(path.join(root, 'web/app.mjs'), 'received');
  writeSourceManifest(root);
  const original = fs.readFileSync(path.join(root, 'SOURCE-SHA256.json'));
  const integrity = step('integrity', '', [], {args: [path.join(project, 'scripts/source-manifest.mjs'), 'verify', '--root', root]});
  const mutate = step('mutate', "import fs from 'node:fs';fs.writeFileSync('web/app.mjs','new candidate');console.log('changed after verification');");
  const first = await run(root, [integrity, mutate]);
  assert.equal(first.status, 'failed', 'an initially verified input may not change during execution');
  assert.equal(first.candidateIdentity.status, 'changed');
  assert.deepEqual(first.candidateIdentity.changes.changed, ['web/app.mjs']);
  assert.equal(status(first, 'integrity').status, 'passed');
  assert.deepEqual(fs.readFileSync(path.join(root, 'SOURCE-SHA256.json')), original);
  assert.match(fs.readFileSync(status(first, 'integrity').stdoutFile, 'utf8'), /Verified/);
  const second = await run(root, [integrity, mutate]);
  assert.equal(second.status, 'failed');
  assert.equal(status(second, 'integrity').status, 'failed');
  assert.equal(status(second, 'mutate').status, 'passed');
  assert.equal(second.fullLocalValidationPassed, false);
  assert.notEqual(second.reportFile, first.reportFile);
  assert.deepEqual(fs.readFileSync(path.join(root, 'SOURCE-SHA256.json')), original);
});

test('nonzero exit keeps both logs and blocks only dependent stages; selected recovery never imports an earlier pass', async t => {
  const root = fixture(t);
  const stages = [
    step('compile', "console.log('before failure');console.error('compiler failed');process.exitCode=7;"),
    step('dependent', "throw Error('must not execute');", ['compile']),
    step('independent', "console.log('independent diagnostics');"),
  ];
  const first = await run(root, stages);
  assert.equal(first.status, 'failed');
  assert.equal(status(first, 'compile').exitCode, 7);
  assert.match(fs.readFileSync(status(first, 'compile').stdoutFile, 'utf8'), /before failure/);
  assert.match(fs.readFileSync(status(first, 'compile').stderrFile, 'utf8'), /compiler failed/);
  assert.equal(status(first, 'dependent').status, 'blocked');
  assert.equal(status(first, 'independent').status, 'passed');
  assert.equal(JSON.parse(fs.readFileSync(first.reportFile)).status, 'failed');
  const recovery = await run(root, stages, {selected: ['independent']});
  assert.equal(recovery.status, 'passed-partial');
  assert.equal(recovery.fullLocalValidationPassed, false);
  assert.equal(status(recovery, 'compile').status, 'not-selected');
  const reused = await run(root, [step('compile', 'process.exit(1)'), step('dependent', '', ['compile'])], {selected: ['dependent']});
  assert.equal(reused.status, 'passed-partial');
  assert.deepEqual(status(reused, 'dependent').reusedPrerequisites, ['compile']);
});

test('real node:test skips, TODOs and missing summaries cannot pass merely because the process exits zero', async t => {
  const root = fixture(t);
  const file = path.join(root, 'skips.test.mjs');
  fs.writeFileSync(file, "import test from 'node:test';test('executed',()=>{});test.skip('required unavailable',()=>{});test.todo('unfinished');\n");
  const skipped = step('skipped-suite', '', [], {args: ['--test', '--test-reporter=tap', file], testSummary: 'node'});
  const empty = step('empty-suite', "console.log('some output, no test summary');", [], {testSummary: 'node'});
  const report = await run(root, [skipped, empty]);
  assert.equal(status(report, 'skipped-suite').exitCode, 0);
  assert.equal(status(report, 'skipped-suite').status, 'incomplete');
  assert.equal(status(report, 'skipped-suite').summary.skipped, 1);
  assert.equal(status(report, 'skipped-suite').summary.todo, 1);
  assert.equal(status(report, 'empty-suite').status, 'incomplete');
  assert.equal(report.status, 'failed');
});

test('Rust summaries accumulate across test binaries and reject ignored tests', async t => {
  const root = fixture(t);
  const report = await run(root, [step('rust-fixture', "console.log('test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out');console.log('test result: ok. 1 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out');", [], {testSummary: 'rust'})]);
  assert.equal(status(report, 'rust-fixture').summary.tests, 4);
  assert.equal(status(report, 'rust-fixture').summary.passed, 3);
  assert.equal(status(report, 'rust-fixture').summary.skipped, 1);
  assert.equal(status(report, 'rust-fixture').status, 'incomplete');
});

function processRunning(pid) {
  try {
    process.kill(pid, 0);
    if (process.platform === 'linux') {
      const state = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]?.[0];
      return state !== 'Z' && state !== 'X';
    }
    return true;
  } catch (error) { if (error.code === 'ESRCH' || error.code === 'ENOENT') return false; throw error; }
}

test('timeout records evidence and kills a SIGTERM-resistant child process group including its descendant', async t => {
  if (process.platform === 'win32') {
    const root = fixture(t);
    const report = await run(root, [step('timeout', 'setInterval(()=>{},1000)', [], {timeoutMs: 250})], {killGraceMs: 50});
    assert.equal(status(report, 'timeout').status, 'timed-out');
    return;
  }
  const root = fixture(t), pidFile = path.join(root, 'descendant.pid');
  const descendant = "import fs from 'node:fs';fs.writeFileSync(" + JSON.stringify(pidFile) + ",String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);";
  const parent = "import {spawn} from 'node:child_process';spawn(process.execPath,['--input-type=module','-e'," + JSON.stringify(descendant) + "],{stdio:'ignore'});process.on('SIGTERM',()=>{});console.log('parent started');setInterval(()=>{},1000);";
  let pid;
  t.after(() => { if (pid && processRunning(pid)) process.kill(pid, 'SIGKILL'); });
  const report = await run(root, [step('timeout', parent, [], {timeoutMs: 1000})], {killGraceMs: 100});
  pid = Number(fs.readFileSync(pidFile, 'utf8'));
  assert.equal(status(report, 'timeout').status, 'timed-out');
  assert.equal(report.status, 'failed');
  assert.match(fs.readFileSync(status(report, 'timeout').stdoutFile, 'utf8'), /parent started/);
  for (let attempt = 0; attempt < 20 && processRunning(pid); attempt++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(processRunning(pid), false, 'descendant must not survive a timed-out validation stage');
});

test('interruption saves final status and never executes remaining stages', async t => {
  const root = fixture(t), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 200);
  t.after(() => clearTimeout(timer));
  const report = await run(root, [step('waiting', "console.log('waiting');setInterval(()=>{},1000);"), step('later', "throw Error('must not run');")], {signal: controller.signal, killGraceMs: 50});
  assert.equal(report.status, 'interrupted');
  assert.equal(status(report, 'waiting').status, 'interrupted');
  assert.equal(status(report, 'later').status, 'interrupted');
  assert.equal(JSON.parse(fs.readFileSync(report.reportFile)).status, 'interrupted');
});

test('missing commands are recorded as failures and do not suppress independent diagnostics', async t => {
  const root = fixture(t);
  const report = await run(root, [step('missing', '', [], {command: path.join(root, 'missing-command')}), step('after', "console.log('still ran');")]);
  assert.equal(status(report, 'missing').status, 'failed');
  assert.match(status(report, 'missing').error, /ENOENT/);
  assert.equal(status(report, 'after').status, 'passed');
});

test('CLI listing is read-only, leaf stages cannot recurse through validation aliases, and preserved input roots remain explicit', t => {
  const root = fixture(t), baseline = fixture(t);
  const args = parseValidationArgs(['--stages=integrity,official-launch', '--integrity-root=' + baseline], root);
  const stages = validationStages(root, args.integrityRoot);
  assert.deepEqual(stages[0].args.slice(-2), ['--root', baseline]);
  for (const stage of stages) assert.ok(!stage.args.some(arg => /^validate(?::|$)/.test(arg)));
  assert.throws(() => parseValidationArgs(['--stages=unknown'], root), /Unknown stage/);
  assert.throws(() => parseValidationArgs(['--timeout-minutes=0'], root), /invalid option/);
  assert.throws(() => parseValidationArgs(['--output=' + path.join(root, 'reports')], root), /outside the project/);
  const result = spawnSync(process.execPath, [path.join(project, 'scripts/validate-release.mjs'), '--list', '--output=' + path.join(root, 'logs')], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /official-launch/);
  assert.match(result.stdout, /v4-strategies/);
  assert.equal(fs.existsSync(path.join(root, 'logs')), false);
});

test('complete local inventory includes all active standalone suites and package encoder/native reference checks', () => {
  const commands = validationStages(project).flatMap(stage => stage.args);
  for (const [directory, suffix] of [
    ['integrations/console/protocol/v4-hook/test', '.cjs'],
    ['integrations/console/protocol/fee-router/test', '.cjs'],
    ['integrations/official-launch/test', '.test.mjs'],
    ['packages/communication/test', '.test.mjs'],
  ]) {
    const files = fs.readdirSync(path.join(project, directory)).filter(name => name.endsWith(suffix));
    assert.ok(files.length > 0, directory);
    for (const name of files) assert.ok(commands.includes(directory + '/' + name), 'Active test omitted from complete local gate: ' + directory + '/' + name);
  }
  const v4Package = JSON.parse(fs.readFileSync(path.join(project, 'integrations/console/protocol/v4-hook/package.json')));
  assert.equal(v4Package.scripts['verify:encoder'], 'node scripts/verify-encoder.cjs');
  assert.ok(commands.includes('integrations/console/protocol/v4-hook/scripts/verify-encoder.cjs'));
  assert.ok(commands.includes('test/reference/crosscheck.mjs'));
  const inputs = candidateInputSnapshot(project);
  for (const command of commands.filter(name => /\.(?:mjs|cjs)$/.test(name))) assert.ok(inputs.files[command], 'Executed script omitted from candidate identity: ' + command);
});

test('truncated, duplicated and contradictory Node summaries cannot fabricate successful execution', async t => {
  const root = fixture(t), file = path.join(root, 'sample.test.mjs');
  fs.writeFileSync(file, "import test from 'node:test';test('actually executed',()=>{});\n");
  const environment = {...process.env};
  delete environment.NODE_TEST_CONTEXT;
  const actual = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {env: environment, encoding: 'utf8'});
  assert.equal(actual.status, 0, actual.stderr);
  assert.match(actual.stdout, /# tests 1/);
  const cases = {
    valid: actual.stdout,
    truncated: actual.stdout.slice(0, actual.stdout.indexOf('# pass ')),
    unfinished: actual.stdout.replace(/^# duration_ms .*\n?/m, ''),
    inconsistent: actual.stdout.replace('# tests 1', '# tests 10'),
    duplicate: actual.stdout + actual.stdout,
    invalid: actual.stdout.replace('# pass 1', '# pass 1.5'),
  };
  const report = await run(root, Object.entries(cases).map(([id, output]) => step(id, 'process.stdout.write(' + JSON.stringify(output) + ');', [], {testSummary: 'node'})));
  assert.equal(status(report, 'valid').status, 'passed');
  assert.equal(status(report, 'valid').summary.complete, true);
  for (const id of Object.keys(cases).filter(id => id !== 'valid')) {
    assert.equal(status(report, id).exitCode, 0);
    assert.equal(status(report, id).status, 'incomplete', id);
    assert.ok(status(report, id).summary.errors.length, id);
  }
});

test('candidate inventory keeps pinned executable/proof inputs and excludes only declared regenerated outputs', t => {
  const root = fixture(t);
  const put = (name, content = 'fixture') => { fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true}); fs.writeFileSync(path.join(root, name), content); };
  const pinned = ['web/privacy/railgun-worker.js', 'web/privacy/runtime-integrity.mjs', 'packages/privacy/bundle-inputs.json', 'render/field.wasm', 'packages/rehearsal-proof/artifacts/native-quote.zkey', 'packages/rehearsal-proof/artifacts/native-quote.wasm', 'web/other/artifacts.mjs', 'contracts/src/Authored.sol', 'test/required.test.mjs', 'packages/new-source/artifacts/required.json', 'worlds/model.mjs'];
  for (const name of pinned) put(name);
  const before = candidateInputSnapshot(root);
  for (const name of pinned) assert.ok(before.files[name], name);
  for (const name of Object.keys(candidateInputPolicy.generatedFiles)) put(name, 'regenerated');
  for (const directory of candidateInputPolicy.generatedDirectories) put(directory + '/new-output.json');
  for (const name of ['dist/build-manifest.json', 'reports/result.json', 'onchain-app/confluence/manifest.json', 'contracts/artifacts/index.json', 'index.html', 'proof-kernel/target/compiled', 'node_modules/package/index.js', '.local-genesis/validation/status.json']) put(name);
  assert.equal(candidateInputSnapshot(root).sha256, before.sha256, 'expected generated writes do not change authored identity');
  for (const name of pinned) {
    put(name, 'changed');
    assert.notEqual(candidateInputSnapshot(root).sha256, before.sha256, name);
    put(name);
  }
  put('web/new-input.mjs');
  assert.notEqual(candidateInputSnapshot(root).sha256, before.sha256, 'untracked added source is an input');
  fs.rmSync(path.join(root, 'web/new-input.mjs'));
  fs.rmSync(path.join(root, pinned[0]));
  assert.notEqual(candidateInputSnapshot(root).sha256, before.sha256, 'removed source changes identity');
});

test('a verified external baseline stays distinct from the candidate and generated writes permit an honest local pass', async t => {
  const root = fixture(t), baseline = fixture(t);
  fs.mkdirSync(path.join(baseline, 'web'));
  fs.writeFileSync(path.join(baseline, 'web/app.mjs'), 'received baseline');
  writeSourceManifest(baseline);
  fs.mkdirSync(path.join(root, 'web'));
  fs.writeFileSync(path.join(root, 'web/app.mjs'), 'reviewed different candidate');
  const original = fs.readFileSync(path.join(baseline, 'SOURCE-SHA256.json'));
  const integrity = step('integrity', '', [], {args: [path.join(project, 'scripts/source-manifest.mjs'), 'verify', '--root', baseline]});
  const build = step('build', "import fs from 'node:fs';fs.mkdirSync('web/v4',{recursive:true});fs.writeFileSync('web/v4/artifacts.mjs','generated');fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/result.json','{}');");
  const report = await run(root, [integrity, build], {integrityRoot: baseline, provenance: validationProvenance(root, baseline)});
  assert.equal(report.status, 'passed-local-validation');
  assert.equal(report.fullLocalValidationPassed, true);
  assert.equal(report.provenance.inputIntegrity.sameAsWorkingRoot, false);
  assert.match(report.provenance.inputIntegrity.claim, /does not verify the working candidate/);
  assert.equal(report.candidateIdentity.status, 'stable');
  assert.equal(report.candidateIdentity.before.sha256, report.candidateIdentity.after.sha256);
  assert.deepEqual(fs.readFileSync(path.join(baseline, 'SOURCE-SHA256.json')), original);
  for (const phase of ['before', 'after']) {
    const inventory = JSON.parse(fs.readFileSync(report.candidateIdentity[phase].inventoryFile));
    assert.equal(inventory.sha256, report.candidateIdentity[phase].sha256);
    assert.ok(inventory.files['web/app.mjs']);
  }
  const changed = await run(root, [integrity, step('mutate', "import fs from 'node:fs';fs.writeFileSync('web/app.mjs','unexpected input');")], {integrityRoot: baseline, selected: ['integrity', 'mutate']});
  assert.equal(status(changed, 'integrity').status, 'passed');
  assert.equal(changed.status, 'failed', 'selected stages cannot pass against changing inputs either');
  assert.equal(changed.fullLocalValidationPassed, false);
});

test('Git provenance hashes dirty bytes even when the filename/status list stays identical', t => {
  const root = fixture(t);
  const git = args => { const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'}); assert.equal(result.status, 0, result.stderr); return result.stdout; };
  git(['init', '--quiet']);
  fs.mkdirSync(path.join(root, 'web'));
  fs.writeFileSync(path.join(root, 'web/app.mjs'), 'staged initial');
  git(['add', 'web/app.mjs']);
  fs.writeFileSync(path.join(root, 'web/app.mjs'), 'first dirty bytes');
  const statusBefore = git(['status', '--porcelain']), before = candidateGitDiff(root);
  fs.writeFileSync(path.join(root, 'web/app.mjs'), 'other dirty bytes');
  const after = candidateGitDiff(root);
  assert.equal(git(['status', '--porcelain']), statusBefore);
  assert.notEqual(before.working.sha256, after.working.sha256);
  assert.ok(before.working.bytes > 0);
  assert.ok(before.staged.bytes > 0);
  assert.equal(before.staged.sha256, after.staged.sha256);
  git(['add', 'web/app.mjs']);
  assert.notEqual(candidateGitDiff(root).staged.sha256, before.staged.sha256);
});

test('fee-router dependency helper resolves the installed root model without a leaf node_modules', t => {
  const root = fixture(t), directory = 'integrations/console/protocol/fee-router/scripts';
  fs.mkdirSync(path.join(root, directory), {recursive: true});
  const helper = path.join(root, directory, 'dependency.cjs');
  fs.copyFileSync(path.join(project, directory, 'dependency.cjs'), helper);
  for (const name of ['solc', 'ethers', 'ganache']) {
    const dependency = path.join(root, 'node_modules', name);
    fs.mkdirSync(dependency, {recursive: true});
    fs.writeFileSync(path.join(dependency, 'index.js'), 'module.exports=' + JSON.stringify({name, installedAt: 'root'}) + ';');
  }
  const dependency = createRequire(helper)(helper);
  for (const name of ['solc', 'ethers', 'ganache']) assert.deepEqual(dependency(name), {name, installedAt: 'root'});
  assert.equal(fs.existsSync(path.join(root, 'integrations/console/protocol/fee-router/node_modules')), false);
});
