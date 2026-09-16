import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import {
  discoverModules,
  archiveModule,
  moduleReferences,
  atomicDirectory,
  listFiles,
  hashFiles,
  verifyBuild,
} from "../../scripts/lib/runtime-graph.mjs";
import {
  composeRuntime,
  compileInstruments,
  APPROVED_SHA256,
} from "../../scripts/lib/runtime-build.mjs";
import {
  parse,
  elements,
  attr,
  textContent,
} from "../../scripts/lib/runtime-html.mjs";
const root = path.resolve(import.meta.dirname, "../..");
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anima-build-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function write(root, name, body) {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), body);
}

test("module closure includes side effects, reexports, literal dynamic imports and cycles; ignores comments", async (t) => {
  const dir = fixture(t);
  write(
    dir,
    "web/main.js",
    `import './effect.js'; export {value} from './value.mjs'; export const later=()=>import('./late.mjs'); // from './ghost.mjs'\n`,
  );
  write(dir, "web/effect.js", `import './main.js';globalThis.seen=true;`);
  write(dir, "web/value.mjs", "export const value=4;");
  write(dir, "web/late.mjs", `export {value} from './value.mjs';`);
  const graph = await discoverModules(dir, ["web/main.js"]);
  assert.deepEqual(Object.keys(graph), [
    "web/effect.js",
    "web/late.mjs",
    "web/main.js",
    "web/value.mjs",
  ]);
  const rewritten = await archiveModule(
    fs.readFileSync(path.join(dir, "web/main.js"), "utf8"),
    "web/main.js",
  );
  assert.deepEqual(
    (await moduleReferences(rewritten, "recovered")).map((ref) => ref.n),
    ["awe/web/effect.js", "awe/web/value.mjs", "awe/web/late.mjs"],
  );
});
test("module closure rejects computed imports, missing dependencies and root escapes", async (t) => {
  const dir = fixture(t);
  write(dir, "web/main.js", `export const run=p=>import(p);`);
  await assert.rejects(discoverModules(dir, ["web/main.js"]), /literal paths/);
  write(dir, "web/main.js", `import './missing.js';`);
  await assert.rejects(discoverModules(dir, ["web/main.js"]), /ENOENT/);
  write(dir, "web/main.js", `import '../../outside.js';`);
  await assert.rejects(
    discoverModules(dir, ["web/main.js"]),
    /Unsupported runtime module/,
  );
});
test("atomic replacement removes stale files, preserves old output on generation failure", async (t) => {
  const dir = fixture(t),
    target = path.join(dir, "dist");
  write(target, "stale.js", "old");
  await assert.rejects(
    atomicDirectory(target, async (stage) => {
      write(stage, "new.js", "new");
      throw Error("compile failure");
    }),
    /compile failure/,
  );
  assert.deepEqual(listFiles(target), ["stale.js"]);
  await atomicDirectory(target, async (stage) => write(stage, "new.js", "new"));
  assert.deepEqual(listFiles(target), ["new.js"]);
  assert.deepEqual(fs.readdirSync(dir), ["dist"]);
});
test("source freshness rejects source edits, output edits and orphaned files", (t) => {
  const dir = fixture(t),
    dist = path.join(dir, "dist");
  write(dir, "web/main.js", "source");
  write(dist, "main.js", "compiled");
  write(
    dist,
    "build-manifest.json",
    JSON.stringify({
      schema: "anima.source-build/1",
      inputs: hashFiles(dir, ["web/main.js"]),
      outputs: hashFiles(dist, ["main.js"]),
    }),
  );
  verifyBuild(dir);
  write(dir, "web/main.js", "changed");
  assert.throws(() => verifyBuild(dir), /Build source changed/);
  write(dir, "web/main.js", "source");
  write(dist, "main.js", "changed");
  assert.throws(() => verifyBuild(dir), /Runtime output changed/);
  write(dist, "main.js", "compiled");
  write(dist, "orphan.js", "old");
  assert.throws(() => verifyBuild(dir), /Unexpected runtime outputs/);
});
test("current source composition pins optical assets and uses current original-wallet source", async () => {
  const result = await composeRuntime(root),
    document = parse(result.html);
  assert.equal(result.preservation.referenceSha256, APPROVED_SHA256);
  assert.ok(result.inputs.includes("web/evm.mjs"));
  assert.ok(result.inputs.includes("web/app.js"));
  for (const stylesheet of ["web/launchpad/studio.css", "web/launchpad/desk.css"]) {
    assert.ok(result.inputs.includes(stylesheet));
    assert.ok(elements(document, (n) => n.tagName === "link" && attr(n, "href") === stylesheet).length === 1);
  }
  assert.ok(
    !result.inputs.some((name) => /preview\.html|four-chambers/.test(name)),
  );
  const runtime = elements(
    document,
    (n) => n.tagName === "script" && attr(n, "id") === "original-runtime",
  );
  assert.equal(runtime.length, 1);
  assert.match(textContent(runtime[0]), /lockSigningSession/);
  assert.match(textContent(runtime[0]), /This edition is already minted/);
  const base = fs.readFileSync(
    path.join(root, "web/reference/approved-1.2.html"),
    "utf8",
  );
  assert.notEqual(result.html, base);
});
test("minted runtime module closure contains the launchpad clients and deployable contract artifacts", async () => {
  const graph = await discoverModules(root, ["web/confluence/app.js"]);
  for (const name of [
    "desk", "studio", "model", "chain", "deployments", "hook-client", "hook-artifacts",
    "sale-client", "sale-artifacts", "auction-client", "auction-artifacts",
  ]) assert.ok(graph[`web/launchpad/${name}.mjs`], `Missing launchpad archive module: ${name}`);
});
test("model imports compile as ESM and controller boot registers one shared frame callback", async () => {
  const { code, inputs } = await compileInstruments(root);
  assert.ok(inputs.includes("web/memory/engine.mjs"));
  const subscriptions = new Set(),
    context = {
      window: { __animaFrameSubscribers: subscriptions, addEventListener() {} },
      document: { addEventListener() {} },
      setInterval() {
        return 1;
      },
      clearInterval() {},
      TextEncoder,
      TextDecoder,
      console,
    };
  vm.runInNewContext(code, context);
  assert.equal(subscriptions.size, 1);
});

test("release packages keep authored inputs and required v4 dependencies, archive donor trees and omit test bundles from runtime", async () => {
  const { selectReleasePackages } = await import(
    "../../scripts/lib/release-packages.mjs"
  );
  const selected = selectReleasePackages([
    "web/app.js",
    "release.stage-interrupted/ANIMA-source.zip",
    "release.previous-123/ANIMA-reference.zip",
    "release/ANIMA-runtime.zip",
    "web/reference/approved-1.2.html",
    "integrations/dave/README.md",
    "integrations/console/protocol/v4-hook/vendor/v4-core/docs/security/audits/audit.pdf",
    "integrations/console/protocol/v4-hook/src/Hook.sol",
    "integrations/console/protocol/fee-router/src/OwnerFeeRouter.sol",
    "integrations/console/protocol/fee-router/scripts/compile.cjs",
    "integrations/console/protocol/fee-router/artifacts/OwnerFeeRouter.json",
    "web/kingdom/bundle.check.js",
    "contracts/artifacts/MockToken.json",
    "docs/old.md",
    "reports/old.png",
    "dist/index.html",
    "dist/web/confluence/app.js",
    "onchain-app/confluence/runtime.html",
    "onchain-app/privacy-worker/manifest.json",
  ]);
  assert.ok(selected.source.includes("web/app.js"));
  for (const files of Object.values(selected))
    assert.ok(!files.some((name) => name.startsWith("release")));
  assert.ok(selected.source.includes("web/reference/approved-1.2.html"));
  assert.ok(
    selected.source.includes(
      "integrations/console/protocol/v4-hook/src/Hook.sol",
    ),
  );
  assert.ok(!selected.source.includes("integrations/dave/README.md"));
  assert.ok(selected.source.includes("integrations/console/protocol/fee-router/src/OwnerFeeRouter.sol"));
  assert.ok(selected.source.includes("integrations/console/protocol/fee-router/scripts/compile.cjs"));
  assert.ok(!selected.source.includes("integrations/console/protocol/fee-router/artifacts/OwnerFeeRouter.json"));
  assert.ok(selected.reference.includes("integrations/dave/README.md"));
  assert.ok(selected.reference.includes("docs/old.md"));
  assert.ok(!selected.source.some((name) => name.endsWith("audit.pdf")));
  assert.ok(selected.reference.some((name) => name.endsWith("audit.pdf")));
  assert.deepEqual(selected.runtime, [
    "dist/index.html",
    "dist/web/confluence/app.js",
    "onchain-app/confluence/runtime.html",
    "onchain-app/privacy-worker/manifest.json",
  ]);
  assert.ok(!selected.source.some((name) => name.endsWith("bundle.check.js")));
  assert.ok(
    !selected.reference.some((name) =>
      name.startsWith("onchain-app/privacy-worker/"),
    ),
  );
});
