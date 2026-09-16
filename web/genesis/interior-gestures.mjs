// Native single-finger turning passes through untouched. Only pinch owns zoom.
export class OpticalGestures {
 constructor(surfaces,{available,zoom,beginTransform,transform,size}){
  this.surfaces=Array.isArray(surfaces)?surfaces:[surfaces];this.available=available;this.zoom=zoom;this.beginTransform=beginTransform;this.transform=transform;this.size=size;this.reset();
  for(const surface of this.surfaces){
   surface.addEventListener('pointerdown',e=>this.down(e,surface),{capture:true});
   surface.addEventListener('pointermove',e=>this.move(e),{capture:true});
   surface.addEventListener('pointerup',e=>this.up(e),{capture:true});
   for(const name of ['pointercancel','lostpointercapture'])surface.addEventListener(name,e=>this.cancel(e),{capture:true});
   surface.addEventListener('dblclick',e=>{this.consume(e);if(!this.available())return;if(e.timeStamp-(this.lastTouchZoomAt??-Infinity)>600)this.zoom(.32);},{capture:true});
   surface.addEventListener('wheel',e=>{this.consume(e);if(!this.available())return;const unit=e.deltaMode===1?16:e.deltaMode===2?this.size():1;this.zoom(-Math.max(-240,Math.min(240,e.deltaY*unit))*.0015);},{capture:true,passive:false});
  }
 }
 consume(e){e.preventDefault();e.stopImmediatePropagation();}
 reset(){
  if(this.frame)cancelAnimationFrame(this.frame);this.frame=null;
  const points=this.points;this.points=new Map();
  for(const [id,p] of points||[])if(p.surface?.hasPointerCapture?.(id))p.surface.releasePointerCapture(id);
  this.startPair=null;this.afterPinch=false;this.lastTap=null;this.lastTouchZoomAt=-Infinity;
 }
 point(e,surface){return {x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,time:e.timeStamp,moved:0,type:e.pointerType,surface};}
 pair(){const [a,b]=this.points.values();return b?{distance:Math.max(24,Math.hypot(a.x-b.x,a.y-b.y)),x:(a.x+b.x)/2,y:(a.y+b.y)/2}:null;}
 down(e,surface=this.surfaces[0]){
  if(e.button>0||!this.available())return;
  if(this.points.has(e.pointerId)||this.points.size>=2){if(this.points.size>=2)this.consume(e);return;}
  this.points.set(e.pointerId,this.point(e,surface));surface.setPointerCapture?.(e.pointerId);
  if(this.points.size===1)this.afterPinch=false;
  else{this.consume(e);this.lastTap=null;this.afterPinch=false;this.startPair=this.pair();this.beginTransform();}
 }
 move(e){
  const p=this.points.get(e.pointerId);if(!p)return;
  p.x=e.clientX;p.y=e.clientY;p.moved=Math.max(p.moved,Math.hypot(p.x-p.sx,p.y-p.sy));
  if(p.moved>6)this.lastTap=null;
  if(this.points.size===2){this.consume(e);if(!this.frame)this.frame=requestAnimationFrame(()=>this.flush());}
  else if(this.afterPinch)this.consume(e);
 }
 flush(){
  if(this.frame)cancelAnimationFrame(this.frame);this.frame=null;
  const next=this.pair(),start=this.startPair;if(!next||!start)return;
  // Absolute deltas from the gesture's start prevent asymmetric pointer delivery
  // from turning a symmetric pinch into cumulative sideways drift.
  this.transform(Math.log(next.distance/start.distance));
 }
 up(e){
  const p=this.points.get(e.pointerId);if(!p)return;
  p.x=e.clientX;p.y=e.clientY;p.moved=Math.max(p.moved,Math.hypot(p.x-p.sx,p.y-p.sy));
  this.flush();this.points.delete(e.pointerId);
  if(this.startPair||this.afterPinch){
   this.startPair=null;this.afterPinch=this.points.size>0;this.lastTap=null;return;
  }
  if(p.type==='touch'&&p.moved<6&&e.timeStamp-p.time<300){
   const prior=this.lastTap;
   if(prior&&e.timeStamp-prior.time<320&&Math.hypot(p.x-prior.x,p.y-prior.y)<28){this.zoom(.32);this.lastTouchZoomAt=e.timeStamp;this.lastTap=null;}
   else this.lastTap={x:p.x,y:p.y,time:e.timeStamp};
  }else this.lastTap=null;
 }
 cancel(e){
  if(!this.points.has(e.pointerId))return;
  if(this.frame)cancelAnimationFrame(this.frame);this.frame=null;
  this.points.delete(e.pointerId);this.startPair=null;this.afterPinch=this.points.size>0;this.lastTap=null;
 }
}
