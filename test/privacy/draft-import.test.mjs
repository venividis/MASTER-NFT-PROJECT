import test from 'node:test';
import assert from 'node:assert/strict';
import {V4Desk} from '../../web/v4/desk.mjs';

const address='0x'+'12'.repeat(20),other='0x'+'34'.repeat(20);
function fixture({chainId=137,active=true}={}){
  const data={settings:{chainId,rpc:'https://private.example/rpc',poi:'https://private.example/proof',trustedFeeSigner:'private signer',factory:address},drafts:[]};
  return {data,settings:{chainId:1},generation:0,values:{old:true},invalidations:0,stops:0,saves:0,
    bridge:{info:active?{chainId}:null,lock(){this.info=null;}},
    invalidate(){this.generation++;this.invalidations++;},
    vault:{async save(){}},
  };
}

test('import uses encrypted private configuration, rejects another chain and invalidates stale terms',async()=>{
  const d=fixture(),values={name:'A private launch',creatorHook:true,expectedSplitWeights:['1']};
  await assert.rejects(V4Desk.prototype.importLaunchDraft.call(d,{values,chainId:1,factory:other}),/private wallet uses chain 137/);
  assert.equal(d.data.settings.factory,address);assert.equal(d.generation,0);
  d.bridge.info.chainId=1;
  await assert.rejects(V4Desk.prototype.importLaunchDraft.call(d,{values,chainId:1}),/running private session differs/);
  d.bridge.info.chainId=137;
  await V4Desk.prototype.importLaunchDraft.call(d,{values});
  assert.equal(d.settings.chainId,137);assert.equal(d.settings.rpc,'https://private.example/rpc');
  assert.equal(d.bridge.info.chainId,137);assert.equal(d.invalidations,1);
  assert.equal(d.private,true);assert.equal(d.kind,'launch');assert.equal(d.view,'operation');
  values.expectedSplitWeights[0]='999';assert.equal(d.values.expectedSplitWeights[0],'1');
});

test('same-chain contract changes stop the worker and persist into the actual encrypted settings',async()=>{
  const d=fixture();let saved;
  d.vault.save=async()=>{saved=structuredClone(d.data.settings);};
  const result=await V4Desk.prototype.importLaunchDraft.call(d,{values:{name:'Updated'},chainId:137,factory:other,hookFactory:address});
  assert.equal(result.restartRequired,true);assert.equal(d.bridge.info,null);
  assert.equal(saved.factory,other);assert.equal(saved.hookFactory,address);
  assert.equal(saved.chainId,137);assert.equal(saved.rpc,'https://private.example/rpc');
  assert.equal(saved.trustedFeeSigner,'private signer');
});

test('lock during encrypted settings save prevents a draft from reappearing',async()=>{
  const d=fixture();d.vault.save=async()=>{d.generation++;d.values={};};
  await assert.rejects(V4Desk.prototype.importLaunchDraft.call(d,{values:{name:'Do not resurrect'},factory:other}),/locked or changed/);
  assert.deepEqual(d.values,{});
});

test('late private startup cannot replace a newly opened surface',async()=>{
  let finish,painted=0;
  const pending=new Promise(resolve=>finish=resolve);
  const d={data:{mnemonic:'test vector',settings:{}},generation:0,invalidate(){this.generation++;},event(){},bridge:{start:async()=>pending,lock(){}},repaint(){painted++;}};
  const action=V4Desk.prototype.action.call(d,'start',{});
  d.generation++;
  finish({chainId:1});await action;
  assert.equal(painted,0);
});
