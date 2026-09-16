import {createInteriorCPU} from './interior-kernel.mjs';

// Self-contained worker also works in the immutable, data-URI module archive.
const workerSource=`const createInteriorCPU=${createInteriorCPU.toString()};const engine=createInteriorCPU();onmessage=({data:d})=>{try{engine.configure(d.params,d.view);const rgba=engine.render(d.w,d.h,d.center);postMessage({...d,params:undefined,rgba},[rgba.buffer]);}catch(e){postMessage({error:e.message});}};`;
export class InteriorSoftwareRenderer {
 constructor(){this.frame=document.createElement('canvas');this.outside=document.createElement('canvas');this.reset();}
 reset(){this.worker?.terminate();this.worker=null;clearTimeout(this.timer);this.generation=(this.generation||0)+1;this.busy=false;this.started=false;this.key='';this.frame.width=0;this.last=0;}
 accept(d,generation){
  if(generation!==this.generation)return;this.busy=false;
  this.frame.width=d.w;this.frame.height=d.h;this.frame.getContext('2d').putImageData(new ImageData(d.rgba,d.w,d.h),0,0);
 }
 draw(r,params,state,ts){
  const c=r.ctx,w=r.width,h=r.height;if(!c||w<1||h<1)return;
  if(!this.started){
   this.started=true;this.outside.width=r.canvas.width;this.outside.height=r.canvas.height;this.outside.getContext('2d').drawImage(r.canvas,0,0);
   try{const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));try{this.worker=new Worker(url);}finally{URL.revokeObjectURL(url);}
    const generation=this.generation;this.worker.onmessage=({data:d})=>{if(generation!==this.generation)return;if(d.error){this.worker?.terminate();this.worker=null;this.busy=false;this.key='';return;}this.accept(d,generation);};
    this.worker.onerror=()=>{if(generation!==this.generation)return;this.worker?.terminate();this.worker=null;this.busy=false;this.key='';};
   }catch{this.worker=null;}
  }
  if(r.canvas.width!==w||r.canvas.height!==h){r.canvas.width=w;r.canvas.height=h;}
  c.globalAlpha=1;c.drawImage(this.outside,0,0,w,h);
  if(this.frame.width){c.globalAlpha=1;c.imageSmoothingEnabled=true;c.drawImage(this.frame,0,0,w,h);c.globalAlpha=1;}
  const view={...state,samples:r.quality==='detail'?80:r.quality==='economy'?40:64};
  const key=JSON.stringify([params,view,w,h,r.center,r.quality]);
  if(this.busy||key===this.key||ts-this.last<100)return;
  this.key=key;this.last=ts;this.busy=true;
  const scale=Math.min((this.worker?(r.quality==='detail'?80:48):24)/Math.min(w,h),144/w,120/h);
  const d={params:[...params],view,center:r.center??.46,w:Math.max(2,Math.floor(w*scale)),h:Math.max(2,Math.floor(h*scale))},generation=this.generation;
  if(this.worker){this.worker.postMessage(d);return;}
  // If workers are blocked, compute one scanline per task to keep input usable.
  const engine=createInteriorCPU();engine.configure(d.params,d.view);d.rgba=new Uint8ClampedArray(d.w*d.h*4);let y=0;
  const row=()=>{if(generation!==this.generation)return;
   for(let x=0;x<d.w;x++){const color=engine.sample((x+.5-d.w*.5)/d.h*3.2,(d.h*d.center-y-.5)/d.h*3.2),i=(y*d.w+x)*4;d.rgba[i]=color.x*255;d.rgba[i+1]=color.y*255;d.rgba[i+2]=color.z*255;d.rgba[i+3]=255;}
   if(++y<d.h)this.timer=setTimeout(row,0);else this.accept(d,generation);
  };this.timer=setTimeout(row,0);
 }
}
