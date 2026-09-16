"""Actual browser integration. Opaque-origin Web Crypto fails CLOSED; Node tests cover encryption.
No managed browser policy is overridden. Storage is an explicit test adapter, not real persistence.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,hashlib,subprocess
R=Path(__file__).resolve().parents[2];H=(R/'preview.html').read_text();O=R/'reports/v1.7/memory-browser';O.mkdir(parents=True,exist_ok=True)
STORAGE="""<script>(()=>{for(const key of ['localStorage','sessionStorage']){const d={};Object.defineProperty(window,key,{value:{getItem:k=>d[k]??null,setItem:(k,v)=>d[k]=String(v),removeItem:k=>delete d[k],clear:()=>{for(const k in d)delete d[k]},key:n=>Object.keys(d)[n]??null,get length(){return Object.keys(d).length}}});}window.__walletCalls=0;Object.defineProperty(window,'ethereum',{value:{request:async()=>{__walletCalls++;throw Error('No wallet allowed in test')}}});})();</script>"""
checks=[];errors=[];network=[]
def check(name,v):
 checks.append({'name':name,'passed':bool(v)});print(('PASS 'if v else'FAIL ')+name,flush=True);assert v,name
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);version=browser.version
 ctx=browser.new_context(viewport={'width':1440,'height':950},reduced_motion='reduce',accept_downloads=True)
 def load(saved=None):
  g=ctx.new_page();g.set_default_timeout(8000);g.on('pageerror',lambda e:errors.append(str(e)));g.on('request',lambda r:network.append(r.url)if r.url.startswith(('http:','https:','ws:','wss:'))else None);g.set_content(STORAGE)
  if saved:g.evaluate('d=>{for(const[k,v]of Object.entries(d))localStorage.setItem(k,v)}',saved)
  g.set_content(H);g.wait_for_function("document.body.dataset.instrumentsReady==='true'&&__instruments.memory().ready",timeout=20000);return g
 g=load();E=lambda exp:g.evaluate('(()=>{const e=__instruments.engine();return '+exp+'})()')
 def click(act,id=None):
  loc=g.locator('[data-act="'+act+'"]'+(''if id is None else'[data-id="'+str(id)+'"]')).first
  if act=='mem-back' and not loc.count():return
  loc.click()
 def tab(v):click('tab',v)
 def submit(form):g.locator('#'+form+' button[type=submit]').click()
 def confirm():
  click('confirm')
  try:g.wait_for_function("!document.querySelector('[data-act=confirm]')",timeout=10000)
  except:print(g.locator('#ix-notice').inner_text(),flush=True);raise
 def general(text,imprint=True):
  tab('journal');click('mem-new');g.fill('#mem-title','A useful memory');g.fill('#mem-thesis',text);g.select_option('#mem-privacy','public');g.set_checked('#mem-imprint',imprint);submit('mem-write-form');confirm()
 def status():return g.locator('#ix-notice').inner_text()
 g.wait_for_timeout(1500);base=g.evaluate('__idfbi.world().state.audit');baseform=E('e.form().root');g.screenshot(path=str(O/'genesis-desktop.png'))
 check('Original organism is still default and instruments are initially closed',not g.locator('#instrument-dialog').evaluate('e=>e.open'))
 check('Living field actually initialized with eight zero activity controls',E('e.form().traits')==[0]*8)
 check('Managed browser has no secure-context Web Crypto',not g.evaluate('!!crypto.subtle'))
 g.click('#instrument-open');check('Trade journal is optional and collapsed',not g.locator('.mem-trade').evaluate('e=>e.open'))
 g.locator('.mem-trade > summary').click();g.fill('#mem-thesis','My private test thesis must not leak through fallback.');g.fill('#mem-pass','Only for a crypto refusal test.');before=E('e.export().checksum');submit('ix-trade-form');g.wait_for_timeout(250)
 check('Missing Web Crypto refuses rather than storing private plaintext','native Web Crypto' in status()and E('e.export().checksum')==before)
 g.fill('#mem-thesis','A repeatable setup, not excitement.');g.locator('.mem-editor details > summary').click();g.fill('#mem-invalidation','Active users stop returning.');g.fill('#mem-risk','0.01 ETH planned loss; this is not a stop order.');g.fill('#mem-tags','adoption, patient');g.select_option('#mem-privacy','public');submit('ix-trade-form')
 check('Review freezes the reason and visibility before any mutation','Reason preserved' in g.locator('#ix-content').inner_text()and E('e.export().checksum')==before)
 g.screenshot(path=str(O/'journal-trade-review-desktop.png'));confirm()
 check('Successful swap has an inscription and separate fill link',E('e.mem.entries.length')==1 and E('e.mem.bindings.length')==1)
 check('The before entry precedes the receipt in the local event sequence',E('e.mem.entries[0].event<e.mem.bindings[0].receipt'))
 check('Journal and swap use the same exact plan digest',E('e.mem.entries[0].header.plan===e.mem.bindings[0].plan'))
 check('Private failed draft was not accidentally persisted','private test thesis' not in json.dumps(E('e.export()')))
 check('Successful activities advance life without changing original audit',E('e.form().count')==2 and g.evaluate('__idfbi.world().state.audit')==base)
 tab('journal');check('Process statistics distinguish observed fills, plans and reviews','1 / 1 readable notes' in g.locator('#ix-content').inner_text());click('mem-open',1)
 check('Decision and actual received asset are inspectable together','Active users stop returning.' in g.locator('#ix-content').inner_text()and 'What actually happened' in g.locator('#ix-content').inner_text())
 old=E('e.mem.entries[0]');click('mem-reflect',1);g.fill('#mem-thesis','I confused initial attention with sustained use. <img src=x onerror=alert(1)>');g.select_option('#mem-privacy','public');submit('mem-write-form');confirm()
 check('Reflection appends without replacing the original',E('e.mem.entries.length')==2 and E('e.mem.entries[0]')==old)
 check('Reflection binds its original author and parent',E('e.mem.entries[1].header.parent===1&&e.mem.entries[1].header.author==="you"'))
 check('Untrusted memory text is literal, not executable markup',g.locator('#ix-content img').count()==0 and '<img src=x' in g.locator('#ix-content').inner_text())
 click('mem-back');check('Review queue updates from linked reflection','1 / 1' in g.locator('#ix-content').inner_text());g.screenshot(path=str(O/'journal-desktop.png'))
 g.fill('#mem-search','not-present');g.locator('#mem-search').dispatch_event('change');check('Search does not hallucinate encrypted or missing text',g.locator('.mem-note').count()==0);g.fill('#mem-search','');g.locator('#mem-search').dispatch_event('change')
 before=E('e.world.identity().balances');general('Today I finished something difficult without making a trade.')
 check('General memories work without a financial operation',E('e.mem.entries.length')==3 and E('e.world.identity().balances')==before)
 f=E('e.form().root');click('mem-back');general('A private-to-the-shape decision, intentionally not imprinted.',False)
 check('Opting out leaves visible form root unchanged',E('e.form().root')==f)
 tab('trade');submit('ix-trade-form');confirm();check('Leaving the reason blank does not obstruct ordinary swaps',E('e.mem.entries.length')==4 and E('e.world.s.events.filter(x=>x.kind==="SWAPPED").length')==2)
 # Add two different activity classes using their actual controls.
 tab('vault');submit('ix-lock-form');confirm();tab('world');g.fill('#ix-message','A specific lesson, not a signal to buy.');submit('ix-message-form');g.wait_for_timeout(300)
 check('Locks and authored conversation contribute distinct channels',E('e.form().counts[1]>0&&e.form().counts[3]>0'))
 tab('journal');click('mem-back');click('mem-form');snap=E('e.export().checksum');full=E('e.form()');click('mem-form-at',E('e.mem.start'))
 check('Earlier activity view leaves balances and history untouched',E('e.export().checksum')==snap and g.evaluate('__instruments.memory().form.count')==0)
 check('History describes its base-genome scope','current base genome' in g.locator('#ix-content').inner_text())
 click('mem-present');click('mem-toggle-form');check('Original comparison is a view, not a rollback',g.evaluate('__instruments.memory().original')and E('e.export().checksum')==snap)
 click('mem-watch');g.wait_for_timeout(1400);g.screenshot(path=str(O/'compare-original-desktop.png'))
 g.click('#life-badge');click('mem-toggle-form');click('mem-watch');g.wait_for_timeout(1400);g.screenshot(path=str(O/'lived-desktop.png'))
 check('Lived form returns with identical deterministic traits',g.evaluate('__instruments.memory().form.traits')==full['traits'])
 check('Manual original identity audit remains unchanged',g.evaluate('__idfbi.world().state.audit')==base)
 g.click('#instrument-open');tab('journal');click('mem-back')
 with g.expect_download()as dl:click('mem-export-fills')
 dl.value.save_as(O/'execution.csv');csv=(O/'execution.csv').read_text();check('Execution CSV is explicit raw units with no journal prose','input_raw' in csv and 'A repeatable setup' not in csv and 'UNSIGNED LOCAL REHEARSAL' in csv)
 with g.expect_download()as dl:click('export')
 dl.value.save_as(O/'journal-export.json');archive=json.loads((O/'journal-export.json').read_text());check('Export includes append-only memory and operating state',archive['engine']['schema']=='idfbi/remembering/1.7'and len(archive['engine']['memory']['entries'])==4)
 saved=g.evaluate('Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).map(k=>[k,localStorage.getItem(k)]))');clone=load(saved)
 check('Actual browser restore reconstructs the same history-derived form',clone.evaluate('__instruments.engine().form().traits')==full['traits']);clone.close()
 # Explicitly import an encrypted external fixture produced by the same module under Node Web Crypto.
 node="""import fs from 'node:fs';import {MemoryEngine} from './web/memory/engine.mjs';import {encryptMemory,memoryBody,memorySeal} from './web/memory/crypto.mjs';const p=process.argv[1],a=JSON.parse(fs.readFileSync(p));const e=MemoryEngine.restore(a.engine);const h=e.memoryHeader({form:false});const c=await encryptMemory(h,memoryBody({thesis:'PRIVATE FIXTURE ONLY: clear body absent from storage.'}),'Fixture password not used for any funds.');e.appendMemory(memorySeal(h,c));a.engine=e.export();fs.writeFileSync(p+'.encrypted.json',JSON.stringify(a));"""
 subprocess.run(['node','--input-type=module','-e',node,str(O/'journal-export.json')],cwd=R,check=True)
 click('import');g.locator('#ix-import').set_input_files(str(O/'journal-export.json.encrypted.json'));g.wait_for_selector('[data-act=confirm]');confirm();click('mem-open',5)
 check('Encrypted imported body is not revealed by its public header','PRIVATE FIXTURE ONLY' not in g.locator('#ix-content').inner_text()and g.locator('#mem-unlock-form').count()==1)
 g.fill('#mem-unlock-pass','Fixture password not used for any funds.');submit('mem-unlock-form');g.wait_for_timeout(100)
 check('Unavailable browser decryption never substitutes an unverified plaintext','Cannot open this memory' in status() and 'PRIVATE FIXTURE ONLY' not in g.locator('#ix-content').inner_text())
 check('Imported envelope still omits passphrase and private body','PRIVATE FIXTURE ONLY' not in json.dumps(E('e.export()')) and 'Fixture password' not in json.dumps(E('e.export()')))
 g.select_option('#ix-actor','guest');tab('journal');click('mem-back');check('Personal journal view does not assign previous authorship to Guest',g.locator('.mem-note').count()==0)
 g.select_option('#ix-actor','you');g.select_option('#ix-identity','1');tab('journal');click('mem-back');click('mem-open',1)
 check('Return to original author retains the original thesis','A repeatable setup' in g.locator('#ix-content').inner_text())
 # Mobile actual layout, including long memory details and optional swap editor.
 g.set_viewport_size({'width':390,'height':844});tab('journal');click('mem-back');g.screenshot(path=str(O/'journal-mobile.png'))
 check('Mobile memory panel does not overflow',g.locator('#ix-content').evaluate('e=>e.scrollWidth<=e.clientWidth+2'))
 tab('trade');g.locator('.mem-trade > summary').click();g.screenshot(path=str(O/'trade-mobile.png'));check('Mobile optional editor fits the existing panel',g.locator('#ix-content').evaluate('e=>e.scrollWidth<=e.clientWidth+2'))
 tab('journal');click('mem-back');click('mem-form');g.screenshot(path=str(O/'form-mobile.png'));check('Mobile timeline has no document overflow',g.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
 check('No automatic wallet access',g.evaluate('__walletCalls')==0);check('No network calls in the standalone flows',not network);check('No uncaught browser exceptions',not errors)
 browser.close()
report={'version':'1.7.0','browser':version,'htmlSha256':hashlib.sha256(H.encode()).hexdigest(),'passed':sum(x['passed']for x in checks),'failed':sum(not x['passed']for x in checks),'checks':checks,'errors':errors,'network':network,'scope':'Actual UI, opaque origin, explicit Storage adapter. Public memory paths exercised. Browser crypto-unavailable paths correctly refuse; encryption itself independently executed in Node Web Crypto, not emulated as browser success.'}
(O/'results.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:report[k]for k in ['passed','failed','htmlSha256']},indent=2))
