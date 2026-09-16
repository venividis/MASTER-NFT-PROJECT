import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Interface } from "ethers";
import { runCurrentApp, walletFixture } from "./current-app.mjs";
import { verifyBuild } from "../../scripts/lib/runtime-graph.mjs";
import { createStaticServer } from "../../scripts/lib/static-server.mjs";

const project = path.resolve(import.meta.dirname, "../..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "anima-browser-runner-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function artifact(t, { stale = false } = {}) {
  const root = temporary(t);
  fs.mkdirSync(path.join(root, "dist"));
  fs.writeFileSync(
    path.join(root, "dist/index.html"),
    "<!doctype html><title>fixture</title>",
  );
  fs.writeFileSync(
    path.join(root, "dist/build-manifest.json"),
    JSON.stringify({
      schema: "anima.source-build/1",
      inputs: {},
      outputs: {
        "index.html": stale
          ? sha256("prior bytes")
          : sha256(fs.readFileSync(path.join(root, "dist/index.html"))),
      },
    }),
  );
  const directory = path.join(root, "contracts/artifacts");
  fs.mkdirSync(directory, { recursive: true });
  for (const name of ["IDontFuckingBelieveIt", "SovereignAccount"]) {
    fs.writeFileSync(
      path.join(directory, name + ".json"),
      JSON.stringify({
        abi: read(path.join(project, "contracts/artifacts", name + ".json"))
          .abi,
      }),
    );
  }
  return root;
}
const onlyFixtureBuild = ({ root, verifyBuild }) => verifyBuild(root);

test("wallet fixture matches the contract's named renderSnapshot ABI and independent ownership reads", () => {
  const coreABI = read(
    path.join(project, "contracts/artifacts/IDontFuckingBelieveIt.json"),
  ).abi;
  const core = new Interface(coreABI),
    fixture = walletFixture({ Interface });
  const decode = (name) =>
    core.decodeFunctionResult(
      name,
      fixture.calls[fixture.collection + ":" + core.getFunction(name).selector],
    );
  const snapshot = decode("renderSnapshot")[0];
  const source = fs.readFileSync(
    path.join(project, "contracts/src/interfaces/Interfaces.sol"),
    "utf8",
  );
  const fields = source
    .match(/struct OrganismRenderData\s*\{([^}]+)\}/)[1]
    .trim()
    .split(";")
    .filter((field) => field.trim())
    .map((field) => field.trim().split(/\s+/));
  const components = coreABI.find((item) => item.name === "renderSnapshot")
    .outputs[0].components;
  assert.deepEqual(
    components.map(({ type, name }) => [type, name]),
    fields,
    "The fixture ABI must still describe the actual Solidity struct",
  );
  assert.equal(snapshot.account, decode("accountOf")[0]);
  assert.equal(snapshot.owner, decode("ownerOf")[0]);
  assert.equal(snapshot[15], fixture.account);
  assert.equal(snapshot[16], fixture.owner);
  assert.notEqual(
    snapshot.account,
    snapshot.owner,
    "Distinct addresses detect the former reversed-field bug",
  );
  assert.equal(snapshot.tokenId, 1n);
  assert.equal(snapshot.sovereign, false);
});

test("CLI dependency failure creates a new final report without overwriting prior successful evidence", (t) => {
  const root = temporary(t),
    output = path.join(root, "evidence");
  for (const name of [
    "test/browser/current-app.mjs",
    "scripts/lib/static-server.mjs",
    "scripts/lib/compiler-artifacts.mjs",
    "scripts/lib/v4-compilation.mjs",
  ]) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.copyFileSync(path.join(project, name), path.join(root, name));
  }
  // A broken package export deterministically models a missing dependency entry.
  const packageDirectory = path.join(root, "node_modules/playwright");
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(packageDirectory, "package.json"),
    JSON.stringify({
      name: "playwright",
      type: "module",
      exports: "./missing-entry.mjs",
    }),
  );
  fs.mkdirSync(output);
  const old = JSON.stringify({ status: "passed", runId: "old-run" });
  fs.writeFileSync(path.join(output, "results.json"), old);
  fs.writeFileSync(path.join(output, "old-success.png"), "old screenshot");
  const environment = { ...process.env };
  delete environment.ANIMA_PLAYWRIGHT_MODULE;
  const invoke = () =>
    spawnSync(
      process.execPath,
      [path.join(root, "test/browser/current-app.mjs"), "--output=" + output],
      { cwd: root, env: environment, encoding: "utf8", timeout: 10000 },
    );
  const first = invoke();
  assert.equal(first.status, 1, first.stderr);
  let directories = fs
    .readdirSync(output, { withFileTypes: true })
    .filter((item) => item.isDirectory());
  assert.equal(directories.length, 1);
  const firstFile = path.join(output, directories[0].name, "results.json");
  const firstBytes = fs.readFileSync(firstFile, "utf8"),
    firstReport = JSON.parse(firstBytes);
  assert.equal(firstReport.status, "failed");
  assert.equal(firstReport.failedPhase, "dependencies");
  assert.match(firstReport.error, /Playwright is missing/);
  assert.equal(firstReport.artifact, null);
  assert.equal(firstReport.provenanceVerified, false);
  assert.equal(firstReport.cases.length, 0);
  assert.equal(firstReport.notRunCases.length, 7);
  assert.ok(firstReport.finishedAt);
  assert.match(first.stdout, /"status":"failed"/);
  const second = invoke();
  assert.equal(second.status, 1, second.stderr);
  directories = fs
    .readdirSync(output, { withFileTypes: true })
    .filter((item) => item.isDirectory());
  assert.equal(directories.length, 2);
  assert.equal(fs.readFileSync(firstFile, "utf8"), firstBytes);
  assert.equal(fs.readFileSync(path.join(output, "results.json"), "utf8"), old);
  assert.ok(
    !fs.existsSync(path.join(path.dirname(firstFile), "old-success.png")),
  );
});

test("a report exists before dependency loading and missing assets remain an explicit failed preflight", async (t) => {
  const root = temporary(t),
    output = path.join(root, "evidence");
  let initial;
  const report = await runCurrentApp({
    root,
    output,
    echo: false,
    loadDependencies: async () => {
      const directory = fs.readdirSync(output)[0];
      initial = read(path.join(output, directory, "results.json"));
      return {};
    },
  });
  assert.equal(initial.status, "running");
  assert.equal(initial.phase, "dependencies");
  assert.equal(initial.artifact, null);
  assert.equal(report.status, "failed");
  assert.equal(report.failedPhase, "artifact-preflight");
  assert.match(report.error, /ENOENT/);
  assert.equal(read(report.reportFile).status, "failed");
});

test("stale built bytes fail real build verification and persist failure evidence before any browser launches", async (t) => {
  const root = artifact(t, { stale: true });
  let launched = false;
  const before = fs.readFileSync(path.join(root, "dist/index.html"));
  const report = await runCurrentApp({
    root,
    output: path.join(root, "evidence"),
    echo: false,
    loadDependencies: async () => ({
      Interface,
      verifyBuild,
      playwright: {
        chromium: {
          launch() {
            launched = true;
            throw Error("A stale build must never launch a browser");
          },
        },
      },
    }),
    // The small fixture has no compiled program; use the real dist verifier only.
    verifyCandidate: onlyFixtureBuild,
  });
  assert.equal(launched, false);
  assert.equal(report.status, "failed");
  assert.equal(report.failedPhase, "candidate-preflight");
  assert.match(report.error, /Runtime output changed: index.html/);
  assert.equal(report.provenanceVerified, false);
  assert.equal(report.artifact.provenance, "unverified-current-build");
  assert.equal(report.cases.length, 0);
  assert.equal(read(report.reportFile).status, "failed");
  assert.deepEqual(fs.readFileSync(path.join(root, "dist/index.html")), before);
});

test("context and browser cleanup rejections cannot suppress final evidence or loopback server cleanup", async (t) => {
  const root = artifact(t);
  let server,
    closedContexts = 0,
    closedBrowser = 0;
  const fakeBrowser = {
    version: () => "Node failure-handling fixture; no real browser",
    async newContext() {
      return {
        async addInitScript() {},
        async route() {},
        async routeWebSocket() {},
        async newPage() {
          throw Error("Injected page-setup failure");
        },
        async close() {
          closedContexts++;
          throw Error("Injected context cleanup rejection");
        },
      };
    },
    async close() {
      closedBrowser++;
      throw Error("Injected browser cleanup rejection");
    },
  };
  const report = await runCurrentApp({
    root,
    output: path.join(root, "evidence"),
    echo: false,
    loadDependencies: async () => ({
      Interface,
      verifyBuild,
      playwright: {
        chromium: {
          async launch() {
            return fakeBrowser;
          },
        },
      },
    }),
    verifyCandidate: onlyFixtureBuild,
    createServer: (options) => {
      server = createStaticServer(options);
      return server;
    },
  });
  assert.equal(closedContexts, 7);
  assert.equal(closedBrowser, 1);
  assert.equal(server.listening, false);
  assert.equal(report.cases.length, 7);
  assert.ok(
    report.cases.every(
      (item) =>
        item.status === "failed" && /page-setup failure/.test(item.error),
    ),
  );
  assert.equal(report.cleanupErrors.length, 8);
  assert.equal(report.status, "failed");
  assert.equal(read(report.reportFile).cleanupErrors.length, 8);
  assert.ok(read(report.reportFile).finishedAt);
});

test("an unresponsive browser cleanup times out while server cleanup and final evidence still complete", async (t) => {
  const root = artifact(t);
  let server;
  const report = await runCurrentApp({
    root,
    output: path.join(root, "evidence"),
    echo: false,
    cleanupTimeoutMs: 30,
    loadDependencies: async () => ({
      Interface,
      verifyBuild,
      playwright: {
        chromium: {
          async launch() {
            return {
              version: () => "Node cleanup-timeout fixture; no real browser",
              async newContext() {
                throw Error("Injected context-setup failure");
              },
              close: () => new Promise(() => {}),
            };
          },
        },
      },
    }),
    verifyCandidate: onlyFixtureBuild,
    createServer: (options) => {
      server = createStaticServer(options);
      return server;
    },
  });
  assert.equal(server.listening, false);
  assert.equal(report.status, "failed");
  assert.equal(report.cleanupErrors.length, 1);
  assert.match(report.cleanupErrors[0].error, /Cleanup timed out: browser/);
  assert.equal(read(report.reportFile).phase, "finished");
});
