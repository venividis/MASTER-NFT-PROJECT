import test from 'node:test';
import assert from 'node:assert/strict';
import {scopeConfluenceArchiveStorage} from '../../web/confluence/archive.mjs';

const seed = '0x'+'01'.repeat(32);
const values = {
  'idfbi.optical.1.2': '{"origin":true}',
  ['idfbi.instruments.1.7:'+seed]: '{"instruments":true}',
  ['awe.confluence:'+seed+':routes']: '[]',
  ['awe.confluence:'+seed+':prism-preferences']: '{"motion":false}',
};

test('a normal archive retains exact storage keys and serialized bytes', () => {
  assert.deepEqual(scopeConfluenceArchiveStorage(values), values);
});

test('simulator archive restoration stays inside one reserved namespace', () => {
  const prefix = 'anima.simulator:prism-cathedral:';
  const mapped = scopeConfluenceArchiveStorage(values, prefix);
  assert.deepEqual(Object.values(mapped), Object.values(values));
  assert.equal(mapped[prefix+'optical'], values['idfbi.optical.1.2']);
  assert.equal(mapped[prefix+'instruments:'+seed], values['idfbi.instruments.1.7:'+seed]);
  assert.equal(mapped[prefix+'confluence:'+seed+':prism-preferences'], '{"motion":false}');
  assert.ok(Object.keys(mapped).every(key => key.startsWith(prefix)));
});

test('archive scope rejects arbitrary keys, mixed identities and unsafe prefixes', () => {
  for (const prefix of ['', 'awe.confluence:', 'anima.simulator:../../:', 'anima.simulator:a b:', null, 7])
    assert.throws(() => scopeConfluenceArchiveStorage(values, prefix), /scope/);
  assert.throws(() => scopeConfluenceArchiveStorage({...values, 'wallet-private-key': 'secret'}), /storage key/);
  assert.throws(() => scopeConfluenceArchiveStorage({...values, ['awe.confluence:0x'+'02'.repeat(32)+':world']: '{}'}), /mixes identities/);
  assert.throws(() => scopeConfluenceArchiveStorage({'idfbi.optical.1.2': {unserialized: true}}), /storage value/);
  assert.throws(() => scopeConfluenceArchiveStorage([]), /storage values/);
});
