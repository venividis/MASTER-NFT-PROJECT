import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import {build} from 'esbuild';import {options} from '../build.mjs';
const entry=`import * as sdk from '@railgun-community/wallet';import {RelayAdaptHelper,ABIRelayAdapt} from '@railgun-community/engine';import {groth16} from 'snarkjs';import memdown from 'memdown';import {Interface} from 'ethers';globalThis.animaOfflineTest={sdk,RelayAdaptHelper,ABIRelayAdapt,groth16,memdown,Interface};`;
const output=await build({...options,stdin:{contents:entry,resolveDir:path.resolve(import.meta.dirname,'..'),sourcefile:'offline-check.mjs'},write:false});
globalThis.self=globalThis;vm.runInThisContext(output.outputFiles[0].text,{filename:'anima-offline-crypto-check.js'});
const {sdk,RelayAdaptHelper,ABIRelayAdapt,groth16,memdown,Interface}=globalThis.animaOfflineTest;
const cache=new Map(),store=new sdk.ArtifactStore(async p=>cache.get(p)??null,async(d,p,v)=>cache.set(p,v),async p=>cache.has(p));
const mnemonic='test test test test test test test test test test test junk'; // Public test vector, never funded.
const key='11'.repeat(32);sdk.setLoggers(()=>{},()=>{});
try{
 await sdk.startRailgunEngine('animagenesis',memdown(),false,store,false,false);sdk.getProver().setSnarkJSGroth16(groth16);
 const info=await sdk.createRailgunWallet(key,mnemonic,undefined);assert.ok(sdk.validateRailgunAddress(info.railgunAddress));assert.equal(await sdk.getWalletMnemonic(key,info.id),mnemonic);
 const recipients=['0x'+'12'.repeat(20),'0x'+'34'.repeat(20)].map(tokenAddress=>({tokenAddress,recipientAddress:info.railgunAddress}));
 const requests=await RelayAdaptHelper.generateRelayShieldRequests('45'.repeat(16),recipients,[]);
 assert.equal(requests.length,2);const iface=new Interface(ABIRelayAdapt);
 const shield=iface.encodeFunctionData('shield',[requests]);const nested=iface.encodeFunctionData('multicall',[true,[{to:'0x'+'56'.repeat(20),data:shield,value:0n}]]);
 const parsed=iface.decodeFunctionData('multicall',nested);assert.equal(parsed[0],true);assert.equal(parsed[1].length,1);assert.ok(!shield.includes(info.railgunAddress));
 const decoded=iface.decodeFunctionData('shield',shield);assert.equal(decoded[0][0].preimage.token.tokenAddress.toLowerCase(),recipients[0].tokenAddress);assert.equal(decoded[0][0].preimage.value,0n);
 // Restore the same private identity into an entirely new volatile database.
 await sdk.stopRailgunEngine();await sdk.startRailgunEngine('animagenesis',memdown(),false,store,false,false);
 const restored=await sdk.createRailgunWallet(key,mnemonic,undefined);assert.equal(restored.railgunAddress,info.railgunAddress);
 const result={status:'passed',scope:'Bundled browser cryptography executed in Node VM; no network or browser automation; no funded ZK transaction',checks:['Real SDK private wallet derivation','Encrypted wallet mnemonic round trip','Same address restored into a new volatile database','Real SDK encrypted return notes for multiple future ERC20 addresses','Canonical RelayAdapt ABI encodes a require-success inner multicall and zero-value full-balance shields'],versions:{wallet:'10.9.0',engine:'9.6.0',snarkjs:'0.7.6'}};
 const report=path.resolve(import.meta.dirname,'../../../reports/privacy');fs.mkdirSync(report,{recursive:true});fs.writeFileSync(path.join(report,'offline-crypto.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await sdk.stopRailgunEngine();delete globalThis.animaOfflineTest;}
