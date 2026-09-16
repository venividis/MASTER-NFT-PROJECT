import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {atomicDirectory} from './lib/runtime-graph.mjs';

const root = path.resolve(import.meta.dirname, '..');
const hash = value=>'0x'+createHash('sha256').update(value).digest('hex');

/** Complete HTML with no hosted script/style dependencies, suitable for AppChunk storage. */
export async function buildWorkbench({output=path.join(root,'onchain-app/module-workbench')}={}) {
  const result=await build({absWorkingDir:root,entryPoints:['web/modules/standalone.mjs'],bundle:true,
    format:'iife',platform:'browser',target:'es2022',write:false,metafile:true,minify:true,legalComments:'inline'});
  const script=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
  const css=fs.readFileSync(path.join(root,'web/modules/workbench.css'),'utf8');
  const source=fs.readFileSync(path.join(root,'web/modules/index.html'),'utf8');
  let html=source.replace(/<link\b[^>]*href=["'][^"']*workbench\.css["'][^>]*>/i,()=>'<style>'+css+'</style>');
  const entry=/<script\b[^>]*src=["'][^"']*standalone\.mjs["'][^>]*>\s*<\/script>/i;
  if(!entry.test(html))throw Error('Workbench entry script is missing.');
  html=html.replace(entry,()=>'<script>'+script+'</script>');
  if(/<(?:script|link)\b[^>]*(?:src|href)=["']https?:/i.test(html))throw Error('Workbench has an external code dependency.');
  const bytes=Buffer.from(html);
  if(bytes.length>1048576)throw Error('Workbench exceeds immutable document bound.');
  const chunks=[];
  for(let i=0;i<bytes.length;i+=23000){const data=bytes.subarray(i,i+23000),file='chunks/'+String(chunks.length).padStart(3,'0')+'.bin';chunks.push({file,byteLength:data.length,sha256:hash(data)});}
  const inputs=[...Object.keys(result.metafile.inputs),'web/modules/index.html','web/modules/workbench.css','scripts/modules-build-workbench.mjs'];
  const manifest={schema:'anima.module-workbench/1',compression:'raw',byteLength:bytes.length,sha256:hash(bytes),chunks,
    inputs:Object.fromEntries([...new Set(inputs)].sort().map(name=>[name,hash(fs.readFileSync(path.join(root,name)))]))};
  if(output!==null)await atomicDirectory(output,async stage=>{
    fs.mkdirSync(path.join(stage,'chunks'),{recursive:true});
    for(let i=0;i<chunks.length;i++)fs.writeFileSync(path.join(stage,chunks[i].file),bytes.subarray(i*23000,(i+1)*23000));
    fs.writeFileSync(path.join(stage,'index.html'),bytes);fs.writeFileSync(path.join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  });
  return {html,bytes,manifest};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)) {
  if(process.argv.length>2)throw Error('Usage: node scripts/modules-build-workbench.mjs');
  const result=await buildWorkbench();console.log('Built recoverable workbench: '+result.bytes.length+' bytes across '+result.manifest.chunks.length+' chunks.');
}
