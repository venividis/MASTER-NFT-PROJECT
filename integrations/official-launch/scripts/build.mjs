import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const base = path.join(root, 'integrations/official-launch');
const require = createRequire(path.join(root, 'integrations/console/protocol/v4-hook/package.json'));
const solc = require('solc'), {keccak256} = require('ethers');
if (!solc.version().startsWith('0.8.26+')) throw Error('Official launch contracts require pinned solc 0.8.26.');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const lockFile=path.join(base,'source-lock.json');
if(fs.existsSync(lockFile)){const lock=JSON.parse(fs.readFileSync(lockFile,'utf8'));for(const [file,expected]of Object.entries(lock.files)){const source=path.join(base,'vendor',file);if(!fs.existsSync(source)||sha(fs.readFileSync(source))!==expected)throw Error(`Pinned official protocol source changed or is missing: ${file}`);}}
const out = {};
const groups = {
  cca: ['src/ContinuousClearingAuctionFactory.sol', 'lib/liquidity-launcher/src/strategies/lbp/LBPStrategy.sol', 'lib/liquidity-launcher/src/periphery/ProtocolFeeController.sol', 'lib/v4-periphery/src/PositionManager.sol'],
  ccaPublished: ['src/ContinuousClearingAuctionFactory.sol'],
  permit2: ['lib/v4-periphery/lib/permit2/src/Permit2.sol'],
  doppler: ['src/Airlock.sol', 'src/initializers/UniswapV4Initializer.sol', 'src/tokens/DopplerERC20V1Factory.sol', 'src/governance/LaunchpadGovernanceFactory.sol', 'src/governance/GovernanceFactory.sol', 'src/migrators/UniswapV2MigratorSplit.sol', 'src/TopUpDistributor.sol', 'lib/v4-periphery/lib/v4-core/src/PoolManager.sol', 'lib/solady/src/tokens/WETH.sol'],
};
const wanted = new Set(['ContinuousClearingAuctionFactory','ContinuousClearingAuction','LBPStrategy','ProtocolFeeController','PositionManager','Permit2','Airlock','Doppler','DopplerDeployer','UniswapV4Initializer','DopplerERC20V1Factory','DopplerERC20V1','LaunchpadGovernanceFactory','GovernanceFactory','UniswapV2MigratorSplit','UniswapV2Locker','TopUpDistributor','PoolManager','WETH','OfficialV4SwapRouter','OfficialV4QuoteLens','OfficialCreate2','OfficialLaunchToken','OfficialCCALauncher']);
const diagnostics = [];
for (const [group, entries] of Object.entries(groups)) {
  const vendor = path.join(base, 'vendor', group === 'permit2'||group === 'ccaPublished'?'cca':group), sources = {}, originals = {};
  const v4 = 'lib/v4-periphery/lib/v4-core/';
  const mappings = group !== 'doppler' ? {
    '@openzeppelin/contracts/':'lib/openzeppelin-contracts/contracts/',
    'solady/':'lib/solady/src/', 'blocknumberish/':'lib/blocknumberish/',
    'liquidity-launcher/':'lib/liquidity-launcher/', 'v4-periphery/':'lib/v4-periphery/',
    '@uniswap/v4-core/':v4, '@uniswap/v4-periphery/':'lib/v4-periphery/',
    '@uniswap/blocknumberish/':'lib/blocknumberish/', 'permit2/':'lib/v4-periphery/lib/permit2/',
    'solmate/':v4+'lib/solmate/', 'forge-std/':'lib/forge-std/src/',
  } : {
    '@solady/':'lib/solady/src/', 'solady/':'lib/solady/src/', '@solmate/':'lib/v4-core/lib/solmate/src/',
    '@openzeppelin/':'lib/v4-core/lib/openzeppelin-contracts/contracts/',
    '@v4-core-test/':v4+'test/', '@v4-core/':v4+'src/', '@v4-periphery/':'lib/v4-periphery/src/',
    '@v3-core/':'lib/v3-core/contracts/', '@v3-periphery/':'lib/v3-periphery/contracts/',
    '@uniswap/v4-core/':v4, '@uniswap/v4-periphery/':'lib/v4-periphery/',
    'permit2/':'lib/v4-periphery/lib/permit2/', 'solmate/':'lib/v4-core/lib/solmate/',
    'forge-std/':'lib/forge-std/src/',
  };
  function resolve(spec, from) {
    if (spec.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(from),spec));
    for (const [prefix, target] of Object.entries(mappings)) if (spec.startsWith(prefix)) return target+spec.slice(prefix.length);
    return spec;
  }
  function load(key) {
    if (sources[key]) return;
    const disk = key.startsWith('ANIMA/') ? path.join(base,'src',key.slice(6)) : path.join(vendor,key);
    if (!fs.existsSync(disk)) throw Error(`Missing pinned ${group} dependency: ${key} (${disk})`);
    const original = fs.readFileSync(disk,'utf8'); originals[key] = sha(original);
    const imports = [];
    const content = original.replace(/(import\s+(?:[^;'"]+?\s+from\s+)?["'])([^"']+)(["']\s*;)/g, (_,a,spec,b) => {const target=resolve(spec,key);imports.push(target);return a+target+b;});
    sources[key] = {content};
    for (const target of imports) load(target);
  }
  entries.forEach(load);
  if (group === 'cca') load('ANIMA/OfficialCCALauncher.sol');
  if (group === 'doppler') ['OfficialV4SwapRouter.sol','OfficialV4QuoteLens.sol','OfficialCreate2.sol','OfficialLaunchToken.sol'].forEach(x=>load('ANIMA/'+x));
  const compiler=group==='permit2'?createRequire(path.join(base,'package.json'))('solc-017'):solc;
  const settings = {optimizer:{enabled:true,runs:group.startsWith('cca')?11111:group==='permit2'?1000000:0},viaIR:true,evmVersion:group==='permit2'?'london':'cancun',metadata:{bytecodeHash:'none',...(group==='permit2'||group==='ccaPublished'?{}:{appendCBOR:false})},outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}};
  const input = {language:'Solidity',sources,settings};
  const cacheFile=path.join(base,'artifacts',`build-${group}.json`),inputHash=sha(JSON.stringify(input));
  if(!process.argv.includes('--force')&&fs.existsSync(cacheFile)){
    const cache=JSON.parse(fs.readFileSync(cacheFile,'utf8'));
    if(cache.inputHash===inputHash&&Object.entries(cache.files).every(([n,h])=>fs.existsSync(path.join(base,'artifacts',n+'.json'))&&sha(fs.readFileSync(path.join(base,'artifacts',n+'.json')))===h)){
      for(const name of Object.keys(cache.files))out[name]=JSON.parse(fs.readFileSync(path.join(base,'artifacts',name+'.json'),'utf8'));
      diagnostics.push({group,compiler:compiler.version(),sourceInputSha256:inputHash,sources:originals,settings});continue;
    }
  }
  const compiled = JSON.parse(compiler.compile(JSON.stringify(input)));
  const errors = compiled.errors?.filter(x=>x.severity==='error') || [];
  if (errors.length) throw Error(errors.map(e=>e.formattedMessage).join('\n'));
  const cacheFiles={};
  for (const [file, contracts] of Object.entries(compiled.contracts)) for(const [name, artifact] of Object.entries(contracts)) {
    if (!wanted.has(name) || !artifact.evm.bytecode.object) continue;
    const bytecode = '0x'+artifact.evm.bytecode.object, runtime='0x'+artifact.evm.deployedBytecode.object;
    const immutableGroups=Object.values(artifact.evm.deployedBytecode.immutableReferences||{}), masks=immutableGroups.flat();
    let normalized=runtime.slice(2);for(const m of masks) normalized=normalized.slice(0,m.start*2)+'0'.repeat(m.length*2)+normalized.slice((m.start+m.length)*2);
    const data = {group,file,name,abi:artifact.abi,bytecode,creationHash:keccak256(bytecode),bytes:(runtime.length-2)/2,normalizedHash:keccak256('0x'+normalized),masks,immutableGroups,sourceInputSha256:sha(JSON.stringify(input)),compiler:solc.version(),settings};
    const storedName=group==='ccaPublished'?name+'.published':name;
    fs.mkdirSync(path.join(base,'artifacts'),{recursive:true});fs.writeFileSync(path.join(base,'artifacts',storedName+'.json'),JSON.stringify(data,null,2)+'\n');cacheFiles[storedName]=sha(fs.readFileSync(path.join(base,'artifacts',storedName+'.json')));out[storedName]=data;
  }
  fs.writeFileSync(cacheFile,JSON.stringify({inputHash,files:cacheFiles},null,2)+'\n');
  diagnostics.push({group,compiler:solc.version(),sourceInputSha256:sha(JSON.stringify(input)),sources:originals,settings});
}
fs.writeFileSync(path.join(base,'artifacts/build-manifest.json'),JSON.stringify(diagnostics,null,2)+'\n');
// Browser references carry bounded bytecode checks. Large deployment payloads remain optional modules.
const browser=Object.fromEntries(Object.entries(out).filter(([name])=>!name.endsWith('.published')).map(([name,a])=>[name,{abi:a.abi,bytes:a.bytes,normalizedHash:a.normalizedHash,masks:a.masks,immutableGroups:a.immutableGroups,creationHash:a.creationHash,variants:out[name+'.published']?[{bytes:out[name+'.published'].bytes,normalizedHash:out[name+'.published'].normalizedHash,masks:out[name+'.published'].masks,immutableGroups:out[name+'.published'].immutableGroups,source:'Official CCA factory compiler profile: solc 0.8.26, via IR, 11111 optimizer runs, CBOR solc metadata, no bytecode hash'}]:[]}]));
fs.writeFileSync(path.join(root,'web/launchpad/protocols-artifacts.mjs'),'// Generated by integrations/official-launch/scripts/build.mjs\nexport const PROTOCOL_ARTIFACTS='+JSON.stringify(browser)+';\n');
fs.writeFileSync(path.join(root,'web/launchpad/protocols-deployments.mjs'),'// Exact optional deployment payloads; generated from pinned source.\nexport const PROTOCOL_DEPLOYMENTS='+JSON.stringify(Object.fromEntries(Object.entries(out).filter(([n])=>!n.endsWith('.published')).map(([n,a])=>[n,a.bytecode])))+';\n');
console.log(`Built ${Object.keys(out).length} pinned official launch contracts.`);
