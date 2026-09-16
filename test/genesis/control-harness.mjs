import {GenesisInterior} from '../../web/genesis/interior.mjs';
import {OpticalField} from '../../web/renderer.js';
export function harness(t,{motion=false,allowed=true}={}){
 const saved=new Map(['document','addEventListener','requestAnimationFrame','cancelAnimationFrame','innerWidth','innerHeight'].map(k=>[k,globalThis[k]]));
 const nodes=new Map(),classes=new Set(),routes=[],frames=new Map();let frameId=0;
 function element(id){
  if(!nodes.has(id)){
   const node={hidden:true,attrs:{},textContent:'',listeners:{},handlers:{},captured:new Set(),
    addEventListener(k,fn,options){(this.handlers[k]??=[]).push({fn,capture:options===true||options?.capture});this.listeners[k]=event=>{event.currentTarget=this;event.target??=this;for(const h of [...this.handlers[k]].sort((a,b)=>Number(!!b.capture)-Number(!!a.capture))){h.fn(event);if(event.stopped)break;}};},
    setPointerCapture(id){this.captured.add(id);},hasPointerCapture(id){return this.captured.has(id);},releasePointerCapture(id){this.captured.delete(id);},
    setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},focus(){document.activeElement=this;},querySelector:element,closest(){return null;},classList:{toggle(){return true;}}};
   nodes.set(id,node);
  }return nodes.get(id);
 }
 globalThis.innerWidth=1000;globalThis.innerHeight=700;
 globalThis.document={hidden:false,events:{},activeElement:element('entry'),getElementById:element,addEventListener(name,fn){this.events[name]=fn;},body:{classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}}};globalThis.addEventListener=()=>{};globalThis.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 t.after(()=>{for(const [k,v] of saved)if(v===undefined)delete globalThis[k];else globalThis[k]=v;});
 const native={pointerdown:0,pointermove:0,wheel:0,keydown:0};
 for(const name of Object.keys(native))element('overlay').addEventListener(name,()=>native[name]++);
 const renderer={overlay:element('overlay'),width:1000,height:700,zoom:1,targetZoom:1,original:false,time:37,cameraX:.1,cameraY:.15,targetX:.2,targetY:.3,pointer:[.51,.48],targetPointer:[.6,.7],fold:0,state:{seed:'fixed-seed',genome:'fixed-genome',root:'fixed-root'},setReference(v){this.original=v;}},field={motion,audio:0,blueRenderer:renderer};
 renderer.canvas=element('organism');renderer.resize=()=>{};OpticalField.prototype.bind.call(renderer);
 let i;i=new GenesisInterior(field,{open:async route=>{routes.push(route);if(route==='home')await i.leave();},sound(){},canExplore:()=>allowed});
 let time=0;const event=(id=1,x=100,y=100,extra={})=>({pointerId:id,clientX:x,clientY:y,button:0,pointerType:'touch',timeStamp:time+=30,preventDefault(){this.prevented=true;},stopPropagation(){},stopImmediatePropagation(){this.stopped=true;},...extra});
 let now=1000;const tick=(n=1)=>{for(let j=0;j<n;j++){now+=50;const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn(now);}};
 return {i,field,renderer,routes,event,tick,classes,overlay:renderer.overlay,flight:i.flight,native,frames};
}
