"""Run the actual standalone HTML without bypassing browser policies.
Browser navigation is not needed: set_content loads the shipped document.
WebGL is not forced. In-memory Web Storage is a test adapter, explicitly reported.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image
import json,time,hashlib,sys
ROOT=Path(__file__).resolve().parents[2];REPORTS=ROOT/'reports';REPORTS.mkdir(exist_ok=True)
html=(ROOT/'preview.html').read_text();results=[];errors=[];requests=[]
(REPORTS/'browser-results.json').unlink(missing_ok=True)
def check(name,condition):
 if not condition: raise AssertionError(name)
 results.append({'name':name,'passed':True});print('PASS',name,flush=True)
def mount(page,storage=None):
 page.evaluate('''values=>{window.__local=values||{};window.__session={};const make=s=>({getItem:k=>Object.hasOwn(s,k)?s[k]:null,setItem:(k,v)=>s[k]=String(v),removeItem:k=>delete s[k],clear:()=>Object.keys(s).forEach(k=>delete s[k])});Object.defineProperty(window,'localStorage',{value:make(window.__local),configurable:true});Object.defineProperty(window,'sessionStorage',{value:make(window.__session),configurable:true});window.__walletRequests=[];window.ethereum={on(){},removeListener(){},request(r){window.__walletRequests.push(r);return Promise.reject(new Error('TEST WALLET UNAVAILABLE'));}};window.__contexts=0;const A=window.AudioContext;if(A)window.AudioContext=class extends A{constructor(...args){super(...args);window.__contexts++;}};}''',storage or {})
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
 page.set_content(html,wait_until='domcontentloaded');page.wait_for_function("document.body.dataset.ready==='true'",timeout=15000)
 page.wait_for_function('__idfbi.renderer.frames>0',timeout=20000)
 return page
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=b.new_context(viewport={'width':1440,'height':950},device_scale_factor=1,accept_downloads=True)
 page=mount(context.new_page()); context.set_default_timeout(10000)
 check('actual artifact boots without a wallet request',page.evaluate('__walletRequests.length')==0)
 check('audio does not autoplay',page.evaluate('__contexts')==0)
 check('actual field pixels rendered',page.evaluate('__idfbi.renderer.frames')>0)
 backend=page.evaluate('__idfbi.renderer.backend');check('renderer reports its real backend',backend in ['WASM optical field','WASM main-thread field','WebGL 2'])
 check('no HTTP requests during initial preview',not any(u.startswith(('http:','https:','ws:','wss:')) for u in requests))
 page.click('#sound');page.wait_for_function("document.querySelector('#sound').getAttribute('aria-pressed')==='true'");check('gesture starts procedural audio',page.evaluate('__contexts')==1)
 page.click('#sound');check('mute is explicit',page.locator('#sound').get_attribute('aria-pressed')=='false')
 s0=page.evaluate('__idfbi.state()');page.click('#evolve');page.wait_for_function('__idfbi.state().nonce===1');s1=page.evaluate('__idfbi.state()')
 check('evolution changes actual genome and root',s1['genome']!=s0['genome'] and s1['root']!=s0['root'])
 check('evolution does not show a blocking progress modal',page.locator('dialog[open]').count()==0)
 # Wait until morph completed; a screenshot of transient state is not the settled phenotype.
 page.wait_for_function('__idfbi.renderer.morph===1',timeout=12000)
 page.click('#quality');page.click('#motion');page.wait_for_timeout(3000)
 page.screenshot(path=str(REPORTS/'browser-evolved.png'))
 page.click('#memory');thought='<img src=x onerror=alert(1)> PRIVATE MEMORY 1.2';page.fill('#memory-text',thought);page.click('#seal');page.wait_for_function('__idfbi.state().nonce===2');s2=page.evaluate('__idfbi.state()')
 check('memory digest changes without changing genome',s2['memory']!=s1['memory'] and s2['genome']==s1['genome'])
 check('memory text is discarded from the editor',page.locator('#memory-text').input_value()=='')
 check('receipt export never contains the thought',thought not in page.evaluate('JSON.stringify(__idfbi.bundle())'))
 check('memory content is not interpreted as markup',page.locator('img').count()==0)
 page.click('#spawn');page.wait_for_function('__idfbi.state().children.length===1');s3=page.evaluate('__idfbi.state()');page.wait_for_timeout(2500)
 check('descendant has an inherited parent genome',s3['children'][0]['parentGenome']==s2['genome'])
 check('descendant has its own genome',s3['children'][0]['genome']!=s3['genome'])
 page.screenshot(path=str(REPORTS/'browser-lineage.png'))
 page.locator('.satellite').first.click();check('descendant opens a read-only form',page.locator('#evolve').is_disabled() and page.evaluate('__idfbi.state().generation')==1)
 page.click('#return-head');check('returning from descendant preserves the parent head',page.evaluate('__idfbi.state().root')==s3['root'])
 page.click('#history');page.locator('#timeline').fill('0');check('history restores exact genesis roots',page.evaluate('__idfbi.state().root')==s0['root'])
 check('history disables writes',page.locator('#evolve').is_disabled() and page.locator('#ascend').is_disabled())
 page.click('#return-live');check('returning to present preserves nonce and audit',page.evaluate('__idfbi.state().audit')==s3['audit']);page.click('#close-history')
 head=page.evaluate('__idfbi.state().audit');page.click('#fold');page.wait_for_timeout(1300)
 check('fourth-axis view does not change ownership state',page.evaluate('__idfbi.state().audit')==head and page.evaluate('__idfbi.renderer.fold')>.9)
 page.screenshot(path=str(REPORTS/'browser-folded.png'));page.click('#reset')
 page.click('#immerse');check('immersive view hides control panels',not page.locator('.identity').is_visible());page.screenshot(path=str(REPORTS/'browser-immersed.png'));page.click('#restore-ui');check('controls can be restored',page.locator('.identity').is_visible())
 page.click('#ascend');check('ascension requires explicit consent',page.locator('#ascend-confirm').is_disabled());page.locator('[data-close="ascend-dialog"]').click();check('cancelled ascension does not mutate state',not page.evaluate('__idfbi.state().sovereign'))
 page.click('#ascend');page.check('#ascend-consent');page.click('#ascend-confirm');page.wait_for_function('__idfbi.state().sovereign===true');check('confirmed local ascension advances the epoch',page.evaluate('__idfbi.state().epoch')==1)
 check('direct entropy and repeated ascension become unavailable',page.locator('#entropy').is_disabled() and page.locator('#ascend').is_disabled());page.wait_for_timeout(3000);page.screenshot(path=str(REPORTS/'browser-sovereign.png'))
 page.click('#evolve');page.wait_for_function('__idfbi.state().nonce===5');check('permitted local evolution remains available after ascension',page.evaluate('__idfbi.state().sovereign'))
 with page.expect_download() as pending: page.click('#export')
 d=pending.value;d.save_as(str(REPORTS/'browser-export.json'));check('actual receipt-book download is valid JSON',json.loads((REPORTS/'browser-export.json').read_text())['expectedAudit']==page.evaluate('__idfbi.state().audit'))
 with page.expect_download() as pending: page.click('#portrait')
 d=pending.value;d.save_as(str(REPORTS/'browser-portrait.png'));im=Image.open(REPORTS/'browser-portrait.png');check('actual portrait export contains rendered pixels',im.width>=500 and (REPORTS/'browser-portrait.png').stat().st_size>10000)
 page.click('#inspect');page.get_by_text('RECOMPUTE ALL RECEIPTS',exact=True).click();page.wait_for_function("document.querySelector('#toast').textContent.includes('recomputed successfully')");check('browser independently recomputes its local history',True);page.locator('[data-close="detail-dialog"]').click()
 before=page.evaluate('__idfbi.state().audit');bad=json.loads((REPORTS/'browser-export.json').read_text());bad['expectedAudit']='0x'+'ff'*32
 page.evaluate("document.querySelector('#file-input').dataset.purpose='study'");page.locator('#file-input').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(bad).encode()});page.wait_for_timeout(350);check('corrupt history import is rejected without overwriting the head',page.evaluate('__idfbi.state().audit')==before and not page.locator('#import-dialog').is_visible())
 page.locator('#file-input').set_input_files(str(REPORTS/'browser-export.json'));page.wait_for_function("document.querySelector('#import-dialog').open");check('valid import asks before replacing the current identity',page.evaluate('__idfbi.state().audit')==before);page.click('#confirm-import');check('confirmed import reconstructs exact history',page.evaluate('__idfbi.state().audit')==before)
 saved=page.evaluate('__local');second=mount(context.new_page(),saved);check('application restores verified storage through a test adapter',second.evaluate('__idfbi.state().audit')==before);second.close()
 corrupted={'idfbi.optical.1.2':'{not json'};third=mount(context.new_page(),corrupted);check('corrupt existing save is preserved rather than overwritten',third.evaluate("__local['idfbi.optical.1.2']")=='{not json');third.close()
 page.click('#reference');page.wait_for_timeout(1200);check('original v1.0 is available inside the artifact',page.locator('.reference-dialog iframe').count()==1);page.screenshot(path=str(REPORTS/'browser-original-reference.png'));page.locator('.reference-back').click();check('comparison does not alter the current state',page.evaluate('__idfbi.state().audit')==before)
 page.click('#connect');check('opening connection settings does not request an account',page.evaluate('__walletRequests.length')==0);page.fill('#collection-input','0x'+'22'*20);page.click('#load-token');page.wait_for_timeout(300);check('connection failure is shown, not replaced with a fake chain state','TEST WALLET' in page.locator('#connection-status').inner_text());page.locator('[data-close="chain-dialog"]').click()
 # Compare actual default artifact at a common desktop and mobile size.
 print('CAPTURE fresh',flush=True);page.close();fresh=mount(context.new_page());print('CAPTURE fresh loaded',flush=True);fresh.click('#quality');fresh.click('#motion');fresh.wait_for_timeout(3000);print('CAPTURE fresh screenshot',flush=True);fresh.screenshot(path=str(REPORTS/'browser-bound.png'));nativeParams=fresh.evaluate('({params:__idfbi.renderer.params,center:__idfbi.renderer.center,width:innerWidth,height:innerHeight})');(REPORTS/'browser-frame-parameters.json').write_text(json.dumps(nativeParams,indent=2));fresh.close()
 mobile_context=b.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True,reduced_motion='reduce');mobile=mount(mobile_context.new_page());mobile.wait_for_timeout(1000);print('CAPTURE mobile loaded',flush=True)
 check('reduced-motion preference disables automatic motion',not mobile.evaluate('__idfbi.renderer.motion'))
 check('mobile layout does not overflow horizontally',mobile.evaluate('document.documentElement.scrollWidth<=innerWidth'))
 for control in ['evolve','memory','spawn','ascend','mobile-panel']:check('mobile control remains reachable: '+control,mobile.locator('#'+control).is_visible())
 mobile.screenshot(path=str(REPORTS/'browser-mobile.png'));mobile.click('#mobile-panel');check('mobile inspector opens',mobile.locator('.proof').is_visible());mobile.screenshot(path=str(REPORTS/'browser-mobile-inspector.png'))
 check('no unhandled page exceptions',len(errors)==0)
 report={'version':'1.2.0','previewSha256':hashlib.sha256(html.encode()).hexdigest(),'browser':b.version,'backend':backend,'passed':len(results),'checks':results,'pageErrors':errors,'requestsObserved':requests,'scope':'Actual standalone HTML via set_content. Storage restoration uses an injected in-memory adapter. Browser WebGL is not forced. No real wallet, public chain, or Solidity execution is claimed.'};(REPORTS/'browser-results.json').write_text(json.dumps(report,indent=2));print('TOTAL',len(results),'passed',flush=True)
 b.close()
