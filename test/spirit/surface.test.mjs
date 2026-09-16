import test from 'node:test';import assert from 'node:assert/strict';
import {attachSpiritSurface} from '../../web/spirit/surface.mjs';
test('formed surfaces include transaction consent and restore normal visibility in Original',()=>{
 const nodes=new Map(),ids=['cf-dialog','instrument-dialog','chain-dialog','detail-dialog','transaction-dialog','memory-dialog','ascend-dialog','import-dialog'];
 for(const id of ids)nodes.set(id,{open:false,classList:{add(){}},addEventListener(){},style:{removeProperty(name){delete this[name==='pointer-events'?'pointerEvents':name];}}});
 let observer;const keys=['document','window','MutationObserver','matchMedia'],before=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{Object.assign(globalThis,{document:{getElementById:id=>nodes.get(id),querySelector:()=>null},window:{},MutationObserver:class{constructor(fn){observer=fn;}observe(){}},matchMedia:()=>({addEventListener(){}})});
  const field={unfold:0,pulse:0},transaction=nodes.get('transaction-dialog');attachSpiritSurface(field);field.onUnfold(0);assert.equal(transaction.style.opacity,'0');field.onUnfold(1);assert.equal(transaction.style.opacity,'1');assert.equal(transaction.style.pointerEvents,'auto');
  field.setSurfaceActive(false);field.onUnfold(0);for(const panel of nodes.values()){assert.equal(panel.style.opacity,undefined);assert.equal(panel.style.pointerEvents,undefined);}
  field.setSurfaceActive(true);assert.equal(transaction.style.opacity,'0');let opened=0,closed=0;field.onSurfaceOpen=()=>opened++;field.onSurfacesEmpty=()=>closed++;transaction.open=true;observer();assert.equal(field.open,true);assert.equal(opened,1);transaction.open=false;observer();assert.equal(closed,1);
 }finally{for(const[k,d]of Object.entries(before))if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
});
