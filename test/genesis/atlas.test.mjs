import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ORIGINAL_ACTIONS,
  SECONDARY_VIEWS,
  dispatchOriginal,
  dispatchSecondary,
} from "../../web/genesis/atlas.mjs";
import {
  formationShader,
  installBlueProjection,
} from "../../web/genesis/projection.mjs";
const source = fs.readFileSync("render/living/field.frag", "utf8");
test("all original Atlas routes invoke the retained original control after close", async () => {
  for (const [key, , , selector] of ORIGINAL_ACTIONS) {
    const events = [];
    await dispatchOriginal(key, {
      document: {
        querySelector: (s) => {
          assert.equal(s, selector);
          return { disabled: false, click: () => events.push("native") };
        },
      },
      close: async () => {
        events.push("close");
        await Promise.resolve();
        events.push("settled");
      },
      home: () => events.push("home"),
    });
    assert.deepEqual(events, ["close", "settled", "home", "native"]);
  }
});
test("disabled controls and unknown routes cannot bypass native checks", async () => {
  let calls = 0;
  const options = {
    document: {
      querySelector: () => ({ disabled: true, click: () => calls++ }),
    },
    close: () => calls++,
    home: () => calls++,
  };
  await assert.rejects(dispatchOriginal("evolve", options), /unavailable/);
  await assert.rejects(
    dispatchOriginal("send-transaction", options),
    /Unknown/,
  );
  assert.equal(calls, 0);
  for (const [, , , selector] of ORIGINAL_ACTIONS)
    assert.ok(
      ![
        "#seal",
        "#ascend-confirm",
        "#send-transaction",
        "#confirm-import",
      ].includes(selector),
    );
});
test("secondary views include form, venues, applications, clock and both original/extended launch entry", () => {
  const seen = [];
  for (const [view] of SECONDARY_VIEWS)
    dispatchSecondary(view, { openView: (v) => seen.push(v) });
  assert.deepEqual(
    seen,
    SECONDARY_VIEWS.map((x) => x[0]),
  );
  assert.throws(() => dispatchSecondary("fake", {}), /Unknown/);
});
test("full original radiance is retained byte-for-byte, only main projection is extended", () => {
  const result = formationShader(source),
    prefix = source.slice(0, source.lastIndexOf("void main()"));
  assert.ok(result.startsWith(prefix));
  assert.match(
    result,
    /if\(genesisOpening<=0\.\).*radiance\(originalUV.x,originalUV.y\)/,
  );
  assert.throws(() => formationShader("void main(){}"), /not compatible/);
});
test("blue projection uploads lived traits, restores after init and never schedules an original RAF", () => {
  const priorDoc = globalThis.document;
  const values = {};
  globalThis.document = {
    createElement: () => ({}),
    documentElement: { style: { setProperty() {} } },
  };
  try {
    let compiles = 0,
      draws = 0;
    const gl = {
      deleteProgram() {},
      useProgram() {},
      getUniformLocation: (_p, n) => n,
    };
    for (const n of [1, 2, 4])
      gl["uniform" + n + "f"] = (name, ...v) => (values[name] = v);
    const r = {
      width: 1000,
      height: 800,
      gl,
      program: { pr: 0 },
      livedFieldSource: source,
      makeProgram: () => ({ pr: ++compiles }),
      drawGL: () => draws++,
      drawCPU() {},
      params: Array(31).fill(0.2),
      motion: false,
    };
    const field = {
      id: { axes: Array(16).fill(0.5) },
      layout: {
        width: 1000,
        height: 600,
        panel: { x: 100, y: 110, width: 700, height: 380 },
      },
      viewport: () => ({ top: 0 }),
      unfold: 0.5,
    };
    installBlueProjection(field, r);
    r.drawGL();
    assert.equal(compiles, 1);
    assert.deepEqual(values.life0, [0.2, 0.2, 0.2, 0.2]);
    assert.deepEqual(values.genesisViewport, [1000, 800]);
    assert.deepEqual(values.genesisOpening, [0.5]);
    field.updateBlue();
    assert.equal(r.dirty, true);
    assert.equal(field.motion, false);
    r.dirty = false;
    field.layout.panel.x += 24;
    field.updateBlue();
    assert.equal(r.dirty, true);
    r.program = { pr: 99 };
    r.drawGL();
    assert.equal(compiles, 2);
    assert.equal(draws, 2);
    r.drawGL();
    assert.equal(compiles, 2);
  } finally {
    globalThis.document = priorDoc;
  }
});

test("chain selection owns sovereignty, trace uniforms and atmospheric lineage in GL, CPU and Original projections", () => {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({}),
    documentElement: { style: { setProperty() {} } },
  };
  try {
    const local = {
        seed: "0x" + "11".repeat(32),
        root: "0x" + "22".repeat(32),
        sovereign: true,
        nonce: 90,
        children: [{ genome: "local-child" }],
      },
      minted = {
        seed: "0x" + "33".repeat(32),
        genome: "0x" + "44".repeat(32),
        root: "0x" + "55".repeat(32),
        sovereign: false,
        nonce: "3",
      };
    const captures = [];
    const gl = {
      deleteProgram() {},
      useProgram() {},
      getUniformLocation: (_p, n) => n,
    };
    for (const n of [1, 2, 4]) gl["uniform" + n + "f"] = () => {};
    const renderer = {
      width: 1000,
      height: 800,
      gl,
      state: local,
      pulse: 0.9,
      eventKind: 4,
      program: { pr: 0 },
      livedFieldSource: source,
      makeProgram: () => ({ pr: 1 }),
      drawGL() {
        captures.push({
          params: [...this.params],
          pulse: this.pulse,
          event: this.eventKind,
        });
      },
      drawCPU() {
        captures.push({ params: [...this.params] });
      },
      drawAtmosphere() {
        captures.push({
          state: this.state,
          pulse: this.pulse,
          event: this.eventKind,
        });
      },
      params: Array(31).fill(0.7),
      motion: false,
    };
    const field = {
      opticalIdentity: minted,
      selectionMode: "minted-snapshot",
      id: { axes: Array(16).fill(0.5) },
      layout: { panel: { x: 1, y: 2, width: 500, height: 400 } },
      viewport: () => ({ top: 0 }),
      unfold: 0,
    };
    installBlueProjection(field, renderer);
    for (const mode of [
      "minted-snapshot",
      "confirmed-chain",
      "chain-stale",
      "visual-preview",
    ])
      for (const original of [false, true]) {
        field.selectionMode = mode;
        renderer.original = original;
        renderer.drawGL();
        let captured = captures.at(-1);
        assert.equal(captured.params[13], 0);
        assert.deepEqual(captured.params.slice(23, 31), Array(8).fill(0));
        assert.equal(captured.pulse, 0);
        assert.equal(captured.event, 0);
        assert.equal(renderer.pulse, 0.9);
        renderer.drawCPU(16);
        captured = captures.at(-1);
        assert.equal(captured.params[13], 0);
        assert.equal(captured.params[14], 0);
        assert.equal(captured.params[21], 0);
        assert.deepEqual(captured.params.slice(23, 31), Array(8).fill(0));
        renderer.drawAtmosphere();
        captured = captures.at(-1);
        assert.equal(captured.state.nonce, 3);
        assert.equal(captured.state.sovereign, false);
        assert.deepEqual(captured.state.children, []);
        assert.equal(captured.pulse, 0);
        assert.equal(renderer.state, local);
      }
    field.updateBlue();
    renderer.dirty = false;
    field.opticalIdentity = { ...minted, root: "0x" + "66".repeat(32) };
    field.updateBlue();
    assert.equal(renderer.dirty, true);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
