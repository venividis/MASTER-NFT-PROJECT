"""Real Chromium: two HTTP world clients and an untrusted generated instrument.
Run: python worlds/browser-check.py
Requires the same Playwright + /usr/bin/chromium used by the existing browser suite.
"""
import functools
import http.server
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_): pass

with tempfile.TemporaryDirectory(prefix='anima-world-browser-') as temp:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    env = {**os.environ, 'ANIMA_WORLD_STATE': temp, 'ANIMA_WORLD_PORT': str(port)}
    service = subprocess.Popen(['node', 'agent/worlds/server.mjs', '--demo'], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    static = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    thread = threading.Thread(target=static.serve_forever, daemon=True); thread.start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width':1440,'height':1050})
            a = context.new_page(); b = browser.new_context(viewport={'width':390,'height':844}).new_page()
            url = f'http://127.0.0.1:{port}'
            for _ in range(40):
                try: a.goto(url); break
                except Exception: time.sleep(.1)
            a.wait_for_function("document.querySelector('#mode').textContent.includes('guest') || document.querySelector('#mode').textContent.includes('Guest')")
            a.fill('#name','Aurora'); a.click('#enter'); a.wait_for_function("document.querySelector('#player-name').textContent==='Aurora'")
            b.goto(url); b.fill('#name','Lumen'); b.click('#enter'); b.wait_for_function("document.querySelector('#player-name').textContent==='Lumen'")
            a.click('#gather'); a.wait_for_function("document.querySelector('#inventory').textContent.includes('Wood 1')")
            a.wait_for_timeout(350); a.click('#offer'); a.wait_for_function("document.querySelector('#orders').textContent.includes('Cancel')")
            b.wait_for_function("document.querySelector('#orders').textContent.includes('Buy')"); b.locator('#orders button').click()
            b.wait_for_function("document.querySelector('#inventory').textContent.includes('Wood 1')")
            a.wait_for_function("document.querySelector('#inventory').textContent.includes('23 coins')")
            assert 'Verified operator receipt' in b.locator('#receipt').inner_text()
            a.screenshot(path='/tmp/anima-world-desktop.png'); b.screenshot(path='/tmp/anima-world-mobile.png',full_page=True)
            a.reload(); a.wait_for_function("document.querySelector('#player-name').textContent==='Aurora'")
            assert '23 coins' in a.locator('#inventory').inner_text()
            print('PASS shared browser market, signed receipt, mobile layout and session reconnect')

            page = context.new_page(); page.goto(f'http://127.0.0.1:{static.server_port}/worlds/')
            # Replace the client shell; module imports exercise the real generated-instrument launcher.
            page.evaluate("document.body.innerHTML='<div id=host></div>'")
            result = page.evaluate(r'''async () => {
              const m = await import('/worlds/instruments.mjs');
              const source = `<body><div id=result></div><script>
                let isolated=false;try{void parent.document.body}catch{isolated=true;}
                document.getElementById('result').textContent='isolated:'+isolated+' wallet:'+Boolean(window.ethereum);
                fetch('https://example.com/forbidden').then(()=>document.body.dataset.network='allowed').catch(()=>document.body.dataset.network='blocked');
                window.addEventListener('message', e=>{if(e.data.schema==='anima.instrument-channel/1'){const p=e.ports[0];p.onmessage=e=>document.body.dataset.snapshot=JSON.stringify(e.data.result);p.postMessage({id:'r1',method:'read-snapshot'});}});
              <\/script></body>`;
              const request={schema:'anima.generated-request/1',name:'Adversarial fixture',description:'Test actual sandbox boundaries',chainId:'31337',collection:'0x'+'1'.repeat(40),account:'0x'+'2'.repeat(40),tokenId:'1',capabilities:['read-snapshot'],snapshot:{chosen:7}};
              const a=m.compileGeneratedInstrument(request,source,['read-snapshot']);
              let denied=false;try{m.launchGeneratedInstrument(document.querySelector('#host'),a,null)}catch{denied=true;}
              const approval=m.approveInstrument(a,{contentHash:a.contentHash,manifestHash:a.manifestHash,reviewedSource:true});
              window.stopInstrument=m.launchGeneratedInstrument(document.querySelector('#host'),a,approval);
              return denied;
            }''')
            assert result
            frame=page.frame_locator('#host iframe')
            frame.locator('#result').wait_for()
            assert frame.locator('#result').inner_text()=='isolated:true wallet:false'
            frame.locator('body[data-network="blocked"]').wait_for()
            frame.locator('body[data-snapshot]').wait_for()
            assert frame.locator('body').get_attribute('data-snapshot')=='{"chosen":7}'
            page.evaluate('stopInstrument()'); assert page.locator('#host iframe').count()==0
            print('PASS exact approval required, opaque parent isolation, no wallet, blocked fetch, explicitly selected snapshot, revoke/stop')
            browser.close()
    finally:
        static.shutdown(); static.server_close(); service.terminate()
        try: service.wait(timeout=5)
        except subprocess.TimeoutExpired: service.kill(); service.wait()
