from pathlib import Path
import sys,json,subprocess
import numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[2];sys.path.insert(0,str(R/'test/visual'))
from native_renderer import GLES
O=R/'reports/v1.7/field-parity';O.mkdir(exist_ok=True,parents=True)
p=[.3,.6,.7,.2,.55,.4,.77,.66,.1,.9,.3,.5,12,0,0,0,0,0,1,.5,.5,0,0];W,H=180,120
vs='#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
g=GLES(W,H);g.program(vs,(R/'render/living/field.frag').read_text())
node="""import fs from 'node:fs';const d=JSON.parse(process.argv[1]);const e=(await WebAssembly.instantiate(fs.readFileSync('render/living/field.wasm'),{math:{sin:Math.sin,cos:Math.cos,exp:Math.exp,pow:Math.pow,atan2:Math.atan2}})).instance.exports;d.p.forEach((v,i)=>e.set_param(i,v));e.render(d.w,d.h,.46);process.stdout.write(Buffer.from(e.memory.buffer,e.buffer_ptr(),d.w*d.h*4));"""
results=[]
for name,traits in [('zero',[0]*8),('one-decision',[.04,-.02,.07,.03,-.04,.01,-.03,.06]),('mixed-life',[.25,-.2,.3,.2,-.2,.2,.1,.2]),('negative-limit',[-.4]*8),('positive-limit',[.4]*8),('alternating',[.4,-.4,.4,-.4,.4,-.4,.4,-.4])]:
 q=p+traits;u={'resolution':[W,H],'center':.46,'seed':q[:4],'genome':q[4:8],'root':q[8:12],'life0':q[23:27],'life1':q[27:31]};u.update(dict(zip(['t','sovereign','pulse','fold','cameraX','cameraY','zoom','pointerX','pointerY','eventKind','lens'],q[12:23])))
 dest=O/(name+'-gles.png');g.render(u,str(dest));pixels=subprocess.check_output(['node','--input-type=module','-e',node,json.dumps({'p':q,'w':W,'h':H})],cwd=R,timeout=25);cpu=np.frombuffer(pixels,dtype=np.uint8).reshape(H,W,4);Image.fromarray(cpu).save(O/(name+'-wasm.png'));delta=np.abs(np.asarray(Image.open(dest))[:,:,:3].astype(int)-cpu[:,:,:3].astype(int));results.append({'case':name,'meanRGBError':float(delta.mean()),'maxRGBError':int(delta.max()),'passed':bool(delta.mean()<=2)})
report={'scope':'Native GLES vs actual Wasm; not browser WebGL certification','resolution':[W,H],'criteria':'mean RGB absolute error <= 2 out of 255','passed':sum(x['passed']for x in results),'failed':sum(not x['passed']for x in results),'cases':results};(O/'results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));assert report['failed']==0
