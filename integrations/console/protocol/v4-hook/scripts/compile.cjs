const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const solc = require('./dependency.cjs')('solc');
const root = path.resolve(__dirname, '..');

function resolveSource(name) {
  if (name.startsWith('@uniswap/v4-core/')) return path.join(root, 'vendor/v4-core', name.slice('@uniswap/v4-core/'.length));
  if (name.startsWith('solmate/')) return path.join(root, 'vendor/v4-core/lib/solmate', name.slice('solmate/'.length));
  return path.join(root, name);
}

function compile(includeTests = false, {writeArtifacts = true} = {}) {
  if (!solc.version().startsWith('0.8.26+')) throw new Error('This package requires the pinned Solidity 0.8.26 compiler.');
  const files = ['src/OwnerV4FeeHook.sol', 'src/HookCreate2Factory.sol', 'src/GenesisV4Launchpad.sol', 'src/GenesisV4Router.sol', 'src/GenesisV4HookLaunchpad.sol'];
  if (includeTests) files.push('test/RelayAccountingHarness.sol', 'test/NormalFlowDriver.sol', '@uniswap/v4-core/src/PoolManager.sol', 'vendor/v4-periphery/src/lens/V4Quoter.sol');
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const sourceInputs = {};
  function readSource(name) {
    const file = resolveSource(name), content = fs.readFileSync(file, 'utf8');
    sourceInputs[name] = {path: path.relative(root, file).split(path.sep).join('/'), sha256: hash(content)};
    return content;
  }
  const sources = Object.fromEntries(files.map(name => [name, { content: readSource(name) }]));
  const settings = { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: 'cancun',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.deployedBytecode.immutableReferences'] } } };
  const result = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings }), {
    import(name) { try { return { contents: readSource(name) }; } catch (error) { return { error: String(error) }; } }
  }));
  const errors = (result.errors || []).filter(error => error.severity === 'error');
  if (errors.length) throw new Error(errors.map(error => error.formattedMessage).join('\n'));
  if (!writeArtifacts) return result.contracts;
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const summaries = [];
  const manifest = {
    schema: 'anima.v4-compilation/1', compiler: solc.version(), settings, sources: sourceInputs,
    buildInputs: Object.fromEntries(['scripts/compile.cjs', 'scripts/dependency.cjs', 'package.json', 'package-lock.json', 'dependencies.json'].map(name => [name, hash(fs.readFileSync(path.join(root, name)))])),
    artifacts: {},
  };
  for (const [sourceName, contracts] of Object.entries(result.contracts)) {
    if (!sourceName.startsWith('src/')) continue;
    for (const [contractName, contract] of Object.entries(contracts)) {
      const artifact = { contractName, sourceName, compiler: solc.version(), settings,
        abi: contract.abi, bytecode: '0x' + contract.evm.bytecode.object,
        immutableReferences: contract.evm.deployedBytecode.immutableReferences ?? {}, deployedBytecode: '0x' + contract.evm.deployedBytecode.object };
      const bytes = JSON.stringify(artifact, null, 2) + '\n';
      if (Object.values(manifest.artifacts).some(record => record.file === contractName + '.json')) throw Error('Ambiguous v4 contract basename: ' + contractName);
      fs.writeFileSync(path.join(root, 'artifacts', `${contractName}.json`), bytes);
      manifest.artifacts[sourceName + ':' + contractName] = {file: contractName + '.json', sha256: hash(bytes)};
      summaries.push({ contract: contractName, runtimeBytes: contract.evm.deployedBytecode.object.length / 2 });
    }
  }
  fs.writeFileSync(path.join(root, 'artifacts/build-summary.json'), JSON.stringify({
    compiler: solc.version(), evmVersion: settings.evmVersion, optimizer: settings.optimizer,
    contracts: summaries,
    dependencies: JSON.parse(fs.readFileSync(path.join(root, 'dependencies.json'), 'utf8')),
    warnings: (result.errors || []).filter(error => error.severity !== 'error').map(error => error.formattedMessage)
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'artifacts/compilation-inputs.json'), JSON.stringify(manifest, null, 2) + '\n');
  return result.contracts;
}
// Fixtures must not replace artifacts or the compilation manifest bound into a
// previously built runtime. Production publication remains an explicit compile().
function compileFixtures() { return compile(true, {writeArtifacts: false}); }
module.exports = { compile, compileFixtures };
if (require.main === module) {
  compile();
  console.log(fs.readFileSync(path.join(root, 'artifacts/build-summary.json'), 'utf8'));
}
