import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {exportFrozenMint,installFrozenGuard,rpcRecordKey,frozenBridgeSource} from '../../scripts/lib/prism-simulator-export.mjs';

function realm(){
 const listeners=new Map(),written=[];
 const target=name=>({addEventListener(type,listener,capture){const key=name+':'+type,list=listeners.get(key)||[];if(!list.some(entry=>entry.listener===listener&&entry.capture===capture))list.push({listener,capture});listeners.set(key,list);},dispatchEvent(event){event.stopped=false;event.stopImmediatePropagation=()=>{event.stopped=true;};event.stopPropagation=()=>{};event.preventDefault=()=>{};for(const entry of [...(listeners.get(name+':'+event.type)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture))){entry.listener(event);if(event.stopped)break;}return !event.stopped;}});
 const doc={...target('document'),open(){listeners.clear();return doc;},write(value){written.push(value);},close(){},body:{style:{},replaceChildren(){},append(value){doc.message=value.textContent;}},createElement(){return {style:{}};}};
 const win={...target('window'),document:doc,stop(){win.stopped=true;}};return {win,doc,written};
}
const snapshot=()=>({schema:'anima.prism-simulator/1',chainId:31337,blockNumber:'0x1b7',blockHash:'0x'+'a'.repeat(64),
 identity:{chainId:'31337',collection:'0x'+'b'.repeat(40),tokenId:'1',seed:'0x'+'c'.repeat(64)},
 runtimeHtml:'<!doctype html><html><body>Exact application\n<script>window.original=true;</script></body></html>',
 workbenchHtml:'<!doctype html><html><body>Workbench ∞</body></html>',
 loaderHtml:'<script>window.AWE_CHAIN_IDENTITY={chainId:"31337",tokenId:"1"};</script><!doctype html><button id="unfold">Unfold</button>',
 record:{registry:'0x'+'d'.repeat(40)},
 metadata:{name:'Anima Genesis #1',image:'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64')},
 provenance:{runtimeByteIdentical:true,workbenchByteIdentical:true},
 rpcRecords:[{method:'eth_call',params:[{to:'0x'+'B'.repeat(40),data:'0xAB'},'0x1b7'],result:'0x0102'},{method:'eth_getBlockByNumber',params:['0x1b7',false],result:{number:'0x1b7',hash:'0x'+'a'.repeat(64)}}]});

test('frozen reads use the captured block and reject every account, signature or mutation path',async()=>{
 const{win}=realm(),guard=installFrozenGuard(win,snapshot());
 assert.equal(await guard.request({method:'eth_chainId',params:[]}),'0x7a69');
 assert.equal(await guard.request({method:'eth_call',params:[{data:'0xab',to:'0x'+'b'.repeat(40)},'latest']}),'0x0102');
 for(const method of ['eth_accounts','eth_requestAccounts','personal_sign','eth_sign','eth_signTypedData_v4','eth_sendTransaction','eth_sendRawTransaction','wallet_switchEthereumChain','evm_mine'])await assert.rejects(guard.request({method,params:[]}),error=>error.code===4001);
 await assert.rejects(guard.request({method:'eth_call',params:[{to:'0x'+'b'.repeat(40),data:'0xcd'},'latest']}),error=>error.code===-32004);
 const block=await guard.request({method:'eth_getBlockByNumber',params:['latest',false]});block.hash='changed';assert.notEqual((await guard.request({method:'eth_getBlockByNumber',params:['latest',false]})).hash,'changed');
 assert.throws(()=>{win.ethereum={request(){throw Error('must never be reached');}};},TypeError);
 assert.equal(Object.getOwnPropertyDescriptor(win,'ethereum').configurable,false);
});

test('EIP-6963 capture barrier survives document.open before any application listeners run',()=>{
 const{win,doc}=realm();installFrozenGuard(win,snapshot());
 let discovered=0;const register=()=>{for(const target of [win,doc])for(const type of ['eip6963:announceProvider','eip6963:requestProvider'])target.addEventListener(type,()=>discovered++,true);};
 register();for(const target of [win,doc])for(const type of ['eip6963:announceProvider','eip6963:requestProvider'])target.dispatchEvent({type});assert.equal(discovered,0);
 doc.open();register();for(const target of [win,doc])for(const type of ['eip6963:announceProvider','eip6963:requestProvider'])target.dispatchEvent({type});assert.equal(discovered,0);
});

test('nonconfigurable injected wallets fail closed before writing or executing the application',async()=>{
 const{win,doc,written}=realm();Object.defineProperty(win,'ethereum',{value:{request(){throw Error('real wallet called');}},configurable:false});
 const context=vm.createContext({window:win,document:doc,fetch:async()=>({ok:true,json:async()=>snapshot()}),console});
 vm.runInContext(frozenBridgeSource(),context);await win.ANIMA_FROZEN.open('<script>SHOULD_NOT_EXECUTE()</script>');
 assert.deepEqual(written,[]);assert.equal(win.stopped,true);assert.match(doc.message,/read-only replay/i);
});

test('successful replay retains original document bytes and restores standards mode plus transport policy',async()=>{
 const{win,doc,written}=realm(),data=snapshot();
 const context=vm.createContext({window:win,document:doc,fetch:async()=>({ok:true,json:async()=>data}),console});
 vm.runInContext(frozenBridgeSource(),context);await win.ANIMA_FROZEN.open(data.runtimeHtml);
 assert.equal(written.length,1);assert.ok(written[0].startsWith('<!doctype html>'));assert.ok(written[0].endsWith(data.runtimeHtml));assert.match(written[0],/connect-src 'self' data: blob:/);assert.equal(win.ethereum.isANIMAFrozen,true);
});

test('export preserves exact runtime, workbench, NFT loader, identity and metadata bytes',()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'prism-export-')),data=snapshot(),output=path.join(parent,'export');
 try{
 const result=exportFrozenMint(data,output);
 for(const[file,content]of [['runtime-source.html',data.runtimeHtml],['workbench-source.html',data.workbenchHtml],['token-1-loader.html',data.loaderHtml]]){
 assert.equal(fs.readFileSync(path.join(output,file),'utf8'),content);assert.equal(result.manifest.files[file].sha256,'0x'+createHash('sha256').update(content).digest('hex'));
 }
 const wrapper=fs.readFileSync(path.join(output,'token-1-runtime.html'),'utf8'),payload=JSON.parse(wrapper.match(/<script id="immutable-document" type="application\/json">([\s\S]*?)<\/script>/)[1]);
 assert.ok(wrapper.startsWith('<!doctype html>'));assert.equal(payload,data.loaderHtml.slice(0,data.loaderHtml.indexOf('</script>')+9)+data.runtimeHtml);
 assert.match(fs.readFileSync(path.join(output,'index.html'),'utf8'),/width:min\(390px,100%\)/);assert.doesNotMatch(fs.readFileSync(path.join(output,'index.html'),'utf8'),/\.src\s*=/);
 assert.equal(JSON.parse(fs.readFileSync(path.join(output,'metadata.json'),'utf8')).image,data.metadata.image);
 assert.throws(()=>exportFrozenMint({...data,provenance:{runtimeByteIdentical:false,workbenchByteIdentical:true}},path.join(parent,'invalid')),/byte-identical/);
 assert.throws(()=>exportFrozenMint({...data,rpcRecords:[{method:'eth_sendTransaction',params:[],result:'0x'}]},path.join(parent,'invalid')),/non-read/);
 assert.throws(()=>exportFrozenMint(data,output),/already exists/);
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});

test('canonical record keys keep missing responses distinct while normalizing case, key order and pinned latest',()=>{
 assert.equal(rpcRecordKey('eth_call',[{to:'0xAB',data:'0xCD'},'latest'],'0x10'),rpcRecordKey('eth_call',[{data:'0xcd',to:'0xab'},'0x10'],'0x10'));
 assert.notEqual(rpcRecordKey('eth_call',[{to:'0xab',data:'0xcd'},'0x11'],'0x10'),rpcRecordKey('eth_call',[{to:'0xab',data:'0xcd'},'latest'],'0x10'));
});
