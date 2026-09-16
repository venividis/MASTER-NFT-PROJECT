import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import {
  createSelectedContext,
  selectIdentityContext,
} from "../../web/confluence/selected-context.mjs";
import { OrganismAudio } from "../../web/audio.js";
import { dispatchOriginal } from "../../web/genesis/atlas.mjs";
import {
  PRIMARY_CAPABILITIES,
  resolveCapabilityRoute,
} from "../../web/confluence/capabilities.mjs";

const local = { seed: "local", root: "rehearsal" },
  minted = {
    seed: "mint",
    root: "mint-root",
    chainId: "1",
    collection: "0xab",
    tokenId: "1",
  },
  chain = { ...minted, root: "confirmed" };
test("one selected identity permits local life only for local preview, never chain or another visual seed", () => {
  assert.equal(selectIdentityContext({ local }).localLife, true);
  for (const input of [
    { local, minted },
    { local, minted, connected: true, snapshot: chain },
    { local, legacy: chain },
    { local, preview: "sample" },
    { local, connected: true, snapshot: { ...chain, stale: true } },
  ]) {
    const result = selectIdentityContext(input);
    assert.equal(result.localLife, false);
    assert.notEqual(result.mode, "local-preview");
  }
  assert.equal(
    selectIdentityContext({ local, legacy: chain }).source.root,
    "confirmed",
  );
  assert.equal(
    selectIdentityContext({
      local,
      connected: true,
      snapshot: { ...chain, stale: true },
    }).mode,
    "chain-stale",
  );
});
test("selection notifications react to identity changes once and cannot mutate authority through a subscriber", () => {
  const store = createSelectedContext(),
    seen = [];
  const unsubscribe = store.subscribe((x) => seen.push(x));
  store.update({ local });
  store.update({ local: { ...local } });
  assert.equal(seen.length, 1);
  store.update({ local, connected: true, snapshot: chain });
  assert.equal(seen.length, 2);
  assert.ok(Object.isFrozen(store.get().source));
  unsubscribe();
  store.update({ local });
  assert.equal(seen.length, 2);
});
test("memory renderer drops local deformation immediately when chain selection appears, even with legacy disconnected", () => {
  const renderer = { dirty: false, lastJob: 1 },
    state = { root: "local" },
    original = {
      renderer,
      chain: () => null,
      state: () => state,
      world: () => ({ state }),
    };
  let context = { localLife: true };
  const descriptor = { root: "traces", traits: Array(8).fill(0.75), count: 4 };
  const badge = { addEventListener() {} };
  const sandbox = {
    window: {
      __idfbi: original,
      __animaSelection: { get: () => context },
      addEventListener() {},
    },
    ixEngine: { mem: { origin: "origin", start: 0 }, form: () => descriptor },
    W: () => ({ s: { selected: 1, head: "head", seq: 4 } }),
    memFormThrough: null,
    memFormOriginal: false,
    ix$: () => badge,
    document: { addEventListener() {} },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(
      new URL("../../web/memory/renderer-bridge.js", import.meta.url),
      "utf8",
    ),
    sandbox,
  );
  vm.runInContext("memorySyncField();lifeCurrent=lifeTarget.slice()", sandbox);
  assert.equal(vm.runInContext("lifeCurrent[0]", sandbox), 0.75);
  context = { localLife: false };
  vm.runInContext("memorySyncField()", sandbox);
  assert.equal(vm.runInContext("lifeCurrent.reduce((a,b)=>a+b,0)", sandbox), 0);
  assert.equal(vm.runInContext("lifeTarget.reduce((a,b)=>a+b,0)", sandbox), 0);
  assert.equal(badge.hidden, true);
});
test("normal navigation resolves to coherent workflows and retains seven consistent names", () => {
  assert.deepEqual(
    PRIMARY_CAPABILITIES.map((x) => x.label),
    ["Swap", "Launch", "Vault", "Memory", "Commons", "Worlds", "Atlas"],
  );
  assert.equal(resolveCapabilityRoute("journal"), "memory");
  assert.equal(resolveCapabilityRoute("trade"), "v4");
  assert.equal(resolveCapabilityRoute("vault"), "live");
  assert.equal(resolveCapabilityRoute("agents"), "agents");
});

test("original mutations cannot apply a local rehearsal to a selected chain NFT", async () => {
  const prior = globalThis.window;
  globalThis.window = {
    __animaSelection: {
      get: () => ({ localLife: false, mode: "confirmed-chain", source: chain }),
    },
    __idfbi: { chain: () => null },
  };
  try {
    await assert.rejects(
      dispatchOriginal("memory", {
        document: {
          querySelector: () => ({
            click() {
              throw Error("must not click");
            },
          }),
        },
        close: async () => {},
        home() {},
      }),
      /different client context/,
    );
  } finally {
    if (prior === undefined) delete globalThis.window;
    else globalThis.window = prior;
  }
});

test("the shared sound engine resolves the selected NFT instead of a local rehearsal and supplies complete sound inputs", () => {
  const previous = globalThis.window;
  globalThis.window = {
    __animaSelection: {
      get: () => ({
        mode: "confirmed-chain",
        source: {
          seed: "chain-seed",
          genome: "chain-genome",
          root: "chain-root",
        },
      }),
    },
  };
  try {
    const audio = new OrganismAudio();
    const chosen = audio.identity({
      seed: "local-seed",
      genome: "local-genome",
      memory: "local-memory",
      audit: "local-audit",
    });
    assert.equal(chosen.genome, "chain-genome");
    assert.equal(chosen.memory, "chain-root");
    assert.equal(chosen.audit, "chain-root");
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
