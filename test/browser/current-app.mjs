#!/usr/bin/env node
/** Current dist browser regression. No deployment, credentials or real RPC. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { once } from "node:events";
import { createStaticServer } from "../../scripts/lib/static-server.mjs";
import { verifyCompilation } from "../../scripts/lib/compiler-artifacts.mjs";
import { verifyV4Compilation } from "../../scripts/lib/v4-compilation.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OWNER = "0x" + "11".repeat(20);
const COLLECTION = "0x" + "22".repeat(20);
const ACCOUNT = "0x" + "33".repeat(20);
const TARGET = "0x" + "44".repeat(20);
const CHAIN = "0x7a69"; // 31337: deterministic simulated RPC, no node or funds.
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function artifactIdentity(root) {
  return {
    entry: "dist/index.html",
    htmlSha256: hash(fs.readFileSync(path.join(root, "dist/index.html"))),
    buildManifestSha256: hash(
      fs.readFileSync(path.join(root, "dist/build-manifest.json")),
    ),
  };
}

/** Encode fixture results with the real ABI codec, independently of page globals. */
export function walletFixture({ Interface, root = ROOT }) {
  const abi = (name) =>
    JSON.parse(
      fs.readFileSync(
        path.join(root, "contracts/artifacts", name + ".json"),
        "utf8",
      ),
    ).abi;
  const core = new Interface(abi("IDontFuckingBelieveIt"));
  const account = new Interface(abi("SovereignAccount"));
  const calls = {};
  const result = (address, iface, name, values) => {
    calls[address + ":" + iface.getFunction(name).selector] =
      iface.encodeFunctionResult(name, values);
  };
  result(COLLECTION, core, "ownerOf", [OWNER]);
  result(COLLECTION, core, "accountOf", [ACCOUNT]);
  result(COLLECTION, core, "renderSnapshot", [
    {
      tokenId: 1,
      ...Object.fromEntries(
        [
          "seed",
          "genome",
          "stateRoot",
          "memoryRoot",
          "lineageRoot",
          "auditRoot",
          "constitutionHash",
        ].map((name, i) => [name, "0x" + String(i + 1).repeat(64)]),
      ),
      bornAt: 0,
      evolvedAt: 0,
      generation: 0,
      evolutions: 0,
      parentId: 0,
      actionNonce: 0,
      sovereign: false,
      account: ACCOUNT,
      owner: OWNER,
    },
  ]);
  result(ACCOUNT, account, "mode", [0]);
  result(ACCOUNT, account, "sessionEpoch", [0]);
  result(ACCOUNT, account, "execute", ["0x"]);
  return {
    owner: OWNER,
    account: ACCOUNT,
    collection: COLLECTION,
    chain: CHAIN,
    calls,
  };
}

// Runs before the application. This context has no actual wallet or secrets.
function injectFixture({ scenario, fixture }) {
  const probe = { calls: [], unexpected: [] };
  Object.defineProperty(window, "__animaBrowserProbe", { value: probe });
  if (scenario === "absent") {
    Object.defineProperty(window, "ethereum", {
      value: undefined,
      configurable: false,
    });
    return;
  }
  const listeners = new Map();
  const reject = (message) => {
    const error = new Error(message);
    error.code = 4001;
    throw error;
  };
  Object.defineProperty(window, "ethereum", {
    configurable: false,
    value: {
      on(name, callback) {
        const set = listeners.get(name) || new Set();
        set.add(callback);
        listeners.set(name, set);
      },
      removeListener(name, callback) {
        listeners.get(name)?.delete(callback);
      },
      async request({ method, params = [] }) {
        probe.calls.push({ method, params });
        if (method === "eth_requestAccounts") {
          if (scenario === "reject-connect")
            return reject(
              "User rejected the connection request (browser test fixture).",
            );
          return [fixture.owner];
        }
        if (method === "eth_accounts") return [fixture.owner];
        if (method === "eth_chainId") return fixture.chain;
        if (method === "eth_blockNumber") return "0x10";
        if (method === "eth_getCode") return "0x60006000f3";
        if (method === "eth_getBalance") return "0xde0b6b3a7640000";
        if (method === "eth_estimateGas") return "0x186a0";
        if (method === "eth_getTransactionCount") return "0x0";
        if (method === "eth_gasPrice" || method === "eth_maxPriorityFeePerGas")
          return "0x3b9aca00";
        if (method === "eth_sendTransaction")
          return reject(
            "User rejected the transaction signature (browser test fixture).",
          );
        if (method === "eth_call") {
          const call = params[0];
          const key =
            String(call.to).toLowerCase() +
            ":" +
            String(call.data).slice(0, 10);
          if (fixture.calls[key] !== undefined) return fixture.calls[key];
        }
        probe.unexpected.push({ method, params });
        const error = new Error("Unexpected browser fixture RPC: " + method);
        error.code = -32601;
        throw error;
      },
    },
  });
}

async function assertText(page, selector, pattern) {
  await page.waitForFunction(
    ({ selector, source, flags }) => {
      return new RegExp(source, flags).test(
        document.querySelector(selector)?.textContent || "",
      );
    },
    { selector, source: pattern.source, flags: pattern.flags },
  );
}

async function waitMode(page, mode) {
  await page.waitForFunction(
    (mode) => window.__confluence?.mode() === mode,
    mode,
  );
}

export async function openAtlas(page) {
  // The phone navigation remains available while the desktop dock is hidden.
  const entry = page.locator('.prism-mobile-nav [data-cf="atlas"]');
  if (await entry.isVisible()) await entry.click();
  else await page.locator('.cf-dock [data-cf="atlas"]').click();
  await waitMode(page, "atlas");
  await assertText(page, "#cf-dialog-title", /^Atlas$/);
}

async function route(page, key, mode = key) {
  await openAtlas(page);
  await page
    .locator('#cf-content .prism-atlas-group [data-do="nav:' + key + '"]')
    .click();
  await waitMode(page, mode);
}

async function openDeveloperConsole(page) {
  await openAtlas(page);
  await page.locator('#cf-content .prism-atlas-group [data-do="nav:advanced"]').click();
  await waitMode(page, "advanced");
  await page.locator('#cf-content > .cf-atlas [data-do="nav:agents"]').click();
  await waitMode(page, "agents");
  await page.locator("#cf-execute-form").waitFor({ state: "visible" });
}

async function openConnect(page) {
  await openAtlas(page);
  await page.locator('#cf-content .prism-atlas-group [data-do="nav:connect"]').click();
  await waitMode(page, "connect");
  await page.locator("#cf-collection").fill(COLLECTION);
  await page.locator("#cf-token").fill("1");
}

async function prepareAccountCall(page) {
  await page.locator("#cf-target").fill(TARGET);
  await page.locator("#cf-value").fill("0");
  await page.locator("#cf-calldata").fill("0x");
  await page.locator('#cf-execute-form button[type="submit"]').click();
  await assertText(page, "#cf-transaction-review", /Review before signing/);
}

async function readProbe(page) {
  return page.evaluate(() => structuredClone(window.__animaBrowserProbe));
}

async function chainReceipts(page) {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.endsWith(":chain-receipts"))
      .sort()
      .map((key) => [key, localStorage.getItem(key)]),
  );
}

async function assertViewport(page) {
  const layout = await page.evaluate(() => {
    const d = document.querySelector("#cf-dialog");
    const r = d.getBoundingClientRect();
    return {
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      dialog: { x: r.x, right: r.right, width: r.width, height: r.height },
    };
  });
  assert(
    layout.scroll <= layout.width + 1,
    "The document overflows horizontally: " + JSON.stringify(layout),
  );
  assert(
    layout.dialog.width > 0 && layout.dialog.height > 0,
    "The instrument is not laid out",
  );
  assert(
    layout.dialog.x >= -1 && layout.dialog.right <= layout.width + 1,
    "The instrument extends outside the viewport: " + JSON.stringify(layout),
  );
}

async function navigationCase(page, capture) {
  assert.equal(await page.title(), "ANIMA · Prism Cathedral");
  await page.waitForFunction(() => window.__idfbi.renderer.frames > 0);
  await page.locator('.prism-home-actions [data-cf="interior"]').waitFor({ state: "visible" });
  const initial = await page.evaluate(() => ({
    seed: window.__idfbi.state().seed,
    audit: window.__idfbi.world().state.audit,
    identity: window.__confluence.identity().domain,
    backend: window.__idfbi.renderer.backend,
    canvas: [
      document.querySelector("#organism").width,
      document.querySelector("#organism").height,
    ],
  }));
  assert(
    initial.canvas.every((n) => n > 0),
    "Original canvas has no render area",
  );
  assert.match(
    initial.backend,
    /wasm|webgl/i,
    "Original optical renderer did not initialize",
  );
  await capture("prism-home");

  await page.locator('.prism-home-actions [data-cf="interior"]').click();
  await page.waitForFunction(
    () =>
      window.__confluence.interior.active &&
      !window.__confluence.interior.target,
  );
  const entered = await page.evaluate(
    () => window.__confluence.interior.camera.z,
  );
  await page.locator("#atmosphere").press("+");
  await page.waitForFunction(
    (before) => window.__confluence.interior.camera.z > before + 0.01,
    entered,
  );
  await page.waitForFunction(
    () =>
      Math.abs(
        window.__confluence.interior.camera.z -
          window.__confluence.interior.desiredCamera.z,
      ) < 0.0001,
  );
  const inside = await page.evaluate(
    () => window.__confluence.interior.desiredCamera.z,
  );
  await capture("interior");
  await openAtlas(page);
  if (await page.locator('.prism-mobile-nav').isVisible())
    assert.deepEqual(await page.locator('.prism-mobile-nav [data-cf]').allTextContents(), ['Home', 'Tools', 'Memory', 'Atlas']);
  await page.waitForFunction(
    () =>
      !window.__confluence.interior.active &&
      !!window.__confluence.interior.savedCamera,
  );
  await page.locator("#cf-close").click();
  await page.waitForFunction(() => window.__confluence.interior.active);
  assert(
    Math.abs(
      (await page.evaluate(() => window.__confluence.interior.camera.z)) -
        inside,
    ) < 0.03,
    "Closing a function lost the interior camera position",
  );
  await page.locator("#atmosphere").press("Escape");
  await page.waitForFunction(
    () =>
      !window.__confluence.interior.active &&
      !window.__confluence.interior.savedCamera,
  );

  await openAtlas(page);
  assert.deepEqual(await page.locator(".cf-dock [data-cf]").allTextContents(), [
    "Swap",
    "Launch",
    "Vault",
    "Memory",
    "Commons",
    "Worlds",
    "Atlas",
  ]);
  const instruments = [
    ["trade", "v4", /Shielded v4 exchange/],
    ["launch", "launch", /^Launch$/],
    ["vault", "live", /Onchain instruments/],
    ["memory", "memory", /^Memory$/],
    ["world", "commons", /^Commons$/],
    ["cartridges", "cartridges", /^Worlds$/],
  ];
  for (const [key, mode, title] of instruments) {
    await route(page, key, mode);
    await assertText(page, "#cf-dialog-title", title);
    await assertViewport(page);
    await capture(key);
  }
  const final = await page.evaluate(() => ({
    seed: window.__idfbi.state().seed,
    audit: window.__idfbi.world().state.audit,
    identity: window.__confluence.identity().domain,
  }));
  assert.deepEqual(
    final,
    { seed: initial.seed, audit: initial.audit, identity: initial.identity },
    "Navigation changed the original identity or audit history",
  );
  return {
    backend: initial.backend,
    instruments: instruments.map(([key]) => key),
  };
}

async function absentWalletCase(page) {
  await openConnect(page);
  assert.deepEqual((await readProbe(page)).calls, []);
  await page.locator('#cf-connect-form button[type="submit"]').click();
  await assertText(page, "#cf-notice", /No injected wallet found/);
  assert.equal(
    await page.evaluate(() => window.__confluence.wallet.connected),
    false,
  );
  await openDeveloperConsole(page);
  await page.locator("#cf-target").fill(TARGET);
  await page.locator('#cf-execute-form button[type="submit"]').click();
  await assertText(page, "#cf-notice", /Connect an owned NFT first/);
  assert.equal(await page.locator('[data-do="send-call"]').count(), 0);
  assert.equal(
    await page.evaluate(() => window.__confluence.wallet.plan == null),
    true,
  );
  assert.deepEqual(await chainReceipts(page), []);
}

async function rejectedConnectionCase(page) {
  await openConnect(page);
  assert.deepEqual((await readProbe(page)).calls, []);
  await page.locator('#cf-connect-form button[type="submit"]').click();
  await assertText(page, "#cf-notice", /User rejected the connection/);
  assert.equal(
    await page.evaluate(() => window.__confluence.wallet.connected),
    false,
  );
  assert.deepEqual(
    (await readProbe(page)).calls.map((call) => call.method),
    ["eth_requestAccounts"],
  );
  assert.deepEqual(await chainReceipts(page), []);
}

async function rejectedTransactionCase(page, capture) {
  await openConnect(page);
  assert.deepEqual(
    (await readProbe(page)).calls,
    [],
    "Opening Connect requested wallet access",
  );
  await page.locator('#cf-connect-form button[type="submit"]').click();
  await assertText(page, "#cf-notice", /Owner verified at block 16/);
  await openDeveloperConsole(page);
  const receiptsBefore = await chainReceipts(page);
  await prepareAccountCall(page);
  const review = await page.locator("#cf-transaction-review").innerText();
  for (const value of [ACCOUNT, TARGET, "31337", "100000"])
    assert(
      review.toLowerCase().includes(value.toLowerCase()),
      "Review omits exact term: " + value,
    );
  assert.equal(
    (await readProbe(page)).calls.some(
      (call) => call.method === "eth_sendTransaction",
    ),
    false,
    "Review sent a transaction before the explicit signature request",
  );
  await capture("transaction-review-fixture");
  await page.locator('[data-do="cancel-call"]').click();
  await page.waitForFunction(() => window.__confluence.wallet.plan == null);
  assert.equal(await page.locator('[data-do="send-call"]').count(), 0);
  assert.deepEqual(await chainReceipts(page), receiptsBefore);

  await prepareAccountCall(page);
  await page.locator('[data-do="send-call"]').click();
  await assertText(page, "#cf-notice", /reject|denied/i);
  let probe = await readProbe(page);
  assert.equal(
    probe.calls.filter((call) => call.method === "eth_sendTransaction").length,
    1,
  );
  assert.equal(
    await page.evaluate(() => window.__confluence.wallet.plan == null),
    true,
  );
  assert.deepEqual(
    await chainReceipts(page),
    receiptsBefore,
    "Rejected signature created an onchain receipt",
  );
  await capture("transaction-rejected-fixture");
  // A lingering review button must never replay the rejected plan.
  await page.locator('[data-do="send-call"]').click();
  await assertText(page, "#cf-notice", /review expired or changed/i);
  probe = await readProbe(page);
  assert.equal(
    probe.calls.filter((call) => call.method === "eth_sendTransaction").length,
    1,
  );
  assert.deepEqual(
    probe.unexpected,
    [],
    "RPC fixture was insufficient; this is not a valid browser pass",
  );
}

async function rehearsalCase(page) {
  await openAtlas(page);
  await page.locator('.prism-atlas-group [data-do="nav:advanced"]').click();
  await waitMode(page, "advanced");
  await page.getByText("Local economic rehearsals", { exact: true }).click();
  await page.locator('[data-do="nav:rehearsal:trade"]').click();
  await page.locator("#ix-trade-form").waitFor({ state: "visible" });
  await assertText(page, "#instrument-dialog .ix-eyebrow", /LOCAL REHEARSAL/);
  const state = () =>
    page.evaluate(() => ({
      checksum: window.__instruments.engine().export().checksum,
      audit: window.__idfbi.world().state.audit,
    }));
  const before = await state();
  await page.locator('#ix-trade-form button[type="submit"]').click();
  await page.locator('[data-act="confirm"]').waitFor({ state: "visible" });
  await assertText(page, "#ix-content", /Minimum received/);
  assert.deepEqual(
    await state(),
    before,
    "Opening the review changed funds or history",
  );
  await page.locator('[data-act="cancel-review"]').click();
  assert.deepEqual(
    await state(),
    before,
    "Cancelling the review changed funds or history",
  );
  assert.deepEqual(await chainReceipts(page), []);
  assert.deepEqual((await readProbe(page)).calls, []);
}

const SCENARIOS = [
  {
    name: "navigation-desktop",
    viewport: { width: 1440, height: 1000 },
    run: navigationCase,
  },
  {
    name: "navigation-phone-emulation",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    run: navigationCase,
  },
  {
    name: "navigation-landscape-emulation",
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    run: navigationCase,
  },
  { name: "wallet-absent", run: absentWalletCase },
  {
    name: "wallet-connection-rejected-fixture",
    scenario: "reject-connect",
    run: rejectedConnectionCase,
  },
  {
    name: "wallet-review-cancel-reject-fixture",
    scenario: "reject-transaction",
    run: rejectedTransactionCase,
  },
  { name: "local-rehearsal-review-cancel", run: rehearsalCase },
];

export async function loadBrowserDependencies({
  modulePath = process.env.ANIMA_PLAYWRIGHT_MODULE,
} = {}) {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch (error) {
    if (!modulePath)
      throw new Error(
        "Playwright is missing. Install the pinned browser dependency and Chromium; see test/browser/README.md.",
        { cause: error },
      );
    playwright = await import(pathToFileURL(path.resolve(modulePath)).href);
  }
  const { Interface } = await import("ethers");
  const { verifyBuild } = await import("../../scripts/lib/runtime-graph.mjs");
  return { playwright, Interface, verifyBuild };
}

function verifyCurrentCandidate({ root, verifyBuild }) {
  verifyCompilation(root);
  verifyV4Compilation(root);
  verifyBuild(root);
}

const errorText = (error) => error?.stack || String(error);

/** Dependency hooks exercise failure handling in Node tests; the CLI uses defaults. */
export async function runCurrentApp({
  root = ROOT,
  output = path.join(root, "reports/production/browser"),
  suppliedDist = false,
  loadDependencies = loadBrowserDependencies,
  verifyCandidate = verifyCurrentCandidate,
  createServer = createStaticServer,
  cleanupTimeoutMs = 7000,
  echo = true,
} = {}) {
  fs.mkdirSync(output, { recursive: true });
  const directory = fs.mkdtempSync(
    path.join(output, new Date().toISOString().replace(/[:.]/g, "-") + "-"),
  );
  const reportFile = path.join(directory, "results.json");
  const report = {
    schema: "anima.browser-regression/2",
    runId: path.basename(directory),
    reportFile,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    phase: "initializing",
    artifact: null,
    requestedProvenance: suppliedDist
      ? "supplied-dist-only"
      : "verified-current-build",
    provenanceVerified: false,
    scope:
      "Chromium desktop and emulated viewports; isolated local app; deterministic rejecting wallet fixture",
    exclusions: [
      "physical phones",
      "real wallets",
      "real EVM execution",
      "external services",
      "production deployment",
      "visual beauty approval",
    ],
    plannedCases: SCENARIOS.map(({ name }) => name),
    cases: [],
    cleanupErrors: [],
    dependencyHooksInjected:
      loadDependencies !== loadBrowserDependencies ||
      verifyCandidate !== verifyCurrentCandidate ||
      createServer !== createStaticServer,
  };
  const write = () => {
    const temporary = reportFile + ".tmp";
    fs.writeFileSync(temporary, JSON.stringify(report, null, 2) + "\n");
    fs.renameSync(temporary, reportFile);
  };
  // This first checkpoint precedes every dependency import and artifact read.
  write();
  if (echo) console.log("Browser regression evidence: " + reportFile);
  const phase = (name) => {
    report.phase = name;
    write();
  };
  const cleanup = async (name, action, item) => {
    let timer;
    try {
      await Promise.race([
        Promise.resolve().then(action),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error("Cleanup timed out: " + name)),
            cleanupTimeoutMs,
          );
        }),
      ]);
    } catch (error) {
      const failure = { resource: name, error: errorText(error) };
      report.cleanupErrors.push(failure);
      if (item) {
        item.status = "failed";
        (item.cleanupErrors ??= []).push(failure);
      }
    } finally {
      clearTimeout(timer);
    }
  };
  let server, browser;
  try {
    phase("dependencies");
    const dependencies = await loadDependencies();
    phase("artifact-preflight");
    const provenance = artifactIdentity(root);
    report.artifact = {
      ...provenance,
      provenance: suppliedDist
        ? "supplied-dist-only"
        : "unverified-current-build",
    };
    phase("candidate-preflight");
    if (!suppliedDist) {
      await verifyCandidate({ root, verifyBuild: dependencies.verifyBuild });
      report.artifact.provenance = "verified-current-build";
      report.provenanceVerified = true;
    }
    phase("wallet-fixture");
    const fixture = walletFixture({ Interface: dependencies.Interface, root });
    phase("server-start");
    server = createServer({ directory: path.join(root, "dist") });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = "http://127.0.0.1:" + server.address().port;
    phase("browser-launch");
    browser = await dependencies.playwright.chromium.launch({ headless: true });
    report.browserVersion = browser.version();
    phase("browser-cases");
    for (const scenario of SCENARIOS) {
      const item = {
        name: scenario.name,
        status: "running",
        pageErrors: [],
        consoleErrors: [],
        externalRequests: [],
        failedRequests: [],
        httpErrors: [],
      };
      report.cases.push(item);
      write();
      let context, page;
      const capture = (name) =>
        page.screenshot({
          path: path.join(directory, scenario.name + "-" + name + ".png"),
          fullPage: false,
          // Headless software WebGL and font readiness can exceed five seconds.
          // Capture remains required and failures still fail their scenario.
          timeout: 30000,
        });
      try {
        context = await browser.newContext({
          viewport: scenario.viewport || { width: 1440, height: 1000 },
          isMobile: scenario.isMobile || false,
          hasTouch: scenario.hasTouch || false,
          reducedMotion: "reduce",
          serviceWorkers: "block",
        });
        await context.addInitScript(injectFixture, {
          scenario: scenario.scenario || "absent",
          fixture,
        });
        await context.route("**/*", (route) => {
          const url = route.request().url();
          if (new URL(url).origin === origin || /^(data|blob):/.test(url))
            return route.continue();
          item.externalRequests.push(url);
          return route.abort("blockedbyclient");
        });
        await context.routeWebSocket("**/*", (socket) => {
          item.externalRequests.push(socket.url());
          socket.close({
            code: 1008,
            reason: "No service connections in local browser smoke",
          });
        });
        page = await context.newPage();
        page.setDefaultTimeout(30000);
        page.on("pageerror", (error) => item.pageErrors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error")
            item.consoleErrors.push(message.text());
        });
        page.on("requestfailed", (request) =>
          item.failedRequests.push({
            url: request.url(),
            error: request.failure()?.errorText,
          }),
        );
        page.on("response", (response) => {
          if (response.status() >= 400)
            item.httpErrors.push({
              url: response.url(),
              status: response.status(),
            });
        });
        await page.goto(origin, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () => document.body.dataset.confluenceReady === "true",
        );
        item.details = await scenario.run(page, capture);
        assert.deepEqual(item.pageErrors, [], "Uncaught page error");
        assert.deepEqual(item.consoleErrors, [], "Browser console error");
        assert.deepEqual(
          item.externalRequests,
          [],
          "A disconnected local workflow initiated external traffic",
        );
        assert.deepEqual(
          item.failedRequests,
          [],
          "An application resource failed to load",
        );
        assert.deepEqual(
          item.httpErrors,
          [],
          "An application resource returned HTTP error",
        );
        assert.deepEqual(
          (await readProbe(page)).unexpected,
          [],
          "Unexpected RPC fixture method",
        );
        item.status = "passed";
      } catch (error) {
        item.status = "failed";
        item.error = errorText(error);
        if (page)
          await capture("failure").catch((error) => {
            item.screenshotError = errorText(error);
          });
      } finally {
        if (context)
          await cleanup(
            "context:" + scenario.name,
            () => context.close(),
            item,
          );
        write();
        if (echo) console.log(item.status.toUpperCase() + " " + scenario.name);
      }
    }
    phase("candidate-recheck");
    assert.deepEqual(
      artifactIdentity(root),
      provenance,
      "Built artifact changed during the browser run",
    );
    if (!suppliedDist)
      await verifyCandidate({ root, verifyBuild: dependencies.verifyBuild });
    report.status =
      report.cases.length === SCENARIOS.length &&
      report.cases.every((item) => item.status === "passed")
        ? "passed"
        : "failed";
  } catch (error) {
    report.status = "failed";
    report.failedPhase = report.phase;
    report.error = errorText(error);
  } finally {
    // Every resource gets a cleanup attempt even if a previous cleanup rejects.
    if (browser) await cleanup("browser", () => browser.close());
    if (server?.listening)
      await cleanup("server", async () => {
        server.closeAllConnections?.();
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      });
    if (report.cleanupErrors.length) report.status = "failed";
    report.notRunCases = SCENARIOS.filter(
      ({ name }) => !report.cases.some((item) => item.name === name),
    ).map(({ name }) => name);
    report.finishedAt = new Date().toISOString();
    report.phase = "finished";
    write();
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: node test/browser/current-app.mjs [--supplied-dist] [--output=PATH]\nRequires Playwright Chromium. Each invocation creates its own evidence directory, including failed preflights.\nDefault verifies current compilation/build before and after browser tests.\n--supplied-dist inspects uploaded dist only and is not a current-source release gate.",
    );
    return;
  }
  for (const arg of args)
    if (arg !== "--supplied-dist" && !arg.startsWith("--output="))
      throw Error("Unknown argument: " + arg);
  const output = path.resolve(
    ROOT,
    args.find((arg) => arg.startsWith("--output="))?.slice(9) ||
      "reports/production/browser",
  );
  const report = await runCurrentApp({
    output,
    suppliedDist: args.includes("--supplied-dist"),
  });
  console.log(
    JSON.stringify({
      status: report.status,
      cases: report.cases.length,
      report: report.reportFile,
    }),
  );
  if (report.status !== "passed") process.exitCode = 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 1;
  });
}
