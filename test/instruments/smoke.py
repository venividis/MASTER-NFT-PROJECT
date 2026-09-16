from pathlib import Path
from playwright.sync_api import sync_playwright
import json
R=Path(__file__).resolve().parents[2];H=(R/'preview.html').read_text();O=R/'reports/v1.5';O.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 c=b.new_context(viewport={'width':1440,'height':950},reduced_motion='reduce',device_scale_factor=1)
 page=c.new_page();err=[];page.on('pageerror',lambda e:err.append(str(e)))
 page.set_content(H,wait_until='domcontentloaded');page.wait_for_function("document.body.dataset.instrumentsReady==='true'",timeout=25000);page.wait_for_timeout(2200)
 print('ready',page.evaluate('__idfbi.renderer.backend'),err,flush=True);page.screenshot(path=str(O/'organism-desktop.png'))
 page.click('#instrument-open');page.screenshot(path=str(O/'trade-desktop.png'))
 page.click('[data-act="tab"][data-id="give"]');page.locator('#ix-give-form button[type=submit]').click();print('review',page.locator('#ix-content').inner_text()[:600],flush=True);page.click('[data-act=confirm]');print('gift',page.evaluate('__instruments.engine().extra.gifts'),flush=True);page.screenshot(path=str(O/'give-desktop.png'))
 page.select_option('#ix-actor','guest');page.click('[data-act=accept-gift]');page.click('[data-act=confirm]');print('accepted',page.evaluate('__instruments.engine().extra.gifts[0].status'),flush=True)
 page.click('[data-act="tab"][data-id="world"]');page.screenshot(path=str(O/'world-desktop.png'))
 page.click('#ix-close');page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(2200);page.screenshot(path=str(O/'organism-mobile.png'));page.click('#instrument-open');page.click('[data-act="tab"][data-id="trade"]');page.screenshot(path=str(O/'trade-mobile.png'));print('errors',err,flush=True)
 b.close()
