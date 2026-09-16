const fs = require('node:fs');
const path = require('node:path');
const solc = require('./dependencies.cjs')('solc');
const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'contracts/PrismRelay.sol');
const input = {
  language: 'Solidity',
  sources: { 'PrismRelay.sol': { content: fs.readFileSync(sourcePath, 'utf8') } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'shanghai',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
for (const error of output.errors || []) process.stderr.write(error.formattedMessage + '\n');
if ((output.errors || []).some(error => error.severity === 'error')) process.exit(1);
const contract = output.contracts['PrismRelay.sol'].PrismRelay;
const artifact = {
  contractName: 'PrismRelay',
  sourceName: 'PrismRelay.sol',
  compiler: solc.version(),
  settings: input.settings,
  abi: contract.abi,
  bytecode: '0x' + contract.evm.bytecode.object,
  deployedBytecode: '0x' + contract.evm.deployedBytecode.object,
  runtimeBytes: contract.evm.deployedBytecode.object.length / 2,
};
if (artifact.runtimeBytes > 24576) throw new Error('Runtime exceeds EIP-170');
const dir = path.join(root, 'artifacts');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'PrismRelay.json'), JSON.stringify(artifact, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'PrismRelay.abi.json'), JSON.stringify(artifact.abi, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'PrismRelay.bytecode.txt'), artifact.bytecode + '\n');
process.stdout.write(JSON.stringify({ compiler: artifact.compiler, runtimeBytes: artifact.runtimeBytes, artifact: 'artifacts/PrismRelay.json' }) + '\n');
