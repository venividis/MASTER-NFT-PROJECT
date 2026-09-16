import { AbiCoder, getAddress, keccak256, sha256, toUtf8Bytes } from '../vendor/ethers.min.js';
const encoder = AbiCoder.defaultAbiCoder();
const LIMIT = 24576;
const hash = value => keccak256(toUtf8Bytes(JSON.stringify(value)));
const uint = value => { if (!/^\d{1,77}$/.test(String(value))) throw Error('Expected an unsigned integer.'); return String(BigInt(value)); };
const hex32 = value => /^0x[0-9a-f]{64}$/i.test(value || '');
const caps = ['read-snapshot', 'propose-transaction'];
export function normalizeInstrumentRequest(input) {
  if (input?.schema !== 'anima.generated-request/1' || typeof input.description !== 'string' || !input.description.trim() || input.description.length > 6000) throw Error('Provide a bounded written instrument request.');
  const permissions = [...new Set(input.capabilities || [])].sort();
  if (!permissions.every(cap => caps.includes(cap))) throw Error('Unknown instrument capability.');
  const snapshot = input.snapshot ?? null;
  if (JSON.stringify(snapshot).length > 8192) throw Error('Explicit shared snapshot exceeds 8 KiB.');
  const maxBytes = input.maxBytes ?? LIMIT;
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > LIMIT) throw Error('Onchain programs must fit in 24576 bytes.');
  return { schema: input.schema, name: String(input.name || 'Generated instrument').slice(0, 80), description: input.description,
    chainId: uint(input.chainId), collection: getAddress(input.collection), tokenId: uint(input.tokenId), account: getAddress(input.account),
    capabilities: permissions, maxBytes, snapshot: JSON.parse(JSON.stringify(snapshot)), runtime: 'html-sandbox' };
}
export function instrumentTerms(request) { return hash(normalizeInstrumentRequest(request)); }
export function compileGeneratedInstrument(request, html, capabilities = []) {
  request = normalizeInstrumentRequest(request);
  if (typeof html !== 'string') throw Error('Provider must supply the complete HTML/JavaScript source.');
  const bytes = toUtf8Bytes(html);
  if (!bytes.length || bytes.length > request.maxBytes) throw Error('Executable is empty or exceeds the request byte limit.');
  capabilities = [...new Set(capabilities)].sort();
  if (!capabilities.every(cap => request.capabilities.includes(cap))) throw Error('Provider requested a capability outside the commission.');
  const contentHash = sha256(bytes), terms = instrumentTerms(request);
  const manifest = { spec: 'awe.cartridge/1', name: request.name, version: '1', engine: 'html', entry: `sha256:${contentHash.slice(2)}`, contentHash,
    capabilities, settlement: 'separate-exact-owner-approval', compiler: 'anima.generated-instrument/1', requestHash: terms,
    source: { chainId: request.chainId, collection: request.collection, tokenId: request.tokenId }, safety: 'Untrusted arbitrary code. Commitment proves bytes, not safety.' };
  const manifestJSON = JSON.stringify(manifest), manifestHash = keccak256(toUtf8Bytes(manifestJSON));
  const deliverable = keccak256(encoder.encode(['string', 'bytes32', 'bytes32', 'bytes32'], ['anima.commissioned-cartridge/1', terms, contentHash, manifestHash]));
  return { schema: 'anima.generated-deliverable/1', request, terms, html, capabilities, contentHash, manifestJSON, manifestHash, deliverable, bytes: bytes.length };
}
export function validateGeneratedInstrument(artifact) {
  if (artifact?.schema !== 'anima.generated-deliverable/1') throw Error('Unknown generated deliverable.');
  const expected = compileGeneratedInstrument(artifact.request, artifact.html, artifact.capabilities);
  for (const key of ['terms', 'contentHash', 'manifestJSON', 'manifestHash', 'deliverable', 'bytes']) if (artifact[key] !== expected[key]) throw Error(`Generated deliverable ${key} changed.`);
  return expected;
}
export function approveInstrument(artifact, { contentHash, manifestHash, reviewedSource = false } = {}) {
  const a = validateGeneratedInstrument(artifact);
  if (!reviewedSource || contentHash !== a.contentHash || manifestHash !== a.manifestHash) throw Error('Review this exact source and manifest before approving it.');
  // This local review record is not a signature or a safety certificate. The separate escrow reviewer still signs payment.
  return Object.freeze({ schema: 'anima.instrument-review/1', contentHash, manifestHash, deliverable: a.deliverable });
}
export function requireInstrumentApproval(artifact, approval) {
  const a = validateGeneratedInstrument(artifact);
  if (approval?.schema !== 'anima.instrument-review/1' || approval.contentHash !== a.contentHash || approval.manifestHash !== a.manifestHash || approval.deliverable !== a.deliverable) throw Error('Explicit approval for these exact bytes is required.');
  return a;
}
export function exactProposalGrant({ contentHash, chainId, target, value = '0', data = '0x', account, epoch, expires, calls = 1 }) {
  if (!hex32(contentHash) || !/^0x(?:[0-9a-f]{2})*$/i.test(data) || data.length > 16386 || !Number.isSafeInteger(expires) || expires <= Date.now() || expires > Date.now() + 300000 || !Number.isSafeInteger(calls) || calls < 1 || calls > 5) throw Error('Grant must bind exact calldata and expire within five minutes, with 1–5 proposals.');
  return { contentHash: contentHash.toLowerCase(), chainId: uint(chainId), target: getAddress(target), value: uint(value), data: data.toLowerCase(), account: getAddress(account), epoch: uint(epoch), expires, remaining: calls };
}
export function consumeProposalGrant(grant, proposal, context) {
  if (!grant || grant.expires <= Date.now() || grant.remaining <= 0) throw Error('Exact proposal grant is missing or expired.');
  const actual = { contentHash: String(context.contentHash).toLowerCase(), chainId: uint(context.chainId), account: getAddress(context.account), epoch: uint(context.epoch), target: getAddress(proposal.target), value: uint(proposal.value), data: String(proposal.data).toLowerCase() };
  for (const key of Object.keys(actual)) if (actual[key] !== grant[key]) throw Error(`Proposal differs from the approved ${key}.`);
  --grant.remaining; return { target: actual.target, value: actual.value, data: actual.data };
}
export const INSTRUMENT_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; media-src data:; font-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none'";
export function launchGeneratedInstrument(container, artifact, approval, { readContext, onProposal, grant = null, lifetimeMs = 300000 } = {}) {
  const a = requireInstrumentApproval(artifact, approval), frame = document.createElement('iframe');
  frame.title = a.request.name; frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('referrerpolicy', 'no-referrer'); frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'");
  frame.style.cssText = 'width:100%;height:480px;border:1px solid #33536a;border-radius:12px;background:#061320';
  // No allow-same-origin, wallet, storage, parent DOM, network bridge, popup, download or top-navigation capability.
  frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="${INSTRUMENT_CSP}">` + a.html;
  let channel, closed = false, calls = 0, pending = false;
  const stop = () => { if (closed) return; closed = true; clearTimeout(timer); channel?.port1.close(); frame.remove(); if (grant) grant.remaining = 0; };
  frame.addEventListener('load', () => {
    if (++calls > 1) return stop();
    channel = new MessageChannel();
    channel.port1.onmessage = async ({ data }) => {
      if (closed || pending || !data || typeof data.id !== 'string' || data.id.length > 64) return;
      try { if (JSON.stringify(data).length > 20000) return; } catch { return; }
      pending = true;
      try {
        let result;
        if (data.method === 'read-snapshot' && a.capabilities.includes('read-snapshot')) result = a.request.snapshot;
        else if (data.method === 'propose-transaction' && a.capabilities.includes('propose-transaction') && readContext && onProposal) {
          const context = await readContext(); if (closed) throw Error('Instrument was closed.');
          const exact = consumeProposalGrant(grant, data.params, { ...context, contentHash: a.contentHash });
          result = await onProposal(exact); // Host may prepare a review; execution still needs its own wallet approval.
        } else throw Error('Capability was not granted.');
        if (!closed) channel.port1.postMessage({ id: data.id, result });
      } catch (error) { if (!closed) channel.port1.postMessage({ id: data.id, error: error.message }); }
      finally { pending = false; }
    };
    frame.contentWindow.postMessage({ schema: 'anima.instrument-channel/1', capabilities: a.capabilities.filter(cap => cap === 'read-snapshot' || grant && cap === 'propose-transaction') }, '*', [channel.port2]);
  });
  container.append(frame); const timer = setTimeout(stop, Math.min(Math.max(lifetimeMs, 1000), 300000)); return stop;
}
