from playwright.sync_api import sync_playwright
from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
html=(root/'preview.html').read_text()
errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':950},reduced_motion='reduce')
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate("""()=>{const make=()=>{const store={};return {getItem:k=>Object.hasOwn(store,k)?store[k]:null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k],clear:()=>Object.keys(store).forEach(k=>delete store[k])}};Object.defineProperty(window,'localStorage',{value:make(),configurable:true});Object.defineProperty(window,'sessionStorage',{value:make(),configurable:true});}""")
 page.set_content(html,wait_until='domcontentloaded')
 page.wait_for_function("window.__kingdom && document.querySelector('#kingdom').dataset.ready==='true'")
 page.wait_for_timeout(600)
 page.screenshot(path=str(root/'reports/v1.4/sanctum-desktop.png'))
 page.click('#k-tabs [data-view="market"]');page.wait_for_timeout(400)
 page.screenshot(path=str(root/'reports/v1.4/marketplace-desktop.png'))
 page.click('#k-tabs [data-view="world"]');page.wait_for_timeout(400)
 page.screenshot(path=str(root/'reports/v1.4/world-desktop.png'))
 page.set_viewport_size({'width':390,'height':844});page.click('#k-tabs [data-view="sanctum"]');page.wait_for_timeout(300)
 page.screenshot(path=str(root/'reports/v1.4/sanctum-mobile.png'))
 page.click('#k-tabs [data-view="world"]');page.wait_for_timeout(200)
 page.screenshot(path=str(root/'reports/v1.4/world-mobile.png'))
 print(json.dumps({'errors':errors,'browser':b.version,'scrollWidth':page.evaluate('document.documentElement.scrollWidth')}))
 b.close()
