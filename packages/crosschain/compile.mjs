import fs from 'node:fs';
import path from 'node:path';
import solc from '../../node_modules/solc/index.js';
const root=path.resolve(import.meta.dirname,'../..');
export function compileBridge({fixtures=false}={}){
 const sourceNames=['contracts/src/extensions/crosschain/LayerZeroInterfaces.sol','contracts/src/extensions/crosschain/AnimaOFTSource.sol','contracts/src/extensions/crosschain/AnimaOFTComposer.sol'];
 const sources=Object.fromEntries(sourceNames.map(p=>[p,{content:fs.readFileSync(path.join(root,p),'utf8')} ]));
 if(fixtures)sources['test/crosschain/Fixture.sol']={content:fs.readFileSync(path.join(root,'test/crosschain/Fixture.sol'),'utf8')};
 const input={language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:1000},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}};
 const output=JSON.parse(solc.compile(JSON.stringify(input),{import:p=>{try{return {contents:fs.readFileSync(path.join(p.startsWith('@')?path.join(root,'packages/crosschain/node_modules'):root,p),'utf8')}}catch{return {error:'Source missing: '+p}}}}));
 const errors=(output.errors||[]).filter(x=>x.severity==='error');if(errors.length)throw Error(errors.map(x=>x.formattedMessage).join('\n'));
 return {input,output,contracts:Object.fromEntries(Object.values(output.contracts).flatMap(file=>Object.entries(file)))};
}
