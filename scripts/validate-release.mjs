import path from 'node:path';
import {parseValidationArgs, validationStages, validationLimits, runLocalValidation} from './lib/local-validation.mjs';

const root = path.resolve(import.meta.dirname, '..');
const help = `Usage: node scripts/validate-release.mjs [--list] [--install] [--stages=id,id] [--integrity-root=directory] [--output=directory] [--timeout-minutes=N]

Default: run the complete local suite using preinstalled dependencies.
--install also runs the full locked dependency installer after input verification.
--list prints commands and budgets without running or writing anything.
--stages runs only named stages, in canonical order, and can only yield a partial pass.
Omitted prerequisites reuse existing artifacts; failures within this run block dependents.
Each invocation creates a new evidence directory; earlier successful stages are never imported.
--integrity-root verifies a preserved source tree and records its manifest hash separately
from the working commit. It does not establish integrity of different working source.
The candidate's authored-input inventory and Git diff-byte hashes are saved before/after.
Unexpected input drift invalidates the result even if every command exits successfully.
The versioned input policy excludes exact regenerated outputs and installed dependencies;
pinned runtime binaries and proof artifacts remain inputs. See candidate-inputs.*.json.
No inventory is regenerated. A release candidate needs its intentionally reviewed inventory;
an input-integrity failure remains a failure even if later diagnostics pass.
Default logs/status: .local-genesis/validation/ (excluded from release inventories).
Custom --output must be outside the project or under .local-genesis.
Browser/native/device and public-chain acceptance remain separate gates.
Native Keccak requires cc (or CC). TMPDIR/TMP/TEMP and CC are recorded in provenance.
Temporary storage must support Ganache's LevelDB operations; unavailable storage fails tests.
Forced runner termination can leave status running; unfinished evidence never proves a pass.
`;

try {
  const options = parseValidationArgs(process.argv.slice(2), root);
  if (options.help) console.log(help);
  else if (options.list) {
    for (const stage of validationStages(root, options.integrityRoot)) {
      console.log(`${stage.id}${stage.optional ? ' (opt-in)' : ''}: ${stage.label}`);
      console.log(JSON.stringify({command: stage.command, args: stage.args, env: stage.env ?? {}, prerequisites: stage.dependencies, timeoutMinutes: (options.timeoutMs ?? stage.timeoutMs) / 60_000}));
    }
    for (const limit of validationLimits) console.log(limit);
  } else {
    const controller = new AbortController();
    const interrupt = () => controller.abort();
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    try {
      const report = await runLocalValidation({...options, signal: controller.signal});
      console.log(`\n${report.status}. Evidence: ${report.reportFile}`);
      console.log(validationLimits[0]);
      process.exitCode = report.status === 'interrupted' ? 130 : report.status.startsWith('passed-') ? 0 : 1;
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    }
  }
} catch (error) {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
}
