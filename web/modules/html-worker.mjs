/** Programs run in a worker; the iframe contains only inert HTML and trusted rendering code. */
function workerBootstrap(){
 'use strict';
 const emit=globalThis.postMessage.bind(globalThis),nodes=new Map(),pending=new Map();let serial=0,readyResolve;const ready=new Promise(resolve=>readyResolve=resolve);
 // CSP is the network boundary. Removing constructors also bounds ordinary nested workers.
 for(const name of ['Worker','SharedWorker','fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','indexedDB','caches']){try{Object.defineProperty(globalThis,name,{value:undefined,writable:false,configurable:false});}catch{}}
 const request=async(method,params={})=>{await ready;if(pending.size>=4)throw Error('Finish a host request before sending another.');const id='worker'+(++serial);return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});emit({type:'host',message:{id,method,params}});});};
 const api=Object.freeze({api:'anima.host/1',ready,request,identity:()=>request('identity.read'),module:()=>request('module.read'),readPackage:(releaseId,path)=>request('package.read',{releaseId,path}),getState:key=>request('state.get',{key}),setState:(key,value)=>request('state.set',{key,value}),propose:value=>request('transaction.propose',value),journal:text=>request('journal.propose',{text})});
 function element(id){const record=nodes.get(id);if(!record)return null;if(record.proxy)return record.proxy;const object={id,tagName:record.tagName,addEventListener(type,callback){if(!['click','input','change'].includes(type)||typeof callback!=='function')throw Error('HTML worker supports click, input and change events only.');(record.listeners[type]??=[]).push(callback);emit({type:'listen',id,event:type});},focus(){emit({type:'focus',id});}};for(const property of ['value','textContent','disabled','checked'])Object.defineProperty(object,property,{get:()=>record[property],set:value=>{if(['disabled','checked'].includes(property)){if(typeof value!=='boolean')throw Error('Expected boolean DOM value.');}else if(typeof value!=='string'||value.length>4096)throw Error('DOM text must be at most 4096 characters.');record[property]=value;emit({type:'dom',id,property,value});}});record.proxy=Object.freeze(object);return record.proxy;}
 const documentProxy=Object.freeze({getElementById:element,querySelector(selector){if(typeof selector!=='string'||!/^#[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(selector))throw Error('HTML worker querySelector supports a single #id.');return element(selector.slice(1));},addEventListener(type,callback){if(type!=='DOMContentLoaded'||typeof callback!=='function')throw Error('Unsupported document event.');ready.then(()=>callback({type}));},readyState:'complete'});
 Object.defineProperty(globalThis,'document',{value:documentProxy,writable:false,configurable:false});Object.defineProperty(globalThis,'anima',{value:api,writable:false,configurable:false});Object.defineProperty(globalThis,'window',{value:globalThis,writable:false,configurable:false});
 globalThis.addEventListener('message',event=>{const data=event.data;if(data?.type==='init'){for(const item of data.nodes)nodes.set(item.id,{...item,listeners:{}});readyResolve();}else if(data?.type==='host-result'){const p=pending.get(data.message?.id);if(p){pending.delete(data.message.id);data.message.ok?p.resolve(data.message.result):p.reject(Error(data.message.error));}}else if(data?.type==='event'){const item=nodes.get(data.id);if(!item)return;Object.assign(item,data.values);const target=element(data.id);for(const callback of item.listeners[data.event]??[])Promise.resolve().then(()=>callback({type:data.event,target,currentTarget:target,preventDefault(){}})).catch(error=>emit({type:'error',message:error.message}));}});
}
export function htmlWorkerSource(scripts){
 if(!Array.isArray(scripts)||scripts.length>32||scripts.some(script=>typeof script!=='string'||script.length>524288)||scripts.reduce((n,s)=>n+s.length,0)>1048576)throw Error('Executable HTML exceeds its worker script budget.');
 return '('+workerBootstrap.toString()+')();\nanima.ready.then(async()=>{\n'+scripts.join('\n;\n')+'\n}).catch(error=>postMessage({type:"error",message:String(error.message).slice(0,240)}));';
}
/** Executed only in the frame. Neither archive scripts nor worker-supplied markup run here. */
export function htmlFrameProgram(nonce,workerSource){
 'use strict';
 let port,worker,closed=false,requests=0,domMessages=0,messages=0;const bindings=new Map(),pending=new Set();
 const note=document.createElement('p');note.setAttribute('role','status');note.style.cssText='font:12px/1.6 system-ui;color:#8da9bf;padding:12px;overflow-wrap:anywhere';note.textContent='Starting a worker-backed HTML tool…';document.body.append(note);
 const nodes=[];for(const element of document.querySelectorAll('[id]')){if(nodes.length>=64)break;if(!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(element.id)||['SCRIPT','STYLE','META','LINK','HTML','HEAD','BODY'].includes(element.tagName)||bindings.has(element.id))continue;bindings.set(element.id,element);nodes.push({id:element.id,tagName:element.tagName,value:String(element.value??'').slice(0,4096),textContent:String(element.textContent??'').slice(0,4096),disabled:!!element.disabled,checked:!!element.checked});}
 const listeners=[];
 const close=()=>{if(closed)return;closed=true;worker?.terminate();worker=null;port?.close();for(const[element,type,fn]of listeners)element.removeEventListener(type,fn);note.textContent='Module stopped. Reopen it to begin another session.';parent.postMessage({type:'anima:closed',nonce},'*');};
 const bounded=(data,limit=16384)=>{try{return new TextEncoder().encode(JSON.stringify(data)).length<=limit;}catch{return false;}};
 function start(){
  if(!port||worker||closed)return;const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));try{worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);note.textContent='This browser cannot create the required isolated worker: '+error.message;close();return;}URL.revokeObjectURL(url);
  worker.onerror=event=>{note.textContent='Module worker error: '+event.message;close();};
  worker.onmessage=event=>{const data=event.data;if(closed)return;if(++messages>4096||!bounded(data)){close();return;}
   if(data?.type==='host'){if(++requests>512||pending.size>=4||!data.message||typeof data.message.id!=='string'||pending.has(data.message.id)){close();return;}pending.add(data.message.id);port.postMessage(data.message);}
   else if(data?.type==='dom'){
    if(++domMessages>4096){close();return;}const element=bindings.get(data.id);if(!element||!['value','textContent','disabled','checked'].includes(data.property)){close();return;}
    if(['disabled','checked'].includes(data.property)){if(typeof data.value!=='boolean'){close();return;}element[data.property]=data.value;}
    else{if(typeof data.value!=='string'||data.value.length>4096){close();return;}element[data.property]=data.value;}
   }else if(data?.type==='listen'){
    if(listeners.length>=128||!bindings.has(data.id)||!['click','input','change'].includes(data.event)){close();return;}if(listeners.some(([element,type])=>element===bindings.get(data.id)&&type===data.event))return;
    const element=bindings.get(data.id),fn=event=>{event.preventDefault();worker?.postMessage({type:'event',id:data.id,event:data.event,values:{value:String(element.value??'').slice(0,4096),textContent:String(element.textContent??'').slice(0,4096),disabled:!!element.disabled,checked:!!element.checked}});};element.addEventListener(data.event,fn);listeners.push([element,data.event,fn]);
   }else if(data?.type==='focus'){bindings.get(data.id)?.focus();}
   else if(data?.type==='error'){note.textContent='Unsupported or failed tool operation: '+String(data.message).slice(0,240);}
   else{close();}
  };
  worker.postMessage({type:'init',nodes});note.textContent='HTML worker ready. Supports #id text/value controls and click/input/change events. Wallet actions require host review.';
 }
 addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='anima:bridge'||event.data.nonce!==nonce||port||!event.ports[0])return;port=event.ports[0];port.onmessage=e=>{if(!bounded(e.data,98304)){close();return;}pending.delete(e.data?.id);worker?.postMessage({type:'host-result',message:e.data});};port.start();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();});
 addEventListener('pagehide',close,{once:true});parent.postMessage({type:'anima:ready',nonce},'*');
}
