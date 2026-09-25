import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const hash = bytes => '0x' + createHash('sha256').update(bytes).digest('hex');
const safeJSON = value => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const escapeHTML = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const READ_METHODS = ['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_call','eth_getBalance','eth_getStorageAt','eth_getTransactionCount','eth_gasPrice','net_version'];

/** Shared by the recorder and the browser replay: never invent a missing chain response. */
export function rpcRecordKey(method, params = [], blockNumber) {
  const normalize = value => typeof value === 'string' && /^0x[0-9a-f]*$/i.test(value) ? value.toLowerCase() : Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,normalize(value[key])])) : value;
  params = structuredClone(params);
  const index = method === 'eth_getBlockByNumber' ? 0 : ['eth_call','eth_getCode','eth_getBalance','eth_getTransactionCount'].includes(method) ? 1 : method === 'eth_getStorageAt' ? 2 : -1;
  if(index >= 0 && (params[index] === undefined || ['latest','safe','finalized','pending'].includes(params[index])))params[index]=blockNumber;
  return JSON.stringify([method,normalize(params)]);
}

/** This function is serialized verbatim into the browser and separately exercised in VM tests. */
export function installFrozenGuard(win, snapshot) {
  const allowed = new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_call','eth_getBalance','eth_getStorageAt','eth_getTransactionCount','eth_gasPrice','net_version']);
  const normalize = value => typeof value === 'string' && /^0x[0-9a-f]*$/i.test(value) ? value.toLowerCase() : Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,normalize(value[key])])) : value;
  const key = (method,params) => {
    params = JSON.parse(JSON.stringify(params));
    const index=method==='eth_getBlockByNumber'?0:['eth_call','eth_getCode','eth_getBalance','eth_getTransactionCount'].includes(method)?1:method==='eth_getStorageAt'?2:-1;
    if(index>=0&&(params[index]===undefined||['latest','safe','finalized','pending'].includes(params[index])))params[index]=snapshot.blockNumber;
    return JSON.stringify([method,normalize(params)]);
  };
  const records = new Map(snapshot.rpcRecords.map(row=>[key(row.method,row.params),row.result]));
  const deny = message => Object.assign(new Error(message),{code:4001});
  const request = async payload => {
    if(!payload||!allowed.has(payload.method)||!Array.isArray(payload.params??[]))throw deny('This frozen local mint permits recorded reads only. Wallet connections, signatures and transactions are unavailable.');
    if(payload.method==='eth_chainId')return '0x'+BigInt(snapshot.chainId).toString(16);
    if(payload.method==='eth_blockNumber')return snapshot.blockNumber;
    if(payload.method==='net_version')return String(snapshot.chainId);
    const lookup=key(payload.method,payload.params??[]);
    if(!records.has(lookup))throw Object.assign(new Error('This read was not recorded in the frozen local mint. Use the local simulator for live state.'),{code:-32004});
    return JSON.parse(JSON.stringify(records.get(lookup)));
  };
  const provider=Object.freeze({isANIMAFrozen:true,request,on(){return this;},removeListener(){return this;},removeAllListeners(){return this;}});
  const descriptor=Object.getOwnPropertyDescriptor(win,'ethereum');
  if(descriptor&&!descriptor.configurable)throw deny('A browser wallet prevents a safe read-only replay. Open this preview in a browser profile without that wallet.');
  Object.defineProperty(win,'ethereum',{value:provider,writable:false,configurable:false,enumerable:true});
  const blockEvent=event=>{event.stopImmediatePropagation();event.stopPropagation?.();event.preventDefault?.();};
  const protectEvents=()=>{
    for(const name of ['eip6963:announceProvider','eip6963:requestProvider']){
      win.addEventListener(name,blockEvent,true);
      win.document.addEventListener(name,blockEvent,true);
    }
  };
  protectEvents();
  const doc=win.document,originalOpen=doc.open;
  // document.open removes listeners. Restore the discovery barrier synchronously before document.write.
  Object.defineProperty(doc,'open',{configurable:false,writable:false,value:function(...args){const result=originalOpen.apply(this,args);protectEvents();return result;}});
  win.AWE_CHAIN_RPC=request;
  return Object.freeze({request,provider});
}

const connectionPolicy = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'self' 'unsafe-inline' data:; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; worker-src 'self' blob: data:; frame-src 'self' blob: data:; form-action 'none'; base-uri 'none'; object-src 'none'";
const policyMeta = `<meta http-equiv="Content-Security-Policy" content="${connectionPolicy}">`;

export function frozenBridgeSource() {
  return `const installFrozenGuard=${installFrozenGuard.toString()};\nconst frozenSnapshotPromise=fetch('./frozen-rpc.json',{credentials:'omit',redirect:'error'}).then(response=>{if(!response.ok)throw Error('Frozen snapshot unavailable');return response.json();});\nwindow.ANIMA_FROZEN=Object.freeze({async open(documentText){try{const snapshot=await frozenSnapshotPromise;installFrozenGuard(window,snapshot);document.open();document.write(${safeJSON('<!doctype html>'+policyMeta)}+documentText);document.close();}catch(error){window.stop();document.body.replaceChildren();const message=document.createElement('p');message.style.cssText='padding:32px;color:#edf1ff;font:16px/1.6 system-ui;max-width:780px';message.textContent='Read-only preview stopped: '+error.message;document.body.append(message);document.body.style.background='#050912';}}});\n`;
}

/** Raw documents remain untouched in separate files; only this host supplies the frozen transport. */
export function frozenDocument(documentText, title='ANIMA · Local mint') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${policyMeta}<title>${escapeHTML(title)}</title></head><body><p style="font:16px system-ui;padding:32px">Recovering the verified local mint…</p><script id="immutable-document" type="application/json">${safeJSON(documentText)}</script><script src="./frozen-bridge.js"></script><script>ANIMA_FROZEN.open(JSON.parse(document.getElementById('immutable-document').textContent));</script></body></html>`;
}

const hostCSS = `*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#050812;color:#edf1ff;font-family:system-ui,sans-serif}body{min-height:100dvh}header{height:54px;padding:0 22px;display:flex;align-items:center;gap:22px;border-bottom:1px solid #ffffff18;background:#070a13}a{color:#adcef5;text-decoration:none}a:hover{text-decoration:underline}strong{letter-spacing:.15em;font-size:12px}small{color:#95a2b8;font-size:12px}.controls{margin-left:auto;display:flex;gap:6px}button{color:#c8d4e9;border:1px solid #8094b64d;background:#101626;border-radius:7px;padding:6px 10px;cursor:pointer}button[aria-pressed=true]{background:#223253;color:white;border-color:#afcaff}main{height:calc(100dvh - 54px);display:flex;justify-content:center;align-items:flex-start;overflow:auto;background:radial-gradient(ellipse at 50% 45%,#172e48 0%,#080d19 60%)}iframe{border:0;width:100%;height:100%;background:#050812}main[data-phone=true] iframe{width:min(390px,100%);height:min(844px,100%);box-shadow:0 0 0 1px #94a9dc45,0 0 70px #415e6f45}main[data-phone=true]{padding:14px 0}@media(max-width:560px){header{height:auto;min-height:70px;gap:10px;padding:10px 14px;flex-wrap:wrap}header small{order:4;width:100%;font-size:11px}.controls{margin-left:auto}main{height:calc(100dvh - 76px)}header a{font-size:12px}}`;

function editionHost(source='token-1-runtime.html') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ANIMA · Prism Cathedral mint simulator</title><style>${hostCSS}</style></head><body><header><strong>ANIMA</strong><a href="edition.html">Edition details</a><small>Frozen local mint · read-only</small><div class="controls"><button id="desktop" aria-pressed="true">Desktop</button><button id="phone" aria-pressed="false">Phone</button></div></header><main id="stage"><iframe id="mint" title="ANIMA minted application" src="${source}" allow="autoplay; fullscreen" sandbox="allow-scripts allow-same-origin allow-downloads"></iframe></main><script>for(const mode of ['desktop','phone'])document.getElementById(mode).onclick=()=>{document.getElementById('stage').dataset.phone=String(mode==='phone');for(const item of ['desktop','phone'])document.getElementById(item).setAttribute('aria-pressed',String(item===mode));};</script></body></html>`;
}

function editionDetails(snapshot) {
  const p=snapshot.provenance,token=escapeHTML(snapshot.identity.tokenId),collection=escapeHTML(snapshot.identity.collection);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ANIMA · Mint provenance</title><style>${hostCSS}main{height:auto;display:block;max-width:1040px;margin:auto;padding:44px 24px;background:none}h1{font-weight:450;font-size:40px;letter-spacing:-.04em}p,li{color:#b3c0d8;line-height:1.7}code{overflow-wrap:anywhere;font-size:12px}nav{display:flex;flex-wrap:wrap;gap:12px}nav a{padding:12px 15px;background:#142039;border:1px solid #516286;border-radius:8px}dl{display:grid;grid-template-columns:180px 1fr;gap:15px;border-top:1px solid #ffffff18;padding:24px 0}dt{color:#8395b6}dd{margin:0;overflow-wrap:anywhere}img{max-width:260px;float:right;margin:0 0 24px 24px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0d1423;padding:18px;border-radius:10px;color:#97accb;font-size:12px}@media(max-width:560px){img{float:none}dl{grid-template-columns:1fr;gap:6px}dd{margin-bottom:16px}h1{font-size:32px}}</style></head><body><header><strong>ANIMA</strong><a href="index.html">Return to your mint</a><small>Verified local-chain snapshot</small></header><main><img src="token-1.svg" alt="Exact onchain metadata portrait"><h1>One minted identity.<br>Every original byte.</h1><p>This edition was actually minted on local chain 31337. The application and workbench were recovered from their immutable contracts and compared byte for byte with the release build before export.</p><nav><a href="index.html">Explore the mint</a><a href="recover.html">Recover from NFT loader</a><a href="modules.html">Open module workbench</a></nav><dl><dt>Collection / token</dt><dd><code>${collection} / ${token}</code></dd><dt>Snapshot block</dt><dd>${BigInt(snapshot.blockNumber)}<br><code>${escapeHTML(snapshot.blockHash)}</code></dd><dt>Origin seed</dt><dd><code>${escapeHTML(snapshot.identity.seed)}</code></dd><dt>Runtime SHA-256</dt><dd><code>${hash(Buffer.from(snapshot.runtimeHtml))}</code></dd><dt>Workbench SHA-256</dt><dd><code>${hash(Buffer.from(snapshot.workbenchHtml))}</code></dd></dl><p>The same renderer, identity and interface run here. Chain reads replay the captured block. Wallet connection, signing, publication and changing chain state require the local simulator or a separately deployed live edition. A future mint receives its own unique seed and identity.</p><p>The recovery page uses the original NFT loader with the recorded read provider. Leave its RPC field empty and choose “Unfold”. The NFT metadata image below is the existing onchain SVG, not a screenshot of the application.</p><nav><a href="metadata.json">Token metadata</a><a href="provenance.json">Recovery evidence</a><a href="export-manifest.json">Export hashes</a><a href="runtime-source.html" download>Original application</a><a href="workbench-source.html" download>Original workbench</a><a href="token-1-loader.html" download>Original NFT loader</a></nav><details><summary>Recorded deployment proof</summary><pre>${escapeHTML(JSON.stringify(p,null,2))}</pre></details></main></body></html>`;
}

export function exportFrozenMint(snapshot, output) {
  if(snapshot?.schema!=='anima.prism-simulator/1'||Number(snapshot.chainId)!==31337||!/^0x[0-9a-f]+$/i.test(snapshot.blockNumber)||!snapshot.runtimeHtml||!snapshot.workbenchHtml||!snapshot.loaderHtml||!Array.isArray(snapshot.rpcRecords))throw Error('A verified local mint snapshot is required');
  if(!(snapshot.provenance?.verification?.runtimeByteEquality??snapshot.provenance?.runtimeByteIdentical)||!(snapshot.provenance?.verification?.workbenchByteEquality??snapshot.provenance?.workbenchByteIdentical))throw Error('Export requires byte-identical runtime and workbench recovery');
  const prefix=snapshot.loaderHtml.match(/^<script>window\.AWE_CHAIN_IDENTITY=[\s\S]*?<\/script>/)?.[0];
  if(!prefix)throw Error('Original loader identity prefix is missing');
  for(const row of snapshot.rpcRecords)if(!READ_METHODS.includes(row.method)||!Array.isArray(row.params))throw Error('Snapshot contains a non-read RPC record');
  const rpcSnapshot={schema:'anima.frozen-rpc/1',chainId:snapshot.chainId,blockNumber:snapshot.blockNumber,blockHash:snapshot.blockHash,rpcRecords:snapshot.rpcRecords};
  const image=snapshot.metadata.image;if(typeof image!=='string'||!image.startsWith('data:image/svg+xml;base64,'))throw Error('Expected immutable SVG token portrait');
  const files=new Map([
    ['index.html',editionHost()],['edition.html',editionDetails(snapshot)],['recover.html',editionHost('loader-replay.html')],
    ['modules.html',editionHost('workbench-runtime.html?'+new URLSearchParams({registry:snapshot.record.registry,collection:snapshot.identity.collection,chainId:String(snapshot.chainId),tokenId:String(snapshot.identity.tokenId)}))],
    ['token-1-runtime.html',frozenDocument(prefix+snapshot.runtimeHtml)],['workbench-runtime.html',frozenDocument(snapshot.workbenchHtml,'ANIMA · Module workbench')],
    ['loader-replay.html',frozenDocument(snapshot.loaderHtml,'ANIMA · Recover your mint')],
    ['runtime-source.html',snapshot.runtimeHtml],['workbench-source.html',snapshot.workbenchHtml],['token-1-loader.html',snapshot.loaderHtml],
    ['token-1.svg',Buffer.from(image.slice('data:image/svg+xml;base64,'.length),'base64')],['metadata.json',JSON.stringify(snapshot.metadata,null,2)+'\n'],
    ['provenance.json',JSON.stringify(snapshot.provenance,null,2)+'\n'],['frozen-rpc.json',JSON.stringify(rpcSnapshot)+'\n'],['frozen-bridge.js',frozenBridgeSource()],
  ]);
  const manifest={schema:'anima.frozen-mint-export/1',chainId:snapshot.chainId,collection:snapshot.identity.collection,tokenId:String(snapshot.identity.tokenId),block:snapshot.blockNumber,blockHash:snapshot.blockHash,scope:'Read-only local-chain snapshot. No wallet signatures, live quote guarantees or public deployment.',fidelity:{runtimeByteIdentical:true,workbenchByteIdentical:true,originalLoaderByteIdentical:true,originalMetadataPortrait:true,identityPrefixByteIdentical:true},files:Object.fromEntries([...files].map(([name,content])=>[name,{bytes:Buffer.byteLength(content),sha256:hash(content)}]))};
  output=path.resolve(output);if(fs.existsSync(output))throw Error('Export output already exists; choose a fresh directory');
  fs.mkdirSync(output,{recursive:true});for(const[name,content]of files)fs.writeFileSync(path.join(output,name),content);
  fs.writeFileSync(path.join(output,'export-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {output,files:files.size+1,manifest};
}
