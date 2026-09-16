/** Public deployment plans and journals. Never reads a key or submits a transaction. */
import {ContractFactory,Interface,getCreateAddress,keccak256,getBytes,hexlify} from 'ethers';
import {asBytes,sha256,planChunks,canonicalJSON,hashValue,verifyArchive} from './core.mjs';
import {FACTORY_ABI,ARCHIVE_ABI,RELEASE_ABI,readCall,pinSnapshot,assertSnapshot,recoverArchiveBytes,encodePublish,descriptorFromManifest} from './chain.mjs';
const factoryInterface=new Interface(FACTORY_ABI);
const cleanAddress=a=>{if(typeof a!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(a)||/^0x0+$/.test(a))throw Error('Invalid deployment address');return a.toLowerCase();};
const nonce=n=>{if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid deployment nonce');return n;};

export async function planArchiveDeployment({archive,publisher,chainId,startNonce,factory,factoryNonce,appChunkArtifact,existingChunks={}}){
 const bytes=asBytes(archive),plan=planChunks(bytes,{existing:existingChunks}),from=cleanAddress(publisher),factoryAddress=cleanAddress(factory);let txNonce=nonce(startNonce),creationNonce=nonce(factoryNonce);
 if(!appChunkArtifact?.abi||!/^0x[0-9a-fA-F]+$/.test(appChunkArtifact.bytecode))throw Error('Compiled AppChunk artifact required');
 const constructor=new ContractFactory(appChunkArtifact.abi,appChunkArtifact.bytecode),steps=[],locations=new Map();
 for(const chunk of plan.chunks){if(chunk.reused){locations.set(chunk.hash,chunk.address);continue;}
  const data=(await constructor.getDeployTransaction(hexlify(chunk.payload))).data;if((data.length-2)/2>49152)throw Error('Chunk creation code exceeds initcode bound');
  const expectedAddress=getCreateAddress({from,nonce:txNonce}).toLowerCase();locations.set(chunk.hash,expectedAddress);
  steps.push({id:'chunk:'+chunk.hash,kind:'chunk',from,to:null,nonce:txNonce++,chainId:String(BigInt(chainId)),value:'0',data,expectedAddress,expectedCodeHash:keccak256(hexlify(new Uint8Array([0,...chunk.payload]))),payloadHash:chunk.hash,payloadBytes:chunk.bytes});
 }
 const addresses=plan.references.map(hash=>locations.get(hash));
 function wrapper(method,args,hash,length,schema){const expectedAddress=getCreateAddress({from:factoryAddress,nonce:creationNonce++}).toLowerCase();steps.push({id:'archive:'+expectedAddress,kind:method,from,to:factoryAddress,nonce:txNonce++,chainId:String(BigInt(chainId)),value:'0',data:factoryInterface.encodeFunctionData(method,args),expectedAddress,archiveHash:hash,archiveBytes:length,archiveSchema:schema});return expectedAddress;}
 let archiveAddress,archiveSchema;
 if(addresses.length<=64){archiveSchema=1;archiveAddress=wrapper('createArchive',[addresses,sha256(bytes)],sha256(bytes),bytes.length,1);}
 else {archiveSchema=2;const leaves=[];for(let n=0;n<addresses.length;n+=32){const subset=addresses.slice(n,n+32),part=bytes.slice(n*23000,Math.min((n+32)*23000,bytes.length));leaves.push(wrapper('createArchive',[subset,sha256(part)],sha256(part),part.length,1));}archiveAddress=wrapper('createDirectory',[leaves,sha256(bytes)],sha256(bytes),bytes.length,2);}
 return {schema:'anima.module-deployment-plan/1',chainId:String(BigInt(chainId)),publisher:from,factory:factoryAddress,startNonce:nonce(startNonce),factoryNonce:nonce(factoryNonce),nextNonce:txNonce,nextFactoryNonce:creationNonce,archiveAddress,archiveSchema,archiveHash:sha256(bytes),archiveBytes:bytes.length,chunkReferences:plan.references,chunks:plan.chunks.map(({payload,...c})=>({...c,address:locations.get(c.hash)})),deployBytes:plan.deployBytes,steps,artifactHash:sha256(appChunkArtifact.bytecode)};
}

/** Validate chain-dependent preconditions immediately before reviewing the first step. */
export async function validateDeploymentPlan(request,plan){
 if(plan.schema!=='anima.module-deployment-plan/1')throw Error('Unsupported deployment plan');const snapshot=await pinSnapshot(request,plan.chainId);
 const txNonce=Number(BigInt(await request({method:'eth_getTransactionCount',params:[plan.publisher,'pending']}))),factoryNonce=Number(BigInt(await request({method:'eth_getTransactionCount',params:[plan.factory,snapshot.block]})));
 if(txNonce!==plan.startNonce||factoryNonce!==plan.factoryNonce)throw Error('Deployment nonce conflict; regenerate the unsigned plan');
 const factoryCode=await request({method:'eth_getCode',params:[plan.factory,snapshot.block]});if(factoryCode==='0x')throw Error('Archive factory is not deployed');if(plan.factoryCodeHash&&keccak256(factoryCode)!==plan.factoryCodeHash)throw Error('Archive factory code differs from the reviewed plan');
 for(const chunk of plan.chunks){const code=await request({method:'eth_getCode',params:[chunk.address,snapshot.block]});if(chunk.reused){const bytes=getBytes(code);if(bytes.length!==chunk.bytes+1||bytes[0]!==0||sha256(bytes.slice(1))!==chunk.hash)throw Error('Reused chunk content conflict');}else if(code!=='0x')throw Error('Planned chunk address is already occupied');}
 await assertSnapshot(request,snapshot);return snapshot;
}

export async function preparePublishRecipe({request,chainId,registry,manifest,archiveAddress,archiveSchema}){
 const snapshot=await pinSnapshot(request,chainId),code=await request({method:'eth_getCode',params:[cleanAddress(archiveAddress),snapshot.block]});if(code==='0x')throw Error('Publish requires deployed archive bytes');
 const [length]=await readCall(request,snapshot,archiveAddress,ARCHIVE_ABI,'byteLength',[],32),[hash]=await readCall(request,snapshot,archiveAddress,ARCHIVE_ABI,'contentSha256',[],32);
 if(Number(length)!==manifest.archive.storedBytes||hash!==manifest.archive.storedHash)throw Error('Deployed archive differs from package');
 const descriptor=descriptorFromManifest(manifest,archiveAddress,archiveSchema,keccak256(code));const [factory]=await readCall(request,snapshot,registry,RELEASE_ABI,'archiveFactory',[],32);await readCall(request,snapshot,factory,FACTORY_ABI,'validateArchive',[descriptor],32);const stored=await recoverArchiveBytes({request,snapshot,descriptor});await verifyArchive(manifest,stored);await assertSnapshot(request,snapshot);return {...encodePublish({chainId,registry,manifest,descriptor}),snapshot,descriptor};
}

export function createDeploymentJournal(plan){return {schema:'anima.module-deployment-journal/1',chainId:plan.chainId,planHash:sha256(canonicalJSON(plan)),plan,completed:[]};}
export function appendDeploymentReceipt(journal,{stepId,transactionHash,blockNumber,blockHash,status,contractAddress}){
 if(journal.schema!=='anima.module-deployment-journal/1'||sha256(canonicalJSON(journal.plan))!==journal.planHash)throw Error('Deployment journal plan changed');
 const expected=journal.plan.steps[journal.completed.length];if(!expected||expected.id!==stepId)throw Error('Out-of-order or duplicate deployment receipt');
 hashValue(transactionHash);hashValue(blockHash);if(BigInt(status)!==1n)throw Error('Failed deployment transaction');if(expected.to===null&&cleanAddress(contractAddress)!==expected.expectedAddress)throw Error('Created address differs from deployment plan');
 const receipt={stepId,transactionHash,blockNumber:String(BigInt(blockNumber)),blockHash,status:'1',contractAddress:contractAddress?.toLowerCase()??null};return {...journal,completed:[...journal.completed,receipt]};
}

/** Rebuild trust from RPC receipts/transactions/code, not from saved success labels. */
export async function reconcileDeploymentJournal(request,journal){
 if(journal.schema!=='anima.module-deployment-journal/1'||sha256(canonicalJSON(journal.plan))!==journal.planHash)throw Error('Deployment journal plan changed');const snapshot=await pinSnapshot(request,journal.chainId);
 for(let n=0;n<journal.completed.length;n++){const saved=journal.completed[n],step=journal.plan.steps[n];if(saved.stepId!==step.id)throw Error('Journal step conflict');
  const receipt=await request({method:'eth_getTransactionReceipt',params:[saved.transactionHash]}),tx=await request({method:'eth_getTransactionByHash',params:[saved.transactionHash]});
  if(!receipt||BigInt(receipt.status)!==1n||receipt.blockHash?.toLowerCase()!==saved.blockHash||String(BigInt(receipt.blockNumber))!==saved.blockNumber)throw Error('Saved receipt is missing or changed');
  const block=await request({method:'eth_getBlockByNumber',params:[receipt.blockNumber,false]});if(block?.hash?.toLowerCase()!==saved.blockHash)throw Error('Saved receipt was reorganized');
  if(!tx||tx.from?.toLowerCase()!==step.from||((tx.to??null)?.toLowerCase()??null)!==step.to||Number(BigInt(tx.nonce))!==step.nonce||tx.input?.toLowerCase()!==step.data.toLowerCase()||BigInt(tx.value)!==0n)throw Error('Saved transaction differs from unsigned plan');
  const code=await request({method:'eth_getCode',params:[step.expectedAddress,snapshot.block]});if(code==='0x'||(step.expectedCodeHash&&keccak256(code)!==step.expectedCodeHash))throw Error('Deployed code conflicts with journal');
  if(step.archiveHash){const [hash]=await readCall(request,snapshot,step.expectedAddress,ARCHIVE_ABI,'contentSha256',[],32),[length]=await readCall(request,snapshot,step.expectedAddress,ARCHIVE_ABI,'byteLength',[],32);if(hash!==step.archiveHash||Number(length)!==step.archiveBytes)throw Error('Deployed archive conflicts with journal');}
 }
 const nextStep=journal.plan.steps[journal.completed.length]??null;
 if(nextStep){const pending=Number(BigInt(await request({method:'eth_getTransactionCount',params:[journal.plan.publisher,'pending']})));if(pending!==nextStep.nonce)throw Error('Resume nonce conflict; reconcile external transactions first');const completedWrappers=journal.plan.steps.slice(0,journal.completed.length).filter(s=>s.kind!=='chunk').length;const factoryNonce=Number(BigInt(await request({method:'eth_getTransactionCount',params:[journal.plan.factory,snapshot.block]})));if(factoryNonce!==journal.plan.factoryNonce+completedWrappers)throw Error('Archive factory nonce changed; regenerate remaining plan');}
 await assertSnapshot(request,snapshot);return {snapshot,verifiedSteps:journal.completed.length,nextStep,complete:nextStep===null};
}

export async function verifyPackageForDeployment(manifest,archive){await verifyArchive(manifest,archive);return true;}
