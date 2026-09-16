import {build} from 'esbuild';import {polyfillNode} from 'esbuild-plugin-polyfill-node';import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'../..');
export const options={bundle:true,platform:'browser',format:'iife',target:'es2022',loader:{'.wasm':'binary'},alias:{assert:require.resolve('assert/'),crypto:require.resolve('crypto-browserify'),'@railgun-community/poseidon-hash-wasm':path.join(import.meta.dirname,'src/poseidon-browser.mjs'),'@railgun-community/curve25519-scalarmult-wasm':path.join(import.meta.dirname,'src/curve-browser.mjs')},plugins:[polyfillNode({polyfills:{assert:false,crypto:false}})],define:{'process.env.NODE_ENV':'"production"'},minify:true,metafile:true,logLevel:'warning'};
if(process.argv[1]===import.meta.filename){
 const outfile=path.join(root,'web/privacy/railgun-worker.js');const buildResult=await build({...options,entryPoints:[path.join(import.meta.dirname,'src/worker.mjs')],outfile});
 fs.writeFileSync(path.join(import.meta.dirname,'bundle-inputs.json'),JSON.stringify(Object.keys(buildResult.metafile.inputs).sort(),null,2)+'\n');
 const bytes=fs.readFileSync(outfile),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 fs.writeFileSync(path.join(root,'web/privacy/runtime-integrity.mjs'),`// Generated; verified before creating the isolated privacy worker.\nexport const PRIVACY_RUNTIME=${JSON.stringify({sha256:hash,bytes:bytes.length,path:'web/privacy/railgun-worker.js',wallet:'10.9.0',broadcaster:'9.1.1',prover:'0.7.6'})};\n`);
 console.log(JSON.stringify({bytes:bytes.length,sha256:hash}));
}
