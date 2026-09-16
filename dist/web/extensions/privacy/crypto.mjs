/** ANIMA privacy envelope v1. Browser-native P-256 ECDH, HKDF-SHA256, AES-256-GCM.
 * This custom protocol is neither HPKE nor MLS. Never log plaintext, private keys or group secrets.
 */
import {bytesOf,hexOf} from '../../evm.mjs';
const utf8 = new TextEncoder(), decode = new TextDecoder('utf-8',{fatal:true});
const subtle = () => { if(!globalThis.crypto?.subtle) throw Error('WebCrypto requires a secure browser context.'); return globalThis.crypto.subtle; };
const concat = (...items) => { const out = new Uint8Array(items.reduce((n,x)=>n+x.length,0)); let p=0; for(const x of items){out.set(x,p);p+=x.length;}return out; };
export const randomBytes = (length=32) => crypto.getRandomValues(new Uint8Array(length));
export const contextBytes = (purpose,fields) => utf8.encode(JSON.stringify(['anima-privacy-v1',purpose,...fields.map(x=>String(x).toLowerCase())]));
export async function digest(bytes){return hexOf(new Uint8Array(await subtle().digest('SHA-256',bytes)));}
export async function createIdentity(){
 const pair = await subtle().generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 return {privateKey:pair.privateKey,publicKey:hexOf(new Uint8Array(await subtle().exportKey('raw',pair.publicKey)))};
}
async function derive(secret,salt,info){const key=await subtle().importKey('raw',secret,'HKDF',false,['deriveKey']);return subtle().deriveKey({name:'HKDF',hash:'SHA-256',salt,info},key,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function shared(privateKey,publicHex){const publicKey=await subtle().importKey('raw',bytesOf(publicHex),{name:'ECDH',namedCurve:'P-256'},false,[]);return new Uint8Array(await subtle().deriveBits({name:'ECDH',public:publicKey},privateKey,256));}
export async function sealTo(publicKey,plaintext,context){
 if(!(plaintext instanceof Uint8Array) || plaintext.length>30000)throw Error('Envelope content exceeds 30,000 bytes.');
 const ephemeral=await createIdentity(),salt=randomBytes(),iv=randomBytes(12),secret=await shared(ephemeral.privateKey,publicKey);
 try {const key=await derive(secret,salt,context),cipher=new Uint8Array(await subtle().encrypt({name:'AES-GCM',iv,additionalData:context,tagLength:128},key,plaintext));return hexOf(concat(new Uint8Array([1]),bytesOf(ephemeral.publicKey),salt,iv,cipher));}finally{secret.fill(0);}
}
export async function openFrom(identity,envelope,context){
 const bytes=bytesOf(envelope);if(bytes.length<126 || bytes.length>32768 || bytes[0]!==1)throw Error('Invalid encrypted envelope.');
 const secret=await shared(identity.privateKey,hexOf(bytes.slice(1,66)));
 try {const key=await derive(secret,bytes.slice(66,98),context);return new Uint8Array(await subtle().decrypt({name:'AES-GCM',iv:bytes.slice(98,110),additionalData:context,tagLength:128},key,bytes.slice(110)));}finally{secret.fill(0);}
}
export async function memoryCommitment(text,salt){if(typeof text!=='string'||utf8.encode(text).length>12000||bytesOf(salt).length!==32)throw Error('Memory must be text up to 12,000 UTF-8 bytes with a 32-byte salt.');return digest(concat(contextBytes('memory-commitment',[]),bytesOf(salt),utf8.encode(text)));}
export const encodePrivate = data => utf8.encode(JSON.stringify(data));
export const decodePrivate = bytes => JSON.parse(decode.decode(bytes));
export async function epochCommitment(key,context){if(key.length!==32)throw Error('Invalid epoch key.');return digest(concat(context,key));}
export async function encryptMessage(key,text,context){
 const body=utf8.encode(text);if(body.length===0||body.length>6000)throw Error('Message must contain 1–6,000 UTF-8 bytes.');
 const padded=new Uint8Array(Math.ceil((body.length+4)/256)*256);new DataView(padded.buffer).setUint32(0,body.length);padded.set(body,4);
 const iv=randomBytes(12),aes=await derive(key,new Uint8Array(32),context);
 return hexOf(concat(new Uint8Array([1]),iv,new Uint8Array(await subtle().encrypt({name:'AES-GCM',iv,additionalData:context,tagLength:128},aes,padded))));
}
export async function decryptMessage(key,envelope,context){
 const bytes=bytesOf(envelope);if(bytes.length<29||bytes.length>8192||bytes[0]!==1)throw Error('Invalid message envelope.');
 const aes=await derive(key,new Uint8Array(32),context),plain=new Uint8Array(await subtle().decrypt({name:'AES-GCM',iv:bytes.slice(1,13),additionalData:context,tagLength:128},aes,bytes.slice(13)));
 const length=new DataView(plain.buffer).getUint32(0);if(length===0||length>6000||length>plain.length-4)throw Error('Invalid encrypted message length.');return decode.decode(plain.slice(4,4+length));
}
async function backupKey(password,salt,iterations){
 if(typeof password!=='string'||password.length<16||iterations!==600000)throw Error('Use a backup passphrase of at least 16 characters.');
 const material=await subtle().importKey('raw',utf8.encode(password),'PBKDF2',false,['deriveKey']);
 return subtle().deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function exportIdentity(identity,password){
 const salt=randomBytes(),iv=randomBytes(12),key=await backupKey(password,salt,600000);
 const plaintext=encodePrivate(await subtle().exportKey('jwk',identity.privateKey));
 try{return {schema:'anima-encrypted-identity/1',publicKey:identity.publicKey,iterations:600000,salt:hexOf(salt),iv:hexOf(iv),ciphertext:hexOf(new Uint8Array(await subtle().encrypt({name:'AES-GCM',iv,additionalData:contextBytes('identity-backup',[identity.publicKey])},key,plaintext)))};}finally{plaintext.fill(0);}
}
export async function importIdentity(backup,password){
 if(backup.schema!=='anima-encrypted-identity/1'||bytesOf(backup.salt).length!==32||bytesOf(backup.iv).length!==12||bytesOf(backup.ciphertext).length>4096)throw Error('Invalid encrypted identity backup.');
 const key=await backupKey(password,bytesOf(backup.salt),backup.iterations),plain=new Uint8Array(await subtle().decrypt({name:'AES-GCM',iv:bytesOf(backup.iv),additionalData:contextBytes('identity-backup',[backup.publicKey])},key,bytesOf(backup.ciphertext)));
 try{const jwk=decodePrivate(plain),privateKey=await subtle().importKey('jwk',jwk,{name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const publicJwk={kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y,ext:true},publicKey=await subtle().importKey('jwk',publicJwk,{name:'ECDH',namedCurve:'P-256'},true,[]),raw=hexOf(new Uint8Array(await subtle().exportKey('raw',publicKey)));
 if(raw.toLowerCase()!==backup.publicKey.toLowerCase())throw Error('Backup public key mismatch.');return {privateKey,publicKey:raw};}finally{plain.fill(0);}
}
