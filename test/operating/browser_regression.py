"""Actual standalone HTML, managed Chromium, memory Storage adapter.
No wallet or EVM. No policy overrides to enable WebGL. This tests local behavior only.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, hashlib
R=Path(__file__).resolve().parents[2]; H=(R/'preview.html').read_text(); O=R/'reports/v1.6/regression';O.mkdir(exist_ok=True,parents=True)
results=[];errors=[];network=[]
STORAGE="""<script>(()=>{for(const key of ['localStorage','sessionStorage']){const d={};Object.defineProperty(window,key,{value:{getItem:k=>d[k]??null,setItem:(k,v)=>d[k]=String(v),removeItem:k=>delete d[k],clear:()=>{for(const k in d)delete d[k]},key:n=>Object.keys(d)[n]??null,get length(){return Object.keys(d).length}}});}window.__walletCalls=0;Object.defineProperty(window,'ethereum',{value:{request:async()=>{__walletCalls++;throw Error('No real wallet in this test')}}});})();</script>"""
def check(name,value):
 assert value,name
 results.append({'name':name,'passed':True})
 print('PASS',name,flush=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);version=b.version
 ctx=b.new_context(viewport={'width':1440,'height':950},reduced_motion='reduce',device_scale_factor=1,accept_downloads=True)
 def load(saved=None,storage=True):
  pg=ctx.new_page();pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('request',lambda r:network.append(r.url) if r.url.startswith(('http:','https:','ws:','wss:')) else None)
  if storage:pg.set_content(STORAGE); 
  if saved:pg.evaluate('d=>{for(const [k,v]of Object.entries(d))localStorage.setItem(k,v)}',saved)
  pg.set_content(H,wait_until='domcontentloaded');pg.wait_for_function("document.body.dataset.instrumentsReady==='true'",timeout=25000);return pg
 pg=load();E=lambda expr:pg.evaluate(expr)
 def click(act,id=None):
  loc=pg.locator('[data-act="'+act+'"]'+('' if id is None else '[data-id="'+str(id)+'"]')).first
  # Open containing native disclosure through its actual summary, not forced clicks.
  parent=loc.locator('xpath=ancestor::details[not(@open)]').last
  if parent.count():parent.locator('summary').first.click()
  loc.click()
 def tab(v):click('tab',v)
 def confirm():click('confirm');pg.wait_for_function("!document.querySelector('[data-act=confirm]')",timeout=6000)
 def submit(form):pg.locator('#'+form+' button[type=submit]').click()
 pg.wait_for_timeout(1700)
 check('Original and instruments boot together',E("__idfbi.version==='1.2.0'&&__instruments.version==='1.6.0'"))
 check('Original optical Wasm or normal WebGL actually initialized',E("/WASM|WebGL/.test(__idfbi.renderer.backend)"))
 check('New modal is closed by default',not pg.locator('#instrument-dialog').evaluate('(e)=>e.open'))
 check('No replacement crystal canvas exists',pg.locator('body > canvas').count()==2)
 base=E('__idfbi.world().state.audit');pg.screenshot(path=str(O/'organism-desktop.png'))
 pg.click('#instrument-open');check('Storage works without a spurious corruption notice','could not be loaded' not in pg.locator('#ix-notice').inner_text())
 check('Financial context is explicitly local','LOCAL REHEARSAL' in pg.locator('#instrument-dialog').inner_text())
 pg.screenshot(path=str(O/'trade-desktop.png'))
 old=E('__instruments.engine().export().checksum');pg.check('#ix-autolock');submit('ix-trade-form')
 check('Outcome is reviewed before state change',E('__instruments.engine().export().checksum')==old)
 check('Review contains minimum output and schedule','Minimum received' in pg.locator('#ix-content').inner_text() or 'Minimum' in pg.locator('#ix-content').inner_text())
 confirm();check('Swap output is locked',E('__instruments.engine().world.s.locks.length===3'))
 check('Original audit did not mutate from using a financial rehearsal',E('__idfbi.world().state.audit')==base)
 tab('vault');prior=E('__instruments.engine().export().checksum');pg.locator('#ix-future').fill('180');pg.locator('#ix-future').dispatch_event('input')
 check('Future slider is strictly read-only',E('__instruments.engine().export().checksum')==prior)
 check('New lock is not released by projection',pg.locator('[data-act="release-lock"][data-id="3"]').is_disabled())
 pg.screenshot(path=str(O/'vault-desktop.png'));pg.fill('#ix-amount','0.2');submit('ix-lock-form');confirm();check('Direct native lock creates a schedule',E('__instruments.engine().world.s.locks.length===4'))
 tab('give');submit('ix-give-form');confirm();check('Giving first creates an offer, not acceptance',E('__instruments.engine().extra.gifts[0].status')=='offered')
 check('Donor cannot click recipient acceptance',pg.locator('[data-act=accept-gift]').is_disabled());pg.screenshot(path=str(O/'give-desktop.png'))
 pg.select_option('#ix-actor','guest');click('accept-gift');confirm();check('Recipient acceptance records fixed-date rights',E('__instruments.engine().extra.gifts[0].status')=='accepted')
 check('Accepted gift has no return button',pg.locator('[data-act=return-gift]').count()==0)
 check('Accepted gift has disabled early release',pg.locator('[data-act=release-gift]').is_disabled())
 click('trace',E('__instruments.engine().extra.gifts[0].receipt'));check('Receipt trace contains actual swap and offer','SWAPPED' in pg.locator('#ix-content').inner_text() and 'OFFERED' in pg.locator('#ix-content').inner_text())
 click('discuss');pg.fill('#ix-message','I accepted these exact terms.');submit('ix-message-form');pg.wait_for_timeout(120)
 check('Discussion references a receipt',E('__instruments.engine().world.s.messages.at(-1).receipt')>0)
 pg.select_option('#ix-actor','you');tab('world');pg.fill('#ix-message','<img src=x onerror="window.__injected=true">');submit('ix-message-form');pg.wait_for_timeout(120)
 check('Untrusted message remains literal text',E('window.__injected!==true') and '<img src=x' in pg.locator('#ix-content').inner_text())
 check('Chat did not generate a fake LAUNCHED record',E('__instruments.engine().world.s.events.filter(e=>e.kind==="LAUNCHED").length')==0)
 # room creation, explicit acceptance, removal and World rights
 click('new-room');pg.fill('#ix-room-name','Terms circle');pg.check('#ix-gated');submit('ix-room-form');confirm();room=E('__instruments.engine().world.s.rooms.at(-1).id')
 click('invite','guest');pg.wait_for_timeout(100);check('Invitation initially unaccepted',E(f'__instruments.engine().world.room({room}).members.guest.accepted')==False)
 pg.select_option('#ix-actor','guest');click('accept-room',room);pg.wait_for_timeout(100);check('Room member explicitly accepts',E(f'__instruments.engine().world.room({room}).members.guest.accepted'))
 pg.fill('#ix-message','Membership is not something the NFT owner owns.');submit('ix-message-form');pg.wait_for_timeout(100);msgid=E('__instruments.engine().world.s.messages.at(-1).id')
 pg.select_option('#ix-actor','you');click('remove-member','guest');confirm();check('Removal preserves earlier authorship',E(f'__instruments.engine().world.s.messages.find(m=>m.id==={msgid}).actor')=='guest')
 pg.select_option('#ix-actor','guest');check('Removed member cannot submit room post',pg.locator('#ix-message-form button[type=submit]').is_disabled())
 pg.select_option('#ix-room','1');check('Room removal does not remove World access',not pg.locator('#ix-message-form button[type=submit]').is_disabled())
 pg.select_option('#ix-actor','you');tab('launch');submit('ix-launch-form');confirm();check('Launch also creates its commons',E('__instruments.engine().world.s.rooms.at(-1).name')=='BEGIN commons')
 click('contribute',1);submit('ix-contribute-form');confirm();check('Contribution is recorded',E('__instruments.engine().world.sale(1).raised')=='1000000000000000000')
 click('withdraw-contribution',1);pg.fill('#ix-contribution','0.1');submit('ix-withdraw-form');confirm();check('Withdrawal works before close',E('__instruments.engine().world.sale(1).raised')=='900000000000000000')
 click('contribute',1);pg.fill('#ix-contribution','0.1');submit('ix-contribute-form');confirm();click('close-sale-clock',1);confirm();check('Clock close alone does not settle',E('__instruments.engine().world.sale(1).status')=='open')
 click('settle',1);confirm();check('Settlement produces market and locked allocations',E('__instruments.engine().world.sale(1).status==="settled"&&__instruments.engine().world.s.pools.some(p=>p.asset==="BEGIN")'))
 click('claim',1);confirm();check('Allocation is claimable',E('BigInt(__instruments.engine().world.identity(1).balances.BEGIN)>0n'))
 click('open-room',E('__instruments.engine().world.sale(1).room'));check('Launch commons is directly navigable',pg.locator('#ix-room').input_value()==str(E('__instruments.engine().world.sale(1).room')))
 tab('market');click('inspect-estate',204);old=E('__instruments.engine().export().checksum');pg.locator('#ix-future').fill('180');pg.locator('#ix-future').dispatch_event('input');check('Marketplace future lens also leaves actual state unchanged',E('__instruments.engine().export().checksum')==old)
 pg.screenshot(path=str(O/'market-desktop.png'));click('buy',1);confirm();check('Acquisition changes controller and keeps schedules',E('__instruments.engine().world.identity(204).owner==="you"&&__instruments.engine().world.s.locks[1].released==="0"'))
 click('market-back');click('list-estate');pg.fill('#ix-price','2');submit('ix-list-form');confirm();check('Listing escrows control',E('__instruments.engine().world.identity(204).owner')=='escrow')
 listing=E('__instruments.engine().world.s.listings.at(-1).id');click('cancel-listing',listing);confirm();check('Cancellation returns control to recorded seller',E('__instruments.engine().world.identity(204).owner')=='you')
 # Advance actual local clock separately; gift release must now work
 click('clock');click('advance',30*86400);confirm();tab('give');click('release-gift',1);confirm();check('Gift releases to intended personal wallet, not caller or selected NFT',E('__instruments.engine().extra.personalBalances.guest.AUR===__instruments.engine().extra.gifts[0].amount'))
 pg.select_option('#ix-identity','1');tab('world');pg.select_option('#ix-room','1');pg.screenshot(path=str(O/'world-desktop.png'))
 click('capabilities');check('Unbuilt mechanisms are visibly identified','RESEARCH · NOT IMPLEMENTED' in pg.locator('#ix-content').inner_text())
 with pg.expect_download() as dl:click('export')
 download=dl.value;download.save_as(O/'browser-export.json');exported=json.loads((O/'browser-export.json').read_text());check('Export is a tagged unsigned local archive',exported['engine']['schema']=='idfbi/operating/1.6')
 saved=E('Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).map(k=>[k,localStorage.getItem(k)]))')
 restored=load(saved);check('Actual browser reconstructs stored instruments',restored.evaluate('__instruments.engine().export().checksum')==json.loads(next(v for k,v in saved.items() if k.startswith('idfbi.instruments.')))['engine']['checksum']);restored.close()
 # Deliberate corrupt save: preserve, refuse silent overwrite, explicit valid import recovery
 key=next(k for k in saved if k.startswith('idfbi.instruments.'));bad=dict(saved);bad[key]='{broken'
 corrupt=load(bad);corrupt.click('#instrument-open');check('Corrupt save reports and preserves original bytes',corrupt.evaluate('(k)=>localStorage.getItem(k)',key)=='{broken' and 'could not be loaded' in corrupt.locator('#ix-notice').inner_text())
 corrupt.set_input_files('#ix-import',str(O/'browser-export.json'));corrupt.locator('[data-act=confirm]').click();corrupt.wait_for_timeout(250)
 check('Valid import can explicitly replace a corrupt saved archive',corrupt.evaluate('__instruments.engine().extra.gifts[0].status')=='released' and corrupt.evaluate('(k)=>localStorage.getItem(k)',key)!='{broken');corrupt.close()
 pg.click('#ix-close');check('Closing returns focus to the original instrument button',E("document.activeElement.id==='instrument-open'"))
 # Original state/history/sovereignty boundaries
 pg.click('#evolve');pg.wait_for_function('__idfbi.state().nonce>0');check('Original Evolve remains usable',E('__idfbi.state().evolutions')==1)
 pg.click('#history');pg.locator('#timeline').fill('0');pg.locator('#timeline').dispatch_event('input');pg.click('#instrument-open');tab('trade');before=E('__instruments.engine().export().checksum');submit('ix-trade-form');pg.wait_for_timeout(100)
 check('Historical view blocks new spending rehearsal', 'read-only' in pg.locator('#ix-notice').inner_text() and E('__instruments.engine().export().checksum')==before)
 pg.click('#ix-close');pg.click('#return-head');pg.click('#ascend');pg.check('#ascend-consent');pg.click('#ascend-confirm');pg.wait_for_function('__idfbi.state().sovereign');pg.click('#instrument-open');tab('trade');submit('ix-trade-form');pg.wait_for_timeout(100)
 check('Sovereignty cannot be bypassed through new utility controls','proof adapter' in pg.locator('#ix-notice').inner_text())
 # Clean page for final mobile screenshots, no demo mutation carried into initial presentation.
 mobile=load();mobile.set_viewport_size({'width':390,'height':844});mobile.wait_for_timeout(1800);mobile.screenshot(path=str(O/'organism-mobile.png'));mobile.click('#instrument-open');mobile.screenshot(path=str(O/'trade-mobile.png'))
 for v in ['trade','launch','vault','give','market','world']:
  mobile.locator('[data-act=tab][data-id='+v+']').click();check('Mobile '+v+' has no document horizontal overflow',mobile.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));check('Mobile '+v+' content fits its panel width',mobile.locator('#ix-content').evaluate('e=>e.scrollWidth<=e.clientWidth+2'))
 mobile.locator('[data-act=tab][data-id=give]').click();mobile.screenshot(path=str(O/'give-mobile.png'))
 check('No automatic wallet requests',E('__walletCalls')==0 and mobile.evaluate('__walletCalls')==0)
 check('No automatic network requests in recorded new flows',not network)
 check('No uncaught browser exceptions',not errors)
 # Native opaque-origin failure must be storage-unavailable, not a invented corrupt file.
 opaque=load(storage=False);opaque.click('#instrument-open');check('Unavailable Storage is not misreported as corrupt saved data','could not be loaded' not in opaque.locator('#ix-notice').inner_text());opaque.close()
 b.close()
report={'version':'1.6.0','browser':version,'htmlSha256':hashlib.sha256(H.encode()).hexdigest(),'passed':len(results),'failed':0,'results':results,'errors':errors,'automaticNetworkRequests':network,'scope':'Actual standalone HTML set_content; memory Storage adapter; local rehearsal and preserved optical renderer. No EVM/wallet/deployment validation.'}
(O/'browser-results.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:report[k]for k in ['passed','failed','browser','htmlSha256']},indent=2))
