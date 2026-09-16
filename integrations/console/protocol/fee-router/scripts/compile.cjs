const fs = require('node:fs');
const path = require('node:path');
const solc = require('./dependency.cjs')('solc');
const root = path.resolve(__dirname, '..');

function sourceTree(directory, output = {}) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) sourceTree(relative, output);
    else if (entry.name.endsWith('.sol')) output[relative] = { content: fs.readFileSync(path.join(root, relative), 'utf8') };
  }
  return output;
}

function compile(includeTests = false) {
  const sources = sourceTree('src');
  if (includeTests) sourceTree('test', sources);
  const settings = {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'shanghai',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'] } }
  };
  const result = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings })));
  const errors = (result.errors || []).filter(error => error.severity === 'error');
  if (errors.length) throw new Error(errors.map(error => error.formattedMessage).join('\n'));
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const summaries = [];
  for (const [sourceName, contracts] of Object.entries(result.contracts)) {
    if (!sourceName.startsWith('src/')) continue;
    for (const [contractName, contract] of Object.entries(contracts)) {
      const artifact = { contractName, sourceName, compiler: solc.version(), settings,
        abi: contract.abi, bytecode: '0x' + contract.evm.bytecode.object,
        deployedBytecode: '0x' + contract.evm.deployedBytecode.object };
      fs.writeFileSync(path.join(root, 'artifacts', `${contractName}.json`), JSON.stringify(artifact, null, 2) + '\n');
      summaries.push({ contract: contractName, runtimeBytes: contract.evm.deployedBytecode.object.length / 2 });
    }
  }
  fs.writeFileSync(path.join(root, 'artifacts', 'build-summary.json'), JSON.stringify({
    compiler: solc.version(), evmVersion: settings.evmVersion,
    optimizer: settings.optimizer, contracts: summaries,
    warnings: (result.errors || []).filter(error => error.severity !== 'error').map(error => error.formattedMessage)
  }, null, 2) + '\n');
  return result.contracts;
}

module.exports = { compile };
if (require.main === module) {
  compile();
  process.stdout.write(fs.readFileSync(path.join(root, 'artifacts', 'build-summary.json'), 'utf8'));
}
