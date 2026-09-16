import {project16} from '../confluence/identity.mjs';
export const SPIRIT_VERSION='3.0.0';
const TAU=Math.PI*2,frac=x=>x-Math.floor(x);
export function spiritLayout(width,height,id){
 const compact=width<980||width/height<1.16,short=height<520,a=id.axes;
 const home={x:width*.5,y:height*(compact?.48:.49),radius:Math.min(width*(compact?.37:.29),height*.32)};
 let panel,heart;
 if(compact){const margin=Math.max(22,width*.065),top=short?106:Math.max(215,height*.41);panel={x:margin,y:top,width:width-margin*2,height:Math.max(100,height-top-(short?78:112))};heart={x:width*(.49+(a[11]-.5)*.035),y:short?77:height*.235,radius:short?45:Math.min(width*.255,height*.155)};}
 else{const pw=Math.min(630,width*(.405+a[12]*.024)),top=Math.max(106,height*.155),bottom=130;panel={x:width*.53+(a[11]-.5)*12,y:top,width:pw,height:Math.max(220,height-top-bottom)};heart={x:width*.26,y:height*.46,radius:Math.min(width*.19,height*.285)};}
 return {width,height,compact,home,heart,panel,radius:22+a[13]*18,exponent:4.4+a[14]*1.7};
}
export function spiritPoint(i,count,id){
 const u=(i+.5)/count,v=frac(i*.618033988749895),w=frac(i*.754877666246693),theta=TAU*v,phi=Math.acos(1-2*u),s=Math.sin(phi),phase=id.phase;
 const lobes=4+Math.floor(id.axes[2]*5),fold=.10+.1*id.axes[6],wave=Math.sin(lobes*theta+phi*(2+id.twist)+phase);
 let radius=(.84+fold*wave*s*s)*(1+.045*Math.cos(phi*12-theta*3));
 if(i%5===0)radius*=Math.pow(.1+.9*w,.48);
 return [radius*s*Math.cos(theta)*(.96+id.axes[7]*.13),radius*Math.cos(phi)*(1.03+id.axes[8]*.17),radius*s*Math.sin(theta)];
}
export function surfacePoint(i,count,id,layout,mode='home'){
 const {panel:p,heart:h,compact}=layout,u=frac(i*.618033988749895),v=frac(i*.754877666246693),group=frac(i*.569840290998053),phase=id.phase;
 const cx=p.x+p.width/2,cy=p.y+p.height/2;
 if(group<.42)return [h.x,h.y,group];
 if(group<.91){const t=u*TAU,c=Math.cos(t),s=Math.sin(t),n=layout.exponent,lobe=Math.sin((4+Math.floor(id.axes[2]*6))*t+phase),band=8+24*v+9*lobe*lobe;
  const x=Math.sign(c)*Math.pow(Math.abs(c),2/n)*(p.width/2+band),y=Math.sign(s)*Math.pow(Math.abs(s),2/n)*(p.height/2+band);
  return [cx+x,cy+y,group];
 }
 const end=compact?[cx,p.y-10]:[p.x-12,cy+(id.axes[15]-.5)*p.height*.2],start=compact?[h.x,h.y+h.radius*.3]:[h.x+h.radius*.3,h.y];
 const arc=(v-.5)*(compact?layout.width*.36:layout.height*.47),x=start[0]*(1-u)+end[0]*u+(compact?Math.sin(Math.PI*u)*arc:Math.sin(Math.PI*u)*10),y=start[1]*(1-u)+end[1]*u+(compact?Math.sin(Math.PI*u)*8:Math.sin(Math.PI*u)*arc);
 return [x,y,group];
}
export function spiritMotion(id,time){return project16(id.axes,time);}
export function modeNumber(mode){return Math.max(0,['home','trade','launch','vault','give','market','world','journal','library','work','ledger','lab','routes','cartridges','agents','atlas','identity','connect'].indexOf(mode));}
