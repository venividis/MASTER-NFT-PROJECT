import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../../../',import.meta.url),base=new URL('../',import.meta.url);
const deployed=JSON.parse(fs.readFileSync(new URL('vendor/doppler/Deployments.json',base),'utf8'));
const map={Airlock:'airlock',DopplerDeployer:'dopplerDeployer',DopplerERC20V1Factory:'tokenFactory',UniswapV4Initializer:'poolInitializer',LaunchpadGovernanceFactory:'governanceFactory',UniswapV2MigratorSplit:'liquidityMigrator',TopUpDistributor:'topUp'};
const result={};for(const [chain,values]of Object.entries(deployed)){result[chain]={};for(const [name,key]of Object.entries(map))if(values[name])result[chain][key]=values[name];}
const uniswap=JSON.parse(fs.readFileSync(new URL('official-uniswap-deployments.json',base),'utf8'));
for(const record of uniswap.records){const key=record.protocol==='v4'?({PoolManager:'manager',PositionManager:'positionManager',Permit2:'permit2'}[record.contract]):record.protocol==='v2'&&['UniswapV2Factory','Factory'].includes(record.contract)?'v2Factory':null;if(key&&record.status==='active'){result[record.chainId] ||= {};result[record.chainId][key]=record.address;}}
// CCA's official README lists a cross-chain factory, not a chain-by-chain deployment proof.
const cca='0x000000001F26a0044BaA66024e7b6599c61963F8';
for(const value of Object.values(result))value.ccaFactory=cca;
fs.writeFileSync(new URL('web/launchpad/protocols-networks.mjs',root),'// Official published address suggestions only. Execution still requires pinned runtime verification.\n// Doppler: vendor/doppler/Deployments.json at 5754c7ee01f1bdbd6f07c62be721e1223b725ecd\n// CCA: https://github.com/Uniswap/continuous-clearing-auction (v2.1.0 deployment table, retrieved 2026-09-13)\nexport const OFFICIAL_NETWORKS='+JSON.stringify(result)+';\n');
console.log('Saved official deployment suggestions; no RPC deployment claims made.');
