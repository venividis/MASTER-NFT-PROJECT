import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {assertNativeExecutable, summarizeForgeOutput} from '../../scripts/test-modules-native.mjs';

const output = tests => JSON.stringify({'Cartridges.t.sol:CartridgesTest': {test_results: tests}});
test('native evidence counts successful, failed and skipped cases and actual fuzz executions', () => {
  assert.deepEqual(summarizeForgeOutput(output({a: {status: 'Success', kind: {Standard: {}}}, b: {status: 'Failure', kind: {Fuzz: {runs: 64}}}, c: {status: 'Skipped'}})), {tests: 3, passed: 1, failed: 1, skipped: 1, fuzzRuns: 64});
});
test('native evidence rejects missing, truncated, empty and unknown test summaries', () => {
  for (const value of ['', '{', '{}', '[]', '{"suite":{}}', output({}), output({test: {status: 'Maybe'}}), output({test: {status: 'Success', kind: {Fuzz: {runs: 0}}}})]) assert.throws(() => summarizeForgeOutput(value));
});
test('the npm JavaScript wrapper cannot be accepted as a native executable', () => {
  assert.throws(() => assertNativeExecutable(fileURLToPath(import.meta.url)), /native Forge executable/);
  assert.doesNotThrow(() => assertNativeExecutable(process.execPath));
});
