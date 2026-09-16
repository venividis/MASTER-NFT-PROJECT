// One camera convention shared with the renderer. Screen right is local -X.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const MIN_SPEED=.3;
export function lookAt(x,y,z,target=[0,0,0]){const dx=target[0]-x,dy=target[1]-y,dz=target[2]-z;return {x,y,z,yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz)),focus:Math.hypot(dx,dy,dz)};}
export const insidePose=()=>lookAt(0,.12,-.62,[.35,.02,.45]);
export const outsidePose=()=>lookAt(0,0,-2.6);
export function constrainCamera(camera){
 const c={...camera,focus:camera.focus??Math.hypot(camera.x,camera.y,camera.z)};
 for(const k of ['x','y','z','yaw','pitch','focus'])if(!Number.isFinite(c[k]))throw Error('Camera coordinates must be finite');
 for(const k of ['x','y','z','focus'])c[k]=clamp(c[k],-100,100);
 c.pitch=clamp(c.pitch,-Math.PI/2+.001,Math.PI/2-.001);c.yaw=Math.atan2(Math.sin(c.yaw),Math.cos(c.yaw));return c;
}
export function cameraBasis(c){const sy=Math.sin(c.yaw),cy=Math.cos(c.yaw),sp=Math.sin(c.pitch),cp=Math.cos(c.pitch);return {right:[-cy,0,sy],up:[sy*sp,cp,cy*sp],forward:[-sy*cp,sp,-cy*cp]};}
export function cameraScale(camera){return Math.hypot(camera.focus??Math.hypot(camera.x,camera.y,camera.z),MIN_SPEED);}
function translate(c,basis,amount){c.x+=basis[0]*amount;c.y+=basis[1]*amount;c.z+=basis[2]*amount;}
export function dollyCamera(camera,amount){
 if(!Number.isFinite(amount))throw Error('Zoom must be finite');const c=constrainCamera(camera);
 // Exact integration of d(focus)/ds=-sqrt(focus²+MIN_SPEED²): inverse gestures
 // undo one another, independent of how many pointer events delivered them.
 const next=clamp(MIN_SPEED*Math.sinh(Math.asinh(c.focus/MIN_SPEED)-clamp(amount,-12,12)),-100,100);
 translate(c,cameraBasis(c).forward,c.focus-next);c.focus=next;return constrainCamera(c);
}
export function lookCamera(camera,dx,dy,height){
 if(![dx,dy,height].every(Number.isFinite)||height<=0)throw Error('Invalid look movement');
 const c=constrainCamera(camera),radians=3.2/(2.6*height);
 c.yaw-=dx*radians;c.pitch+=dy*radians;return constrainCamera(c);
}
export function panCamera(camera,dx,dy){
 if(!Number.isFinite(dx)||!Number.isFinite(dy))throw Error('Pan must be finite');
 const c=constrainCamera(camera),b=cameraBasis(c),s=Math.max(MIN_SPEED,Math.abs(c.focus))*3.2/2.6;
 // Grab the scene: content follows a rightward/downward two-finger drag.
 translate(c,b.right,-dx*s);translate(c,b.up,dy*s);return constrainCamera(c);
}
export function advanceCamera(camera,input,dt){
 if(!Number.isFinite(dt)||dt<0)throw Error('Camera time step must be finite and nonnegative');
 let c=constrainCamera(camera);const elapsed=Math.min(dt,.05),speed=elapsed*.7*(input.fast?2.4:1);
 const f=clamp(Number(input.forward)||0,-1,1),side=clamp(Number(input.side)||0,-1,1),up=clamp(Number(input.up)||0,-1,1),n=Math.max(1,Math.hypot(f,side,up));
 c=dollyCamera(c,f*speed/n);const b=cameraBasis(c),step=speed*cameraScale(c)/n;
 translate(c,b.right,side*step);translate(c,b.up,up*step);
 c.yaw+=(Number(input.turn)||0)*elapsed*.9;c.pitch+=(Number(input.look)||0)*elapsed*.65;return constrainCamera(c);
}
export function mixCamera(from,to,mix){const out={};for(const k of ['x','y','z','pitch','focus'])out[k]=from[k]+(to[k]-from[k])*mix;out.yaw=from.yaw+Math.atan2(Math.sin(to.yaw-from.yaw),Math.cos(to.yaw-from.yaw))*mix;return out;}
export function easeCamera(from,to,progress){const x=clamp(progress,0,1);return mixCamera(from,to,x*x*(3-2*x));}
export function followCamera(from,to,dt,tau=.085){
 if(!Number.isFinite(dt)||dt<0)throw Error('Camera time step must be finite and nonnegative');
 const result=mixCamera(from,to,1-Math.exp(-dt/tau));
 if(['x','y','z','pitch','focus'].every(k=>Math.abs(result[k]-to[k])<.00001)&&Math.abs(Math.atan2(Math.sin(result.yaw-to.yaw),Math.cos(result.yaw-to.yaw)))<.00001)return {...to};
 return result;
}
