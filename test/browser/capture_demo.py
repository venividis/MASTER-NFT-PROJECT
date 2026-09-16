"""Capture the real running page; video timing follows screenshot acquisition.
No images are substituted for the rendered canvas. Silent, local preview only.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import time,json,subprocess,hashlib
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'reports/demo-frames';OUT.mkdir(exist_ok=True)
html=(ROOT/'preview.html').read_text();shots=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1280,'height':850},device_scale_factor=1)
 page.set_content(html,wait_until='domcontentloaded');page.wait_for_function("document.body.dataset.ready==='true'",timeout=15000);page.wait_for_function('__idfbi.renderer.frames>0',timeout=20000)
 started=time.monotonic()
 def capture(seconds):
  end=time.monotonic()+seconds
  while time.monotonic()<end:
   path=OUT/f'{len(shots):04}.png';t=time.monotonic()-started;page.screenshot(path=str(path));shots.append((path.name,t));page.wait_for_timeout(160)
 capture(2)
 page.click('#evolve');capture(4)
 page.click('#fold');capture(3)
 page.click('#reset');page.click('#spawn');capture(3)
 page.click('#ascend');page.check('#ascend-consent');capture(1)
 page.click('#ascend-confirm');capture(7)
 backend=page.evaluate('__idfbi.renderer.backend');browser.close()
concat=[]
for i,(name,t)in enumerate(shots):
 concat.append(f"file '{name}'")
 if i+1<len(shots):concat.append(f'duration {max(.01,shots[i+1][1]-t):.6f}')
concat.append(f"file '{shots[-1][0]}'")
(OUT/'frames.txt').write_text('\n'.join(concat)+'\n')
subprocess.run(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i',str(OUT/'frames.txt'),'-vsync','vfr','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',str(ROOT/'reports/interface-demo.mp4')],check=True)
(ROOT/'reports/video-capture.json').write_text(json.dumps({'previewSha256':hashlib.sha256(html.encode()).hexdigest(),'backend':backend,'frames':len(shots),'captureSeconds':shots[-1][1],'scope':'Actual browser screenshots with acquisition-based durations; silent local preview; not a performance benchmark.','events':['evolve','fourth-axis slice','spawn','ascend']},indent=2));print('Captured',len(shots),'frames',backend,flush=True)
