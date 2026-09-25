#!/usr/bin/env node
/** Export the exact recovered mint for static, strictly read-only playback. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {exportFrozenMint} from './lib/prism-simulator-export.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),options={url:'http://127.0.0.1:4173',output:path.join(root,'simulator-export')};
const seen=new Set();
for(let index=0;index<args.length;index+=2){
 const option=args[index],value=args[index+1];
 if(!['--url','--output','--snapshot'].includes(option)||!value||value.startsWith('--')||seen.has(option))throw Error('Usage: node scripts/prism-simulator-export.mjs [--url http://127.0.0.1:4173 | --snapshot verified-snapshot.json] [--output fresh-directory]');
 seen.add(option);options[option.slice(2)]=value;
}
if(seen.has('--url')&&seen.has('--snapshot'))throw Error('Choose either the local simulator URL or a previously verified snapshot file.');
let snapshot;
if(options.snapshot)snapshot=JSON.parse(fs.readFileSync(path.resolve(options.snapshot),'utf8'));
else{
 const url=new URL(options.url);
 if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error('Export URL must be an exact loopback HTTP origin.');
 url.pathname='/simulator/snapshot';
 const response=await fetch(url,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error('Local snapshot HTTP '+response.status);
 const parts=[];let size=0;
 for await(const part of response.body){size+=part.length;if(size>96*1024*1024)throw Error('Local snapshot exceeds 96 MiB');parts.push(part);}
 snapshot=JSON.parse(Buffer.concat(parts).toString('utf8'));
}
// A stale simulator or copied proof cannot silently replace this checkout's release.
for(const[field,file]of [['runtimeHtml','onchain-app/confluence/runtime.html'],['workbenchHtml','onchain-app/module-workbench/index.html']]){
 const expected=fs.readFileSync(path.join(root,file));
 if(typeof snapshot[field]!=='string'||!expected.equals(Buffer.from(snapshot[field])))throw Error('Frozen mint differs from current release: '+file);
}
const result=exportFrozenMint(snapshot,path.resolve(options.output));
console.log(JSON.stringify({output:result.output,files:result.files,chainId:result.manifest.chainId,tokenId:result.manifest.tokenId,block:result.manifest.block,blockHash:result.manifest.blockHash,fidelity:result.manifest.fidelity},null,2));
