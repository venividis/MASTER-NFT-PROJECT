import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './control-harness.mjs';
const close=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} differs from ${b}`);
test('the beginning uses the actual original drag handlers and opens no other interface',t=>{
 const {i,renderer,overlay,event:e,classes}=harness(t),x=renderer.targetX,y=renderer.targetY;
 overlay.listeners.pointerdown(e(1,100,100));overlay.listeners.pointermove(e(1,140,130));
 close(renderer.targetX,x+30*.003);close(renderer.targetY,y+40*.0035);assert.deepEqual(renderer.targetPointer,[.14,1-130/700]);
 assert.equal(i.active,false);assert.equal(i.field.interiorState,undefined);assert.equal(classes.size,0);
 overlay.listeners.pointerup(e(1,140,130));const after=renderer.targetY;overlay.listeners.pointermove(e(1,200,130));close(renderer.targetY,after);
});
test('zoomed dragging continues through those same original handlers',t=>{
 const {i,renderer,overlay,event:e,tick,classes}=harness(t);i.zoom(1);tick(20);const pose={...i.desiredCamera},x=renderer.targetX,y=renderer.targetY;
 overlay.listeners.pointerdown(e(1,100,100));overlay.listeners.pointermove(e(1,140,130));
 close(renderer.targetX,x+30*.003);close(renderer.targetY,y+40*.0035);assert.deepEqual(i.desiredCamera,pose);assert.equal(classes.size,0);
});
test('zoom preserves the original pending rotation and pointer easing',t=>{
 const {i,renderer}=harness(t),pending=[renderer.targetX,renderer.targetY,...renderer.targetPointer];i.zoom(.4);assert.deepEqual([renderer.targetX,renderer.targetY,...renderer.targetPointer],pending);
});
test('pinch moves straight through the object without changing aim or panning',t=>{
 const {i,renderer,overlay,event:e,tick}=harness(t),rotation=[renderer.targetX,renderer.targetY];
 overlay.listeners.pointerdown(e(1,100,300));overlay.listeners.pointerdown(e(2,300,300));assert.equal(i.active,false);
 overlay.listeners.pointermove(e(1,90,340));overlay.listeners.pointermove(e(2,350,340));tick(8);
 assert(i.camera.z>-2.6);close(i.camera.x,0);close(i.camera.y,0);close(i.camera.pitch,0);close(Math.abs(i.camera.yaw),Math.PI);assert.deepEqual([renderer.targetX,renderer.targetY],rotation);
});
test('a two-finger translation does not become a pan or turn',t=>{
 const {i,renderer,overlay,event:e,tick}=harness(t),rotation=[renderer.targetX,renderer.targetY];
 overlay.listeners.pointerdown(e(1,100,300));overlay.listeners.pointerdown(e(2,300,300));overlay.listeners.pointermove(e(1,140,340));overlay.listeners.pointermove(e(2,340,340));tick();
 assert.equal(i.active,false);assert.deepEqual([renderer.targetX,renderer.targetY],rotation);
});
test('pinch release clears native drag and suppresses the trailing finger',t=>{
 const {i,renderer,overlay,event:e,tick}=harness(t);
 overlay.listeners.pointerdown(e(1,100,300));overlay.listeners.pointerdown(e(2,300,300));overlay.listeners.pointermove(e(2,350,300));tick();overlay.listeners.pointerup(e(2,350,300));
 const rotation=[renderer.targetX,renderer.targetY];overlay.listeners.pointermove(e(1,160,360));assert.deepEqual([renderer.targetX,renderer.targetY],rotation);overlay.listeners.pointerup(e(1,160,360));
 overlay.listeners.pointerdown(e(3,160,360));overlay.listeners.pointermove(e(3,180,360));close(renderer.targetY,rotation[1]+20*.0035);assert(i.active);
});
test('cancel drops queued zoom and clears the native drag closure',t=>{
 const {i,renderer,overlay,event:e,tick}=harness(t);overlay.listeners.pointerdown(e(1,100,300));overlay.listeners.pointerdown(e(2,300,300));overlay.listeners.pointermove(e(2,350,300));overlay.listeners.pointercancel(e(2,350,300));tick();assert.equal(i.active,false);
 const y=renderer.targetY;overlay.listeners.pointermove(e(1,140,330));close(renderer.targetY,y);
});
test('double-tap zooms once and a two-finger tap does nothing',t=>{
 const {i,overlay,event:e}=harness(t);overlay.listeners.pointerdown(e(1,100,300));overlay.listeners.pointerdown(e(2,300,300));overlay.listeners.pointerup(e(1,100,300));overlay.listeners.pointerup(e(2,300,300));assert.equal(i.active,false);
 overlay.listeners.pointerdown(e(1));overlay.listeners.pointerup(e(1));overlay.listeners.pointerdown(e(1));overlay.listeners.pointerup(e(1));assert(i.active);const z=i.desiredCamera.z;overlay.listeners.dblclick(e(1));close(i.desiredCamera.z,z);
});
test('arrows keep original object turning and WASD has no flight mapping',t=>{
 const {i,renderer,overlay,event:e,tick}=harness(t);const y=renderer.targetY;overlay.listeners.keydown(e(1,0,0,{key:'ArrowRight'}));close(renderer.targetY,y+.1);assert.equal(i.active,false);
 i.zoom(.4);tick(10);const pose={...i.desiredCamera};overlay.listeners.keydown(e(1,0,0,{key:'ArrowLeft'}));close(renderer.targetY,y);overlay.listeners.keydown(e(1,0,0,{key:'w'}));tick(10);assert.deepEqual(i.desiredCamera,pose);
});
