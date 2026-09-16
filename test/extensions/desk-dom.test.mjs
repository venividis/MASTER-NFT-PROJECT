/** DOM integration uses the service package's pinned development dependency.
 * ANIMA_TEST_DOM_MODULES can select a separate development installation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ACTIONS,ExtensionDesk,parseActionFields} from '../../web/extensions/desk.mjs';
let parseHTML;
try{({parseHTML}=await import('linkedom'));}catch{
 try{const require=createRequire(new URL('../../agent/extensions/package.json',import.meta.url));({parseHTML}=require('linkedom'));}catch{
  if(process.env.ANIMA_TEST_DOM_MODULES){const require=createRequire(process.env.ANIMA_TEST_DOM_MODULES+'/package.json');({parseHTML}=require('linkedom'));}
 }
}
test('Generic workbench renders and edits all released actions in a real DOM without swallowing fields or preserving stale reviews',{skip:!parseHTML&&'Run npm run extensions:setup, or set ANIMA_TEST_DOM_MODULES.'},async()=>{
 const {document}=parseHTML('<!doctype html><html><body><main></main></body></html>'),container=document.querySelector('main'),wallet={connected:false,plan:null,address:'',chainId:31337n};
 const desk=new ExtensionDesk(wallet,()=>{},(_key,fallback)=>fallback,()=>{});container.innerHTML=desk.render();await desk.mount(container);
 assert.equal(container.querySelectorAll('#ex-operation').length,1);assert.equal(container.querySelectorAll('#cf-transaction-review').length,1);
 assert.doesNotMatch(container.textContent,/section 17|\bF\d\d\b/i);
 assert.equal(container.querySelector('#ex-developer-console').hasAttribute('open'),false);
 assert.ok(container.querySelector('#ex-operation').closest('#ex-developer-console'));
 assert.ok(container.querySelector('#ex-approve-sender').closest('#ex-developer-console'));
 for(const action of ACTIONS){desk.commonAction=action;desk.selected=action.id;desk.drawActions();
  const form=container.querySelector('#ex-action-form');assert.ok(form,action.id);assert.equal(form.querySelectorAll('[data-ex-field]').length,action.fields.length,action.id);
  for(const field of action.fields){const nodes=form.querySelectorAll(`[data-ex-field="${field.name}"]`);assert.equal(nodes.length,1,action.id+'.'+field.name);const node=nodes[0];assert.equal(node.closest('form'),form,action.id+'.'+field.name);
   if(field.type==='bool'){assert.equal(node.tagName,'SELECT');assert.equal(node.querySelectorAll('option').length,2);}
   if(['json','string','bytes'].includes(field.type))assert.equal(node.tagName,'TEXTAREA',action.id+'.'+field.name);
  }
 }
 desk.commonAction=ACTIONS.find(a=>a.id==='F08.offer');desk.drawActions();const input=container.querySelector('[data-ex-field="terms"]');input.value='["100","200","202","1","1","1000",12345,23456]';
 const args=parseActionFields(desk.commonAction,Object.fromEntries([...container.querySelectorAll('[data-ex-field]')].map(n=>[n.dataset.exField,n.value])));assert.equal(args[0][0],'100');
 wallet.plan={old:true};container.querySelector('#cf-transaction-review').innerHTML='<button>Old transaction</button>';desk.change(input);assert.equal(wallet.plan,null);assert.equal(container.querySelector('#cf-transaction-review').children.length,0);
 desk.lock();assert.equal(desk.container,null);
});
