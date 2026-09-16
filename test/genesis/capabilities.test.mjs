import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const catalog=JSON.parse(fs.readFileSync('web/instruments/capabilities.json','utf8'));
test('capability inventory keeps source evidence and deployment claims separate',()=>{
  assert.equal(catalog.deployment,null);
  assert.equal(catalog.mainnetEnabled,false);
  assert.equal(new Set(catalog.modules.map(m=>m.id)).size,catalog.modules.length);
  for(const entry of catalog.modules){
    assert.ok(catalog.stateLabels[entry.state],entry.id+' has a known rendered status');
    assert.ok(entry.explanation?.length>20,entry.id+' has a plain explanation');
    if(!['RESEARCH_NOT_IMPLEMENTED','SPECIFICATION_ONLY'].includes(entry.state)){
      assert.ok(entry.sources?.length,entry.id+' names implementation evidence');
      for(const source of entry.sources)assert.ok(fs.existsSync(source),entry.id+': '+source);
    }
  }
  const entries=Object.fromEntries(catalog.modules.map(m=>[m.id,m]));
  assert.equal(entries['journal-swap-source'].state,'CONFIGURABLE_WALLET_AND_CONTRACTS');
  assert.equal(entries['private-chat'].state,'CONFIGURABLE_WALLET_AND_CONTRACTS');
  assert.equal(entries.house.state,'CONFIGURABLE_WALLET_AND_CONTRACTS');
  assert.equal(entries['lived-form'].state,'LOCAL_ONLY');
  assert.deepEqual(JSON.parse(fs.readFileSync('system-manifest.json')).modules,catalog.modules);
});
test('capability cards escape explanations and display unknown states conservatively',()=>{
  const source=fs.readFileSync('web/instruments/app.js','utf8');
  const page=source.split('\n').find(line=>line.startsWith('function capabilityPage(){'));
  const hostile='<img src=x onerror=alert(1)>';
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fixture={stateLabels:catalog.stateLabels,warning:hostile,modules:[{label:hostile,state:'NOT_A_REAL_STATUS',explanation:hostile,dependencies:[hostile],authority:hostile,privacy:hostile,exit:hostile,limitations:hostile}]};
  const html=vm.runInNewContext(page+';capabilityPage()',{IX_CATALOG:fixture,esc});
  assert.ok(!html.includes('<img'));
  assert.match(html,/&lt;img/);
  assert.match(html,/STATUS UNKNOWN/);
  assert.ok(!html.includes('RESEARCH · NOT IMPLEMENTED'));
});
