export const bodyVertex=`precision highp float;attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}`;
export const bodyFragment=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 resolution,viewport,homeCenter,heartCenter;
uniform vec4 panel,identityA,identityB,identityC,identityD;
uniform float time,opening,homeRadius,heartRadius,mode,yaw,pitch,zoom,audio,life;
const float PI=3.14159265;
float sat(float x){return clamp(x,0.,1.);}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise(p)*.62+noise(p*2.07+vec3(3.1,7.7,9.2))*.27+noise(p*4.23+vec3(8.7,2.1,5.3))*.11;}
float trap(vec3 p){float d=10.;for(int i=0;i<5;i++){p.xy=rot(.36+identityA.x*.8+sin(time*.07)*.04)*p.xy;p.yz=rot(.22+identityB.y*.55)*p.yz;p=abs(p)-vec3(.46+.12*identityA.x,.38+.08*identityB.z,.34+.1*identityC.w);p=p/clamp(dot(p,p),.18,1.15)-vec3(.76+.17*identityA.z,.55+.14*identityC.x,.43+.1*identityB.y);d=min(d,length(p.xy));}return d;}
vec3 nacre(float phase,float fresnel){vec3 spectral=.53+.47*cos(6.28318*(phase+vec3(.02,.35,.67)+identityA.x*.4));vec3 cold=mix(vec3(.09,.26,.7),vec3(.13,.92,.92),sat(phase));vec3 c=mix(cold,spectral,.50+.32*fresnel);return mix(c,vec3(1.,.54,.24),pow(sat(sin(phase*4.+identityB.x*5.)*.5+.5),8.)*.26);}
float roundBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return min(max(q.x,q.y),0.)+length(max(q,0.))-r;}
float segment(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),.001),0.,1.));}
void main(){
 vec2 pixel=vec2(gl_FragCoord.x/resolution.x*viewport.x,(1.-gl_FragCoord.y/resolution.y)*viewport.y);
 vec2 center=mix(homeCenter,heartCenter,opening);float radius=mix(homeRadius,heartRadius,opening)*zoom*(1.+audio*.07);
 vec2 uv=(pixel-center)/radius;uv.y=-uv.y;float radial=length(uv),angle=atan(uv.y,uv.x);
 vec3 col=vec3(.003,.004,.013);float clock=time*.085;
 float edge=.88+.020*clamp(life,0.,3.2)*sin(angle*7.+identityD.z*6.)+.075*sin(angle*(4.+floor(identityA.z*5.))+identityB.x*6.+clock)+.022*sin(angle*13.-clock);
 vec3 q=vec3(uv,.4);q.xy=rot(yaw*.12)*q.xy;
 float outer=exp(-abs(radial-edge)*7.2);float veil=fbm(q*3.+identityB.xyz*9.+vec3(0.,clock,0.));
 col+=nacre(veil+angle*.08,.7)*outer*veil*.25;
 if(radial<1.34){float far=sqrt(max(0.,1.8-dot(uv,uv))),stepLength=2.*far/14.,transmission=1.;vec3 volume=vec3(0.);
  for(int i=0;i<14;i++){float z=-far+(float(i)+.5)*stepLength;vec3 p=vec3(uv,z);p.xz=rot(yaw+time*.032)*p.xz;p.yz=rot(pitch)*p.yz;
   float fourth=.20*sin(p.y*2.+clock+identityD.x*3.);p.x=mix(p.x,p.x*cos(mode*.08)-fourth*sin(mode*.08),opening);
   float r=length(p/vec3(.88+identityB.x*.21,1.01+identityB.y*.13,.89+identityB.z*.16));vec3 np=p*(2.5+identityC.w)+identityA.xyz*7.+vec3(clock*.3,clock,-clock*.2);
   float n=fbm(np);float shell=abs(r-(.63+.38*n));float density=exp(-shell*23.)*(.35+n*1.5)+exp(-r*r*4.8)*.10;
   density*=1.-smoothstep(1.08,1.38,r);float opacity=1.-exp(-density*stepLength*3.2);
   float irid=n+p.z*.23+p.y*.13+identityC.x*.3;float hot=pow(sat(n*1.25),5.);vec3 emission=nacre(irid,abs(p.z))*(.85+hot*1.8)+vec3(.23,.58,.63)*hot;
   volume+=transmission*opacity*emission;transmission*=1.-opacity;
  }
  col+=volume*1.85;
  float fine=1./(1.+105.*pow(trap(vec3(uv*.76,.43+identityB.w)),2.));float rim=exp(-abs(radial-edge)*42.);
  col+=nacre(veil+angle*.07,.9)*rim*(.68+fine*2.8)+vec3(.16,.3,.59)*fine*outer*.16;
  col+=vec3(.17,.72,.82)*exp(-radial*radial*34.)*.45;
 }
 if(opening>.001){
  vec2 local=pixel-panel.xy;float r=24.+identityD.y*17.,distance=roundBox(local,panel.zw,r),theta=atan(local.y/panel.w,local.x/panel.z);
  float fold=sin(theta*(4.+floor(identityA.z*6.))+identityB.x*6.+clock),ripples=sin(distance*.36+theta*3.-clock*2.);
  float margin=13.+7.*fold*fold,edgeLight=exp(-abs(distance-margin)*.085),strands=pow(.5+.5*ripples,8.);
  float structure=1./(1.+85.*pow(trap(vec3(local/viewport.y*2.,identityC.w+clock*.03)),2.));
  vec3 membrane=nacre(theta*.11+distance*.008+veil*.32+identityA.x,.9)*(edgeLight*(.12+strands*.58+structure*.25));
  membrane+=vec3(.2,.48,.67)*exp(-abs(distance-margin)*.5)*.36;
  vec2 endpoint=viewport.x<980.||viewport.x/viewport.y<1.16?vec2(panel.x,panel.y-panel.w):vec2(panel.x-panel.z,panel.y);
  float bridge=segment(pixel,heartCenter,endpoint);float between=sin(PI*clamp(length(pixel-heartCenter)/max(length(endpoint-heartCenter),1.),0.,1.));
  membrane+=nacre(veil+theta*.05,.7)*exp(-bridge/22.)*(.10+.24*pow(.5+.5*sin(bridge*.5-clock*3.),9.))*between;
  col+=membrane*opening;
  float quiet=1.-smoothstep(-17.,3.,distance);col=mix(col,vec3(.005,.009,.018),quiet*opening*.97);
 }
 float star=hash(vec3(floor(pixel*.7),17.));if(star>.99974)col+=vec3(.19,.25,.42)*(.25+.25*sin(time+star*80.));
 col=1.-exp(-max(col,vec3(0.))*1.35);col=pow(col,vec3(.91));gl_FragColor=vec4(col,1.);
}`;
export const particleVertex=`precision highp float;attribute vec3 position,destination;attribute float salt;uniform mediump vec2 viewport;uniform vec2 homeCenter,heartCenter;uniform mediump float opening;uniform float homeRadius,heartRadius,time,yaw,pitch,zoom,pulse,audio,life;uniform mediump float halo;varying mediump float light,film;varying mediump vec2 screenPosition;
void main(){vec3 p=position;p.x+=clamp(life,0.,3.2)*.018*sin(p.y*7.+time*.1);float cy=cos(yaw+time*.032),sy=sin(yaw+time*.032),cx=cos(pitch),sx=sin(pitch);p.xz=mat2(cy,-sy,sy,cy)*p.xz;p.yz=mat2(cx,-sx,sx,cx)*p.yz;vec2 projected=vec2(p.x,-p.y)*3./(3.-p.z*.38);vec2 closed=homeCenter+projected*homeRadius*zoom;vec2 grown=destination.z<.42?heartCenter+projected*heartRadius*zoom:destination.xy;vec2 pixel=mix(closed,grown,opening);pixel+=vec2(sin(salt*81.+time*.3),cos(salt*67.+time*.27))*sin(opening*3.14159265)*homeRadius*.16;pixel+=vec2(sin(time*.7+salt*120.),cos(time*.5+salt*80.))*(.6+audio*3.);screenPosition=pixel/viewport;vec2 q=pixel/viewport*2.-1.;q.y=-q.y;gl_Position=vec4(q,0.,1.);gl_PointSize=(1.4+salt*2.3+pulse*.7)*(1.+halo*2.4);light=(.18+salt*.6)*(destination.z<.42?.52:1.);film=salt+p.z*.12+time*.008;}`;
export const particleFragment=`precision mediump float;uniform vec3 tint;uniform vec4 panel;uniform mediump vec2 viewport;uniform mediump float opening;uniform mediump float halo;varying mediump float light,film;varying mediump vec2 screenPosition;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;vec3 spectrum=.55+.45*cos(6.28318*(film+vec3(.04,.35,.67)));vec3 color=mix(tint,spectrum,.6);float alpha=exp(-d*d*6.)*light*mix(.8,.05,halo);vec2 quiet=1.-smoothstep(panel.zw-vec2(20.),panel.zw-vec2(5.),abs(screenPosition*viewport-panel.xy));alpha*=1.-quiet.x*quiet.y*opening*.98;gl_FragColor=vec4(color,alpha);}`;
