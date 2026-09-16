import {outsidePose,dollyCamera,easeCamera,followCamera} from './interior-space.mjs';
import {OpticalGestures} from './interior-gestures.mjs';
// The original renderer owns turning. This controller owns only straight zoom.
export class GenesisInterior {
 constructor(field,{open,notify,canExplore=()=>false}={}){
  this.field=field;this.openInstrument=open;this.notify=notify;this.canExplore=canExplore;
  this.surface=field.blueRenderer.overlay;this.camera=outsidePose();this.desiredCamera={...this.camera};this.savedCamera=null;this.active=false;this.exiting=false;this.returning=false;this.target=null;this.last=0;
  this.gestures=[new OpticalGestures(this.surface,{
   available:()=>!this.exiting&&!this.returning&&(this.canExplore()),
   zoom:amount=>this.zoom(amount),size:()=>Math.max(1,field.blueRenderer.height),
   beginTransform:()=>{field.blueRenderer.cancelNativeDrag?.();this.gestureCamera=this.active?{...this.camera}:this.homePose();if(this.active)this.desiredCamera={...this.camera};},
   transform:amount=>{if(!this.active&&Math.abs(amount)<.000001)return;if(this.takeControl())this.desiredCamera=dollyCamera(this.gestureCamera,amount);}
  })];
  this.surface.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&this.active){event.preventDefault();event.stopImmediatePropagation();this.returnToExterior();return;}
   if(!['+','=','-'].includes(event.key))return;
   event.preventDefault();event.stopImmediatePropagation();if(this.canExplore())this.zoom(event.key==='-'?-.1:.1);
  },{capture:true});
  addEventListener('blur',()=>this.clearInput());
  document.addEventListener('visibilitychange',()=>{this.last=0;if(document.hidden){this.clearInput();if(this.exiting)this.finishLeave();}});
  this.tick=this.tick.bind(this);
 }
 homePose(){const distance=2.6*Math.max(.48,this.field.blueRenderer.zoom??1);return {...outsidePose(),z:-distance,focus:distance};}
 clearInput(){for(const gesture of this.gestures)gesture.reset();this.field.blueRenderer.cancelNativeDrag?.();}
 takeControl(){
  if(this.exiting||this.returning)return false;
  if(!this.active){if(!this.canExplore())return false;this.field.finishCreation?.();this.enter({outside:true});}
  if(this.target)this.desiredCamera={...this.camera};this.target=null;return true;
 }
 zoom(amount){
  if(!Number.isFinite(amount))throw Error('Zoom must be finite');
  if(this.takeControl())this.desiredCamera=dollyCamera(this.desiredCamera,amount);
 }
 returnToExterior(){
  if(!this.active||this.exiting||this.returning)return;
  this.returning=true;Promise.resolve(this.openInstrument('home')).catch(error=>{this.returning=false;this.notify?.(error.message);});
 }
 enter({outside=false,resume=false}={}){
  if(this.active)return;const renderer=this.field.blueRenderer;
  if(!resume||!this.savedCamera){this.homeCamera=this.homePose();this.referenceDistance=this.homeCamera.focus;}
  renderer.targetZoom=renderer.zoom;
  this.active=true;this.exiting=false;this.returning=false;this.last=0;
  this.camera=resume&&this.savedCamera?{...this.savedCamera}:{...this.homeCamera};this.savedCamera=null;
  this.desiredCamera={...this.camera};this.from={...this.camera};this.travel=0;
  this.target=resume||outside?null:{...this.homeCamera,z:-.62,focus:.62};
  this.referenceWas=renderer.original;if(this.referenceWas)renderer.setReference(false);
  if(!fieldMotion(this.field)&&this.target){this.camera={...this.target};this.desiredCamera={...this.target};this.target=null;}
  this.publish();this.raf=requestAnimationFrame(this.tick);
 }
 leave({remember=false}={}){
  if(!this.active)return Promise.resolve();if(this.exiting)return this.leaving;
  this.savedCamera=remember?{...this.camera}:null;this.rememberOnLeave=remember;this.clearInput();this.exiting=true;
  this.target=remember?null:{...this.homeCamera};this.from={...this.camera};this.travel=0;
  this.leaving=new Promise(resolve=>this.resolveLeave=resolve);
  if(remember||!fieldMotion(this.field)||document.hidden)this.finishLeave();return this.leaving;
 }
 finishLeave(){
  this.active=false;this.exiting=false;this.returning=false;cancelAnimationFrame(this.raf);
  if(this.rememberOnLeave){this.publish();this.field.interiorState.moving=false;}
  else{this.field.interiorState=null;this.field.interiorFallback?.reset();if(this.referenceWas)this.field.blueRenderer.setReference(true);}this.field.blueRenderer.dirty=true;this.resolveLeave?.();this.resolveLeave=null;
 }
 publish(){const c=this.camera;this.field.interiorState={depth:.16,camera:[c.x,c.y,c.z,c.yaw],look:[c.pitch,this.referenceDistance],focus:c.focus,moving:!!this.target||Math.abs(c.z-this.desiredCamera.z)>.0001,audio:fieldMotion(this.field)?(this.field.audio||0):0};this.field.blueRenderer.dirty=true;}
 tick(now){
  if(!this.active)return;this.raf=requestAnimationFrame(this.tick);if(document.hidden){this.last=0;return;}
  const dt=Math.min(.05,this.last?(now-this.last)/1000:.016);this.last=now;
  if(this.target){this.travel=fieldMotion(this.field)?Math.min(1,this.travel+dt/(this.exiting?.65:1.8)):1;this.camera=easeCamera(this.from,this.target,this.travel);this.desiredCamera={...this.camera};if(this.travel===1)this.target=null;}
  if(this.exiting){if(!this.target){this.finishLeave();return;}}
  else if(!this.target)this.camera=followCamera(this.camera,this.desiredCamera,dt);
  this.publish();
 }
}
const fieldMotion=field=>!!field.motion;
