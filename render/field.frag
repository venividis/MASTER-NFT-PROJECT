#version 300 es
precision highp float;precision highp int;
#define V3 vec3
#define V4 vec4
#define v3 vec3
#define TOU(x) uint(x)
#define TOF(x) float(x)
#define TOI(x) int(x)
#define atan2(y,x) atan(y,x)
uniform vec2 resolution;uniform float center;uniform vec4 seed,genome,root;uniform float t,sovereign,pulse,fold,cameraX,cameraY,zoom,pointerX,pointerY,eventKind,lens;out vec4 outColor;
// Shared optical field. Compiled to GLSL ES 3 and WebAssembly from the same source.
// All fields are procedural; no photographs, baked textures, external media or mesh.
float saturate(float x){return min(1.0,max(0.0,x));}
float fract1(float x){return x-floor(x);}
float mix1(float a,float b,float t0){return a+(b-a)*t0;}
float ease(float a,float b,float x){float q=saturate((x-a)/(b-a));return q*q*(3.0-2.0*q);}
V3 add3(V3 a,V3 b){return v3(a.x+b.x,a.y+b.y,a.z+b.z);}
V3 mul3(V3 a,float b){return v3(a.x*b,a.y*b,a.z*b);}
V3 mix3(V3 a,V3 b,float f){return add3(mul3(a,1.0-f),mul3(b,f));}
float dot3(V3 a,V3 b){return a.x*b.x+a.y*b.y+a.z*b.z;}
float length3(V3 a){return sqrt(dot3(a,a));}
V3 rotate3(V3 p,float x,float y){float cx=cos(x),sx=sin(x),cy=cos(y),sy=sin(y);V3 q=v3(p.x,p.y*cx-p.z*sx,p.y*sx+p.z*cx);return v3(q.x*cy+q.z*sy,q.y,-q.x*sy+q.z*cy);}
float lattice(int x,int y,int z){uint h=TOU(x)*1597334677u ^ TOU(y)*3812015801u ^ TOU(z)*2798796415u;h^=h>>16;h*=2246822519u;h^=h>>13;h*=3266489917u;h^=h>>16;return TOF(h&16777215u)/16777215.0;}
float noise3(V3 p){int x=TOI(floor(p.x)),y=TOI(floor(p.y)),z=TOI(floor(p.z));float a=fract1(p.x),b=fract1(p.y),c=fract1(p.z);a=a*a*(3.0-2.0*a);b=b*b*(3.0-2.0*b);c=c*c*(3.0-2.0*c);return mix1(mix1(mix1(lattice(x,y,z),lattice(x+1,y,z),a),mix1(lattice(x,y+1,z),lattice(x+1,y+1,z),a),b),mix1(mix1(lattice(x,y,z+1),lattice(x+1,y,z+1),a),mix1(lattice(x,y+1,z+1),lattice(x+1,y+1,z+1),a),b),c);}
float fbm(V3 p){float a=0.56,f=0.0;for(int i=0;i<4;i++){f+=noise3(p)*a;p=add3(mul3(p,2.07),v3(13.1,7.7,3.8));a*=0.48;}return f;}
// The original's repeated abs / inversion fold, kept as an optical microstructure.
// The archived GLSL in original.frag is additionally selectable unmodified.
float originalTrap(V3 p){float trap=10.0;float ax=.36+genome.x*.8+sin(t*.07)*.04,ay=.22+root.y*.55;float cx=cos(ax),sx=sin(ax),cy=cos(ay),sy=sin(ay);for(int i=0;i<8;i++){float a=p.x*cx+p.y*sx,b=p.y*cx-p.x*sx;p.x=a;p.y=b;a=p.y*cy+p.z*sy;b=p.z*cy-p.y*sy;p.y=a;p.z=b;p=v3(abs(p.x)-(.46+.12*seed.x),abs(p.y)-(.38+.08*genome.z),abs(p.z)-(.34+.1*root.w));float k=max(.18,min(1.15,dot3(p,p)));p=add3(mul3(p,1.0/k),v3(-.76-.17*seed.z,-.55-.14*root.x,-.43-.1*genome.y));trap=min(trap,sqrt(p.x*p.x+p.y*p.y));}return trap;}
V3 spectrum(float u){V3 cold=v3(.11,.65,.83),violet=v3(.42,.16,.72),warm=v3(1.0,.39,.17);float blend=saturate(sin(u*5.4+genome.z*3.0)*.5+.5);V3 col=mix3(cold,violet,blend*.58);col=mix3(col,warm,ease(.75,1.0,blend)*.65);return mix3(col,v3(.96,.17,.33),sovereign*.68);}
V3 radiance(float x,float y){
 float z0=max(.48,zoom);float u=x*z0, v=y*z0;u+=(pointerX-.5)*.045;v+=(pointerY-.5)*.035;
 float radial=sqrt(u*u+v*v),angle=atan2(v,u);
 float clock=t*.08, breath=1.0+sin(t*.7)*.025;
 float effect=pulse, rupture=eventKind==4.0?effect:0.0;
 float radius=.91*breath*(1.0-rupture*.42)+.035*sin(angle*3.0+clock);
 float foldAngle=fold*.7+cameraY*.7;
 V3 p=rotate3(v3(u,v,.32),cameraX+fold*.3,cameraY+t*.035);
 // Advected domain warping: veils, not a polygonal shell.
 V3 q=add3(mul3(p,2.6),v3(seed.x*13.0+genome.x*3.7,seed.y*17.0+genome.y*3.1,seed.z*11.0+genome.z*4.3+clock));
 float warp=fbm(q);q=add3(q,v3(warp*1.7,warp*.8,-warp*1.3));
 float cloud=fbm(q);float cloud2=noise3(add3(mul3(q,3.2),v3(clock,genome.w*8.0,-clock)));
 float edge=radius+(.5-cloud)*.26+fold*.045*sin(angle*5.0+t*.1);
 float delta=radial-edge;
 float halo=exp(-abs(delta)*5.0);
 float mist=halo*pow(max(.0,cloud),2.6)*1.1;
 V3 col=v3(.002,.0025,.008);
 col=add3(col,mul3(v3(.2,.09,.41),exp(-radial*radial*.65)*.27));
 col=add3(col,mul3(spectrum(cloud+angle*.05),mist));
 // Front-to-back absorption / emission through a bounded participating medium.
 float disk=1.24*1.24-u*u-v*v;
 if(disk>0.0){
  float far=sqrt(disk),stepLength=2.0*far/18.0,transmit=1.0;
  for(int j=0;j<18;j++){
   float z=-far+(TOF(j)+.5)*stepLength;
   V3 sampleP=rotate3(v3(u,v,z),cameraX,cameraY+t*.028);
   // A fourth-coordinate slice rotates into the existing three-dimensional field.
   float w=.35*sin(sampleP.y*2.0+clock);float xp=sampleP.x*cos(foldAngle)-w*sin(foldAngle);
   sampleP.x=xp;
   sampleP=mul3(sampleP,1.0+rupture*1.2);
   // Genome changes the density domain and anisotropy, not just the light palette.
   float r=length3(v3(sampleP.x/(.88+genome.x*.24),sampleP.y/(.88+genome.y*.24),sampleP.z/(.9+genome.z*.2)));
   V3 np=add3(mul3(sampleP,2.7+genome.w*1.2),v3(seed.x*9.0+genome.y*4.0,seed.y*9.0+genome.z*3.0+clock,seed.w*9.0+genome.x*4.5));
   float n=fbm(np);
   float veil=abs(r-(.74+.31*n));
   float density=exp(-veil*35.0)*(.23+n*.9);
   density*=.48+.52*pow(saturate(noise3(mul3(np,3.8))*1.5),3.0);
   density*=ease(1.3,1.05,r);
   float opacity=1.0-exp(-density*stepLength*2.7);
   V3 light=spectrum(n+sampleP.y*.18+genome.y*.3);
   float hot=pow(saturate(n*1.35),4.0);
   light=add3(mul3(light,.8+hot*2.2),mul3(v3(.49,.94,1.0),hot*.55*(1.0-sovereign*.45)));
   col=add3(col,mul3(light,transmit*opacity));transmit*=1.0-opacity;
  }
 }
 // Orbit-trap detail from the approved renderer lights the corona.
 float trap=originalTrap(v3(u*.75,v*.75,.43+genome.w));
 float fine=1.0/(1.0+120.0*trap*trap);
 float rim=exp(-abs(delta)*48.0)*(cloud*.75+cloud2*.4+.14);
 col=add3(col,mul3(spectrum(angle*.05+cloud),rim*(1.4+fine*1.7)));
 // A hot nucleus with wavelength-separated diffraction. Not an opaque white disk.
 float core=exp(-radial*radial*37.0)*(.35+.2*sin(t*.65));
 float nucleus=.0026/(.009+radial*radial);
 col=add3(col,mul3(mix3(v3(.35,.9,1.0),v3(1.0,.25,.42),sovereign),core+nucleus));
 float ray=exp(-abs(v+sin(u*4.0+t*.2)*.008)*125.0)*exp(-abs(u)*2.2);
 col=add3(col,mul3(v3(.35,.62,.88),ray*.13));
 // No uniform flash: events travel through the body and settle into a new state.
 float front=(1.0-effect)*1.7;
 float wave=exp(-abs(radial-front)*34.0)*effect;
 V3 eventColor=eventKind==2.0?v3(.67,.3,1.0):eventKind==3.0?v3(1.0,.56,.2):eventKind==4.0?v3(1.0,.18,.38):v3(.2,.95,1.0);
 col=add3(col,mul3(eventColor,wave*.75));
 if(eventKind==3.0){float jet=exp(-abs(v-u*.38)*90.0)*ease(.0,.3,u)*ease(1.5,.1,u);col=add3(col,mul3(eventColor,jet*effect*.55));}
 if(lens==2.0)col=mix3(col,v3(col.z*.8,col.x*.45,col.y*1.4),.55);
 // Filaments beyond the shell leave the edges dark, retaining the original atmosphere.
 float filament=pow(saturate(1.0-abs(cloud-.49)*22.0),7.0)*exp(-abs(delta-.14)*6.0);
 col=add3(col,mul3(spectrum(cloud+angle*.1),filament*.22));
 float star=lattice(TOI(floor(x*570.0)),TOI(floor(y*570.0)),47);
 if(star>.9992){float flicker=.55+.45*sin(t*.8+star*70.0);col=add3(col,mul3(v3(.51,.58,.82),flicker*.44));}
 float falloff=exp(-pow(radial/2.5,4.0));col=mul3(col,falloff);
 // Filmic-like exposure: preserve colored light rather than clamp to pure white.
 col=v3(1.0-exp(-col.x*1.55),1.0-exp(-col.y*1.55),1.0-exp(-col.z*1.55));
 return v3(pow(max(0.0,col.x),.88),pow(max(0.0,col.y),.88),pow(max(0.0,col.z),.88));
}

void main(){vec2 uv=(gl_FragCoord.xy-vec2(resolution.x*.5,resolution.y*(1.-center)))/resolution.y*3.2;outColor=vec4(radiance(uv.x,uv.y),1.);}