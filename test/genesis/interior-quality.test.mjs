import test from 'node:test';
import assert from 'node:assert/strict';
import { InteriorQualityController } from '../../web/genesis/interior-quality.mjs';

function frames(controller, start, count, dt, options = {}) {
  let now = start, budget;
  for (let i = 0; i < count; i++) budget = controller.update(now += dt, options);
  return { now, budget };
}

test('navigation lowers work immediately, remains stable between input events, and settles once', () => {
  const c = new InteriorQualityController();
  const idle = c.update(0);
  assert.equal(idle.pixels, 220000);
  assert.equal(idle.samples, 80);
  const moving = c.update(16, { navigating: true });
  assert.ok(moving.pixels < idle.pixels && moving.samples < idle.samples);
  for (const now of [32, 80, 140, 230]) assert.deepEqual(c.update(now), moving);
  const settled = c.update(260);
  assert.deepEqual(settled, idle);
});

test('one stalled frame does not degrade quality, while sustained slow rendering does', () => {
  const c = new InteriorQualityController();
  c.update(0);
  let run = frames(c, 0, 30, 1000 / 60);
  c.update(run.now += 180);
  run = frames(c, run.now, 80, 1000 / 60);
  assert.equal(run.budget.level, 0);
  run = frames(c, run.now, 48, 50);
  assert.ok(run.budget.level >= 1);
  assert.ok(run.budget.pixels < 220000 && run.budget.samples < 80);
});

test('recovery requires sustained headroom and only increases one step at a time', () => {
  const c = new InteriorQualityController();
  c.update(0);
  let run = frames(c, 0, 72, 50);
  const degraded = run.budget.level;
  assert.ok(degraded >= 2);
  run = frames(c, run.now, 48, 1000 / 60);
  assert.equal(run.budget.level, degraded);
  const changes = [];
  let prior = degraded;
  for (let i = 0; i < 420; i++) {
    run.now += 1000 / 60;
    const { level } = c.update(run.now);
    if (level !== prior) {
      changes.push({ now: run.now, from: prior, to: level });
      assert.equal(prior - level, 1);
      prior = level;
    }
  }
  assert.ok(changes.length >= 2);
  for (let i = 1; i < changes.length; i++) assert.ok(changes[i].now - changes[i - 1].now >= 2990);
});

test('alternating marginal windows stay in the hysteresis band rather than oscillating', () => {
  const c = new InteriorQualityController();
  c.update(0);
  let run = frames(c, 0, 48, 50), level = run.budget.level;
  for (let i = 0; i < 20; i++) {
    run = frames(c, run.now, 30, i % 2 ? 22 : 29);
    assert.equal(run.budget.level, level);
  }
});

test('hidden pages, long gaps, duplicate exports, and restarted clocks cannot fabricate performance', () => {
  const c = new InteriorQualityController();
  c.update(0);
  let run = frames(c, 0, 48, 50);
  const level = run.budget.level;
  const before = c.update(run.now, { navigating: true });
  for (let i = 0; i < 2000; i++) assert.deepEqual(c.update(run.now), before);
  c.update(run.now + 50, { hidden: true });
  assert.equal(c.update(run.now + 60000).level, level);
  assert.equal(c.update(run.now + 120000).level, level);
  const resetClock = c.update(0);
  assert.equal(resetClock.level, level);
  assert.equal(resetClock.navigating, false);
  run = frames(c, 0, 20, 25);
  assert.equal(run.budget.level, level);
  assert.throws(() => c.update(NaN), /finite/);
});

test('all explicit quality modes adapt but remain bounded and finite under prolonged overload', () => {
  for (const quality of ['auto', 'economy', 'detail']) {
    const c = new InteriorQualityController();
    const initial = c.update(0, { quality });
    let run = frames(c, 0, 1200, 100, { quality, navigating: true });
    assert.ok(run.budget.pixels >= 20000 && run.budget.pixels < initial.pixels);
    assert.ok(run.budget.samples >= 32 && run.budget.samples <= initial.samples);
    assert.equal(run.budget.quality, quality);
    const stable = run.budget;
    run = frames(c, run.now, 120, 100, { quality, navigating: true });
    assert.deepEqual(run.budget, stable);
  }
});
