/** Prepare local chunks for OnchainApp. This script does not store anything onchain. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {keccak256} from '../web/evm.mjs';
if(!process.argv.includes('--historical'))throw Error('Historical archive command. Use npm run archive:confluence for current Genesis, or add --historical.');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'history/onchain-v1.7');
const input=fs.readFileSync(path.join(root,'history/previews/instruments.html')),size=23000;
if(Math.ceil(input.length/size)>32)throw Error('Application exceeds OnchainApp limit of 32 chunks.');
fs.rmSync(path.join(out,'chunks'),{recursive:true,force:true});fs.mkdirSync(path.join(out,'chunks'),{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),chunks=[];
for(let i=0;i<input.length;i+=size){const data=input.subarray(i,i+size),name=`chunks/${String(chunks.length).padStart(2,'0')}.bin`;fs.writeFileSync(path.join(out,name),data);chunks.push({file:name,bytes:data.length,sha256:sha(data),expectedRuntimeCodeHash:keccak256(new Uint8Array(Buffer.concat([Buffer.from([0]),data]))),deployedAddress:null});}
const assembled=Buffer.concat(chunks.map(x=>fs.readFileSync(path.join(out,x.file))));
if(!assembled.equals(input))throw Error('Archive reassembly mismatch.');
const manifest={schema:'idfbi/local-onchain-app-preparation/1.7',status:'LOCAL BYTES ONLY; NOT DEPLOYED',chainId:null,rootContract:null,applicationMode:'unsigned local rehearsal; archiving it does not wire a live GUI',htmlBytes:input.length,sha256:sha(input),chunkCount:chunks.length,chunkLimit:size,runtimeLayout:'STOP (0x00) followed by chunk bytes',chunks};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({chunkCount:chunks.length,htmlBytes:input.length,sha256:sha(input),reassembly:'byte-identical',deployment:false},null,2));
