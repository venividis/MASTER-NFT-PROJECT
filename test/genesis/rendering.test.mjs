import test from "node:test";
import assert from "node:assert/strict";
import { GenesisField } from "../../web/genesis/field.js";
import { identityVector } from "../../web/confluence/identity.mjs";
import { particleVertex, particleFragment } from "../../web/begins/shaders.mjs";
const identity = (n) => identityVector({ seed: "0x" + n.repeat(32) });
function declarations(source) {
  const result = new Map(),
    precision = source.match(/precision\s+(\w+)\s+float/)[1];
  for (const m of source.matchAll(
    /(uniform|varying)\s+(?:(highp|mediump|lowp)\s+)?(float|vec[234])\s+([^;]+);/g,
  ))
    for (const name of m[4].split(","))
      result.set(m[1] + ":" + name.trim(), {
        precision: m[2] || precision,
        type: m[3],
        explicit: !!m[2],
      });
  return result;
}
function fixture(options = {}) {
  const config = {
      failLink: false,
      badFramebuffer: false,
      noGL: false,
      ...options,
    },
    draws = [],
    fills = [],
    deleted = [];
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 8,
    BLEND: 9,
    SRC_ALPHA: 10,
    ONE: 11,
    POINTS: 13,
    TRIANGLES: 14,
    FRAMEBUFFER_COMPLETE: 99,
    createShader: (type) => ({ type }),
    shaderSource: (s, source) => (s.source = source),
    compileShader() {},
    getShaderParameter: () => true,
    createProgram: () => ({ shaders: [] }),
    attachShader: (p, s) => p.shaders.push(s),
    linkProgram(p) {
      const a = declarations(p.shaders[0].source),
        b = declarations(p.shaders[1].source);
      p.linked =
        !config.failLink &&
        [...a].every(
          ([k, v]) =>
            !b.has(k) ||
            (b.get(k).precision === v.precision && b.get(k).type === v.type),
        );
    },
    getProgramParameter: (p) => p.linked,
    getProgramInfoLog: () => "link failed",
    createBuffer: () => ({}),
    createTexture: () => ({}),
    createFramebuffer: () => ({}),
    checkFramebufferStatus: () => (config.badFramebuffer ? 0 : 99),
    getUniformLocation: (_p, k) => k,
    getAttribLocation: (_p, k) =>
      ["position", "destination", "salt", "home", "ink"].indexOf(k),
    drawArrays: (mode, _first, count) => draws.push({ mode, count }),
  };
  for (const key of [
    "clearColor",
    "clear",
    "bindBuffer",
    "bufferData",
    "bindTexture",
    "texParameteri",
    "texImage2D",
    "bindFramebuffer",
    "framebufferTexture2D",
    "useProgram",
    "uniform1f",
    "uniform2f",
    "uniform3f",
    "uniform4f",
    "uniform1i",
    "enableVertexAttribArray",
    "disableVertexAttribArray",
    "vertexAttribPointer",
    "disable",
    "enable",
    "blendFunc",
    "viewport",
    "activeTexture",
  ])
    gl[key] = () => {};
  for (const kind of ["Shader", "Buffer", "Program", "Texture", "Framebuffer"])
    gl["delete" + kind] = (x) => deleted.push([kind, x]);
  const context = {
    setTransform() {},
    clearRect() {},
    fillRect: (...args) => fills.push(args),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  class Canvas {
    constructor() {
      this.id = "cf-field";
      this.width = 300;
      this.height = 150;
      this.style = {};
      this.listeners = new Map();
      this.contextType = null;
    }
    getContext(type, options) {
      this.contextOptions = options;
      if (this.contextType && type !== this.contextType) return null;
      if (type === "webgl" && config.noGL) return null;
      this.contextType = type;
      return type === "2d" ? context : gl;
    }
    cloneNode() {
      const c = new Canvas();
      c.width = this.width;
      c.height = this.height;
      c.style = { ...this.style };
      return c;
    }
    replaceWith(next) {
      this.replacement = next;
    }
    addEventListener(type, fn) {
      this.listeners.set(type, [...(this.listeners.get(type) || []), fn]);
    }
    setPointerCapture() {}
    dispatch(type, e = {}) {
      for (const fn of this.listeners.get(type) || []) fn(e);
    }
  }
  return { config, gl, draws, fills, deleted, canvas: new Canvas() };
}
function environment(run) {
  const css = new Map(),
    values = {
      innerWidth: 390,
      innerHeight: 844,
      devicePixelRatio: 1,
      document: {
        hidden: false,
        documentElement: { style: { setProperty: (k, v) => css.set(k, v) } },
        body: { classList: { toggle() {} } },
      },
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: () => 1,
      addEventListener() {},
      visualViewport: undefined,
      window: {},
    };
  const previous = Object.fromEntries(
    Object.keys(values).map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
  );
  try {
    Object.assign(globalThis, values);
    run(css);
  } finally {
    for (const [k, v] of Object.entries(previous))
      if (v) Object.defineProperty(globalThis, k, v);
      else delete globalThis[k];
  }
}

test("transparent Genesis layer draws only particles; blue optics belong to the original renderer", () =>
  environment(() => {
    const f = fixture(),
      field = new GenesisField(f.canvas, identity("13"));
    field.tick(16);
    assert.equal(field.gl, f.gl);
    assert.equal(field.unfold, 0);
    assert.deepEqual(f.draws, []);
    assert.equal(f.canvas.contextOptions.alpha, true);
    field.setMode("trade");
    field.progress = 0.5;
    field.unfold = 0.5;
    field.tick(32);
    assert.deepEqual(
      f.draws.map((x) => x.count),
      [16000, 16000],
    );
    assert.ok(f.draws.every((x) => x.mode === f.gl.POINTS));
  }));
for (const config of [{ failLink: true }, { noGL: true }])
  test("fresh interactive fallback on " + JSON.stringify(config), () =>
    environment(() => {
      const f = fixture(config),
        field = new GenesisField(f.canvas, identity("13"));
      assert.equal(field.gl, null);
      assert.notEqual(field.canvas, f.canvas);
      field.tick(16);
      assert.equal(field.renderedCount, 8000);
      assert.equal(f.fills.length, 0);
      field.setMode("trade");
      field.unfold = 0.5;
      field.drawFallback();
      assert.equal(f.fills.length, 8000);
      field.canvas.dispatch("wheel", { deltaY: -100, preventDefault() {} });
      assert.ok(field.zoom > 1);
    }),
  );
test("ceremonial opening remains slow, finishing is immediate, and interrupted matter starts where it was captured", () =>
  environment(() => {
    const f = fixture(),
      field = new GenesisField(f.canvas, identity("13"));
    field.open = true;
    field.setMode("trade");
    field.beginCreation(
      [
        {
          points: [
            [120, 220],
            [121, 220],
          ],
          arrival: 0.65,
        },
      ],
      { ceremonial: true },
    );
    field.tick(16);
    assert.ok(field.progress > 0 && field.progress < 0.01);
    assert.ok(field.unfold < 0.01);
    field.progress = 0.54;
    const before = field.currentPoint(8000);
    field.setMode("vault");
    field.beginCreation([{ points: [[290, 330]], arrival: 0.7 }]);
    assert.ok(
      Math.hypot(
        field.currentPoint(8000)[0] - before[0],
        field.currentPoint(8000)[1] - before[1],
      ) < 0.0001,
    );
    field.finishCreation();
    assert.equal(field.progress, 1);
    assert.equal(field.unfold, 1);
    field.setMode("home");
    field.progress = 0.92;
    const closing = field.currentPoint(100);
    field.captureMatter();
    assert.ok(Math.abs(field.pos[300] - closing[0]) < 0.0001);
  }));
test("identity and viewport changes notify the semantic creation coordinator", () =>
  environment((css) => {
    const f = fixture(),
      field = new GenesisField(f.canvas, identity("13"));
    let reflows = 0;
    field.onResize = () => reflows++;
    field.setIdentity(identity("ee"));
    assert.equal(reflows, 1);
    globalThis.visualViewport = {
      width: 390,
      height: 390,
      scale: 1,
      offsetTop: 10,
    };
    field.resize();
    assert.equal(reflows, 2);
    assert.equal(field.canvas.height, 390);
    assert.equal(css.get("--sa-top"), field.layout.panel.y + 10 + "px");
  }));
test("failed context restoration falls back and continues forming", () =>
  environment(() => {
    const f = fixture(),
      field = new GenesisField(f.canvas, identity("13"));
    field.open = true;
    field.setMode("trade");
    field.canvas.dispatch("webglcontextlost", { preventDefault() {} });
    f.config.failLink = true;
    field.canvas.dispatch("webglcontextrestored");
    assert.equal(field.lost, false);
    assert.equal(field.gl, null);
    field.tick(16);
    assert.equal(field.frames, 1);
  }));

test("unrestored context completes pending controls through bounded fallback", () =>
  environment(() => {
    const before = setTimeout,
      beforeClear = clearTimeout;
    let recover;
    globalThis.setTimeout = (fn) => {
      recover = fn;
      return 1;
    };
    globalThis.clearTimeout = () => {};
    try {
      const f = fixture(),
        field = new GenesisField(f.canvas, identity("13"));
      field.open = true;
      field.setMode("trade");
      let completed = false;
      field.onFormation = (p) => (completed = p === 1);
      field.canvas.dispatch("webglcontextlost", { preventDefault() {} });
      recover();
      assert.equal(field.lost, false);
      assert.equal(field.gl, null);
      assert.equal(completed, true);
      assert.equal(field.progress, 1);
    } finally {
      globalThis.setTimeout = before;
      globalThis.clearTimeout = beforeClear;
    }
  }));

test("ordinary instrument formation completes in under a second", () =>
  environment(() => {
    const field = new GenesisField(fixture().canvas, identity("13"));
    field.open = true;
    field.setMode("trade");
    field.beginCreation([{ points: [[120, 220]], arrival: 0.65 }]);
    for (let i = 1; i <= 60; i++) field.tick(i * 16);
    assert.equal(field.progress, 1);
    assert.equal(field.unfold, 1);
  }));
