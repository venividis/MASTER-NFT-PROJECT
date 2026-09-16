/** Read-only chain recovery and unsigned transaction descriptions. */
import {Interface,AbiCoder,keccak256,toUtf8Bytes,getBytes,hexlify} from '../../web/vendor/ethers.min.js';
import {sha256,hashValue,canonicalManifest,manifestHash,parseManifest,validateManifest,verifyArchive,resolveReleaseGraph,LIMITS,ZERO_HASH} from './core.mjs';

export const ARCHIVE_TUPLE='tuple(address archive,uint8 schema,bytes32 storedHash,uint32 storedBytes,bytes32 expandedHash,uint32 expandedBytes,bytes32 codeHash)';
export const RELEASE_INPUT_TUPLE=`tuple(bytes32 moduleId,uint64 version,${ARCHIVE_TUPLE} payload,bytes32 runtime,bytes32 hostAPI,bytes32 stateSchema,bytes32[] capabilities,bytes32[] dependencies)`;
export const ARCHIVE_ABI=['function chunkCount() view returns(uint256)','function byteLength() view returns(uint256)','function contentSha256() view returns(bytes32)','function readChunk(uint256) view returns(bytes)','function schemaVersion() view returns(uint256)'];
export const ACCOUNT_ABI=['function execute(address target,uint256 value,bytes data) payable returns(bytes)','function currentOwner() view returns(address)','function sessionEpoch() view returns(uint64)','function mode() view returns(uint8)','function actionNonce() view returns(uint256)'];
export const COLLECTION_ABI=['function ownerOf(uint256) view returns(address)','function accountOf(uint256) view returns(address)'];
export const RELEASE_TUPLE=`tuple(address publisher,bytes32 moduleKey,bytes32 manifestHash,uint64 publishedAt,${RELEASE_INPUT_TUPLE} input)`;
export const INSTALLATION_TUPLE='tuple(bytes32 releaseId,bytes32 stateHead,bool enabled,uint64 epoch)';
export const HISTORY_TUPLE='tuple(bytes32 root,bytes32 previousRoot,bytes32 moduleKey,bytes32 releaseId,bytes32 stateHead,uint64 epoch,uint64 at,uint8 operation)';
export const STATE_TUPLE=`tuple(bytes32 namespace,bytes32 schema,bytes32 parent,bytes32 dataHash,${ARCHIVE_TUPLE} archive,uint64 epoch,uint64 createdAt,uint256 index)`;
export const RELEASE_ABI=[`function publish(${RELEASE_INPUT_TUPLE} input,bytes canonicalManifest) returns(bytes32)`,`function release(bytes32) view returns(${RELEASE_TUPLE})`,'function manifest(bytes32) view returns(bytes)','function archiveFactory() view returns(address)','function serviceType() view returns(bytes32)','function exists(bytes32) view returns(bool)','function releaseAtVersion(bytes32,uint64) view returns(bytes32)','function moduleKey(address,bytes32) pure returns(bytes32)',`function hashRelease(address,${RELEASE_INPUT_TUPLE},bytes32) pure returns(bytes32)`,'function moduleReleaseCount(bytes32) view returns(uint256)','function releasesOf(bytes32,uint256,uint256) view returns(bytes32[] ids,uint256 next)','function releaseCount() view returns(uint256)','function catalog(uint256,uint256) view returns(bytes32[] ids,uint256 next)'];
export const TOKEN_MODULE_ABI=['function collection() view returns(address)','function releases() view returns(address)','function stateStore() view returns(address)','function serviceType() view returns(bytes32)','function rootOf(uint256) view returns(bytes32)','function stateModuleCount(uint256) view returns(uint256)','function stateModulesOf(uint256,uint256,uint256) view returns(bytes32[] keys,uint256 next)','function moduleCount(uint256) view returns(uint256)','function historyCount(uint256) view returns(uint256)',`function installation(uint256,bytes32) view returns(${INSTALLATION_TUPLE})`,'function modulesOf(uint256,uint256,uint256) view returns(bytes32[] keys,uint256 next)',`function historyOf(uint256,uint256,uint256) view returns(${HISTORY_TUPLE}[] entries,uint256 next)`,'function activate(uint256 tokenId,bytes32 releaseId,bytes32 expectedRoot,uint64 expectedEpoch,bytes32 expectedStateHead,bytes32 nextStateHead)','function disable(uint256 tokenId,bytes32 moduleKey,bytes32 expectedRoot,uint64 expectedEpoch)',`function stageState(uint256 tokenId,bytes32 moduleKey,bytes32 expectedRoot,uint64 expectedEpoch,bytes32 schema,bytes data,${ARCHIVE_TUPLE} archive) returns(bytes32)`,`function writeState(uint256 tokenId,bytes32 moduleKey,bytes32 expectedRoot,uint64 expectedEpoch,bytes data,${ARCHIVE_TUPLE} archive) returns(bytes32)`];
export const STATE_ABI=[`function record(bytes32) view returns(${STATE_TUPLE})`,'function dataOf(bytes32) view returns(bytes)','function collection() view returns(address)','function registry() view returns(address)','function namespaceOf(uint256,bytes32) view returns(bytes32)','function countOf(uint256,bytes32) view returns(uint256)','function historyOf(uint256,bytes32,uint256,uint256) view returns(bytes32[] ids,uint256 next)'];
export const FACTORY_ABI=['function serviceType() view returns(bytes32)',`function validateArchive(${ARCHIVE_TUPLE}) view`,'function createArchive(address[] chunks,bytes32 expectedSha) returns(address)','function createDirectory(address[] leaves,bytes32 expectedSha) returns(address)','function archiveSchema(address) view returns(uint8)','function archiveCodeHash(address) view returns(bytes32)'];
export const EMPTY_ARCHIVE=Object.freeze({archive:'0x'+'0'.repeat(40),schema:0,storedHash:ZERO_HASH,storedBytes:0,expandedHash:ZERO_HASH,expandedBytes:0,codeHash:ZERO_HASH});
const coder=AbiCoder.defaultAbiCoder();
const address=v=>{if(typeof v!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(v)||/^0x0+$/.test(v))throw Error('Invalid chain address');return v.toLowerCase();};
const quantity=v=>{try{const n=BigInt(v);if(n<0n)throw Error();return '0x'+n.toString(16);}catch{throw Error('Invalid nonnegative chain quantity');}};
const ifaceCache=new Map(),iface=abi=>{const k=abi.join(';');if(!ifaceCache.has(k))ifaceCache.set(k,new Interface(abi));return ifaceCache.get(k);};
const checkedHex=(value,maxBytes)=>{if(typeof value!=='string'||!/^0x(?:[0-9a-fA-F]{2})*$/.test(value)||(value.length-2)/2>maxBytes)throw Error('Malformed or oversized RPC response');return value;};
export async function pinSnapshot(request,chainId,block){
 const chain=quantity(chainId),actual=await request({method:'eth_chainId',params:[]});if(quantity(actual)!==chain)throw Error('RPC chain differs from requested chain');
 const b=await request({method:'eth_getBlockByNumber',params:[block===undefined?'latest':quantity(block),false]});
 if(!b||!/^0x[0-9a-fA-F]{64}$/.test(b.hash)||b.number===undefined)throw Error('Missing canonical snapshot block');
 if(block!==undefined&&quantity(b.number)!==quantity(block))throw Error('RPC returned a different requested block');
 return Object.freeze({chainId:BigInt(chain).toString(),block:quantity(b.number),blockHash:b.hash.toLowerCase()});
}
export async function assertSnapshot(request,snapshot){const b=await request({method:'eth_getBlockByNumber',params:[snapshot.block,false]});if(!b||quantity(b.number)!==snapshot.block||b.hash?.toLowerCase()!==snapshot.blockHash)throw Error('Chain snapshot changed during recovery');if(quantity(await request({method:'eth_chainId',params:[]}))!==quantity(snapshot.chainId))throw Error('RPC chain changed during recovery');}
export async function readCall(request,snapshot,to,abi,method,args=[],maxResponseBytes=1048576){
 const i=iface(abi),raw=await request({method:'eth_call',params:[{to:address(to),data:i.encodeFunctionData(method,args),gas:'0x989680'},snapshot.block]});
 return i.decodeFunctionResult(method,checkedHex(raw,maxResponseBytes));
}
export function descriptorFromManifest(manifest,archive,schema,codeHash){validateManifest(manifest);if(![1,2].includes(Number(schema)))throw Error('Unsupported archive schema');return {archive:address(archive),schema:Number(schema),...manifest.archive,codeHash:hashValue(codeHash)};}
export function releaseInput(manifest,descriptor){
 validateManifest(manifest);const a=manifest.archive;
 if(descriptor.storedHash!==a.storedHash||Number(descriptor.storedBytes)!==a.storedBytes||descriptor.expandedHash!==a.expandedHash||Number(descriptor.expandedBytes)!==a.expandedBytes)throw Error('Archive descriptor differs from release manifest');
 return {moduleId:sha256(toUtf8Bytes(manifest.name)),version:manifest.version,payload:{archive:address(descriptor.archive),schema:Number(descriptor.schema),storedHash:a.storedHash,storedBytes:a.storedBytes,expandedHash:a.expandedHash,expandedBytes:a.expandedBytes,codeHash:hashValue(descriptor.codeHash)},runtime:sha256(toUtf8Bytes(manifest.format)),hostAPI:sha256(toUtf8Bytes(manifest.hostAPI)),stateSchema:manifest.stateSchema,capabilities:manifest.capabilities.map(c=>sha256(toUtf8Bytes(c))).sort(),dependencies:[...manifest.dependencies]};
}
export function releaseIdFor(publisher,input,manifest){return keccak256(coder.encode(['bytes32','address',RELEASE_INPUT_TUPLE,'bytes32'],[keccak256(toUtf8Bytes('anima.extension-release/1')),address(publisher),input,manifestHash(manifest)]));}
export function moduleKeyFor(publisher,moduleId){return keccak256(coder.encode(['address','bytes32'],[address(publisher),hashValue(moduleId)]));}
export async function recoverArchiveBytes({request,snapshot,descriptor}){
 const {archive,schema,storedBytes,storedHash,codeHash}=descriptor,countLimit=Number(schema)===1?64:Number(schema)===2?512:0;
 if(!countLimit||!Number.isSafeInteger(Number(storedBytes))||Number(storedBytes)<1||Number(storedBytes)>LIMITS.storedBytes)throw Error('Invalid archive descriptor');
 const code=checkedHex(await request({method:'eth_getCode',params:[address(archive),snapshot.block]}),24576);if(code==='0x'||keccak256(code)!==hashValue(codeHash))throw Error('Archive code hash mismatch');
 const [countResult]=await readCall(request,snapshot,archive,ARCHIVE_ABI,'chunkCount',[],32),count=Number(countResult);
 if(!Number.isSafeInteger(count)||count<1||count>countLimit||Number(storedBytes)<count||Number(storedBytes)>count*23000)throw Error('Invalid archive chunk count');
 const [length]=await readCall(request,snapshot,archive,ARCHIVE_ABI,'byteLength',[],32),[hash]=await readCall(request,snapshot,archive,ARCHIVE_ABI,'contentSha256',[],32);
 if(Number(length)!==Number(storedBytes)||hash!==storedHash)throw Error('Archive metadata differs from release');
 if(Number(schema)===2&&Number((await readCall(request,snapshot,archive,ARCHIVE_ABI,'schemaVersion',[],32))[0])!==2)throw Error('Archive schema mismatch');
 const bytes=new Uint8Array(Number(storedBytes));let offset=0;
 for(let n=0;n<count;n++){const [raw]=await readCall(request,snapshot,archive,ARCHIVE_ABI,'readChunk',[n],23104),part=getBytes(raw);if(!part.length||part.length>23000||offset+part.length>bytes.length)throw Error('Archive chunk exceeds committed size');bytes.set(part,offset);offset+=part.length;}
 if(offset!==bytes.length||sha256(bytes)!==storedHash)throw Error('Recovered archive hash or length mismatch');return bytes;
}
export function unsignedCall({chainId,from,to,abi,method,args=[],value=0,description,preconditions={}}){return {schema:'anima.unsigned-call/1',chainId:BigInt(quantity(chainId)).toString(),from:address(from),to:address(to),value:BigInt(quantity(value)).toString(),data:iface(abi).encodeFunctionData(method,args),description:description??method,preconditions};}
export function accountCall({chainId,owner,account,target,data,description,preconditions={}}){checkedHex(data,2*1024*1024);return unsignedCall({chainId,from:owner,to:account,abi:ACCOUNT_ABI,method:'execute',args:[address(target),0,data],description,preconditions});}

const archiveObject=a=>({archive:a.archive.toLowerCase(),schema:Number(a.schema),storedHash:a.storedHash,storedBytes:Number(a.storedBytes),expandedHash:a.expandedHash,expandedBytes:Number(a.expandedBytes),codeHash:a.codeHash});
export function validateReleaseRecord(record,expectedId){
 const m=record.manifest;validateManifest(m);if(address(record.publisher)!==m.publisher||manifestHash(m)!==record.manifestHash)throw Error('Release publisher or manifest binding mismatch');
 const expected=releaseInput(m,archiveObject(record.input.payload));
 if(coder.encode([RELEASE_INPUT_TUPLE],[expected])!==coder.encode([RELEASE_INPUT_TUPLE],[record.input]))throw Error('Release ABI differs from canonical manifest');
 if(moduleKeyFor(record.publisher,record.input.moduleId)!==record.moduleKey)throw Error('Release module namespace mismatch');
 const id=releaseIdFor(record.publisher,record.input,m);if(expectedId&&id!==hashValue(expectedId))throw Error('Onchain release hash mismatch');return id;
}
export async function readRelease({request,registry,releaseId,chainId,snapshot,block}){
 snapshot??=await pinSnapshot(request,chainId,block);if(quantity(snapshot.chainId)!==quantity(chainId))throw Error('Snapshot chain differs from requested chain');hashValue(releaseId);
 const [raw]=await readCall(request,snapshot,registry,RELEASE_ABI,'release',[releaseId],8192),[manifestBytes]=await readCall(request,snapshot,registry,RELEASE_ABI,'manifest',[releaseId],LIMITS.manifestBytes+96);
 const manifest=parseManifest(getBytes(manifestBytes),raw.manifestHash),record={releaseId,publisher:raw.publisher.toLowerCase(),moduleKey:raw.moduleKey,manifestHash:raw.manifestHash,publishedAt:raw.publishedAt.toString(),input:{moduleId:raw.input.moduleId,version:raw.input.version.toString(),payload:archiveObject(raw.input.payload),runtime:raw.input.runtime,hostAPI:raw.input.hostAPI,stateSchema:raw.input.stateSchema,capabilities:[...raw.input.capabilities],dependencies:[...raw.input.dependencies]},manifest,snapshot};
 validateReleaseRecord(record,releaseId);return record;
}
export async function recoverRelease({request,registry,releaseId,chainId,block,snapshot,cache,maxExpandedBytes=64*1024*1024}){
 snapshot??=await pinSnapshot(request,chainId,block);if(quantity(snapshot.chainId)!==quantity(chainId))throw Error('Snapshot chain differs from requested chain');const records=new Map();
 const order=await resolveReleaseGraph([releaseId],async id=>{const record=await readRelease({request,registry,releaseId:id,chainId,snapshot});records.set(id,record);return record;},{identityFor:r=>validateReleaseRecord(r,r.releaseId)});
 if(order.reduce((n,m)=>n+m.archive.expandedBytes,0)>maxExpandedBytes)throw Error('Dependency closure exceeds expanded byte budget');
 const recovered=[];
 for(const m of order){const record=[...records.values()].find(r=>r.manifest===m),descriptor=archiveObject(record.input.payload);let bytes=cache?.get?.(descriptor.storedHash);
  if(bytes){if(bytes.length!==descriptor.storedBytes||sha256(bytes)!==descriptor.storedHash)throw Error('Cached archive digest mismatch');bytes=bytes.slice();}
  else {bytes=await recoverArchiveBytes({request,snapshot,descriptor});cache?.set?.(descriptor.storedHash,bytes.slice());}
  recovered.push({...await verifyArchive(m,bytes),releaseId:record.releaseId,moduleKey:record.moduleKey,input:record.input,archive:bytes,snapshot});
 }
 await assertSnapshot(request,snapshot);const root=recovered.find(r=>r.releaseId===releaseId);return {...root,dependencies:recovered.filter(r=>r!==root)};
}
export async function readRegistry({request,registry,tokenId,chainId,block,snapshot,cursor=0,historyCursor=0,limit=64}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>64||!Number.isSafeInteger(cursor)||cursor<0||!Number.isSafeInteger(historyCursor)||historyCursor<0)throw Error('Invalid catalog page');
 snapshot??=await pinSnapshot(request,chainId,block);if(quantity(snapshot.chainId)!==quantity(chainId))throw Error('Snapshot chain differs from requested chain');const read=(method,args=[])=>readCall(request,snapshot,registry,TOKEN_MODULE_ABI,method,args);
 const [service]=await read('serviceType');if(service!==keccak256(toUtf8Bytes('anima.token-module-registry/1')))throw Error('Unsupported installation registry');
 const [collection]=await read('collection'),[releases]=await read('releases'),[stateStore]=await read('stateStore'),[root]=await read('rootOf',[tokenId]);
 const [account]=await readCall(request,snapshot,collection,COLLECTION_ABI,'accountOf',[tokenId]),[owner]=await readCall(request,snapshot,collection,COLLECTION_ABI,'ownerOf',[tokenId]);
 const [currentOwner]=await readCall(request,snapshot,account,ACCOUNT_ABI,'currentOwner'),[epoch]=await readCall(request,snapshot,account,ACCOUNT_ABI,'sessionEpoch'),[mode]=await readCall(request,snapshot,account,ACCOUNT_ABI,'mode'),[actionNonce]=await readCall(request,snapshot,account,ACCOUNT_ABI,'actionNonce');
 if(owner.toLowerCase()!==currentOwner.toLowerCase())throw Error('Account controller differs from NFT owner');
 const [keys,next]=await read('modulesOf',[tokenId,cursor,limit]),[history,historyNext]=await read('historyOf',[tokenId,historyCursor,limit]),[moduleCount]=await read('moduleCount',[tokenId]),[historyCount]=await read('historyCount',[tokenId]);
 if(keys.length>limit||history.length>limit||next!==BigInt(cursor+keys.length)||historyNext!==BigInt(historyCursor+history.length))throw Error('Invalid catalog page response');
 const modules=[];for(const key of keys){const [i]=await read('installation',[tokenId,key]);modules.push({moduleKey:key,releaseId:i.releaseId,stateHead:i.stateHead,enabled:i.enabled,epoch:i.epoch.toString()});}
 await assertSnapshot(request,snapshot);return {chainId:snapshot.chainId,registry:address(registry),collection:address(collection),tokenId:BigInt(tokenId).toString(),releases:address(releases),stateStore:address(stateStore),account:address(account),owner:address(owner),currentOwner:address(owner),epoch:epoch.toString(),mode:Number(mode),actionNonce:actionNonce.toString(),root,modules,history:history.map(h=>({root:h.root,previousRoot:h.previousRoot,moduleKey:h.moduleKey,releaseId:h.releaseId,stateHead:h.stateHead,epoch:h.epoch.toString(),at:h.at.toString(),operation:Number(h.operation)})),next:next.toString(),historyNext:historyNext.toString(),moduleCount:moduleCount.toString(),historyCount:historyCount.toString(),snapshot};
}
export async function recoverState({request,stateStore,stateId,chainId,block,snapshot,collection,tokenId,moduleKey}){
 snapshot??=await pinSnapshot(request,chainId,block);if(quantity(snapshot.chainId)!==quantity(chainId))throw Error('Snapshot chain differs from requested chain');hashValue(stateId);if(stateId===ZERO_HASH)return {stateId,bytes:new Uint8Array(),record:null,snapshot};
 const [raw]=await readCall(request,snapshot,stateStore,STATE_ABI,'record',[stateId],2048),record={namespace:raw.namespace,schema:raw.schema,parent:raw.parent,dataHash:raw.dataHash,archive:archiveObject(raw.archive),epoch:raw.epoch.toString(),createdAt:raw.createdAt.toString(),index:raw.index.toString()};
 if(collection!==undefined){if(tokenId===undefined||!moduleKey)throw Error('Complete state namespace context required');const namespace=keccak256(coder.encode(['address','uint256','bytes32'],[address(collection),tokenId,hashValue(moduleKey)]));if(namespace!==record.namespace)throw Error('State belongs to a different module or NFT');}
 const expected=keccak256(coder.encode(['bytes32','uint256','address','bytes32','uint256','bytes32','bytes32','uint64','bytes32',ARCHIVE_TUPLE],[keccak256(toUtf8Bytes('anima.module-state/1')),snapshot.chainId,address(stateStore),record.namespace,record.index,record.schema,record.parent,record.epoch,record.dataHash,record.archive]));if(expected!==stateId)throw Error('State record commitment mismatch');
 let bytes;if(record.archive.archive===EMPTY_ARCHIVE.archive){const [data]=await readCall(request,snapshot,stateStore,STATE_ABI,'dataOf',[stateId],32864);bytes=getBytes(data);if(bytes.length>32768||sha256(bytes)!==record.dataHash)throw Error('State bytes differ from commitment');}
 else {const stored=await recoverArchiveBytes({request,snapshot,descriptor:record.archive});bytes=await expandState(stored,record.archive);if(sha256(bytes)!==record.dataHash)throw Error('Expanded state digest mismatch');}
 await assertSnapshot(request,snapshot);return {stateId,record,bytes,snapshot};
}
async function expandState(stored,a){
 if(a.expandedBytes>LIMITS.expandedBytes)throw Error('State exceeds expanded budget');if(a.expandedHash===a.storedHash&&a.expandedBytes===a.storedBytes)return stored;
 const reader=new Blob([stored]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>a.expandedBytes)throw Error('State decompression budget exceeded');parts.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
 if(size!==a.expandedBytes)throw Error('Expanded state length mismatch');const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return bytes;
}
const contextChecks=c=>({collection:c.collection,tokenId:String(c.tokenId),account:c.account,owner:c.owner,epoch:String(c.epoch),root:c.root,actionNonce:String(c.actionNonce),snapshot:c.snapshot});
function tokenRecipe(context,method,args,description){if(context.mode!==0)throw Error('This reviewed owner-call recipe requires Bound mode');return accountCall({chainId:context.chainId,owner:context.owner,account:context.account,target:context.registry,data:iface(TOKEN_MODULE_ABI).encodeFunctionData(method,args),description,preconditions:contextChecks(context)});}
export function encodeActivate(context,{releaseId,expectedStateHead=ZERO_HASH,nextStateHead=expectedStateHead}){return tokenRecipe(context,'activate',[context.tokenId,hashValue(releaseId),hashValue(context.root),context.epoch,hashValue(expectedStateHead),hashValue(nextStateHead)],'Activate the reviewed module release and compatible saved state');}
export const encodeInstall=encodeActivate;
export function encodeDisable(context,{moduleKey}){return tokenRecipe(context,'disable',[context.tokenId,hashValue(moduleKey),hashValue(context.root),context.epoch],'Disable this module while preserving its content and saved state');}
export function encodeWriteState(context,{moduleKey,bytes,archive=EMPTY_ARCHIVE}){const data=hexlify(bytes);if(archive.archive===EMPTY_ARCHIVE.archive&&getBytes(data).length>32768)throw Error('Direct state exceeds 32 KiB');return tokenRecipe(context,'writeState',[context.tokenId,hashValue(moduleKey),context.root,context.epoch,data,archive],'Save reviewed module state');}
export function encodeStageState(context,{moduleKey,stateSchema,bytes,archive=EMPTY_ARCHIVE}){const data=hexlify(bytes);if(archive.archive===EMPTY_ARCHIVE.archive&&getBytes(data).length>32768)throw Error('Direct state exceeds 32 KiB');return tokenRecipe(context,'stageState',[context.tokenId,hashValue(moduleKey),context.root,context.epoch,hashValue(stateSchema),data,archive],'Stage a reviewed immutable state migration; activation is a separate reviewed action');}
export function encodePublish({chainId,registry,manifest,descriptor}){const input=releaseInput(manifest,descriptor),releaseId=releaseIdFor(manifest.publisher,input,manifest);return {...unsignedCall({chainId,from:manifest.publisher,to:registry,abi:RELEASE_ABI,method:'publish',args:[input,toUtf8Bytes(canonicalManifest(manifest))],description:'Publish an immutable module release; this grants no spending authority'}),releaseId,manifestHash:manifestHash(manifest),moduleKey:moduleKeyFor(manifest.publisher,input.moduleId)};}

export async function assertCurrentContext({request,context}){const current=await readRegistry({request,registry:context.registry,tokenId:context.tokenId,chainId:context.chainId,limit:1});for(const field of ['collection','account','owner','epoch','root','actionNonce','mode'])if(String(current[field]).toLowerCase()!==String(context[field]).toLowerCase())throw Error('Stale review: '+field+' changed');return current;}

/** Independent bounded full recovery. Fails explicitly if the export budget is exceeded. */
export async function recoverToken({request,registry,tokenId,chainId,block,maxRecords=4096,maxExpandedBytes=268435456}){
 if(!Number.isSafeInteger(maxRecords)||maxRecords<1||maxRecords>16384)throw Error('Invalid full recovery record budget');
 const snapshot=await pinSnapshot(request,chainId,block),first=await readRegistry({request,registry,tokenId,chainId,snapshot});
 if(BigInt(first.moduleCount)>BigInt(maxRecords)||BigInt(first.historyCount)>BigInt(maxRecords))throw Error('Token history exceeds recovery record budget');
 const modules=[...first.modules],history=[...first.history];let cursor=Number(first.next),historyCursor=Number(first.historyNext);
 while(cursor<Number(first.moduleCount)||historyCursor<Number(first.historyCount)){const page=await readRegistry({request,registry,tokenId,chainId,snapshot,cursor,historyCursor});modules.push(...page.modules);history.push(...page.history);cursor=Number(page.next);historyCursor=Number(page.historyNext);}
 // Validate every catalog root from the public operation history.
 let previous=ZERO_HASH;for(let i=0;i<history.length;i++){const h=history[i],enabled=h.operation!==2;if(![1,2,3].includes(h.operation)||h.previousRoot!==previous)throw Error('Installation history chain mismatch');const computed=keccak256(coder.encode(['bytes32','uint256','address','uint256','bytes32','bytes32','bytes32','bytes32','bool','uint64','uint256','uint8'],[keccak256(toUtf8Bytes('anima.token-modules/1')),snapshot.chainId,address(registry),tokenId,previous,h.moduleKey,h.releaseId,h.stateHead,enabled,h.epoch,i,h.operation]));if(computed!==h.root)throw Error('Installation history commitment mismatch');previous=h.root;}
 if(previous!==first.root)throw Error('Installation history does not reach current root');
 const latest=new Map(history.map(h=>[h.moduleKey,h]));if(latest.size!==modules.length)throw Error('Catalog differs from installation history');for(const m of modules){const last=latest.get(m.moduleKey);if(!last||last.releaseId!==m.releaseId||last.stateHead!==m.stateHead||last.epoch!==m.epoch||(last.operation!==2)!==m.enabled)throw Error('Current installation differs from history');}
 const roots=[...new Set(history.map(h=>h.releaseId).filter(id=>id!==ZERO_HASH))],packages=new Map(),cache=new Map();let expandedTotal=0;
 for(const releaseId of roots){if(packages.has(releaseId))continue;const recovered=await recoverRelease({request,registry:first.releases,releaseId,chainId,snapshot,cache});for(const p of [recovered,...recovered.dependencies])if(!packages.has(p.releaseId)){expandedTotal+=p.manifest.archive.expandedBytes;if(expandedTotal>maxExpandedBytes)throw Error('Token packages exceed expanded recovery budget');const {dependencies,...entry}=p;packages.set(p.releaseId,entry);}}
 // State-bearing namespaces are independent of installed modules: a prepared first
 // snapshot must remain discoverable even if activation never happens and its receipt is lost.
 const [stateModuleCount]=await readCall(request,snapshot,registry,TOKEN_MODULE_ABI,'stateModuleCount',[tokenId],32);
 if(stateModuleCount>BigInt(maxRecords))throw Error('State namespace catalog exceeds recovery record budget');
 const stateModules=[];let stateCursor=0;const seenStateModules=new Set();
 while(stateCursor<Number(stateModuleCount)){
  const [keys,next]=await readCall(request,snapshot,registry,TOKEN_MODULE_ABI,'stateModulesOf',[tokenId,stateCursor,64],2200);
  if(!keys.length||keys.length>64||next!==BigInt(stateCursor+keys.length)||next>stateModuleCount)throw Error('Invalid state namespace page');
  for(const key of keys){hashValue(key);if(key===ZERO_HASH||seenStateModules.has(key))throw Error('Duplicate or empty state namespace');seenStateModules.add(key);stateModules.push(key);}
  stateCursor=Number(next);
 }
 const stateKeys=[...new Set([...modules.map(module=>module.moduleKey),...stateModules])];
 if(stateKeys.length>maxRecords)throw Error('Combined module namespaces exceed recovery record budget');
 const states=[];
 for(const moduleKey of stateKeys){const module={moduleKey};const [count]=await readCall(request,snapshot,first.stateStore,STATE_ABI,'countOf',[tokenId,module.moduleKey],32);if(count>BigInt(maxRecords-states.length))throw Error('State history exceeds recovery record budget');let next=0;
  while(next<Number(count)){const [ids,cursorResult]=await readCall(request,snapshot,first.stateStore,STATE_ABI,'historyOf',[tokenId,module.moduleKey,next,64],2200);if(!ids.length||ids.length>64||cursorResult!==BigInt(next+ids.length))throw Error('Invalid state history page');for(const stateId of ids){const state=await recoverState({request,stateStore:first.stateStore,stateId,chainId,snapshot,collection:first.collection,tokenId,moduleKey:module.moduleKey});expandedTotal+=state.bytes.length;if(expandedTotal>maxExpandedBytes)throw Error('Token state exceeds recovery byte budget');states.push({...state,moduleKey:module.moduleKey});}next=Number(cursorResult);}
 }
 await assertSnapshot(request,snapshot);return {schema:'anima.token-recovery/1',context:{...first,modules,history,stateModules,stateModuleCount:stateModuleCount.toString(),next:String(cursor),historyNext:String(historyCursor)},packages:[...packages.values()],states,snapshot,expandedBytes:expandedTotal};
}

export const TOKEN_REGISTRY_ABI=TOKEN_MODULE_ABI;
export const RELEASE_REGISTRY_ABI=RELEASE_ABI;
export const STATE_STORE_ABI=STATE_ABI;
