#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · probe-render-native — the same field, on a CPU, counted exactly

  Two measurements the EVM number needs as a denominator:
    1. how long one frame of the real field takes in float64 on one core;
    2. the EXACT count of multiplies, adds, comparisons and square roots in
       one 512x512 frame — a measured floor on any instruction count, on
       any machine, including a zkVM guest.

  Run:  node tools/probe-render-native.mjs
───────────────────────────────────────────────────────────────────────────*/

await (async () => {
const R=[1,0.21,0,0, -0.21,1,0,0, 0,0,1,0.13, 0,0,-0.13,1];
const WL=0.17, B=0.82;
let OPS=0;
function solid(px,py,pz){
  const w=WL;
  const qx=R[0]*px+R[4]*py+R[8]*pz+R[12]*w;
  const qy=R[1]*px+R[5]*py+R[9]*pz+R[13]*w;
  const qz=R[2]*px+R[6]*py+R[10]*pz+R[14]*w;
  const qw=R[3]*px+R[7]*py+R[11]*pz+R[15]*w;
  const dx=Math.abs(qx)-B, dy=Math.abs(qy)-B, dz=Math.abs(qz)-B, dw=Math.abs(qw)-B;
  const mxx=Math.max(dx,0),myy=Math.max(dy,0),mzz=Math.max(dz,0),mww=Math.max(dw,0);
  const l=Math.sqrt(mxx*mxx+myy*myy+mzz*mzz+mww*mww);
  const vm=Math.max(Math.max(dx,dy),Math.max(dz,dw));
  return l+Math.min(vm,0);
}
const cA=0.94,sA=0.33,cB=0.71,sB=0.70,cC=0.71,sC=-0.70,cD=0.88,sD=0.47;
function ring(px,py,pz,rad,tube,c1,s1,c2,s2){
  let qy=c1*py-s1*pz, qz=s1*py+c1*pz;
  const qx=c2*px-s2*qz; qz=s2*px+c2*qz;
  const a=Math.sqrt(qx*qx+qz*qz)-rad;
  return Math.sqrt(a*a+qy*qy)-tube;
}
const NODES=[]; for(let i=0;i<12;i++) NODES.push([i*0.21-1.2, i*0.13-0.8, i*0.17-1.0]);
function map(px,py,pz){
  let res=solid(px,py,pz);
  const r=Math.min(ring(px,py,pz,2.62,0.0040,cA,sA,cB,sB), ring(px,py,pz,2.02,0.0032,cC,sC,cD,sD));
  if(r<res) res=r;
  for(let i=0;i<12;i++){
    const n=NODES[i], ax=px-n[0],ay=py-n[1],az=pz-n[2];
    const d=Math.sqrt(ax*ax+ay*ay+az*az)-0.052;
    if(d<res) res=d;
  }
  return res;
}
function renderFrame(W,H,STEPS){
  let taps=0, hits=0, stepsTaken=0;
  const eye=[0,0,5.4];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const u=(x+0.5-0.5*W)/H, v=(y+0.5-0.5*H)/H;
    let rx=u, ry=v, rz=-1.42; const L=Math.hypot(rx,ry,rz); rx/=L; ry/=L; rz/=L;
    let t=0, hit=false;
    for(let i=0;i<STEPS;i++){
      const d=map(eye[0]+rx*t, eye[1]+ry*t, eye[2]+rz*t); taps++; stepsTaken++;
      // tier 3 also taps the aura + ghost field once per step
      solid(eye[0]+rx*t, eye[1]+ry*t+0.30, eye[2]+rz*t); taps++;
      solid(eye[0]+rx*t, eye[1]+ry*t, eye[2]+rz*t+0.30); taps++;
      if(d<0.0009*(1+t*0.35)){ hit=true; break; }
      t+=d;
      if(t>18) break;
    }
    if(hit){
      for(let i=0;i<4;i++){ map(eye[0]+rx*t+i*1e-4, eye[1]+ry*t, eye[2]+rz*t); taps++; }   // grad3
      for(let i=0;i<26;i++){ map(eye[0]+rx*t, eye[1]+ry*t+i*0.02, eye[2]+rz*t); taps++; }  // shadow
      for(let i=0;i<5;i++){ map(eye[0]+rx*t, eye[1]+ry*t, eye[2]+rz*t+i*0.05); taps++; }   // ao
      hits++;
    }
  }
  return {taps,hits,stepsTaken};
}
// warm up
renderFrame(64,64,190);
const N=256;
const t0=process.hrtime.bigint();
const r=renderFrame(N,N,190);
const t1=process.hrtime.bigint();
const ms=Number(t1-t0)/1e6;
const px=N*N;
console.log(JSON.stringify({
  res:N, pixels:px, ms, msPerPixel: ms/px,
  taps:r.taps, tapsPerPixel:r.taps/px, hits:r.hits, hitRate:r.hits/px,
  avgMarchSteps: r.stepsTaken/px,
  frame512: { pixels:512*512, ms: ms/px*512*512, taps: r.taps/px*512*512 },
  frame4k:  { pixels:3840*2160, ms: ms/px*3840*2160 }
}, null, 2));

})();
console.log("\n─── exact operation count, one 512x512 frame ───");
await (async () => {
let MUL=0,ADD=0,SQRT=0,CMP=0;
const R=[1,0.21,0,0,-0.21,1,0,0,0,0,1,0.13,0,0,-0.13,1], WL=0.17, B=0.82;
const sq=x=>{SQRT++;return Math.sqrt(x);};
function solid(px,py,pz){
  MUL+=16; ADD+=12;
  const qx=R[0]*px+R[4]*py+R[8]*pz+R[12]*WL, qy=R[1]*px+R[5]*py+R[9]*pz+R[13]*WL;
  const qz=R[2]*px+R[6]*py+R[10]*pz+R[14]*WL, qw=R[3]*px+R[7]*py+R[11]*pz+R[15]*WL;
  ADD+=4; CMP+=4;
  const dx=Math.abs(qx)-B,dy=Math.abs(qy)-B,dz=Math.abs(qz)-B,dw=Math.abs(qw)-B;
  CMP+=4; MUL+=4; ADD+=3;
  const a=Math.max(dx,0),b=Math.max(dy,0),c=Math.max(dz,0),d=Math.max(dw,0);
  const l=sq(a*a+b*b+c*c+d*d);
  CMP+=4; ADD+=1;
  return l+Math.min(Math.max(Math.max(dx,dy),Math.max(dz,dw)),0);
}
const cA=.94,sA=.33,cB=.71,sB=.70,cC=.71,sC=-.70,cD=.88,sD=.47;
function ring(px,py,pz,rad,tube,c1,s1,c2,s2){
  MUL+=8; ADD+=4;
  let qy=c1*py-s1*pz, qz=s1*py+c1*pz;
  const qx=c2*px-s2*qz; qz=s2*px+c2*qz;
  MUL+=2; ADD+=1; const a=sq(qx*qx+qz*qz)-rad; ADD+=1;
  MUL+=2; ADD+=1; return sq(a*a+qy*qy)-tube; 
}
const NODES=[]; for(let i=0;i<12;i++) NODES.push([i*.21-1.2,i*.13-.8,i*.17-1.0]);
function map(px,py,pz){
  let res=solid(px,py,pz);
  const rA=ring(px,py,pz,2.62,.004,cA,sA,cB,sB), rB=ring(px,py,pz,2.02,.0032,cC,sC,cD,sD);
  CMP+=2; const r=Math.min(rA,rB); if(r<res)res=r;
  for(let i=0;i<12;i++){ const n=NODES[i];
    ADD+=3; MUL+=3; ADD+=2;
    const ax=px-n[0],ay=py-n[1],az=pz-n[2];
    const d=sq(ax*ax+ay*ay+az*az)-.052; ADD+=1; CMP+=1;
    if(d<res)res=d; }
  return res;
}
function frame(W,H,STEPS){
  const eye=[0,0,5.4];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const u=(x+.5-.5*W)/H, v=(y+.5-.5*H)/H;
    let rx=u,ry=v,rz=-1.42; MUL+=3;ADD+=2;SQRT++; const L=Math.hypot(rx,ry,rz); MUL+=3; rx/=L;ry/=L;rz/=L;
    let t=0,hit=false;
    for(let i=0;i<STEPS;i++){
      MUL+=3; ADD+=3;
      const d=map(eye[0]+rx*t,eye[1]+ry*t,eye[2]+rz*t);
      solid(eye[0]+rx*t,eye[1]+ry*t+.3,eye[2]+rz*t); MUL+=3;ADD+=4;
      solid(eye[0]+rx*t,eye[1]+ry*t,eye[2]+rz*t+.3); MUL+=3;ADD+=4;
      CMP+=1; MUL+=1; ADD+=1;
      if(d<0.0009*(1+t*0.35)){hit=true;break;}
      t+=d; ADD+=1; CMP+=1; if(t>18)break;
    }
    if(hit){ for(let i=0;i<4;i++) map(eye[0]+rx*t+i*1e-4,eye[1]+ry*t,eye[2]+rz*t);
             for(let i=0;i<26;i++) map(eye[0]+rx*t,eye[1]+ry*t+i*.02,eye[2]+rz*t);
             for(let i=0;i<5;i++) map(eye[0]+rx*t,eye[1]+ry*t,eye[2]+rz*t+i*.05); }
  }
}
const N=128; frame(N,N,190);
const px=N*N, s=512*512/px;
const per=v=>v/px;
console.log(JSON.stringify({
  sampled:`${N}x${N}`,
  perPixel:{ mul:per(MUL), add:per(ADD), sqrt:per(SQRT), cmp:per(CMP), total:per(MUL+ADD+SQRT+CMP) },
  frame512:{ mul:MUL*s, add:ADD*s, sqrt:SQRT*s, cmp:CMP*s, totalOps:(MUL+ADD+SQRT+CMP)*s },
}, (k,v)=> typeof v==="number"? Math.round(v): v, 2));
// RV32IM instruction floor: 64-bit fixed-point mul = ~4 instrs (mulhu+mul+shifts),
// add = 2, cmp/branch = 2, sqrt (Babylonian, 7 iters of a 64-bit divide) = ~7*40 = 280
const F=(MUL*4 + ADD*2 + CMP*2 + SQRT*280)*s;
console.log("RV32IM instruction floor for one 512x512 frame:", F.toExponential(3));
for(const [n,hz] of [["RISC Zero Bonsai ~1e6 cyc/s",1e6],["SP1 Hypercube-class ~3e7 cyc/s (16 GPUs)",3e7]])
  console.log(`  prove one frame at ${n}: ${(F/hz).toFixed(0)} s = ${(F/hz/60).toFixed(1)} min`);

})();
