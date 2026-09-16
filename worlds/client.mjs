import { WorldTransport, applyWorldPacket } from './transport.mjs';
import { serviceOrigin } from '../web/extensions/service-origin.mjs';

const $ = id => document.getElementById(id), canvas = $('world'), ctx = canvas.getContext('2d');
let config, state, identity, token, busy = false, lastReceipt, running = true;
const status = message => { $('status').textContent = message; };
const api = async (url, body, authenticated = true) => {
  serviceOrigin(location.origin, 'world');
  const response = await fetch(url, { method: body ? 'POST' : 'GET', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json(); if (!response.ok) { if (response.status === 401) { token = null; sessionStorage.removeItem('anima.world.session'); } throw Object.assign(Error(data.error), {status:response.status}); } return data;
};
async function verify(receipt) {
  const bytes = Uint8Array.from(atob(config.publicKey.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('spki', bytes, { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify('Ed25519', key, Uint8Array.from(atob(receipt.signature), c => c.charCodeAt(0)), new TextEncoder().encode(JSON.stringify(receipt.payload)));
}
async function command(input) {
  if (!token || busy || !state?.world.players[identity]) return;
  busy = true;
  try {
    const pendingKey = 'anima.world.pending:' + identity;
    const previous = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
    const pending = previous || { ...input, commandId: crypto.randomUUID(), sequence: state.world.players[identity].clientSequence + 1 };
    sessionStorage.setItem(pendingKey, JSON.stringify(pending));
    const data = await api('/command', pending);
    sessionStorage.removeItem(pendingKey);
    if (!await verify(data.receipt)) throw Error('Receipt signature is invalid; reconnect to the operator.');
    lastReceipt = data.receipt; if (!state || data.revision >= state.revision) state = data; status(data.receipt.payload.event.detail); paintPanels();
  } catch (error) { if (error.status && error.status < 500) sessionStorage.removeItem('anima.world.pending:' + identity); status(error.message + (error.status ? '' : ' Your pending command will be recovered before another action.')); try { if (token) { state = await api('/state'); paintPanels(); } } catch {} }
  finally { busy = false; }
}
let streamedState;
const stream = new WorldTransport({getToken:()=>token,onPacket:packet=>{ streamedState=applyWorldPacket(streamedState,packet); if(!state || streamedState.revision>=state.revision){state=streamedState;paintPanels();} },onStatus:status});
function paintPanels() {
  const p = state?.world.players[identity]; if (!p) return;
  $('player-name').textContent = p.name; $('inventory').textContent = `Life ${p.hp}/30 · ${p.coins} coins\nWood ${p.inventory.wood} · Stone ${p.inventory.stone}\nOre ${p.inventory.ore} · Blades ${p.inventory.blade}`; $('inventory').style.whiteSpace = 'pre-line';
  $('mode').textContent = `${config.demo ? 'Guest demo' : 'NFT owner world'} · ${state.presence?.activePlayers ?? 0}/${state.presence?.capacity ?? state.rules.maxPlayers} online · tick ${state.world.tick}`;
  $('events').replaceChildren(...state.world.events.slice(-8).reverse().map(event => { const div = document.createElement('div'); div.className = 'entry'; div.textContent = `${state.world.players[event.player]?.name || 'Traveller'} · ${event.detail}`; return div; }));
  $('orders').replaceChildren(...Object.values(state.world.orders).map(order => { const div = document.createElement('div'); div.className = 'entry'; div.textContent = `${order.quantity} ${order.item} · ${order.price} coins`; const button = document.createElement('button'); button.textContent = order.seller === identity ? 'Cancel' : 'Buy'; button.onclick = () => command({ type: order.seller === identity ? 'cancel' : 'buy', order: order.id }); div.append(button); return div; }));
  $('market-next').disabled = !state.view?.ordersNextCursor;
  if (lastReceipt) $('receipt').textContent = `Verified operator receipt #${lastReceipt.payload.event.sequence} · ${lastReceipt.payload.stateHash.slice(0, 22)}…`;
}
function projection(x, y, width, height) { const scale = Math.min(width / 48, height / 30); return { x: width / 2 + (x - y - 4) * scale, y: 65 + (x + y) * scale * .47, scale }; }
function draw() {
  if (!running) return;
  const dpr = Math.min(devicePixelRatio || 1, 2), width = canvas.clientWidth, height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width / 2, height * .5, 10, width / 2, height * .5, width * .6); glow.addColorStop(0, '#0c2945'); glow.addColorStop(1, '#020914'); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
  const time = performance.now() / 1000;
  for (let i = 0; i < 70; ++i) { const x = (Math.sin(i * 27.1) + 1) * width / 2, y = (Math.cos(i * 13.7) + 1) * height / 2; ctx.globalAlpha = .12 + (Math.sin(time + i) + 1) * .14; ctx.fillStyle = '#aeeeff'; ctx.fillRect(x, y, 1.3, 1.3); } ctx.globalAlpha = 1;
  for (let y = 1; y < 19; ++y) for (let x = 1; x < 27; ++x) { const p = projection(x, y, width, height), s = p.scale; ctx.beginPath(); ctx.moveTo(p.x, p.y - s * .47); ctx.lineTo(p.x + s, p.y); ctx.lineTo(p.x, p.y + s * .47); ctx.lineTo(p.x - s, p.y); ctx.closePath(); ctx.fillStyle = (x + y) % 2 ? '#0b2032' : '#0c2337'; ctx.fill(); ctx.strokeStyle = '#153647'; ctx.lineWidth = .4; ctx.stroke(); }
  const crystal = (x, y, color, size = 1, label = '') => { const p = projection(x, y, width, height), s = p.scale * size; ctx.shadowBlur = 18; ctx.shadowColor = color; ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(p.x, p.y - s * 1.8); ctx.lineTo(p.x + s * .38, p.y - s * .6); ctx.lineTo(p.x, p.y + s * .1); ctx.lineTo(p.x - s * .38, p.y - s * .6); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#d4edfa'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; if (label) ctx.fillText(label, p.x, p.y + 17); };
  crystal(4, 5, '#71dfff', 1.4, 'Source');
  for (const n of state?.resources || [{ x: 5, y: 5, item: 'wood' }, { x: 7, y: 5, item: 'stone' }, { x: 8, y: 5, item: 'ore' }]) crystal(n.x, n.y, { wood: '#4faf93', stone: '#8c9cc0', ore: '#dbbb77' }[n.item], .8, n.item);
  if (state) {
    for (const town of Object.values(state.world.towns)) crystal(town.x, town.y, '#e8c68b', 1.5, town.name);
    for (const creature of Object.values(state.world.creatures)) if (creature.hp > 0) crystal(creature.x, creature.y, '#d590ed', .8 + Math.sin(time * 2) * .12, `Wisp ${creature.hp}`);
    for (const id of state.presence?.activeIdentities ?? [identity]) { const p = state.world.players[id]; if (!p) continue; const at = projection(p.x, p.y, width, height); ctx.fillStyle = p.id === identity ? '#a7f7fa' : '#e9cc88'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 15; ctx.beginPath(); ctx.arc(at.x, at.y - 9, 5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(p.name, at.x, at.y - 22); }
  }
  requestAnimationFrame(draw);
}
const gather = () => { const p = state?.world.players[identity]; if (!p) return; const node = state.resources.find(n => Math.abs(n.x - p.x) + Math.abs(n.y - p.y) <= 1 && (state.world.resources[`${n.x},${n.y}`] || 0) <= state.world.tick); if (node) command({ type: 'gather', item: node.item }); else status('Move beside a resource that has regrown.'); };
document.querySelectorAll('[data-move]').forEach(button => button.onclick = () => { const [dx, dy] = button.dataset.move.split(',').map(Number); command({ type: 'move', dx, dy }); });
$('market-first').onclick=()=>{stream.url='/stream';stream.start();};
$('market-next').onclick=()=>{if(state?.view?.ordersNextCursor){stream.url='/stream?ordersCursor='+encodeURIComponent(state.view.ordersNextCursor);stream.start();}};
$('gather').onclick = gather; $('attack').onclick = () => command({ type: 'attack', target: 'wisp' }); $('rest').onclick = () => command({ type: 'rest' }); $('craft').onclick = () => command({ type: 'craft', recipe: 'blade' }); $('town').onclick = () => { const name = prompt('Name your town'); if (name) command({ type: 'found-town', name }); };
$('offer').onclick = () => command({ type: 'offer', item: $('offer-item').value, quantity: Number($('quantity').value), price: Number($('price').value) });
window.addEventListener('keydown', event => { if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.repeat) return; const directions = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }; if (directions[event.key]) { event.preventDefault(); const [dx, dy] = directions[event.key]; command({ type: 'move', dx, dy }); } else if (event.key === 'g') gather(); else if (event.key === 'c') $('craft').click(); else if (event.key === 'r') $('rest').click(); else if (event.key === ' ') { event.preventDefault(); $('attack').click(); } });
canvas.addEventListener('pointerdown', event => { const p = state?.world.players[identity]; if (!p) return; const box = canvas.getBoundingClientRect(), at = projection(p.x, p.y, box.width, box.height), rx = event.clientX - box.left - at.x, ry = (event.clientY - box.top - at.y) / .47; const dx = (rx + ry) / 2, dy = (ry - rx) / 2; command(Math.abs(dx) > Math.abs(dy) ? { type: 'move', dx: Math.sign(dx), dy: 0 } : { type: 'move', dx: 0, dy: Math.sign(dy) }); });
$('enter').onclick = async () => {
  $('enter').disabled = true;
  try {
    let data;
    if (config.demo) {
      const resumeCode = $('guest-code').value.trim();
      data = await api('/guest', { name: $('name').value, ...(resumeCode ? { resumeCode } : {}) }, false);
      $('guest-code').value = data.resumeCode;
      sessionStorage.setItem('anima.world.guest-resume', data.resumeCode);
    }
    else {
      if (!window.ethereum) throw Error('A browser wallet is required for this NFT world.');
      const [address] = await ethereum.request({ method: 'eth_requestAccounts' }), chain = BigInt(await ethereum.request({ method: 'eth_chainId' }));
      if (String(chain) !== config.chainId) throw Error(`Select chain ${config.chainId} in your wallet.`);
      const challenge = await api('/challenge', { address, tokenId: $('token-id').value }, false);
      const hex = '0x' + [...new TextEncoder().encode(challenge.message)].map(b => b.toString(16).padStart(2, '0')).join('');
      const signature = await ethereum.request({ method: 'personal_sign', params: [hex, address] });
      data = await api('/session', { nonce: challenge.nonce, signature, name: $('name').value }, false);
    }
    token = data.token; identity = data.identity; state = data; sessionStorage.setItem('anima.world.session', JSON.stringify({ token, identity })); paintPanels(); stream.start(); status('You have entered the shared commons.');
  } catch (error) { status(error.message); } finally { $('enter').disabled = false; }
};
$('guest-copy').onclick = async () => { try { if (!$('guest-code').value) throw Error('Enter as a guest to receive a private resume code.'); await navigator.clipboard.writeText($('guest-code').value); status('Private guest resume code copied. Keep it somewhere safe to return after closing this browser.'); } catch (error) { status(error.message); } };
$('exit').onclick = async () => { try { if (token) await api('/logout', {}); } catch {} stream.stop(); token = null; identity = null; state = null; lastReceipt = null; sessionStorage.removeItem('anima.world.session'); $('player-name').textContent='Your traveller'; $('inventory').textContent='Sign in to see your pack.'; $('orders').replaceChildren(); $('events').replaceChildren(); $('receipt').textContent=''; status(config.demo ? 'You have left. Your guest, goods and orders persist. Keep the private resume code to return.' : 'You have left. Your NFT traveller, goods and orders persist.'); };
try {
  config = await api('/config', null, false); $('mode').textContent = config.demo ? 'Explicit guest demo' : 'NFT owner world'; $('token-label').hidden = config.demo; $('notice').textContent = config.notice; $('enter').textContent = config.demo ? 'Enter as guest' : 'Sign in with your NFT';
  $('guest-access').hidden = !config.demo;
  if (config.demo) $('guest-code').value = sessionStorage.getItem('anima.world.guest-resume') || '';
  const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(config.publicKey)))].map(b => b.toString(16).padStart(2, '0')).join('');
  const pinned = localStorage.getItem('anima.world.receipt-key');
  if (pinned && pinned !== config.publicKey) throw Error('Operator receipt key changed. Clear this site’s stored pin only after verifying the new key with its operator.');
  localStorage.setItem('anima.world.receipt-key', config.publicKey); $('key').textContent = `Operator key · ${fingerprint}`;
  const remembered = JSON.parse(sessionStorage.getItem('anima.world.session') || 'null');
  if (remembered) { token = remembered.token; identity = remembered.identity; try { state = await api('/state'); paintPanels(); } catch { token = null; } }
  if (token) stream.start();
} catch (error) { status(error.message); $('enter').disabled = true; }
draw(); window.addEventListener('pagehide', () => { running = false; stream.stop(); });
