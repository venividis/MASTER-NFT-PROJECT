import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../../agent/extensions/node_modules/linkedom/esm/index.js';
import {OfficialScenarioDesk,ScenarioClient,scenarioOrigin} from '../../web/launchpad/scenario-client.mjs';
test('scenario GUI isolates private access input and lock clears secrets and outstanding state',()=>{
 const desk=new OfficialScenarioDesk(),{document}=parseHTML('<main></main>'),root=document.querySelector('main');root.innerHTML=desk.render();desk.mount(root);desk.values.accessCode='a'.repeat(64);desk.client=new ScenarioClient({accessCode:desk.values.accessCode});
 const field=root.querySelector('[data-os-field="accessCode"]');field.value=desk.values.accessCode;assert.equal(field.type,'password');assert.ok(field.closest('[data-private-surface]'));
 desk.lock();assert.equal(field.value,'');assert.equal(desk.values.accessCode,'');assert.equal(desk.client,null);desk.unmount();
});
test('scenario endpoints accept explicit local service and reject embedded secrets or insecure remote hosts',()=>{
 assert.equal(scenarioOrigin('http://127.0.0.1:8791'),'http://127.0.0.1:8791');
 for(const url of ['http://remote.invalid','https://a:b@example.com','https://example.com?token=x','file:///tmp/socket'])assert.throws(()=>scenarioOrigin(url));
});
test('locking while restart awaits closure cannot reopen a session',async()=>{
 const desk=new OfficialScenarioDesk();let release;const closed=new Promise(resolve=>release=resolve);desk.client={accessCode:'a'.repeat(64),close:()=>closed};
 const restarting=desk.act('start');desk.lock();release();await restarting;
 assert.equal(desk.client,null);assert.equal(desk.values.accessCode,'');assert.equal(desk.snapshot,null);
});
