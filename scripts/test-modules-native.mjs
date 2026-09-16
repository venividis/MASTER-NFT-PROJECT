#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {executeValidationStage} from './lib/local-validation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const pinnedForge = '1.7.1';
export const pinnedSolc = '0.8.30+commit.73712a01.Emscripten.clang';

/** Exit zero alone is insufficient: every discovered result must actually succeed. */
export function summarizeForgeOutput(text) {
  const suites = JSON.parse(text);
  if (!suites || Array.isArray(suites) || typeof suites !== 'object') throw new Error('Missing Forge suite object.');
  const summary = {tests: 0, passed: 0, failed: 0, skipped: 0, fuzzRuns: 0};
  for (const [name, suite] of Object.entries(suites)) {
    if (!suite?.test_results || !Object.keys(suite.test_results).length) throw new Error(`Missing tests for ${name}.`);
    for (const test of Object.values(suite.test_results)) {
      summary.tests++;
      if (test.status === 'Success') summary.passed++;
      else if (test.status === 'Failure') summary.failed++;
      else if (test.status === 'Skipped') summary.skipped++;
      else throw new Error(`Unknown Forge test status: ${test.status}`);
      if (test.kind?.Fuzz) {
        const runs = test.kind.Fuzz.runs;
        if (!Number.isSafeInteger(runs) || runs < 1) throw new Error('Missing executed fuzz runs.');
        summary.fuzzRuns += runs;
      }
    }
  }
  if (!summary.tests) throw new Error('Forge did not execute any tests.');
  return summary;
}

export function assertNativeExecutable(filename) {
  const fd = fs.openSync(filename, 'r'), magic = Buffer.alloc(4);
  try { fs.readSync(fd, magic, 0, 4, 0); } finally { fs.closeSync(fd); }
  const hex = magic.toString('hex');
  if (!['7f454c46', 'feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca'].includes(hex) && !hex.startsWith('4d5a')) {
    throw new Error('FORGE_BIN must point directly to the native Forge executable; npm/JS/shell wrappers are rejected.');
  }
}

function parseArgs(argv) {
  const options = {forge: process.env.FORGE_BIN, output: path.join(root, '.local-genesis/modules-native')};
  for (const arg of argv) {
    if (arg === '--help') return {help: true};
    if (arg.startsWith('--forge=')) options.forge = arg.slice(8);
    else if (arg.startsWith('--output=')) options.output = arg.slice(9);
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: node scripts/test-modules-native.mjs --forge=/absolute/path/to/native/forge [--output=/reports]\nRequires Forge 1.7.1 and npm ci (locked solc 0.8.30). FORGE_BIN may replace --forge. Runs all module Solidity fixtures offline; no global compilation or deployment.');
    return 0;
  }
  const directory = path.resolve(options.output, new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID().slice(0, 8));
  fs.mkdirSync(directory, {recursive: true});
  const reportFile = path.join(directory, 'results.json');
  const report = {schema: 'anima.modules-native/1', status: 'running', scope: 'Native module Solidity fixtures; local evidence, not production certification', startedAt: new Date().toISOString(), root, forgeVersion: null, compilerVersion: null, summary: null};
  const checkpoint = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  checkpoint();
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    if (!options.forge) throw new Error('Set FORGE_BIN or --forge to the pinned native Forge 1.7.1 executable. See test/modules/native/README.md.');
    const forge = fs.realpathSync(path.resolve(options.forge));
    assertNativeExecutable(forge);
    const version = spawnSync(forge, ['--version'], {encoding: 'utf8', timeout: 10000});
    if (version.error || version.status !== 0 || !/^forge Version: 1\.7\.1(?:[-\s]|$)/m.test(version.stdout)) throw new Error('Native Forge must report version 1.7.1 successfully.');
    report.forgeVersion = version.stdout.trim();
    report.forgeExecutable = forge;
    const compiler = path.join(root, 'test/modules/native/solc-0.8.30.cjs');
    const compilerVersion = spawnSync(process.execPath, [compiler, '--version'], {encoding: 'utf8', timeout: 10000});
    if (compilerVersion.error || compilerVersion.status !== 0 || !compilerVersion.stdout.includes(pinnedSolc)) throw new Error('Install the root locked dependencies with npm ci; exact solc 0.8.30 is required.');
    report.compilerVersion = pinnedSolc;
    // Distribution ZIPs may not preserve executable mode. Set it only on this compiler adapter.
    if (process.platform !== 'win32') fs.chmodSync(compiler, fs.statSync(compiler).mode | 0o100);
    const env = Object.fromEntries(Object.keys(process.env).filter(key => /^(FOUNDRY_|FORGE_|DAPP_)/.test(key)).map(key => [key, undefined]));
    Object.assign(env, {FOUNDRY_PROFILE: 'default', FORGE_ALLOW_FAILURE: 'false', NO_COLOR: '1'});
    let config = fs.readFileSync(path.join(root, 'test/modules/native/foundry.toml'), 'utf8');
    for (const [token, value] of Object.entries({NATIVE_SOURCE: path.join(root, 'test/modules/native'), MODULE_FIXTURES: path.join(root, 'test/modules/fixtures'), PROJECT_ROOT: root})) {
      if (!config.includes(`"@${token}@"`)) throw new Error(`Missing native configuration token ${token}.`);
      config = config.replaceAll(`"@${token}@"`, JSON.stringify(value));
    }
    const configFile = path.join(directory, 'foundry.toml');
    fs.writeFileSync(configFile, config);
    const stage = {
      id: 'forge', command: forge, timeoutMs: 10 * 60 * 1000, env,
      args: ['test', '--root', directory, '--config-path', configFile, '--use', compiler,
        '--offline', '--no-cache', '--out', path.join(directory, 'out'), '--cache-path', path.join(directory, 'cache'),
        '--fuzz-runs', '64', '--fuzz-seed', '0x414e494d41', '--json'],
    };
    report.command = [stage.command, ...stage.args]; checkpoint();
    report.execution = await executeValidationStage(stage, {root, directory, signal: abort.signal, echo: false});
    report.status = report.execution.status;
    try {
      report.summary = summarizeForgeOutput(fs.readFileSync(report.execution.stdoutFile, 'utf8'));
      if (report.summary.failed) report.status = 'failed';
      else if (report.status === 'passed' && report.summary.skipped) report.status = 'incomplete';
    } catch (error) {
      report.summaryError = error.message;
      if (report.status === 'passed') report.status = 'incomplete';
    }
    console.log(`Native module tests: ${report.status}${report.summary ? ` (${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.skipped} skipped, ${report.summary.fuzzRuns} fuzz runs)` : ''}`);
    if (report.status !== 'passed') process.stderr.write(fs.readFileSync(report.execution.stderrFile, 'utf8'));
    return report.status === 'passed' ? 0 : (report.execution.exitCode || 1);
  } catch (error) {
    report.status = 'failed'; report.error = error.stack ?? String(error);
    console.error(error.message); return 1;
  } finally {
    report.finishedAt = new Date().toISOString(); checkpoint();
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
    console.log(`Native module evidence: ${reportFile}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
