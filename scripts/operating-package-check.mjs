/** Source tripwires + complete compiler-input preparation. NOT compilation or an audit. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'reports/v1.6');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const paths=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?paths(path.join(d,e.name)):[path.join(d,e.name)]);
const sources={};for(const p of paths(path.join(root,'contracts/src')).filter(x=>x.endsWith('.sol')).sort()){
 const key=path.relative(root,p).split(path.sep).join('/'),content=fs.readFileSync(p,'utf8');sources[key]={content};
 for(const m of content.matchAll(/import\s+(?:[\s\S]*?from\s*)?["']([^"']+)["']\s*;/g)){if(!m[1].startsWith('.'))throw Error('External import requires explicit dependency: '+m[1]);if(!fs.existsSync(path.resolve(path.dirname(p),m[1])))throw Error('Missing import '+m[1]);}
}
const input={language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:1000},viaIR:true,evmVersion:'cancun',metadata:{bytecodeHash:'ipfs',appendCBOR:true},outputSelection:{'*':{'*':['abi','metadata','evm.bytecode.object','evm.deployedBytecode.object','evm.methodIdentifiers']}}}};
fs.writeFileSync(path.join(out,'compiler-input.json'),JSON.stringify(input,null,2)+'\n');
const checks=[];function check(name,value){if(!value)throw Error('Source boundary missing: '+name);checks.push({name,passed:true});}
const cell=read('contracts/src/operating/ExperimentCell.sol'),index=read('contracts/src/operating/CommitmentIndex.sol'),account=read('contracts/src/core/SovereignAccount.sol'),exchange=read('contracts/src/kingdom/EstateExchange.sol'),gift=read('contracts/src/instruments/ConsentGiftRouter.sol'),router=read('contracts/src/operating/InstrumentRouter.sol');
check('Cell rejects root and self adapters',cell.includes('adapter==address(root)||adapter==address(this)'));
check('Cell has explicit ownership-epoch permission',cell.includes('p.epoch!=epoch'));
check('Cell exact token allowances reset',cell.includes('ProtocolAssets.approveExact(inputs[i].asset,adapter,0)'));
check('Cell output balance minimum checked',cell.includes('beforeOut[i]+outputs[i].minimum'));
check('Cell current controller cannot bypass sovereign owner policy',cell.includes('root.mode()!=0||msg.sender!=root.currentOwner()'));
check('Cell root identity rechecked after callback',cell.includes('root.currentOwner()!=holder'));
check('Cell snapshot mandatory regardless roster contents',index.includes('cellOkRoot')&&index.includes('IAccountCommitment.accountCommitment,(account)'));
check('Index includes remote counterparty changes in the cell',index.includes('IAccountCommitment.accountCommitment,(cell)'));
check('Index roster bounded',index.includes('modules_.length>16'));
check('Exchange pre/post callback inventory checks',exchange.includes('_inventory(id);l.status=2')&&exchange.includes('revert StaleCovenant();_inventory(id)'));
check('Exchange checks account nonce and instrument revision',exchange.includes('accountNonces[id]')&&exchange.includes('instrumentRevisions[id]'));
check('Gift construction does not require a presealed ledger',gift.includes('constructor(address ledger_,address market_,address vault_)')&&!gift.includes('if(!l.isSealed()'));
check('Gift calls still require sealed matching modules',gift.includes('if(!ledger.isSealed()||ledger.market()!=market'));
check('Instrument router construction breaks seal cycle',router.includes('constructor(address ledger_,address market_,address vault_)'));
check('Instrument router execution refuses unsealed module sets',router.includes('if(!ledger.isSealed()||block.timestamp>deadline'));
check('Grant binds exact calldata and custody epoch',account.includes('g.epoch!=sessionEpoch')&&account.includes('keccak256(data)!=g.dataHash'));
check('Account can receive external collectibles without accepting root safe-nesting',account.includes('function onERC721Received')&&account.includes('if(msg.sender==collection) revert InvalidTarget()'));
check('No arbitrary code execution in local operating engine',!/\beval\s*\(|new\s+Function\b/.test(read('web/operating/engine.mjs')));
check('Original layer preservation manifest exists',JSON.parse(read('reports/v1.6/preservation.json')).originalPreserved===true||read('reports/v1.6/preservation.json').includes('6b1fb23f63cf5aa65283b8be2f1446dddae38622b7ea8c164249c8cc74146bb6'));
const report={scope:'Source text and import path checks only; not parsed or executed Solidity',sourceFiles:Object.keys(sources).length,preparedCompiler:'0.8.30',target:'cancun',passed:checks.length,checks,compilerInputSha256:createHash('sha256').update(JSON.stringify(input,null,2)+'\n').digest('hex'),compilationPerformed:false};fs.writeFileSync(path.join(out,'source-boundaries.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
