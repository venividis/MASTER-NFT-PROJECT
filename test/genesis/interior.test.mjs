import test from 'node:test';import assert from 'node:assert/strict';
import {insidePose,outsidePose,advanceCamera,dollyCamera,panCamera,constrainCamera,easeCamera} from '../../web/genesis/interior-space.mjs';
import {createInteriorCPU} from '../../web/genesis/interior-kernel.mjs';
test('zoom can travel through the entire object and back beyond its membrane',()=>{
 let c=outsidePose();for(let i=0;i<25;i++)c=dollyCamera(c,.12);assert.ok(c.z>-.4);for(let i=0;i<40;i++)c=dollyCamera(c,.12);assert.ok(c.z>1.24);
 for(let i=0;i<120;i++)c=dollyCamera(c,-.12);assert.ok(c.z<-2.6);assert.ok(Object.values(c).every(Number.isFinite));
 assert.throws(()=>dollyCamera(c,NaN));assert.throws(()=>constrainCamera({...c,x:Infinity}));
});
test('flight crosses either side of the membrane and keeps manual controls finite',()=>{
 let c=insidePose();for(let n=0;n<20000;n++)c=advanceCamera(c,{forward:1,side:1,up:Math.sin(n*.03),turn:.5,look:.02,fast:true},.016);
 assert.ok(Object.values(c).every(Number.isFinite));assert.ok(Math.hypot(c.x,c.y,c.z)>1.24);assert.ok(Math.abs(c.pitch)<Math.PI/2);
 let a=insidePose(),b={...a};for(let n=0;n<60;n++)a=advanceCamera(a,{forward:1},1/60);for(let n=0;n<120;n++)b=advanceCamera(b,{forward:1},1/120);assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.002);
});
test('pan is camera-relative and all six directions remain available',()=>{
 const c=outsidePose();assert.ok(panCamera(c,.1,0).x<c.x);assert.ok(panCamera(c,0,.1).y>c.y);
 assert.ok(advanceCamera(c,{up:1},.05).y>c.y);assert.ok(advanceCamera(c,{up:-1},.05).y<c.y);
 const a={...c,yaw:Math.PI-.01},b={...insidePose(),yaw:-Math.PI+.01};assert.ok(Math.abs(easeCamera(a,b,.02).yaw-a.yaw)<.01);
});
test('software volume remains deterministic and responds to identity',()=>{
 const engine=createInteriorCPU(),params=[.3,.6,.7,.2,.55,.4,.77,.66,.1,.9,.3,.5,12],p=insidePose(),view={camera:[p.x,p.y,p.z,p.yaw],look:[p.pitch,0],samples:64};
 const render=()=>{engine.configure(params,view);return engine.render(16,12);};const original=render();assert.deepEqual(render(),original);params[4]=.91;assert.notDeepEqual(render(),original);params[12]=Infinity;assert.throws(render,/Invalid optical/);
});

test('dolly inversion and event subdivision agree through the nucleus',()=>{
 const a=dollyCamera(outsidePose(),3.5);assert(a.z>0);
 const back=dollyCamera(a,-3.5);for(const k of ['x','y','z','focus'])assert(Math.abs(back[k]-outsidePose()[k])<1e-10);
 let b=outsidePose();for(let j=0;j<350;j++)b=dollyCamera(b,.01);for(const k of ['x','y','z','focus'])assert(Math.abs(a[k]-b[k])<1e-10);
});
