/** Public or encrypted journal bytes. Encryption reuses the existing memory cipher. */
import { encryptMemory, decryptMemory, validateMemoryPayload } from '../memory/crypto.mjs';
import { canonicalJSON } from '../../packages/modules/core.mjs';
import { identityKey, sameAuthority } from './host.mjs';

export const JOURNAL_TEXT_BYTES = 3000;
export const JOURNAL_PACKET_BYTES = 16384;
export const JOURNAL_PACKET_SCHEMA = 'anima.encrypted-journal-packet/1';
const HEADER_SCHEMA = 'anima.module-journal-header/1';
const BODY_SCHEMA = 'anima.module-journal-text/1';
const TEXT_ENCODING = 'utf8-base64/1';
const utf8 = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const fields = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
      || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw Error('Unsupported journal packet fields.');
};
const positive = (value, label, maximum = 2n ** 256n - 1n) => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw Error('Invalid journal ' + label + '.');
  const text = String(value);
  if (!/^[1-9][0-9]*$/.test(text) || text.length > 78 || BigInt(text) > maximum) throw Error('Invalid journal ' + label + '.');
  return text;
};
function journalText(text) {
  if (typeof text !== 'string' || !text.trim() || utf8.encode(text).length > JOURNAL_TEXT_BYTES) throw Error('Write 1–3000 UTF-8 bytes for this journal entry.');
  // UTF-8 must recover the exact supplied string, including its whitespace.
  if (decoder.decode(utf8.encode(text)) !== text) throw Error('Journal text contains invalid Unicode.');
  return text;
}
export function journalHeader(identity) {
  identityKey(identity);
  const header = { schema: HEADER_SCHEMA, chainId: positive(identity.chainId, 'chain ID'),
    collection: identity.collection.toLowerCase(), tokenId: positive(identity.tokenId, 'token ID'),
    account: identity.account.toLowerCase(), registry: identity.registry.toLowerCase(),
    owner: identity.owner.toLowerCase(), epoch: positive(identity.epoch, 'custody epoch', 2n ** 64n - 1n),
    textEncoding: TEXT_ENCODING };
  for (const name of ['collection', 'account', 'registry', 'owner']) if (/^0x0{40}$/.test(header[name])) throw Error('Invalid journal identity address.');
  return Object.freeze(header);
}
function validateHeader(header) {
  fields(header, ['schema', 'chainId', 'collection', 'tokenId', 'account', 'registry', 'owner', 'epoch', 'textEncoding']);
  if (header.schema !== HEADER_SCHEMA || header.textEncoding !== TEXT_ENCODING
      || canonicalJSON(journalHeader(header)) !== canonicalJSON(header)) throw Error('Unsupported or noncanonical journal header.');
}
const to64 = bytes => btoa(String.fromCharCode(...bytes));
function packText(text) {
  // memoryBody deliberately trims text fields. Encoding before using that
  // existing format preserves the journal's exact original whitespace/UTF-8.
  const encoded = to64(utf8.encode(text));
  return { title: BODY_SCHEMA, thesis: encoded.slice(0, 3000), lesson: encoded.slice(3000) };
}
function unpackText(body) {
  if (body.title !== BODY_SCHEMA || Object.entries(body).some(([key, value]) => !['title', 'thesis', 'lesson'].includes(key) && value !== '')) throw Error('Unsupported encrypted journal body.');
  const encoded = body.thesis + body.lesson;
  if (encoded.length > 4000 || encoded.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw Error('Invalid journal text encoding.');
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  if (to64(bytes) !== encoded) throw Error('Noncanonical journal text encoding.');
  return journalText(decoder.decode(bytes));
}
/** Parse only the versioned ciphertext packet; never accepts plaintext fallbacks. */
export function parseJournalPacket(input) {
  let packet = input;
  if (typeof input === 'string') {
    if (utf8.encode(input).length > JOURNAL_PACKET_BYTES) throw Error('Journal packet exceeds 16 KiB.');
    packet = JSON.parse(input);
  }
  fields(packet, ['schema', 'header', 'payload']);
  if (packet.schema !== JOURNAL_PACKET_SCHEMA || packet.payload?.mode !== 'encrypted') throw Error('Expected a versioned encrypted journal packet.');
  validateHeader(packet.header); validateMemoryPayload(packet.payload);
  const canonical = canonicalJSON(packet);
  if (utf8.encode(canonical).length > JOURNAL_PACKET_BYTES) throw Error('Journal packet exceeds 16 KiB.');
  if (typeof input === 'string' && canonical !== input) throw Error('Journal packet is not its exact canonical export.');
  const copy = JSON.parse(canonical);
  Object.freeze(copy.header); Object.freeze(copy.payload);
  return Object.freeze(copy);
}
export function exportJournalPacket(packet) { return canonicalJSON(parseJournalPacket(packet)); }

/** Encrypted results contain only ciphertext and public identity metadata. */
export async function prepareJournal({ mode, text, passphrase, identity }) {
  journalText(text);
  if (mode === 'public') return Object.freeze({ mode, chainText: text, byteLength: utf8.encode(text).length });
  if (mode !== 'encrypted') throw Error('Choose public or encrypted journal publication.');
  const header = journalHeader(identity), payload = await encryptMemory(header, packText(text), passphrase);
  const packet = parseJournalPacket({ schema: JOURNAL_PACKET_SCHEMA, header, payload });
  const chainText = exportJournalPacket(packet);
  return Object.freeze({ mode, chainText, byteLength: utf8.encode(chainText).length, packet });
}
/** Local explicit recovery. A changed identity header fails AES-GCM authentication. */
export async function decryptJournalPacket(input, passphrase, { expectedIdentity } = {}) {
  const packet = parseJournalPacket(input);
  if (expectedIdentity && !sameAuthority(journalHeader(expectedIdentity), packet.header)) throw Error('This journal packet belongs to a different NFT or custody epoch.');
  const body = await decryptMemory(packet.header, packet.payload, passphrase);
  return { header: { ...packet.header }, text: unpackText(body) };
}
