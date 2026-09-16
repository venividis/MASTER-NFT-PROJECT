// Prepare reproducible public worker shards. This script sends no transactions.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root=path.resolve(import.meta.dirname,'..');
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const write=(base,name,bytes)=>{const target=path.join(base,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);};

export function archivePrivacyResource({source,output,expected}) {
  const bytes=fs.readFileSync(source);
  if(!expected||bytes.length!==expected.bytes||sha256(bytes)!==expected.sha256)throw Error('Worker does not match runtime-integrity.mjs; build and review it before archiving.');
  if(bytes.length<1||bytes.length>64*1024*1024)throw Error('Worker exceeds resource size limits.');
  const compressed=zlib.gzipSync(bytes,{level:9,mtime:0});
  if(compressed.length>32*1024*1024)throw Error('Compressed worker exceeds resource size limits.');
  const shards=[];
  for(let offset=0;offset<compressed.length;offset+=32*23000){
    const part=compressed.subarray(offset,offset+32*23000),index=shards.length,chunks=[];
    for(let at=0;at<part.length;at+=23000){
      const chunk=part.subarray(at,at+23000),file='shards/'+String(index).padStart(2,'0')+'/chunks/'+String(chunks.length).padStart(2,'0')+'.bin';
      write(output,file,chunk);chunks.push({file,bytes:chunk.length,sha256:sha256(chunk)});
    }
    shards.push({index,byteLength:part.length,sha256:sha256(part),chunks});
  }
  if(shards.length>64)throw Error('Worker exceeds directory shard limit.');
  const manifest={schema:'anima.onchain-resource/1',kind:'privacy-worker',compression:'gzip',mimeType:'application/javascript',scope:'Worker bytes only; RAILGUN circuit artifacts and network services remain external.',byteLength:bytes.length,sha256:sha256(bytes),compressedByteLength:compressed.length,compressedSha256:sha256(compressed),shards};
  write(output,'resource.gz',compressed);
  write(output,'manifest.json',JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const {PRIVACY_RUNTIME}=await import(pathToFileURL(path.join(root,'web/privacy/runtime-integrity.mjs')).href);
  const manifest=archivePrivacyResource({source:path.join(root,PRIVACY_RUNTIME.path),output:path.join(root,'onchain-app/privacy-worker'),expected:PRIVACY_RUNTIME});
  console.log(JSON.stringify({byteLength:manifest.byteLength,sha256:manifest.sha256,compressedByteLength:manifest.compressedByteLength,shards:manifest.shards.length,chunks:manifest.shards.reduce((n,s)=>n+s.chunks.length,0)}));
}
