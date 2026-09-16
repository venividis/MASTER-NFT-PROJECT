"""v1.6 operating flows in the actual standalone browser, no real funds or wallets.
Only UI interactions mutate the app. JS reads inspect results; no state injection.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, hashlib
R=Path(__file__).resolve().parents[2]; H=(R/'preview.html').read_text();O=R/'reports/v1.6/operating-browser';O.mkdir(parents=True,exist_ok=True)
STORAGE="""<script>(()=>{for(const key of ['localStorage','sessionStorage']){const d={};Object.defineProperty(window,key,{value:{getItem:k=>d[k]??null,setItem:(k,v)=>d[k]=String(v),removeItem:k=>delete d[k],clear:()=>{for(const k in d)delete d[k]},key:n=>Object.keys(d)[n]??null,get length(){return Object.keys(d).length}}});}window.__walletCalls=0;Object.defineProperty(window,'ethereum',{value:{request:async()=>{__walletCalls++;throw Error('No real wallet in this test')}}});})();</script>"""
results=[];errors=[];network=[]
def check(name,value):
 results.append({'name':name,'passed':bool(value)})
 assert value,name
 print('PASS',name,flush=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);version=b.version
 ctx=b.new_context(viewport={'width':1440,'height':950},reduced_motion='reduce',device_scale_factor=1,accept_downloads=True)
 def load(saved=None):
  g=ctx.new_page();g.set_default_timeout(7000);g.on('pageerror',lambda e:errors.append(str(e)));g.on('request',lambda r:network.append(r.url)if r.url.startswith(('https:','http:','wss:','ws:'))else None)
  g.set_content(STORAGE)
  if saved:g.evaluate('d=>{for(const[k,v]of Object.entries(d))localStorage.setItem(k,v)}',saved)
  g.set_content(H,wait_until='domcontentloaded');g.wait_for_function("document.body.dataset.instrumentsReady==='true'",timeout=25000);return g
 pg=load();E=lambda x:pg.evaluate('(()=>{const {op,world,extra}=__instruments.engine();return __instruments.engine().'+x+'})()')
 def click(act,id=None):
  loc=pg.locator('[data-act="'+act+'"]'+(''if id is None else '[data-id="'+str(id)+'"]')).first
  parent=loc.locator('xpath=ancestor::details[not(@open)]').last
  if parent.count():parent.locator('summary').first.click()
  loc.click()
 def tab(v):click('tab',v)
 def submit(form):pg.locator('#'+form+' button[type=submit]').click()
 def confirm():
  click('confirm')
  try:pg.wait_for_function("!document.querySelector('[data-act=confirm]')",timeout=5000)
  except Exception:
   print('CONFIRM ERROR',pg.locator('#ix-notice').inner_text(),flush=True);raise
 def simple(act,id=None):click(act,id);confirm()
 def act(person,id):
  pg.select_option('#ix-actor',person);pg.select_option('#ix-identity',str(id))
 def allocate(asset,n):
  click('op-allocate');pg.select_option('#ix-lab-asset',asset);pg.fill('#ix-lab-amount',n);submit('op-allocate-form');confirm()
 def quantity(action,amount):
  click(action);pg.fill('#ix-lab-quantity',amount);submit(action+'-form');confirm()
 def advance(days):click('clock');simple('advance',days*86400)
 def publish(title,amount='100'):
  click('op-publish');pg.fill('#ix-ed-title',title);pg.fill('#ix-ed-amount',amount);submit('op-edition-form');confirm()
 pg.wait_for_timeout(1400);base=pg.evaluate('__idfbi.world().state.audit');pg.screenshot(path=str(O/'original-desktop.png'))
 check('Operating layer closes by default',not pg.locator('#instrument-dialog').evaluate('e=>e.open'))
 pg.click('#instrument-open');check('One instrument panel includes all ten primary tabs',pg.locator('.ix-tabs [role=tab]').count()==10)
 tab('library');pg.screenshot(path=str(O/'library-empty.png'));before=E('export().checksum')
 click('op-publish');pg.fill('#ix-ed-title','Reserve <img src=x onerror=alert(1)>');pg.fill('#ix-ed-amount','1000');submit('op-edition-form')
 check('Publishing is reviewed without moving funds',E('export().checksum')==before);confirm()
 check('Published instrument retains title as literal text','<img src=x' in pg.locator('#ix-content').inner_text()and pg.locator('#ix-content img').count()==0)
 check('Publication creates no grant',E('op.grants.length')==0)
 simple('op-install',1);check('Adoption has a real seven-day model delay',pg.locator('[data-act=op-grant]').is_disabled())
 advance(7);tab('library');check('Grant becomes available after the review period',not pg.locator('[data-act=op-grant]').is_disabled())
 click('op-grant',1);check('Large grant values have parseable ungrouped input',pg.locator('#ix-grant-per').input_value()=='1000')
 pg.select_option('#ix-grant-caller','guest');submit('op-grant-form');confirm();check('Caller and budget stored independently from code',E('op.grants[0].caller==="guest"&&op.grants[0].total==="1000000000000000000000"'))
 act('guest',1);old=E('world.s.locks.length');simple('op-run',1)
 check('Guest can trigger only the explicitly authorized procedure',E('world.s.locks.length')==old+1 and E('op.grants[0].used')==1)
 check('Delegated trigger retains actual speaker and custodian',E('world.s.events.findLast(e=>e.kind==="EDITION_EXECUTED").actor')=='guest')
 check('Exhausted grant cannot execute again',pg.locator('[data-act=op-run]').is_disabled())
 act('you',1);simple('op-revoke',1);check('Revocation is immediate',E('op.grants[0].revoked'));pg.screenshot(path=str(O/'library-desktop.png'))
 # Funded work travels to library, execution and social records.
 tab('work');before=E('world.identity(1).balances.AUR');click('op-commission');submit('op-work-form');confirm()
 check('Commission funding moves out of the root free balance',int(E('world.identity(1).balances.AUR'))==int(before)-250*10**18)
 check('Terms preserve the original personal reviewer',E('op.commissions[0].reviewer')=='you')
 act('guest',2);simple('op-accept-work',1);check('Worker explicitly accepts',E('op.commissions[0].status')=='accepted')
 tab('library');publish('A careful reserve');check('Delivered edition is authored by Guest',E('op.editions[1].author')=='guest')
 tab('work');click('op-submit-work',1);pg.select_option('#ix-work-edition','2');submit('op-deliver-form');confirm()
 check('Work references its exact edition',E('op.commissions[0].edition')==2)
 act('you',1);simple('op-approve-work',1);check('Payment goes to worker personal balance',E('extra.personalBalances.guest.AUR')==str(250*10**18))
 pg.screenshot(path=str(O/'work-desktop.png'));tab('world');check('World shows publication and funded work','published an instrument' in pg.locator('#ix-content').inner_text()and 'paid for accepted work' in pg.locator('#ix-content').inner_text())
 receipt=E('world.s.events.findLast(e=>e.kind==="WORK_PAID").seq');click('trace',receipt)
 check('Paid work trace contains funded, accepted, delivered and paid records',all(x in pg.locator('#ix-content').inner_text()for x in ['COMMISSION_FUNDED','COMMISSION_ACCEPTED','WORK_SUBMITTED','WORK_PAID']))
 click('discuss',receipt);pg.fill('#ix-message','The funded edition works within its stated scope.');submit('ix-message-form');pg.wait_for_timeout(100)
 check('Conversation references that exact paid-work receipt',E('world.s.messages.at(-1).receipt')==receipt)
 # Private capital boundary is tested across every implemented laboratory desk.
 tab('lab');check('All five laboratory tabs are visible without horizontal scrolling',pg.locator('.op-lab-tabs').evaluate('e=>[...e.children].every(c=>c.getBoundingClientRect().left>=e.getBoundingClientRect().left-1&&c.getBoundingClientRect().right<=e.getBoundingClientRect().right+1)'));check('No experiment exists before capital allocation',E('op.cells.length')==0)
 allocate('AUR','3000');allocate('ETH','0.5');check('Laboratory balances are separate',E('op.cells[0].balances.AUR')==str(3000*10**18))
 root=E('world.identity(1).balances');check('Strategy begins disabled','locked' in pg.locator('#ix-content').inner_text())
 simple('op-enable','granary');quantity('op-sow','200');simple('op-stress','granary');quantity('op-reap','100')
 check('Strategy losses affect only explicitly allocated cell principal',E('world.identity(1).balances')==root and E('op.cells[0].strategy.assets')==str(50*10**18))
 check('Strategy redemption uses impaired share value',E('op.cells[0].balances.AUR')==str(2850*10**18))
 click('op-lab-tab','issue');simple('op-enable','issue');quantity('op-basket-mint','10');quantity('op-basket-redeem','5')
 check('Fixed basket issuance and redemption update real local reserves',E('op.cells[0].basket.supply')==str(5*10**18))
 click('op-lab-tab','strips');simple('op-enable','strips');quantity('op-strip','100');simple('op-stress','strips');quantity('op-unstrip','50')
 check('Matched recombination allocates the loss proportionally',E('op.cells[0].strip.assets')==str(25*10**18)and E('op.cells[0].strip.pairs')==str(50*10**18))
 check('Three laboratory experiments leave root balances unchanged',E('world.identity(1).balances')==root);pg.screenshot(path=str(O/'lab-desktop.png'))
 click('op-lab-tab','counter');simple('op-enable','counter');click('op-request-loan');submit('op-credit-form');confirm()
 check('Credit request escrows collateral rather than root NFT',E('op.loans[0].status')=='offered'and E('world.identity(1).owner')=='you')
 act('guest',2);allocate('ETH','0.3');allocate('AUR','500');simple('op-enable','counter');simple('op-fund-loan',1)
 check('Counterparty funding activates exact negotiated loan',E('op.loans[0].status')=='active'and E('op.loans[0].lender')==2)
 act('you',1);simple('op-repay-loan',1);check('Repayment returns collateral and pays the lending cell',E('op.loans[0].status')=='repaid')
 click('op-lab-tab','scrivener');simple('op-enable','scrivener');click('op-write-option');submit('op-option-form');confirm()
 check('Covered call holds real local cover before sale',E('op.options[0].status')=='offered')
 act('guest',2);simple('op-enable','scrivener');simple('op-take-option',1);simple('op-exercise',1)
 check('Exercise swaps fixed strike for the covered underlying',E('op.options[0].status')=='exercised'and E('op.cells[1].balances.AUR')==str(600*10**18))
 check('No experiment reaches the root through a hidden debit',E('world.identity(1).balances')==root)
 # A shelf carries proceeds through the artifact, with a real local bond period.
 act('you',1);tab('library');simple('op-collect',2);tab('market');click('op-venues');click('op-open-shelf');submit('op-shelf-form');confirm()
 check('Venue holds its collectible separately',E('op.collectibles[0].venue')==1)
 act('guest',2);simple('op-buy-shelf',1);check('Shelf sale moves item and reserves proceeds',E('op.collectibles[0].holder')==2 and E('op.venues[0].reserve')==str(10**17))
 act('you',1);advance(7);tab('market');click('op-venues');simple('op-close-shelf',1)
 check('Bond completion returns proceeds to the artifact account',E('op.venues[0].status')=='closed'and int(E('world.identity(1).balances.ETH'))==int(root['ETH'])+10**17)
 # Gift-aware listing and non-owner changes to an escrowed artifact.
 tab('give');pg.select_option('#ix-input','AUR');pg.select_option('#ix-output','AUR');pg.fill('#ix-amount','5');submit('ix-give-form');confirm()
 gift=E('extra.gifts.at(-1).id');tab('market');click('list-estate');pg.fill('#ix-price','1');submit('ix-list-form');confirm();listing=E('world.s.listings.at(-1).id')
 check('Gift and laboratory commitments no longer prevent a declared listing',E('world.identity(1).owner')=='escrow')
 click('inspect-estate',1);check('Market unfolds complete operating categories',all(x in pg.locator('#ix-content').inner_text()for x in ['Known gifts','Funded work records','Laboratory cells','Credit / option records']))
 pg.screenshot(path=str(O/'operating-market-desktop.png'))
 act('guest',2);tab('give');simple('accept-gift',gift);tab('market');click('inspect-estate',1);click('buy',listing);pg.wait_for_timeout(100)
 check('Changed gift terms invalidate the escrow manifest','covenant changed' in pg.locator('#ix-notice').inner_text())
 act('you',2);tab('market');simple('op-refresh-listing',listing);act('guest',2);click('inspect-estate',1);click('buy',listing);confirm()
 check('Refreshed acquisition keeps obligations and changes custody',E('world.identity(1).owner')=='guest'and E('extra.gifts.at(-1).status')=='accepted')
 tab('library');check('Installed content survives its sale',E('op.installations.length')==1)
 check('Previous grants do not acquire buyer authority',all(g['epoch']!=E('world.identity(1).epoch') for g in E('op.grants')))
 tab('lab');click('op-lab-tab','granary');check('New laboratory entries require buyer opt-in','locked' in pg.locator('#ix-content').inner_text())
 quantity('op-reap','100');check('Existing strategy can exit without enabling new risk',E('op.cells[0].strategy.shares')=='0')
 check('Old worker and reviewer identities remain unchanged',E('op.commissions[0].worker')=='guest'and E('op.commissions[0].reviewer')=='you')
 # Application hash entry never loads code.
 tab('library');click('op-applications');click('op-application-form');pg.fill('#ix-app-title','Known application edition');pg.fill('#ix-app-hash','0x'+'ab'*32);pg.fill('#ix-app-bytes','100');submit('op-application-form');confirm()
 check('Application entry records only declared bytes/hash',E('op.applications[0].hash')=='0x'+'ab'*32)
 tab('ledger');old=E('export().checksum');pg.screenshot(path=str(O/'commitments-desktop.png'));check('Ledger inspection does not modify balances',E('export().checksum')==old)
 with pg.expect_download()as dl:click('export')
 dl.value.save_as(O/'operating-export.json');archive=json.loads((O/'operating-export.json').read_text())
 check('Export includes the complete operating and laboratory state',archive['engine']['schema']=='idfbi/operating/1.6'and len(archive['engine']['operating']['cells'])==2)
 saved=pg.evaluate('Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).map(k=>[k,localStorage.getItem(k)]))')
 clone=load(saved);check('Exact operating archive restores in actual browser',clone.evaluate('__instruments.engine().export().checksum')==archive['engine']['checksum']);clone.close()
 check('Original optical audit remains untouched through entire integration',pg.evaluate('__idfbi.world().state.audit')==base)
 # Mobile and clean state captures; every new page remains navigable.
 mobile=load();mobile.set_viewport_size({'width':390,'height':844});mobile.wait_for_timeout(1300);mobile.click('#instrument-open')
 for v in ['library','work','ledger','lab']:
  mobile.locator('[data-act=tab][data-id='+v+']').click();check('Mobile '+v+' panel does not overflow',mobile.locator('#ix-content').evaluate('e=>e.scrollWidth<=e.clientWidth+2'))
  check('Mobile '+v+' does not widen the document',mobile.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  mobile.screenshot(path=str(O/(v+'-mobile.png')))
  if v=='lab':check('Mobile laboratory exposes all five wrapped tabs',mobile.locator('.op-lab-tabs').evaluate('e=>[...e.children].length===5&&[...e.children].every(c=>c.getBoundingClientRect().right<=e.getBoundingClientRect().right+1)'))
 
 check('No unsolicited wallet request',pg.evaluate('__walletCalls')==0 and mobile.evaluate('__walletCalls')==0)
 check('No external network request in tested new flows',not network)
 check('No uncaught browser exceptions in tested new flows',not errors)
 b.close()
report={'version':'1.6.0','browser':version,'htmlSha256':hashlib.sha256(H.encode()).hexdigest(),'passed':sum(x['passed']for x in results),'failed':sum(not x['passed']for x in results),'results':results,'errors':errors,'automaticNetworkRequests':network,'scope':'Actual release HTML, UI-driven local mutations, mock Storage adapter; no EVM/real wallet/blockchain evidence.'}
(O/'browser-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k]for k in ['passed','failed','browser','htmlSha256']},indent=2))
