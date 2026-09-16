"""Native GLES regression; numerical pixels only, not browser certification."""
from pathlib import Path
import json,subprocess,sys,tempfile,os,ctypes.util
import numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[2];sys.path.insert(0,str(R/'test/visual'))
from native_renderer import GLES
if os.environ.get('GENESIS_EGL_LIBRARY'):
 original_find_library=ctypes.util.find_library
 ctypes.util.find_library=lambda name: os.environ['GENESIS_EGL_LIBRARY'] if name=='EGL' else original_find_library(name)
source=(R/'render/living/field.frag').read_text()
projected=subprocess.check_output(['node','--input-type=module','-e',"import fs from 'node:fs';import {formationShader} from './web/genesis/projection.mjs';process.stdout.write(formationShader(fs.readFileSync('render/living/field.frag','utf8')));"],cwd=R,text=True)
vs='#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
results=[]
with tempfile.TemporaryDirectory() as scratch:
 for w,h in [(180,120),(96,180)]:
  g=GLES(w,h)
  base={'resolution':[w,h],'center':.46,'seed':[.3,.6,.7,.2],'genome':[.55,.4,.77,.66],'root':[.1,.9,.3,.5],'life0':[0,0,0,0],'life1':[0,0,0,0],'t':12,'sovereign':0,'pulse':0,'fold':0,'cameraX':0,'cameraY':0,'zoom':1,'pointerX':.5,'pointerY':.5,'eventKind':0,'lens':0,'genesisViewport':[w,h],'genesisPanel':[w*.5,h*.51,w*.36,h*.30],'genesisIdentity':[.2,.6,.4,.8]}
  for name,changes in [('bound',{}),('lived',{'life0':[.25,-.2,.3,.2],'life1':[-.2,.2,.1,.2]}),('sovereign',{'sovereign':1}),('folded',{'fold':.7,'cameraX':.2,'cameraY':-.3}),('changed-root',{'root':[.7,.2,.9,.1]})]:
   u={**base,**changes};p=Path(scratch)/'pixels.png';g.program(vs,source);g.render(u,str(p));before=np.asarray(Image.open(p)).copy();g.program(vs,projected);g.render({**u,'genesisOpening':0},str(p));after=np.asarray(Image.open(p));error=int(np.abs(after.astype(int)-before.astype(int)).max());assert error==0,(name,error)
   results.append({'case':name,'resolution':[w,h],'zeroFormationMaxByteError':error})
  for amount in [.25,.5,1]:
   g.render({**base,'genesisOpening':amount},str(p));image=np.asarray(Image.open(p));assert np.all(image[:,:,3]==255);assert np.std(image[:,:,:3])>1;assert not np.array_equal(image,before)
   results.append({'formation':amount,'resolution':[w,h],'compiledAndRendered':True})
out=R/'reports/cleanup-6.0/native-rendering.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps({'scope':'Native Mesa GLES; no browser or device certification','cases':results,'passed':len(results)},indent=2)+'\n');print('Passed',len(results),'blue projection cases; unchanged pixels at home.')
