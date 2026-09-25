import http from 'node:http';
import {createHash} from 'node:crypto';
import {Interface} from 'ethers';
import {recoverArchive} from '../../web/confluence/chain-loader.mjs';
import {recoverToken,readRegistry,readCall,RELEASE_ABI} from '../../packages/modules/chain.mjs';

const address = /^0x[0-9a-f]{40}$/i;
const hash = /^0x[0-9a-f]{64}$/i;
const quantity = /^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
export const simulatorSha256 = value => '0x'+createHash('sha256').update(value).digest('hex');
const safeJSON = value => JSON.stringify(value).replaceAll('<','\\u003c');
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const abi = new Interface(['function tokenURI(uint256) view returns(string)','function contentSha256() view returns(bytes32)','function byteLength() view returns(uint256)','function chunkCount() view returns(uint256)','function readChunk(uint256) view returns(bytes)','function services() view returns(uint256,address,address,address,address,address,bytes32)']);

/** Parse the immutable identity without evaluating any code from a token. */
export function parseMintedTokenURI(tokenURI,{chainId,collection,tokenId}) {
  if(typeof tokenURI!=='string'||!tokenURI.startsWith('data:application/json;base64,'))throw Error('NFT metadata must be canonical onchain JSON.');
  const metadata=JSON.parse(Buffer.from(tokenURI.slice(tokenURI.indexOf(',')+1),'base64').toString('utf8'));
  if(!metadata.animation_url?.startsWith('data:text/html;base64,'))throw Error('NFT must contain its onchain HTML loader.');
  const loaderHtml=Buffer.from(metadata.animation_url.slice(metadata.animation_url.indexOf(',')+1),'base64').toString('utf8');
  const match=loaderHtml.match(/^<script>window\.AWE_CHAIN_IDENTITY=(\{[^\n;]+\});<\/script>/);
  if(!match)throw Error('NFT loader has no recognized immutable identity.');
  const identity=JSON.parse(match[1].replace(/([,{])([A-Za-z][A-Za-z0-9]*):/g,'$1"$2":'));
  const required=['seed','genome','root','chainId','collection','tokenId','manifest','privacyResource','runtime','sha256','archiveVersion'];
  if(Object.keys(identity).length!==required.length||required.some(key=>typeof identity[key]!=='string'))throw Error('NFT identity has unexpected fields.');
  if(['seed','genome','root','sha256'].some(key=>!hash.test(identity[key]))||['collection','manifest','privacyResource','runtime'].some(key=>!address.test(identity[key])))throw Error('NFT identity has malformed hashes or addresses.');
  if(!/^[1-9][0-9]*$/.test(identity.chainId)||!/^[1-9][0-9]*$/.test(identity.tokenId)||!['1','2','3'].includes(identity.archiveVersion))throw Error('NFT identity has malformed quantities.');
  if(BigInt(identity.chainId)!==BigInt(chainId)||identity.collection.toLowerCase()!==collection.toLowerCase()||BigInt(identity.tokenId)!==BigInt(tokenId))throw Error('NFT identity differs from the requested mint.');
  return {metadata,loaderHtml,identity,identityPrefix:match[0]};
}

/** All reads use one immutable snapshot; this adapter never exposes an account or signer. */
export function createReadOnlyRequest(request,{blockNumber,chainId=31337}) {
  if(!quantity.test(blockNumber))throw Error('Invalid pinned block.');
  const pin=value=>{if(value===undefined||['latest','safe','finalized'].includes(value))return blockNumber;if(value===blockNumber)return value;throw Error('Read must use the pinned simulator block.');};
  return async payload=>{
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||typeof payload.method!=='string'||!Array.isArray(payload.params??[]))throw Error('Invalid RPC request.');
    const {method}=payload,params=payload.params??[];
    switch(method){
      case 'eth_chainId': if(params.length)throw Error('Invalid RPC parameters.');return '0x'+BigInt(chainId).toString(16);
      case 'eth_blockNumber': if(params.length)throw Error('Invalid RPC parameters.');return blockNumber;
      case 'eth_call': {
        if(params.length<1||params.length>2)throw Error('State override calls are not available.');
        const call=params[0];if(!call||typeof call!=='object'||Array.isArray(call)||!address.test(call.to)||Object.keys(call).some(key=>!['to','data','from','gas','value'].includes(key)))throw Error('Invalid read-only call.');
        if(call.from!==undefined&&!address.test(call.from))throw Error('Invalid call sender.');
        if(call.data!==undefined&&(!/^0x(?:[0-9a-f]{2})*$/i.test(call.data)||call.data.length>2097154))throw Error('Invalid call data.');
        if(call.value!==undefined&&BigInt(call.value)!==0n)throw Error('Value-bearing calls are not available.');
        if(call.gas!==undefined&&(!quantity.test(call.gas)||BigInt(call.gas)>90000000n))throw Error('Invalid call gas budget.');
        return request({method,params:[{...call,gas:call.gas??'0x55d4a80'},pin(params[1])]});
      }
      case 'eth_getBlockByNumber': if(params.length!==2||typeof params[1]!=='boolean')throw Error('Invalid block query.');return request({method,params:[pin(params[0]),params[1]]});
      case 'eth_getCode': case 'eth_getBalance': case 'eth_getTransactionCount': if(params.length<1||params.length>2||!address.test(params[0]))throw Error('Invalid address query.');return request({method,params:[params[0],pin(params[1])]});
      case 'eth_getLogs': {
        if(params.length!==1||!params[0]||typeof params[0]!=='object'||Array.isArray(params[0]))throw Error('Invalid log query.');
        const filter=params[0];if(Object.keys(filter).some(key=>!['address','topics','fromBlock','toBlock'].includes(key)))throw Error('Invalid log filter.');
        if(filter.address!==undefined&&!(Array.isArray(filter.address)?filter.address:[filter.address]).every(v=>address.test(v)))throw Error('Invalid log address.');
        const from=filter.fromBlock??'0x0';if(!quantity.test(from)||BigInt(from)>BigInt(blockNumber))throw Error('Invalid log range.');
        return request({method,params:[{...filter,fromBlock:from,toBlock:pin(filter.toBlock)}]});
      }
      default: throw Object.assign(Error('This simulator provides pinned read-only RPC. Wallet accounts, signatures, transactions and chain mutation are unavailable.'),{code:4200});
    }
  };
}

export function assertLocalEdition(record,{buildManifestSha256,runtimeHash,workbenchHash}) {
  if(record.schema!=='anima.master-local/1'||record.chainId!==31337)throw Error('Local edition schema or chain differs.');
  if(record.buildManifestSha256!==buildManifestSha256)throw Error('Build source changed since this local mint. Select a new MASTER_INSTANCE name to preserve this edition.');
  if(record.runtimeHash!==runtimeHash)throw Error('Runtime source changed since this local mint. Select a new MASTER_INSTANCE name.');
  if(record.workbenchHash!==workbenchHash)throw Error('Workbench source changed since this local mint. Select a new MASTER_INSTANCE name.');
}

export async function recoverMintSnapshot({request,record,expectedRuntime,expectedWorkbench,expectedBuildManifestSha256}) {
  if(record.chainId!==31337||BigInt(await request({method:'eth_chainId',params:[]}))!==31337n)throw Error('Mint simulator requires local chain 31337.');
  if(expectedBuildManifestSha256!==undefined)assertLocalEdition(record,{buildManifestSha256:expectedBuildManifestSha256,runtimeHash:simulatorSha256(expectedRuntime),workbenchHash:simulatorSha256(expectedWorkbench)});
  const blockNumber=await request({method:'eth_blockNumber',params:[]});
  const rpcRecords=[],seen=new Map(),pinned=createReadOnlyRequest(request,{blockNumber});
  const read=async payload=>{const result=await pinned(payload),entry={method:payload.method,params:payload.params??[],result},key=JSON.stringify([entry.method,entry.params]);if(!seen.has(key)){seen.set(key,true);rpcRecords.push(entry);}return result;};
  const block=await read({method:'eth_getBlockByNumber',params:[blockNumber,false]});
  if(!block||!hash.test(block.hash)||block.number!==blockNumber)throw Error('Missing canonical simulator snapshot block.');
  const call=async(to,method,args=[])=>abi.decodeFunctionResult(method,await read({method:'eth_call',params:[{to,data:abi.encodeFunctionData(method,args)},blockNumber]}));
  const [tokenURI]=await call(record.collection,'tokenURI',[record.tokenId]);
  const token=parseMintedTokenURI(tokenURI,record);
  const runtimeHtml=await recoverArchive(read,token.identity);
  if(expectedRuntime!==undefined&&!Buffer.from(runtimeHtml).equals(Buffer.from(expectedRuntime)))throw Error('Recovered mint runtime differs from the built application.');
  const [workbenchHash]=await call(record.workbench,'contentSha256'),[workbenchBytes]=await call(record.workbench,'byteLength'),[workbenchChunks]=await call(record.workbench,'chunkCount');
  if(workbenchBytes<1n||workbenchBytes>1048576n||workbenchChunks<1n||workbenchChunks>64n)throw Error('Invalid workbench size.');
  const parts=[];for(let n=0;n<Number(workbenchChunks);n++){const [hex]=await call(record.workbench,'readChunk',[n]);const bytes=Buffer.from(hex.slice(2),'hex');if(!bytes.length||bytes.length>23000)throw Error('Invalid workbench chunk.');parts.push(bytes);}
  const workbench=Buffer.concat(parts);
  if(workbench.length!==Number(workbenchBytes)||simulatorSha256(workbench)!==workbenchHash||workbenchHash!==record.workbenchHash)throw Error('Recovered workbench differs from its immutable commitment.');
  if(expectedWorkbench!==undefined&&!workbench.equals(Buffer.from(expectedWorkbench)))throw Error('Recovered workbench differs from the built workbench.');
  const services=await call(record.workbench,'services');
  if(services[0]!==31337n||services[1].toLowerCase()!==record.collection.toLowerCase()||services[2].toLowerCase()!==record.registry.toLowerCase()||services[6]!==workbenchHash)throw Error('Workbench services differ from the minted installation.');
  const moduleRecovery=await recoverToken({request:read,registry:record.registry,tokenId:record.tokenId,chainId:31337,block:blockNumber});
  // Include the same catalog reads used by the recovered browser workbench.
  const moduleSnapshot=moduleRecovery.snapshot;
  await readRegistry({request:read,registry:record.registry,tokenId:record.tokenId,chainId:31337,snapshot:moduleSnapshot,limit:16});
  for(const name of ['releaseCount','archiveFactory','serviceType'])await readCall(read,moduleSnapshot,record.releaseRegistry,RELEASE_ABI,name);
  await readCall(read,moduleSnapshot,record.releaseRegistry,RELEASE_ABI,'catalog',[0,16]);
  const finalBlock=await request({method:'eth_getBlockByNumber',params:[blockNumber,false]});
  if(finalBlock?.hash!==block.hash)throw Error('Snapshot changed during recovery.');
  const provenance={schema:'anima.prism-mint-proof/1',scope:'Actual local-chain mint; no public deployment',chainId:31337,collection:record.collection,tokenId:String(record.tokenId),blockNumber,blockHash:block.hash,identity:token.identity,runtimeArchiveSha256:token.identity.sha256,runtimeSha256:simulatorSha256(runtimeHtml),runtimeBytes:Buffer.byteLength(runtimeHtml),workbenchSha256:workbenchHash,workbenchBytes:workbench.length,loaderSha256:simulatorSha256(token.loaderHtml),verification:{runtimeByteEquality:expectedRuntime!==undefined,workbenchByteEquality:expectedWorkbench!==undefined,tokenModuleRecovery:true,installedModules:moduleRecovery.context.modules.length,recoveredPackages:moduleRecovery.packages.length,historyEntries:moduleRecovery.context.history.length},buildManifestSha256:record.buildManifestSha256};
  return {schema:'anima.prism-simulator/1',chainId:31337,blockNumber,blockHash:block.hash,...token,tokenURI,runtimeHtml,workbenchHtml:workbench.toString('utf8'),record,provenance,rpcRecords};
}

/** Installed before opening any minted code. Wallet isolation failure leaves an inert host. */
export function installLiveGuard(win,endpoint) {
  const request=async payload=>{const response=await win.fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,...payload})});const body=await response.json();if(!response.ok||body.error)throw Object.assign(Error(body.error?.message||'Read-only RPC failed'),{code:body.error?.code??4200});return body.result;};
  const provider=Object.freeze({isAnimaSimulator:true,request,on(){return this;},removeListener(){return this;},removeAllListeners(){return this;}});
  const descriptor=Object.getOwnPropertyDescriptor(win,'ethereum');
  if(descriptor&&!descriptor.configurable)throw Error('A browser wallet prevents a safe read-only replay. Open the simulator without that wallet.');
  Object.defineProperty(win,'ethereum',{value:provider,writable:false,configurable:false});
  const stop=event=>{event.stopImmediatePropagation();event.stopPropagation?.();event.preventDefault?.();};
  const protect=()=>{for(const name of ['eip6963:announceProvider','eip6963:requestProvider']){win.addEventListener(name,stop,true);win.document.addEventListener(name,stop,true);}};
  protect();const doc=win.document,open=doc.open;
  Object.defineProperty(doc,'open',{configurable:false,writable:false,value:function(...args){const result=open.apply(this,args);protect();return result;}});
  win.AWE_CHAIN_RPC=request;win.__ANIMA_SIMULATOR_ISOLATED__=true;return provider;
}
export function liveBridgeScript(endpoint='/rpc') {
  return '<script>('+installLiveGuard.toString()+')(window,'+safeJSON(endpoint)+');</script>';
}
export function simulatorDocument(documentText,bridgeScript) {
  // The original document is inert JSON until isolation succeeds. Starting the
  // recovered document with DOCTYPE keeps the same standards mode as the NFT loader.
  return '<!doctype html><html><meta charset="utf-8"><title>ANIMA · Verified local mint</title><body><p id="simulator-status">Opening the verified read-only mint…</p><script id="mint-document" type="application/json">'+safeJSON('<!doctype html>'+documentText)+'</script>'+bridgeScript+'<script>if(window.__ANIMA_SIMULATOR_ISOLATED__===true){const source=JSON.parse(document.getElementById("mint-document").textContent);document.open();document.write(source);document.close();}else{document.getElementById("simulator-status").textContent="Read-only mint stopped: a browser wallet prevented safe isolation. Open this preview without that wallet.";}</script></body></html>';
}
export function mintDocument(snapshot,{bridgeScript='',runtimeHtml=snapshot.runtimeHtml}={}) {
  const original=snapshot.identityPrefix+runtimeHtml;
  return bridgeScript?simulatorDocument(original,bridgeScript):'<!doctype html>'+original;
}

export function simulatorHub(snapshot) {
  const p=snapshot.provenance;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ANIMA · Mint laboratory</title><style>:root{color-scheme:dark}body{background:#050a18;color:#e9ecff;max-width:920px;margin:6vh auto;padding:24px;font:16px/1.6 system-ui}h1{font:clamp(32px,6vw,64px)/1.1 Georgia,serif;color:#d8c4ff}a{color:#a3eaff}nav{display:flex;gap:16px;flex-wrap:wrap}code{overflow-wrap:anywhere;font-size:12px}section{padding:22px;border:1px solid #443b70;border-radius:16px;margin-top:24px;background:linear-gradient(120deg,#181329aa,#07323a44)}dt{color:#a3eaff}dd{margin:0 0 16px}</style><header><p>ANIMA / PRISM CATHEDRAL</p><h1>Your mint, unfolded.</h1><p>A real local mint recovered from immutable contract storage. Every seed, genome and source byte comes from this edition.</p></header><nav><a href="/token/1/live">Enter ANIMA</a><a href="/token/1/recover">Recover through NFT loader</a><a href="/modules.html">Module workbench</a><a href="/token/1/provenance">Recovery proof</a></nav><section><h2>Edition #${escape(p.tokenId)}</h2><dl><dt>Chain</dt><dd>31337 · local simulation</dd><dt>Collection</dt><dd><code>${escape(p.collection)}</code></dd><dt>Snapshot</dt><dd>Block ${BigInt(p.blockNumber)} · <code>${escape(p.blockHash)}</code></dd><dt>Runtime</dt><dd>${p.runtimeBytes.toLocaleString('en-US')} bytes · <code>${p.runtimeSha256}</code></dd><dt>Mint seed</dt><dd><code>${escape(p.identity.seed)}</code></dd></dl></section><section><h2>What this proves</h2><p>The minted NFT loader recovers the same application and workbench bytes as this build. This local edition has its own real mint identity; another mint will have its own seed and visual form. The browser bridge exposes pinned reads only. It does not expose an unlocked account, submit transactions, sign messages or contact a public network.</p><p>For live owner transactions, run your own local chain and connect a dedicated development wallet directly to its local RPC.</p></section></html>`;
}

export function createSimulatorServer({snapshot,request}) {
  const read=createReadOnlyRequest(request,{blockNumber:snapshot.blockNumber});
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  return http.createServer(async(req,res)=>{
    try{
      const host=req.headers.host??'',port=serverPort(req.socket.localPort);
      if(!['127.0.0.1:'+port,'localhost:'+port,'[::1]:'+port].includes(host)){json(res,403,{error:{message:'Loopback host required.'}});return;}
      const url=new URL(req.url,'http://'+host);
      if(req.headers.origin&&req.headers.origin!=='http://'+host){json(res,403,{error:{message:'Cross-origin simulator requests are unavailable.'}});return;}
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
      if(url.pathname==='/rpc'){
        if(req.method!=='POST'){json(res,405,{error:{message:'Use POST for read-only RPC.'}});return;}
        let size=0,body='';for await(const chunk of req){size+=chunk.length;if(size>2097152){json(res,413,{error:{message:'RPC payload too large.'}});return;}body+=chunk;}
        let payload;try{payload=JSON.parse(body);}catch{json(res,400,{error:{message:'Invalid JSON RPC.'}});return;}
        try{const result=await read(payload);json(res,200,{jsonrpc:'2.0',id:payload.id??null,result});}catch(error){json(res,200,{jsonrpc:'2.0',id:payload?.id??null,error:{code:error.code??-32602,message:error.message}});}return;
      }
      if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:{message:'Read-only resource.'}});return;}
      const bridge=liveBridgeScript('/rpc');let html;
      if(['/','/token/1/live'].includes(url.pathname))html=mintDocument(snapshot,{bridgeScript:bridge});
      else if(url.pathname==='/simulator')html=simulatorHub(snapshot);
      else if(url.pathname==='/token/1/loader')html=snapshot.loaderHtml;
      else if(url.pathname==='/token/1/recover')html=simulatorDocument(snapshot.loaderHtml,bridge);
      else if(url.pathname==='/token/1/runtime')html=snapshot.runtimeHtml;
      else if(url.pathname==='/modules.html'){
        const query=new URLSearchParams({registry:snapshot.record.registry,collection:snapshot.record.collection,chainId:'31337',tokenId:String(snapshot.record.tokenId)});
        if(!url.search){res.writeHead(302,{Location:'/modules.html?'+query});res.end();return;}
        html=simulatorDocument(snapshot.workbenchHtml,bridge);
      }
      else if(url.pathname==='/token/1/metadata'){json(res,200,snapshot.metadata);return;}
      else if(url.pathname==='/token/1/provenance'){json(res,200,snapshot.provenance);return;}
      else if(url.pathname==='/simulator/snapshot'){json(res,200,snapshot);return;}
      else if(url.pathname==='/health'){json(res,200,{ok:true,chainId:31337,blockNumber:snapshot.blockNumber});return;}
      else{json(res,404,{error:{message:'Unknown simulator resource.'}});return;}
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"connect-src 'self' data: blob:; frame-src 'self' data: blob:; object-src 'none'; base-uri 'self'"});res.end(req.method==='HEAD'?'':html);
    }catch(error){if(!res.headersSent)json(res,500,{error:{message:error.message}});else res.end();}
  });
}
function serverPort(value){if(!Number.isInteger(value))throw Error('Invalid server address.');return value;}
