import {archiveSha256,recoverArchive} from './chain-loader.mjs';

export const MODULE_IMPORT_MARKER='__ANIMA_VERIFIED_MODULE_IMPORT_MAP_7A9312__';
const hexWord=value=>BigInt(value).toString(16).padStart(64,'0');
const cleanHash=value=>{const h=String(value).replace(/^0x/,'');if(!/^[a-f0-9]{64}$/i.test(h))throw Error('Invalid module digest');return h.toLowerCase();};
const utf8=new TextEncoder();
export function functionalCommitment(entries,shellIndex){
 let encoded=archiveSha256(utf8.encode('anima.functional-runtime/1'))+hexWord(entries.length)+hexWord(shellIndex);
 for(const m of entries){encoded+=cleanHash(m.id)+hexWord(m.version)+hexWord(m.archiveVersion)+cleanHash(m.sha256)+hexWord(m.byteLength)+cleanHash(m.expandedSha256)+hexWord(m.expandedBytes)+hexWord(m.dependencies.length);for(const d of m.dependencies)encoded+=hexWord(d.index)+hexWord(d.version);}
 return archiveSha256(Uint8Array.from(encoded.match(/../g),v=>parseInt(v,16)));
}
export function validateFunctionalEntries(entries,shellIndex,expectedHash){
 if(!Array.isArray(entries)||entries.length<2||entries.length>32||!Number.isInteger(shellIndex)||shellIndex<0||shellIndex>=entries.length)throw Error('Invalid functional module directory');
 const seen=new Set();let stored=0,expanded=0;
 for(const [i,m] of entries.entries()){
  const id=cleanHash(m.id);if(seen.has(id)||/^0+$/.test(id))throw Error('Duplicate or empty module identity');seen.add(id);
  if(!Number.isSafeInteger(m.version)||m.version<1||m.version>0xffffffff||![1,2].includes(m.archiveVersion)||!Number.isSafeInteger(m.byteLength)||m.byteLength<1||m.byteLength>(m.archiveVersion===1?64:512)*23000||!Number.isSafeInteger(m.expandedBytes)||m.expandedBytes<1)throw Error('Invalid module version or size');
  cleanHash(m.sha256);cleanHash(m.expandedSha256);stored+=m.byteLength;expanded+=m.expandedBytes;
  if(!Array.isArray(m.dependencies)||m.dependencies.length>=entries.length)throw Error('Invalid module dependencies');let last=-1;
  for(const d of m.dependencies){if(!Number.isInteger(d.index)||d.index<=last||d.index<0||d.index>=entries.length||d.index===i||d.version!==entries[d.index].version)throw Error('Missing or mismatched module dependency');last=d.index;}
 }
 if(stored>64*1024*1024||expanded>64*1024*1024)throw Error('Functional module capacity exceeded');
 if(functionalCommitment(entries,shellIndex)!==cleanHash(expectedHash))throw Error('Functional directory digest mismatch');return {stored,expanded};
}
function strictBase64(value){if(typeof value!=='string'||value.length%4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw Error('Invalid module encoding');const binary=atob(value);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
export async function expandFunctionalModule(text,entry){
 if(utf8.encode(text).length!==entry.byteLength||archiveSha256(utf8.encode(text))!==cleanHash(entry.sha256))throw Error('Module stored digest mismatch');
 let envelope;try{envelope=JSON.parse(text);}catch{throw Error('Invalid module envelope');}if(envelope.schema!=='anima.module-envelope/1'||envelope.compression!=='gzip')throw Error('Unsupported module envelope');
 const reader=new Blob([strictBase64(envelope.data)]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();const parts=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>entry.expandedBytes)throw Error('Expanded module exceeds its committed size');parts.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
 if(length!==entry.expandedBytes)throw Error('Expanded module length mismatch');const bytes=new Uint8Array(length);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
 if(archiveSha256(bytes)!==cleanHash(entry.expandedSha256))throw Error('Expanded module digest mismatch');const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(payload.schema!=='anima.functional-module/1'||typeof payload.name!=='string'||!/^[a-z0-9_-]{1,40}$/.test(payload.name)||archiveSha256(utf8.encode(payload.name))!==cleanHash(entry.id))throw Error('Module name differs from committed identity');return payload;
}
export function assembleFunctionalRuntime(entries,payloads,shellIndex,expectedHash){
 validateFunctionalEntries(entries,shellIndex,expectedHash);if(payloads.length!==entries.length)throw Error('Missing functional module');const modules=new Map(),owners=new Map();let shell;
 for(let i=0;i<payloads.length;i++){
  const p=payloads[i];if(!p||p.schema!=='anima.functional-module/1'||archiveSha256(utf8.encode(p.name))!==cleanHash(entries[i].id))throw Error('Module identity mismatch');
  if(i===shellIndex){if(typeof p.shell!=='string'||p.shell.split(MODULE_IMPORT_MARKER).length!==2||p.files!==undefined)throw Error('Invalid runtime shell');shell=p.shell;continue;}
  if(p.shell!==undefined||!Array.isArray(p.files)||p.files.length===0)throw Error('Invalid feature files');
  for(const f of p.files){if(typeof f.path!=='string'||!/^web\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:m?js)$/.test(f.path)||f.path.includes('..')||modules.has(f.path)||typeof f.source!=='string'||!Array.isArray(f.imports))throw Error('Duplicate or unsafe module path');modules.set(f.path,f);owners.set(f.path,i);}
 }
 for(let i=0;i<payloads.length;i++)if(i!==shellIndex){const actual=new Set();for(const f of payloads[i].files)for(const dependency of f.imports){if(!modules.has(dependency))throw Error('Missing imported module '+dependency);const owner=owners.get(dependency);if(owner!==i)actual.add(owner);}if(JSON.stringify([...actual].sort((a,b)=>a-b))!==JSON.stringify(entries[i].dependencies.map(d=>d.index)))throw Error('Declared dependencies differ from module imports');}
 if(JSON.stringify(entries[shellIndex].dependencies.map(d=>d.index))!==JSON.stringify(entries.map((_,i)=>i).filter(i=>i!==shellIndex)))throw Error('Shell must pin every feature');
 const order=payloads[shellIndex].moduleOrder;if(!Array.isArray(order)||order.length!==modules.size||new Set(order).size!==modules.size||order.some(name=>!modules.has(name)))throw Error('Shell module order is incomplete');
 const imports={};for(const name of order){const bytes=utf8.encode(modules.get(name).source);let binary='';for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));imports['awe/'+name]='data:text/javascript;base64,'+btoa(binary);}
 const html=shell.replace(MODULE_IMPORT_MARKER,JSON.stringify({imports}).replaceAll('<','\\u003c'));if(utf8.encode(html).length>64*1024*1024)throw Error('Recovered runtime capacity exceeded');return html;
}
const words=hex=>{if(!/^0x(?:[a-f0-9]{64})+$/i.test(hex))throw Error('Invalid module metadata response');return hex.slice(2).match(/.{64}/g);};
const small=word=>{const n=Number(BigInt('0x'+word));if(!Number.isSafeInteger(n))throw Error('Oversized module metadata');return n;};
// ABI selectors are generated/verified against OnchainModuleDirectory in integration tests.
export async function recoverFunctionalRuntime(request,config,progress=()=>{}){
 if(Number(config.archiveVersion)!==3||!/^0x[a-f0-9]{40}$/i.test(config.runtime))throw Error('Invalid functional runtime identity');
 if(BigInt(await request({method:'eth_chainId',params:[]}))!==BigInt(config.chainId))throw Error('Select chain '+config.chainId);
 const block=await request({method:'eth_blockNumber',params:[]});if(!/^0x[a-f0-9]+$/i.test(block))throw Error('Invalid module block');const call=async data=>words(await request({method:'eth_call',params:[{to:config.runtime,data},block]}));
 if(small((await call('0x4e2ce6d3'))[0])!==3)throw Error('Functional runtime version mismatch');
 const count=small((await call('0x334f7ac5'))[0]),shell=small((await call('0x7259f506'))[0]);if(count<2||count>32||shell>=count)throw Error('Invalid functional module count');const entries=[];
 for(let i=0;i<count;i++){const w=await call('0xd216d296'+hexWord(i));if(w.length!==8||!/^0{24}[a-f0-9]{40}$/i.test(w[2]))throw Error('Invalid module descriptor');const m={id:w[0],version:small(w[1]),archive:'0x'+w[2].slice(24),archiveVersion:small(w[3]),sha256:w[4],byteLength:small(w[5]),expandedSha256:w[6],expandedBytes:small(w[7]),dependencies:[]};const n=small((await call('0xb3a840da'+hexWord(i)))[0]);if(n>=count)throw Error('Too many module dependencies');for(let d=0;d<n;d++){const pair=await call('0xb972ae05'+hexWord(i)+hexWord(d));if(pair.length!==2)throw Error('Invalid dependency descriptor');m.dependencies.push({index:small(pair[0]),version:small(pair[1])});}entries.push(m);}
 validateFunctionalEntries(entries,shell,config.sha256);const pinned=payload=>{if(payload.method==='eth_blockNumber')return Promise.resolve(block);if(payload.method==='eth_call')return request({...payload,params:[payload.params[0],block]});return request(payload);};const payloads=[];
 for(let i=0;i<entries.length;i++){const m=entries[i];progress(i,count,m.id);const text=await recoverArchive(pinned,{runtime:m.archive,chainId:config.chainId,sha256:m.sha256,archiveVersion:m.archiveVersion});payloads.push(await expandFunctionalModule(text,m));}progress(count,count);return assembleFunctionalRuntime(entries,payloads,shell,config.sha256);
}
