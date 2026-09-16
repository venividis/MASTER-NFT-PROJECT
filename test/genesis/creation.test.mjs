import test from "node:test";
import assert from "node:assert/strict";
import { attachCreation } from "../../web/genesis/creation.mjs";
// Semantic coordinator fixtures, not a browser or GPU emulator.
function fixture(run) {
  const saved = new Map(),
    queue = new Map();
  let sequence = 0,
    notify,
    mediaChange;
  const nodes = new Map();
  class Element {
    constructor(tag, id = "") {
      this.tagName = tag.toUpperCase();
      this.id = id;
      this.style = {
        removeProperty(name) {
          delete this[name];
        },
      };
      this.dataset = {};
      this.open = false;
      this.textContent = "";
      this.value = "0.1";
      this.type = "text";
      this.inertChanges = [];
      const classes = new Set();
      this.classList = {
        add: (n) => classes.add(n),
        remove: (n) => classes.delete(n),
        contains: (n) => classes.has(n),
      };
      this.rect = {
        left: 100,
        top: 180,
        width: 70,
        height: 20,
        right: 170,
        bottom: 200,
      };
    }
    set inert(v) {
      this._inert = v;
      this.inertChanges.push(v);
    }
    get inert() {
      return this._inert;
    }
    addEventListener() {}
    setAttribute(k, v) {
      this[k] = v;
    }
    removeAttribute(k) {
      delete this[k];
    }
    prepend(element) {
      this.finish = element;
      element.parentElement = this;
    }
    querySelector(s) {
      return s === ".ab-complete" ? this.finish : null;
    }
    querySelectorAll(s) {
      return s.startsWith(".ab-word")
        ? this.units || []
        : s.startsWith("button")
          ? this.buttons || []
          : [];
    }
    matches(s) {
      if (s === ":modal") return false;
      return s.split(",").includes(this.tagName.toLowerCase());
    }
    closest() {
      return null;
    }
    getBoundingClientRect() {
      return this.rect;
    }
    contains(e) {
      return (
        e === this ||
        e.parentElement === this ||
        e.parentElement?.parentElement === this
      );
    }
  }
  const p = new Element("dialog", "instrument-dialog");
  p.rect = {
    left: 70,
    top: 120,
    width: 600,
    height: 600,
    right: 670,
    bottom: 720,
  };
  nodes.set(p.id, p);
  const word = new Element("span");
  word.classList.add("ab-word");
  word.textContent = "Swap";
  word.parentElement = p;
  const input = new Element("input", "amount");
  input.parentElement = p;
  input.rect = {
    left: 100,
    top: 300,
    width: 300,
    height: 50,
    right: 400,
    bottom: 350,
  };
  const button = new Element("button");
  button.parentElement = p;
  button.rect = {
    left: 100,
    top: 390,
    width: 300,
    height: 40,
    right: 400,
    bottom: 430,
  };
  const label = new Element("span");
  label.classList.add("ab-word");
  label.textContent = "Review";
  label.parentElement = button;
  label.rect = {
    left: 130,
    top: 400,
    width: 70,
    height: 20,
    right: 200,
    bottom: 420,
  };
  p.units = [word, input, label];
  p.buttons = [button];
  const painted = [];
  const context = {
    fillText(text) {
      painted.push(text);
    },
    getImageData(_x, _y, w, h) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 3; i < data.length; i += 4) data[i] = 255;
      return { data };
    },
  };
  const document = {
    body: { dataset: {} },
    activeElement: null,
    getElementById: (id) => nodes.get(id),
    querySelector: () => null,
    createTreeWalker: () => ({ nextNode: () => false }),
    createElement: (tag) =>
      tag === "canvas" ? { getContext: () => context } : new Element(tag),
  };
  const globals = {
    document,
    window: { __instruments: { view: () => field.mode } },
    innerWidth: 1440,
    NodeFilter: { SHOW_TEXT: 4 },
    getComputedStyle: () => ({ font: "16px sans-serif" }),
    MutationObserver: class {
      constructor(fn) {
        notify = fn;
      }
      observe() {}
      disconnect() {}
      takeRecords() {}
    },
    requestAnimationFrame: (fn) => {
      queue.set(++sequence, fn);
      return sequence;
    },
    cancelAnimationFrame: (id) => queue.delete(id),
    matchMedia: () => ({ addEventListener: (_name, fn) => (mediaChange = fn) }),
  };
  for (const [k, v] of Object.entries(globals)) {
    saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    Object.defineProperty(globalThis, k, {
      value: v,
      writable: true,
      configurable: true,
    });
  }
  const field = {
    mode: "trade",
    motion: true,
    progress: 1,
    pulse: 0,
    viewport: () => ({ top: 0 }),
    setMode(mode) {
      this.mode = mode;
      this.progress = 0;
    },
    beginCreation(groups, options) {
      this.groups = groups;
      this.options = options;
      this.progress = 0;
    },
    finishCreation() {
      this.progress = 1;
      this.onFormation?.(1);
    },
  };
  const flush = () => {
    const tasks = [...queue.values()];
    queue.clear();
    tasks.forEach((fn) => fn());
  };
  try {
    attachCreation(field);
    run({
      field,
      p,
      word,
      input,
      button,
      document,
      painted,
      flush,
      notify: (records) => notify(records),
      media: (matches) => mediaChange({ matches }),
    });
  } finally {
    for (const [k, v] of saved)
      if (v) Object.defineProperty(globalThis, k, v);
      else delete globalThis[k];
  }
}
test("real words and field values produce destinations; native controls remain usable throughout formation", () =>
  fixture(({ field, p, word, input, button, flush, notify }) => {
    p.open = true;
    notify([{ type: "attributes", attributeName: "open", target: p }]);
    flush();
    assert.ok(field.groups.some((g) => g.ink && g.points.length));
    assert.ok(field.groups.some((g) => g.ink === false));
    assert.equal(word.style.opacity, "0");
    assert.equal(input.inert, false);
    assert.equal(button.inert, false);
    assert.equal(input.style.opacity, "1");
    assert.equal(field.options.quick, true);
    assert.equal(p.finish.hidden, false);
    field.creation.finish();
    assert.equal(input.inert, false);
    assert.equal(button.inert, false);
    assert.equal(word.style.opacity, undefined);
    assert.equal(p.finish.hidden, true);
  }));
test("keyboard and identity reflow preserve focused ready input without making it inert", () =>
  fixture(({ field, p, input, document, flush, notify }) => {
    p.open = true;
    notify([{ type: "attributes", attributeName: "open", target: p }]);
    flush();
    field.creation.finish();
    document.activeElement = input;
    input.inertChanges = [];
    field.onResize();
    flush();
    assert.equal(input.inertChanges.includes(true), false);
    assert.equal(document.activeElement, input);
    assert.equal(field.progress, 1);
    assert.equal(field.creation.status().forming, false);
  }));
test("input estimate updates do not restart creation; rapid route changes coalesce", () =>
  fixture(({ field, p, flush, notify }) => {
    p.open = true;
    notify([{ type: "attributes", attributeName: "open", target: p }]);
    flush();
    field.creation.finish();
    const before = field.creation.status().generation;
    notify([{ type: "childList", target: { id: "ix-estimate" } }]);
    flush();
    assert.equal(field.creation.status().generation, before);
    field.setMode("vault");
    notify([{ type: "childList", target: { id: "ix-content" } }]);
    notify([{ type: "childList", target: { id: "ix-content" } }]);
    flush();
    assert.equal(field.creation.status().forming, true);
    assert.equal(field.mode, "vault");
  }));
test("reduced motion and Original handoff leave no hidden or inert controls", () =>
  fixture(({ field, p, word, input, flush, notify, media }) => {
    p.open = true;
    notify([{ type: "attributes", attributeName: "open", target: p }]);
    flush();
    media(true);
    assert.equal(input.inert, false);
    assert.equal(field.progress, 1);
    field.setSurfaceActive(false);
    assert.equal(word.style.opacity, undefined);
    assert.equal(input.inert, false);
    p.open = false;
    notify([{ type: "attributes", attributeName: "open", target: p }]);
    flush();
    assert.equal(field.creation.status().panel, null);
  }));

test("private surfaces never rasterize recovery data or confidential text into the optical canvas", () =>
  fixture(({ p, word, input, painted, flush, notify }) => {
    word.textContent = "CONFIDENTIAL-LAUNCH";
    input.value = "SECRET-RECOVERY";
    for (const unit of [word, input])
      unit.closest = (selector) =>
        selector === "[data-private-surface]" ? p : null;
    p.open = true;
    notify([{ type: "attributes", attributeName: "open", target: p }]);
    flush();
    assert.ok(
      !painted.some(
        (text) => text.includes("CONFIDENTIAL") || text.includes("SECRET"),
      ),
    );
  }));

test("ceremonial reveal is optional and repeats stay quick without inert inputs", () =>
  fixture(({ field, p, input, flush, notify }) => {
    field.ceremonialReveal = true;
    p.open = true;
    notify([{ type: "attributes", attributeName: "open", target: p }]);
    flush();
    assert.equal(field.options.ceremonial, true);
    assert.equal(input.inert, false);
    field.creation.finish();
    p.open = false;
    notify([{ type: "attributes", attributeName: "open", target: p }]);
    flush();
    p.open = true;
    notify([{ type: "attributes", attributeName: "open", target: p }]);
    flush();
    assert.equal(field.options.ceremonial, false);
    assert.equal(field.options.quick, true);
    assert.equal(input.inert, false);
  }));
