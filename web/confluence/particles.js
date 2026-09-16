import {particleTarget,project16} from './identity.mjs';
const vertex=`precision highp float;attribute vec3 position;attribute float salt;uniform vec2 resolution;uniform float time;uniform float yaw;uniform float pitch;uniform float zoom;uniform float offset;uniform float pulse;uniform mediump float halo;varying mediump float light;varying mediump float tint;void main(){vec3 p=position;float cy=cos(yaw),sy=sin(yaw),cx=cos(pitch),sx=sin(pitch);p.xz=mat2(cy,-sy,sy,cy)*p.xz;p.yz=mat2(cx,-sx,sx,cx)*p.yz;float depth=3.5-p.z;float scale=2.35/depth;vec2 q=p.xy*scale*zoom;q.x*=resolution.y/resolution.x;q.x+=offset;gl_Position=vec4(q,0.,1.);gl_PointSize=(2.1+salt*2.0+pulse*2.)*(1.+halo*3.)*min(resolution.y/780.,1.6)*scale;light=(.28+salt*.7)*(.75+p.z*.19);tint=salt;}`;
const fragment=`precision mediump float;varying mediump float light;varying mediump float tint;uniform vec3 primary;uniform vec3 secondary;uniform mediump float halo;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float a=(exp(-d*d*7.)*.65+pow(1.-d,3.)*.8)*light*mix(1.7,.065,halo);vec3 c=mix(primary,secondary,smoothstep(.80,1.,tint));c=mix(c,vec3(1.),.12*(1.-halo));gl_FragColor=vec4(c,a);}`;
function rgb(h){const f=n=>{const k=(n+h/30)%12;return .66-.33*Math.max(-1,Math.min(k-3,9-k,1));};return [f(0),f(8),f(4)];}
export class ParticleField{
 constructor(canvas,id){this.canvas=canvas;this.id=id;this.mode='home';this.count=innerWidth<700?16000:32000;this.pos=new Float32Array(this.count*3);this.target=new Float32Array(this.count*3);this.salt=Float32Array.from({length:this.count},(_,i)=>(i*16807%65535)/65535);this.time=0;this.yaw=0;this.pitch=-.18;this.zoom=1;this.offset=0;this.open=false;this.motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;this.pulse=0;this.audio=0;this.active=true;this.frames=0;this.setMode('home',true);this.init();this.bind();this.resize();this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);}
 init(){
  let gl,program;const shaders=[];this.gl=null;this.fallback=null;
  try{
   gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'high-performance'});
   if(!gl)throw Error('WebGL unavailable');
   const compile=(type,source)=>{const shader=gl.createShader(type);if(!shader)throw Error('Shader allocation failed');shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)||'Shader compilation failed');return shader;};
   program=gl.createProgram();if(!program)throw Error('Program allocation failed');
   gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Shader linking failed');
   this.pb=gl.createBuffer();this.sb=gl.createBuffer();if(!this.pb||!this.sb)throw Error('Particle buffer allocation failed');
   this.uniforms=Object.fromEntries(['resolution','time','yaw','pitch','zoom','offset','pulse','halo','primary','secondary'].map(k=>[k,gl.getUniformLocation(program,k)]));
   gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,this.sb);gl.bufferData(gl.ARRAY_BUFFER,this.salt,gl.STATIC_DRAW);const salt=gl.getAttribLocation(program,'salt');gl.enableVertexAttribArray(salt);gl.vertexAttribPointer(salt,1,gl.FLOAT,false,0,0);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.clearColor(.0157,.0235,.0392,1);
   this.program=program;this.gl=gl;this.rendererError=null;
  }catch(error){
   this.rendererError=error.message;
   if(gl){if(this.pb)gl.deleteBuffer(this.pb);if(this.sb)gl.deleteBuffer(this.sb);if(program)gl.deleteProgram(program);}
   this.program=this.pb=this.sb=null;
   // A canvas that acquired WebGL cannot switch context type. Preserve its attributes on a fresh element.
   const next=this.canvas.cloneNode(false);this.canvas.replaceWith(next);this.canvas=next;
   this.fallback=next.getContext('2d');if(!this.fallback)throw Error('This browser cannot create a particle canvas');
  }finally{if(gl)for(const shader of shaders)gl.deleteShader(shader);}
 }
 get renderedCount(){return this.gl?this.count:Math.ceil(this.count/4);}
 bind(){this.bindCanvas();addEventListener('resize',()=>this.resize());}
 bindCanvas(){let drag;this.canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];this.canvas.setPointerCapture(e.pointerId);});this.canvas.addEventListener('pointermove',e=>{if(drag){this.yaw+=(e.clientX-drag[0])*.006;this.pitch=Math.max(-1.4,Math.min(1.4,this.pitch+(e.clientY-drag[1])*.006));drag=[e.clientX,e.clientY];}});this.canvas.addEventListener('pointerup',()=>drag=null);this.canvas.addEventListener('pointercancel',()=>drag=null);this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.5,Math.min(2.1,this.zoom-e.deltaY*.0007));},{passive:false});this.canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')this.yaw-=.1;else if(e.key==='ArrowRight')this.yaw+=.1;else if(e.key==='ArrowUp')this.pitch-=.1;else if(e.key==='ArrowDown')this.pitch+=.1;else if(e.key==='+'||e.key==='=')this.zoom=Math.min(2.1,this.zoom+.1);else if(e.key==='-')this.zoom=Math.max(.5,this.zoom-.1);else return;e.preventDefault();});this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;});this.canvas.addEventListener('webglcontextrestored',()=>{const previous=this.canvas;try{this.init();if(this.canvas!==previous)this.bindCanvas();this.resize();}catch(error){this.rendererError=error.message;}finally{this.lost=false;}});}
 resize(){const d=Math.min(devicePixelRatio||1,1.7);this.canvas.width=Math.round(innerWidth*d);this.canvas.height=Math.round(innerHeight*d);}
 setMode(mode,instant=false){this.mode=mode;for(let i=0;i<this.count;i++){const p=particleTarget(i,this.count,mode,this.id,0,this.life||0);this.target.set(p,i*3);if(instant)this.pos.set(p,i*3);}this.pulse=1;}
 setIdentity(id){this.id=id;this.setMode(this.mode);}
 tick(now){this.raf=requestAnimationFrame(this.tick);if(document.hidden||!this.active||this.lost){this.last=now;return;}const dt=Math.min(.05,(now-(this.last||now-16))/1000);this.last=now;if(this.motion)this.time+=dt;const e=this.motion?1-Math.exp(-dt*2.9):1;this.offset+=((this.open&&innerWidth>900?-.39:0)-this.offset)*e;this.pulse=Math.max(0,this.pulse-dt*.65);const [rx,ry,rz]=project16(this.id.axes,this.time);for(let i=0;i<this.pos.length;i++){const breath=this.motion?Math.sin(this.time*.5+i*.008)*.0015*(1+this.audio*8):0;this.pos[i]+=(this.target[i]-this.pos[i])*e+breath*dt;}
 const gl=this.gl;if(gl){gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.pb);gl.bufferData(gl.ARRAY_BUFFER,this.pos,gl.DYNAMIC_DRAW);const a=gl.getAttribLocation(this.program,'position');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,0,0);const u=this.uniforms;gl.uniform2f(u.resolution,this.canvas.width,this.canvas.height);gl.uniform1f(u.time,this.time);gl.uniform1f(u.yaw,this.yaw+this.time*.036+rx*.13);gl.uniform1f(u.pitch,this.pitch+ry*.08);gl.uniform1f(u.zoom,this.zoom*(1+this.audio*.12));gl.uniform1f(u.offset,this.offset);gl.uniform1f(u.pulse,this.pulse);gl.uniform3fv(u.primary,rgb(this.id.hue));gl.uniform3fv(u.secondary,rgb(this.id.secondaryHue));gl.uniform1f(u.halo,1);gl.drawArrays(gl.POINTS,0,this.count);gl.uniform1f(u.halo,0);gl.drawArrays(gl.POINTS,0,this.count);}else this.drawFallback();this.frames++;}
 drawFallback(){
  const c=this.fallback;if(!c)return;const w=this.canvas.width,h=this.canvas.height;
  c.globalAlpha=1;c.globalCompositeOperation='source-over';c.fillStyle='#04060a';c.fillRect(0,0,w,h);c.globalCompositeOperation='lighter';
  const [rx,ry]=project16(this.id.axes,this.time),yaw=this.yaw+this.time*.036+rx*.13,pitch=this.pitch+ry*.08,cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch),zoom=this.zoom*(1+this.audio*.12);
  for(let i=0;i<this.count;i+=4){
   const j=i*3,x=this.pos[j]*cy+this.pos[j+2]*sy,z0=this.pos[j+2]*cy-this.pos[j]*sy,y=this.pos[j+1]*cx+z0*sx,z=z0*cx-this.pos[j+1]*sx,scale=2.35/(3.5-z),k=h*.5*scale*zoom,px=w*(.5+this.offset*.5)+x*k,py=h*.5-y*k,size=Math.max(1,(2.1+this.salt[i]*2+this.pulse*2)*Math.min(h/780,1.6)*scale);
   c.fillStyle=`hsl(${this.salt[i]>.8?this.id.secondaryHue:this.id.hue} 65% 78%)`;
   c.globalAlpha=.025;c.fillRect(px-size*1.5,py-size*1.5,size*3,size*3);c.globalAlpha=.28+this.salt[i]*.5;c.fillRect(px-size*.35,py-size*.35,size*.7,size*.7);
  }
  c.globalAlpha=1;c.globalCompositeOperation='source-over';
 }
}
