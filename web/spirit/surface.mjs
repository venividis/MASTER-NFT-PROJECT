export function attachSpiritSurface(field){
 const panels=['cf-dialog','instrument-dialog','chain-dialog','detail-dialog','transaction-dialog','memory-dialog','ascend-dialog','import-dialog'].map(id=>document.getElementById(id)).filter(Boolean);
 for(const panel of panels){panel.classList.add('sa-surface');panel.addEventListener('pointerdown',()=>field.pulse=Math.max(field.pulse,.25));panel.addEventListener('focusin',()=>field.pulse=Math.max(field.pulse,.32));}
 let previous=-1,active=true;field.setSurfaceActive=value=>{active=value;previous=-1;if(!active)for(const panel of panels)for(const name of ['opacity','transform','pointer-events'])panel.style.removeProperty(name);else field.onUnfold(field.unfold||0);};
 field.onUnfold=progress=>{if(!active)return;const visible=Math.max(0,Math.min(1,(progress-.28)/.40));if(Math.abs(previous-visible)<.015&&visible!==0&&visible!==1)return;previous=visible;for(const panel of panels){panel.style.opacity=String(visible);panel.style.transform=`translateY(${(1-visible)*14}px) scale(${.985+visible*.015})`;panel.style.pointerEvents=visible>.75?'auto':'none';}};
 const observer=new MutationObserver(()=>{if(!active)return;const open=panels.some(panel=>panel.open);if(open){field.open=true;field.onSurfaceOpen?.();}else field.onSurfacesEmpty?.();});for(const panel of panels)observer.observe(panel,{attributes:true,attributeFilter:['open']});
 const context=document.querySelector('#instrument-dialog .ix-context'),footer=document.querySelector('#instrument-dialog .ix-footer');
 if(context&&footer){const details=document.createElement('details');details.className='sa-account-tools';const summary=document.createElement('summary');summary.textContent='Local account & archive';details.append(summary);context.before(details);details.append(context,footer);}
 const dialog=document.getElementById('instrument-dialog');const listener=()=>{if(!dialog.open)return;const view=window.__instruments.view();if(field.mode!==view)field.setMode(view);};
 dialog.addEventListener('click',()=>queueMicrotask(listener));dialog.addEventListener('submit',()=>queueMicrotask(listener));
 if(window.visualViewport)window.visualViewport.addEventListener('resize',()=>field.resize());
 const motion=matchMedia('(prefers-reduced-motion: reduce)');motion.addEventListener?.('change',e=>{field.motion=!e.matches;});
}
