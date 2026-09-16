// One fixed optical scene. The approved density is retained; the authored 2D
// glow is continued through a thin emissive layer, not replaced by a sphere.
V4 agV4(float x,float y,float z,float w){V4 v;v.x=x;v.y=y;v.z=z;v.w=w;return v;}
V3 agLifeSpace(V3 p){
 p=v3(p.x,p.y,p.z);
 float lived=abs(life0.x)+abs(life0.y)+abs(life0.z)+abs(life0.w)+abs(life1.x)+abs(life1.y)+abs(life1.z)+abs(life1.w);
 if(lived>.000001){
  float aa=atan2(p.y,p.x),rr=sqrt(p.x*p.x+p.y*p.y);
  float lobes=1.0+life0.y*.42*sin(aa*3.0+life1.z*3.0)+life0.z*.35*cos(aa*5.0+life1.w*2.0);
  float turn=life0.w*.85*(1.0-exp(-rr*rr*1.7)),cu=cos(turn),su=sin(turn),old=p.x;
  p.x=(p.x*cu-p.y*su)/((1.0+life0.x*.6)*lobes);
  p.y=(old*su+p.y*cu)/((1.0-life0.x*.45)*lobes);
 }
 return p;
}
// AG_BASE_MEDIUM_INSERT
// AG_EXTERIOR_LIGHT_INSERT
V3 agGlow(V3 ro,V3 rd){
 // Intersect the emissive layer with a fixed XY support. The original vignette
 // is negligible at radius six; clipping keeps grazing rays finite and visible.
 float begin=0.0,end=10000.0;
 if(abs(rd.z)>.000001){
  float a=(-.12-ro.z)/rd.z,b=(.12-ro.z)/rd.z;
  begin=max(begin,min(a,b));end=min(end,max(a,b));
 }else if(abs(ro.z)>=.12)return v3(0.0,0.0,0.0);
 float axy=rd.x*rd.x+rd.y*rd.y,bxy=ro.x*rd.x+ro.y*rd.y,cxy=ro.x*ro.x+ro.y*ro.y-36.0;
 if(axy>.00000001){
  float det=bxy*bxy-axy*cxy;if(det<=0.0)return v3(0.0,0.0,0.0);
  begin=max(begin,(-bxy-sqrt(det))/axy);end=min(end,(-bxy+sqrt(det))/axy);
 }else if(cxy>0.0)return v3(0.0,0.0,0.0);
 if(end<=begin)return v3(0.0,0.0,0.0);
 float za=ro.z+rd.z*begin,zb=ro.z+rd.z*end;
 float weight=(end-begin)*(.75/.12)*max(0.0,1.0-(za*za+za*zb+zb*zb)/(3.0*.12*.12));
 V3 col=v3(0.0,0.0,0.0);float weights=0.0;
 for(int j=0;j<8;j++){
  float at=begin+(TOF(j)+.5)*(end-begin)/8.0;
  V3 p=add3(ro,mul3(rd,at));float g=max(0.0,1.0-p.z*p.z/(.12*.12));
  V3 light=agExteriorLight((p.x-(pointerX-.5)*.045)/max(.48,zoom),(p.y-(pointerY-.5)*.035)/max(.48,zoom));
  col=add3(col,mul3(light,g));weights+=g;
 }
 return mul3(col,weight/max(.00001,weights));
}
float agSupport(V3 p){return length3(agLifeSpace(p))-1.24;}
V3 agView(float x,float y){
 V3 eye=v3(genesisCamera.x,genesisCamera.y,genesisCamera.z);
 float distance=max(0.0,genesisOptics.y>.5?genesisOptics.x:length3(eye)),reference=max(1.248,genesisLook.y);
 float perspective=ease(reference,1.0,distance);
 float scale=max(.08,distance/2.6);
 V3 offset=rotate3(v3(-(x*scale+(pointerX-.5)*.045)*(1.0-perspective),(y*scale+(pointerY-.5)*.035)*(1.0-perspective),0.0),genesisLook.x,genesisCamera.w);
 V3 ro=add3(eye,offset);
 V3 rd=rotate3(v3(-x*perspective/2.6,y*perspective/2.6,-1.0),genesisLook.x,genesisCamera.w);rd=mul3(rd,1.0/length3(rd));
 V3 col=v3(0.0,0.0,0.0);float transmit=1.0;
 // With zero XY life warp (all recorded NFT states), exact sphere intersection.
 float xyLife=abs(life0.x)+abs(life0.y)+abs(life0.z)+abs(life0.w);
 V3 intersectionOrigin=ro;
 if(xyLife>.000001&&abs(rd.x)+abs(rd.y)<.00001)intersectionOrigin=agLifeSpace(ro);
 float bound=xyLife>.000001&&abs(rd.x)+abs(rd.y)>=.00001?4.0:1.24;
 float dot=dot3(intersectionOrigin,rd),det=dot*dot-dot3(intersectionOrigin,intersectionOrigin)+bound*bound;
 if(det>0.0){
  float begin=max(0.0,-dot-sqrt(det)),end=-dot+sqrt(det);
  if(end>begin){
   // Resolve the fixed deformed support, rather than deforming it by camera distance.
   if(bound>1.25){
    float first=end,last=begin,span=(end-begin)/48.0;
    for(int k=0;k<48;k++){
     float at=begin+(TOF(k)+.5)*span;
     if(agSupport(add3(ro,mul3(rd,at)))<0.0){first=min(first,at);last=max(last,at);}
    }
    if(last>=first){
     float lo=max(begin,first-span),hi=first;
     for(int j=0;j<10;j++){float mid=(lo+hi)*.5;if(agSupport(add3(ro,mul3(rd,mid)))<0.0)hi=mid;else lo=mid;}
     first=(lo+hi)*.5;lo=last;hi=min(end,last+span);
     for(int j=0;j<10;j++){float mid=(lo+hi)*.5;if(agSupport(add3(ro,mul3(rd,mid)))<0.0)lo=mid;else hi=mid;}
     last=(lo+hi)*.5;
    }
    begin=first;end=last;
   }
   if(end>begin){
    // The original's 18 midpoint samples remain the same at the home camera.
    // Sampling count does not jump on entry or crossing the membrane.
    float ds=(end-begin)/18.0;
    for(int j=0;j<18;j++){
     V3 p=agLifeSpace(add3(ro,mul3(rd,begin+(TOF(j)+.5)*ds)));
     if(length3(p)<=1.24){
      V4 medium=agBaseMedium(p);float opacity=1.0-exp(-medium.w*ds*2.7);
      col=add3(col,mul3(v3(medium.x,medium.y,medium.z),transmit*opacity));transmit*=1.0-opacity;
     }
    }
   }
  }
 }
 col=add3(col,agGlow(ro,rd));
 // Same exposure and response as the original exterior, at every distance.
 col=v3(1.0-exp(-col.x*1.55),1.0-exp(-col.y*1.55),1.0-exp(-col.z*1.55));
 return v3(pow(max(0.0,col.x),.88),pow(max(0.0,col.y),.88),pow(max(0.0,col.z),.88));
}
