// Unsigned offline planning and read-only receipt verification. No signer, key, or broadcasting API.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {ContractFactory,Interface,getAddress,getCreateAddress,keccak256} from 'ethers';
import {verifyCompilation} from './compiler-artifacts.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const MAX256=(1n<<256n)-1n;
const identifier=/^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const digest=x=>'0x'+crypto.createHash('sha256').update(canonical(x)).digest('hex');
const exactKeys=(o,keys,label)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k)))throw Error('Unknown or invalid '+label+' field.');};
const addr=(v,label)=>{try{const a=getAddress(v);if(BigInt(a)!==0n)return a;}catch{}throw Error('Invalid nonzero '+label+' address.');};
const hex32=(v,label)=>{if(typeof v!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(v)||BigInt(v)===0n)throw Error('Invalid '+label+' bytes32.');return v.toLowerCase();};
const name=(v,label)=>{if(typeof v!=='string'||!identifier.test(v)||['__proto__','prototype','constructor'].includes(v))throw Error('Invalid '+label+'.');return v;};
const wei=v=>{if(typeof v!=='string'||! /^(0|[1-9][0-9]*)$/.test(v)||BigInt(v)>MAX256)throw Error('Native value must be an explicit canonical uint256 decimal string.');return v;};
const safe=(v,min,max,label)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw Error('Invalid '+label+'.');return v;};
function cleanArgs(v,depth=0){if(depth>16)throw Error('ABI arguments too deeply nested.');if(v===null||typeof v==='boolean'||typeof v==='string')return v;if(typeof v==='number'){if(!Number.isSafeInteger(v))throw Error('ABI numbers must be safe integers or decimal strings.');return v;}if(Array.isArray(v)){if(v.length>4096)throw Error('ABI array too large.');return v.map(x=>cleanArgs(x,depth+1));}if(v&&typeof v==='object'){return Object.fromEntries(Object.entries(v).map(([k,x])=>[name(k,'tuple field'),cleanArgs(x,depth+1)]));}throw Error('Invalid JSON ABI argument.');}

export function validateExtensionsDeploymentConfig(input){
 exactKeys(input,['schema','chainId','deployer','startingNonce','externals','steps'],'extension configuration');
 if(input.schema!=='anima.extensions-deployment-config/1')throw Error('Unsupported extension deployment configuration.');
 if(![31337,11155111,84532].includes(input.chainId))throw Error('Choose local 31337, Sepolia 11155111, or Base Sepolia 84532.');
 const config={schema:input.schema,chainId:input.chainId,deployer:addr(input.deployer,'deployer'),startingNonce:safe(input.startingNonce,0,Number.MAX_SAFE_INTEGER-1000,'starting nonce'),externals:{},steps:[]};
 if(!input.externals||typeof input.externals!=='object'||Array.isArray(input.externals)||Object.keys(input.externals).length>64)throw Error('Supply explicit bounded external-contract pins.');
 const names=new Set();
 for(const [key,e] of Object.entries(input.externals)){name(key,'external name');exactKeys(e,['address','contractName','runtimeCodeHash'],'external pin');config.externals[key]={address:addr(e.address,key),contractName:name(e.contractName,'external artifact'),runtimeCodeHash:hex32(e.runtimeCodeHash,'external runtime code hash')};names.add(key);}
 if(!Array.isArray(input.steps)||input.steps.length===0||input.steps.length>256)throw Error('Choose 1–256 explicit deployment/configuration steps.');
 for(const s of input.steps){
  if(s?.kind==='deploy'){
   exactKeys(s,['kind','name','contractName','args','value'],'deployment step');name(s.name,'step name');if(names.has(s.name))throw Error('Duplicate deployment or step name.');if(!Array.isArray(s.args))throw Error('Constructor args must be an array.');
   config.steps.push({kind:'deploy',name:s.name,contractName:name(s.contractName,'contract name'),args:cleanArgs(s.args),value:wei(s.value)});names.add(s.name);
  }else if(s?.kind==='call'){
   exactKeys(s,['kind','name','target','method','args','value'],'configuration step');name(s.name,'step name');if(names.has(s.name))throw Error('Duplicate deployment or step name.');if(typeof s.target!=='string'||!s.target.startsWith('$')||!identifier.test(s.target.slice(1)))throw Error('Call target must reference a named deployment or pinned external.');if(typeof s.method!=='string'||s.method.length===0||s.method.length>256||!Array.isArray(s.args))throw Error('Choose an ABI method and argument array.');
   config.steps.push({kind:'call',name:s.name,target:s.target,method:s.method,args:cleanArgs(s.args),value:wei(s.value)});names.add(s.name);
  }else throw Error('Unknown deployment step kind.');
 }
 return config;
}

function loadArtifact(directory,n){
 name(n,'artifact name');const location=path.join(directory,n+'.json'),a=JSON.parse(fs.readFileSync(location,'utf8'));
 if(a.contractName!==n||!Array.isArray(a.abi)||typeof a.sourceName!=='string')throw Error('Artifact identity mismatch: '+n);
 if(typeof a.compiler!=='string'||!a.compiler.startsWith(a.metadata?.compiler?.version||'MISSING'))throw Error('Artifact compiler identity mismatch: '+n);
 if(!['shanghai','cancun'].includes(a.metadata?.settings?.evmVersion))throw Error('Unsupported artifact EVM target: '+n);
 return a;
}
function deploymentArtifact(a){
 if(!a.sourceName.startsWith('contracts/src/extensions/'))throw Error('New extension plans may deploy only extension source contracts; preserve the sealed Genesis core.');
 if(!/^0x(?:[0-9a-fA-F]{2})+$/.test(a.bytecode)||!/^0x(?:[0-9a-fA-F]{2})+$/.test(a.deployedBytecode))throw Error('Missing, empty or unlinked deployment bytecode.');
 if((a.deployedBytecode.length-2)/2>24576)throw Error('EIP-170 runtime size exceeded.');
 if(!a.immutableReferences||typeof a.immutableReferences!=='object'||Array.isArray(a.immutableReferences))throw Error('Compile artifacts with immutableReferences for all contracts before planning.');
 for(const positions of Object.values(a.immutableReferences)){if(!Array.isArray(positions))throw Error('Malformed immutable references.');for(const r of positions){safe(r.start,0,(a.deployedBytecode.length-2)/2-1,'immutable offset');safe(r.length,1,32,'immutable width');if((r.start+r.length)*2>a.deployedBytecode.length-2)throw Error('Immutable region exceeds runtime.');}}
}
function resolve(v,bindings){
 if(typeof v==='string'&&v.startsWith('$')){const key=v.slice(1);if(!Object.hasOwn(bindings,key))throw Error('Unresolved or forward deployment dependency: '+v);return bindings[key].address;}
 if(Array.isArray(v))return v.map(x=>resolve(x,bindings));
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolve(x,bindings)]));
 return v;
}

export async function prepareExtensionsDeployment(input,{artifactDirectory=path.join(root,'contracts/artifacts')}={}){
 if(path.resolve(artifactDirectory)===path.join(root,'contracts/artifacts'))verifyCompilation(root);
 const config=validateExtensionsDeploymentConfig(input),bindings={...config.externals},directory={},requests=[],artifacts={},loaded=new Map();let totalValue=0n;
 const artifact=n=>{if(!loaded.has(n)){const a=loadArtifact(artifactDirectory,n);loaded.set(n,a);artifacts[n]={sourceName:a.sourceName,compiler:a.compiler,evmVersion:a.metadata.settings.evmVersion,artifactHash:digest(a)};}return loaded.get(n);};
 for(const external of Object.values(config.externals))artifact(external.contractName);
 for(const s of config.steps){
  const nonce=config.startingNonce+requests.length,args=resolve(s.args,bindings);let transaction,request;
  if(s.kind==='deploy'){
   const a=artifact(s.contractName);deploymentArtifact(a);if(s.value!=='0'&&a.abi.find(x=>x.type==='constructor')?.stateMutability!=='payable')throw Error('Native value attached to nonpayable constructor.');const deploy=await new ContractFactory(a.abi,a.bytecode).getDeployTransaction(...args,{value:BigInt(s.value)});
   if((deploy.data.length-2)/2>49152)throw Error('EIP-3860 initcode size exceeded.');
   const address=getCreateAddress({from:config.deployer,nonce});bindings[s.name]={address,contractName:s.contractName};
   directory[s.name]={address,contractName:s.contractName,sourceName:a.sourceName,creationDataHash:keccak256(deploy.data),runtimeTemplateHash:keccak256(a.deployedBytecode),runtimeCodeHash:null,verification:'requires-successful-deployment-receipt-and-runtime-read'};
   transaction={chainId:config.chainId,from:config.deployer,nonce,data:deploy.data,value:s.value};request={id:s.name,kind:'create',contractName:s.contractName,address,args,transaction,dataHash:keccak256(deploy.data)};
  }else{
   const target=bindings[s.target.slice(1)];if(!target)throw Error('Unknown or forward call target: '+s.target);const a=artifact(target.contractName),iface=new Interface(a.abi),method=iface.getFunction(s.method);if(!method||['pure','view'].includes(method.stateMutability))throw Error('Configuration step must call a mutating ABI function.');if(s.value!=='0'&&method.stateMutability!=='payable')throw Error('Native value attached to nonpayable function.');
   const data=iface.encodeFunctionData(method,args);transaction={chainId:config.chainId,from:config.deployer,nonce,to:target.address,data,value:s.value};request={id:s.name,kind:'call',contractName:target.contractName,method:method.format('sighash'),args,transaction,dataHash:keccak256(data)};
  }
  totalValue+=BigInt(s.value);if(totalValue>MAX256)throw Error('Total native commitment exceeds uint256.');requests.push(request);
 }
 const plan={schema:'anima.extensions-deployment-plan/1',status:'unsigned-offline-preparation',config,artifacts,requests,directory,summary:{transactions:requests.length,deployments:Object.keys(directory).length,nextNonce:config.startingNonce+requests.length,totalValueWei:String(totalValue),gasAndFees:'unestimated',chainState:'not-read',coreManifest:'unchanged',runtimeHashes:'pending receipt verification'}};
 return {...plan,planHash:digest(plan)};
}

export async function verifyExtensionsDeploymentPlan(plan,options={}){
 if(plan?.schema!=='anima.extensions-deployment-plan/1')throw Error('Unsupported extension plan.');
 const expected=await prepareExtensionsDeployment(plan.config,options);if(canonical(expected)!==canonical(plan))throw Error('Extension plan differs from canonical reconstruction.');return expected;
}

function maskImmutables(code,a){const bytes=Buffer.from(code.slice(2),'hex');for(const spans of Object.values(a.immutableReferences))for(const {start,length} of spans)bytes.fill(0,start,start+length);return '0x'+bytes.toString('hex');}

/** Read-only post-deployment verification. All transaction hashes must be supplied explicitly.
 * Produces observed runtime pins, never substitutes a constructor template hash for a real codehash.
 */
export async function verifyExtensionsDeploymentReceipts(plan,provider,transactionHashes,{artifactDirectory=path.join(root,'contracts/artifacts'),confirmations=1}={}){
 await verifyExtensionsDeploymentPlan(plan,{artifactDirectory});safe(confirmations,1,100000,'confirmations');
 if(BigInt((await provider.getNetwork()).chainId)!==BigInt(plan.config.chainId))throw Error('Wrong verification chain.');
 if(!transactionHashes||typeof transactionHashes!=='object'||Array.isArray(transactionHashes)||Object.keys(transactionHashes).length!==plan.requests.length||Object.keys(transactionHashes).some(id=>!plan.requests.some(r=>r.id===id)))throw Error('Supply exactly one transaction hash for every planned request.');
 const latest=await provider.getBlock('latest');if(!latest?.hash)throw Error('Missing verification block.');const directory={},verifiedRequests=[];
 for(const [n,e] of Object.entries(plan.config.externals)){const code=await provider.getCode(e.address,latest.number);if(code==='0x'||keccak256(code)!==e.runtimeCodeHash)throw Error('External contract runtime changed: '+n);}
 for(const request of plan.requests){
  const hash=hex32(transactionHashes[request.id],'transaction hash'),[tx,receipt]=await Promise.all([provider.getTransaction(hash),provider.getTransactionReceipt(hash)]);
  if(!tx||!receipt||receipt.status!==1||!receipt.blockHash||latest.number-receipt.blockNumber+1<confirmations)throw Error('Missing, failed or insufficiently confirmed transaction: '+request.id);
  const actualBlock=await provider.getBlock(receipt.blockNumber);if(actualBlock?.hash!==receipt.blockHash)throw Error('Receipt block changed: '+request.id);
  const planned=request.transaction;
  if(getAddress(tx.from)!==getAddress(planned.from)||tx.nonce!==planned.nonce||BigInt(tx.chainId)!==BigInt(planned.chainId)||tx.data.toLowerCase()!==planned.data.toLowerCase()||BigInt(tx.value)!==BigInt(planned.value)||(tx.to?getAddress(tx.to):null)!==(planned.to?getAddress(planned.to):null))throw Error('Receipt transaction does not match reviewed request: '+request.id);
  if(request.kind==='create'){
   if(!receipt.contractAddress||getAddress(receipt.contractAddress)!==request.address)throw Error('Unexpected deployed address: '+request.id);
   const a=loadArtifact(artifactDirectory,request.contractName),code=await provider.getCode(request.address,latest.number);deploymentArtifact(a);
   if(code.length!==a.deployedBytecode.length||maskImmutables(code,a)!==maskImmutables(a.deployedBytecode,a))throw Error('Runtime does not match the reviewed compiler template: '+request.id);
   directory[request.id]={address:request.address,contractName:request.contractName,sourceName:a.sourceName,runtimeCodeHash:keccak256(code),runtimeBytes:(code.length-2)/2,deploymentTransaction:hash,deploymentBlock:receipt.blockNumber,deploymentBlockHash:receipt.blockHash};
  }
  verifiedRequests.push({id:request.id,hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash});
 }
 if((await provider.getBlock(latest.number))?.hash!==latest.hash)throw Error('Verification anchor block changed.');
 return {schema:'anima.extensions-directory/1',chainId:plan.config.chainId,planHash:plan.planHash,blockNumber:latest.number,blockHash:latest.hash,confirmations,coreManifest:'unchanged',modules:directory,externals:plan.config.externals,verifiedRequests};
}
