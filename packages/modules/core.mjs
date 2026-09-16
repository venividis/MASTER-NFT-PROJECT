/** Portable ANIMA extension format. No wallet, filesystem, or code execution. */
import {archiveSha256} from './hash.mjs';

export const RELEASE_SCHEMA='anima.extension-release/1';
export const HOST_API='anima.host/1';
export const ZERO_HASH='0x'+'0'.repeat(64);
export const CAPABILITIES=Object.freeze(['identity.read','journal.propose','state.read','state.write','transaction.propose']);
export const LIMITS=Object.freeze({manifestBytes:16384,storedBytes:11776000,expandedBytes:16777216,files:512,dependencies:16,graphReleases:64,graphDepth:16,chunkBytes:23000});
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const integer=(v,min,max,label)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw Error('Invalid '+label);return v;};
const fields=(v,allowed,required=allowed)=>{if(!plain(v)||Object.keys(v).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(v,k)))throw Error('Unexpected or missing object fields');};
export const sha256=bytes=>'0x'+archiveSha256(asBytes(bytes));
export function asBytes(value){if(value instanceof Uint8Array)return value;if(value instanceof ArrayBuffer)return new Uint8Array(value);if(typeof value==='string')return enc.encode(value);throw Error('Expected bytes or UTF-8 text');}
export function canonicalJSON(value){
 if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||Object.is(value,-0))throw Error('Canonical numbers must be safe integers');return String(value);}
 if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
 if(!plain(value))throw Error('Canonical JSON requires plain data');
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON(value[k])).join(',')+'}';
}
export function hashValue(value){if(typeof value!=='string'||!/^0x[0-9a-f]{64}$/.test(value))throw Error('Expected lowercase bytes32 hash');return value;}
export function safePath(value){if(typeof value!=='string'||value.length>240||!value.split('/').every(p=>/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(p)&&p!=='.'&&p!=='..')||value.includes('..'))throw Error('Unsafe module path');return value;}
const sortedUnique=(list,validate,max,label)=>{if(!Array.isArray(list)||list.length>max)throw Error('Invalid '+label);let last;for(const item of list){validate(item);if(last!==undefined&&last>=item)throw Error('Unsorted or duplicate '+label);last=item;}return list;};
export function validateManifest(m){
 fields(m,['schema','name','version','publisher','format','archive','entrypoint','hostAPI','dependencies','capabilities','stateSchema','predecessor','resources','provenance'],['schema','name','version','publisher','format','archive','entrypoint','hostAPI','dependencies','capabilities','stateSchema','predecessor']);
 if(m.schema!==RELEASE_SCHEMA||m.hostAPI!==HOST_API)throw Error('Unsupported release schema or host API');
 if(typeof m.name!=='string'||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(m.name)||typeof m.publisher!=='string'||!/^0x[0-9a-f]{40}$/.test(m.publisher)||/^0x0+$/.test(m.publisher))throw Error('Invalid publisher or module name');
 integer(m.version,1,0xffffffff,'release version');if(!['files','html'].includes(m.format))throw Error('Unsupported module format');safePath(m.entrypoint);
 fields(m.archive,['compression','storedHash','storedBytes','expandedHash','expandedBytes']);
 if(!['raw','gzip'].includes(m.archive.compression))throw Error('Unsupported archive compression');
 hashValue(m.archive.storedHash);hashValue(m.archive.expandedHash);integer(m.archive.storedBytes,1,LIMITS.storedBytes,'stored length');integer(m.archive.expandedBytes,1,LIMITS.expandedBytes,'expanded length');
 if(m.archive.compression==='raw'&&(m.archive.storedHash!==m.archive.expandedHash||m.archive.storedBytes!==m.archive.expandedBytes))throw Error('Raw archive descriptors differ');
 sortedUnique(m.dependencies,hashValue,LIMITS.dependencies,'dependencies');
 sortedUnique(m.capabilities,c=>{if(!CAPABILITIES.includes(c))throw Error('Unsupported capability');},CAPABILITIES.length,'capabilities');
 hashValue(m.stateSchema);hashValue(m.predecessor);
 if(m.capabilities.some(c=>c.startsWith('state.'))&&m.stateSchema===ZERO_HASH)throw Error('State capability requires a state schema');
 if(m.resources!==undefined){fields(m.resources,['maxRuntimeMs','maxStateBytes']);integer(m.resources.maxRuntimeMs,1000,300000,'runtime budget');integer(m.resources.maxStateBytes,0,32768,'state budget');}
 if(m.provenance!==undefined){fields(m.provenance,['sourceHash','buildHash']);hashValue(m.provenance.sourceHash);hashValue(m.provenance.buildHash);}
 if(enc.encode(canonicalJSON(m)).length>LIMITS.manifestBytes)throw Error('Manifest too large');return m;
}
export const canonicalManifest=m=>canonicalJSON(validateManifest(m));
/** Domain is the schema field in the canonical bytes; hash includes that field. */
export const manifestHash=m=>sha256(enc.encode(canonicalManifest(m)));
export function parseManifest(bytes,expectedHash){const raw=asBytes(bytes),m=JSON.parse(dec.decode(raw));validateManifest(m);if(canonicalManifest(m)!==dec.decode(raw))throw Error('Noncanonical release manifest');if(expectedHash&&manifestHash(m)!==hashValue(expectedHash))throw Error('Release manifest hash mismatch');return m;}
export const verifyManifest=(m,expectedHash)=>{validateManifest(m);if(expectedHash&&manifestHash(m)!==hashValue(expectedHash))throw Error('Release manifest hash mismatch');return m;};
const to64=bytes=>{let s='';for(let p=0;p<bytes.length;p+=8192)s+=String.fromCharCode(...bytes.subarray(p,p+8192));return btoa(s);};
const from64=s=>{if(typeof s!=='string'||s.length%4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw Error('Invalid file encoding');const b=Uint8Array.from(atob(s),c=>c.charCodeAt(0));if(to64(b)!==s)throw Error('Noncanonical file encoding');return b;};
async function transform(bytes,kind,max){
 const stream=new Blob([bytes]).stream().pipeThrough(kind==='gzip'?new CompressionStream('gzip'):new DecompressionStream('gzip'));
 const reader=stream.getReader(),parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('Archive exceeds expanded or stored budget');parts.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
 const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
function normalizedFiles(files){
 if(!Array.isArray(files)||!files.length||files.length>LIMITS.files)throw Error('Invalid file count');
 const sorted=files.map(f=>({path:safePath(f.path),mime:f.mime??'application/octet-stream',bytes:asBytes(f.bytes),imports:[...(f.imports??[])].sort()})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const seen=new Set();let total=0;for(const f of sorted){if(seen.has(f.path))throw Error('Duplicate file path');seen.add(f.path);if(typeof f.mime!=='string'||!/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(f.mime))throw Error('Invalid file MIME');total+=f.bytes.length;if(total>LIMITS.expandedBytes)throw Error('Files exceed expanded budget');sortedUnique(f.imports,safePath,LIMITS.files,'file imports');}
 for(const f of sorted)for(const dependency of f.imports)if(!seen.has(dependency))throw Error('Missing imported file '+dependency);
 // JS file cycles may be legitimate, but release dependency cycles are rejected below.
 return sorted;
}
export async function packageFiles(files,metadata,{compression='gzip'}={}){
 const normalized=normalizedFiles(files);if(!normalized.some(f=>f.path===metadata.entrypoint))throw Error('Missing entrypoint');
 const expanded=enc.encode(canonicalJSON({schema:'anima.module-files/1',files:normalized.map(f=>({path:f.path,mime:f.mime,data:to64(f.bytes),imports:f.imports}))}));
 return packageBytes(expanded,{...metadata,format:'files'},compression,normalized);
}
export async function packageLegacyHTML(html,metadata,{compression='raw'}={}){
 const expanded=asBytes(html);dec.decode(expanded);if(expanded.length>1048576)throw Error('Legacy HTML exceeds existing host bound');
 return packageBytes(expanded,{...metadata,format:'html',entrypoint:metadata.entrypoint??'index.html'},compression,[{path:metadata.entrypoint??'index.html',mime:'text/html',bytes:expanded,imports:[]}]);
}
async function packageBytes(expanded,metadata,compression,files){
 if(!expanded.length||expanded.length>LIMITS.expandedBytes||!['raw','gzip'].includes(compression))throw Error('Invalid expanded payload or compression');
 const archive=compression==='gzip'?await transform(expanded,'gzip',LIMITS.storedBytes):expanded.slice();
 const manifest={schema:RELEASE_SCHEMA,name:metadata.name,version:metadata.version,publisher:typeof metadata.publisher==='string'?metadata.publisher.toLowerCase():metadata.publisher,format:metadata.format,archive:{compression,storedHash:sha256(archive),storedBytes:archive.length,expandedHash:sha256(expanded),expandedBytes:expanded.length},entrypoint:metadata.entrypoint,hostAPI:metadata.hostAPI??HOST_API,dependencies:[...(metadata.dependencies??[])].sort(),capabilities:[...(metadata.capabilities??[])].sort(),stateSchema:metadata.stateSchema??ZERO_HASH,predecessor:metadata.predecessor??ZERO_HASH};
 for(const key of ['resources','provenance'])if(metadata[key]!==undefined)manifest[key]=metadata[key];validateManifest(manifest);
 return {manifest,manifestHash:manifestHash(manifest),contentId:manifestHash(manifest),archive,files};
}
export async function verifyArchive(manifest,storedBytes){
 validateManifest(manifest);const stored=asBytes(storedBytes),a=manifest.archive;
 if(stored.length!==a.storedBytes||sha256(stored)!==a.storedHash)throw Error('Stored archive hash or length mismatch');
 const expanded=a.compression==='gzip'?await transform(stored,'gunzip',a.expandedBytes):stored;
 if(expanded.length!==a.expandedBytes||sha256(expanded)!==a.expandedHash)throw Error('Expanded archive hash or length mismatch');
 let files;
 if(manifest.format==='html'){dec.decode(expanded);files=[{path:manifest.entrypoint,mime:'text/html',bytes:expanded,imports:[]}];}
 else {const envelope=JSON.parse(dec.decode(expanded));fields(envelope,['schema','files']);if(envelope.schema!=='anima.module-files/1'||!Array.isArray(envelope.files))throw Error('Unsupported files envelope');
  files=normalizedFiles(envelope.files.map(f=>{fields(f,['path','mime','data','imports']);return {...f,bytes:from64(f.data)};}));
  if(canonicalJSON({schema:envelope.schema,files:files.map(f=>({path:f.path,mime:f.mime,data:to64(f.bytes),imports:f.imports}))})!==dec.decode(expanded))throw Error('Noncanonical files envelope');
 }
 if(!files.some(f=>f.path===manifest.entrypoint))throw Error('Missing entrypoint');return {manifest,files,entrypoint:manifest.entrypoint};
}
export async function resolveReleaseGraph(rootHashes,readRelease,{maxReleases=LIMITS.graphReleases,maxDepth=LIMITS.graphDepth,identityFor=found=>manifestHash(found?.manifest??found)}={}){
 integer(maxReleases,1,LIMITS.graphReleases,'graph bound');integer(maxDepth,1,LIMITS.graphDepth,'depth bound');
 if(!Array.isArray(rootHashes)||!rootHashes.length||rootHashes.length>maxReleases)throw Error('Invalid graph roots');
 const visiting=new Set(),done=new Map(),order=[];
 async function visit(id,depth){hashValue(id);if(visiting.has(id))throw Error('Cyclic release dependencies');if(done.has(id))return;if(depth>maxDepth||visiting.size+done.size>=maxReleases)throw Error('Release graph budget exceeded');
  visiting.add(id);const found=await readRelease(id),m=found?.manifest??found;validateManifest(m);if(identityFor(found)!==id)throw Error('Release manifest hash mismatch');for(const d of m.dependencies)await visit(d,depth+1);visiting.delete(id);done.set(id,m);order.push(m);
 }
 for(const id of rootHashes)await visit(id,1);return order;
}
export function planChunks(bytes,{existing={}}={}){
 bytes=asBytes(bytes);if(!bytes.length||bytes.length>LIMITS.storedBytes)throw Error('Archive size exceeds chunk plan');const unique=new Map(),references=[];
 for(let offset=0;offset<bytes.length;offset+=LIMITS.chunkBytes){const payload=bytes.slice(offset,offset+LIMITS.chunkBytes),hash=sha256(payload);if(!unique.has(hash)){const address=existing[hash];if(address!==undefined&&!/^0x[0-9a-fA-F]{40}$/.test(address))throw Error('Invalid reused chunk address');unique.set(hash,{hash,bytes:payload.length,payload,address:address??null,reused:!!address});}references.push(hash);}
 return {chunks:[...unique.values()],references,totalBytes:bytes.length,deployBytes:[...unique.values()].filter(c=>!c.reused).reduce((n,c)=>n+c.bytes,0)};
}

/** Only reads already verified package bytes; never fetches a URL or executes code. */
export function readVerifiedFile(recovered,releaseId,path,{maxBytes=65536}={}){
 hashValue(releaseId);safePath(path);integer(maxBytes,1,1048576,'file response budget');
 const module=[recovered,...(recovered.dependencies??[])].find(m=>m.releaseId===releaseId);
 if(!module)throw Error('Release is outside the verified dependency closure');
 const file=module.files.find(f=>f.path===path);if(!file)throw Error('Verified file is missing');
 if(file.bytes.length>maxBytes)throw Error('Verified file exceeds response budget');
 return {releaseId,path,mime:file.mime,bytes:file.bytes.slice()};
}
