/**
 * Sensory iteration 1.1 — deterministic, unsigned BROWSER SIMULATION.
 * SHA-256 receipts provide local consistency checks, NOT blockchain finality,
 * attestation, signature authentication, or zero-knowledge proofs.
 * No wallet, network, DOM, model inference, or plaintext memory is used here.
 */
export const SCHEMA = 'idontfuckingbelieveit/browser-receipts/1.1';
export const MAX_RECEIPTS = 192;
export const MAX_CHILDREN = 24;
export const HEX = /^0x[0-9a-f]{64}$/;
export const RULES = Object.freeze([
  'Local target only; value is always zero.',
  'Every action binds the current nonce and prior state.',
  'Every accepted action extends the audit digest.',
  'Sovereignty disables direct entropy and repeat ascension.',
  'Memory payloads contain commitments, never plaintext.'
]);
const KINDS = ['ENTROPY', 'EVOLVE', 'SPAWN', 'SEAL_MEMORY', 'ASCEND'];
const encoder = new TextEncoder();

export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  throw new Error('Only plain JSON, safe integers, and finite values are allowed.');
}
/** Standard SHA-256 fallback for offline/opaque-origin previews. Tested against
 * Node crypto and published empty/abc vectors; prefer native Web Crypto. */
export function sha256Bytes(input) {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const data=new Uint8Array(Math.ceil((input.length+9)/64)*64);data.set(input);data[input.length]=128;
  const v=new DataView(data.buffer);v.setUint32(data.length-8,Math.floor(input.length/536870912));v.setUint32(data.length-4,(input.length*8)>>>0);
  const rotr=(x,n)=>(x>>>n)|(x<<(32-n)),w=new Uint32Array(64);
  for(let offset=0;offset<data.length;offset+=64){
    for(let i=0;i<16;i++)w[i]=v.getUint32(offset+i*4);
    for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(rotr(x,7)^rotr(x,18)^(x>>>3))+w[i-7]+(rotr(y,17)^rotr(y,19)^(y>>>10)))>>>0;}
    let [a,b,c,d,e,f,g,z]=h;
    for(let i=0;i<64;i++){const t1=(z+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^((~e)&g))+K[i]+w[i])>>>0;
      const t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
      z=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    [a,b,c,d,e,f,g,z].forEach((x,i)=>h[i]=(h[i]+x)>>>0);
  }
  const result=new Uint8Array(32),view=new DataView(result.buffer);h.forEach((x,i)=>view.setUint32(i*4,x));return result;
}
export async function digest(domain, value) {
  const input=encoder.encode(canonical({domain: SCHEMA + '/' + domain, value}));
  const bytes=globalThis.crypto?.subtle ? new Uint8Array(await crypto.subtle.digest('SHA-256',input)) : sha256Bytes(input);
  return '0x' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
export function randomHex() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return '0x' + Array.from(b, x => x.toString(16).padStart(2,'0')).join('');
}
function assertHex(value) { if (!HEX.test(value)) throw new Error('Expected a lowercase 32-byte hexadecimal digest.'); }
function exactKeys(object, expected) {
  if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).sort().join('|') !== [...expected].sort().join('|')) throw new Error('Unexpected or missing fields.');
}
function assertTime(time) {
  if (!Number.isSafeInteger(time) || time < 0 || time > 8640000000000000) throw new Error('Invalid timestamp.');
}
export async function genesis(seed = randomHex(), time = Date.now()) {
  assertHex(seed); assertTime(time);
  const genome = await digest('genome/genesis', {seed});
  const memory = await digest('memory/empty', {seed});
  const policy = await digest('constitution', RULES);
  const state = {
    seed, genome, memory, policy, sovereign: false, generation: 0,
    evolutions: 0, nonce: 0, epoch: 0, children: [], createdAt: time, updatedAt: time,
    lineage: await digest('lineage/genesis', {seed})
  };
  state.root = await digest('state/genesis', state);
  state.audit = await digest('audit/genesis', {seed, root: state.root, policy, time});
  return state;
}
export function checkAction(state, kind, payload, nonce = state.nonce) {
  if (!KINDS.includes(kind)) throw new Error('Unknown action.');
  if (nonce !== state.nonce) throw new Error('Stale or replayed nonce.');
  if (state.nonce >= MAX_RECEIPTS) throw new Error('This local study reached its 192-receipt limit. Export it before starting a new study.');
  if (state.sovereign && (kind === 'ENTROPY' || kind === 'ASCEND')) throw new Error('Sovereign policy rejects this direct action.');
  const key = kind === 'SEAL_MEMORY' ? 'commitment' : kind === 'ASCEND' ? 'policy' : 'salt';
  exactKeys(payload, [key]); assertHex(payload[key]);
  if (kind === 'ASCEND' && payload.policy !== state.policy) throw new Error('Constitution mismatch.');
  if (kind === 'SPAWN' && state.children.length >= MAX_CHILDREN) throw new Error('This study supports 24 children. Existing descendants remain inspectable.');
  return true;
}
/** Does not mutate its input. Callers atomically install both outputs. */
export async function transition(state, kind, payload, time = Date.now(), expectedNonce = state.nonce) {
  checkAction(state, kind, payload, expectedNonce); assertTime(time);
  if (time < state.updatedAt) throw new Error('An action cannot predate its parent.');
  const next = structuredClone(state);
  const intent = { kind, payload, time, nonce: state.nonce, priorStateRoot: state.root,
    priorAuditRoot: state.audit, policy: state.policy, target: 'browser-local/self', value: '0' };
  const statement = await digest('intent', intent);
  if (kind === 'ENTROPY' || kind === 'EVOLVE') {
    next.genome = await digest('genome/' + kind, {previous: state.genome, statement});
    if (kind === 'EVOLVE') {
      next.evolutions++;
      next.memory = await digest('memory/evolution', {previous: state.memory, statement});
    }
  } else if (kind === 'SEAL_MEMORY') {
    next.memory = await digest('memory/append', {previous: state.memory, commitment: payload.commitment, statement});
  } else if (kind === 'SPAWN') {
    const id = await digest('child/identity', {parent: state.seed, genome: state.genome, nonce: state.nonce, salt: payload.salt});
    next.children.push({id, genome: await digest('child/genome', {parent: state.genome, id}),
      lineage: await digest('child/lineage', {parent: state.lineage, id}),
      parentGenome: state.genome, generation: state.generation + 1, bornAt: time});
  } else if (kind === 'ASCEND') {
    next.sovereign = true; next.epoch++;
  }
  next.nonce++;
  next.updatedAt = time;
  const {root: ignoredRoot, audit: ignoredAudit, ...body} = next;
  next.root = await digest('state/transition', {priorStateRoot: state.root, statement, body});
  const evidence = await digest('local-consistency', {statement, nextStateRoot: next.root, memoryRoot: next.memory});
  const receipt = {schema: SCHEMA, index: next.nonce, kind, payload: structuredClone(payload), time,
    nonce: state.nonce, priorStateRoot: state.root, priorAuditRoot: state.audit,
    policy: state.policy, statement, evidence, nextStateRoot: next.root, nextMemoryRoot: next.memory,
    verification: 'unsigned-local-sha256'};
  next.audit = await digest('audit/append', {previous: state.audit, receipt});
  receipt.audit = next.audit;
  return {state: next, receipt};
}
export function makeBundle(first, receipts, head) {
  return {schema: SCHEMA, provenance: 'BROWSER SIMULATION — unsigned, not an onchain proof',
    genesis: {seed: first.seed, time: first.createdAt}, receipts: structuredClone(receipts), expectedAudit: head.audit};
}
export async function verifyBundle(bundle) {
  exactKeys(bundle, ['schema','provenance','genesis','receipts','expectedAudit']);
  if (bundle.schema !== SCHEMA || bundle.provenance !== 'BROWSER SIMULATION — unsigned, not an onchain proof') throw new Error('Unsupported receipt book.');
  exactKeys(bundle.genesis, ['seed','time']); assertHex(bundle.expectedAudit);
  if (!Array.isArray(bundle.receipts) || bundle.receipts.length > MAX_RECEIPTS) throw new Error('Receipt limit exceeded.');
  let current = await genesis(bundle.genesis.seed, bundle.genesis.time);
  const snapshots = [current];
  for (const r of bundle.receipts) {
    if (!r || typeof r !== 'object') throw new Error('Invalid receipt.');
    const result = await transition(current, r.kind, r.payload, r.time, r.nonce);
    if (canonical(result.receipt) !== canonical(r)) throw new Error('Receipt ' + (snapshots.length) + ' failed its consistency check.');
    current = result.state; snapshots.push(current);
  }
  if (current.audit !== bundle.expectedAudit) throw new Error('Audit head mismatch.');
  return {state: current, snapshots, receipts: structuredClone(bundle.receipts)};
}
export function phenotype(state) {
  const byte = (h, i) => parseInt(h.slice(2+i*2, 4+i*2),16) / 255;
  const steps = [0, 3, 5, 7, 10];
  return {lobes: 3 + Math.floor(byte(state.genome,0) * 3.999),
    fold: 0.12 + byte(state.genome,1) * 0.20,
    twist: 1 + byte(state.genome,2) * 2,
    phase: byte(state.genome,3) * Math.PI*2,
    pitch: 110 * 2 ** (steps[Math.floor(byte(state.genome,4)*4.999)]/12),
    memoryPhase: byte(state.memory,0) * Math.PI*2,
    auditPhase: byte(state.audit,0) * Math.PI*2,
    sovereignty: state.sovereign ? 1 : 0};
}
export function shortHash(h, a=8, b=5) { return typeof h === 'string' && h.length > a+b+1 ? h.slice(0,a)+'…'+h.slice(-b) : h; }
