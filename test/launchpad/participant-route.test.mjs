import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseLaunchHash,buildLaunchHash} from '../../web/launchpad/links.mjs';
import {CAPABILITY_CATALOG,resolveCapabilityRoute} from '../../web/confluence/capabilities.mjs';

// Execute the canonical app's actual route handler with isolated navigation dependencies.
// Contract reads and signed lifecycles are covered by participant.integration.test.mjs.
const source=fs.readFileSync(new URL('../../web/confluence/app.js',import.meta.url),'utf8');
const match=source.match(/async function openLaunchLink\(\)\s*\{([\s\S]*?)\n\}/);
assert.ok(match,'Canonical NFT app must expose the launch-link handler.');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const handle=new AsyncFunction('parseLaunchHash','location','participant','open','notify','launchDesk',match[1]);

test('canonical NFT route opens exact participant identity before its page and never requires owner history',async()=>{
  const route={kind:'community',chainId:1,contract:'0x0000000000000000000000000000000000000007',id:'42'},calls=[];
  const result=await handle(parseLaunchHash,{hash:buildLaunchHash(route)},{open:r=>calls.push(['identity',r])},async page=>calls.push(['page',page]),message=>calls.push(['message',message]));
  assert.equal(result,true);assert.deepEqual(calls,[['identity',route],['page','participant']]);
  assert.ok(CAPABILITY_CATALOG.participant);assert.equal(resolveCapabilityRoute('participant'),'participant');
  assert.match(source,/next\s*===\s*["']participant["']\s*\?\s*["']LAUNCH PARTICIPATION["']/);
});

test('malformed launch links show a local navigation error without failing the renderer boot',async()=>{
  const calls=[];
  assert.equal(await handle(parseLaunchHash,{hash:'#launch/community/1/not-an-address/42'},{open:()=>{throw Error('Invalid identity must not mount.');}},async page=>calls.push(['page',page]),message=>calls.push(['message',message])),true);
  assert.equal(calls[0][0],'page');assert.equal(calls[0][1],'launch');assert.equal(calls[1][0],'message');assert.match(calls[1][1],/incomplete or malformed/);
  calls.length=0;
  assert.equal(await handle(parseLaunchHash,{hash:'#atlas'},{open:r=>calls.push(r)},async page=>calls.push(page),m=>calls.push(m)),false);
  assert.deepEqual(calls,[]);
});

for (const kind of ['cca','doppler']) test(`canonical ${kind} participant route preserves its shareable URL`,async()=>{
  const route={kind,chainId:1,contract:'0x0000000000000000000000000000000000000007',...(kind==='doppler'?{asset:'0x0000000000000000000000000000000000000008'}:{})},calls=[];
  const desk={protocolsDesk:{openRoute:r=>calls.push(['identity',r])}};
  await handle(parseLaunchHash,{hash:buildLaunchHash(route)},{open:()=>assert.fail('Wrong participant desk')},async(page,options)=>calls.push(['page',page,options]),()=>{},desk);
  assert.equal(desk.tab,'protocols');
  assert.equal(calls[0][1].contract,route.contract);
  assert.deepEqual(calls[1],['page','launch',{preserveLaunchLink:true}]);
});
