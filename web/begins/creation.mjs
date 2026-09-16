import {ease} from './geometry.mjs';
const PANEL_IDS=['cf-dialog','instrument-dialog','chain-dialog','detail-dialog','transaction-dialog','memory-dialog','ascend-dialog','import-dialog'];
const WORD_EXCLUSIONS='script,style,option,textarea,code,pre,.ab-word,.ab-complete,[data-close],#cf-close,#ix-close,[role=status],[aria-live]';
export function attachCreation(field){
 const panels=PANEL_IDS.map(id=>document.getElementById(id)).filter(Boolean);let active=true,current=null,units=[],generation=0,pending=0,collecting=false,ready=true,quick=false;
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
 const observer=new MutationObserver(records=>{if(!active||collecting)return;const structural=records.some(record=>record.attributeName==='open'||record.type==='childList'&&['cf-content','ix-content','detail-content','transaction-review'].includes(record.target.id));if(structural)schedule(false);});
 const observe=()=>{for(const panel of panels)observer.observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});};
 const finish=()=>{field.finishCreation();paint(1);};
 const clearUnit=unit=>{unit.element.style.removeProperty('opacity');unit.element.style.removeProperty('filter');unit.element.classList.remove('ab-edge-pending');if(unit.control){unit.element.inert=false;unit.element.removeAttribute('data-ab-pending');}};
 const reset=()=>{for(const unit of units)clearUnit(unit);units=[];for(const panel of panels){panel.removeAttribute('aria-busy');panel.querySelector('.ab-complete')?.setAttribute('hidden','');}};
 for(const panel of panels){panel.classList.add('ab-surface');const finishButton=document.createElement('button');finishButton.type='button';finishButton.className='ab-complete';finishButton.textContent='Complete formation';finishButton.hidden=true;finishButton.addEventListener('click',finish);panel.prepend(finishButton);panel.addEventListener('pointerdown',()=>field.pulse=.35);panel.addEventListener('close',()=>schedule(false));panel.addEventListener('scroll',()=>{if(!ready)schedule(true);},{passive:true});}
 const contextBlock=document.querySelector('#instrument-dialog .ix-context'),footer=document.querySelector('#instrument-dialog .ix-footer');if(contextBlock&&footer){const details=document.createElement('details');details.className='ab-account';const summary=document.createElement('summary');summary.textContent='Account & archive';details.append(summary);contextBlock.before(details);details.append(contextBlock,footer);}
 function selected(){return [...panels].reverse().find(p=>p.open&&p.matches(':modal'))||panels.find(p=>p.open)||null;}
 function wrapWords(panel){const walker=document.createTreeWalker(panel,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode()){const node=walker.currentNode;if(node.textContent.trim()&&!node.parentElement.closest(WORD_EXCLUSIONS))nodes.push(node);}for(const node of nodes){const fragment=document.createDocumentFragment();for(const token of node.textContent.split(/(\S+)/)){if(!token)continue;if(/^\s+$/.test(token)){fragment.append(document.createTextNode(token));continue;}const word=document.createElement('span');word.className='ab-word';word.textContent=token;fragment.append(word);}node.replaceWith(fragment);}}
 function textPoints(text,rect,style,padding=0){if(!context||!text||!rect.width||!rect.height)return [];const w=Math.min(1100,Math.ceil(rect.width)),h=Math.min(100,Math.ceil(rect.height));canvas.width=w;canvas.height=h;context.font=style.font||`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;context.textAlign='left';context.textBaseline='middle';context.fillStyle='#fff';context.fillText(text.slice(0,160),padding,h*.5);const rgba=context.getImageData(0,0,w,h).data,points=[],step=innerWidth<700?3:2,top=field.viewport().top;for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step)if(rgba[(y*w+x)*4+3]>80)points.push([rect.left+x,rect.top+y-top]);return points;}
 function outlinePoints(rect){const points=[],top=field.viewport().top;for(let x=0;x<rect.width;x+=4){points.push([rect.left+x,rect.top-top],[rect.left+x,rect.bottom-top]);}for(let y=0;y<rect.height;y+=4){points.push([rect.left,rect.top+y-top],[rect.right,rect.top+y-top]);}return points;}
 function schedule(isResize){if(!active)return;quick=isResize||quick;if(pending)cancelAnimationFrame(pending);const ticket=++generation;pending=requestAnimationFrame(()=>{pending=0;if(ticket!==generation||!active)return;collect();});}
 function collect(){
  const panel=selected();if(!panel){current=null;reset();ready=true;document.body.dataset.abCreating='false';field.onSurfacesEmpty?.();return;}
  // A direct tab switch uses the existing semantic instrument's selected state.
  if(panel.id==='instrument-dialog'){const view=window.__instruments?.view();if(view&&field.mode!==view)field.setMode(view);}
  const sameSurface=current===panel,preserveReady=quick&&(ready||panel.contains(document.activeElement)&&document.activeElement.matches('input,select,textarea'));field.onSurfaceOpen?.();current=panel;collecting=true;observer.disconnect();reset();
  try{
   wrapWords(panel);const bounds=panel.getBoundingClientRect(),entries=[];
   for(const element of panel.querySelectorAll('.ab-word,input,select,textarea,code,pre')){
    if(element.closest('.ab-complete,[data-close],#cf-close,#ix-close')||element.closest('details:not([open])')&&!element.closest('summary'))continue;
    const rect=element.getBoundingClientRect();if(rect.width===0||rect.height===0)continue;
    const visible=rect.bottom>bounds.top&&rect.top<bounds.bottom&&rect.right>bounds.left&&rect.left<bounds.right;
    entries.push({element,rect,visible,control:element.matches('input,select,textarea'),style:getComputedStyle(element)});
   }
   entries.sort((a,b)=>Math.round((a.rect.top-b.rect.top)/8)||a.rect.left-b.rect.left);const visibleCount=Math.max(1,entries.filter(e=>e.visible).length);let rank=0;const groups=[];
   for(const entry of entries){const {element,rect,style,control,visible}=entry,arrival=visible?.37+(rank++/visibleCount)*.52:.94;let text=control?(element.tagName==='SELECT'?element.selectedOptions[0]?.textContent:element.value):element.textContent;
    if(control&&['checkbox','radio','range','file','password'].includes(element.type))text='';
    if(visible){const points=textPoints(text,rect,style,control?14:0);if(points.length)groups.push({points,arrival,ink:true});if(control)groups.push({points:outlinePoints(rect),arrival:Math.max(.25,arrival-.1),ink:false});}
    units.push({element,arrival,control});if(!preserveReady){element.style.opacity='0';if(control){element.inert=true;element.dataset.abPending='true';}}
   }
   // Buttons are usable when their own words have arrived; close/skip stay usable throughout.
   for(const element of panel.querySelectorAll('button:not(.ab-complete):not([data-close]):not(#cf-close):not(#ix-close)')){const words=units.filter(u=>element.contains(u.element)),arrival=words.length?Math.max(...words.map(u=>u.arrival)):.86;const rect=element.getBoundingClientRect();if(rect.width&&rect.bottom>bounds.top&&rect.top<bounds.bottom)groups.push({points:outlinePoints(rect),arrival:Math.max(.24,arrival-.10),ink:false});units.push({element,arrival,control:true,edgeOnly:true});if(!preserveReady){element.classList.add('ab-edge-pending');element.inert=true;element.dataset.abPending='true';}}
   field.beginCreation(groups,{quick:quick||sameSurface&&field.progress>=1});quick=false;ready=false;panel.setAttribute('aria-busy','true');panel.querySelector('.ab-complete').hidden=false;document.body.dataset.abCreating='true';if(preserveReady||!field.motion||!context)finish();else paint(0);
  }catch(error){console.warn('Formation resolved to usable controls:',error);finish();reset();}
  finally{observer.takeRecords();collecting=false;observe();}
 }
 function paint(progress){if(!active||!current?.open||ready)return;for(const unit of units){const amount=ease((progress-unit.arrival)/.035);if(!unit.edgeOnly)unit.element.style.opacity=String(amount);if(unit.control&&amount>=.98){unit.element.inert=false;unit.element.classList.remove('ab-edge-pending');unit.element.removeAttribute('data-ab-pending');}}if(progress>=1&&!ready){ready=true;current.removeAttribute('aria-busy');current.querySelector('.ab-complete').hidden=true;document.body.dataset.abCreating='false';for(const unit of units)clearUnit(unit);}}
 field.onFormation=paint;field.onResize=()=>schedule(true);field.setSurfaceActive=value=>{active=value;++generation;if(pending)cancelAnimationFrame(pending);pending=0;reset();if(!active){current=null;document.body.dataset.abCreating='false';}else schedule(true);};
 const motion=matchMedia('(prefers-reduced-motion: reduce)');motion.addEventListener?.('change',event=>{field.motion=!event.matches;if(event.matches)finish();});
 globalThis.visualViewport?.addEventListener('resize',()=>field.resize());document.fonts?.ready.then(()=>{if(current&&!ready)schedule(true);});
 observe();field.creation={finish,reflow:()=>schedule(true),status:()=>({forming:!ready,panel:current?.id||null,generation})};
}
