import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {recoverResource,RESOURCE_SELECTORS} from '../../web/privacy/recover-resource.mjs';

// Exercises the resource ABI and real immutable bytes using project dependencies.
const root=path.resolve(import.meta.dirname,'../..'),project=root;
const require=createRequire(path.join(project,'package.json'));
const solc=require('solc'),ganache=require('ganache');
const {BrowserProvider,ContractFactory,id}=require('ethers');
const digest=b=>'0x'+crypto.createHash('sha256').update(b).digest('hex');

test('real immutable shards recover exact worker bytes and expose correct selector ABI', {timeout:60000}, async()=>{
  const sources={
    'OnchainApp.sol':{content:fs.readFileSync(path.join(project,'contracts/src/protocol/OnchainApp.sol'),'utf8')},
    'ShardedResource.sol':{content:fs.readFileSync(path.join(root,'contracts/src/protocol/ShardedResource.sol'),'utf8')},
  };
  const result=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:1000},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.methodIdentifiers']}}}})));
  assert.deepEqual((result.errors||[]).filter(e=>e.severity==='error'),[]);
  const artifacts={};for(const contracts of Object.values(result.contracts))Object.assign(artifacts,contracts);
  assert.ok(artifacts.ShardedResource.evm.deployedBytecode.object.length/2<=24576);
  const signatures={schemaVersion:'schemaVersion()',shardCount:'shardCount()',shards:'shards(uint256)',shardByteLengths:'shardByteLengths(uint256)',shardChunkCounts:'shardChunkCounts(uint256)',shardSha256:'shardSha256(uint256)',compressedByteLength:'compressedByteLength()',byteLength:'byteLength()',compressedSha256:'compressedSha256()',contentSha256:'contentSha256()',totalChunkCount:'totalChunkCount()',chunkCount:'chunkCount()',readChunk:'readChunk(uint256)'};
  for(const [key,signature] of Object.entries(signatures)){
    assert.equal(RESOURCE_SELECTORS[key],id(signature).slice(0,10));
    const artifact=['chunkCount','readChunk'].includes(key)?artifacts.OnchainApp:artifacts.ShardedResource;
    assert.equal('0x'+artifact.evm.methodIdentifiers[signature],RESOURCE_SELECTORS[key]);
  }
  const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},miner:{blockGasLimit:30000000},wallet:{totalAccounts:1,defaultBalance:100},logging:{quiet:true}});
  const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});
  try{
    const signer=await provider.getSigner();
    const deploy=async(name,args=[])=>{const a=artifacts[name],c=await new ContractFactory(a.abi,'0x'+a.evm.bytecode.object,signer).deploy(...args);await c.waitForDeployment();return c;};
    // Random fixture resists compression and crosses several immutable chunks.
    const raw=Buffer.from('/*'+crypto.randomBytes(30000).toString('hex')+'*/\nself.postMessage({ready:true});');
    const zipped=zlib.gzipSync(raw,{level:9}),locations=[];
    for(let offset=0;offset<zipped.length;offset+=24000){
      const shard=zipped.subarray(offset,offset+24000),chunks=[];
      for(let i=0;i<shard.length;i+=23000)chunks.push((await deploy('AppChunk',['0x'+shard.subarray(i,i+23000).toString('hex')])).target);
      locations.push((await deploy('OnchainApp',[chunks,digest(shard)])).target);
    }
    assert.ok(locations.length>1);
    const resource=await deploy('ShardedResource',[locations,digest(zipped),digest(raw),raw.length]);
    assert.equal(Number(await resource.compressedByteLength()),zipped.length);
    assert.equal(Number(await resource.shardCount()),locations.length);
    const descriptor={resource:resource.target,chainId:31337,sha256:digest(raw),byteLength:raw.length};
    const recovered=await recoverResource(p=>rpc.request(p),descriptor);
    assert.deepEqual(Buffer.from(recovered),raw);
    // A full shard must be deployable without the project's relaxed 100M gas
    // fixture. Repeated byte-identical chunks are valid reusable immutable data.
    const fullChunk=Buffer.alloc(23000,0x61),fullChunkContract=await deploy('AppChunk',['0x'+fullChunk.toString('hex')]);
    const fullBytes=Buffer.concat(Array(32).fill(fullChunk)),archiveArtifact=artifacts.OnchainApp;
    const fullFactory=new ContractFactory(archiveArtifact.abi,'0x'+archiveArtifact.evm.bytecode.object,signer);
    const fullTx=await fullFactory.getDeployTransaction(Array(32).fill(fullChunkContract.target),digest(fullBytes));
    const fullGas=await provider.estimateGas({...fullTx,from:await signer.getAddress()});
    assert.ok(fullGas<16000000n,'A full OnchainApp shard must fit a 16M gas budget');
    console.log('Full 32-chunk OnchainApp constructor estimated gas: '+fullGas);
    await assert.rejects(deploy('ShardedResource',[[],digest(zipped),digest(raw),raw.length]));
    await assert.rejects(deploy('ShardedResource',[[await signer.getAddress()],digest(zipped),digest(raw),raw.length]));
    await assert.rejects(deploy('ShardedResource',[locations,digest(zipped),'0x'+'0'.repeat(64),raw.length]));
    await assert.rejects(deploy('ShardedResource',[locations,digest(zipped),digest(raw),0]));
  }finally{provider.destroy();await rpc.disconnect();}
});
