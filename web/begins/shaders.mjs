// Original eight-fold, 88-step optical field retained below; the projection becomes the instrument.
export const bodyVertex=`precision highp float;attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}`;
export const bodyFragment=`#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 resolution,viewport,homeCenter,heartCenter;
uniform vec4 panel,identityA,identityB,identityC,identityD;
uniform float time,opening,homeRadius,heartRadius,yaw,pitch,zoom,pulse,audio,life;
#define r resolution
#define t time
#define seed identityA
#define genome identityB
#define state identityC
#define pointer (vec2(.5)+vec2(yaw,pitch)*.08)
#define sovereign 0.
  #define PI 3.14159265359
  mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
  float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
  vec3 palette(float x, vec3 a, vec3 b, vec3 c, vec3 d){return a+b*cos(6.28318*(c*x+d));}

  float field(vec3 p, out float orbit){
    float scale=1.;
    float d=10.;
    orbit=10.;
    vec3 q=p;
    for(int i=0;i<8;i++){
      q.xy*=rot(.36+genome.x*.8+sin(t*.07)*.04);
      q.yz*=rot(.22+state.y*.55);
      q=abs(q)-vec3(.46+.12*seed.x,.38+.08*genome.z,.34+.1*state.w);
      float k=clamp(dot(q,q),.18,1.15);
      q=q/k-vec3(.76+.17*seed.z,.55+.14*state.x,.43+.1*genome.y);
      scale*=k;
      orbit=min(orbit,length(q.xy));
      d=min(d,(length(q)-.11-.035*sin(float(i)+t*.8))/scale);
    }
    return d;
  }

  vec3 render(vec2 uv){
    vec2 m=(pointer-.5)*.3;
    vec3 ro=vec3(m*1.25,3.2+.25*sin(t*.11));
    vec3 rd=normalize(vec3(uv,-1.7));
    rd.xy*=rot((pointer.x-.5)*.32);
    float travel=0.;
    float glow=0.;
    float minOrbit=10.;
    vec3 col=vec3(0.);
    for(int i=0;i<88;i++){
      vec3 p=ro+rd*travel;
      p.xy*=rot(t*.045*(sovereign>.5?-1.:1.)+seed.w*PI);
      float orbit;
      float d=field(p,orbit);
      minOrbit=min(minOrbit,orbit);
      glow+=exp(-18.*abs(d))*.018;
      if(abs(d)<.0015||travel>7.)break;
      travel+=max(.006,abs(d)*.45);
    }
    float body=exp(-4.2*travel);
    float halo=1./(1.+35.*minOrbit*minOrbit);
    float rings=.5+.5*cos(42.*length(uv)+t*1.4+state.z*20.);
    vec3 a=vec3(.09,.06,.18);
    vec3 b=sovereign>.5?vec3(.95,.18,.38):vec3(.22,.8,.95);
    vec3 c=vec3(1.,.78,.25);
    vec3 pal=palette(travel*.13+genome.w, a, b, vec3(1.,.7,.5), vec3(seed.x,state.y,genome.z));
    col+=pal*(body*2.2+glow*3.4+halo*.52);
    col+=b*rings*pow(max(0.,1.-length(uv)*.72),9.)*.08;
    col+=vec3(1.)*pulse*exp(-8.*length(uv))*.7;
    float stars=step(.9975,hash21(floor((uv+4.)*r.y*.18)))*(.3+.7*hash21(uv*400.));
    col+=stars*vec3(.65,.7,1.)*(1.-smoothstep(0.,1.5,length(uv)));
    col*=1.-.32*dot(uv,uv);
    col=pow(max(col,0.),vec3(.78));
    return col;
  }


float boxDistance(vec2 p,vec2 b,float radius){vec2 q=abs(p)-b+radius;return min(max(q.x,q.y),0.)+length(max(q,0.))-radius;}
void main(){
 vec2 pixel=vec2(gl_FragCoord.x/resolution.x*viewport.x,(1.-gl_FragCoord.y/resolution.y)*viewport.y);
 vec2 homeUV=(pixel-homeCenter)/homeRadius*.70;homeUV.y=-homeUV.y;
 vec2 local=pixel-panel.xy;vec2 formedUV=vec2(local.x/panel.z,-local.y/panel.w)*.68;
 vec2 uv=mix(homeUV/zoom,formedUV,opening);
 uv+=sin(vec2(uv.y*3.,uv.x*4.)+time*.10+identityD.xy*5.)*(sin(opening*PI)*.07+clamp(life,0.,3.2)*.004);
 vec3 col=render(uv+vec2(.0015,0.))*vec3(1.,.35,.25)+render(uv)*vec3(.2,.62,1.)+render(uv-vec2(.0015,0.))*vec3(.2,.1,.55);col/=1.7;
 float theta=atan(local.y/panel.w,local.x/panel.z),distance=boxDistance(local,panel.zw,30.+identityD.y*20.);
 float organic=distance-8.*sin(theta*(4.+floor(identityA.z*4.))+identityB.x*6.+time*.09)-4.*sin(theta*11.-time*.07);
 float homeMask=1.-smoothstep(.85,1.48,length(homeUV));
 float skin=exp(-abs(organic-12.)*.070),edge=exp(-abs(organic-12.)*.32);
 vec3 nacre=.52+.48*cos(6.28318*(theta*.10+identityA.x+organic*.006+vec3(.02,.35,.65)));
 col*=mix(homeMask,skin*1.2,opening);
 col+=nacre*(skin*.15+edge*.24)*opening;
 float quiet=1.-smoothstep(-20.,0.,distance);col=mix(col,vec3(.006,.009,.018),quiet*opening*.98);
 col=1.-exp(-max(col,vec3(0.))*.95);
 gl_FragColor=vec4(col+vec3(.002,.003,.008),1.);
}`;
export const particleVertex=`precision highp float;attribute vec3 position,destination,home;attribute float salt,ink;
uniform mediump vec2 viewport;uniform vec2 homeCenter;uniform float homeRadius,yaw,pitch,zoom,time,progress,closing,opening,pulse;uniform mediump float halo;
varying mediump float light,film,inkFade;
void main(){float arrival=destination.z;float start=max(0.,arrival-.26);float u=clamp((progress-start)/max(.001,arrival-start),0.,1.);u=u*u*(3.-2.*u);float curl=sin(u*3.14159265)*(1.-u)*homeRadius*.44;vec2 pixel=mix(position.xy,destination.xy,u)+vec2(sin(salt*61.),cos(salt*83.))*curl;
 vec3 p=home;p.xz=mat2(cos(yaw+time*.032),sin(yaw+time*.032),-sin(yaw+time*.032),cos(yaw+time*.032))*p.xz;p.yz=mat2(cos(pitch),sin(pitch),-sin(pitch),cos(pitch))*p.yz;
 vec2 living=homeCenter+vec2(p.x,-p.y)*3./(3.-p.z*.38)*homeRadius*zoom;pixel=mix(pixel,living,closing*smoothstep(.85,1.,progress));
 vec2 q=pixel/viewport*2.-1.;q.y=-q.y;gl_Position=vec4(q,0.,1.);gl_PointSize=(1.1+salt*1.5)*(1.+halo*2.5);
 light=(.22+salt*.45)*mix(.10,1.,smoothstep(.015,.22,opening));film=salt+time*.008;inkFade=1.-ink*(1.-closing)*smoothstep(arrival,arrival+.035,progress);
}`;
export const particleFragment=`precision mediump float;uniform mediump float halo;varying mediump float light,film,inkFade;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;vec3 color=mix(vec3(.68,.89,.95),.55+.45*cos(6.28318*(film+vec3(.02,.35,.67))),.38);float alpha=exp(-d*d*6.)*light*mix(1.,.07,halo)*inkFade;gl_FragColor=vec4(color,alpha);}`;
