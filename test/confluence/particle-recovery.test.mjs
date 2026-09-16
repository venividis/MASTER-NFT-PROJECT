import test from 'node:test';import assert from 'node:assert/strict';
import {ParticleField} from '../../web/confluence/particles.js';import {identityVector} from '../../web/confluence/identity.mjs';

// A strict shader-interface check plus browser context exclusivity, not a GPU emulator.
function declarations(source){
 const precision=source.match(/precision\s+(highp|mediump|lowp)\s+float/)[1];
 return new Map([...source.matchAll(/(uniform|varying)\s+(?:(highp|mediump|lowp)\s+)?(float|vec[234])\s+(\w+)/g)].map(m=>[m[1]+':'+m[4],{precision:m[2]||precision,type:m[3],explicit:!!m[2]}]));
}
function fixture(options={}){
 const config={failLink:false,noGL:false,...options},shaders=[],draws=[],removed=[],fills=[];
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,FLOAT:8,BLEND:9,SRC_ALPHA:10,ONE:11,COLOR_BUFFER_BIT:12,POINTS:13,
  createShader:type=>{const s={type};shaders.push(s);return s;},shaderSource:(s,text)=>s.source=text,compileShader(){},getShaderParameter:()=>true,getShaderInfoLog:()=>'',
  createProgram:()=>({shaders:[]}),attachShader:(p,s)=>p.shaders.push(s),linkProgram(p){const a=declarations(p.shaders[0].source),b=declarations(p.shaders[1].source);p.linked=!config.failLink&&[...a].every(([key,v])=>!b.has(key)||(b.get(key).precision===v.precision&&b.get(key).type===v.type));},
  getProgramParameter:p=>p.linked,getProgramInfoLog:()=>"Precisions of uniform 'halo' differ between VERTEX and FRAGMENT shaders.",
  createBuffer:()=>({}),getUniformLocation:(_p,k)=>k,getAttribLocation:(_p,k)=>k==='position'?0:1,deleteShader:s=>removed.push(s),deleteBuffer(){},deleteProgram(){},
  drawArrays:(_mode,_first,count)=>draws.push(count)
 };
 for(const key of ['useProgram','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','enable','blendFunc','clearColor','viewport','clear','uniform2f','uniform1f','uniform3fv'])gl[key]=()=>{};
 const context={fillRect:(...args)=>fills.push(args)};
 class Canvas{
  constructor(){this.id='cf-field';this.width=300;this.height=150;this.listeners=new Map();this.contextType=null;}
  getContext(type){if(this.contextType&&this.contextType!==type)return null;if(type==='webgl'&&config.noGL)return null;this.contextType=type;return type==='2d'?context:gl;}
  cloneNode(){return new Canvas();}replaceWith(next){this.replacement=next;}
  addEventListener(type,fn){this.listeners.set(type,fn);}setPointerCapture(){}
  dispatch(type,event={}){this.listeners.get(type)?.(event);}
 }
 return {config,gl,shaders,draws,fills,removed,canvas:new Canvas()};
}
function environment(run){
 const values={innerWidth:390,innerHeight:844,devicePixelRatio:1,document:{hidden:false},matchMedia:()=>({matches:false}),requestAnimationFrame:()=>1,addEventListener:()=>{}};
 const previous=Object.fromEntries(Object.keys(values).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{Object.assign(globalThis,values);return run();}finally{for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}
const identity=()=>identityVector({seed:'0x'+'13'.repeat(32)});
test('mobile shader stages explicitly agree on every shared uniform and varying',()=>environment(()=>{
 const f=fixture(),field=new ParticleField(f.canvas,identity());assert.equal(field.gl,f.gl);
 const vertex=declarations(f.shaders[0].source),fragment=declarations(f.shaders[1].source);
 for(const name of ['uniform:halo','varying:light','varying:tint']){assert.deepEqual(vertex.get(name),fragment.get(name));assert.equal(vertex.get(name).explicit,true);}
 field.tick(16);assert.deepEqual(f.draws,[16000,16000]);assert.equal(f.removed.length,2);
}));
test('failed linking moves to a fresh canvas, renders and preserves orbit/zoom controls',()=>environment(()=>{
 const f=fixture({failLink:true}),field=new ParticleField(f.canvas,identity());assert.equal(field.gl,null);assert.notEqual(field.canvas,f.canvas);assert.equal(field.canvas.id,'cf-field');assert.equal(f.canvas.getContext('2d'),null);assert.equal(field.canvas.contextType,'2d');assert.equal(field.renderedCount,4000);
 field.tick(16);assert.ok(f.fills.length>4000);const before=f.fills.slice(1,20);f.fills.length=0;
 field.canvas.dispatch('pointerdown',{clientX:0,clientY:0,pointerId:1});field.canvas.dispatch('pointermove',{clientX:20,clientY:30});field.canvas.dispatch('pointerup');field.canvas.dispatch('wheel',{deltaY:-200,preventDefault(){}});assert.ok(field.zoom>1);assert.ok(field.pitch>-.18);
 field.drawFallback();assert.notDeepEqual(f.fills.slice(1,20),before);assert.equal(field.frames,1);
}));
test('a failed context restoration resumes through fallback on a rebound canvas',()=>environment(()=>{
 const f=fixture(),field=new ParticleField(f.canvas,identity());let prevented=false;field.canvas.dispatch('webglcontextlost',{preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(field.lost,true);
 field.tick(16);assert.equal(field.frames,0);f.config.failLink=true;field.canvas.dispatch('webglcontextrestored');assert.equal(field.lost,false);assert.equal(field.gl,null);assert.ok(field.canvas.listeners.has('pointerdown'));field.tick(32);assert.equal(field.frames,1);assert.ok(f.fills.length>4000);
}));
test('devices without WebGL initialize the same functional canvas path',()=>environment(()=>{
 const f=fixture({noGL:true}),field=new ParticleField(f.canvas,identity());assert.equal(field.gl,null);field.setMode('vault');field.tick(16);assert.equal(field.mode,'vault');assert.equal(field.frames,1);assert.ok(f.fills.length>4000);
}));
