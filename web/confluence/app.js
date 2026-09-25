import { RELEASE_CAPABILITIES } from "./release-capabilities.mjs";
import {
  PRISM_ROUTES,
  PRISM_ATLAS_GROUPS,
  prismArtRoute,
  prismIcon,
  normalizePrismPreferences,
} from "./prism-presentation.mjs";
import { mountWorkbench } from "../modules/embedded.mjs";
import { selectedContext } from "./selected-context.mjs";
import {
  CAPABILITY_CATALOG,
  PRIMARY_CAPABILITIES,
  ADVANCED_ROUTES,
  resolveCapabilityRoute,
} from "./capabilities.mjs";
import { WorkshopDesk } from "../workshop/desk.mjs";
import { V4Desk } from "../v4/desk.mjs";
import { launchDesk } from "../launchpad/desk.mjs";
import { GovernanceDesk } from "../governance/desk.mjs";
import { CrosschainDesk } from "../crosschain/desk.mjs";
import { CommonsDesk } from "../commons/desk.mjs";
import { LaunchParticipant } from "../launchpad/participant.mjs";
import { parseLaunchHash } from "../launchpad/links.mjs";
import { LiveProtocolDesk } from "../genesis/live-desk.mjs";
import { ExtensionDesk } from "../extensions/desk.mjs";
import { GenesisInterior } from "../genesis/interior.mjs";
import { LiveExitDesk } from "../exit/live-ui.mjs";
import { BurnerDesk } from "../burners/desk.mjs";
import { identityVector, CAPABILITIES } from "./identity.mjs";
import { GenesisField as ParticleField } from "../genesis/field.js";
import {
  ORIGINAL_ACTIONS,
  SECONDARY_VIEWS,
  dispatchOriginal,
  dispatchSecondary,
} from "../genesis/atlas.mjs";
import {
  validateRoutePlan,
  splitExact,
  routeCommitment,
  ZERO_ADDRESS,
} from "./economy.mjs";
import { ConfluenceWallet } from "./wallet.mjs";
import {
  initialMatch,
  legalMoves,
  playMove,
  botMove,
  validateWorld,
  defaultWorld,
} from "./console-core.mjs";
import { keccak256 } from "../evm.mjs";
import {
  validateConfluenceArchive,
  replaceArchiveStorage,
  scopeConfluenceArchiveStorage,
  archiveScope,
} from "./archive.mjs";
const $ = (s) => document.querySelector(s),
  esc = (x) =>
    String(x).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const catalog = CAPABILITY_CATALOG;
const forms = {
  workshop: "Loom of instruments",
  "exit-live": "Measured currents",
  exits: "Unfolding hours",
  burners: "Protected embers",
  home: "Chrysalis",
  trade: "Twin current",
  routes: "Tributaries",
  launch: "Ascension",
  vault: "Temporal vault",
  ledger: "Time lattice",
  journal: "Memory petals",
  library: "Codex",
  world: "Constellation",
  cartridges: "World seed",
  market: "Orbital exchange",
  work: "Loom",
  agents: "Thought lattice",
  lab: "Harmonic field",
  give: "Offering",
};
let visualSeed = null,
  field,
  id,
  mode = "home",
  oldSeed = "",
  original = false,
  lastForm = "",
  audioContext,
  analyser,
  gameCleanup = () => {},
  lastFocus,
  storageOk = true,
  localSnapshot,
  routes = [],
  customWorld = defaultWorld(),
  match = null,
  clock;
let navigationTicket = 0,
  interior;
let moduleWorkbench = null;
let prismPreferences = normalizePrismPreferences();
const selectionInput = () => ({
  preview: visualSeed,
  connected: wallet.connected,
  snapshot: wallet.snapshot,
  minted: window.AWE_CHAIN_IDENTITY,
  local: localSnapshot,
  legacy: window.__idfbi?.chain?.(),
});
const sourceIdentity = () => selectedContext.get().source;
function refreshIdentity() {
  const context = selectedContext.update(selectionInput()),
    source = context.source;
  if (!source || !field) return;
  id = identityVector(source);
  field.opticalIdentity = source;
  field.selectionMode = context.mode;
  field.life = context.localLife ? field.life || 0 : 0;
  field.setIdentity(id);
  if (field.blueRenderer) {
    field.blueRenderer.dirty = true;
    field.blueRenderer.lastJob = 0;
  }
  paintIdentity();
  window.dispatchEvent(new Event("anima:selection"));
}

function returnFromFunction() {
  return open(interior?.savedCamera ? "interior" : "home");
}
const wallet = new ConfluenceWallet((message, event) => {
  notify(message);
  if (["snapshot", "snapshot-stale"].includes(event) && localSnapshot && field)
    refreshIdentity();
  if (["invalidate", "disconnect"].includes(event) && localSnapshot) {
    commonsDesk.lock();
    if (
      launchDesk.chain.execution?.mode === "nft" ||
      launchDesk.state.execution?.mode === "nft"
    ) {
      try {
        launchDesk.chain.useWallet();
      } catch {
        launchDesk.chain.invalidate();
      }
    }
    liveDesk.lock();
    workshop.lock();
    extensionDesk.lock();
    gameCleanup();
    gameCleanup = () => {};
    if (mode === "extensions") {
      $("#cf-content").innerHTML = extensionDesk.render();
      extensionDesk.mount($("#cf-content")).catch((e) => note(e.message));
    }
    refreshIdentity();
  }
});
const B = (key, text, cls = "") =>
  `<button type="button" class="cf-button ${cls}" data-do="${key}">${text}</button>`;
const F = (label, name, value = "", type = "text") =>
  `<label for="cf-${name}">${label}</label><input id="cf-${name}" type="${type}" value="${esc(value)}" autocomplete="off">`;
const fact = (label, value) =>
  `<div class="cf-stat"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
const val = (n) => $("#cf-" + n)?.value ?? "";
function notify(message) {
  $("#cf-toast").textContent = message;
  clearTimeout(clock);
  clock = setTimeout(() => ($("#cf-toast").textContent = ""), 6000);
}
function note(message) {
  $("#cf-notice").textContent = message;
}
function download(data, name, type = "application/json") {
  const b =
    data instanceof Blob
      ? data
      : new Blob(
          [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
          { type },
        );
  const u = URL.createObjectURL(b),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}
function saved(key, value) {
  try {
    localStorage.setItem(
      (window.ANIMA_SIM_PREFIX || "awe.") + "confluence:" + oldSeed + ":" + key,
      JSON.stringify(value),
    );
  } catch {
    storageOk = false;
    notify("Storage is unavailable. Export your changes to keep them.");
  }
}
function read(key, fallback) {
  try {
    const v = localStorage.getItem(
      (window.ANIMA_SIM_PREFIX || "awe.") + "confluence:" + oldSeed + ":" + key,
    );
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function captureRoutes() {
  return [...document.querySelectorAll(".cf-route")].map((el) => ({
    recipient: el.querySelector("[name=recipient]").value,
    weight: el.querySelector("[name=weight]").value,
    outputToken: el.querySelector("[name=outputToken]").value,
  }));
}
function stage(next) {
  mode = next;
  original = false;
  document.body.classList.add("confluence");
  document.body.dataset.prismRoute = prismArtRoute(next, liveDesk.operation);
  document.body.dataset.prismInterior = "false";
  document.body.dataset.cfOpen = String(next !== "home");
  field.setPrismEnabled?.(true);
  field.active = true;
  field.open = next !== "home";
  field.setMode(prismArtRoute(next, liveDesk.operation));
  field.onReturnComplete = () => {};
  const visualKey =
    next === "live"
      ? { memory: "memory", post: "commons", swap: "v4" }[liveDesk.operation] ||
        next
      : next;
  const visual = PRISM_ROUTES[visualKey] || [
    catalog[next]?.[0] || next,
    catalog[next]?.[1] || "",
    forms[next] || "Within your artifact",
  ];
  const number = Math.max(0, Object.keys(PRISM_ROUTES).indexOf(next));
  $("#cf-form").textContent = visual[2];
  $("#cf-chapter").textContent =
    String(number).padStart(2, "0") + " / " + visual[2].toUpperCase();
  $("#cf-caption").textContent = visual[0];
  $("#cf-hint").textContent = visual[1];
  $("#cf-return").hidden = true;
  document
    .querySelectorAll(
      ".cf-dock button, .prism-mobile-nav button, .prism-mode-nav button",
    )
    .forEach((button) => {
      const current = resolveCapabilityRoute(button.dataset.cf) === next;
      button.classList.toggle("active", current);
      if (current) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  const url = new URL(location.href);
  if (next === "home") url.searchParams.delete("realm");
  else url.searchParams.set("realm", next);
  try {
    history.replaceState(null, "", url);
  } catch {}
}

function closePanels() {
  moduleWorkbench?.destroy();
  moduleWorkbench = null;
  extensionDesk.lock();
  workshop.invalidate();
  v4Desk.invalidate();
  launchDesk.unmount();
  commonsDesk.unmount();
  participant.unmount();
  governanceDesk.unmount();
  crosschainDesk.unmount();
  launchDesk.chain.invalidate();
  if (mode === "live") liveDesk.invalidate();
  wallet.plan = null;
  gameCleanup();
  gameCleanup = () => {};
  let closed = false;
  for (const selector of ["#cf-dialog", "#instrument-dialog"]) {
    const d = $(selector);
    if (d.open) {
      d.close();
      closed = true;
    }
  }
  note("");
  return closed;
}
async function settlePanels() {
  if (closePanels()) await new Promise((resolve) => setTimeout(resolve, 0));
}
async function open(next, { preserveLaunchLink = false } = {}) {
  const ticket = ++navigationTicket,
    wasInterior = interior?.active,
    rehearsal = next.startsWith("rehearsal:");
  if (rehearsal) next = next.slice(10);
  if (!rehearsal) {
    const live = { vault: "lock", "world-public": "post" };
    if (live[next]) liveDesk.operation = live[next];
    next = resolveCapabilityRoute(next);
  }
  if (!catalog[next]) next = "home";
  if (
    next !== "participant" &&
    !preserveLaunchLink &&
    location.hash.startsWith("#launch/")
  ) {
    const url = new URL(location.href);
    url.hash = "";
    history.replaceState(null, "", url);
  }
  if (wasInterior) await interior.leave({ remember: next !== "home" });
  else if (next === "home" && interior?.savedCamera) {
    interior.enter({ resume: true });
    await interior.leave();
  }
  if (ticket !== navigationTicket) return;
  if (mode === "live") liveDesk.invalidate();
  lastFocus = document.activeElement;
  await settlePanels();
  if (ticket !== navigationTicket) return;
  if (next === "interior") {
    stage("home");
    field.finishCreation();
    interior.enter({ resume: !!interior.savedCamera });
    document.body.dataset.prismInterior = "true";
    $("#ag-resume").hidden = true;
    return;
  }
  if (next === "home") interior.savedCamera = null;
  $("#ag-resume").hidden = !interior.savedCamera;
  stage(next);
  if (next === "home") {
    lastFocus?.blur();
    if (wasInterior)
      document
        .querySelector('[data-genesis="interior"]')
        ?.focus({ preventScroll: true });
    return;
  }
  if (
    [
      "exits",
      "trade",
      "vault",
      "give",
      "market",
      "world",
      "journal",
      "library",
      "work",
      "ledger",
      "lab",
    ].includes(next)
  ) {
    window.__instruments.openView(next);
    $("#ix-title").textContent = catalog[next][0];
    $(".ix-eyebrow").textContent = "ANIMA GENESIS / LOCAL REHEARSAL";
    $("#ix-close").focus({ preventScroll: true });
    return;
  }
  const d = $("#cf-dialog");
  $("#cf-dialog-title").textContent = catalog[next][0];
  $("#cf-dialog-kicker").textContent =
    "ANIMA GENESIS / " +
    (next === "participant"
      ? "LAUNCH PARTICIPATION"
      : wallet.connected
        ? "OWNER CONNECTED"
        : window.AWE_CHAIN_IDENTITY && !window.ANIMA_SIM_SAMPLE
          ? "MINTED NFT"
          : "EXPLORATION");
  $("#cf-content").innerHTML = pages[next]();
  d.show();
  $("#cf-close").focus({ preventScroll: true });
  if (next === "extensions" || next === "security")
    await extensionDesk.mount($("#cf-content"));
  if (next === "launch") launchDesk.mount($("#cf-content"));
  if (next === "commons") commonsDesk.mount($("#cf-content"));
  if (next === "participant") participant.mount($("#cf-content"));
  if (next === "governance") governanceDesk.mount($("#cf-content"));
  if (next === "crosschain") crosschainDesk.mount($("#cf-content"));
  if (next === "modules")
    moduleWorkbench = mountWorkbench($("#cf-module-workbench"), {
      onClose: () => open("home"),
      initial: {
        collection:
          wallet.collection || window.AWE_CHAIN_IDENTITY?.collection || "",
        tokenId:
          wallet.tokenId?.toString() ||
          window.AWE_CHAIN_IDENTITY?.tokenId ||
          "1",
        chainId:
          wallet.chainId?.toString() ||
          window.AWE_CHAIN_IDENTITY?.chainId ||
          "31337",
      },
    });
}

function paintIdentity() {
  window.__idfbi?.audio?.tune(sourceIdentity());
  document.documentElement.style.setProperty("--cf-accent", "#7CEAFF");
  $("#cf-name").textContent = id.name;
  $("#cf-hash").textContent =
    id.domain.slice(0, 10) + " · " + id.domain.slice(-6);
  $("#cf-number").textContent = wallet.connected
    ? "#" + wallet.tokenId
    : window.AWE_CHAIN_IDENTITY && !window.ANIMA_SIM_SAMPLE
      ? "#" + window.AWE_CHAIN_IDENTITY.tokenId
      : "PREVIEW";
  $("#cf-scope").textContent = visualSeed
    ? "VISUAL PREVIEW"
    : wallet.connected
      ? "CHAIN " +
        wallet.chainId +
        (wallet.snapshot?.stale
          ? " / SNAPSHOT STALE"
          : " / OWNER CONNECTED · BLOCK " + wallet.snapshot?.block)
      : window.ANIMA_SIM_SAMPLE
        ? "RECORDED LOCAL MINT · PREVIEW"
        : window.AWE_CHAIN_IDENTITY
          ? "CHAIN " + window.AWE_CHAIN_IDENTITY.chainId + " / MINTED NFT"
          : "LOCAL PREVIEW"; // The semantic actions stay in place; the spatial arrangement varies with immutable origin.
  const compare = $("#sa-compare");
  if (compare) {
    const url = new URL("https://anima-begins.edwincardenas.chatgpt.site");
    url.searchParams.set("seed", sourceIdentity().seed);
    compare.href = url.href;
  }
  document.documentElement.style.setProperty(
    "--sa-radius",
    14 + id.axes[13] * 18 + "px",
  );
  const nodes = [...$(".cf-orbits").children];
  nodes.forEach((el, i) => {
    el.style.transform = `translate(${(id.axes[11 + i] - 0.5) * 32}px,${(id.axes[(i + 12) % 16] - 0.5) * 24}px)`;
  });
}
const atlasGrid = (items) =>
  '<div class="cf-atlas">' + items.join("") + "</div>";
const routeButton = (key) =>
  `<button type="button" data-do="nav:${key}">${catalog[key][0]}<span>${catalog[key][1]}</span></button>`;
const originalButton = ([key, title, hint, selector]) =>
  `<button type="button" data-do="original:${key}" ${$(selector)?.disabled ? "disabled" : ""}>${title}<span>${hint}</span></button>`;
function atlasPage() {
  return (
    '<p>Every instrument has a place. Search by name or purpose.</p><label class="prism-atlas-search" for="prism-atlas-query">Find an instrument<input id="prism-atlas-query" type="search" placeholder="Memory, mint, recovery…" autocomplete="off"></label><p id="prism-search-status" class="cf-small" role="status" aria-live="polite"></p>' +
    PRISM_ATLAS_GROUPS.map(
      ([label, keys]) =>
        `<section class="prism-atlas-group"><h3>${label}</h3>${atlasGrid(keys.map(routeButton))}</section>`,
    ).join("") +
    '<details class="cf-capability-inventory"><summary>What this NFT can do</summary><p>Open a capability to inspect its configured contracts and services. Listed functionality requires the dependencies shown.</p>' +
    RELEASE_CAPABILITIES.map(
      (c) =>
        "<article><h4>" +
        esc(c.label) +
        "</h4><p>" +
        esc(c.boundary) +
        '</p><p class="cf-small">Needs: ' +
        esc(c.requires.join(", ") || "Browser runtime") +
        "</p>" +
        B("nav:" + c.route, "Open") +
        "</article>",
    ).join("") +
    "</details>" +
    "<h3>The original blue object</h3>" +
    atlasGrid(
      ORIGINAL_ACTIONS.filter((x) =>
        [
          "history",
          "present",
          "portrait",
          "reset",
          "fold",
          "motion",
          "quality",
          "sound",
          "immerse",
        ].includes(x[0]),
      ).map(originalButton),
    ) +
    `<div class="cf-actions">${B("original", "Original view")}${B("nav:connect", "Connect NFT")}${B("nav:advanced", "Advanced")}${B("export-all", "Export local experience")}${B("import-all", "Restore local experience")}</div><p class="cf-small">${archiveScope.summary}</p><p class="cf-small">Controls open around the same optical field. Closing a function returns you to your camera position.</p>`
  );
}

function toolsPage() {
  return `<p>Seven doors into the same living world.</p><div class="prism-tools-grid">${PRIMARY_CAPABILITIES.map(({ key, label, description }) => `<button type="button" data-do="nav:${key}">${prismIcon(key)}<span><strong>${esc(label)}</strong><small>${esc(description)}</small></span><span aria-hidden="true">↗</span></button>`).join("")}</div><div class="cf-actions">${B("nav:settings", "Appearance & settings")}${B("nav:interior", "Explore interior")}${B("original", "Original view")}</div>`;
}

function settingsPage() {
  return `<div class="prism-settings"><p>Prism Cathedral II. One material, a spectrum of light.</p><label for="prism-spectrum">Spectrum intensity <output id="prism-spectrum-value" for="prism-spectrum">${Math.round(prismPreferences.spectrum * 100)}%</output></label><input id="prism-spectrum" type="range" min="0" max="1.6" step="0.02" value="${prismPreferences.spectrum}"><p class="cf-small">Sapphire remains the foundation. Add cyan, amethyst, rose and rare champagne glints.</p><label for="prism-quality">Display quality</label><select id="prism-quality"><option value="auto" ${prismPreferences.quality === "auto" ? "selected" : ""}>Automatic · balanced for this display</option><option value="economy" ${prismPreferences.quality === "economy" ? "selected" : ""}>Gentle · fewer filaments</option><option value="detail" ${prismPreferences.quality === "detail" ? "selected" : ""}>Detailed · richer filaments</option></select><label class="prism-setting-check" for="prism-motion"><input id="prism-motion" type="checkbox" ${field.motion ? "checked" : ""}> Animate the living object</label><p class="cf-small">Motion starts with your device preference. Pausing keeps every tool available.</p><div class="cf-actions">${B("prism-sound", "Sound " + (soundState()?.enabled ? "on" : "off"))}${B("prism-reset", "Reset appearance")}${B("portrait", "Save portrait")}</div><h3>Keep your local experience</h3><p class="cf-small">${archiveScope.summary}</p><div class="cf-actions">${B("export-all", "Export local experience")}${B("import-all", "Restore local experience")}</div><h3>The preserved Original</h3><p>The original optical renderer remains available alongside Prism Cathedral.</p>${B("original", "Open Original")}</div>`;
}

function updateMotionLabel() {
  const button = $("#cf-motion");
  button.textContent = field.motion ? "Pause motion" : "Resume motion";
  button.setAttribute("aria-label", button.textContent);
  button.setAttribute("aria-pressed", String(field.motion));
  document.body.dataset.prismMotion = String(field.motion);
}

function applyPrismPreferences() {
  field.setSpectrumIntensity?.(prismPreferences.spectrum);
  field.setPrismQuality?.(prismPreferences.quality);
  if (prismPreferences.motion !== null) field.motion = prismPreferences.motion;
  if (window.__idfbi?.renderer) {
    window.__idfbi.renderer.motion = field.motion;
    window.__idfbi.renderer.dirty = true;
  }
  updateMotionLabel();
}

function changePrismPreference(target) {
  if (target.id === "prism-spectrum") {
    prismPreferences.spectrum = Number(target.value);
    $("#prism-spectrum-value").textContent =
      Math.round(prismPreferences.spectrum * 100) + "%";
  } else if (target.id === "prism-quality")
    prismPreferences.quality = target.value;
  else if (target.id === "prism-motion")
    prismPreferences.motion = target.checked;
  else return false;
  prismPreferences = normalizePrismPreferences(prismPreferences);
  applyPrismPreferences();
  saved("prism-preferences", prismPreferences);
  return true;
}

function searchAtlas(query) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  let count = 0;
  document.querySelectorAll(".prism-atlas-group").forEach((group) => {
    let visible = false;
    group.querySelectorAll("button").forEach((button) => {
      const match = terms.every((term) =>
        button.textContent.toLocaleLowerCase().includes(term),
      );
      button.hidden = !match;
      visible ||= match;
      if (match) count++;
    });
    group.hidden = !visible;
  });
  $("#prism-search-status").textContent = terms.length
    ? `${count} instrument${count === 1 ? "" : "s"} found`
    : "";
}
function advancedPage() {
  return (
    "<p>Configure specialist integrations, inspect exact contract calls and explore historical models. Each service or deployed contract has its own availability; being listed here does not mean it is deployed.</p>" +
    atlasGrid(ADVANCED_ROUTES.map(routeButton)) +
    "<details><summary>Original authority, commitments and recovery</summary><p>Ascension changes authority irreversibly. Verifier readiness and recovery must be reviewed before selecting it. Original actions use the original client and explicitly show its local or chain context.</p>" +
    atlasGrid(
      ORIGINAL_ACTIONS.filter(
        (x) =>
          ![
            "history",
            "present",
            "portrait",
            "reset",
            "fold",
            "motion",
            "quality",
            "sound",
            "immerse",
          ].includes(x[0]),
      ).map(originalButton),
    ) +
    "</details><details><summary>Local economic rehearsals</summary><p>Explore models with local balances and unsigned receipts.</p>" +
    atlasGrid(
      [
        "trade",
        "vault",
        "journal",
        "world",
        "exits",
        "give",
        "market",
        "library",
        "work",
        "ledger",
        "lab",
      ].map(
        (k) =>
          `<button type="button" data-do="nav:rehearsal:${k}">${catalog[k][0]}<span>Local rehearsal</span></button>`,
      ),
    ) +
    "</details><details><summary>Inspect instrument state</summary>" +
    atlasGrid(
      SECONDARY_VIEWS.map(
        ([key, title, hint]) =>
          `<button type="button" data-do="instrument:${key}">${title}<span>${hint}</span></button>`,
      ),
    ) +
    "</details>"
  );
}
function memoryPage() {
  return `<p>Choose where your words live before writing. These choices have different readers and recovery rules.</p><article class="cf-card"><h3>Encrypted notebook</h3><p>Recoverable private notes saved in this browser. Your passphrase decrypts them. Export the local experience and retain its passphrase to recover them elsewhere.</p>${B("nav:rehearsal:journal", "Open encrypted notebook", "primary")}</article><article class="cf-card"><h3>Public inscription</h3><p>Your NFT records readable text onchain. Each inscription requires publication consent and a reviewed transaction. Anyone can read public chain data.</p>${B("memory-public", "Write public inscription")}</article><article class="cf-card"><h3>Hash-only seal</h3><p>The original seal records a salted digest and discards your words and salt. It cannot recover the text or later prove a supplied sentence unless you separately retained the required data. It is not a notebook.</p>${B("original:memory", "Open original hash seal")}</article>`;
}

const v4Desk = new V4Desk({ notify, download });
launchDesk.usePrivateDesk(v4Desk);
const commonsDesk = new CommonsDesk({
  chain: launchDesk.chain,
  provider: () => wallet.raw || globalThis.ethereum,
});
const governanceDesk = new GovernanceDesk({
  chain: launchDesk.chain,
  provider: () => wallet.raw || globalThis.ethereum,
});
const crosschainDesk = new CrosschainDesk({ chain: launchDesk.chain });
const participant = new LaunchParticipant({
  chain: launchDesk.chain,
  onExit: () => open("launch"),
  baseURL: location.href,
});
const nftContext = () => ({
  collection: wallet.connected
    ? wallet.collection
    : window.AWE_CHAIN_IDENTITY?.collection,
  tokenId: wallet.connected
    ? wallet.tokenId
    : window.AWE_CHAIN_IDENTITY?.tokenId,
  account: wallet.connected ? wallet.account : undefined,
  chainId: wallet.connected
    ? wallet.chainId
    : window.AWE_CHAIN_IDENTITY?.chainId,
  provider: wallet.raw || globalThis.ethereum,
});
async function openLaunchLink() {
  let route;
  try {
    route = parseLaunchHash(location.hash);
  } catch (error) {
    await open("launch");
    notify(error.message);
    return true;
  }
  if (!route) return false;
  if (route.kind === "cca" || route.kind === "doppler") {
    launchDesk.protocolsDesk.openRoute({
      ...route,
      auction: route.kind === "cca" ? route.contract : undefined,
      airlock: route.kind === "doppler" ? route.contract : undefined,
    });
    launchDesk.tab = "protocols";
    await open("launch", { preserveLaunchLink: true });
    return true;
  }
  participant.open(route);
  await open("participant");
  return true;
}
const burnerDesk = new BurnerDesk();
const liveExitDesk = new LiveExitDesk(wallet, showTransaction, read, saved);
const liveDesk = new LiveProtocolDesk(wallet, showTransaction, read, saved);
const workshop = new WorkshopDesk(wallet, showTransaction, download, note);
const extensionDesk = new ExtensionDesk(
  wallet,
  showTransaction,
  read,
  saved,
  note,
);
const pages = {
  settings: settingsPage,
  tools: toolsPage,
  modules: () => '<div id="cf-module-workbench"></div>',
  extensions: () => extensionDesk.render(),
  workshop: () => workshop.render(),
  v4: () => v4Desk.render("swap"),
  privacy: () => {
    v4Desk.view = "wallet";
    return v4Desk.render();
  },
  commons: () =>
    `<div class="cf-actions">${B("nav:world-public", "Public rooms ↗")}</div><p class="cf-small">Public rooms publish readable messages. Encrypted conversations below protect message contents; membership and activity remain public.</p>${commonsDesk.render()}`,
  participant: () => participant.render(),
  governance: () => governanceDesk.render(),
  security: () => {
    extensionDesk.group = "security";
    return extensionDesk.render();
  },
  crosschain: () => crosschainDesk.render(),
  live: () => liveDesk.render(),
  "exit-live": () => liveExitDesk.render(),
  burners: () => burnerDesk.render(),
  atlas: atlasPage,
  advanced: advancedPage,
  memory: memoryPage,
  identity: () =>
    `<p>Your immutable origin shapes a sixteen-coordinate visual identity. Activity adds a bounded layer; it never buys access to a function.</p><code>${id.domain}</code>${fact("Identity", id.name)}${fact("Petal symmetry", id.petals)}${fact("Particle count", field.renderedCount.toLocaleString())}${fact("Available capabilities", CAPABILITIES.length)}${fact("Execution", wallet.connected ? "Connected owner · explicit reviews" : window.AWE_CHAIN_IDENTITY ? "Minted identity · connect its owner to act" : "Local state · unsigned receipts")}<h3>The same matter, many forms.</h3><p>Try a different origin below to preview its interface. This changes the visual lens only; it does not mint or replace your active artifact.</p>${F("Preview seed · 64 hex characters", "seed", id.domain)}${B("preview-seed", "Explore this seed")}<div class="cf-actions">${B("new-seed", "Generate a visual identity")}${B("restore-seed", "Return to my identity")}${B("form", "Explore lived form")}${B("original", "Open preserved original")}</div><h3>Stored with your NFT</h3><p>The thumbnail, visual runtime and core instrument code are recovered from immutable contract storage. Rendering and signing run in your browser. Privacy proving files and network services still require external connections.</p><h3>Keep your local experience</h3><p class="cf-small">${archiveScope.summary}</p><div class="cf-actions">${B("export-all", "Export local experience")}${B("portrait", "Save particle portrait")}${B("share", "Copy this visual identity link")}</div><p class="cf-small">Shared seeds expose a visual identity only. Memories, balances and permissions are not included. Similar names or images are possible; the full identity digest is authoritative.</p>`,
  routes: routesPage,
  launch: () => launchDesk.render({ seed: oldSeed, nft: nftContext }),
  cartridges: cartridgesPage,
  agents: agentsPage,
  connect: connectPage,
};
function routesPage() {
  const rs = routes.length
    ? routes
    : [
        {
          recipient: wallet.connected ? wallet.account : "",
          weight: "100",
          outputToken: ZERO_ADDRESS,
        },
      ];
  return `<p>Configure recipients and weights for a separately deployed OwnerFeeRouter. These settings do not attach a fee hook to the standard v4 launch; that route pays fees to liquidity shareholders.</p><form id="cf-routes-form">${rs.map((r, i) => `<div class="cf-route"><div class="cf-stat"><span>Recipient ${i + 1}</span><button class="cf-button" type="button" data-do="remove-route:${i}">Remove</button></div><label>Wallet, NFT account, or contract</label><input name="recipient" value="${esc(r.recipient)}" placeholder="0x…"><div class="cf-grid"><div><label>Relative weight</label><input name="weight" inputmode="numeric" value="${esc(r.weight)}"></div><div><label>Preferred output token</label><input name="outputToken" value="${esc(r.outputToken)}"></div></div></div>`).join("")}<div class="cf-actions">${B("add-route", "+ Add recipient")}</div>${F("Amount to split · raw units", "split-amount", "1000000000000000000")}<button class="cf-button primary" type="submit">Calculate & save distribution</button></form><div id="cf-split-result"></div><h3>Apply to your NFT</h3>${F("Deployed OwnerFeeRouter address", "router", read("router", ""))}<div class="cf-actions">${B("route-review", "Review configureSplit call")}${B("routes-export", "Export route plan")}</div><p class="cf-small">Weights are enforced by OwnerFeeRouter. Preferred output assets require an explicit converter and minimum output; saving a preference does not perform a conversion. Existing earned claims keep their original recipients.</p>`;
}

function connectPage() {
  return `<p>Read your NFT’s origin and owner-controlled account directly from its deployed collection.</p>${wallet.connected ? fact("Owner", wallet.address) + fact("Account", wallet.account) + fact("Network", wallet.chainId.toString()) : ""}<form id="cf-connect-form">${F("IDFBI collection address", "collection", wallet.collection || (!window.ANIMA_SIM_SAMPLE ? window.AWE_CHAIN_IDENTITY?.collection : null) || read("collection", ""))}${F("Token ID", "token", wallet.tokenId?.toString() || (!window.ANIMA_SIM_SAMPLE ? window.AWE_CHAIN_IDENTITY?.tokenId : null) || "1")}<button type="submit" class="cf-button primary">Connect wallet & read NFT</button></form><div class="cf-actions">${window.AWE_CHAIN_IDENTITY ? "" : B("mint-original", "Mint with commit & reveal")}${wallet.connected ? B("refresh-snapshot", "Refresh confirmed state") + B("disconnect", "Disconnect") : ""}</div><p class="cf-small">Opening this panel sends nothing. Transactions require a separate review and your wallet signature. The mint flow uses the preserved testnet client and requires a deployed collection.</p>`;
}
function agentsPage() {
  return `<p>Compose an explicit call from your NFT account. The current owner approves every transaction.</p>${wallet.connected ? fact("NFT account", wallet.account) + fact("Network", wallet.chainId.toString()) : B("nav:connect", "Connect an owned NFT")}<form id="cf-execute-form">${F("Target contract or recipient", "target", "")}${F("Native value from NFT account", "value", "0")}${F("Calldata · encoded function and arguments", "calldata", "0x")}<button type="submit" class="cf-button primary">Simulate & review account call</button></form><div id="cf-transaction-review"></div><h3>Exact allowance recipe</h3><p class="cf-small">Temporarily approve one ERC20 for the target call above, then clear its allowance in the same transaction.</p>${F("Funding token · zero means native", "utility-asset", ZERO_ADDRESS)}${F("Maximum ERC20 allowance · raw units", "utility-amount", "0")}${B("utility-review", "Review atomic allowance & call")}<h3>Proof authority</h3><p class="cf-small">Choose a registered verifier before using the original irreversible ascension flow. Ownership changes retire this selection while bound.</p><p id="cf-authority-readiness" role="status">Check the connected account’s current authority readiness before changing verifier configuration.</p>${B("authority-readiness", "Read authority readiness")}${F("Verifier ID", "verifier-id", "1")}${B("verifier-review", "Review verifier selection")}<h3>Agent capabilities</h3><p class="cf-small">The source includes machine-readable tools, policy planning, scoped sessions, and proof adapter interfaces. Live autonomous proof execution remains a separate integration. This studio never gives games or a chat model direct wallet authority.</p><div class="cf-actions">${B("agent-export", "Export capability manifest")}${B("nav:ledger", "Inspect commitments")}${B("nav:lab", "Open laboratory")}</div>`;
}
function cartridgesPage() {
  return `<p>Enter a world, or bring one into your artifact.</p><article class="cf-card"><span class="cf-pill">TACTICAL · LOCAL</span><h3>Prism Relay</h3><p>Grow a constellation across a 9 × 9 world. Capture prisms and outmaneuver the opposing territory.</p>${B("prism", "Enter Prism Relay", "primary")}</article><article class="cf-card"><span class="cf-pill">ARCADE · LOCAL</span><h3>Lumen Drift</h3><p>Collect scattered light. Move through the field and avoid its drifting shadows.</p>${B("lumen", "Enter Lumen Drift", "primary")}</article><h3>Owned cartridge NFT</h3>${F("CartridgeRegistry address", "cartridge-registry", read("cartridge-registry", ""))}${F("Cartridge token ID", "cartridge-id", "1")}${B("load-cartridge", "Read ownership & enter")}<p class="cf-small">The selected master NFT must hold this cartridge. Published bytes are checked against its onchain SHA-256 before execution.</p><h3>Cartridge workshop</h3><p class="cf-small">Import a self-contained HTML game. It runs in an isolated frame, with no wallet or network access. Export a content-pinned manifest to pair with its cartridge NFT.</p><label>Game HTML · up to 1 MiB</label><input type="file" id="cf-game-upload" accept=".html,text/html"><div class="cf-actions">${B("world-editor", "Edit Prism world")}${B("cartridge-export", "Export current cartridge")}</div><div id="cf-cartridge-slot"></div>`;
}
function showTransaction(p) {
  const el =
    $("#cf-transaction-review") ||
    $("#cf-launch-result") ||
    $("#cf-split-result") ||
    $("#cf-cartridge-slot");
  el.innerHTML = `<h3>Review before signing</h3>${fact(["personal", "external"].includes(p.execution) ? "Signing wallet" : "NFT account", p.account)}${fact("Target", p.target)}${fact("Native value", p.value)}${fact("Chain", p.chainId)}${fact("Estimated gas", p.gas)}<code>${p.data}</code><div class="cf-actions">${B("send-call", "Request wallet signature")}${B("cancel-call", "Cancel")}</div><p class="cf-small">Simulation succeeded at the current chain state. Only an included transaction receipt is recorded as an onchain result.</p>`;
}
function drawPrism() {
  const moves = legalMoves(match);
  $("#cf-content").innerHTML =
    `<p>Take an empty cell beside your territory. Each prism is worth four points. The match ends after 36 moves.</p><div class="cf-stat"><span>You <b style="color:var(--cf-accent)">${match.scores[0]}</b></span><span>Opponent <b style="color:#e8b98d">${match.scores[1]}</b></span></div><div class="cf-game-status">${match.winner !== null ? (match.winner === 0 ? "A balanced constellation. Draw." : match.winner === 1 ? "Your constellation prevails." : "The opposing constellation prevails.") : "Move " + (match.moves + 1) + " / 36 · " + (match.turn === 1 ? "Your turn" : "Opponent thinking")}</div><div class="cf-prism-grid" role="group" aria-label="Prism Relay board">${match.cells.map((cell, i) => `<button data-do="cell:${i}" aria-label="Row ${Math.floor(i / 9) + 1}, column ${(i % 9) + 1}: ${cell === 1 ? "your territory" : cell === 2 ? "opponent territory" : match.world.terrain[i]}${moves.includes(i) ? ", legal move" : ""}" ${match.turn !== 1 || !moves.includes(i) ? "disabled" : ""} style="--cell:${cell === 1 ? "#88cdda" : cell === 2 ? "#e3b38a" : match.world.terrain[i] === "wall" ? "#28313b" : moves.includes(i) ? "#213f4b" : "#0f1722"}">${match.world.terrain[i] === "prism" ? "✧" : cell ? "•" : ""}</button>`).join("")}</div><div class="cf-actions">${B("prism", "New match")}${B("world-editor", "Shape this world")}${B("nav:cartridges", "Return to Worlds")}</div>`;
  if (match.winner !== null) {
    saved("prism", match);
    field.pulse = 1;
  }
}
let cartridge = null,
  archiveCandidate = null;
async function launchHTML(html, name) {
  const bytes = new TextEncoder().encode(html);
  if (bytes.byteLength > 1048576)
    throw Error("Cartridge exceeds the 1 MiB limit.");
  if (!crypto.subtle) throw Error("Native content hashing is unavailable.");
  const digest = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  cartridge = {
    spec: "awe.cartridge/1",
    name,
    version: "1",
    engine: "html",
    entry: "sha256:" + digest,
    contentHash: "0x" + digest,
    capabilities: [],
    settlement: "local",
  };
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
  $("#cf-content").innerHTML =
    `<div class="cf-game-status">${esc(name)} · SHA-256 pinned</div><iframe id="cf-game-frame" title="${esc(name)}" sandbox="allow-scripts allow-pointer-lock" referrerpolicy="no-referrer" class="cf-game" style="height:480px"></iframe><div class="cf-actions">${B("nav:cartridges", "Exit game")}${B("cartridge-export", "Export manifest")}</div><code>${digest}</code>`;
  const frame = $("#cf-game-frame");
  frame.srcdoc = csp + html;
  gameCleanup = () => {
    frame.src = "about:blank";
    frame.remove();
  };
}
function worldEditor() {
  const w = customWorld;
  $("#cf-content").innerHTML =
    `<p>Paint a connected world. Both corner starts remain open.</p><label for="cf-brush">Brush</label><select id="cf-brush"><option>prism</option><option>wall</option><option>plain</option></select>${F("World name", "world-name", w.name)}<div class="cf-prism-grid" role="group" aria-label="World editor">${w.terrain.map((t, i) => `<button data-do="paint:${i}" aria-label="Cell ${i + 1}: ${t}" style="--cell:${t === "wall" ? "#435161" : t === "prism" ? "#305869" : "#101d29"}" ${i === 0 || i === 80 ? "disabled" : ""}>${t === "prism" ? "✧" : i === 0 || i === 80 ? "•" : ""}</button>`).join("")}</div><div class="cf-actions">${B("play-world", "Validate & play")}${B("export-world", "Export world")}${B("reset-world", "Reset world")}</div><label>Import world JSON</label><input type="file" id="cf-world-upload" accept=".json,application/json">`;
}
const actions = {
  "prism-sound": async () => {
    await sound();
    return open("settings");
  },
  "prism-reset": () => {
    prismPreferences = normalizePrismPreferences();
    prismPreferences.motion = !matchMedia("(prefers-reduced-motion: reduce)")
      .matches;
    applyPrismPreferences();
    saved("prism-preferences", prismPreferences);
    return open("settings");
  },
  "add-route": () => {
    routes = captureRoutes();
    if (routes.length >= 64) throw Error("Maximum 64 recipients.");
    routes.push({ recipient: "", weight: "1", outputToken: ZERO_ADDRESS });
    $("#cf-content").innerHTML = routesPage();
  },
  "routes-export": () => {
    routes = validateRoutePlan(captureRoutes());
    download(
      { schema: "awe.routes/1", routes, commitment: routeCommitment(routes) },
      "awe-distribution.json",
    );
  },
  "route-review": async () => {
    routes = validateRoutePlan(captureRoutes());
    const target = val("router");
    saved("router", target);
    const data = wallet.encode("configureSplit(address[],uint256[])", [
      routes.map((r) => r.recipient),
      routes.map((r) => r.weight),
    ]);
    showTransaction(await wallet.prepare({ target, data }));
  },

  "send-call": async () => {
    const receipt = await wallet.send();
    const receipts = read("chain-receipts", []);
    receipts.push(receipt);
    saved("chain-receipts", receipts);
    try {
      await workshop.receipt(receipt, $("#cf-content"));
    } catch {
      notify(
        "Transaction included. Reconnect to inspect its current NFT custody.",
      );
    }
    note(
      "Included in block " +
        receipt.blockNumber +
        " · " +
        receipt.hash +
        (receipt.snapshotError
          ? " · Snapshot unavailable: " + receipt.snapshotError
          : ""),
    );
    field.pulse = 1;
  },
  "cancel-call": () => {
    wallet.plan = null;
    // Remove obsolete signing controls synchronously; panel navigation awaits
    // its closing animation and must not leave a cancelled review actionable.
    for (const button of document.querySelectorAll(
      '#cf-dialog [data-do="send-call"], #cf-dialog [data-do="cancel-call"]',
    ))
      button.remove();
    return open(mode);
  },
  "utility-review": async () =>
    showTransaction(
      await wallet.prepareUtility({
        target: val("target"),
        asset: val("utility-asset"),
        amount: val("utility-amount"),
        value: val("value"),
        data: val("calldata"),
      }),
    ),
  "verifier-review": async () =>
    showTransaction(await wallet.prepareVerifier(val("verifier-id"))),
  "agent-export": () =>
    download(
      {
        schema: "awe.capabilities/1",
        identity: id.domain,
        capabilities: CAPABILITIES,
        scope: "unsigned intent planning; owner-approved transactions",
        account: wallet.connected ? wallet.account : null,
        chainId: wallet.connected ? wallet.chainId.toString() : null,
        permissions: [],
      },
      "awe-agent-capabilities.json",
    ),
  "preview-seed": () => {
    const seed = val("seed").replace(/^0x/, "");
    identityVector({ seed: "0x" + seed, genome: "0x" + seed });
    visualSeed = "0x" + seed;
    refreshIdentity();
    note(
      "Visual preview only. Your stored artifact and permissions are unchanged.",
    );
  },
  "new-seed": () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const seed =
      "0x" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    visualSeed = seed;
    refreshIdentity();
    $("#cf-seed").value = seed;
    note("New visual identity generated. This is a preview, not a mint.");
  },
  "restore-seed": () => {
    visualSeed = null;
    refreshIdentity();
    open("identity");
  },
  form: async () => {
    await settlePanels();
    stage("journal");
    window.__instruments.openView("form");
  },
  "export-all": () =>
    download(
      {
        schema: "awe.confluence/archive/1",
        createdAt: new Date().toISOString(),
        scope: archiveScope,
        origin: window.__idfbi.bundle(),
        instruments: window.__instruments.engine().export(),
        routes,
        launch: read("launch", null),
        world: customWorld,
        chainReceipts: read("chain-receipts", []),
        appearance: { ...prismPreferences },
      },
      "awe-confluence-archive.json",
    ),
  "import-all": () => {
    archiveCandidate = null;
    $("#cf-content").innerHTML =
      '<p>Restore original local history, encrypted notebook ciphertext, instrument rehearsals, distribution plans, Prism world and saved receipt records. Privacy and burner recovery files and service settings must be restored separately.</p><label for="cf-archive-upload">Confluence JSON archive · up to 64 MiB</label><input id="cf-archive-upload" type="file" accept=".json,application/json"><div id="cf-archive-review"></div>';
  },
  "restore-archive": () => {
    if (!archiveCandidate) throw Error("Choose and validate an archive first.");
    if (wallet.connected || window.__idfbi.chain())
      throw Error("Disconnect the wallet before replacing local data.");
    actions["export-all"]();
    const scoped = scopeConfluenceArchiveStorage(
      archiveCandidate.values,
      window.ANIMA_SIM_PREFIX || undefined,
    );
    replaceArchiveStorage(localStorage, scoped);
    location.reload();
  },
  portrait: async () => {
    const r = window.__idfbi.renderer;
    r.uniforms();
    if (r.gl) r.drawGL();
    if (field.gl) field.drawOptics();
    else field.drawFallback();
    const c = document.createElement("canvas");
    c.width = r.canvas.width;
    c.height = r.canvas.height;
    const context = c.getContext("2d");
    context.drawImage(r.canvas, 0, 0, c.width, c.height);
    context.drawImage(r.overlay, 0, 0, c.width, c.height);
    context.drawImage(field.canvas, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      if (b)
        download(
          b,
          "anima-genesis-" +
            id.name.toLowerCase().replaceAll(" ", "-") +
            ".png",
          "image/png",
        );
    });
  },
  share: async () => {
    const url = new URL(location.href);
    url.searchParams.set("seed", sourceIdentity().seed);
    url.searchParams.delete("realm");
    await navigator.clipboard.writeText(url.href);
    note("Visual identity link copied. No memories or permissions are shared.");
  },
  prism: () => {
    match = initialMatch(customWorld);
    drawPrism();
  },
  "load-cartridge": async () => {
    const registry = val("cartridge-registry"),
      token = val("cartridge-id");
    const c = await wallet.readCartridge(registry, token);
    saved("cartridge-registry", registry);
    await launchHTML(c.html, c.name);
    note("NFT ownership and executable verified at block " + c.block + ".");
  },
  lumen: async () => {
    let html = window.CONFLUENCE_BUNDLED?.["web/cartridges/lumen-drift.html"];
    if (!html) {
      const r = await fetch("web/cartridges/lumen-drift.html");
      if (!r.ok) throw Error("Game could not be loaded.");
      html = await r.text();
    }
    await launchHTML(html, "Lumen Drift");
  },
  "world-editor": worldEditor,
  "play-world": () => {
    customWorld = validateWorld({ ...customWorld, name: val("world-name") });
    saved("world", customWorld);
    match = initialMatch(customWorld);
    drawPrism();
  },
  "export-world": () => {
    customWorld = validateWorld({ ...customWorld, name: val("world-name") });
    download(customWorld, "awe-prism-world.json");
  },
  "reset-world": () => {
    customWorld = defaultWorld();
    worldEditor();
  },
  "cartridge-export": () => {
    if (!cartridge)
      cartridge = {
        spec: "awe.cartridge/1",
        name: customWorld.name,
        version: "1",
        engine: "prism-relay",
        entry: "awe:prism-relay",
        capabilities: ["world.read"],
        settlement: "local",
        world: customWorld,
      };
    download(cartridge, "awe-cartridge.json");
  },
  "legacy-launch": async () => {
    await settlePanels();
    stage("launch");
    window.__instruments.openView("launch");
  },
  "mint-original": () => {
    $("#cf-dialog").close();
    $("#chain-dialog").showModal();
    notify("Enter the deployed collection, then choose Mint new token.");
  },
  "refresh-snapshot": async () => {
    await wallet.refreshSnapshot();
    note("Confirmed NFT state refreshed.");
  },
  "memory-public": () => {
    liveDesk.operation = "memory";
    return open("live");
  },
  "formation-toggle": () => {
    field.ceremonialReveal = !field.ceremonialReveal;
    saved("formation-ceremony", field.ceremonialReveal);
    return open("atlas");
  },
  "authority-readiness": async () => {
    await wallet.assertOwner();
    const ready = await wallet.contract.sovereignAuthorityReady();
    $("#cf-authority-readiness").textContent = ready
      ? "The account reports its configured authority is ready. Review the verifier and recovery before irreversible ascension."
      : "Authority is not ready. Freeze and register the required verifier configuration before ascension.";
  },
  disconnect: () => {
    wallet.disconnect();
    open("connect");
  },
  original: () => toggleOriginal(),
};
async function action(key) {
  if (key.startsWith("extension:")) return extensionDesk.action(key.slice(10));
  if (key.startsWith("workshop:"))
    return workshop.action(key.slice(9), $("#cf-content"));
  if (key.startsWith("v4:"))
    return v4Desk.action(key.slice(3), $("#cf-content"));
  if (key.startsWith("live:"))
    return liveDesk.action(key.slice(5), $("#cf-content"));
  if (key.startsWith("exit-live:"))
    return liveExitDesk.action(key.slice(10), $("#cf-content"));
  if (key.startsWith("burner:"))
    return burnerDesk.action(key.slice(7), $("#cf-content"), note);
  if (key.startsWith("original:"))
    return dispatchOriginal(key.slice(9), {
      document,
      close: settlePanels,
      home: () => {
        stage("home");
        field.finishCreation();
        original = true;
        field.setPrismEnabled?.(false);
        document.body.classList.remove("confluence");
        $("#cf-return").hidden = false;
      },
    });
  if (key.startsWith("instrument:")) {
    await settlePanels();
    stage("atlas");
    return dispatchSecondary(key.slice(11), window.__instruments);
  }
  if (key.startsWith("nav:")) return open(key.slice(4));
  if (key.startsWith("remove-route:")) {
    routes = captureRoutes();
    routes.splice(Number(key.split(":")[1]), 1);
    $("#cf-content").innerHTML = routesPage();
    return;
  }
  if (key.startsWith("paint:")) {
    const i = Number(key.split(":")[1]),
      brush = val("brush"),
      name = val("world-name");
    customWorld.terrain[i] = brush;
    customWorld.name = name;
    worldEditor();
    $("#cf-brush").value = brush;
    return;
  }
  if (key.startsWith("cell:")) {
    match = playMove(match, Number(key.split(":")[1]), 1);
    while (match.winner === null && match.turn === 2) {
      const move = botMove(match);
      if (move === undefined) break;
      match = playMove(match, move, 2);
    }
    drawPrism();
    return;
  }
  if (actions[key]) return actions[key]();
}
async function submit(e) {
  if (e.target.closest(".ld-desk")) return;
  e.preventDefault();
  note("");
  const name = e.target.id;
  if (name === "ex-action-form") return extensionDesk.submit();
  if (name.startsWith("v4-")) return v4Desk.submit(name, $("#cf-content"));
  if (name === "ag-live-form") return liveDesk.submit($("#cf-content"));
  if (name === "exit-live-create") return liveExitDesk.submit($("#cf-content"));
  if (name.startsWith("burner-"))
    return burnerDesk.submit(name, $("#cf-content"), note);
  if (name === "cf-routes-form") {
    routes = validateRoutePlan(captureRoutes());
    const shares = splitExact(val("split-amount"), routes);
    saved("routes", routes);
    $("#cf-split-result").innerHTML =
      "<h3>Exact allocation</h3>" +
      shares
        .map((r) =>
          fact(
            r.recipient.slice(0, 8) + "…" + r.recipient.slice(-4),
            r.amount + " units",
          ),
        )
        .join("") +
      "<code>" +
      routeCommitment(routes) +
      "</code>";
    field.pulse = 1;
  } else if (name === "cf-connect-form") {
    note("Reading wallet and collection…");
    const snapshot = await wallet.connect(val("collection"), val("token"));
    saved("collection", wallet.collection);
    visualSeed = null;
    refreshIdentity();
    note(
      "Owner verified at block " +
        snapshot.block +
        ". NFT account balance: " +
        snapshot.balance +
        " native units.",
    );
  } else if (name === "cf-execute-form") {
    showTransaction(
      await wallet.prepare({
        target: val("target"),
        value: val("value"),
        data: val("calldata"),
      }),
    );
  }
}
async function toggleOriginal() {
  if (original) return open("home");
  await open("home");
  original = true;
  field.setPrismEnabled?.(false);
  field.finishCreation();
  field.open = false;
  document.body.classList.remove("confluence");
  $("#cf-return").hidden = false;
  $("#cf-return").textContent = "Return to Prism Cathedral ↗";
}

function soundState() {
  const synth = window.__idfbi?.audio;
  audioContext = synth?.context;
  analyser = synth?.analyser;
  const on = !!synth?.enabled && audioContext?.state === "running";
  const button = $("#cf-sound");
  if (button && button.getAttribute("aria-pressed") !== String(on)) {
    button.textContent = on ? "Sound on" : "Sound off";
    button.setAttribute("aria-pressed", String(on));
  }
  const originalButton = $("#sound");
  if (
    originalButton &&
    originalButton.getAttribute("aria-pressed") !== String(on)
  ) {
    originalButton.setAttribute("aria-pressed", String(on));
    const label = originalButton.querySelector("b");
    if (label) label.textContent = on ? "ON" : "OFF";
  }
  return synth;
}
async function sound() {
  const synth = soundState();
  if (!synth) throw Error("The object’s sound engine is still loading.");
  if (synth.enabled) await synth.disable();
  else await synth.enable(sourceIdentity());
  soundState();
}

async function boot() {
  if (!window.__instruments || !window.__idfbi || !document.body.dataset.ready)
    return false;
  localSnapshot = window.__idfbi.state();
  oldSeed = localSnapshot.seed;
  if (window.AWE_CHAIN_IDENTITY) {
    for (const [selector, key] of [
      ["#collection-input", "collection"],
      ["#token-input", "tokenId"],
    ]) {
      const input = $(selector);
      input.value = window.AWE_CHAIN_IDENTITY[key];
      input.readOnly = !window.ANIMA_SIM_SAMPLE;
    }
  }
  id = identityVector(window.AWE_CHAIN_IDENTITY || localSnapshot);
  const query = new URL(location.href);
  const seed = query.searchParams.get("seed");
  if (seed && /^0x[\da-f]{64}$/i.test(seed)) {
    visualSeed = seed;
    id = identityVector({ seed, genome: seed });
  }
  const nav = PRIMARY_CAPABILITIES.map(
    (x) =>
      `<button type="button" data-cf="${x.key}">${prismIcon(x.key)}<span>${x.label}</span></button>`,
  ).join("");
  $(".cf-dock").innerHTML = nav;
  $(".prism-mobile-nav").innerHTML = [
    ["home", "Home"],
    ["tools", "Tools"],
    ["memory", "Memory"],
    ["atlas", "Atlas"],
  ]
    .map(
      ([key, label]) =>
        `<button type="button" data-cf="${key}">${prismIcon(key)}<span>${label}</span></button>`,
    )
    .join("");
  $("#ag-functions").innerHTML = PRIMARY_CAPABILITIES.map(
    (x) =>
      `<button type="button" data-interior-route="${x.key}">${x.label}</button>`,
  ).join("");
  routes = read("routes", []);
  try {
    if (routes.length) routes = validateRoutePlan(routes);
  } catch {
    routes = [];
  }
  try {
    customWorld = validateWorld(read("world", defaultWorld()));
  } catch {
    customWorld = defaultWorld();
  }
  field = new ParticleField($("#cf-field"), id);
  field.connectBlue(window.__idfbi.renderer);
  interior = new GenesisInterior(field, {
    open,
    notify,
    sound,
    canExplore: () =>
      mode === "home" && !document.querySelector("dialog[open]"),
  });
  field.ceremonialReveal = false;
  prismPreferences = normalizePrismPreferences(read("prism-preferences", {}));
  applyPrismPreferences();
  refreshIdentity();
  // The UI is independently legible and never harvests private text into the optical field.
  const panels = [$("#cf-dialog"), $("#instrument-dialog")];
  panels.forEach((panel) => panel.classList.add("ab-surface"));
  const panelObserver = new MutationObserver(() => {
    if (
      !panels.some((panel) => panel.open) &&
      mode !== "home" &&
      !interior.active
    )
      stage("home");
  });
  panels.forEach((panel) =>
    panelObserver.observe(panel, {
      attributes: true,
      attributeFilter: ["open"],
    }),
  );
  field.onSurfacesEmpty = () => {
    if (mode !== "home") stage("home");
  };
  field.onSurfaceOpen = (panel) => {
    if (original || mode === "home")
      stage(panel.id === "instrument-dialog" ? "trade" : "identity");
  };
  paintIdentity();
  $("#cf-motion").setAttribute("aria-pressed", String(field.motion));
  updateMotionLabel();
  $("#cf-renderer").textContent = "PRISM CATHEDRAL II · LIVING MATTER";
  v4Desk.onLock = () => {
    commonsDesk.lock();
    launchDesk.chain.disconnect();
    workshop.lock();
    liveDesk.lock();
    burnerDesk.lock();
    wallet.disconnect();
    window.__idfbi.lockSigningSession?.();
  };
  v4Desk.attach();
  v4Desk.onReturn = () => open("home");
  $("#ag-entry").addEventListener("click", (e) => {
    const button = e.target.closest("[data-genesis]");
    if (button?.dataset.genesis === "hide") {
      wallet.disconnect();
      v4Desk.lock(true);
      return;
    }
    if (button)
      open(button.dataset.genesis).catch((err) => notify(err.message));
  });
  $("#cf-ui").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cf]");
    if (!b) return;
    const key = b.dataset.cf;
    Promise.resolve()
      .then(async () => {
        if (key === "motion") {
          $("#motion").click();
          await Promise.resolve();
          field.motion = window.__idfbi.renderer.motion;
          $("#cf-motion").setAttribute("aria-pressed", String(field.motion));
          updateMotionLabel();
          prismPreferences.motion = field.motion;
          saved("prism-preferences", prismPreferences);
        } else if (key === "interior-reset") {
          await interior.leave();
          interior.enter();
          document.body.dataset.prismInterior = "true";
        } else if (key === "reset") {
          await open("home");
          window.__idfbi.renderer.reset();
          field.yaw = 0;
          field.pitch = -0.18;
          field.zoom = 1;
        } else if (key === "sound") return sound();
        else if (key === "original") toggleOriginal();
        else if (key === "portrait") actions.portrait();
        else open(key);
      })
      .catch((err) => notify(err.message));
  });
  $("#ag-resume").addEventListener("click", () => open("interior"));
  $("#cf-close").addEventListener("click", returnFromFunction);
  $("#ix-close").addEventListener("click", returnFromFunction);
  $("#cf-dialog").addEventListener("cancel", (e) => {
    e.preventDefault();
    returnFromFunction();
  });
  $("#cf-dialog").addEventListener("click", (e) => {
    if (e.target.closest(".ld-desk")) return;
    if (mode === "extensions" && e.target.closest("#ex-custom button"))
      extensionDesk.invalidate();
    const b = e.target.closest("[data-do]");
    if (b) {
      e.preventDefault();
      b.disabled = true;
      Promise.resolve()
        .then(() => action(b.dataset.do))
        .catch((err) => note(err.message))
        .finally(() => {
          b.disabled = false;
        });
    }
  });
  $("#cf-dialog").addEventListener("input", (e) => {
    if (changePrismPreference(e.target)) return;
    if (e.target.id === "prism-atlas-query") return searchAtlas(e.target.value);
    if (e.target.closest(".ld-desk")) return;
    if (mode === "extensions") {
      if (e.target.closest("#ex-custom")) extensionDesk.invalidate();
      else extensionDesk.change(e.target);
    }
    if (e.target.id?.startsWith("wk-")) workshop.change($("#cf-content"));
    if (e.target.id?.startsWith("v4-"))
      v4Desk.change(e.target, $("#cf-content"));
    if (e.target.id?.startsWith("ag-live-")) {
      liveDesk.invalidate();
      $("#cf-transaction-review")?.replaceChildren();
      $("#ag-live-summary")?.replaceChildren();
      note("Terms changed. Simulate again to review these values.");
    }
    if (e.target.id?.startsWith("exit-live-") && wallet.plan) {
      wallet.plan = null;
      $("#cf-transaction-review").replaceChildren();
      $("#cf-exit-terms").replaceChildren();
      note("Terms changed. Prepare a new transaction review.");
    }
  });
  $("#cf-dialog").addEventListener("submit", (e) =>
    submit(e).catch((err) => note(err.message)),
  );
  $("#cf-dialog").addEventListener("change", async (e) => {
    if (e.target.closest(".ld-desk")) return;
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      if (e.target.id === "wk-import")
        return await workshop.importFile(file, $("#cf-content"));
      if (e.target.id === "cf-archive-upload") {
        if (file.size > 67108864) throw Error("Archive exceeds 64 MiB.");
        archiveCandidate = await validateConfluenceArchive(
          JSON.parse(await file.text()),
          (data, seed) =>
            window.__instruments.engine().constructor.restore(data, seed),
        );
        $("#cf-archive-review").innerHTML =
          "<h3>Archive verified</h3>" +
          fact("Origin", archiveCandidate.seed) +
          fact("Origin receipts", archiveCandidate.originReceipts) +
          fact("Instrument events", archiveCandidate.instrumentEvents) +
          "<p>This replaces local saved data and reloads the experience. Your current archive downloads first. Imported receipts are local records; they grant no wallet authority.</p>" +
          B("restore-archive", "Back up current data & restore", "primary");
        return;
      }
      if (file.size > 1048576) throw Error("File exceeds 1 MiB.");
      if (e.target.id === "cf-game-upload")
        await launchHTML(await file.text(), file.name);
      if (e.target.id === "cf-world-upload") {
        customWorld = validateWorld(JSON.parse(await file.text()));
        worldEditor();
      }
    } catch (err) {
      note(err.message);
    }
  });
  $("#cf-return").addEventListener("click", toggleOriginal);
  addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (
        !document.querySelector(
          "dialog:modal:not(#cf-dialog):not(#instrument-dialog)",
        )
      )
        open("atlas");
    } else if (
      e.key === "Escape" &&
      !original &&
      mode !== "home" &&
      !document.querySelector("dialog:modal")
    ) {
      returnFromFunction();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && wallet.connected)
      wallet.refreshSnapshot().catch((error) => notify(error.message));
  });
  const audioBins = new Uint8Array(64);
  let lastStateFrame = 0,
    lastSelection = "";
  const syncFrame = (now) => {
    if (!field || document.hidden) return;
    const synth = soundState();
    if (analyser && synth.enabled && audioContext.state === "running") {
      analyser.getByteFrequencyData(audioBins);
      field.audio =
        audioBins.reduce((sum, value) => sum + value, 0) / (64 * 255);
    } else field.audio = 0;
    if (now - lastStateFrame < 400) return;
    lastStateFrame = now;
    const snapshot = window.__idfbi.state(),
      originChanged = snapshot.seed !== oldSeed;
    if (snapshot.root !== localSnapshot.root || originChanged) {
      localSnapshot = snapshot;
      oldSeed = snapshot.seed;
      if (originChanged) routes = read("routes", []);
    }
    const before = selectedContext.get(),
      context = selectedContext.update(selectionInput());
    if (context !== before || !lastSelection) {
      lastSelection = context.mode;
      refreshIdentity();
    }
    const form = window.__instruments.memory().form,
      key = context.localLife
        ? form?.root || ""
        : "chain:" + context.mode + ":" + context.source?.root;
    if (key !== lastForm) {
      lastForm = key;
      $("#cf-traces").textContent = context.localLife
        ? (form?.count || 0) + " local traces"
        : "Onchain identity";
      field.life =
        context.localLife && form
          ? form.traits.reduce((sum, value) => sum + Math.abs(value), 0)
          : 0;
    }
    if ($("#instrument-dialog").open && mode !== "home") {
      const view = window.__instruments.view();
      if (forms[view] && mode !== view) {
        stage(view);
        $("#cf-form").textContent = forms[view];
      }
    }
  };
  (window.__animaFrameSubscribers ??= new Set()).add(syncFrame);

  window.__confluence = {
    previewSnapshot: (snapshot) => {
      if (wallet.connected)
        throw Error("Disconnect the NFT before selecting a recorded sample.");
      if (
        !window.ANIMA_SIM_SAMPLE ||
        !snapshot ||
        snapshot.seed !== window.ANIMA_SIM_SAMPLE.mint.seed
      )
        throw Error("This state belongs to a different sample.");
      visualSeed = null;
      window.AWE_CHAIN_IDENTITY = structuredClone(snapshot);
      refreshIdentity();
    },
    identity: () => structuredClone(id),
    field,
    wallet,
    interior,
    open,
    mode: () => mode,
    capabilities: [...CAPABILITIES],
    selection: () => selectedContext.get(),
    capabilityRegistry: PRIMARY_CAPABILITIES,
    version: "7.1.0-prism",
    appearance: () => ({ ...prismPreferences }),
    originalActions: ORIGINAL_ACTIONS.map((x) => x[0]),
    secondaryViews: SECONDARY_VIEWS.map((x) => x[0]),
  };
  document.body.dataset.confluenceReady = "true";
  window.addEventListener("hashchange", () =>
    openLaunchLink().catch((error) => notify(error.message)),
  );
  if (!(await openLaunchLink()))
    await open(
      catalog[query.searchParams.get("realm")]
        ? query.searchParams.get("realm")
        : "home",
    );
  return true;
}
const ready = setInterval(() => {
  boot()
    .then((ok) => {
      if (ok) clearInterval(ready);
    })
    .catch((e) => {
      clearInterval(ready);
      console.error(e);
      original = true;
      if (field) {
        field.unfold = 0;
        field.updateBlue?.();
        field.active = false;
        field.setSurfaceActive?.(false);
      }
      document.body.classList.remove("confluence");
      const renderer = window.__idfbi?.renderer;
      if (renderer) {
        cancelAnimationFrame(renderer.raf);
        renderer.last = 0;
        renderer.dirty = true;
        renderer.raf = requestAnimationFrame(renderer.tick);
      }
      const retry = $("#cf-return");
      retry.hidden = false;
      retry.textContent = "Retry Anima Genesis";
      retry.onclick = () => location.reload();
      $("#cf-toast").textContent =
        "The particle view could not open. The original experience is available; you can retry Anima Genesis.";
    });
}, 50);
