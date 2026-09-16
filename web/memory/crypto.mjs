import {stable,fingerprint} from '../kingdom/model.mjs';
/** Native authenticated encryption only. No homemade cipher or plaintext fallback.
 * Passphrases and decrypted bodies never belong in a MemoryEngine export. */
export const MEMORY_KDF_ROUNDS=600000;
const memUTF8=new TextEncoder();
const memHex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const memBytes=h=>{if(typeof h!=='string'||!/^([0-9a-f]{2})*$/.test(h))throw Error('Malformed encoded memory.');return Uint8Array.from(h.match(/../g)||[],x=>parseInt(x,16));};
function memNative(){if(!globalThis.crypto?.subtle||!crypto.getRandomValues)throw Error('Encrypted memory needs native Web Crypto in a secure browser context. Nothing was saved as plaintext.');return crypto.subtle;}
function memPass(pass){if(typeof pass!=='string'||pass.length<12||memUTF8.encode(pass).length>1024)throw Error('Use a unique memory passphrase of at least 12 characters (maximum 1024 UTF-8 bytes). It is not your wallet seed phrase.');}
export function memoryBody(raw){
 const limits={title:160,thesis:3000,setup:512,invalidation:800,exitPlan:800,horizon:256,risk:256,tags:256,feeling:256,lesson:1500};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!(k in limits)))throw Error('Unsupported journal field.');
 const body={};for(const[k,max]of Object.entries(limits)){const v=raw[k]??'';if(typeof v!=='string'||memUTF8.encode(v).length>max)throw Error(k+' exceeds its UTF-8 limit.');body[k]=v.trim();}
 if(!body.thesis&&!body.lesson)throw Error('Write a reason, a memory, or a reflection first.');
 return body;
}
function memPack(body){const bytes=memUTF8.encode(stable(memoryBody(body)));if(bytes.length>12000)throw Error('Memory body too large.');const padded=new Uint8Array(Math.ceil((bytes.length+4)/1024)*1024);new DataView(padded.buffer).setUint32(0,bytes.length);padded.set(bytes,4);return padded;}
function memUnpack(bytes){if(bytes.length<4)throw Error('Invalid private memory.');const len=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);if(len>12000||len+4>bytes.length||bytes.slice(len+4).some(x=>x!==0))throw Error('Invalid private memory padding.');return memoryBody(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.slice(4,4+len))));}
async function memKey(pass,salt,usage){memPass(pass);const s=memNative(),key=await s.importKey('raw',memUTF8.encode(pass),'PBKDF2',false,['deriveKey']);return s.deriveKey({name:'PBKDF2',salt,iterations:MEMORY_KDF_ROUNDS,hash:'SHA-256'},key,{name:'AES-GCM',length:256},false,usage);}
export async function encryptMemory(header,body,pass){memPass(pass);memNative();const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const key=await memKey(pass,salt,['encrypt']);const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:memUTF8.encode(stable(header)),tagLength:128},key,memPack(body));return {mode:'encrypted',cipher:'AES-256-GCM',kdf:'PBKDF2-SHA256',rounds:MEMORY_KDF_ROUNDS,salt:memHex(salt),iv:memHex(iv),data:memHex(new Uint8Array(bytes))};}
export function validateMemoryPayload(payload){
 if(payload?.mode==='public'){if(Object.keys(payload).sort().join(',')!=='body,mode')throw Error('Invalid public memory.');if(stable(memoryBody(payload.body))!==stable(payload.body))throw Error('Noncanonical public memory.');return;}
 if(!payload||Object.keys(payload).sort().join(',')!=='cipher,data,iv,kdf,mode,rounds,salt'||payload.mode!=='encrypted'||payload.cipher!=='AES-256-GCM'||payload.kdf!=='PBKDF2-SHA256'||payload.rounds!==MEMORY_KDF_ROUNDS||memBytes(payload.salt).length!==16||memBytes(payload.iv).length!==12)throw Error('Unsupported encrypted memory.');
 if(typeof payload.data!=='string'||payload.data.length>26656)throw Error('Ciphertext exceeds the memory limit.');const n=memBytes(payload.data).length;if(n<1040||n>13328||(n-16)%1024)throw Error('Invalid ciphertext length.');
}
export async function decryptMemory(header,payload,pass){validateMemoryPayload(payload);if(payload.mode==='public')return structuredClone(payload.body);try{const key=await memKey(pass,memBytes(payload.salt),['decrypt']);const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:memBytes(payload.iv),additionalData:memUTF8.encode(stable(header)),tagLength:128},key,memBytes(payload.data));return memUnpack(new Uint8Array(data));}catch{throw Error('Cannot open this memory: wrong passphrase, changed header, or damaged ciphertext. Nothing was modified.');}}
export function memorySeal(header,payload){validateMemoryPayload(payload);return {header:structuredClone(header),payload:structuredClone(payload),digest:fingerprint({domain:'IDFBI_MEMORY_ENVELOPE_1_7',header,payload})};}
