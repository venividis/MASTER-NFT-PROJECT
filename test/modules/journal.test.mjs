import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareJournal, journalHeader, exportJournalPacket, parseJournalPacket, decryptJournalPacket, JOURNAL_TEXT_BYTES } from '../../web/modules/journal.mjs';
import { MEMORY_KDF_ROUNDS } from '../../web/memory/crypto.mjs';
const address = byte => '0x' + byte.repeat(20);
const identity = { chainId: '31337', collection: address('11'), tokenId: '8', account: address('22'), registry: address('33'), owner: address('44'), epoch: '2' };
const passphrase = 'a unique test-only journal phrase';
const text = '  Private journal: violet-bird 7291 — 🫧\nPreserve this whitespace.  \n';

test('public publication preserves the raw text and enforces the UTF-8 bound', async () => {
  const result = await prepareJournal({ mode: 'public', text });
  assert.equal(result.chainText, text);
  assert.equal(result.byteLength, new TextEncoder().encode(text).length);
  assert.deepEqual(Object.keys(result).sort(), ['byteLength', 'chainText', 'mode']);
  assert.equal((await prepareJournal({ mode: 'public', text: 'é'.repeat(JOURNAL_TEXT_BYTES / 2) })).byteLength, JOURNAL_TEXT_BYTES);
  for (const input of [' ', 'é'.repeat(1501), '\ud800']) await assert.rejects(prepareJournal({ mode: 'public', text: input }), /UTF-8|Unicode/);
  await assert.rejects(prepareJournal({ mode: 'unspecified', text }), /Choose public or encrypted/);
});

test('encrypted transaction bytes contain no plaintext/passphrase and canonical export recovers exact text', async () => {
  const result = await prepareJournal({ mode: 'encrypted', text, passphrase, identity });
  assert.equal(result.packet.payload.rounds, MEMORY_KDF_ROUNDS);
  assert.equal(result.packet.payload.cipher, 'AES-256-GCM');
  assert.equal(result.chainText, exportJournalPacket(result.packet));
  assert.deepEqual(parseJournalPacket(result.chainText), result.packet);
  assert.ok(result.byteLength < 32768);
  assert.equal(JSON.stringify(result).includes('violet-bird'), false);
  assert.equal(JSON.stringify(result).includes(passphrase), false);
  assert.equal(JSON.stringify(result).includes('thesis'), false);
  assert.deepEqual(result.packet.header, journalHeader(identity));
  const opened = await decryptJournalPacket(result.chainText, passphrase, { expectedIdentity: identity });
  assert.equal(opened.text, text);
  assert.deepEqual(opened.header, result.packet.header);
});

test('wrong passphrase, authenticated header changes and ciphertext damage fail closed', async () => {
  const result = await prepareJournal({ mode: 'encrypted', text, passphrase, identity });
  await assert.rejects(decryptJournalPacket(result.packet, 'a different wrong test phrase'), /wrong passphrase, changed header, or damaged ciphertext/);
  const changedHeader = JSON.parse(result.chainText); changedHeader.header.owner = address('55');
  await assert.rejects(decryptJournalPacket(exportJournalPacket(changedHeader), passphrase), /changed header/);
  const damaged = JSON.parse(result.chainText); damaged.payload.data = (damaged.payload.data[0] === '0' ? '1' : '0') + damaged.payload.data.slice(1);
  await assert.rejects(decryptJournalPacket(exportJournalPacket(damaged), passphrase), /damaged ciphertext/);
  await assert.rejects(decryptJournalPacket(result.packet, passphrase, { expectedIdentity: { ...identity, epoch: '3' } }), /different NFT or custody epoch/);
  const plaintext = JSON.parse(result.chainText); plaintext.payload = { mode: 'public', body: { thesis: text } };
  assert.throws(() => parseJournalPacket(plaintext), /encrypted journal packet/);
  assert.equal((await decryptJournalPacket(result.packet, passphrase)).text, text);
});

test('maximum text recovers exactly through the existing padded memory format', async () => {
  const original = ' '.repeat(998) + 'é'.repeat(1000) + '\n\n';
  assert.equal(new TextEncoder().encode(original).length, JOURNAL_TEXT_BYTES);
  const result = await prepareJournal({ mode: 'encrypted', text: original, passphrase, identity });
  assert.ok(result.byteLength <= 16384);
  assert.equal((await decryptJournalPacket(result.chainText, passphrase)).text, original);
  assert.throws(() => parseJournalPacket(JSON.stringify(result.packet, null, 2)), /canonical export/);
});
