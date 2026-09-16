import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {BrowserProvider, Contract, AbiCoder, sha256, keccak256, toUtf8Bytes} from 'ethers';
import {deployContract, deployStack, loadArtifact} from '../../scripts/lib/deploy-stack.mjs';
import {recoverArchive} from '../../web/confluence/chain-loader.mjs';

const hex=bytes=>'0x'+Buffer.from(bytes).toString('hex');
test('immutable directory recovers >64 actual onchain chunks and rejects altered data before execution',async t=>{
 const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},miner:{blockGasLimit:30000000},logging:{quiet:true}});
 const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 t.after(async()=>{provider.destroy();await rpc.disconnect();});const signer=await provider.getSigner();
 const parts=Array.from({length:65},(_,i)=>Buffer.from(i===0?'<!doctype html><html><body>':i===64?'</body></html>':`<p>Immutable section ${i}</p>`));
 const bytes=Buffer.concat(parts),digest=sha256(bytes),chunks=[];
 for(const p of parts)chunks.push((await deployContract('AppChunk',signer,[hex(p)])).target);
 await assert.rejects(deployContract('OnchainApp',signer,[chunks,digest]));
 const leaves=[];for(let i=0;i<parts.length;i+=32)leaves.push(await deployContract('OnchainApp',signer,[chunks.slice(i,i+32),sha256(Buffer.concat(parts.slice(i,i+32)))]));
 await assert.rejects(deployContract('OnchainApp',signer,[[chunks[0]],'0x'+'01'.repeat(32)]));
 const app=await deployContract('OnchainAppDirectory',signer,[leaves.map(x=>x.target),digest]);
 assert.equal(await app.chunkCount(),65n);assert.equal(await app.byteLength(),BigInt(bytes.length));assert.equal(await app.schemaVersion(),2n);assert.equal(await app.leafCount(),3n);
 assert.equal(await app.leafSha256(1),sha256(Buffer.concat(parts.slice(32,64))));
 for(const i of [0,31,32,63,64])assert.equal(await app.readChunk(i),hex(parts[i]));await assert.rejects(app.readChunk(65));
 const config={runtime:app.target,chainId:31337,sha256:digest,archiveVersion:2},calls=[];
 const request=p=>{calls.push(p);return rpc.request(p);};assert.equal(await recoverArchive(request,config),bytes.toString());
 const blocks=new Set(calls.filter(p=>p.method==='eth_call').map(p=>p.params[1]));assert.equal(blocks.size,1);
 await assert.rejects(recoverArchive(request,{...config,archiveVersion:1}),/archive count/);
 const coder=AbiCoder.defaultAbiCoder();let corruptReads=0;
 await assert.rejects(recoverArchive(async p=>{
  const result=await rpc.request(p);
  if(p.method==='eth_call'&&p.params[0].data==='0x8f5281bf'+(32).toString(16).padStart(64,'0')){corruptReads++;return coder.encode(['bytes'],[hex(Buffer.from('x'.repeat(parts[32].length)))]);}
  return result;
 },config),/digest mismatch/);assert.equal(corruptReads,1);
 await assert.rejects(recoverArchive(request,{...config,sha256:'0x'+'ff'.repeat(32)}),/digest mismatch/);
 // Renderer puts version2 into the actual NFT's boot metadata; v1 fallback stays valid.
 const manifest=await deployContract('GenesisManifest',signer),renderer=await deployContract('ConfluenceRenderer',signer,[app.target,manifest.target,chunks[0]]);
 assert.equal(await renderer.archiveVersion(),2n);
 const legacy=await deployContract('ConfluenceRenderer',signer,[leaves[0].target,manifest.target,chunks[0]]);assert.equal(await legacy.archiveVersion(),1n);
 const owner=await signer.getAddress(),stack=await deployStack({signer,attesterAddress:owner,royaltyBps:0});
 const secret=keccak256(toUtf8Bytes('directory-metadata-fixture'));await(await stack.collection.commitAwakening(await stack.collection.commitmentFor(owner,secret,owner))).wait();
 await rpc.request({method:'evm_mine',params:[]});await rpc.request({method:'evm_mine',params:[]});await(await stack.collection.revealAwakening(secret,owner)).wait();
 const metadata=JSON.parse(Buffer.from((await renderer.render(stack.collection.target,1)).split(',')[1],'base64'));
 const boot=Buffer.from(metadata.animation_url.split(',')[1],'base64').toString();assert.match(boot,/archiveVersion:"2"/);assert(boot.includes(digest));assert(boot.includes('Archive digest mismatch'));
 // Numeric bounds hold even for structurally valid original 64-chunk leaves.
 const tooLarge=await deployContract('OnchainApp',signer,[chunks.slice(0,33),sha256(Buffer.concat(parts.slice(0,33)))]);
 await assert.rejects(deployContract('OnchainAppDirectory',signer,[[tooLarge.target],digest]));
 await assert.rejects(deployContract('OnchainAppDirectory',signer,[Array(17).fill(leaves[0].target),digest]));
 await assert.rejects(deployContract('OnchainAppDirectory',signer,[[],digest]));
 await assert.rejects(deployContract('OnchainAppDirectory',signer,[[owner],digest]));
 // Tampering with an archived leaf's code is detected by the immutable snapshot.
 await rpc.request({method:'evm_setAccountCode',params:[leaves[0].target,'0x00']});await assert.rejects(app.readChunk(0));
});
