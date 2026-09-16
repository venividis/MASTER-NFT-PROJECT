/** Full-screen optical field. GLSL and the Wasm fallback share render/field.inc. */
export function fieldVector(hex){const s=String(hex).replace(/^0x/,'').padEnd(64,'0');return [0,1,2,3].map(i=>((parseInt(s.slice(i*8,i*8+8),16)^parseInt(s.slice((i+4)*8,(i+5)*8),16))>>>0)/4294967295);}
const workerCode=`let e;onmessage=async({data:d})=>{try{if(d.init){e=(await WebAssembly.instantiate(d.wasm,{math:{sin:Math.sin,cos:Math.cos,exp:Math.exp,pow:Math.pow,atan2:Math.atan2}})).instance.exports;postMessage({ready:true});return;}const start=performance.now();d.params.forEach((v,i)=>e.set_param(i,v));if(!e.render_region(d.w,d.h,d.center,d.y0,d.y1))throw Error('Invalid framebuffer region');const rgba=new Uint8ClampedArray(e.memory.buffer,e.buffer_ptr(),d.w*(d.y1-d.y0)*4).slice();postMessage({rgba,w:d.w,h:d.h,y0:d.y0,y1:d.y1,ms:performance.now()-start,seq:d.seq},[rgba.buffer]);}catch(e){postMessage({error:e.message});}};`;
export class OpticalField {
 constructor(canvas,overlay,state,notify=()=>{}){
  this.canvas=canvas;this.overlay=overlay;this.fx=overlay.getContext('2d');this.state=state;this.notify=notify;
  this.motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;this.reduced=!this.motion;
  this.time=12;this.pulse=0;this.eventKind=0;this.fold=0;this.foldTarget=0;this.lens=0;
  this.cameraX=0;this.cameraY=0;this.targetX=0;this.targetY=0;this.zoom=1;this.targetZoom=1;
  this.pointer=[.5,.5];this.targetPointer=[.5,.5];this.sequence=0;this.cpuBusy=false;this.lastJob=0;this.quality='auto';this.original=false;this.center=.46;
  this.params=[...fieldVector(state.seed),...fieldVector(state.genome),...fieldVector(state.root),this.time,state.sovereign?1:0,0,0,0,0,1,.5,.5,0,0];this.from=this.params.slice();this.to=this.params.slice();this.morph=1;
  this.sparks=[];this.backend='initializing';this.frames=0;this.fps=0;this.lastStamp=performance.now();this.frameCount=0;
  this.oldFrame=document.createElement('canvas');this.newFrame=document.createElement('canvas');this.oldFrame.width=0;this.newFrame.width=0;this.frameArrival=0;this.frameInterval=250;
  this.init();this.bind();this.resize();this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);
 }
 init(){
  const gl=this.canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
  if(!gl){this.initCPU();return;}
  this.gl=gl;
  try{this.program=this.makeProgram(ASSETS.shader);this.reference=this.makeProgram(ASSETS.original);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);this.backend='WebGL 2';this.notify(this.backend);}
  catch(e){this.notify('GPU compile failed · '+e.message);this.gl=null;const n=this.canvas.cloneNode(false);this.canvas.replaceWith(n);this.canvas=n;this.initCPU();}
 }
 makeProgram(fragment){const gl=this.gl;const compile=(type,s)=>{const sh=gl.createShader(type);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};const v=compile(gl.VERTEX_SHADER,'#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'),f=compile(gl.FRAGMENT_SHADER,fragment);const pr=gl.createProgram();gl.attachShader(pr,v);gl.attachShader(pr,f);gl.linkProgram(pr);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(pr));return {pr,loc:new Map(),attribute:gl.getAttribLocation(pr,'p')};}
 async initCPU(){
  this.ctx=this.canvas.getContext('2d',{alpha:false});this.backend='WASM optical field';this.notify(this.backend);
  const bytes=Uint8Array.from(atob(ASSETS.wasm),c=>c.charCodeAt(0));
  try{
   const count=Math.min(4,Math.max(1,(navigator.hardwareConcurrency||2)-1));this.workers=[];let ready=0;
   const url=URL.createObjectURL(new Blob([workerCode],{type:'text/javascript'}));
   for(let i=0;i<count;i++){const worker=new Worker(url);this.workers.push(worker);
    worker.onerror=e=>{this.cpuBusy=false;this.cpuReady=false;this.notify('Render worker unavailable: '+e.message);};
    worker.onmessage=({data:d})=>{if(d.ready){if(++ready===count)this.cpuReady=true;return;}if(d.error){this.cpuBusy=false;this.notify(d.error);return;}const job=this.cpuJob;if(!job||d.seq!==job.seq)return;job.rgba.set(d.rgba,d.y0*d.w*4);job.done++;if(job.done===count){this.cpuBusy=false;this.cpuMs=performance.now()-job.start;this.acceptCPU({...job,ms:this.cpuMs});}};
    const copy=bytes.slice();worker.postMessage({init:true,wasm:copy.buffer},[copy.buffer]);}
   URL.revokeObjectURL(url);
  }catch{this.workers?.forEach(w=>w.terminate());this.workers=null;try{const e=(await WebAssembly.instantiate(bytes,{math:{sin:Math.sin,cos:Math.cos,exp:Math.exp,pow:Math.pow,atan2:Math.atan2}})).instance.exports;this.cpu=e;this.cpuReady=true;this.backend='WASM main-thread field';this.notify(this.backend);}catch(e){this.backend='Atmosphere only';this.notify('WebAssembly unavailable: '+e.message);}}
 }
 acceptCPU(d){if(d.seq<this.acceptedSequence)return;this.acceptedSequence=d.seq;
  if(this.newFrame.width){this.oldFrame.width=this.newFrame.width;this.oldFrame.height=this.newFrame.height;this.oldFrame.getContext('2d').drawImage(this.newFrame,0,0);}
  this.newFrame.width=d.w;this.newFrame.height=d.h;this.newFrame.getContext('2d').putImageData(new ImageData(d.rgba,d.w,d.h),0,0);
  const now=performance.now();this.frameInterval=this.frameArrival?Math.min(850,Math.max(120,now-this.frameArrival)):250;this.frameArrival=now;this.frames++;
 }
 bind(){let drag=null,start;const target=this.overlay;this.cancelNativeDrag=()=>{drag=null;};target.addEventListener('lostpointercapture',this.cancelNativeDrag);target.addEventListener('pointerdown',e=>{if(e.button>0)return;drag=e.pointerId;start=[e.clientX,e.clientY];target.setPointerCapture(e.pointerId);});
  target.addEventListener('pointermove',e=>{this.dirty=true;this.targetPointer=[e.clientX/innerWidth,1-e.clientY/innerHeight];if(drag===e.pointerId){this.targetY+=(e.clientX-start[0])*.0035;this.targetX=Math.max(-1.2,Math.min(1.2,this.targetX+(e.clientY-start[1])*.003));start=[e.clientX,e.clientY];}});
  target.addEventListener('pointerup',()=>drag=null);target.addEventListener('pointercancel',()=>drag=null);
  target.addEventListener('wheel',e=>{this.dirty=true;e.preventDefault();this.targetZoom=Math.max(.45,Math.min(2,this.targetZoom+e.deltaY*.001));},{passive:false});
  target.addEventListener('keydown',e=>{this.dirty=true;if(e.key==='ArrowLeft')this.targetY-=.1;else if(e.key==='ArrowRight')this.targetY+=.1;else if(e.key==='ArrowUp')this.targetX-=.1;else if(e.key==='ArrowDown')this.targetX+=.1;else if(['+','='].includes(e.key))this.targetZoom=Math.max(.45,this.targetZoom-.1);else if(e.key==='-')this.targetZoom=Math.min(2,this.targetZoom+.1);else return;e.preventDefault();});
  addEventListener('resize',()=>this.resize());document.addEventListener('visibilitychange',()=>{this.last=0;});
  this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.notify('GPU context lost · waiting to restore');});
  this.canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.init();this.resize();});
 }
 resize(){this.width=innerWidth;this.height=innerHeight;this.center=innerWidth<700?.43:.46;const dpr=Math.min(devicePixelRatio||1,1.5);this.overlay.width=Math.round(innerWidth*dpr);this.overlay.height=Math.round(innerHeight*dpr);this.dpr=dpr;this.dirty=true;}
 setState(state,kind=0){this.state=state;this.from=this.params.slice();this.to=[...fieldVector(state.seed),...fieldVector(state.genome),...fieldVector(state.root)];this.morph=this.motion?0:1;this.eventKind=kind;this.pulse=this.motion&&kind?1:0;this.dirty=true;this.lastJob=0;}
 event(kind){this.eventKind=kind;this.pulse=this.motion?1:0;this.dirty=true;}
 reset(){this.targetX=0;this.targetY=0;this.targetZoom=1;this.foldTarget=0;this.dirty=true;}
 setReference(value){if(value&&!this.gl){this.notify('Original GPU field requires WebGL');return;}this.original=value;this.notify(this.backend+(value?' · original field':''));this.dirty=true;}
 uniforms(){const f=this.morph*this.morph*(3-2*this.morph);for(let i=0;i<12;i++)this.params[i]=this.from[i]+(this.to[i]-this.from[i])*f;
  this.params.splice(12,11,this.time,this.state.sovereign?1:0,this.pulse,this.fold,this.cameraX,this.cameraY,this.zoom,this.pointer[0],this.pointer[1],this.eventKind,this.lens);return this.params;}
 drawGL(){const gl=this.gl;const scale=this.quality==='detail'?Math.min(devicePixelRatio||1,1.5):this.quality==='economy'?.5:(this.renderScale||.9);const width=Math.max(2,Math.floor(this.width*scale)),height=Math.max(2,Math.floor(this.height*scale));if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
  const pr=this.original?this.reference:this.program;gl.viewport(0,0,width,height);gl.useProgram(pr.pr);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(pr.attribute);gl.vertexAttribPointer(pr.attribute,2,gl.FLOAT,false,0,0);
  const values=this.original?{r:[width,height],seed:this.params.slice(0,4),genome:this.params.slice(4,8),state:this.params.slice(8,12),pointer:this.pointer,t:this.time,sovereign:this.params[13],pulse:this.pulse}:{resolution:[width,height],center:this.center,seed:this.params.slice(0,4),genome:this.params.slice(4,8),root:this.params.slice(8,12),t:this.time,sovereign:this.params[13],pulse:this.pulse,fold:this.fold,cameraX:this.cameraX,cameraY:this.cameraY,zoom:this.zoom,pointerX:this.pointer[0],pointerY:this.pointer[1],eventKind:this.eventKind,lens:this.lens};
  for(const[n,v]of Object.entries(values)){if(!pr.loc.has(n))pr.loc.set(n,gl.getUniformLocation(pr.pr,n));const loc=pr.loc.get(n),a=Array.isArray(v)?v:[v];gl['uniform'+a.length+'f'](loc,...a);}gl.drawArrays(gl.TRIANGLES,0,3);this.frames++;
 }
 drawCPU(ts){if(!this.ctx)return;if(this.canvas.width!==this.width||this.canvas.height!==this.height){this.canvas.width=this.width;this.canvas.height=this.height;}
  const c=this.ctx;
  if(this.newFrame.width){c.globalAlpha=1;c.drawImage(this.oldFrame.width?this.oldFrame:this.newFrame,0,0,this.width,this.height);c.globalAlpha=this.motion?Math.min(1,(ts-this.frameArrival)/this.frameInterval):1;c.drawImage(this.newFrame,0,0,this.width,this.height);c.globalAlpha=1;}
  else{const g=c.createRadialGradient(this.width/2,this.height*this.center,0,this.width/2,this.height*this.center,this.height*.5);g.addColorStop(0,this.state.sovereign?'#ba3d6b':'#337e98');g.addColorStop(.4,'#1a1435');g.addColorStop(1,'#030408');c.fillStyle=g;c.fillRect(0,0,this.width,this.height);}
  if(!this.cpuReady||this.cpuBusy||(!this.motion&&!this.dirty)||ts-this.lastJob<(this.cpu?300:60))return;
  let h=this.quality==='detail'?500:this.quality==='economy'?160:(this.workers?320:180);let w=Math.round(h*this.width/this.height);if(w>960){h=Math.round(h*960/w);w=960;}
  this.cpuBusy=true;this.lastJob=ts;this.dirty=false;const d={params:this.params.slice(),w,h,center:this.center,seq:++this.sequence};
  if(this.workers){this.cpuJob={...d,done:0,start:performance.now(),rgba:new Uint8ClampedArray(w*h*4)};this.workers.forEach((worker,i)=>worker.postMessage({...d,y0:Math.floor(i*h/this.workers.length),y1:Math.floor((i+1)*h/this.workers.length)}));}else{d.params.forEach((v,i)=>this.cpu.set_param(i,v));const start=performance.now();this.cpu.render(w,h,this.center);this.cpuBusy=false;this.acceptCPU({...d,rgba:new Uint8ClampedArray(this.cpu.memory.buffer,this.cpu.buffer_ptr(),w*h*4).slice(),ms:performance.now()-start});}
 }
 drawAtmosphere(){const c=this.fx;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.width,this.height);if(this.original)return;const cx=this.width*.5,cy=this.height*this.center,R=this.height*.31/this.zoom;c.globalCompositeOperation='lighter';
  // Photon trajectories, not the object geometry. Exact child/receipt counts drive populations.
  const count=Math.min(130,52+this.state.nonce*3);for(let i=0;i<count;i++){const a=i*2.399963+this.time*(.022+(i%4)*.007),r=R*(1.10+(i%17)*.025),tilt=.57;const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*tilt;const alpha=.06+(Math.sin(a)+1)*.065;c.fillStyle=this.state.sovereign?`rgba(255,118,152,${alpha})`:`rgba(133,215,254,${alpha})`;c.beginPath();c.arc(x,y,i%9===0?1.2:.55,0,Math.PI*2);c.fill();}
  if(this.pulse>0){const r=R*(.8+(1-this.pulse)*1.6),alpha=this.pulse*.24;const col=this.eventKind===2?'178,138,255':this.eventKind===3?'255,193,123':this.eventKind===4?'255,94,129':'105,230,255';c.strokeStyle=`rgba(${col},${alpha})`;c.lineWidth=1;c.beginPath();c.ellipse(cx,cy,r,r*.93,0,0,Math.PI*2);c.stroke();}
  this.childPositions=[];const children=this.state.children||[];
  children.slice(0,12).forEach((ch,i)=>{const a=i*2.399963+.6+this.time*.035,r=R*1.46;const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.63;const size=9+((parseInt(ch.genome.slice(2,4),16)%6));this.childPositions.push({x,y,i});const g=c.createRadialGradient(x,y,0,x,y,size*3.4);g.addColorStop(0,'rgba(255,239,195,.85)');g.addColorStop(.13,'rgba(255,200,128,.65)');g.addColorStop(.34,'rgba(221,111,75,.16)');g.addColorStop(1,'rgba(110,67,255,0)');c.fillStyle=g;c.fillRect(x-size*4,y-size*4,size*8,size*8);c.strokeStyle='rgba(255,206,143,.28)';c.lineWidth=.65;c.beginPath();c.arc(x,y,size*.55,0,Math.PI*2);c.stroke();});
  c.globalCompositeOperation='source-over';this.onChildren?.(this.childPositions);
 }
 tick(ts){this.raf=requestAnimationFrame(this.tick);if(document.hidden||this.lost)return;for(const update of (globalThis.window?.__animaFrameSubscribers||[])){try{update(ts);}catch(error){console.error('Anima frame subscriber failed',error);}}const dt=this.last?Math.min(.05,(ts-this.last)/1000):.016;this.last=ts;
  if(this.motion){this.time+=dt;this.pulse=Math.max(0,this.pulse-dt/(this.eventKind===4?7:4.5));this.morph=Math.min(1,this.morph+dt*.35);}else{this.morph=1;this.pulse=0;}
  const e=this.motion?Math.min(1,dt*5):1;this.cameraX+=(this.targetX-this.cameraX)*e;this.cameraY+=(this.targetY-this.cameraY)*e;this.zoom+=(this.targetZoom-this.zoom)*e;this.fold+=(this.foldTarget-this.fold)*e;this.pointer=this.pointer.map((p,i)=>p+(this.targetPointer[i]-p)*e);
  if(Math.abs(this.cameraX-this.targetX)>.001||Math.abs(this.cameraY-this.targetY)>.001||Math.abs(this.zoom-this.targetZoom)>.001||Math.abs(this.fold-this.foldTarget)>.001)this.dirty=true;
  this.uniforms();if(this.gl){if(this.motion||this.dirty){this.drawGL();this.dirty=false;}}else this.drawCPU(ts);this.drawAtmosphere();
  this.frameCount++;if(ts-this.lastStamp>1800){this.fps=Math.round(this.frameCount*1000/(ts-this.lastStamp));if(this.gl&&this.quality==='auto'){if(this.fps<25)this.renderScale=Math.max(.4,(this.renderScale||.9)-.1);else if(this.fps>52)this.renderScale=Math.min(1.15,(this.renderScale||.9)+.05);}this.frameCount=0;this.lastStamp=ts;this.onStats?.({fps:this.fps,backend:this.backend,cpuMs:this.cpuMs||0,frames:this.frames});}
 }
 async portrait(){this.uniforms();if(this.gl)this.drawGL();const c=document.createElement('canvas');c.width=this.canvas.width;c.height=this.canvas.height;const x=c.getContext('2d');x.drawImage(this.canvas,0,0,c.width,c.height);x.drawImage(this.overlay,0,0,c.width,c.height);return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Image export unavailable')),'image/png'));}
 dispose(){cancelAnimationFrame(this.raf);this.workers?.forEach(w=>w.terminate());}
}
