// Portable CPU renderer. No libc, malloc, network, filesystem, or application-state writes.
typedef unsigned int uint;
typedef struct{float x,y,z;} V3;
typedef struct{float x,y,z,w;} V4;
static V3 v3(float x,float y,float z){V3 p={x,y,z};return p;}
#define TOU(x) ((uint)(x))
#define TOF(x) ((float)(x))
#define TOI(x) ((int)(x))
__attribute__((import_module("math"),import_name("sin"))) float sin(float);
__attribute__((import_module("math"),import_name("cos"))) float cos(float);
__attribute__((import_module("math"),import_name("exp"))) float exp(float);
__attribute__((import_module("math"),import_name("pow"))) float pow(float,float);
__attribute__((import_module("math"),import_name("atan2"))) float atan2(float,float);
static float sqrt(float x){return __builtin_sqrtf(x);}static float floor(float x){return __builtin_floorf(x);}static float abs(float x){return __builtin_fabsf(x);}
static float min(float a,float b){return a<b?a:b;}static float max(float a,float b){return a>b?a:b;}
V4 seed,genome,root;float t,sovereign,pulse,fold,cameraX,cameraY,zoom,pointerX,pointerY,eventKind,lens;
#include "field.inc"
static unsigned char pixels[960*640*4];
__attribute__((visibility("default"))) unsigned int buffer_ptr(void){return (unsigned int)pixels;}
__attribute__((visibility("default"))) void set_param(int i,float f){
 if(i<0||i>22)return;
 if(i<4){((float*)&seed)[i]=f;}else if(i<8){((float*)&genome)[i-4]=f;}else if(i<12){((float*)&root)[i-8]=f;}
 else if(i==12)t=f;else if(i==13)sovereign=f;else if(i==14)pulse=f;else if(i==15)fold=f;else if(i==16)cameraX=f;else if(i==17)cameraY=f;else if(i==18)zoom=f;else if(i==19)pointerX=f;else if(i==20)pointerY=f;else if(i==21)eventKind=f;else if(i==22)lens=f;
}
__attribute__((visibility("default"))) int render_region(int w,int h,float center,int y0,int y1){
 if(w<1||h<1||w>960||h>640||y0<0||y1>h||y1<=y0)return 0;
 for(int y=y0;y<y1;y++)for(int x=0;x<w;x++){
  V3 c=radiance((TOF(x)+.5-TOF(w)*.5)/TOF(h)*3.2,(TOF(h)*center-TOF(y)-.5)/TOF(h)*3.2);
  int i=((y-y0)*w+x)*4;pixels[i]=(unsigned char)(saturate(c.x)*255.0);pixels[i+1]=(unsigned char)(saturate(c.y)*255.0);pixels[i+2]=(unsigned char)(saturate(c.z)*255.0);pixels[i+3]=255;
 }
 return 1;
}
__attribute__((visibility("default"))) int render(int w,int h,float center){return render_region(w,h,center,0,h);}
