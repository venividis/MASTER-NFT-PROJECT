#version 300 es
  precision highp float;
  out vec4 outColor;
  uniform vec2 r;
  uniform float t;
  uniform vec4 seed;
  uniform vec4 genome;
  uniform vec4 state;
  uniform vec2 pointer;
  uniform float sovereign;
  uniform float pulse;

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

  void main(){
    vec2 uv=(gl_FragCoord.xy-.5*r.xy)/r.y;
    vec3 col=vec3(0.);
    col+=render(uv+vec2(.0015,0.))*vec3(1.,.35,.25);
    col+=render(uv)*vec3(.2,.62,1.);
    col+=render(uv-vec2(.0015,0.))*vec3(.2,.1,.55);
    col/=1.7;
    float vignette=smoothstep(1.25,.18,length(uv));
    col*=.52+.48*vignette;
    outColor=vec4(col,1.);
  }