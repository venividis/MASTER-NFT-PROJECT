import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

/** Isolated privacy compile for integration tests; never mutates shared build artifacts. */
export function compilePrivacy(extraSources={}){
 const root=path.resolve(import.meta.dirname,'../..'),dir=path.join(root,'contracts/src/extensions/privacy');
 const sources={...extraSources};
 for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.sol'))){const name=`contracts/src/extensions/privacy/${file}`;sources[name]={content:fs.readFileSync(path.join(dir,file),'utf8')};}
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:1000},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}})));
 const errors=(output.errors||[]).filter(x=>x.severity==='error');if(errors.length)throw Error(errors.map(x=>x.formattedMessage).join('\n'));
 return Object.fromEntries(Object.values(output.contracts).flatMap(file=>Object.entries(file).map(([name,c])=>[name,{abi:c.abi,bytecode:`0x${c.evm.bytecode.object}`,runtimeBytes:c.evm.deployedBytecode.object.length/2}])));
}
