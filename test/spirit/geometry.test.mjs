import test from 'node:test';
import assert from 'node:assert/strict';
import {spiritLayout,spiritPoint,surfacePoint,modeNumber} from '../../web/spirit/geometry.mjs';
import {identityVector,CAPABILITIES} from '../../web/confluence/identity.mjs';
const id=n=>identityVector({seed:'0x'+n.repeat(32)});
test('phone, tall embedded, keyboard and desktop surfaces stay within their usable viewport',()=>{
 for(const [w,h] of [[390,844],[360,740],[945,1500],[1440,900],[1920,1080],[390,390]])for(const n of ['13','ee']){
  const l=spiritLayout(w,h,id(n)),p=l.panel;
  assert.ok(p.x>=0&&p.y>=0&&p.x+p.width<w&&p.y+p.height<h,`${w} × ${h}`);
  if(l.compact&&h>=520)assert.ok(l.heart.y+l.heart.radius<p.y);
  if(!l.compact)assert.ok(l.heart.x+l.heart.radius<p.x);
 }
});
test('the same origin reproduces a dense finite body and seeded surface; another origin changes both',()=>{
 const a=id('13'),b=id('ee'),la=spiritLayout(1440,900,a),lb=spiritLayout(1440,900,b);
 assert.deepEqual(la,spiritLayout(1440,900,id('13')));assert.notDeepEqual(la,lb);
 let interior=0,heart=0,contour=0,veins=0;
 for(let i=0;i<3000;i++){const p=spiritPoint(i,3000,a),q=surfacePoint(i,3000,a,la,'trade');assert.ok([...p,...q].every(Number.isFinite));assert.ok(Math.hypot(...p)<1.6);if(Math.hypot(...p)<.65)interior++;if(q[2]<.42)heart++;else if(q[2]<.91)contour++;else veins++;}
 assert.ok(interior>100);assert.ok(heart>1200&&contour>1400&&veins>200);
 assert.notDeepEqual(spiritPoint(321,3000,a),spiritPoint(321,3000,b));
 assert.ok(CAPABILITIES.length>10);assert.deepEqual(a.capabilities,b.capabilities);
 assert.equal(modeNumber('trade'),1);assert.equal(modeNumber('connect'),17);
});
