import fs from 'node:fs';import path from 'node:path';import {keccak256} from 'ethers';
const root=path.resolve(import.meta.dirname,'..'),out={};
for(const name of ['CommissionedCartridges','CommissionEscrow','CartridgeRegistry','ArtifactBinding']){
  const a=JSON.parse(fs.readFileSync(path.join(root,'contracts/artifacts',name+'.json')));let code=a.deployedBytecode.slice(2);const masks=Object.values(a.immutableReferences||{}).flat();for(const m of masks)code=code.slice(0,m.start*2)+'0'.repeat(m.length*2)+code.slice((m.start+m.length)*2);
  out[name]={abi:a.abi,bytes:code.length/2,masks,hash:keccak256('0x'+code)};
}
fs.writeFileSync(path.join(root,'web/workshop/contracts.mjs'),'// Generated from this release’s compiled contracts.\nexport const WORKSHOP_CONTRACTS='+JSON.stringify(out)+';\n');
console.log('Workshop ABI and code fingerprints generated.');
