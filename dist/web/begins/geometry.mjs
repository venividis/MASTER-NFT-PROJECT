import {project16} from '../confluence/identity.mjs';
export {spiritPoint} from '../spirit/geometry.mjs';
export const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function spiritLayout(width,height,id){
 const a=id.axes,compact=width<980||width/height<1.16,short=height<540;
 const panelWidth=Math.min(compact?760:920,width-(compact?36:Math.max(160,width*.28))),top=short?78:compact?106:122,bottom=short?82:118;
 const panel={x:(width-panelWidth)/2+(compact?0:(a[11]-.5)*24),y:top,width:panelWidth,height:Math.max(120,height-top-bottom)};
 const home={x:width*.5,y:height*.49,radius:Math.min(width*.39,height*.40)};
 return {width,height,compact,home,heart:{x:panel.x+panel.width/2,y:panel.y+panel.height/2,radius:home.radius},panel,radius:28+a[13]*22,exponent:4.6+a[14]*1.5};
}
export function surfacePoint(i,count,id,l){const p=l.panel,t=i/count*Math.PI*2,c=Math.cos(t),s=Math.sin(t),band=10+16*((i*.61803398875)%1),n=l.exponent;return [p.x+p.width/2+Math.sign(c)*Math.pow(Math.abs(c),2/n)*(p.width/2+band),p.y+p.height/2+Math.sign(s)*Math.pow(Math.abs(s),2/n)*(p.height/2+band),.22+((i*.754877666)%1)*.1];}
export function projectedHome(point,l,yaw,pitch,zoom=1){const cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch),x=point[0]*cy-point[2]*sy,z0=point[0]*sy+point[2]*cy,y=point[1]*cx-z0*sx,z=point[1]*sx+z0*cx,scale=3/(3-z*.38);return [l.home.x+x*scale*l.home.radius*zoom,l.home.y-y*scale*l.home.radius*zoom];}
export function flightPoint(from,to,arrival,progress,salt,radius){const start=Math.max(0,arrival-.26),t=ease((progress-start)/Math.max(.001,arrival-start)),curl=Math.sin(t*Math.PI)*(1-t)*radius*.44;return [from[0]+(to[0]-from[0])*t+Math.sin(salt*61)*curl,from[1]+(to[1]-from[1])*t+Math.cos(salt*83)*curl];}
export function allocateTargets(groups,count,contour){const targets=new Float32Array(count*3),ink=new Float32Array(count),usable=groups.filter(g=>g.points.length),structure=Math.floor(count*.30),weight=usable.reduce((s,g)=>s+Math.sqrt(g.points.length),0);let groupIndex=0,boundary=weight?Math.sqrt(usable[0].points.length)/weight:1;
 for(let i=0;i<count;i++){let point,arrival;if(i<structure||!usable.length){point=contour(i,count);arrival=point[2];}else{const u=(i-structure+.5)/(count-structure);while(u>boundary&&groupIndex<usable.length-1){groupIndex++;boundary+=Math.sqrt(usable[groupIndex].points.length)/weight;}const g=usable[groupIndex];point=g.points[Math.floor(i*.61803398875%1*g.points.length)];arrival=g.arrival;ink[i]=g.ink===false?0:1;}targets.set([point[0],point[1],arrival],i*3);}return {targets,ink};}
export function spiritMotion(id,time){return project16(id.axes,time);}
export function modeNumber(mode){return Math.max(0,['home','trade','launch','vault','give','market','world','journal','library','work','ledger','lab','routes','cartridges','agents','atlas','identity','connect'].indexOf(mode));}
