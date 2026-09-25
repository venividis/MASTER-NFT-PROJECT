import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrismGeometry, prismIdentity, PrismArtwork} from '../../web/genesis/prism-art.mjs';

const identity = {seed: '0x'+'01'.repeat(32), genome: '0x'+'02'.repeat(32), root: '0x'+'03'.repeat(32)};
const geometry = (value = identity, mode = 'home') => createPrismGeometry(value, {mode, strands: 24, samples: 40});

test('the complete immutable identity reproduces the same geometry without randomness', () => {
  assert.deepEqual(geometry(), geometry({...identity}));
  for (const key of ['seed', 'genome', 'root']) {
    const changed = {...identity, [key]: identity[key].slice(0, -1)+'4'};
    assert.notDeepEqual(prismIdentity(changed).axes, prismIdentity(identity).axes, key+' tail was ignored');
    assert.notDeepEqual(geometry(changed).curves[0].points, geometry().curves[0].points);
  }
});

test('every portal topology retains finite closed shells and the same orientation seam', () => {
  const original = geometry();
  const seam = original.curves.find(curve => curve.kind === 'seam').points;
  for (const mode of ['home', 'trade', 'launch', 'vault', 'memory', 'commons', 'worlds', 'atlas', 'modules']) {
    const shape = geometry(identity, mode);
    assert.deepEqual(shape.curves.find(curve => curve.kind === 'seam').points, seam);
    assert.ok(shape.curves.some(curve => curve.kind === 'inner'), 'Interior shells missing');
    for (const curve of shape.curves) {
      assert.ok(curve.points.every(Number.isFinite), mode+' contains an invalid vertex');
      for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(curve.points[axis]-curve.points[curve.points.length-3+axis]) < 1e-6, mode+' has an open curve');
    }
    if (mode !== 'home') assert.notDeepEqual(shape.curves[0].points, original.curves[0].points, mode+' lost its distinct topology');
  }
});

test('quality lowers geometry cost and changing identities clears previous artwork', () => {
  const artwork = new PrismArtwork(null, {identity, quality: 'detail'});
  artwork.build(false);
  const detail = artwork.geometry.vertices;
  artwork.setMode('trade');
  assert.ok(artwork.previous);
  artwork.setIdentity({...identity, root: '0x'+'04'.repeat(32)});
  assert.equal(artwork.previous, null);
  assert.equal(artwork.geometry, null);
  artwork.setQuality('economy');
  artwork.build(false);
  assert.ok(artwork.geometry.vertices < detail/2, 'Economy does not materially reduce geometry work');
  assert.equal(artwork.geometry.identity, prismIdentity(artwork.identity).key);
});
