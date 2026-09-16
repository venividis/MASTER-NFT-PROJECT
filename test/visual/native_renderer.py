import ctypes as C,ctypes.util,json,sys,time,re
from pathlib import Path
from PIL import Image
import numpy as np
P=C.c_void_p; I=C.c_int; U=C.c_uint; F=C.c_float
class GLES:
 def __init__(self,w=1280,h=850):
  self.w=w;self.h=h; E=self.E=C.CDLL(ctypes.util.find_library('EGL'));E.eglGetProcAddress.argtypes=[C.c_char_p];E.eglGetProcAddress.restype=P
  getdisplay=C.CFUNCTYPE(P,U,P,C.POINTER(I))(E.eglGetProcAddress(b'eglGetPlatformDisplayEXT'));self.d=d=getdisplay(0x31DD,None,None)
  E.eglInitialize.argtypes=[P,C.POINTER(I),C.POINTER(I)];E.eglInitialize.restype=U
  a=I();b=I();assert E.eglInitialize(d,C.byref(a),C.byref(b))
  E.eglBindAPI.argtypes=[U];E.eglBindAPI.restype=U;E.eglBindAPI(0x30A0)
  attrs=(I*13)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038)
  E.eglChooseConfig.argtypes=[P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)];E.eglChooseConfig.restype=U;conf=P();num=I();assert E.eglChooseConfig(d,attrs,C.byref(conf),1,C.byref(num)) and num.value
  E.eglCreatePbufferSurface.argtypes=[P,P,C.POINTER(I)];E.eglCreatePbufferSurface.restype=P;self.s=E.eglCreatePbufferSurface(d,conf,(I*5)(0x3057,w,0x3056,h,0x3038))
  E.eglCreateContext.argtypes=[P,P,P,C.POINTER(I)];E.eglCreateContext.restype=P;self.ctx=E.eglCreateContext(d,conf,None,(I*3)(0x3098,3,0x3038))
  E.eglMakeCurrent.argtypes=[P,P,P,P];E.eglMakeCurrent.restype=U;assert E.eglMakeCurrent(d,self.s,self.s,self.ctx)
  print(self.func('glGetString',C.c_char_p,[U])(0x1F02).decode(),flush=True)
 def func(self,name,ret,args):return C.CFUNCTYPE(ret,*args)(self.E.eglGetProcAddress(name.encode()))
 def program(self,vs,fs):
  create=self.func('glCreateShader',U,[U]);source=self.func('glShaderSource',None,[U,I,C.POINTER(C.c_char_p),C.POINTER(I)]);compile_=self.func('glCompileShader',None,[U]);getiv=self.func('glGetShaderiv',None,[U,U,C.POINTER(I)]);getlog=self.func('glGetShaderInfoLog',None,[U,I,C.POINTER(I),C.c_char_p]);shaders=[]
  for st,content in [(0x8B31,vs),(0x8B30,fs)]:
   sh=create(st);b=C.c_char_p(content.encode());source(sh,1,C.byref(b),None);compile_(sh);ok=I();getiv(sh,0x8B81,C.byref(ok));buf=C.create_string_buffer(16000);getlog(sh,15999,None,buf)
   if not ok.value:raise RuntimeError(buf.value.decode())
   shaders.append(sh)
  pr=self.func('glCreateProgram',U,[])();attach=self.func('glAttachShader',None,[U,U]);link=self.func('glLinkProgram',None,[U]);getp=self.func('glGetProgramiv',None,[U,U,C.POINTER(I)])
  for sh in shaders:attach(pr,sh)
  link(pr);ok=I();getp(pr,0x8B82,C.byref(ok));assert ok.value,'Link failed';self.pr=pr;self.func('glUseProgram',None,[U])(pr)
  gen=self.func('glGenBuffers',None,[I,C.POINTER(U)]);buf=U();gen(1,C.byref(buf));self.func('glBindBuffer',None,[U,U])(0x8892,buf.value)
  data=(F*6)(-1,-1,3,-1,-1,3);self.func('glBufferData',None,[U,C.c_ssize_t,P,U])(0x8892,C.sizeof(data),data,0x88E4)
  loc=self.func('glGetAttribLocation',I,[U,C.c_char_p])(pr,b'p');self.func('glEnableVertexAttribArray',None,[U])(loc);self.func('glVertexAttribPointer',None,[U,I,U,U,I,P])(loc,2,0x1406,0,0,None)
 def render(self,uniforms,dest):
  getloc=self.func('glGetUniformLocation',I,[U,C.c_char_p]);
  for n,v in uniforms.items():
   loc=getloc(self.pr,n.encode());v=v if isinstance(v,list) else [v]
   self.func('glUniform'+str(len(v))+'f',None,[I]+[F]*len(v))(loc,*v)
  self.func('glViewport',None,[I,I,I,I])(0,0,self.w,self.h);start=time.monotonic();self.func('glDrawArrays',None,[U,I,I])(4,0,3);self.func('glFinish',None,[])()
  pixels=np.zeros((self.h,self.w,4),dtype=np.uint8);self.func('glReadPixels',None,[I,I,I,I,U,U,P])(0,0,self.w,self.h,0x1908,0x1401,pixels.ctypes.data)
  Image.fromarray(np.flipud(pixels)).save(dest);print(dest,round(time.monotonic()-start,3),'seconds',flush=True)
