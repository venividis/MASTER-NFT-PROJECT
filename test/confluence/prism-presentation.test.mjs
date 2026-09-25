import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePrismPreferences, prismArtRoute, PRISM_ATLAS_GROUPS} from '../../web/confluence/prism-presentation.mjs';
import {CAPABILITY_CATALOG} from '../../web/confluence/capabilities.mjs';

test('corrupt or older appearance settings recover to usable defaults', () => {
  const defaults = {spectrum: 1.12, quality: 'auto', motion: null};
  for (const value of [undefined, null, false, 0, '', [], 'detail', {spectrum: NaN}, {spectrum: Infinity}, {spectrum: 'nonsense', quality: 'ultra', motion: 'false'}])
    assert.deepEqual(normalizePrismPreferences(value), defaults);
});

test('explicit zero light and paused motion survive storage normalization', () => {
  assert.deepEqual(normalizePrismPreferences({spectrum: '0', quality: 'economy', motion: false}), {spectrum: 0, quality: 'economy', motion: false});
  assert.deepEqual(normalizePrismPreferences({spectrum: 100, quality: 'detail', motion: true}), {spectrum: 1.6, quality: 'detail', motion: true});
  assert.equal(normalizePrismPreferences({spectrum: -4}).spectrum, 0);
  assert.equal(normalizePrismPreferences({spectrum: '   '}).spectrum, 1.12);
});

test('Atlas navigation has unique real destinations and live operations retain their artwork', () => {
  const keys = PRISM_ATLAS_GROUPS.flatMap(([, entries]) => entries);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.ok(CAPABILITY_CATALOG[key], 'Missing destination: '+key);
  for (const [operation, shape] of Object.entries({lock: 'vault', memory: 'memory', post: 'commons', swap: 'trade'}))
    assert.equal(prismArtRoute('live', operation), shape);
  assert.equal(prismArtRoute('v4'), 'trade');
  assert.equal(prismArtRoute('cartridges'), 'worlds');
});
