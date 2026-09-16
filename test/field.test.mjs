import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),wasm=fs.readFileSync(new URL('render/field.wasm',root));
const instantiate=async()=>(await WebAssembly.instantiate(wasm,{math:{sin:Math.sin,cos:Math.cos,exp:Math.exp,pow:Math.pow,atan2:Math.atan2}})).instance.exports;
const params=[.3,.6,.7,.2,.55,.4,.77,.66,.1,.9,.3,.5,12,0,0,0,0,0,1,.5,.5,0,0];
const setup=e=>params.forEach((v,i)=>e.set_param(i,v));
function capture(e,w=72,h=48){assert.equal(e.render(w,h,.46),1);return new Uint8Array(e.memory.buffer,e.buffer_ptr(),w*h*4).slice();}
const fingerprint=b=>createHash('sha256').update(b).digest('hex');
test('Wasm field instantiates with only pure math imports',async()=>{const module=new WebAssembly.Module(wasm);assert(WebAssembly.Module.imports(module).every(x=>x.module==='math'));const e=await instantiate();assert.equal(typeof e.render_region,'function');assert(e.memory.buffer.byteLength<=3145728);});
test('portable field produces deterministic nonempty RGBA pixels',async()=>{const e=await instantiate();setup(e);const a=capture(e),b=capture(e);assert.deepEqual(a,b);assert(a.some((v,i)=>i%4!==3&&v>100));assert(a.filter((v,i)=>i%4!==3).some(v=>v<20));assert(a.every((v,i)=>i%4!==3||v===255));});
test('four independently evaluated tiles exactly match a full framebuffer',async()=>{const e=await instantiate();setup(e);const expected=capture(e),out=new Uint8Array(expected.length);for(let i=0;i<4;i++){assert.equal(e.render_region(72,48,.46,i*12,(i+1)*12),1);out.set(new Uint8Array(e.memory.buffer,e.buffer_ptr(),72*12*4),i*72*12*4);}assert.deepEqual(out,expected);});
test('genome, sovereignty, fourth axis, and time each change actual pixels',async()=>{const e=await instantiate();setup(e);const a=fingerprint(capture(e));for(const [i,value]of [[4,.95],[13,1],[15,1],[12,23]]){setup(e);e.set_param(i,value);assert.notEqual(fingerprint(capture(e)),a,'uniform index '+i+' must affect rendered pixels');}});
test('rendering rejects invalid sizes and out-of-bounds tile requests',async()=>{const e=await instantiate();setup(e);for(const [w,h]of [[0,1],[-1,48],[961,48],[72,641]])assert.equal(e.render(w,h,.46),0);assert.equal(e.render_region(72,48,.46,-1,12),0);assert.equal(e.render_region(72,48,.46,0,49),0);assert.equal(e.render_region(72,48,.46,10,9),0);e.set_param(-1,1);e.set_param(99,1);assert.equal(e.render(2,2,.46),1);});
test('GLSL source contains the exact shared optical field rather than a different fallback',()=>{const shared=fs.readFileSync(new URL('render/field.inc',root),'utf8'),shader=fs.readFileSync(new URL('render/field.frag',root),'utf8');assert(shader.includes(shared));assert.match(shared,/originalTrap/);assert.match(shared,/transmit\*=1\.0-opacity/);});
