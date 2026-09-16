import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';

const minutes = value => value * 60_000;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const node = (id, label, args, dependencies = [], timeoutMinutes = 30, extra = {}) => ({
  id, label, command: process.execPath, args, dependencies, timeoutMs: minutes(timeoutMinutes), ...extra,
});

/** Commands are explicit leaf entry points: no validation alias can recurse into this runner. */
export function validationStages(root, integrityRoot = root) {
  const v4 = 'integrations/console/protocol/v4-hook';
  return [
    node('integrity', 'Verify the preserved input inventory; never regenerate it', ['scripts/source-manifest.mjs', 'verify', '--root', integrityRoot], [], 5),
    node('setup', 'Install the full locked dependency set (opt-in)', ['scripts/setup-dependencies.mjs', '--mode=full'], [], 45, {optional: true}),
    node('syntax', 'Authored JavaScript syntax and JSON parsing', ['scripts/check-source.mjs'], [], 10),
    node('static', 'Solidity heuristic checks (not a security audit)', ['scripts/static-audit.mjs'], [], 5),
    node('compile-core', 'Compile core contracts for the local Shanghai fixture', ['scripts/compile.mjs'], ['setup'], 45, {env: {IDFBI_EVM_TARGET: 'shanghai'}}),
    node('compile-v4', 'Compile pinned v4 contracts for Cancun', [`${v4}/scripts/compile.cjs`], ['setup'], 30),
    node('v4-encoder', 'Verify the pinned v4 encoder against source and ABI vectors', [`${v4}/scripts/verify-encoder.cjs`], ['compile-v4'], 10),
    node('build', 'Build the current runtime and active feature artifacts', ['scripts/build-confluence.mjs'], ['compile-core', 'compile-v4'], 60),
    node('verify-compilation', 'Verify core compiler artifacts against current sources and recipe', ['scripts/verify-compilation.mjs'], ['build'], 10),
    node('javascript', 'All root JavaScript tests, including real local EVM and DOM workflows', ['scripts/test-all.mjs', '--suite=javascript'], ['verify-compilation'], 90, {testSummary: 'node'}),
    node('archive', 'Archive current runtime modules', ['scripts/archive-confluence.mjs'], ['build'], 20),
    node('verify-archive', 'Verify exact recoverable runtime bytes', ['scripts/verify-confluence.mjs'], ['archive'], 15),
    node('local-mint', 'Disposable local NFT mint and immutable runtime recovery', ['scripts/deploy-confluence-local.mjs'], ['verify-archive'], 45),
    node('fee-router', 'Standalone local fee-router splits, conversions and factory flows', ['integrations/console/protocol/fee-router/test/normal-flows.cjs'], ['setup'], 30),
    node('v4-launch', 'Standalone local v4 launch lifecycle', [`${v4}/test/launchpad-flows.cjs`], ['compile-v4'], 30),
    node('v4-hooks', 'Standalone local creator-hook launch lifecycle', [`${v4}/test/hooked-launch-flows.cjs`], ['compile-v4'], 30),
    node('v4-normal', 'Standalone local original v4 hook flows', [`${v4}/test/normal-flows.cjs`], ['compile-v4'], 30),
    node('v4-strategies', 'Local fee collection, reinvestment, exits and compounding', [`${v4}/test/strategy-flows.cjs`], ['compile-v4', 'compile-core'], 45),
    node('official-launch', 'Official CCA/Doppler lifecycle, failure, migration and desk recovery suites', ['--test', '--test-concurrency=1', '--test-reporter=tap', 'integrations/official-launch/test/desk-recovery.test.mjs', 'integrations/official-launch/test/lifecycle.test.mjs', 'integrations/official-launch/test/scenario.test.mjs'], ['build'], 60, {testSummary: 'node'}),
    node('communication', 'MLS protocol ratchets, membership removal and recovery', ['--test', '--test-reporter=tap', 'packages/communication/test/protocol.test.mjs'], ['setup'], 20, {testSummary: 'node'}),
    node('privacy-offline', 'Privacy SDK cryptography offline; no funded ZK transaction', ['packages/privacy/test/offline.mjs'], ['setup'], 30),
    node('native-keccak', 'Independent native C Keccak comparison across rate boundaries', ['test/reference/crosscheck.mjs'], [], 10),
    {id: 'rust', label: 'Research proof-kernel Rust tests with locked dependencies', command: 'cargo', args: ['test', '--locked', '--manifest-path', 'proof-kernel/Cargo.toml'], dependencies: [], timeoutMs: minutes(30), testSummary: 'rust'},
  ];
}

export const validationLimits = [
  'Local validation is not production certification or an independent security audit.',
  'Browser/device interaction, Worlds multiplayer browser acceptance and native GLSL/CPU rendering parity are separate gates. The native Keccak reference check requires cc or CC.',
  'No public deployment, funded RAILGUN proof/broadcast, public LayerZero delivery or operational-service soak is performed.',
  'Core fixtures target Shanghai and v4 fixtures target Cancun; deployment-specific compiler profiles require separate verification.',
  'Selected stages may reuse existing dependencies/artifacts; this run does not certify omitted stages.',
  'Candidate fingerprints cover the explicit authored-input policy and fixed runtime/proof inputs, not installed dependency bytes or regenerated outputs. They establish identity and observed stability, not correctness or continuous filesystem monitoring.',
  'SIGINT/SIGTERM and stage timeouts save terminal status when the runner can execute cleanup. SIGKILL, host loss or external process-namespace teardown may leave status running; such evidence is unfinished, never a pass.',
];

/** Versioned execution-input policy, intentionally distinct from the distributable inventory.
 * Keep pinned binaries (privacy worker, render WASM, proving keys) unless this gate rebuilds
 * them. Exclude generated files by exact name, never an extension or generic artifacts folder.
 */
export const candidateInputPolicy = {
  schema: 'anima.validation-input-policy/1',
  files: ['package.json', 'package-lock.json', 'SOURCE-SHA256.json', 'packaging.json', 'system-manifest.json', 'VERSION', 'Makefile'],
  directories: ['.github/workflows', 'agent', 'contracts/src', 'scripts', 'test', 'web', 'worlds', 'render', 'proof-kernel', 'packages', 'integrations/console/protocol/v4-hook', 'integrations/console/protocol/fee-router', 'integrations/official-launch'],
  excludedDirectoryNames: ['node_modules', 'target', '.git', '__pycache__', '.cache', '.local-genesis'],
  generatedDirectories: ['integrations/console/protocol/v4-hook/artifacts', 'integrations/console/protocol/fee-router/artifacts', 'integrations/official-launch/artifacts'],
  generatedFiles: {
    'contracts/src/confluence/ConfluenceLoader.sol': 'scripts/compile.mjs -> scripts/build-chain-loader.mjs',
    'web/v4/artifacts.mjs': 'scripts/build-v4.mjs',
    'web/launchpad/deployments.mjs': 'scripts/build-launch-chain.mjs',
    'web/launchpad/hook-artifacts.mjs': 'scripts/build-hook-launch.mjs',
    'web/launchpad/sale-artifacts.mjs': 'scripts/build-launch-sale.mjs',
    'web/launchpad/auction-artifacts.mjs': 'scripts/build-launch-auction.mjs',
    'web/launchpad/lifecycle-artifacts.mjs': 'scripts/build-launch-lifecycle.mjs',
    'web/launchpad/strategies-artifacts.mjs': 'scripts/build-launch-strategies.mjs',
    'web/governance/artifacts.mjs': 'scripts/build-governance.mjs',
    'web/commons/artifacts.mjs': 'scripts/build-commons.mjs',
    'web/workshop/contracts.mjs': 'scripts/build-workshop.mjs',
    'web/extensions/artifacts.mjs': 'scripts/build-extensions.mjs',
    'web/exit/artifacts.mjs': 'scripts/build-exit.mjs',
    'web/genesis/interior-kernel.mjs': 'scripts/build-interior.mjs',
    'web/commons/mls-protocol.mjs': 'packages/communication/build.mjs',
    'web/commons/mls-artifacts.mjs': 'packages/communication/build.mjs',
    'web/crosschain/artifacts.mjs': 'packages/crosschain/build.mjs',
    'web/launchpad/protocols-artifacts.mjs': 'integrations/official-launch/scripts/build.mjs',
    'web/launchpad/protocols-deployments.mjs': 'integrations/official-launch/scripts/build.mjs',
  },
};

export function candidateInputSnapshot(root) {
  const files = {};
  function walk(relative) {
    const name = path.posix.basename(relative);
    if (candidateInputPolicy.excludedDirectoryNames.includes(name) ||
        candidateInputPolicy.generatedDirectories.includes(relative) ||
        Object.hasOwn(candidateInputPolicy.generatedFiles, relative) ||
        (name !== '.env.example' && (name === '.env' || name.startsWith('.env.')))) return;
    const file = path.join(root, relative);
    let stat;
    try { stat = fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink()) throw Error('Candidate input cannot be a symlink: ' + relative);
    if (stat.isDirectory()) for (const entry of fs.readdirSync(file).sort()) walk(relative + '/' + entry);
    else if (stat.isFile()) files[relative] = hash(fs.readFileSync(file));
    else throw Error('Unsupported candidate input type: ' + relative);
  }
  for (const name of [...candidateInputPolicy.files, ...candidateInputPolicy.directories]) walk(name);
  const ordered = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return {schema: 'anima.validation-inputs/1', policy: candidateInputPolicy, sha256: hash(JSON.stringify({policy: candidateInputPolicy, files: ordered})), fileCount: Object.keys(ordered).length, files: ordered};
}

export function candidateInputChanges(before, after) {
  return {
    changed: Object.keys(before.files).filter(name => Object.hasOwn(after.files, name) && before.files[name] !== after.files[name]),
    removed: Object.keys(before.files).filter(name => !Object.hasOwn(after.files, name)),
    added: Object.keys(after.files).filter(name => !Object.hasOwn(before.files, name)),
  };
}

/** Hash actual dirty diff bytes, not just the filename/status list. Working and staged
 * diffs are separate so this also works before the first commit. Untracked bytes are
 * represented by the filesystem input inventory, since git diff omits them.
 */
export function candidateGitDiff(root) {
  const result = {scope: 'All tracked working-tree and staged diff bytes; generated changes may alter these hashes without invalidating authored-input stability. Untracked inputs are hashed in the candidate inventory.'};
  for (const [kind, options] of [['working', []], ['staged', ['--cached']]]) {
    const command = spawnSync('git', ['diff', '--binary', '--no-ext-diff', '--no-textconv', ...options, '--'], {cwd: root, encoding: null, timeout: 10_000, maxBuffer: 64 * 1024 * 1024});
    result[kind] = command.status === 0 ? {sha256: hash(command.stdout), bytes: command.stdout.length} : {sha256: null, bytes: null, error: command.error?.message ?? 'Git diff unavailable (no repository or nonzero exit).'};
  }
  return result;
}

export function parseValidationArgs(args, root) {
  const result = {root, integrityRoot: root, outputRoot: path.join(root, '.local-genesis/validation')};
  const seen = new Set();
  for (const arg of args) {
    const [name, ...parts] = arg.split('='), value = parts.join('=');
    if (seen.has(name)) throw Error('Repeated option: ' + name);
    seen.add(name);
    if (name === '--list' && !parts.length) result.list = true;
    else if (name === '--help' && !parts.length) result.help = true;
    else if (name === '--install' && !parts.length) result.install = true;
    else if (name === '--stages' && value) {
      result.selected = value.split(',');
      if (new Set(result.selected).size !== result.selected.length || result.selected.some(id => !id)) throw Error('Stages must be distinct nonempty IDs.');
    } else if (name === '--integrity-root' && value) result.integrityRoot = path.resolve(value);
    else if (name === '--output' && value) result.outputRoot = path.resolve(value);
    else if (name === '--timeout-minutes' && value && Number.isFinite(Number(value)) && Number(value) > 0) result.timeoutMs = minutes(Number(value));
    else throw Error('Unknown or invalid option: ' + arg);
  }
  const stages = validationStages(root, result.integrityRoot);
  for (const id of result.selected ?? []) if (!stages.some(stage => stage.id === id)) throw Error('Unknown stage: ' + id);
  // Evidence must not introduce unlisted files into the inventory it is about to verify.
  const relative = path.relative(root, result.outputRoot);
  if (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative) && relative !== '.local-genesis' && !relative.startsWith('.local-genesis' + path.sep)) {
    throw Error('--output must be outside the project or inside its excluded .local-genesis directory.');
  }
  return result;
}

function fileHash(file) {
  try { return hash(fs.readFileSync(file)); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function commandOutput(command, args, root) {
  const result = spawnSync(command, args, {cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024});
  return result.status === 0 ? result.stdout.trim() : null;
}

export function validationProvenance(root, integrityRoot) {
  const packages = ['', 'agent/extensions', 'packages/communication', 'packages/crosschain', 'packages/rehearsal-proof', 'packages/privacy', 'integrations/console/protocol/v4-hook', 'integrations/official-launch'];
  return {
    workingRoot: root,
    commit: commandOutput('git', ['rev-parse', 'HEAD'], root),
    workingTreeStatus: commandOutput('git', ['status', '--porcelain', '--untracked-files=normal'], root),
    node: process.version, npm: commandOutput(npm, ['--version'], root), cargo: commandOutput('cargo', ['--version'], root),
    platform: process.platform, architecture: process.arch,
    environment: Object.fromEntries(['TMPDIR', 'TMP', 'TEMP', 'CC'].map(name => [name, process.env[name] ?? null])),
    inputIntegrity: {root: integrityRoot, sameAsWorkingRoot: path.resolve(root) === path.resolve(integrityRoot), manifestSha256: fileHash(path.join(integrityRoot, 'SOURCE-SHA256.json')), claim: path.resolve(root) === path.resolve(integrityRoot) ? 'The integrity stage verifies the working candidate inventory before generated writes.' : 'The integrity stage verifies only the separate preserved baseline; it does not verify the working candidate against that baseline.'},
    workingManifestSha256: fileHash(path.join(root, 'SOURCE-SHA256.json')),
    lockfiles: Object.fromEntries(packages.map(directory => {
      const name = path.posix.join(directory, 'package-lock.json');
      return [name, fileHash(path.join(root, name))];
    }).concat([['proof-kernel/Cargo.lock', fileHash(path.join(root, 'proof-kernel/Cargo.lock'))]])),
  };
}

function saveReport(file, report) {
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(report, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

function summaryParser(type) {
  const result = {tests: null, passed: null, failed: 0, skipped: 0, todo: 0, cancelled: 0};
  const fields = new Set(), errors = [];
  let pending = '', summaries = 0;
  function line(value) {
    value = value.replace(/\u001b\[[0-9;]*m/g, '').trim();
    if (type === 'node') {
      const match = /^(?:#|ℹ) (tests|suites|pass|fail|skipped|todo|cancelled|duration_ms) (\d+(?:\.\d+)?)$/.exec(value);
      if (match) {
        const field = {pass: 'passed', fail: 'failed'}[match[1]] ?? match[1];
        if (fields.has(field)) errors.push('Repeated Node summary field: ' + field);
        fields.add(field);
        result[field] = Number(match[2]);
        if (!Number.isFinite(result[field]) || (field !== 'duration_ms' && !Number.isSafeInteger(result[field]))) errors.push('Invalid Node summary number: ' + field);
        if (field === 'tests') summaries++;
      }
    } else if (type === 'rust') {
      const match = /^test result: (?:ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored;/.exec(value);
      if (match) {
        const [, passed, failed, ignored] = match.map(Number);
        result.passed = (result.passed ?? 0) + passed;
        result.failed += failed;
        result.skipped += ignored;
        result.tests = (result.tests ?? 0) + passed + failed + ignored;
        summaries++;
      }
    }
  }
  return {
    push(bytes) {
      pending += bytes.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      for (const value of lines) line(value);
      // Unbounded binary/no-newline output belongs in logs, not process memory.
      if (pending.length > 64 * 1024) pending = pending.slice(-64 * 1024);
    },
    finish() {
      if (pending) line(pending);
      if (type === 'node') {
        for (const field of ['tests', 'suites', 'passed', 'failed', 'cancelled', 'skipped', 'todo', 'duration_ms']) {
          if (!fields.has(field)) errors.push('Missing Node summary field: ' + field);
        }
        if (summaries !== 1) errors.push('Expected exactly one Node aggregate summary.');
        if (result.tests !== result.passed + result.failed + result.cancelled + result.skipped + result.todo) errors.push('Node summary totals are inconsistent.');
      }
      if (!summaries || !result.tests) errors.push('No nonempty test execution summary.');
      return {...result, summaries, complete: errors.length === 0, errors};
    },
  };
}

/** A killed stage takes its POSIX process group (including local Anvil children) with it. */
export async function executeValidationStage(stage, {root, directory, signal, timeoutMs, echo = true, killGraceMs = 1500}) {
  const stdoutFile = path.join(directory, stage.id + '.stdout.log');
  const stderrFile = path.join(directory, stage.id + '.stderr.log');
  const stdout = fs.openSync(stdoutFile, 'w'), stderr = fs.openSync(stderrFile, 'w');
  const parser = summaryParser(stage.testSummary);
  const startedAt = new Date().toISOString(), start = Date.now();
  let child, reason, errorText, timer, escalation;
  const stop = why => {
    if (reason) return;
    reason = why;
    kill('SIGTERM');
    escalation = setTimeout(() => kill('SIGKILL'), killGraceMs);
  };
  function kill(signalName) {
    if (!child?.pid) return;
    try {
      if (process.platform === 'win32') child.kill(signalName);
      else process.kill(-child.pid, signalName);
    } catch (error) { if (error.code !== 'ESRCH') errorText = String(error); }
  }
  const abort = () => stop('interrupted');
  let exitCode = null, exitSignal = null;
  try {
    ({exitCode, exitSignal} = await new Promise(resolve => {
      const environment = {...process.env, FORCE_COLOR: '0', ...stage.env};
      // A runner exercised inside node:test still launches independent test processes.
      // Leaking the parent's worker marker suppresses their normal test discovery/output.
      delete environment.NODE_TEST_CONTEXT;
      child = spawn(stage.command, stage.args, {
        cwd: stage.cwd ? path.resolve(root, stage.cwd) : root,
        env: environment,
        detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], shell: false,
      });
      child.stdout.on('data', bytes => { fs.writeSync(stdout, bytes); parser.push(bytes); if (echo) process.stdout.write(bytes); });
      child.stderr.on('data', bytes => { fs.writeSync(stderr, bytes); if (echo) process.stderr.write(bytes); });
      child.once('error', error => { errorText = error.message; fs.writeSync(stderr, error.message + '\n'); });
      child.once('close', (code, signalName) => resolve({exitCode: code, exitSignal: signalName}));
      timer = setTimeout(() => stop('timed-out'), timeoutMs ?? stage.timeoutMs);
      signal?.addEventListener('abort', abort, {once: true});
      if (signal?.aborted) abort();
    }));
  } finally {
    clearTimeout(timer);
    if (reason) kill('SIGKILL');
    clearTimeout(escalation);
    signal?.removeEventListener('abort', abort);
    fs.closeSync(stdout); fs.closeSync(stderr);
  }
  const summary = stage.testSummary ? parser.finish() : null;
  let status = reason ?? (errorText || exitCode !== 0 ? 'failed' : 'passed');
  if (status === 'passed' && summary) {
    if (!summary.complete || summary.skipped || summary.todo || summary.cancelled) status = 'incomplete';
    if (summary.failed) status = 'failed';
  }
  return {
    status, startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - start,
    timeoutMs: timeoutMs ?? stage.timeoutMs, exitCode, exitSignal, error: errorText ?? null,
    summary, stdoutFile, stderrFile,
    ...(status === 'incomplete' ? {reason: 'Required test execution was missing, empty, truncated, inconsistent, skipped, TODO or cancelled; exit zero is insufficient.'} : {}),
  };
}

export async function runLocalValidation({root, integrityRoot = root, outputRoot = path.join(root, '.local-genesis/validation'), selected, install = false, stages = validationStages(root, integrityRoot), signal, timeoutMs, echo = true, provenance, killGraceMs}) {
  const known = new Set(stages.map(stage => stage.id));
  if (known.size !== stages.length || stages.some(stage => !/^[a-z0-9-]+$/.test(stage.id))) throw Error('Stage IDs must be unique safe filenames.');
  const chosen = new Set(selected ?? stages.filter(stage => !stage.optional).map(stage => stage.id));
  if (install) chosen.add('setup');
  for (const id of chosen) if (!known.has(id)) throw Error('Unknown stage: ' + id);
  const earlier = new Set();
  for (const stage of stages) {
    for (const dependency of stage.dependencies ?? []) if (!earlier.has(dependency)) throw Error('Prerequisite must precede stage: ' + dependency + ' -> ' + stage.id);
    earlier.add(stage.id);
  }
  const before = candidateInputSnapshot(root);
  const identity = provenance ?? validationProvenance(root, integrityRoot);
  const gitBefore = candidateGitDiff(root);
  fs.mkdirSync(outputRoot, {recursive: true});
  const directory = fs.mkdtempSync(path.join(outputRoot, new Date().toISOString().replace(/[:.]/g, '-') + '-'));
  const reportFile = path.join(directory, 'status.json');
  const beforeFile = path.join(directory, 'candidate-inputs.before.json');
  const afterFile = path.join(directory, 'candidate-inputs.after.json');
  saveReport(beforeFile, before);
  const report = {
    schema: 'anima.local-validation/1', runId: path.basename(directory), scope: selected ? 'selected-stages' : 'complete-local-suite',
    status: 'running', fullLocalValidationPassed: false, startedAt: new Date().toISOString(), finishedAt: null,
    provenance: identity, limitations: validationLimits, reportFile,
    candidateIdentity: {
      status: 'running', policySchema: candidateInputPolicy.schema,
      claim: 'Execution applies to these working candidate inputs, independently of any separate preserved-baseline verification. A stable fingerprint is not an approved release inventory or a security certification.',
      before: {sha256: before.sha256, fileCount: before.fileCount, inventoryFile: beforeFile, gitDiff: gitBefore}, after: null,
    },
    selectedStages: stages.filter(stage => chosen.has(stage.id)).map(stage => stage.id),
    stages: stages.map(stage => ({id: stage.id, label: stage.label, command: stage.command, args: stage.args, cwd: stage.cwd ?? root, env: stage.env ?? {}, timeoutMs: timeoutMs ?? stage.timeoutMs, status: chosen.has(stage.id) ? 'pending' : 'not-selected', dependencies: stage.dependencies ?? [], reusedPrerequisites: (stage.dependencies ?? []).filter(id => !chosen.has(id))})),
  };
  saveReport(reportFile, report);
  if (echo) console.log('Local validation evidence: ' + reportFile);
  let active;
  try {
    for (const stage of stages) {
      active = report.stages.find(item => item.id === stage.id);
      if (!chosen.has(stage.id)) continue;
      const blockedBy = active.dependencies.filter(id => chosen.has(id) && report.stages.find(item => item.id === id).status !== 'passed');
      if (signal?.aborted || blockedBy.length) {
        Object.assign(active, {status: signal?.aborted ? 'interrupted' : 'blocked', reason: signal?.aborted ? 'Run interrupted before stage execution.' : 'Prerequisite failed or did not complete.', blockedBy});
        saveReport(reportFile, report);
        continue;
      }
      active.status = 'running';
      active.startedAt = new Date().toISOString();
      active.stdoutFile = path.join(directory, stage.id + '.stdout.log');
      active.stderrFile = path.join(directory, stage.id + '.stderr.log');
      saveReport(reportFile, report);
      if (echo) console.log('\n[' + stage.id + '] ' + stage.label);
      Object.assign(active, await executeValidationStage(stage, {root, directory, signal, timeoutMs, echo, killGraceMs}));
      saveReport(reportFile, report);
      if (echo) console.log('[' + stage.id + '] ' + active.status);
    }
  } catch (error) {
    if (active?.status === 'running') Object.assign(active, {status: 'failed', error: error.stack ?? String(error)});
    report.runnerError = error.stack ?? String(error);
    for (const stage of report.stages) if (stage.status === 'pending') Object.assign(stage, {status: 'blocked', reason: 'Runner failed before this stage.'});
  } finally {
    try {
      const after = candidateInputSnapshot(root);
      saveReport(afterFile, after);
      report.candidateIdentity.after = {sha256: after.sha256, fileCount: after.fileCount, inventoryFile: afterFile, gitDiff: candidateGitDiff(root)};
      report.candidateIdentity.status = before.sha256 === after.sha256 ? 'stable' : 'changed';
      report.candidateIdentity.changes = candidateInputChanges(before, after);
    } catch (error) {
      report.candidateIdentity.status = 'unverifiable';
      report.candidateIdentity.error = error.stack ?? String(error);
    }
    const results = report.stages.filter(stage => chosen.has(stage.id));
    const passed = results.length > 0 && results.every(stage => stage.status === 'passed') && !report.runnerError && report.candidateIdentity.status === 'stable';
    report.fullLocalValidationPassed = passed && !selected;
    report.status = signal?.aborted ? 'interrupted' : passed ? (selected ? 'passed-partial' : 'passed-local-validation') : 'failed';
    report.finishedAt = new Date().toISOString();
    report.counts = Object.fromEntries(['passed', 'failed', 'timed-out', 'incomplete', 'blocked', 'interrupted', 'not-selected'].map(status => [status, report.stages.filter(stage => stage.status === status).length]));
    saveReport(reportFile, report);
  }
  return report;
}
