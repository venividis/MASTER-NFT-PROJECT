#!/usr/bin/env node
// Both phases produce unsigned JSON. No signer, key, accounts request or broadcast.
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import solc from 'solc';
import {keccak256,toUtf8Bytes} from 'ethers';
import {canonicalJSON,parseManifest,manifestHash,verifyArchive,sha256,planChunks,LIMITS} from '../packages/modules/core.mjs';
import {pinSnapshot,assertSnapshot,readCall,FACTORY_ABI} from '../packages/modules/chain.mjs';
import {planArchiveDeployment,validateDeploymentPlan,preparePublishRecipe} from '../packages/modules/deployment.mjs';

const HELP=`Prepare unsigned calls for an already packaged ANIMA module:
  node scripts/modules-plan-package.mjs --package DIR --rpc HTTPS_RPC --chain ID --factory ADDRESS --publisher ADDRESS --output archive-plan.json [--reuse chunks.json]
  node scripts/modules-plan-package.mjs --package DIR --rpc HTTPS_RPC --chain ID --registry ADDRESS --archive ADDRESS --schema 1|2 --output publish-plan.json

Archive phase reads the pending publisher nonce and factory creation nonce,
verifies reused chunk bytes, and predicts addresses for exact ordered calls.
--reuse is a JSON object mapping lowercase payload SHA-256 hashes to deployed
AppChunk addresses. It never grants authority to an address.

Publication phase runs after the archive is deployed. It verifies its bytes and
trusted factory registration, then prepares the canonical publish call. These
commands never sign or submit transactions and never overwrite an output file.
RPC must use HTTPS or HTTP loopback. RPC URLs are excluded from output.
`;
const ROOT=path.resolve(import.meta.dirname,'..');
const READ_METHODS=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getTransactionCount','eth_call']);
const address=v=>{if(typeof v!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(v)||/^0x0+$/.test(v))throw Error('Expected a nonzero Ethereum address');return v.toLowerCase();};
const uint=v=>{if(typeof v!=='string'||!/^(?:0|[1-9][0-9]*|0x[0-9a-fA-F]+)$/.test(v)||BigInt(v)>=1n<<256n)throw Error('Expected an unsigned chain ID');return BigInt(v).toString();};
async function fresh(file){try{await fs.lstat(file);}catch(e){if(e.code==='ENOENT')return;throw e;}throw Error('Output already exists; choose a fresh file.');}
async function regular(file,maxBytes){const absolute=path.resolve(file),stat=await fs.lstat(absolute);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxBytes||await fs.realpath(absolute)!==absolute)throw Error('Expected a bounded regular file without symlinks: '+absolute);return fs.readFile(absolute);}
function readonlyRPC(value){
 const url=new URL(value);if(url.username||url.password||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))throw Error('Use HTTPS or loopback HTTP without userinfo or fragments.');let id=0;
 return async({method,params=[]})=>{if(!READ_METHODS.has(method)||!Array.isArray(params))throw Error('RPC method is not read-only');const expected=++id,response=await fetch(url,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:expected,method,params}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('RPC HTTP '+response.status);if(!response.body)throw Error('RPC response is empty');
  const limit=3*1024*1024,reader=response.body.getReader(),chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('RPC response exceeds 3 MiB limit');}chunks.push(value);}}finally{reader.releaseLock();}
  const body=JSON.parse(Buffer.concat(chunks,size).toString('utf8'));if(body.jsonrpc!=='2.0'||body.id!==expected||body.error||!Object.hasOwn(body,'result'))throw Error('RPC rejected or mismatched the read request');return body.result;};
}
async function packageInput(directory){
 const base=path.resolve(directory);if(await fs.realpath(base)!==base)throw Error('Package directory must not contain symlinks');
 const manifest=parseManifest(await regular(path.join(base,'manifest.json'),LIMITS.manifestBytes)),archive=await regular(path.join(base,'archive.bin'),LIMITS.storedBytes);await verifyArchive(manifest,archive);
 const receipt=JSON.parse((await regular(path.join(base,'receipt.json'),1048576)).toString('utf8')),chunks=planChunks(archive);
 if(receipt.schema!=='anima.module-package-receipt/1'||receipt.manifestHash!==manifestHash(manifest)||receipt.contentId!==manifestHash(manifest)||receipt.archiveSha256!==sha256(archive)||receipt.archiveBytes!==archive.length||receipt.entrypoint!==manifest.entrypoint||receipt.chunkBytes!==23000||receipt.chunkCount!==chunks.references.length||receipt.uniqueChunkCount!==chunks.chunks.length||!Array.isArray(receipt.chunks)||receipt.chunks.length!==chunks.references.length)throw Error('Package receipt differs from verified archive');
 for(let n=0;n<receipt.chunks.length;n++){const c=receipt.chunks[n],hash=chunks.references[n],expected=chunks.chunks.find(c=>c.hash===hash);if(c.index!==n||c.sha256!==hash||c.byteLength!==expected.bytes||c.file!=='chunks/'+hash.slice(2)+'.bin')throw Error('Package chunk receipt differs');const bytes=await regular(path.join(base,c.file),23000);if(bytes.length!==expected.bytes||sha256(bytes)!==hash)throw Error('Package chunk file differs from committed archive');}
 return {manifest,archive,manifestHash:manifestHash(manifest)};
}
async function compileChunk(){
 const dependency=JSON.parse(await fs.readFile(path.join(ROOT,'package.json'),'utf8')).dependencies.solc;if(!solc.version().startsWith(dependency+'+'))throw Error('Local solc version differs from the pinned project dependency');
 const sourceName='contracts/src/protocol/OnchainApp.sol',source=await regular(path.join(ROOT,sourceName),1048576),settings={optimizer:{enabled:true,runs:1000},viaIR:true,evmVersion:'shanghai',metadata:{bytecodeHash:'ipfs',appendCBOR:true},outputSelection:{'*':{'AppChunk':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}};
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{[sourceName]:{content:source.toString('utf8')}},settings}))),errors=(output.errors??[]).filter(e=>e.severity==='error');if(errors.length)throw Error('Local AppChunk compilation failed: '+errors.map(e=>e.formattedMessage).join('\n'));
 const result=output.contracts[sourceName].AppChunk;if(result.evm.bytecode.object.length/2>49152||result.evm.deployedBytecode.object.length/2>24576)throw Error('AppChunk compiler output exceeds EVM code bounds');
 return {artifact:{abi:result.abi,bytecode:'0x'+result.evm.bytecode.object},provenance:{source:sourceName,sourceHash:sha256(source),compiler:solc.version(),settings}};
}
async function main(){
 const {values:v}=parseArgs({options:{package:{type:'string'},rpc:{type:'string'},chain:{type:'string'},factory:{type:'string'},publisher:{type:'string'},registry:{type:'string'},archive:{type:'string'},schema:{type:'string'},reuse:{type:'string'},output:{type:'string'},help:{type:'boolean',short:'h'}},allowPositionals:false});if(v.help){process.stdout.write(HELP);return;}
 for(const key of ['package','rpc','chain','output'])if(!v[key])throw Error('Missing --'+key+'; use --help');
 const publish=!!v.registry;if(publish?(!!v.factory||!!v.publisher||!!v.reuse||!v.archive||!['1','2'].includes(v.schema)):(!v.factory||!v.publisher||!!v.archive||!!v.schema))throw Error('Choose exactly one complete archive or publication phase; use --help');
 const output=path.resolve(v.output);await fresh(output);const chainId=uint(v.chain);if(chainId==='0')throw Error('Chain ID must be positive');const packaged=await packageInput(v.package),request=readonlyRPC(v.rpc);let result;
 if(publish){
  const recipe=await preparePublishRecipe({request,chainId,registry:address(v.registry),manifest:packaged.manifest,archiveAddress:address(v.archive),archiveSchema:Number(v.schema)});
  // Simulate the exact publication for version/dependency/registry conflicts; still a read.
  const returned=await request({method:'eth_call',params:[{from:recipe.from,to:recipe.to,data:recipe.data,gas:'0x1c9c380'},recipe.snapshot.block]});if(returned.toLowerCase()!==recipe.releaseId)throw Error('Publication simulation returned a different release ID');await assertSnapshot(request,recipe.snapshot);
  result={...recipe,phase:'publish',packageManifestHash:packaged.manifestHash};
 }else{
  const publisher=address(v.publisher),factory=address(v.factory);if(packaged.manifest.publisher!==publisher)throw Error('Publisher differs from canonical package manifest');
  const snapshot=await pinSnapshot(request,chainId),[service]=await readCall(request,snapshot,factory,FACTORY_ABI,'serviceType',[],32);if(service!==keccak256(toUtf8Bytes('anima.module-archive-factory/1')))throw Error('Unsupported archive factory');
  const startNonce=Number(BigInt(await request({method:'eth_getTransactionCount',params:[publisher,'pending']}))),factoryNonce=Number(BigInt(await request({method:'eth_getTransactionCount',params:[factory,snapshot.block]})));let existingChunks={};
  if(v.reuse){existingChunks=JSON.parse((await regular(v.reuse,1048576)).toString('utf8'));if(!existingChunks||typeof existingChunks!=='object'||Array.isArray(existingChunks)||Object.keys(existingChunks).length>8192||Object.keys(existingChunks).some(k=>!/^0x[0-9a-f]{64}$/.test(k)))throw Error('Invalid reused-chunk mapping');for(const value of Object.values(existingChunks))address(value);}
  const {artifact,provenance}=await compileChunk(),plan=await planArchiveDeployment({archive:packaged.archive,publisher,chainId,startNonce,factory,factoryNonce,appChunkArtifact:artifact,existingChunks});
  result={...plan,phase:'archive',packageManifestHash:packaged.manifestHash,compilerProvenance:provenance,factoryCodeHash:keccak256(await request({method:'eth_getCode',params:[factory,snapshot.block]})),snapshot};await validateDeploymentPlan(request,result);await assertSnapshot(request,snapshot);
 }
 const parent=path.dirname(output);await fs.mkdir(parent,{recursive:true});if(await fs.realpath(parent)!==parent)throw Error('Output parent must not contain symlinks');await fs.writeFile(output,canonicalJSON(result)+'\n',{flag:'wx'});
 console.log(canonicalJSON({prepared:true,phase:result.phase,chainId,output,packageManifestHash:packaged.manifestHash,...(publish?{releaseId:result.releaseId}:{archive:result.archiveAddress,stepCount:result.steps.length,deployBytes:result.deployBytes})}));
}
main().catch(error=>{console.error('Module plan failed: '+error.message);process.exitCode=1;});
