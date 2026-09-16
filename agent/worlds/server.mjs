import http from 'node:http';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { Contract, FetchRequest, JsonRpcProvider, getAddress, verifyMessage } from 'ethers';
import { WorldStore } from './store.mjs';
import { RULES, RESOURCE_NODES, newWorld, joinWorld, advanceWorld, applyCommand } from '../../worlds/model.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const token = () => randomBytes(32).toString('hex');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (message, status = 400) => Object.assign(Error(message), { status });
const address = value => getAddress(value).toLowerCase();
const uint = value => { if (!/^[1-9]\d{0,76}$/.test(String(value))) throw fail('Expected a positive integer.'); return String(BigInt(value)); };
const bounded = async request => {
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > 8192) throw fail('Request exceeds 8 KiB.', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw fail('Expected JSON.'); }
};
export function verifyReceipt(receipt, publicKey) {
  try { return verify(null, Buffer.from(JSON.stringify(receipt.payload)), publicKey, Buffer.from(receipt.signature, 'base64')); } catch { return false; }
}
export function chainOwnerResolver({ rpcUrl, chainId, collection }) {
  const request = new FetchRequest(rpcUrl); request.timeout = 7000;
  const provider = new JsonRpcProvider(request, undefined, { cacheTimeout: -1 }), contract = new Contract(collection, ['function ownerOf(uint256) view returns(address)', 'function accountOf(uint256) view returns(address)'], provider);
  return async tokenId => {
    if (String((await provider.getNetwork()).chainId) !== String(chainId)) throw fail('RPC is on the wrong chain.', 503);
    const block = await provider.getBlockNumber();
    // Native ANIMA transfer epochs live on each canonical SovereignAccount.
    const [owner, account] = await Promise.all([contract.ownerOf(tokenId, { blockTag: block }), contract.accountOf(tokenId, { blockTag: block })]);
    const epoch = await new Contract(account, ['function sessionEpoch() view returns(uint64)'], provider).sessionEpoch({ blockTag: block });
    return { owner: address(owner), epoch: String(epoch), block };
  };
}
export async function createWorldServer({ stateDir, host = '127.0.0.1', port = 0, origin, chainId = '31337', collection, resolveOwner, demo = false, sessionMs = 30 * 60 * 1000, maxRequestsPerSecond = 24, tickMs = RULES.tickMs, maxActivePlayers = RULES.maxPlayers } = {}) {
  if (!stateDir || (!demo && (!collection || typeof resolveOwner !== 'function'))) throw Error('Set durable stateDir, collection and live owner resolver (or explicitly opt into demo).');
  if (tickMs < 10 || tickMs > 1000) throw Error('Tick period must be 10–1000 ms.');
  if (!Number.isSafeInteger(maxActivePlayers) || maxActivePlayers < 1 || maxActivePlayers > RULES.maxPlayers) throw Error('Active player limit must be 1–128.');
  if (!Number.isSafeInteger(sessionMs) || sessionMs < 1 || sessionMs > 86400000) throw Error('Session duration must be 1 ms–24 hours.');
  if (origin && (!['https:', 'http:'].includes(new URL(origin).protocol) || new URL(origin).origin !== origin)) throw Error('Origin must be a bare HTTP(S) origin.');
  chainId = uint(chainId); collection = collection ? address(collection) : null;
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const lockPath = path.join(stateDir, 'server.lock');
  try {
    const pid = Number(await fs.readFile(lockPath, 'utf8'));
    if (Number.isSafeInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); }
      catch (error) { if (error.code === 'ESRCH') await fs.unlink(lockPath); }
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const lock = await fs.open(lockPath, 'wx', 0o600);
  await lock.writeFile(String(process.pid));
  let privateKey, world, store;
  try {
    try { privateKey = createPrivateKey(await fs.readFile(path.join(stateDir, 'receipt-key.pem'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; privateKey = generateKeyPairSync('ed25519').privateKey; await fs.writeFile(path.join(stateDir, 'receipt-key.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' }); }
    store = new WorldStore(stateDir, () => {
      try {
        const state=JSON.parse(readFileSync(path.join(stateDir,'world.json'),'utf8'));
        if(state.schema!=='anima.shared-world/1'||!Number.isSafeInteger(state.tick)||!state.players||!state.orders)throw Error('Invalid legacy world snapshot.');
        return state;
      } catch(error) {if(error.code!=='ENOENT')throw error;return newWorld();}
    });
    world=store.load();
  } catch (error) { await lock.close(); await fs.unlink(lockPath); throw error; }
  const keyHandle = await fs.open(path.join(stateDir,'receipt-key.pem'),'r'); await keyHandle.sync(); await keyHandle.close();
  const directoryHandle = await fs.open(stateDir,'r'); await directoryHandle.sync(); await directoryHandle.close();
  const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
  const sessions = new Map(), challenges = new Map(), rates = new Map();
  let queue = Promise.resolve(), actualOrigin = origin, stopped = false, persistenceError;
  const streams = new Set();
  const serial = operation => { const next = queue.then(operation); queue = next.catch(() => {}); return next; };
  const persist = async (state, command) => { if (persistenceError) throw fail('World storage requires operator recovery.', 503); try { return store.commit(state, command); } catch (error) { persistenceError = error; throw fail('World storage commit failed; action was not acknowledged.', 503); } };
  const signed = payload => ({ payload, signature: sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString('base64') });
  const activeIdentities = () => {
    for (const [key, session] of sessions) if (session.expires <= Date.now()) sessions.delete(key);
    return new Set([...sessions.values()].map(session => session.identity));
  };
  // Called inside the serial mutation queue, including session publication, so
  // concurrent joins cannot both claim the last available presence slot.
  const admit = identity => {
    const active = activeIdentities();
    if (!active.has(identity) && active.size >= maxActivePlayers) throw fail('World has reached its active player limit. Try again when a traveller leaves.', 503);
  };
  const publishSession = (bearer, session) => {
    for (const [key, previous] of sessions) if (previous.identity === session.identity) sessions.delete(key);
    sessions.set(bearer, session);
  };
  const auth = async req => {
    const bearer = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1], session = sessions.get(bearer);
    if (!session || session.expires <= Date.now()) { if (bearer) sessions.delete(bearer); throw fail('Sign in again; session expired.', 401); }
    if (!session.demo) {
      const current = await resolveOwner(session.tokenId);
      if (address(current.owner) !== session.address || String(current.epoch) !== session.epoch) { sessions.delete(bearer); throw fail('NFT ownership changed; sign in again.', 401); }
    }
    return session;
  };
  const rate = req => {
    const now = Date.now(), key = req.socket.remoteAddress, prior = rates.get(key);
    if (!prior || now - prior.start >= 1000) rates.set(key, { start: now, count: 1 });
    else if (++prior.count > maxRequestsPerSecond) throw fail('Request rate exceeded. Wait one second.', 429);
    if (rates.size > 1024) for (const [k, v] of rates) if (now - v.start > 1000) rates.delete(k);
  };
  const publicGameState = state => {
    const publicWorld = structuredClone(state);
    // Resume hashes are authentication state, never part of the public game API.
    delete publicWorld.guestAccess;
    return publicWorld;
  };
  const snapshot = (identity, boundedView = false, region, ordersCursor = '') => {
    const active = [...activeIdentities()];
    const publicWorld = publicGameState(world);
    if (boundedView) {
      const player = world.players[identity] || { x: 4, y: 5 };
      const center = region || player;
      const nearby = entity => Math.abs(entity.x-center.x) <= 16 && Math.abs(entity.y-center.y) <= 16;
      const visiblePlayers = Object.entries(publicWorld.players).filter(([id,p])=>id===identity || nearby(p));
      if (visiblePlayers.length > 128) visiblePlayers.sort(([a],[b])=>a===identity?-1:b===identity?1:a.localeCompare(b));
      publicWorld.players = Object.fromEntries(visiblePlayers.slice(0,128));
      publicWorld.towns = Object.fromEntries(Object.entries(publicWorld.towns).filter(([,p])=>nearby(p)).slice(0,128));
      publicWorld.orders = store.page('orders', ordersCursor, 64).entities;
    }
    return { revision: store.revision, view: boundedView ? { bounded: true, players: 128, towns: 128, orders: 64, ordersCursor, ordersNextCursor: store.page('orders', ordersCursor, 64).nextCursor, region: region || null, moreEntities: '/state/page' } : undefined, world: publicWorld, resources: RESOURCE_NODES, rules: { ...RULES, tickMs, maxPlayers: maxActivePlayers }, presence: { activeIdentities: active, activePlayers: active.length, capacity: maxActivePlayers } };
  };
  const streamState = client => {
    const current = snapshot(client.session.identity, true, client.region, client.ordersCursor);
    let packet = { type: 'reset', ...current };
    if (client.previous) {
      const old = client.previous.world, next = current.world, upsert = {}, remove = {};
      for (const kind of ['players','towns','orders','creatures','resources']) {
        for (const [id,value] of Object.entries(next[kind])) if (JSON.stringify(value)!==JSON.stringify(old[kind]?.[id])) (upsert[kind] ||= {})[id]=value;
        for (const id of Object.keys(old[kind] || {})) if (!(id in next[kind])) (remove[kind] ||= []).push(id);
      }
      const {players,towns,orders,creatures,resources,...base} = next;
      packet = { type: 'delta', previousRevision: client.previous.revision, revision: current.revision, base, upsert, remove, presence: current.presence, view: current.view };
    }
    client.previous = current;
    if (!client.res.write(`id: ${current.revision}\ndata: ${JSON.stringify(packet)}\n\n`)) { client.res.end(); streams.delete(client); }
  };
  const broadcast = () => { for (const client of streams) {
    if (!sessions.has(client.bearer) || client.session.expires <= Date.now()) { client.res.end(); streams.delete(client); continue; }
    if (client.previous?.revision !== store.revision) streamState(client);
  } };
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    const respond = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    try {
      rate(req);
      if (persistenceError) throw fail('World storage requires operator recovery.', 503);
      if (req.headers.origin && req.headers.origin !== actualOrigin) throw fail('Origin is not allowed.', 403);
      const parsedURL = new URL(req.url, 'http://localhost'), pathname = parsedURL.pathname;
      const ordersCursor=parsedURL.searchParams.get('ordersCursor')||'';
      if(ordersCursor.length>80)throw fail('Invalid market page cursor.');
      let region;
      if(parsedURL.searchParams.has('x')||parsedURL.searchParams.has('y')) {
        const x=Number(parsedURL.searchParams.get('x')),y=Number(parsedURL.searchParams.get('y'));
        if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x>=RULES.width||y>=RULES.height)throw fail('Invalid world region.');
        region={x,y};
      }
      if (req.method === 'GET' && ['/','/worlds/client.html', '/worlds/client.mjs', '/worlds/model.mjs', '/worlds/transport.mjs', '/web/extensions/service-origin.mjs'].includes(pathname)) {
        const file = pathname === '/' ? '/worlds/client.html' : pathname;
        res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
        return res.end(await fs.readFile(path.join(ROOT, file)));
      }
      if (req.method === 'GET' && pathname === '/config') return respond(200, { schema: 'anima.world-service/2', transport: { stream: '/stream', changes: '/changes', pages: '/state/page', protocol: 'authenticated-fetch-sse/1' }, storage: 'SQLite WAL, synchronous FULL; durable atomic command receipts', origin: actualOrigin, chainId, collection, demo, publicKey, tickMs, maxActivePlayers, guestRetention: 'Characters, inventories, towns and orders are retained after logout or session expiry. A private resume code restores a guest; it is not an NFT credential.', notice: 'A small world maintained by one server operator. Signed receipts attest to this operator, not chain consensus. Game coins have no withdrawal.' });
      if (req.method === 'POST' && pathname === '/challenge') {
        if (demo) throw fail('This service is a guest demo; use /guest.');
        const input = await bounded(req), tokenId = uint(input.tokenId), wallet = address(input.address);
        for (const [nonce, item] of challenges) if (item.expires <= Date.now()) challenges.delete(nonce);
        if (challenges.size >= 1024) throw fail('Too many pending sign-ins.', 429);
        const current = await resolveOwner(tokenId);
        if (address(current.owner) !== wallet) throw fail('Wallet does not own this NFT.', 403);
        const nonce = token(), expires = Date.now() + 120000;
        const message = `${new URL(actualOrigin).host} wants you to sign in with your Ethereum account:\n${getAddress(wallet)}\n\nEnter ANIMA shared world. No wallet spending permission.\n\nURI: ${actualOrigin}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${new Date(expires).toISOString()}\nResources:\n- anima:nft:${chainId}:${collection}:${tokenId}:epoch:${current.epoch}`;
        challenges.set(nonce, { message, address: wallet, tokenId, epoch: String(current.epoch), expires });
        return respond(200, { nonce, message, expires });
      }
      if (req.method === 'POST' && pathname === '/session') {
        const input = await bounded(req), c = challenges.get(input.nonce); challenges.delete(input.nonce);
        if (!c || c.expires <= Date.now()) throw fail('Challenge expired or already used.', 401);
        if (typeof input.signature !== 'string' || address(verifyMessage(c.message, input.signature)) !== c.address) throw fail('Wallet signature does not match.', 401);
        const current = await resolveOwner(c.tokenId);
        if (address(current.owner) !== c.address || String(current.epoch) !== c.epoch) throw fail('NFT changed hands during sign-in.', 401);
        const identity = `${chainId}:${collection}:${c.tokenId}`, bearer = token(), expires = Date.now() + sessionMs;
        await serial(async () => {
          const latest = await resolveOwner(c.tokenId);
          if (address(latest.owner) !== c.address || String(latest.epoch) !== c.epoch) throw fail('NFT changed hands during sign-in.', 401);
          admit(identity);
          const next = structuredClone(world); joinWorld(next, identity, input.name);
          await persist(next); world = next;
          publishSession(bearer, { identity, address: c.address, tokenId: c.tokenId, epoch: c.epoch, expires });
        });
        return respond(200, { token: bearer, identity, expires, ...snapshot(identity, true) });
      }
      if (req.method === 'POST' && pathname === '/guest') {
        if (!demo) throw fail('Guest access is disabled.', 403);
        const input = await bounded(req), bearer = token(), expires = Date.now() + sessionMs;
        const resuming = input.resumeCode !== undefined;
        if (resuming && (typeof input.resumeCode !== 'string' || !/^[a-f0-9]{64}$/.test(input.resumeCode))) throw fail('Invalid guest resume code.', 401);
        const resumeCode = resuming ? input.resumeCode : token();
        const resumeHash = createHash('sha256').update(resumeCode).digest('hex');
        let identity;
        await serial(async () => {
          identity = resuming ? world.guestAccess?.[resumeHash] : `guest:${token().slice(0, 16)}`;
          if (resuming && (!identity?.startsWith('guest:') || !world.players[identity])) throw fail('Invalid guest resume code.', 401);
          admit(identity);
          const next = structuredClone(world); joinWorld(next, identity, input.name);
          next.guestAccess ||= {}; next.guestAccess[resumeHash] = identity;
          await persist(next); world = next;
          publishSession(bearer, { identity, expires, demo: true });
        });
        return respond(200, { token: bearer, identity, expires, resumeCode, ...snapshot(identity, true) });
      }
      if (req.method === 'POST' && pathname === '/logout') { await auth(req); sessions.delete(req.headers.authorization.slice(7)); return respond(200, { loggedOut: true }); }
      if (req.method === 'GET' && pathname === '/state') { const session = await auth(req); return respond(200, snapshot(session.identity, true, region, ordersCursor)); }
      if (req.method === 'GET' && pathname === '/state/page') { await auth(req); return respond(200, store.page(parsedURL.searchParams.get('kind') || 'players', parsedURL.searchParams.get('cursor') || '', Number(parsedURL.searchParams.get('limit') || 64))); }
      if (req.method === 'GET' && pathname === '/changes') { await auth(req); return respond(200, store.changes(Number(parsedURL.searchParams.get('since') || 0))); }
      if (req.method === 'GET' && pathname === '/stream') {
        const session = await auth(req), bearer = req.headers.authorization.slice(7);
        if ([...streams].filter(client=>client.bearer===bearer).length >= 2) throw fail('Close the other world stream before reconnecting.', 429);
        res.writeHead(200, {'Content-Type':'text/event-stream', 'Connection':'keep-alive', 'X-Accel-Buffering':'no'});
        res.flushHeaders();
        const client = {res,session,bearer,region,ordersCursor}; streams.add(client);
        // A bounded snapshot on reconnect covers expired journal cursors and
        // entities that crossed a region/page boundary while disconnected.
        streamState(client);
        const ownership = setInterval(async()=>{ try { await auth(req); res.write(': alive\n\n'); } catch { res.end(); } },5000);
        res.on('close',()=>{clearInterval(ownership);streams.delete(client);});
        return;
      }
      if (req.method === 'POST' && pathname === '/command') {
        const session = await auth(req), input = await bounded(req);
        const receipt = await serial(async () => {
          // Re-check at the mutation boundary, after waiting behind other writers.
          await auth(req);
          const commandId = input.commandId;
          if (commandId !== undefined && (typeof commandId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(commandId))) throw fail('Command ID must contain 16–80 safe characters.');
          const requestHash = digest(Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b))));
          if (commandId) {
            const previous = store.command(session.identity, commandId);
            if (previous) { if (previous.requestHash !== requestHash) throw fail('Command ID was already used for different input.',409); return previous.receipt; }
          }
          const result = applyCommand(world, session.identity, input);
          const payload = { schema: 'anima.world-receipt/1', worldId: world.id, origin: actualOrigin, event: result.event, stateHash: digest(publicGameState(result.world)) };
          const receipt = signed(payload);
          await persist(result.world, commandId ? {identity:session.identity,id:commandId,requestHash,receipt}:undefined); world = result.world;
          broadcast(); return receipt;
        });
        return respond(200, { receipt, ...snapshot(session.identity, true) });
      }
      throw fail('Unknown endpoint.', 404);
    } catch (error) { if (!res.headersSent) respond(error.status || 400, { error: error.message }); else res.end(); }
  });
  server.headersTimeout = 10000; server.requestTimeout = 15000; server.keepAliveTimeout = 5000;
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); }
  catch (error) { await lock.close(); await fs.unlink(lockPath); throw error; }
  const bound = server.address(); actualOrigin ||= `http://${host.includes(':') ? `[${host}]` : host}:${bound.port}`;
  const timer = setInterval(() => { if (!stopped && !persistenceError) serial(async () => { const next = structuredClone(world); advanceWorld(next); await persist(next); world = next; broadcast(); }).catch(()=>{}); }, tickMs); timer.unref();
  return { url: actualOrigin, publicKey, server, snapshot,
    close: async () => { stopped = true; clearInterval(timer); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await queue; store.close(); await lock.close(); await fs.unlink(lockPath); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const demo = process.argv.includes('--demo'), stateDir = process.env.ANIMA_WORLD_STATE || path.join(ROOT, '.local/shared-world');
  const chainId = process.env.ANIMA_WORLD_CHAIN_ID, collection = process.env.ANIMA_WORLD_COLLECTION;
  if (!demo && (!process.env.ANIMA_WORLD_RPC || !chainId || !collection || !process.env.ANIMA_WORLD_ORIGIN)) throw Error('Set ANIMA_WORLD_RPC, ANIMA_WORLD_CHAIN_ID, ANIMA_WORLD_COLLECTION and ANIMA_WORLD_ORIGIN, or use --demo for explicitly local guests.');
  const service = await createWorldServer({ stateDir, demo, host: process.env.ANIMA_WORLD_HOST || '127.0.0.1', port: Number(process.env.ANIMA_WORLD_PORT || 8789), origin: process.env.ANIMA_WORLD_ORIGIN, chainId: chainId || '31337', collection,
    resolveOwner: demo ? undefined : chainOwnerResolver({ rpcUrl: process.env.ANIMA_WORLD_RPC, chainId, collection }) });
  console.log(`ANIMA ${demo ? 'guest demo' : 'NFT owner world'}: ${service.url}\nPersistent state: ${stateDir}\nReceipt public key:\n${service.publicKey}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await service.close(); process.exit(0); });
}
