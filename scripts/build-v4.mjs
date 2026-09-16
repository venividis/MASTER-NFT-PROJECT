import fs from 'node:fs';import path from 'node:path';import {keccak256} from 'ethers';
import {verifyV4Compilation} from './lib/v4-compilation.mjs';
const root=path.resolve(import.meta.dirname,'..');
verifyV4Compilation(root);
const names=['GenesisV4Launchpad','GenesisV4Position','GenesisV4Router'];const result={};
for(const name of names){const a=JSON.parse(fs.readFileSync(path.join(root,'integrations/console/protocol/v4-hook/artifacts',name+'.json')));const immutableGroups=Object.values(a.immutableReferences||{}),masks=immutableGroups.flat();let code=a.deployedBytecode.slice(2);for(const m of masks)code=code.slice(0,m.start*2)+'0'.repeat(m.length*2)+code.slice((m.start+m.length)*2);result[name]={abi:a.abi,normalizedHash:keccak256('0x'+code),bytes:code.length/2,masks,immutableGroups};}
fs.mkdirSync(path.join(root,'web/v4'),{recursive:true});fs.writeFileSync(path.join(root,'web/v4/artifacts.mjs'),'// Generated from the pinned, compiled Cancun contracts.\nexport const ARTIFACTS='+JSON.stringify(result)+';\n');
console.log('v4 ABI and runtime fingerprints built.');
