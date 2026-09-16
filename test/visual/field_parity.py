"""Compare real GLES shader pixels against the shipped WebAssembly field.
This is NOT a browser-WebGL test. Both paths use render/field.inc.
"""
from pathlib import Path
import json, subprocess, sys, hashlib, time
import numpy as np
from PIL import Image
from native_renderer import GLES
ROOT=Path(__file__).resolve().parents[2]
R=ROOT/'reports';R.mkdir(exist_ok=True)
payload=json.loads((R/'browser-frame-parameters.json').read_text())
p=payload['params'];center=payload['center'];W,H=240,160
vs='#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
g=GLES(W,H);g.program(vs,(ROOT/'render/field.frag').read_text())
node=r"""import fs from 'node:fs';const d=JSON.parse(process.argv[1]);const e=(await WebAssembly.instantiate(fs.readFileSync('render/field.wasm'),{math:{sin:Math.sin,cos:Math.cos,exp:Math.exp,pow:Math.pow,atan2:Math.atan2}})).instance.exports;d.p.forEach((v,i)=>e.set_param(i,v));if(!e.render(d.w,d.h,d.center))throw Error('invalid');process.stdout.write(Buffer.from(e.memory.buffer,e.buffer_ptr(),d.w*d.h*4));"""
results=[]
for name,changes in [('bound',{}),('sovereign',{13:1}),('folded',{15:1}),('genome-change',{4:.93,5:.18,6:.71,7:.16}),('evolution-event',{14:.7,21:1}),('ascension-event',{13:1,14:.65,21:4})]:
 q=p.copy()
 for i,v in changes.items():q[i]=v
 u={'resolution':[W,H],'center':center,'seed':q[:4],'genome':q[4:8],'root':q[8:12]}
 u.update(dict(zip(['t','sovereign','pulse','fold','cameraX','cameraY','zoom','pointerX','pointerY','eventKind','lens'],q[12:])))
 gpu=R/f'parity-{name}-gles.png';g.render(u,str(gpu))
 data=subprocess.check_output(['node','--input-type=module','-e',node,json.dumps({'p':q,'w':W,'h':H,'center':center})],cwd=ROOT,timeout=30)
 wasm=np.frombuffer(data,dtype=np.uint8).reshape(H,W,4);Image.fromarray(wasm).save(R/f'parity-{name}-wasm.png')
 a=np.asarray(Image.open(gpu));difference=np.abs(a[:,:,:3].astype(float)-wasm[:,:,:3].astype(float))
 result={'case':name,'rgbMeanAbsoluteErrorOutOf255':float(difference.mean()),'rgb99thPercentileError':float(np.percentile(difference,99)), 'rgbMaximumError':int(difference.max()),'wasmNonblackFraction':float(np.mean(wasm[:,:,:3].max(axis=2)>15)), 'wasmPixelSha256':hashlib.sha256(data).hexdigest()}
 # Numerical parity acceptance is <=2/255 mean error; not bit identity across GPUs.
 result['passed']=result['rgbMeanAbsoluteErrorOutOf255']<=2
 results.append(result)
report={'scope':'Native GLES 3.2 Mesa versus WebAssembly, same inputs and shared source. Not browser-GPU certification.','resolution':[W,H],'acceptance':'RGB mean absolute error <= 2/255 in each case; floating-point implementations need not be bit-identical.','cases':results,'passed':sum(x['passed'] for x in results),'failed':sum(not x['passed'] for x in results)}
(R/'field-parity.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
if report['failed']:sys.exit(1)
