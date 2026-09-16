"""Actual production GLSL and CPU parity. Native Mesa GLES, not browser QA."""
from pathlib import Path
import json,subprocess,sys,math
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'test/visual'))
from native_renderer import GLES
out=ROOT/'reports/cleanup-6.0/interior';out.mkdir(parents=True,exist_ok=True)
source=subprocess.check_output(['node','--input-type=module','-e',"import fs from 'node:fs';import {formationShader} from './web/genesis/projection.mjs';process.stdout.write(formationShader(fs.readFileSync('render/living/field.frag','utf8')));"],cwd=ROOT,text=True)
vs='#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
base={'center':.46,'seed':[.3,.6,.7,.2],'genome':[.55,.4,.77,.66],'root':[.1,.9,.3,.5],'life0':[0,0,0,0],'life1':[0,0,0,0],'t':12,'sovereign':0,'pulse':0,'fold':0,'cameraX':0,'cameraY':0,'zoom':1,'pointerX':.5,'pointerY':.5,'eventKind':0,'lens':0,'genesisOpening':0,'genesisIdentity':[.2,.6,.4,.8],'genesisDepth':1,'genesisCamera':[0,.12,-.62,math.atan2(-.35,-1.07)],'genesisLook':[math.atan2(-.10,math.hypot(.35,1.07)),2.6],'genesisAudio':0,'genesisSamples':112}
cases=[('within-the-field',960,600,{}),('membrane',512,320,{'genesisCamera':[.12,.06,-.88,math.atan2(-.38,-1.33)],'genesisLook':[-.007,0]}),('portrait',320,568,{}),('other-genome',512,320,{'genome':[.91,.13,.21,.81]}),('lived-fold-event',512,320,{'life0':[.3,-.2,.4,.2],'life1':[.4,.1,-.3,.7],'fold':.7,'pulse':.5,'eventKind':4,'sovereign':1}),('outside-volume',512,320,{'genesisCamera':[0,0,-2.6,math.pi],'genesisLook':[0,0]}),('crossing',512,320,{'genesisCamera':[0,.05,-1.1,math.pi],'genesisLook':[0,0]}),('continuous-depth-flag',320,200,{'genesisDepth':.08,'genesisCamera':[0,0,-2.6,math.pi],'genesisLook':[0,0]}),('opposite-side',512,320,{'genesisCamera':[0,0,.65,0],'genesisLook':[0,0]})]
results=[]
for name,w,h,extra in cases:
 g=GLES(w,h);g.program(vs,source);path=out/(name+'.png');g.render({**base,'resolution':[w,h],'genesisViewport':[w,h],'genesisPanel':[w*.5,h*.5,w*.3,h*.3],**extra},str(path))
 pixels=np.asarray(Image.open(path));assert (pixels[:,:,3]==255).all();assert pixels[:,:,:3].std()>10,(name,'flat scene');assert (pixels[:,:,:3].mean(axis=2)>245).mean()<.15,(name,'overexposed')
 results.append({'case':name,'size':[w,h],'pixelStd':float(pixels[:,:,:3].std()),'passed':True});print('PASS',name,flush=True)
# A camera at the original view must reproduce the source blue field. This is
# the regression that the prior two-renderer crossfade did not establish.
home=[]
for name,extra in [('seed',{}),('genome',{'genome':[.91,.13,.21,.81]}),('root',{'root':[.71,.24,.59,.08]}),('rotation-pointer',{'cameraX':.3,'cameraY':-.5,'pointerX':.73,'pointerY':.29}),('fold-event',{'fold':.7,'pulse':.5,'eventKind':4,'sovereign':1}),('minimum-scale',{'zoom':.45})]:
 w,h=80,64;u={**base,**extra,'genesisCamera':[0,0,-2.6*max(.48,extra.get('zoom',1)),math.pi],'genesisLook':[0,2.6*max(.48,extra.get('zoom',1))],'resolution':[w,h]}
 g=GLES(w,h);p=out/('home-'+name+'.png');g.program(vs,source);g.render(u,str(p));flight=np.asarray(Image.open(p)).copy()
 g.program(vs,(ROOT/'render/living/field.frag').read_text());g.render(u,str(p));original=np.asarray(Image.open(p));diff=np.abs(original.astype(float)-flight.astype(float));mae=float(diff[:,:,:3].mean());maximum=float(diff.max());assert mae<.05 and maximum<=1,(name,mae,maximum)
 home.append({'case':name,'meanByteError':mae,'maxByteError':maximum,'passed':True});print('PASS identical home',name,mae,maximum,flush=True)
parity=[]
for name,extra in [('base',{}),('life',cases[4][3]),('time-audio',{'t':28,'genesisAudio':.8,'lens':2,'cameraX':.2,'cameraY':-.3})]:
 u={**base,**extra,'genesisSamples':64};w,h=64,40;g=GLES(w,h);g.program(vs,source);path=out/('parity-'+name+'.png');g.render({**u,'resolution':[w,h]},str(path))
 params=u['seed']+u['genome']+u['root']+[u[k] for k in ['t','sovereign','pulse','fold','cameraX','cameraY','zoom','pointerX','pointerY','eventKind','lens']]+u['life0']+u['life1']
 data={'params':params,'view':{'camera':u['genesisCamera'],'look':u['genesisLook'],'samples':64,'audio':u['genesisAudio']}}
 script="import {createInteriorCPU} from './web/genesis/interior-kernel.mjs';const d="+json.dumps(data)+";const e=createInteriorCPU();e.configure(d.params,d.view);process.stdout.write(e.render(64,40));"
 cpu=np.frombuffer(subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT),dtype=np.uint8).reshape(h,w,4)
 gpu=np.asarray(Image.open(path));diff=np.abs(cpu[:,:,:3].astype(float)-gpu[:,:,:3].astype(float));mae=float(diff.mean());p99=float(np.percentile(diff,99));assert mae<.05 and p99<=1 and diff.max()<=1,(name,mae,p99)
 parity.append({'case':name,'meanByteError':mae,'p99ByteError':p99,'passed':True});print('PASS CPU/GPU',name,mae,p99,flush=True)
(out/'results.json').write_text(json.dumps({'scope':'Native Mesa GLES, not browser/device QA','cases':results,'sameObjectAtHome':home,'softwareParity':parity},indent=2)+'\n')
