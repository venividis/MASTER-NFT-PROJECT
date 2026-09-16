import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
test("paused kingdom repaint follows camera edits and then returns idle", () => {
  const sandbox = {
    requestAnimationFrame: () => 1,
    document: { hidden: false },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(
      new URL("../../web/kingdom/scene.js", import.meta.url),
      "utf8",
    ) + ";globalThis.Scene=KingdomScene",
    sandbox,
  );
  const scene = Object.create(sandbox.Scene.prototype);
  Object.assign(scene, {
    motion: false,
    visible: true,
    last: 0,
    yaw: 0,
    tyaw: 0.2,
    pitch: 0,
    tpitch: 0.1,
    zoom: 1,
    tzoom: 1.2,
    dirty: false,
    draw() {
      this.draws = (this.draws || 0) + 1;
    },
  });
  scene.loop(16);
  assert.equal(scene.draws, 1);
  assert.equal(scene.yaw, 0.2);
  assert.equal(scene.zoom, 1.2);
  scene.loop(32);
  assert.equal(scene.draws, 1);
});
