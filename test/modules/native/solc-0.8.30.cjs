#!/usr/bin/env node
'use strict';

// Forge uses its native EVM; only compilation is delegated to the project's locked solc.
// There is no compiler download and no rewriting of Solidity's standard JSON output.
const solc = require('solc');
const version = solc.version();
if (version !== '0.8.30+commit.73712a01.Emscripten.clang') {
  process.stderr.write(`Expected locked solc 0.8.30, received ${version}\n`);
  process.exitCode = 1;
} else if (process.argv.includes('--version')) {
  process.stdout.write(`solc, the solidity compiler commandline interface\nVersion: ${version}\n`);
} else if (process.argv.includes('--standard-json')) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try { process.stdout.write(solc.compile(input)); }
    catch (error) { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; }
  });
} else {
  process.stderr.write('Only --version and --standard-json are supported.\n');
  process.exitCode = 1;
}
