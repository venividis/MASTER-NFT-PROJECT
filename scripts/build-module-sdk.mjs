import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build,version as esbuildVersion} from 'esbuild';
import {atomicDirectory} from './lib/runtime-graph.mjs';

const root=path.resolve(import.meta.dirname,'..');
const hash=bytes=>'0x'+createHash('sha256').update(bytes).digest('hex');

/** Self-contained browser ESM distribution; no source-layout imports or runtime dependencies. */
export async function buildModuleSDK({output=path.join(root,'packages/modules/dist')}={}) {
  const result=await build({absWorkingDir:root,entryPoints:{index:'packages/modules/sdk.mjs',core:'packages/modules/core.mjs'},
    bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,metafile:true,minify:true,
    outdir:'module-sdk-build',outExtension:{'.js':'.mjs'},legalComments:'inline'});
  const files=Object.fromEntries(result.outputFiles.map(file=>[path.basename(file.path),Buffer.from(file.contents)]));
  if(Object.keys(files).sort().join(',')!=='core.mjs,index.mjs'||Object.values(result.metafile.outputs).some(file=>file.imports.length))throw Error('Portable module SDK must have no external runtime imports');
  const inputs=[...Object.keys(result.metafile.inputs),'scripts/build-module-sdk.mjs','packages/modules/package.json'];
  const manifest={schema:'anima.module-sdk-build/1',esbuild:esbuildVersion,
    inputs:Object.fromEntries([...new Set(inputs)].sort().map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])),
    files:Object.fromEntries(Object.entries(files).map(([file,bytes])=>[file,{byteLength:bytes.length,sha256:hash(bytes)}]))};
  files['build-manifest.json']=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
  if(output!==null)await atomicDirectory(output,async stage=>{for(const [file,bytes] of Object.entries(files))fs.writeFileSync(path.join(stage,file),bytes);});
  return {files,manifest};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)) {
  if(process.argv.length>2)throw Error('Usage: node scripts/build-module-sdk.mjs');
  const result=await buildModuleSDK();console.log('Built portable @anima/modules: '+result.manifest.files['index.mjs'].byteLength+' bytes; no runtime dependencies.');
}
