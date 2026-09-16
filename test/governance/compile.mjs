import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

export function compileGovernance(extraSources={}){
 const root=path.resolve(import.meta.dirname,'../..');const source='contracts/src/extensions/governance/OperatingNFTGovernance.sol';
 const input={language:'Solidity',sources:{[source]:{content:fs.readFileSync(path.join(root,source),'utf8')},...extraSources},settings:{optimizer:{enabled:true,runs:1000},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}};
 const output=JSON.parse(solc.compile(JSON.stringify(input),{import:n=>({contents:fs.readFileSync(path.join(root,n),'utf8')})}));const errors=(output.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw Error(errors.map(e=>e.formattedMessage).join('\n'));
 return Object.fromEntries(Object.values(output.contracts).flatMap(file=>Object.entries(file).map(([name,c])=>[name,{abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,runtime:'0x'+c.evm.deployedBytecode.object,immutableReferences:c.evm.deployedBytecode.immutableReferences,runtimeBytes:c.evm.deployedBytecode.object.length/2,compiler:solc.version()}])));
}
