// Read-only recovery of the immutable workbench anchor. Recovered HTML is not executed.
import fs from 'node:fs';
import path from 'node:path';
import {getAddress,getBytes,keccak256,sha256,toUtf8Bytes} from 'ethers';
import {pinSnapshot,assertSnapshot,readCall,readRegistry,TOKEN_MODULE_ABI,RELEASE_ABI,STATE_ABI,FACTORY_ABI,ARCHIVE_ABI} from '../packages/modules/chain.mjs';

export const WORKBENCH_ABI=['function schemaVersion() view returns(uint256)','function modules() view returns(address)',
  'function archive() view returns(address)','function archiveCodeHash() view returns(bytes32)','function contentSha256() view returns(bytes32)',
  'function byteLength() view returns(uint256)','function chunkCount() view returns(uint256)','function readChunk(uint256) view returns(bytes)',
  'function services() view returns(uint256 chainId,address collection,address installations,address releases,address stateStore,address document,bytes32 documentHash)'];
const READ_METHODS=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call']);
const address=value=>{const result=getAddress(value);if(BigInt(result)===0n)throw Error('Zero discovery address');return result.toLowerCase();};
const hex=(value,limit)=>{if(typeof value!=='string'||!/^0x(?:[0-9a-fA-F]{2})*$/.test(value)||(value.length-2)/2>limit)throw Error('Malformed or oversized RPC bytes');return value;};
const quantity=value=>{if(!/^(?:[1-9][0-9]*|0x[0-9a-f]+)$/i.test(String(value))||BigInt(value)<=0n)throw Error('Expected a positive chain/token number');return BigInt(value).toString();};

/** Explicit method allowlist, bounded responses, no redirects/cookies or persisted RPC URL. */
export function readOnlyRpc(rpcUrl,{timeoutMs=30000,maxResponseBytes=4*1024*1024}={}) {
  const url=new URL(rpcUrl);
  if(url.username||url.password||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw Error('Use HTTPS or an exact loopback RPC without embedded credentials');
  let sequence=0;
  return async payload=>{
    if(!READ_METHODS.has(payload?.method)||!Array.isArray(payload.params))throw Error('Recovery permits read-only RPC methods only');
    const id=++sequence,response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method:payload.method,params:payload.params}),redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(timeoutMs)});
    if(!response.ok)throw Error('RPC HTTP '+response.status);
    if(Number(response.headers.get('content-length')||0)>maxResponseBytes)throw Error('RPC response exceeds recovery bound');
    if(!response.body)throw Error('RPC returned an empty body');
    const reader=response.body.getReader(),parts=[];let size=0;
    try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maxResponseBytes)throw Error('RPC response exceeds recovery bound');parts.push(part.value);}}
    catch(error){await reader.cancel().catch(()=>{});throw error;}
    const result=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(result.jsonrpc!=='2.0'||result.id!==id||result.error||!Object.hasOwn(result,'result'))throw Error(result.error?'RPC read failed':'Malformed JSON-RPC response');
    return result.result;
  };
}

/** The chosen anchor address is the trust root. Optional code/content pins strengthen it. */
export async function recoverWorkbench({request,chainId,workbench,tokenId,block,expectedHash,expectedCodeHash}) {
  chainId=quantity(chainId);workbench=address(workbench);if(tokenId!==undefined)tokenId=quantity(tokenId);
  if(typeof request!=='function')throw Error('A read-only RPC function is required');
  const readRequest=payload=>{if(!READ_METHODS.has(payload.method))throw Error('Non-read RPC method rejected');return request(payload);};
  const snapshot=await pinSnapshot(readRequest,chainId,block),codes={};
  const codeAt=async location=>{location=address(location);const code=hex(await readRequest({method:'eth_getCode',params:[location,snapshot.block]}),24576);if(code==='0x')throw Error('Discovery contract has no code');codes[location]=keccak256(code);return codes[location];};
  const anchorCodeHash=await codeAt(workbench);
  if(expectedCodeHash&&anchorCodeHash!==expectedCodeHash.toLowerCase())throw Error('Workbench anchor code hash mismatch');
  const read=(method,args=[],limit=256)=>readCall(readRequest,snapshot,workbench,WORKBENCH_ABI,method,args,limit);
  if((await read('schemaVersion'))[0]!==1n)throw Error('Unsupported workbench anchor schema');
  const [moduleAddress]=await read('modules'),[archiveAddress]=await read('archive'),[archiveCodeHash]=await read('archiveCodeHash');
  const [contentHash]=await read('contentSha256'),[length]=await read('byteLength'),[count]=await read('chunkCount');
  const modules=address(moduleAddress),archive=address(archiveAddress),byteLength=Number(length),chunkCount=Number(count);
  if(!Number.isSafeInteger(byteLength)||byteLength<1||byteLength>1048576||!Number.isSafeInteger(chunkCount)||chunkCount<1||chunkCount>64||byteLength<chunkCount||byteLength>chunkCount*23000)throw Error('Workbench document exceeds its recovery bounds');
  if(expectedHash&&contentHash!==expectedHash.toLowerCase())throw Error('Workbench content commitment mismatch');
  const info=await read('services',[],224);
  if(info.chainId!==BigInt(chainId)||address(info.installations)!==modules||address(info.document)!==archive||info.documentHash!==contentHash)throw Error('Workbench discovery links disagree');
  const collection=address(info.collection),releases=address(info.releases),stateStore=address(info.stateStore);
  for(const location of [modules,collection,releases,stateStore])await codeAt(location);
  const get=async(location,abi,method,args=[],limit=256)=>(await readCall(readRequest,snapshot,location,abi,method,args,limit))[0];
  if(await get(modules,TOKEN_MODULE_ABI,'serviceType')!==keccak256(toUtf8Bytes('anima.token-module-registry/1'))
    ||address(await get(modules,TOKEN_MODULE_ABI,'collection'))!==collection
    ||address(await get(modules,TOKEN_MODULE_ABI,'releases'))!==releases
    ||address(await get(modules,TOKEN_MODULE_ABI,'stateStore'))!==stateStore)throw Error('Module service links disagree with anchor');
  if(await get(releases,RELEASE_ABI,'serviceType')!==keccak256(toUtf8Bytes('anima.extension-release-registry/1'))
    ||address(await get(stateStore,STATE_ABI,'registry'))!==modules||address(await get(stateStore,STATE_ABI,'collection'))!==collection)throw Error('Release/state service binding mismatch');
  const factory=address(await get(releases,RELEASE_ABI,'archiveFactory'));await codeAt(factory);
  const schema=Number(await get(factory,FACTORY_ABI,'archiveSchema',[archive]));
  if(![1,2].includes(schema)||await get(factory,FACTORY_ABI,'archiveCodeHash',[archive])!==archiveCodeHash||await codeAt(archive)!==archiveCodeHash)throw Error('Workbench archive code/factory binding mismatch');
  if(await get(archive,ARCHIVE_ABI,'byteLength')!==length||await get(archive,ARCHIVE_ABI,'chunkCount')!==count||await get(archive,ARCHIVE_ABI,'contentSha256')!==contentHash)throw Error('Archive metadata differs from anchor');
  if(schema===2&&await get(archive,ARCHIVE_ABI,'schemaVersion')!==2n)throw Error('Archive schema differs from factory');
  const bytes=new Uint8Array(byteLength);let offset=0;
  for(let index=0;index<chunkCount;index++) {
    const part=getBytes((await read('readChunk',[index],23104))[0]);
    if(!part.length||part.length>23000||offset+part.length>byteLength)throw Error('Workbench chunk exceeds committed length');
    bytes.set(part,offset);offset+=part.length;
  }
  if(offset!==byteLength||sha256(bytes)!==contentHash)throw Error('Recovered workbench hash or length mismatch');
  const html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  let tokenContext;
  if(tokenId!==undefined) {
    tokenContext=await readRegistry({request:readRequest,registry:modules,tokenId,chainId,snapshot});
    const reverse=await get(collection,['function artifactIdOfAccount(address) view returns(uint256)'],'artifactIdOfAccount',[tokenContext.account]);
    if(reverse!==BigInt(tokenId)||tokenContext.collection!==collection||tokenContext.stateStore!==stateStore)throw Error('Native NFT/account reverse binding mismatch');
  }
  await assertSnapshot(readRequest,snapshot);
  return {bytes,html,record:{schema:'anima.module-workbench-recovery/1',chainId,workbench,anchorCodeHash,sha256:contentHash,byteLength,chunkCount,archiveSchema:schema,
    services:{collection,installations:modules,releases,stateStore,archiveFactory:factory,document:archive},codeHashes:codes,snapshot,...(tokenContext?{tokenContext}:{}),
    scope:'Verified raw workbench document and anchored service links. No code executed or account permission requested.'}};
}

export function saveWorkbenchRecovery(result,output) {
  output=path.resolve(output);
  if(fs.existsSync(output))throw Error('Output already exists; choose a fresh directory');
  if(sha256(result.bytes)!==result.record.sha256||result.bytes.length!==result.record.byteLength)throw Error('Recovery bytes changed before saving');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.mkdirSync(output); // Exclusive directory creation also rejects a concurrent existing output.
  fs.writeFileSync(path.join(output,'index.html'),result.bytes,{flag:'wx'});
  fs.writeFileSync(path.join(output,'recovery.json'),JSON.stringify(result.record,null,2)+'\n',{flag:'wx'});
  return output;
}

async function main() {
  const args=process.argv.slice(2),options={};
  if(args.length===1&&args[0]==='--help'){console.log('Recover a complete module workbench without a signer:\n  node scripts/modules-recover-workbench.mjs --rpc HTTPS_RPC --chain CHAIN_ID --workbench ADDRESS --output NEW_DIRECTORY [--token-id ID] [--block NUMBER] [--expect-sha256 HASH] [--expect-code-hash HASH]\nReads only. Verifies one pinned block, service links, archive code and document bytes. Existing outputs are never overwritten; HTML is saved without executing it.');return;}
  for(let i=0;i<args.length;i+=2){if(!['--rpc','--chain','--workbench','--output','--token-id','--block','--expect-sha256','--expect-code-hash'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||options[args[i]])throw Error('Invalid arguments; use --help');options[args[i]]=args[i+1];}
  for(const key of ['--rpc','--chain','--workbench','--output'])if(!options[key])throw Error('RPC, chain, workbench address and fresh output directory are required');
  if(fs.existsSync(path.resolve(options['--output'])))throw Error('Output already exists; choose a fresh directory');
  const result=await recoverWorkbench({request:readOnlyRpc(options['--rpc']),chainId:options['--chain'],workbench:options['--workbench'],tokenId:options['--token-id'],block:options['--block'],expectedHash:options['--expect-sha256'],expectedCodeHash:options['--expect-code-hash']});
  const output=saveWorkbenchRecovery(result,options['--output']);
  console.log(JSON.stringify({output,chainId:result.record.chainId,workbench:result.record.workbench,sha256:result.record.sha256,byteLength:result.record.byteLength,snapshot:result.record.snapshot},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))main().catch(error=>{console.error(error.message);process.exitCode=1;});
