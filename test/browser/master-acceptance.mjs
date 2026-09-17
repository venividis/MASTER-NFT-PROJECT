#!/usr/bin/env node
/** Complete Genesis mint -> recovered original UI/cartridge -> workbench migration/journal.
 * Only disposable local-chain funds. --fixture-only never imports or launches a browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ganache from 'ganache';
import {BrowserProvider,Contract,ZeroHash,keccak256,toUtf8Bytes,toUtf8String} from 'ethers';
import {deployGenesis} from '../../scripts/lib/genesis-stack.mjs';
import {deployModuleSystem} from '../../scripts/lib/modules-stack.mjs';
import {loadArtifact} from '../../scripts/lib/deploy-stack.mjs';
import {verifyCompilation} from '../../scripts/lib/compiler-artifacts.mjs';
import {verifyBuild} from '../../scripts/lib/runtime-graph.mjs';
import {candidateInputSnapshot,candidateInputChanges} from '../../scripts/lib/local-validation.mjs';
import {readWorkbenchBuild} from '../../scripts/lib/modules-deployment.mjs';
import {recoverWorkbench} from '../../scripts/modules-recover-workbench.mjs';
import {recoverArchive} from '../../web/confluence/chain-loader.mjs';
import {createStaticServer} from '../../scripts/lib/static-server.mjs';
import {examplePackage} from '../../web/modules/examples.mjs';
import {decryptJournalPacket,parseJournalPacket} from '../../web/modules/journal.mjs';
import * as sdk from '../../packages/modules/sdk.mjs';

const root=path.resolve(import.meta.dirname,'../..'),args=process.argv.slice(2);
if(args.includes('--help')){console.log('Usage: node test/browser/master-acceptance.mjs [--fixture-only] [--output=DIRECTORY]\nRequires current compile/build/archive outputs. Chromium runs only in normal mode.');process.exit(0);}
if(args.some(a=>a!=='--fixture-only'&&!a.startsWith('--output=')))throw Error('Unknown acceptance option');
const fixtureOnly=args.includes('--fixture-only'),output=path.resolve(args.find(a=>a.startsWith('--output='))?.slice(9)??path.join(root,'reports/production/master-browser'));
fs.mkdirSync(output,{recursive:true});
const run=fs.mkdtempSync(path.join(output,new Date().toISOString().replaceAll(':','-')+'-'));
const file=path.join(run,'results.json'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={schema:'anima.master-browser/1',startedAt:new Date().toISOString(),status:'running',fixtureOnly,browserExecuted:false,cases:[],transactions:[],measurements:{},
  scope:'Actual Chromium interactions with the complete onchain Genesis runtime and recovered workbench on a disposable local EVM.',
  limits:['Injected local EIP-1193 provider, not an extension or hardware wallet.','Heap values are sampled main-page JavaScript heap, not total browser/process/worker memory or a guaranteed peak.','Local RPC/gas/timing observations do not predict public-chain fees, latency or physical-device performance.','No public deployment or independent security audit.']};
const save=()=>fs.writeFileSync(file,JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
let rpc,provider,browser,context,server,inputs,timer,interrupted=false;
const stop=signal=>{interrupted=true;report.interruption=signal;};
const sigint=()=>stop('SIGINT'),sigterm=()=>stop('SIGTERM');
process.once('SIGINT',sigint);process.once('SIGTERM',sigterm);
const phase=name=>{if(interrupted)throw Error('Acceptance interrupted');report.phase=name;save();};
const checkInputs=()=>{const after=candidateInputSnapshot(root);report.candidate.afterSha256=after.sha256;report.candidate.changes=candidateInputChanges(inputs,after);assert.equal(after.sha256,inputs.sha256,'Authored candidate changed during acceptance');};
save();

async function execute(){
  phase('verify-and-mint-full-genesis');
  const compiler=verifyCompilation(root);verifyBuild(root);
  const workbench=readWorkbenchBuild(path.join(root,'onchain-app/module-workbench/manifest.json'),root);
  inputs=candidateInputSnapshot(root);
  report.candidate={authoredInputSha256:inputs.sha256,compilerInputSha256:compiler.compilerInputSha256,
    workbenchSha256:hash(fs.readFileSync(path.join(root,'onchain-app/module-workbench/index.html'))),runnerSha256:hash(fs.readFileSync(import.meta.filename))};
  rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},miner:{blockGasLimit:100000000,timestampIncrement:1},wallet:{deterministic:true,totalAccounts:3,defaultBalance:1000},logging:{quiet:true}});
  provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
  const owner=await provider.getSigner(),ownerAddress=(await owner.getAddress()).toLowerCase(),request=p=>rpc.request(p);
  const started=performance.now(),genesis=await deployGenesis({rpc,provider,signer:owner,seedMarket:false});
  const collection=new Contract(genesis.collection,loadArtifact('IDontFuckingBelieveIt').abi,owner),account=new Contract(genesis.account,loadArtifact('SovereignAccount').abi,owner);
  const initial=await collection.renderSnapshot(1),mintBlock=await provider.getBlockNumber();
  const originalAddresses=[genesis.collection,genesis.account,genesis.modules.ConfluenceRenderer,genesis.modules.OnchainModuleDirectory];
  const originalCode=await Promise.all(originalAddresses.map(a=>provider.getCode(a)));
  const metadataBefore=JSON.parse(Buffer.from((await collection.tokenURI(1,{gasLimit:90000000})).split(',')[1],'base64'));
  phase('add-modules-after-mint');
  const system=await deployModuleSystem({provider,signer:owner,collection:genesis.collection,workbenchBytes:fs.readFileSync(path.join(root,'onchain-app/module-workbench/index.html'))});
  assert.ok((await system.factory.deploymentTransaction().wait()).blockNumber>mintBlock);
  const packed=await examplePackage('aurora-notebook',{publisher:ownerAddress}),v1=await system.publish(packed);
  const garden=await system.publish(await examplePackage('resonant-garden',{publisher:ownerAddress}));
  const oldValue={notebook:{note:'The first saved branch — 🫧'}},gardenValue={dedication:{dedication:'A separate namespace'}};
  await system.install(1,v1,oldValue);await system.install(1,garden,gardenValue);
  const oldHead=(await system.modules.installation(1,v1.moduleKey)).stateHead,gardenHead=(await system.modules.installation(1,garden.moduleKey)).stateHead;
  const v2=await system.publish(await sdk.packageFiles(packed.files,{...packed.manifest,version:2,predecessor:v1.releaseId,stateSchema:sdk.sha256('aurora-notebook:state:2')},{compression:'raw'}));
  assert.equal(v2.deployedChunkCount,0,'An unchanged payload must reuse its immutable archive');

  const game=fs.readFileSync(path.join(root,'web/cartridges/lumen-drift.html'),'utf8');
  const legacyHTML=game+'<!--'+' '.repeat(49152-Buffer.byteLength(game)-7)+'-->',legacyBytes=toUtf8Bytes(legacyHTML);
  const legacyArchive=await system.createArchive(legacyBytes,'legacy-browser-48k');
  assert.equal(legacyArchive.chunks.length,3);
  const manifest=JSON.stringify({spec:'awe.cartridge/1',name:'Lumen Drift · 48 KiB',version:'1',engine:'html',entry:'onchain',contentHash:sdk.sha256(legacyBytes),capabilities:[]});
  await(await system.cartridges.publishRelease(manifest,legacyArchive.chunks,sdk.sha256(legacyBytes))).wait();
  await(await account.execute(system.cartridges.target,0,system.cartridges.interface.encodeFunctionData('acquire',[1]))).wait();
  assert.equal(toUtf8String(await system.cartridges.contentOf(1)),legacyHTML);
  const viewCall={to:system.cartridges.target,data:system.cartridges.interface.encodeFunctionData('contentOf',[1])};
  report.measurements.legacy={htmlBytes:legacyBytes.length,chunks:3,abiResponseBytes:(await provider.call(viewCall)).length/2-1,viewGas:String(await provider.estimateGas(viewCall))};
  // Exercise the actual advertised legacy ceiling as well as the 48 KiB proof.
  // Identical padding chunks are reused; the old host still reads the full HTML.
  const maximumHTML=game+'<!--'+' '.repeat(1048576-Buffer.byteLength(game)-7)+'-->',maximumBytes=toUtf8Bytes(maximumHTML);
  const maximumArchive=await system.createArchive(maximumBytes,'legacy-browser-1m');
  await(await system.cartridges.publishRelease(JSON.stringify({...JSON.parse(manifest),name:'Lumen Drift · 1 MiB',version:'2',contentHash:sdk.sha256(maximumBytes)}),maximumArchive.chunks,sdk.sha256(maximumBytes))).wait();
  await(await account.execute(system.cartridges.target,0,system.cartridges.interface.encodeFunctionData('acquire',[2]))).wait();
  const maximumCall={to:system.cartridges.target,data:system.cartridges.interface.encodeFunctionData('contentOf',[2])},maximumResponse=await provider.call(maximumCall);
  assert.equal(toUtf8String(system.cartridges.interface.decodeFunctionResult('contentOf',maximumResponse)[0]),maximumHTML);
  report.measurements.maximumLegacy={htmlBytes:maximumBytes.length,chunks:maximumArchive.chunks.length,abiResponseBytes:maximumResponse.length/2-1,viewGas:String(await provider.estimateGas(maximumCall))};
  phase('recover-both-complete-documents');
  const recoverStart=performance.now();
  const original=await recoverArchive(request,{runtime:genesis.modules.OnchainModuleDirectory,chainId:31337,sha256:genesis.runtimeSha256,archiveVersion:genesis.archiveVersion});
  assert.equal(original,fs.readFileSync(path.join(root,'onchain-app/confluence/runtime.html'),'utf8'));
  const recovered=await recoverWorkbench({request,chainId:31337,workbench:system.workbench.target,tokenId:1,expectedHash:'0x'+report.candidate.workbenchSha256});
  assert.equal(Buffer.from(recovered.bytes).compare(fs.readFileSync(path.join(root,'onchain-app/module-workbench/index.html'))),0);
  report.measurements.recovery={milliseconds:Math.round(performance.now()-recoverStart),originalBytes:Buffer.byteLength(original),workbenchBytes:recovered.bytes.length};
  report.measurements.fixtureMilliseconds=Math.round(performance.now()-started);
  report.fixture={status:'passed',collection:genesis.collection,account:genesis.account,workbench:system.workbench.target,registry:system.modules.target,mintBlock,
    moduleDeploymentBlock:(await system.factory.deploymentTransaction().wait()).blockNumber,runtimeSha256:genesis.runtimeSha256,workbenchSha256:recovered.record.sha256,
    installedModules:2,v1:v1.releaseId,v2:v2.releaseId,reusedUpdatePayload:true};
  if(fixtureOnly){report.status='incomplete';report.reason='Fixture/recovery only; no browser imported or executed.';checkInputs();return;}

  phase('browser-setup');
  const served=path.join(run,'served');fs.mkdirSync(served);
  fs.writeFileSync(path.join(served,'original.html'),original);fs.writeFileSync(path.join(served,'index.html'),recovered.bytes);
  server=createStaticServer({directory:served});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port,{chromium}=await import('playwright');
  browser=await chromium.launch({timeout:30000});report.browser=browser.version();report.browserExecuted=true;
  context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});context.setDefaultTimeout(25000);
  const pages=new Set(),errors=[],external=[],methods=new Set(['eth_requestAccounts','eth_accounts','eth_chainId','net_version','eth_blockNumber','eth_getBalance','eth_getCode','eth_getBlockByNumber','eth_call','eth_estimateGas','eth_getTransactionCount','eth_gasPrice','eth_maxPriorityFeePerGas','eth_getTransactionByHash','eth_getTransactionReceipt','eth_sendTransaction']);
  let approval=null,rpcCalls=0,responseBytes=0;
  await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith('data:')||u.startsWith('blob:')||new URL(u).origin===origin)return route.continue();external.push(u);return route.abort();});
  await context.exposeBinding('__masterRpc',async(source,payload)=>{
    assert.ok(pages.has(source.page)&&source.frame===source.page.mainFrame());assert.equal(new URL(source.frame.url()).origin,origin);
    assert.ok(methods.has(payload.method));assert.ok(payload.params===undefined||Array.isArray(payload.params));rpcCalls++;
    if(['eth_requestAccounts','eth_accounts'].includes(payload.method))return[ownerAddress];
    if(payload.method==='eth_sendTransaction'){
      const expected=approval;approval=null;assert.ok(expected,'No send without the explicit reviewed click');
      const tx=payload.params[0];assert.equal(tx.from.toLowerCase(),ownerAddress);assert.equal(tx.to.toLowerCase(),expected.to.toLowerCase());
      assert.equal((tx.data??tx.input).toLowerCase(),expected.data.toLowerCase());assert.equal(BigInt(tx.value??0),0n);
      const txHash=await request(payload);report.transactions.push({...expected,hash:txHash});save();return txHash;
    }
    const result=await request({...payload,params:payload.params??[]});responseBytes+=Buffer.byteLength(JSON.stringify(result));return result;
  });
  await context.addInitScript(()=>{if(window!==window.top)return;const listeners=new Map();Object.defineProperty(window,'ethereum',{value:Object.freeze({request:p=>window.__masterRpc(p),on:(n,f)=>{if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f);},removeListener:(n,f)=>listeners.get(n)?.delete(f)})});});
  const newPage=async()=>{const p=await context.newPage();pages.add(p);p.on('pageerror',e=>errors.push(e.message));return p;};
  const check=async(name,task)=>{const c={name,status:'running'};report.cases.push(c);phase(name);try{await task(c);c.status='passed';}catch(e){c.status='failed';c.error=e.stack??String(e);throw e;}finally{save();}};
  const originalPage=await newPage(),page=await newPage(),cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  const samples=[];const sample=async(label)=>{const m=await cdp.send('Performance.getMetrics');const get=n=>m.metrics.find(x=>x.name===n)?.value;samples.push({label,jsHeapUsedBytes:get('JSHeapUsedSize'),jsHeapTotalBytes:get('JSHeapTotalSize'),nodes:get('Nodes'),frames:get('Frames')});};
  const atlas=async()=>{const entry=originalPage.locator('[data-genesis="atlas"]');if(await entry.isVisible())await entry.click();else await originalPage.locator('.cf-dock [data-cf="atlas"]').click();await originalPage.waitForFunction(()=>window.__confluence?.mode()==='atlas');};
  for(const cartridge of [{id:'1',label:'48-kib',html:legacyHTML,bytes:legacyBytes},{id:'2',label:'1-mib',html:maximumHTML,bytes:maximumBytes}])await check('full-minted-runtime-launches-and-closes-'+cartridge.label+'-legacy-game',async c=>{
    const before=performance.now();await originalPage.goto(origin+'/original.html');await originalPage.waitForFunction(()=>window.__idfbi?.renderer.frames>0);
    await atlas();await originalPage.locator('[data-do="nav:connect"]').click();await originalPage.locator('#cf-collection').fill(genesis.collection);await originalPage.locator('#cf-token').fill('1');
    await originalPage.locator('#cf-connect-form button[type="submit"]').click();await originalPage.waitForFunction(()=>window.__confluence.wallet.connected);
    await atlas();await originalPage.locator('[data-do="nav:cartridges"]').click();await originalPage.locator('#cf-cartridge-registry').fill(system.cartridges.target);await originalPage.locator('#cf-cartridge-id').fill(cartridge.id);
    await originalPage.locator('[data-do="load-cartridge"]').click();const frame=originalPage.frameLocator('#cf-game-frame');await frame.getByRole('heading',{name:'Lumen Drift',exact:true}).waitFor();
    assert.equal(await frame.locator('body').evaluate(()=>typeof window.ethereum),'undefined');
    assert.equal(await originalPage.locator('#cf-game-frame').getAttribute('sandbox'),'allow-scripts allow-pointer-lock');
    assert.ok((await originalPage.locator('#cf-game-frame').getAttribute('srcdoc')).endsWith(cartridge.html));
    await frame.locator('canvas').click({position:{x:100,y:160}});await frame.locator('#message').evaluate(node=>{if(node.textContent!=='')throw Error('Game input did not execute');});
    assert.ok(await frame.locator('canvas').evaluate(c=>c.width>0&&c.height>0&&[...c.getContext('2d').getImageData(0,0,8,8).data].some(v=>v>0)));
    await frame.getByRole('button',{name:'Restart',exact:true}).click();assert.match(await frame.locator('#message').textContent(),/Gather the light/);
    await originalPage.screenshot({path:path.join(run,'legacy-game-'+cartridge.label+'.png'),fullPage:true});
    await originalPage.locator('[data-do="nav:cartridges"]').click();assert.equal(await originalPage.locator('#cf-game-frame').count(),0);
    await originalPage.locator('#cf-close').click();await originalPage.locator('[data-genesis="interior"]').waitFor({state:'visible'});
    c.timeToPlayedGameMilliseconds=Math.round(performance.now()-before);c.htmlSha256=sdk.sha256(cartridge.bytes);assert.equal(report.transactions.length,0);
  });
  const idle=async({allowError=false}={})=>{await page.waitForFunction(()=>document.querySelector('#workbench')?.getAttribute('aria-busy')==='false');if(!allowError)assert.doesNotMatch(await page.locator('[data-node="status"]').getAttribute('class'),/am-error/,await page.locator('[data-node="status"]').textContent());};
  const action=async name=>{await page.locator(`[data-action="${name}"]`).click();await idle();};
  const choose=async releaseId=>{await page.locator('[data-form="recover"] input[name="releaseId"]').fill(releaseId);await page.locator('[data-form="recover"] button').click();await idle();};
  const review=()=>page.locator('[data-node="review-content"]').textContent().then(JSON.parse);
  const sign=async(operation,to,data)=>{
    const visible=await review();assert.equal(visible.transaction.to.toLowerCase(),to.toLowerCase());assert.equal(visible.transaction.data.toLowerCase(),data.toLowerCase());
    const previous=report.transactions.length;approval={operation,to,data};await action('confirm-review');assert.equal(approval,null);assert.equal(report.transactions.length,previous+1);
    const tx=report.transactions.at(-1),receipt=await request({method:'eth_getTransactionReceipt',params:[tx.hash]});assert.equal(BigInt(receipt.status),1n);
    const mined=await request({method:'eth_getTransactionByHash',params:[tx.hash]});assert.equal(mined.input.toLowerCase(),data.toLowerCase());
    assert.ok((await page.locator('[data-node="status"]').textContent()).includes(tx.hash));Object.assign(tx,{gasUsed:receipt.gasUsed,blockHash:receipt.blockHash});return receipt;
  };
  const moduleData=(method,values)=>account.interface.encodeFunctionData('execute',[system.modules.target,0,system.modules.interface.encodeFunctionData(method,values)]);
  const draft=async value=>{await page.locator('[data-node="migration-json"]').fill(JSON.stringify(value));await action('preview-migration');await action('commit-migration');await page.locator('[data-node="state-consent"]').check();};
  const stagedId=receipt=>{const state=new Contract(system.contracts.ModuleStateStore,loadArtifact('ModuleStateStore').abi,provider);return receipt.logs.filter(l=>l.address.toLowerCase()===state.target.toLowerCase()).map(l=>state.interface.parseLog(l)).find(l=>l?.name==='StateStaged')?.args.stateId;};
  const query=new URLSearchParams({chainId:'31337',collection:genesis.collection,tokenId:'1',registry:system.modules.target});
  await page.goto(origin+'/?'+query);await page.getByRole('button',{name:'Connect & read',exact:true}).click();await idle();await sample('connected');
  await check('reviewed-32-kib-migration-and-historical-state-branch',async c=>{
    await choose(v2.releaseId);await page.locator('.am-state > summary').click();
    await page.locator('[data-action="install"]').click();await idle({allowError:true});assert.equal(report.transactions.length,0);assert.equal((await system.modules.installation(1,v1.moduleKey)).releaseId,v1.releaseId);
    const value={note:'',position:{x:0.125,y:-2.75},volume:0.7};value.note='x'.repeat(32768-Buffer.byteLength(JSON.stringify(value)));assert.equal(Buffer.byteLength(JSON.stringify(value)),32768);await draft(value);
    await action('stage-state');const epoch=await account.sessionEpoch();const receipt=await sign('stage-v2',account.target,moduleData('stageState',[1,v1.moduleKey,await system.modules.rootOf(1),epoch,v2.manifest.stateSchema,toUtf8Bytes(JSON.stringify(value)),sdk.EMPTY_ARCHIVE]));
    const v2Head=stagedId(receipt);assert.ok(v2Head);assert.equal((await system.modules.installation(1,v1.moduleKey)).stateHead,oldHead);
    await action('install');await sign('activate-v2',account.target,moduleData('activate',[1,v2.releaseId,await system.modules.rootOf(1),epoch,oldHead,v2Head]));
    await sample('large-state-activated');
    await page.locator('[data-tab="history"]').click();await page.locator(`[data-node="history"] [data-release="${v1.releaseId}"][data-state-head="${oldHead}"]`).click();await idle();
    await action('restore-chain');assert.deepEqual(JSON.parse(await page.locator('[data-node="migration-json"]').inputValue()),oldValue);
    await action('preview-migration');assert.equal(await page.locator('[data-node="commit-migration"]').isEnabled(),true);
    await action('restore-chain');assert.equal(await page.locator('[data-node="commit-migration"]').isDisabled(),true,'Recovered data invalidates an older preview');
    await draft(oldValue);await action('stage-state');const branchReceipt=await sign('stage-historical-branch',account.target,moduleData('stageState',[1,v1.moduleKey,await system.modules.rootOf(1),epoch,v1.manifest.stateSchema,toUtf8Bytes(sdk.canonicalJSON(oldValue)),sdk.EMPTY_ARCHIVE]));
    const branch=stagedId(branchReceipt);assert.ok(branch);await action('install');await sign('activate-historical-branch',account.target,moduleData('activate',[1,v1.releaseId,await system.modules.rootOf(1),epoch,v2Head,branch]));
    await action('disable');await sign('disable-notebook',account.target,moduleData('disable',[1,v1.moduleKey,await system.modules.rootOf(1),epoch]));
    assert.equal((await system.modules.installation(1,garden.moduleKey)).stateHead,gardenHead);
    await choose(garden.releaseId);await action('launch');await page.frameLocator('[data-node="runtime-container"] iframe').getByRole('status').filter({hasText:'Isolated module ready'}).waitFor();await action('close-runtime');
    const token=await sdk.recoverToken({request,registry:system.modules.target,tokenId:1,chainId:31337});
    assert.equal(token.context.modules.length,2);assert.deepEqual(token.states.find(s=>s.stateId===oldHead).bytes,toUtf8Bytes(sdk.canonicalJSON(oldValue)));
    assert.deepEqual(token.states.find(s=>s.stateId===v2Head).bytes,toUtf8Bytes(JSON.stringify(value)));assert.deepEqual(token.states.find(s=>s.stateId===branch).bytes,toUtf8Bytes(sdk.canonicalJSON(oldValue)));
    c.stateHeads={original:oldHead,upgraded:v2Head,historicalBranch:branch};c.directStateBytes=32768;c.retainedStates=token.states.length;await sample('modules-closed');
  });
  await check('public-and-encrypted-personal-journal-inscription-and-recovery',async c=>{
    const memory=new Contract(genesis.modules.MemoryLedger,loadArtifact('MemoryLedger').abi,provider),form=page.locator('[data-form="journal"]');
    await page.locator('[data-tab="journal"]').click();await form.locator('[name="ledger"]').fill(memory.target);
    const entries=[];
    for(const mode of ['public','encrypted']){
      const text='  '+mode+' memory — exact 🫧\n',passphrase='Fixture-only encrypted journal passphrase';
      await form.locator('[name="mode"]').selectOption(mode);await form.locator('[name="text"]').fill(text);
      if(mode==='encrypted')await form.locator('[name="passphrase"]').fill(passphrase);
      await form.locator('[name="consent"]').check();const count=await memory.count();await form.locator('button[type="submit"]').click();await idle();
      assert.equal(await memory.count(),count);let intent=(await review()).action;
      if(mode==='public'){await action('cancel-review');assert.equal(await memory.count(),count);await form.locator('button[type="submit"]').click();await idle();intent=(await review()).action;}
      if(mode==='encrypted'){assert.ok(!intent.text.includes('encrypted memory'));assert.ok(!intent.text.includes(passphrase));parseJournalPacket(intent.text);assert.equal((await decryptJournalPacket(intent.text,passphrase)).text,text);assert.equal(await form.locator('[name="passphrase"]').inputValue(),'');}
      const data=memory.interface.encodeFunctionData('appendPersonal',[1,0,mode==='encrypted'?1:0,true,await memory.head(1),toUtf8Bytes(intent.text)]);
      await sign('journal-'+mode,memory.target,data);const entry=await memory.getEntry(count+1n);
      assert.equal(entry.author.toLowerCase(),ownerAddress);assert.equal(entry.executor.toLowerCase(),ownerAddress);assert.equal(entry.custodianAtTime.toLowerCase(),ownerAddress);assert.equal(entry.identity,1n);assert.equal(entry.mode,mode==='encrypted'?1n:0n);assert.equal(toUtf8String(entry.payload),intent.text);
      if(mode==='encrypted'){
        await page.locator('.am-journal-recovery > summary').click();await page.locator('[data-node="journal-packet"]').fill(toUtf8String(entry.payload));await page.locator('[data-node="recovery-passphrase"]').fill(passphrase);await action('decrypt-journal');
        assert.equal(JSON.parse(await page.locator('[data-node="journal-decrypted"]').textContent()).text,text);await action('clear-journal-preview');assert.equal(await page.locator('[data-node="journal-decrypted"]').isVisible(),false);
      }
      entries.push({entry:String(count+1n),mode,payloadSha256:sdk.sha256(toUtf8Bytes(intent.text))});
    }
    c.entries=entries;await sample('journal-recovered');await page.screenshot({path:path.join(run,'journal-recovery.png'),fullPage:true});
  });
  phase('final-identity-and-resource-checks');
  const final=await collection.renderSnapshot(1);
  for(const key of ['seed','genome','stateRoot','memoryRoot','lineageRoot','constitutionHash','bornAt','evolvedAt','generation','evolutions','parentId','sovereign','account','owner'])assert.equal(final[key],initial[key],key);
  assert.equal(await collection.totalSupply(),1n);assert.deepEqual(await Promise.all(originalAddresses.map(a=>provider.getCode(a))),originalCode);
  const metadataAfter=JSON.parse(Buffer.from((await collection.tokenURI(1,{gasLimit:90000000})).split(',')[1],'base64'));assert.equal(metadataAfter.animation_url,metadataBefore.animation_url);
  assert.equal(report.transactions.length,7);assert.equal(await account.instrumentGrantCount(),0n);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  report.measurements.browser={rpcCalls,responseBytes,samples,maxSampledMainPageJSHeapBytes:Math.max(...samples.map(s=>s.jsHeapUsedBytes))};
  report.identity={sameMasterNFT:true,unchangedCoreBindings:true,originalRuntimeSha256:genesis.runtimeSha256,actionNonce:String(final.actionNonce)};
  await cdp.detach();checkInputs();report.status='passed';
}

try{
  await Promise.race([execute(),new Promise((_,reject)=>{timer=setTimeout(()=>{stop('deadline');reject(Error('Master browser acceptance exceeded twelve minutes'));},12*60*1000);})]);
}catch(e){report.status='failed';report.error=e.stack??String(e);}
finally{
  clearTimeout(timer);process.removeListener('SIGINT',sigint);process.removeListener('SIGTERM',sigterm);
  for(const cleanup of [()=>context?.close(),()=>browser?.close(),()=>new Promise(resolve=>{if(!server)return resolve();server.closeAllConnections?.();server.close(resolve);}),()=>provider?.destroy(),()=>rpc?.disconnect()])try{await cleanup();}catch(e){report.status='failed';(report.cleanupErrors??=[]).push(String(e));}
  if(inputs)try{checkInputs();}catch(e){report.status='failed';report.provenanceError=String(e);}
  report.finishedAt=new Date().toISOString();save();console.log('Master acceptance:',report.status,file);
  if(report.status!=='passed'&&!(fixtureOnly&&report.status==='incomplete'&&report.fixture?.status==='passed'))process.exitCode=1;
}
