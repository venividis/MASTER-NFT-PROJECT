import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {recoverResource} from '../../web/privacy/recover-resource.mjs';

const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const digest=(value,label)=>{if(typeof value!=='string'||!/[0-9a-f]{64}/.test(value)||value.length!==64)throw Error('Invalid '+label+' digest.');return value;};
const positive=(value,max,label)=>{if(!Number.isSafeInteger(value)||value<1||value>max)throw Error('Invalid '+label+'.');return value;};
const hex=bytes=>'0x'+bytes.toString('hex');

/** Validate EVERYTHING before deploying the first chunk. No transactions here. */
export function readPrivacyResource(manifestPath,expected) {
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')),base=path.dirname(path.resolve(manifestPath));
  if(manifest.schema!=='anima.onchain-resource/1'||manifest.kind!=='privacy-worker'||manifest.compression!=='gzip'||manifest.mimeType!=='application/javascript')throw Error('Unsupported privacy resource manifest.');
  positive(manifest.byteLength,64*1024*1024,'expanded bytes');positive(manifest.compressedByteLength,32*1024*1024,'compressed bytes');
  digest(manifest.sha256,'raw');digest(manifest.compressedSha256,'compressed');
  if(!expected||manifest.byteLength!==expected.bytes||manifest.sha256!==expected.sha256)throw Error('Archive does not match the reviewed privacy runtime.');
  if(!Array.isArray(manifest.shards)||!manifest.shards.length||manifest.shards.length>64)throw Error('Invalid shard list.');
  const seen=new Set(),shards=manifest.shards.map((shard,index)=>{
    if(shard.index!==index||!Array.isArray(shard.chunks)||!shard.chunks.length||shard.chunks.length>64)throw Error('Invalid ordered shard.');
    positive(shard.byteLength,64*23000,'shard bytes');digest(shard.sha256,'shard');
    const chunks=shard.chunks.map((chunk,i)=>{
      const expectedFile='shards/'+String(index).padStart(2,'0')+'/chunks/'+String(i).padStart(2,'0')+'.bin';
      if(chunk.file!==expectedFile||seen.has(chunk.file))throw Error('Invalid or duplicate chunk path.');seen.add(chunk.file);
      positive(chunk.bytes,23000,'chunk bytes');digest(chunk.sha256,'chunk');
      const file=path.join(base,chunk.file),resolved=fs.realpathSync(file);
      if(!resolved.startsWith(fs.realpathSync(base)+path.sep))throw Error('Resource chunk resolves outside its archive.');
      const bytes=fs.readFileSync(resolved);if(bytes.length!==chunk.bytes||hash(bytes)!==chunk.sha256)throw Error('Resource chunk differs from its manifest.');return bytes;
    });
    const bytes=Buffer.concat(chunks);if(bytes.length!==shard.byteLength||hash(bytes)!==shard.sha256)throw Error('Resource shard differs from its manifest.');return {...shard,chunks};
  });
  const compressed=Buffer.concat(shards.flatMap(s=>s.chunks));
  if(compressed.length!==manifest.compressedByteLength||hash(compressed)!==manifest.compressedSha256)throw Error('Compressed resource differs from its manifest.');
  const raw=zlib.gunzipSync(compressed,{maxOutputLength:manifest.byteLength});
  if(raw.length!==manifest.byteLength||hash(raw)!==manifest.sha256)throw Error('Expanded resource differs from its manifest.');
  return {manifest,shards,raw};
}

/**
 * Caller supplies its already-authorized deployment flow:
 * deploy(name,args,key) -> ethers Contract, provider -> ethers Provider.
 * Existing genesis-stack.mjs already restricts that flow to local chain 31337.
 * No deployment occurs on import. Public deployment requires the caller's normal
 * reviewed transaction flow; this helper does not bypass it or obtain a signer.
 */
export async function deployPrivacyResource({deploy,provider,manifestPath,expected,progress=()=>{}}) {
  const {manifest,shards,raw}=readPrivacyResource(manifestPath,expected);
  const chainId=(await provider.getNetwork()).chainId.toString(),locations=[];
  let complete=0;const total=shards.reduce((n,s)=>n+s.chunks.length,0);
  for(const shard of shards){
    const chunks=[];
    for(const [i,bytes] of shard.chunks.entries()){
      const contract=await deploy('AppChunk',[hex(bytes)],'privacyChunk'+shard.index+'_'+i);
      chunks.push(contract.target);progress({phase:'deploy-chunk',completed:++complete,total});
    }
    const archive=await deploy('OnchainApp',[chunks,'0x'+shard.sha256],'privacyShard'+shard.index);locations.push(archive.target);
  }
  const resource=await deploy('ShardedResource',[locations,'0x'+manifest.compressedSha256,'0x'+manifest.sha256,manifest.byteLength],'privacyResource');
  const descriptor={resource:resource.target,chainId,sha256:manifest.sha256,byteLength:manifest.byteLength};
  const recovered=await recoverResource(p=>provider.send(p.method,p.params),descriptor,{progress,maxCompressedBytes:32*1024*1024,maxExpandedBytes:64*1024*1024,maxShards:64});
  if(!Buffer.from(recovered).equals(raw))throw Error('Published privacy worker failed exact byte recovery.');
  return {...descriptor,compressedSha256:manifest.compressedSha256,compressedByteLength:manifest.compressedByteLength,shards:locations,chunks:total,roundtripVerified:true,scope:'Immutable worker archive; circuit artifacts remain external.'};
}
