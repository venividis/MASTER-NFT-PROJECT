const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function dependency(name) {
  try { return require(name); }
  catch (error) {
    const workspaceDependency = path.resolve(root, '../../tmp/code-review/node_modules', name);
    if (fs.existsSync(workspaceDependency)) return require(workspaceDependency);
    throw error;
  }
}
const solc = dependency('solc');
const sources = {};
function collect(directory) {
  for (const name of fs.readdirSync(path.join(root, directory))) {
    const relative = path.posix.join(directory, name);
    const absolute = path.join(root, relative);
    if (fs.statSync(absolute).isDirectory()) collect(relative);
    else if (name.endsWith('.sol')) sources[relative] = { content: fs.readFileSync(absolute, 'utf8') };
  }
}
collect('src'); collect('vendor'); collect('test');
const input = {
  language: 'Solidity', sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'shanghai',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'] } }
  }
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
for (const issue of output.errors || []) console.error(issue.formattedMessage);
if ((output.errors || []).some(issue => issue.severity === 'error')) process.exit(1);
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
const index = {};
for (const [sourceName, contracts] of Object.entries(output.contracts)) {
  if (!sourceName.startsWith('src/') && !sourceName.startsWith('test/')) continue;
  for (const [contractName, contract] of Object.entries(contracts)) {
    if (!contract.evm.bytecode.object) continue;
    const artifact = {
      contractName, sourceName, compiler: solc.version(), evmVersion: 'shanghai',
      abi: contract.abi,
      bytecode: '0x' + contract.evm.bytecode.object,
      deployedBytecode: '0x' + contract.evm.deployedBytecode.object,
      metadata: JSON.parse(contract.metadata)
    };
    fs.writeFileSync(path.join(root, 'artifacts', contractName + '.json'), JSON.stringify(artifact, null, 2));
    if (sourceName.startsWith('src/')) index[contractName] = {
      artifact: contractName + '.json', bytecodeBytes: artifact.bytecode.length / 2 - 1,
      runtimeBytes: artifact.deployedBytecode.length / 2 - 1
    };
  }
}
fs.writeFileSync(path.join(root, 'artifacts', 'index.json'), JSON.stringify({ compiler: solc.version(), contracts: index }, null, 2));
console.log(JSON.stringify(index, null, 2));
module.exports = { root, dependency };
