import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './control-harness.mjs';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('wheel starts from the original camera, then moves through one field',t=>{
 const {i,field,renderer,overlay,event:e,tick}=harness(t);const identity=JSON.stringify(renderer.state);
 overlay.listeners.wheel(e(1,0,0,{deltaY:-120,deltaMode:0}));
 assert.equal(i.active,true);assert.equal(i.camera.z,-2.6);assert(i.desiredCamera.z>-2.6);assert.equal(field.interiorState.depth,.16);
 tick(20);assert(i.camera.z>-2.6);assert.equal(renderer.targetZoom,1);assert.equal(JSON.stringify(renderer.state),identity);
});
test('one uninterrupted two-finger spread passes the surface and nucleus, then reverses',t=>{
 const {i,renderer,event:e,tick}=harness(t),g=i.gestures[0],identity=JSON.stringify(renderer.state);
 g.down(e(1,100,100));g.down(e(2,200,100));assert.equal(i.active,false);assert.equal(i.camera.z,-2.6);
 let distance=100;
 for(let j=0;j<32;j++){distance*=1.2;g.move(e(1,150-distance/2,100));g.move(e(2,150+distance/2,100));tick(6);}
 assert(i.camera.z>.12);assert.equal(g.points.size,2);assert.equal(i.active,true);
 for(let j=0;j<42;j++){distance/=1.2;g.move(e(1,150-distance/2,100));g.move(e(2,150+distance/2,100));tick(6);}
 assert(i.camera.z<-2.6);assert.equal(i.active,true);assert.equal(JSON.stringify(renderer.state),identity);
 g.up(e(1,150-distance/2,100));g.up(e(2,150+distance/2,100));assert.equal(g.points.size,0);
});
test('gesture entry respects the actual home scale including legacy minimum .45',t=>{
 const {i,renderer}=harness(t);renderer.zoom=.45;renderer.targetZoom=.8;i.takeControl();assert.equal(i.camera.z,-2.6*.48);assert.equal(i.field.interiorState.look[1],2.6*.48);assert.equal(renderer.targetZoom,.45);
});
test('blocked exterior input leaves camera and identity unchanged',t=>{
 const {i,renderer,overlay,event:e}=harness(t,{allowed:false});overlay.listeners.wheel(e(1,0,0,{deltaY:120,deltaMode:0}));assert.equal(renderer.targetZoom,1);assert.equal(i.active,false);
});
test('backward movement can pass the old outside boundary without switching scenes',t=>{
 const {i,field,routes,tick}=harness(t);i.enter({outside:true});i.zoom(-.4);tick(12);assert(i.camera.z<-2.6);assert.equal(i.active,true);assert.equal(field.interiorState.depth,.16);assert.deepEqual(routes,[]);
});
test('return home moves the camera without crossfading and restores the initial view',async t=>{
 const {i,field,renderer,tick}=harness(t,{motion:true});renderer.zoom=.8;i.enter({outside:true});i.zoom(.4);tick(20);const from=i.camera.z,p=i.leave();tick(3);assert(i.camera.z<from);assert(i.camera.z>i.homeCamera.z);assert.equal(field.interiorState.depth,.16);tick(20);await p;assert.equal(i.active,false);assert.equal(field.interiorState,null);assert.equal(i.camera.z,-2.6*.8);assert.equal(renderer.zoom,.8);
});
test('opening a function retains the same exploration camera for resume',async t=>{
 const {i,field,tick}=harness(t,{motion:true});i.enter({outside:true});i.zoom(.4);tick(20);const camera={...i.camera},reference=i.referenceDistance;await i.leave({remember:true});assert.deepEqual(i.savedCamera,camera);i.enter({resume:true});assert.deepEqual(i.camera,camera);assert.equal(i.referenceDistance,reference);assert.equal(field.interiorState.depth,.16);
});
test('Show whole returns to the original camera and explicit entry remains available',async t=>{
 const {i,renderer,routes,overlay,event:e}=harness(t);overlay.listeners.dblclick(e());assert(i.active);i.returnToExterior();await settle();assert.deepEqual(routes,['home']);assert.equal(i.active,false);assert.equal(renderer.original,false);
});

test('an instrument suspends the same rendered camera without a home frame',async t=>{
 const {i,field,tick}=harness(t,{motion:true});i.enter({outside:true});i.zoom(.9);tick(30);
 const before=structuredClone(field.interiorState);await i.leave({remember:true});
 assert.deepEqual(field.interiorState.camera,before.camera);assert.deepEqual(field.interiorState.look,before.look);assert.equal(field.interiorState.focus,before.focus);assert.equal(field.interiorState.moving,false);
 tick(20);assert.deepEqual(field.interiorState.camera,before.camera);
 i.enter({resume:true});assert.deepEqual(field.interiorState.camera,before.camera);
});
test('motion pause leaves wheel navigation live and preserves the artwork clock',t=>{
 const {i,field,renderer,tick}=harness(t,{motion:false});const clock=renderer.time,identity=structuredClone(renderer.state);
 i.zoom(.5);const start=i.camera.z;tick(20);assert(i.camera.z>start);assert.equal(renderer.time,clock);assert.equal(field.interiorState.audio,0);assert.deepEqual(renderer.state,identity);
});
test('a hidden page resolves a pending camera return without trapping navigation',async t=>{
 const {i,field,tick}=harness(t,{motion:true});i.enter();tick(15);const pending=i.leave();document.hidden=true;document.events.visibilitychange();await pending;
 assert.equal(i.active,false);assert.equal(field.interiorState,null);assert.equal(i.exiting,false);
});
