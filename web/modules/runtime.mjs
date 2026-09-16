import { boundedJSON } from './host.mjs';
import { parse, serialize } from 'parse5';
import { htmlWorkerSource, htmlFrameProgram } from './html-worker.mjs';
const utf8 = new TextDecoder('utf-8', { fatal: true });
const colors = /^#[0-9a-f]{6}$/i;
const exact = (value, allowed) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw Error('Unsupported scene fields.'); };
const text = (value, max = 160) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error('Invalid scene text.'); return value; };
export function validateScene(input) {
  const scene = boundedJSON(input, 32_768);
  exact(scene, ['schema','title','description','visual','audio','fields','actions']);
  if (scene.schema !== 'anima.module-scene/1') throw Error('This runtime requires an anima.module-scene/1 entrypoint.');
  text(scene.title, 64); text(scene.description, 600);
  exact(scene.visual, ['kind','primary','secondary','seed']);
  if (!['orb','ribbons','garden'].includes(scene.visual.kind) || !colors.test(scene.visual.primary) || !colors.test(scene.visual.secondary) || !Number.isSafeInteger(scene.visual.seed) || scene.visual.seed < 0) throw Error('Invalid typed visual program.');
  if (scene.audio !== undefined) {
    exact(scene.audio, ['frequencies','durationMs','volume']);
    if (!Array.isArray(scene.audio.frequencies) || scene.audio.frequencies.length < 1 || scene.audio.frequencies.length > 8 || scene.audio.frequencies.some(n => !Number.isFinite(n) || n < 20 || n > 16_000) || !Number.isInteger(scene.audio.durationMs) || scene.audio.durationMs < 100 || scene.audio.durationMs > 20_000 || !Number.isFinite(scene.audio.volume) || scene.audio.volume < 0 || scene.audio.volume > 0.12) throw Error('Audio program exceeds the bounded listening profile.');
  }
  if (!Array.isArray(scene.fields) || scene.fields.length > 8 || !Array.isArray(scene.actions) || scene.actions.length > 8) throw Error('Scene controls exceed their limits.');
  const fields = new Set();
  for (const field of scene.fields) {
    exact(field, ['id','label','type','value']);
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(field.id) || fields.has(field.id) || !['text','textarea','address','wei'].includes(field.type)) throw Error('Invalid or duplicate scene field.');
    fields.add(field.id); text(field.label, 64); if (typeof field.value !== 'string' || field.value.length > 4096) throw Error('Scene field value is too long.');
  }
  for (const action of scene.actions) {
    exact(action, ['kind','label','key','destinationField','valueField','textField','description']); text(action.label, 64);
    if (!['save','restore','transaction','journal','identity'].includes(action.kind)) throw Error('Unknown scene action.');
    if (['save','restore'].includes(action.kind) && !/^[a-z][a-z0-9_.-]{0,63}$/.test(action.key)) throw Error('Invalid scene draft key.');
    if (action.kind === 'transaction') { if (!fields.has(action.destinationField) || !fields.has(action.valueField)) throw Error('Transaction action needs explicit destination and wei fields.'); text(action.description, 160); }
    if (action.kind === 'journal' && !fields.has(action.textField)) throw Error('Journal action needs a text field.');
  }
  return scene;
}
export function sceneFromRelease(recovered) {
  const file = recovered.files.find(file => file.path === recovered.entrypoint);
  if (!file || !recovered.entrypoint.endsWith('.json')) throw Error('Recovered bytes are available. Interactive launch currently supports the typed JSON scene profile; HTML/JavaScript are not executed by this host.');
  const document = JSON.parse(utf8.decode(file.bytes)), { parts = [], ...scene } = document;
  if (!Array.isArray(parts) || parts.length > 4) throw Error('Typed dependency part budget exceeded.');
  const kinds = new Set();
  for (const part of parts) {
    exact(part, ['kind','releaseId','path']);
    if (!['audio','visual'].includes(part.kind) || kinds.has(part.kind) || !/^0x[0-9a-f]{64}$/.test(part.releaseId) || typeof part.path !== 'string') throw Error('Invalid typed dependency reference.');
    kinds.add(part.kind);
    const dependency = (recovered.dependencies ?? []).find(item => item.releaseId === part.releaseId), resource = dependency?.files.find(item => item.path === part.path);
    if (!resource || resource.bytes.length > 16_384) throw Error('Typed part is missing from the verified dependency closure or exceeds 16 KiB.');
    const program = JSON.parse(utf8.decode(resource.bytes));
    exact(program, ['schema','value']);
    if (program.schema !== 'anima.module-' + part.kind + '/1') throw Error('Typed dependency schema does not match its use.');
    scene[part.kind] = program.value;
  }
  return validateScene(scene);
}
/** Trusted renderer only: package JSON supplies bounded values, never HTML, script or URLs. */
function frameProgram(scene, nonce) {
  'use strict';
  let port, serial = 0, disposed = false, frame, worker, audio, timer;
  const pending = new Map(), fields = new Map(), root = document.querySelector('main'), notice = document.querySelector('[role=status]');
  const node = (tag, value, parent = root) => { const element = document.createElement(tag); if (value !== undefined) element.textContent = value; parent.append(element); return element; };
  node('h1', scene.title); node('p', scene.description);
  const canvas = node('canvas'); canvas.width = 700; canvas.height = 300; canvas.setAttribute('aria-label', 'Module visual: ' + scene.visual.kind); canvas.setAttribute('role','img');
  const ctx = canvas.getContext('2d'), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let points = [], at = 0;
  const paint = () => {
    if (disposed || !ctx) return;
    ctx.clearRect(0,0,700,300); const glow = ctx.createRadialGradient(350,145,10,350,145,170); glow.addColorStop(0,scene.visual.primary+'99'); glow.addColorStop(.5,scene.visual.secondary+'32'); glow.addColorStop(1,'#03091200'); ctx.fillStyle=glow;ctx.fillRect(0,0,700,300);
    for (let i=0;i<points.length;i++) { const p=points[i], t=at*.004; const x=350+p[0]*Math.cos(t)+p[1]*Math.sin(t), y=145+p[1]*.66; ctx.fillStyle=i%2?scene.visual.primary:scene.visual.secondary;ctx.globalAlpha=.25+p[2]*.6;ctx.beginPath();ctx.arc(x,y,1+p[2]*2,0,Math.PI*2);ctx.fill(); }
    ctx.globalAlpha=1;at++;if(!reduced)frame=requestAnimationFrame(paint);
  };
  // The worker executes this fixed point generator, never archive JavaScript.
  const workerSource = 'onmessage=e=>{const s=e.data;let x=s.seed||1;const r=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296};const p=[];for(let i=0;i<360;i++){const a=r()*Math.PI*2,b=r()*2-1,h=Math.sqrt(1-b*b);p.push([Math.cos(a)*h*130,b*130,r()])}postMessage(p)}';
  const workerURL = URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));
  try { worker = new Worker(workerURL);worker.onmessage=e=>{points=e.data;paint();worker.terminate();worker=null;URL.revokeObjectURL(workerURL);};worker.postMessage({seed:scene.visual.seed}); } catch { URL.revokeObjectURL(workerURL);paint(); }
  for(const field of scene.fields) { const label=node('label',field.label), input=document.createElement(field.type==='textarea'?'textarea':'input');if(field.type!=='textarea')input.type='text';input.value=field.value;input.maxLength=field.type==='textarea'?4096:160;input.autocomplete='off';input.spellcheck=field.type==='textarea';if(field.type==='wei')input.inputMode='numeric';label.append(input);fields.set(field.id,input); }
  const call = (method, params={}) => new Promise((resolve,reject)=>{if(!port||disposed)return reject(Error('Module bridge is not ready.'));if(pending.size>=4)return reject(Error('Finish the pending request first.'));const id='r'+(++serial);const timeout=setTimeout(()=>{pending.delete(id);reject(Error('Request timed out. Reopen the module.'));},15000);pending.set(id,{resolve,reject,timeout});port.postMessage({id,method,params});});
  const controls=node('div');controls.className='actions';
  for(const action of scene.actions) { const button=node('button',action.label,controls);button.type='button';button.onclick=async()=>{button.disabled=true;try{let result;if(action.kind==='identity')result=await call('identity.read');else if(action.kind==='save')result=await call('state.set',{key:action.key,value:Object.fromEntries([...fields].map(([k,v])=>[k,v.value]))});else if(action.kind==='restore'){result=await call('state.get',{key:action.key});if(result&&typeof result==='object')for(const[k,v]of Object.entries(result))if(fields.has(k)&&typeof v==='string')fields.get(k).value=v;}else if(action.kind==='transaction')result=await call('transaction.propose',{to:fields.get(action.destinationField).value,value:fields.get(action.valueField).value,data:'0x',description:action.description});else if(action.kind==='journal')result=await call('journal.propose',{text:fields.get(action.textField).value});notice.textContent=JSON.stringify(result);}catch(error){notice.textContent=error.message;}finally{button.disabled=false;}}; }
  if(scene.audio){const button=node('button','Listen · '+Math.round(scene.audio.durationMs/1000)+' seconds',controls);button.type='button';button.onclick=async()=>{try{await audio?.close();audio=new AudioContext();await audio.resume();const gain=audio.createGain();gain.gain.setValueAtTime(0,audio.currentTime);gain.gain.linearRampToValueAtTime(scene.audio.volume/scene.audio.frequencies.length,audio.currentTime+.1);gain.gain.linearRampToValueAtTime(0,audio.currentTime+scene.audio.durationMs/1000);gain.connect(audio.destination);for(const hz of scene.audio.frequencies){const oscillator=audio.createOscillator();oscillator.type='sine';oscillator.frequency.value=hz;oscillator.connect(gain);oscillator.start();oscillator.stop(audio.currentTime+scene.audio.durationMs/1000);}clearTimeout(timer);timer=setTimeout(()=>{audio?.close();audio=null;},scene.audio.durationMs+100);}catch(error){notice.textContent=error.message;}};}
  const close=()=>{disposed=true;cancelAnimationFrame(frame);worker?.terminate();URL.revokeObjectURL(workerURL);clearTimeout(timer);audio?.close();for(const item of pending.values()){clearTimeout(item.timeout);item.reject(Error('Module closed.'));}pending.clear();port?.close();};
  addEventListener('pagehide',close,{once:true});
  addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='anima:bridge'||event.data.nonce!==nonce||port||!event.ports[0])return;port=event.ports[0];port.onmessage=e=>{const item=pending.get(e.data?.id);if(!item)return;pending.delete(e.data.id);clearTimeout(item.timeout);e.data.ok?item.resolve(e.data.result):item.reject(Error(e.data.error));};port.start();notice.textContent='Isolated module ready. Wallet requests require a separate review.';},{once:false});
  parent.postMessage({type:'anima:ready',nonce},'*');
}
export function mountScene({ container, scene: input, session, window: win = window, maxRuntimeMs = 300_000 }) {
  const scene = validateScene(input), nonce = [...win.crypto.getRandomValues(new Uint8Array(24))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const iframe=container.ownerDocument.createElement('iframe');iframe.title=scene.title+' · isolated module';iframe.setAttribute('sandbox','allow-scripts');iframe.setAttribute('referrerpolicy','no-referrer');iframe.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'; serial 'none'");
  const payload=JSON.stringify(scene).replaceAll('<','\\u003c');
  const csp=`default-src 'none'; script-src 'nonce-${nonce}' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src data:; media-src blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  iframe.srcdoc=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html{color-scheme:dark;background:#071221;color:#e4f5ff;font:15px system-ui}body{margin:0;padding:28px}main{max-width:660px;margin:auto}h1{font-size:26px;font-weight:500;margin:0}p{line-height:1.6;color:#a9bdd1}canvas{width:100%;height:auto}label{display:grid;gap:8px;margin:16px 0;font-size:13px;color:#accee2}input,textarea{box-sizing:border-box;width:100%;background:#0b1c30;border:1px solid #28415a;color:#e4f5ff;padding:12px;border-radius:10px;font:inherit}textarea{min-height:80px}button{border:1px solid #345269;color:#cdf6ff;background:#152e43;border-radius:24px;padding:12px 18px;font:inherit;cursor:pointer}button:disabled{opacity:.45}.actions{display:flex;flex-wrap:wrap;gap:10px}[role=status]{font-size:12px;line-height:1.5;overflow-wrap:anywhere;margin-top:20px;color:#a8ccd6}*:focus-visible{outline:2px solid #92ddff;outline-offset:4px}</style></head><body><main></main><p role="status">Starting isolated module…</p><script nonce="${nonce}">(${frameProgram.toString()})(${payload},${JSON.stringify(nonce)})</script></body></html>`;
  let closed=false, ready=false, timer, heartbeat;
  const cleanup=()=>{if(closed)return;closed=true;win.removeEventListener('message',listener);win.clearTimeout(timer);win.clearInterval(heartbeat);session.close();iframe.remove();};
  const listener=event=>{if(event.source===iframe.contentWindow&&event.data?.nonce===nonce&&event.data.type==='anima:closed'){cleanup();return;}if(ready||event.source!==iframe.contentWindow||event.data?.type!=='anima:ready'||event.data.nonce!==nonce)return;ready=true;const channel=new win.MessageChannel();session.attachPort(channel.port1);iframe.contentWindow.postMessage({type:'anima:bridge',nonce},'*',[channel.port2]);heartbeat=win.setInterval(()=>session.fresh().catch(cleanup),5000);};
  win.addEventListener('message',listener);container.replaceChildren(iframe);timer=win.setTimeout(cleanup,Math.min(300_000,Math.max(1000,maxRuntimeMs)));session.cleanups.add(()=>{if(!closed)cleanup();});
  return { iframe, destroy:cleanup };
}

const assetPath=(base,reference)=>{
 if(typeof reference!=='string'||/^[a-z][a-z0-9+.-]*:|^\/|[?#\\\0]/i.test(reference))throw Error('HTML assets must be self-contained package-relative paths.');
 const parts=base.split('/').slice(0,-1);for(const piece of reference.split('/')){if(piece==='.'||piece==='')continue;if(piece==='..'){if(!parts.length)throw Error('HTML asset escapes its package.');parts.pop();}else parts.push(piece);}return parts.join('/');
};
const base64=bytes=>{let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw);};
/** Parse inertly with parse5, never the browser DOM, before installing the restrictive CSP. */
export function prepareHTMLDocument(recovered,nonce){
 const file=recovered.files.find(file=>file.path===recovered.entrypoint);
 if(!file||!recovered.entrypoint.endsWith('.html')||file.bytes.length>524288)throw Error('HTML entrypoint is missing or exceeds 512 KiB.');
 const files=new Map(recovered.files.map(file=>[file.path,file])),document=parse(utf8.decode(file.bytes)),getFile=(base,ref)=>{const found=files.get(assetPath(base,ref));if(!found||found.bytes.length>1048576)throw Error('HTML asset is missing or exceeds 1 MiB.');return found;};
 const scripts=[];let total=0;const uri=(base,ref)=>{if(ref.startsWith('data:')){if(ref.length>65536||!/^data:(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|audio\/[a-z0-9.+-]+|font\/[a-z0-9.+-]+);base64,/i.test(ref))throw Error('Unsupported embedded HTML asset.');return ref;}const asset=getFile(base,ref);if(!/^(?:image|audio|video|font)\//.test(asset.mime))throw Error('HTML resource has an unsupported media type.');total+=asset.bytes.length;if(total>4194304)throw Error('HTML asset budget exceeds 4 MiB.');return 'data:'+asset.mime+';base64,'+base64(asset.bytes);};
 const css=(source,base)=>{if(/@import\b/i.test(source))throw Error('Bundle CSS imports into the package stylesheet.');return source.replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi,(_,quote,ref)=>'url("'+uri(base,ref.trim())+'")');};
 function walk(node){if(!node.childNodes)return;const children=[];for(const child of node.childNodes){const tag=child.tagName;
   if(['base','iframe','frame','frameset','object','embed'].includes(tag))continue;
   child.attrs=(child.attrs??[]).filter(attr=>!/^on/i.test(attr.name)&&!['srcdoc','srcset','formaction','action','autoplay','integrity'].includes(attr.name));
   const attribute=name=>child.attrs.find(attr=>attr.name===name)?.value;
   if(tag==='meta'&&attribute('http-equiv'))continue;
   if(tag==='link'){
    if(attribute('rel')!=='stylesheet')continue;const asset=getFile(recovered.entrypoint,attribute('href'));child.nodeName=child.tagName='style';child.attrs=[];child.childNodes=[{nodeName:'#text',value:css(utf8.decode(asset.bytes),asset.path),parentNode:child}];
   }else if(tag==='script'){
    const type=attribute('type');if(type&&!['module','text/javascript','application/javascript'].includes(type))continue;
    const src=attribute('src'),source=src?utf8.decode(getFile(recovered.entrypoint,src).bytes):(child.childNodes??[]).map(n=>n.value??'').join('');
    if(/\bimport\s*(?:\(|["'{*]|[A-Za-z_$])|\bexport\s+[^;]*\bfrom\s*["']/m.test(source))throw Error('Bundle executable HTML imports into self-contained scripts before publishing.');
    scripts.push(source);continue;
   }else{
    for(const attr of child.attrs){if(['src','poster'].includes(attr.name))attr.value=uri(recovered.entrypoint,attr.value);else if(attr.name==='href'&&!attr.value.startsWith('#'))attr.value='#';else if(attr.name==='style')attr.value=css(attr.value,recovered.entrypoint);}
    if(tag==='style')for(const part of child.childNodes??[])if(part.nodeName==='#text')part.value=css(part.value,recovered.entrypoint);
    walk(child);
   }
   children.push(child);
  }node.childNodes=children;
 }
 walk(document);
 const csp=`default-src 'none'; script-src 'nonce-${nonce}' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'`;
 const policies=`<meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer">`;
 const bootstrap=`<script nonce="${nonce}">(${htmlFrameProgram.toString()})(${JSON.stringify(nonce)},${JSON.stringify(htmlWorkerSource(scripts)).replaceAll('<','\\u003c')})</script>`;
 return serialize(document).replace('<head>','<head>'+policies).replace('</body>',bootstrap+'</body>');
}
/** Explicitly reviewed HTML with scripts confined to a worker and a bounded DOM subset. */
export function mountHTML({container,recovered,session,window:win=window,maxRuntimeMs=300000}){
 const nonce=[...win.crypto.getRandomValues(new Uint8Array(24))].map(n=>n.toString(16).padStart(2,'0')).join(''),html=prepareHTMLDocument(recovered,nonce);
 const iframe=container.ownerDocument.createElement('iframe');iframe.title=recovered.manifest.name+' · reviewed HTML module';iframe.setAttribute('sandbox','allow-scripts');iframe.setAttribute('referrerpolicy','no-referrer');iframe.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'; serial 'none'");
 let closed=false,ready=false,timer,heartbeat,loads=0;
 const cleanup=()=>{if(closed)return;closed=true;win.removeEventListener('message',listener);win.clearTimeout(timer);win.clearInterval(heartbeat);iframe.onload=null;session.close();iframe.remove();};
 const listener=event=>{if(event.source===iframe.contentWindow&&event.data?.nonce===nonce&&event.data.type==='anima:closed'){cleanup();return;}if(ready||event.source!==iframe.contentWindow||event.data?.type!=='anima:ready'||event.data.nonce!==nonce)return;ready=true;const channel=new win.MessageChannel();session.attachPort(channel.port1);iframe.contentWindow.postMessage({type:'anima:bridge',nonce},'*',[channel.port2]);heartbeat=win.setInterval(()=>session.fresh().catch(cleanup),5000);};
 win.addEventListener('message',listener);iframe.onload=()=>{if(++loads>1)cleanup();};iframe.srcdoc=html;container.replaceChildren(iframe);timer=win.setTimeout(cleanup,Math.min(300000,Math.max(1000,maxRuntimeMs)));session.cleanups.add(()=>{if(!closed)cleanup();});return{iframe,destroy:cleanup};
}
