import { ConfluenceWallet } from '../confluence/wallet.mjs';
import { RegistryAdapter } from './adapter.mjs';
import { ModuleHostSession, ModuleState, ReviewedAction, previewMigration, commitMigration, boundedJSON } from './host.mjs';
import { mountScene, sceneFromRelease, mountHTML } from './runtime.mjs';
import { EXAMPLES, examplePackage } from './examples.mjs';
import { prepareJournal, exportJournalPacket, decryptJournalPacket, JOURNAL_PACKET_BYTES } from './journal.mjs';
import { ZERO_HASH, hashValue } from '../../packages/modules/sdk.mjs';
import { PrismArtwork } from '../genesis/prism-art.mjs';
var escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var short = (value) => value ? String(value).slice(0, 8) + "\u2026" + String(value).slice(-6) : "\u2014";
var json = (value) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v, 2);
var mounts = 0;
var tabGlyph = { catalog: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>', installed: '<path d="m12 2 9 5v10l-9 5-9-5V7zm0 10 9-5M12 12 3 7m9 5v10"/>', history: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>', journal: '<path d="M12 5C8 2 5 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-3-1-6-2-10 1zm0 0v15"/>' };
var tabIcon = (id2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">${tabGlyph[id2]}</svg>`;
var moduleEmblem = (index = 0) => `<svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><circle cx="60" cy="60" r="49" stroke="#477cff" stroke-opacity=".3"/>${Array.from({ length: 12 }, (_, n2) => `<ellipse cx="60" cy="60" rx="${17 + index * 3}" ry="43" transform="rotate(${n2 * 15} 60 60)" stroke="${["#7ceaff", "#b09bff", "#f2a9da"][index % 3]}" stroke-opacity="${n2 % 3 === 0 ? ".7" : ".3"}" stroke-width=".7"/>`).join("")}<circle cx="60" cy="60" r="4" fill="#f4f0ff"/><path d="M60 6v12m0 84v12M6 60h12m84 0h12" stroke="#b09bff" stroke-width=".6"/></svg>`;
var fields = (prefix, values) => [["chainId", "Chain ID", "31337"], ["collection", "NFT collection", "0x\u2026"], ["tokenId", "Token ID", "1"], ["registry", "Module registry", "0x\u2026"]].map(([name, label, placeholder]) => `<label for="${prefix}-${name}">${label}<input id="${prefix}-${name}" name="${name}" value="${escape(values[name] ?? "")}" placeholder="${placeholder}" ${["chainId", "tokenId"].includes(name) ? 'inputmode="numeric"' : ""} autocomplete="off" required></label>`).join("");
export function workbenchMarkup(prefix, options = {}) {
  return `<div class="am-backdrop" aria-hidden="true"></div><header class="am-top"><a class="am-brand" href="${escape(options.originalHref ?? "../index.html")}" data-action="original"><span>ANIMA<small>A LIVING IDENTITY</small></span></a><span class="am-edition">PRISM CATHEDRAL <span>/ II</span></span><div class="am-top-right"><span class="am-status-pill" data-node="connection">Not connected</span><button class="am-text-button" data-action="close">Original \u2197</button></div></header>
 <section class="am-intro" aria-labelledby="${prefix}-title"><div><span class="am-eyebrow">ATLAS / MODULE WORKBENCH</span><h1 id="${prefix}-title">A living library.</h1></div><p>Tools, memories and small worlds for the NFT you already own. Recover a release. Read its permissions. Choose what runs.</p></section>
 <section class="am-identity am-card" aria-labelledby="${prefix}-identity-title"><div class="am-section-heading"><div><span class="am-eyebrow">YOUR NFT / CONNECTION</span><h2 id="${prefix}-identity-title">The same NFT. The same account.</h2></div><button class="am-text-button" data-action="disconnect" hidden data-node="disconnect">Disconnect workbench</button></div><form data-form="identity" class="am-identity-form">${fields(prefix, options)}<button class="am-primary" type="submit">Connect & read</button></form><p class="am-muted" data-node="identity-summary">Connecting checks the current owner, account and custody epoch. It does not install or send anything.</p></section>
 <p class="am-notice" role="status" aria-live="polite" data-node="status">Explore a local example, or connect your NFT to read its module registry.</p>
 <div class="am-layout"><aside class="am-loom-panel am-card" aria-labelledby="${prefix}-loom-title"><div class="am-loom-heading"><span class="am-eyebrow">THE LIVING LOOM</span><span class="am-small-badge">PROCEDURAL STUDY</span></div><div class="am-loom-stage"><canvas class="am-loom-canvas" data-node="loom-canvas" aria-hidden="true"></canvas><div class="am-loom-axis" aria-hidden="true"></div></div><div class="am-loom-caption"><h2 id="${prefix}-loom-title">One identity.<br> Room to grow.</h2><p>The artwork is a visual study. Releases and permissions are read separately from the selected registry.</p><button class="am-text-button" type="button" data-action="toggle-motion" data-node="motion" aria-pressed="true">Pause artwork</button></div></aside><section class="am-main" aria-label="Module library"><div class="am-section-heading"><div><span class="am-eyebrow">RELEASE DIRECTORY</span><h2>Choose what becomes possible.</h2></div><button data-action="refresh" class="am-secondary">Refresh \u21BB</button></div><nav class="am-tabs" role="tablist" aria-label="Workbench views">${[["catalog", "Discover"], ["installed", "Installed"], ["history", "History"], ["journal", "Journal"]].map(([id2, label], i) => `<button type="button" role="tab" id="${prefix}-tab-${id2}" data-tab="${id2}" aria-controls="${prefix}-panel-${id2}" aria-selected="${i === 0}" aria-pressed="${i === 0}" tabindex="${i === 0 ? "0" : "-1"}">${tabIcon(id2)}<span>${label}</span></button>`).join("")}</nav>
 <section role="tabpanel" id="${prefix}-panel-catalog" aria-labelledby="${prefix}-tab-catalog" tabindex="0" data-panel="catalog"><div class="am-list" data-node="catalog"><div class="am-empty">Published releases will appear here after connecting to a registry.</div></div><button class="am-text-button" data-action="more-catalog" hidden data-node="more-catalog">Read next releases \u2192</button> <section class="am-example-section"><div class="am-section-heading"><div><span class="am-eyebrow">LOCAL PREVIEWS</span><h3>A small beginning.</h3></div><span class="am-small-badge">LOCAL EXAMPLES</span></div><div class="am-examples">${EXAMPLES.map((example, i) => `<button class="am-example am-example-${i}" data-example="${example.id}"><span class="am-example-art" aria-hidden="true">${moduleEmblem(i)}</span><small>${escape(example.kind)}</small><strong>${escape(example.title)}</strong><span>${escape(example.description)}</span><b>Open local preview <span aria-hidden="true">\u2197</span></b></button>`).join("")}</div><p class="am-muted">These samples are not published or installed. Their signing requests remain previews until a verified release is installed.</p></section></section>
 <section role="tabpanel" id="${prefix}-panel-installed" aria-labelledby="${prefix}-tab-installed" tabindex="0" data-panel="installed" hidden><div class="am-list" data-node="installed"><div class="am-empty">Your NFT\u2019s selected versions and enabled modules will appear here.</div></div><button class="am-text-button" data-action="more-installed" hidden data-node="more-installed">Read next modules \u2192</button></section>
 <section role="tabpanel" id="${prefix}-panel-history" aria-labelledby="${prefix}-tab-history" tabindex="0" data-panel="history" hidden><div class="am-list" data-node="history"><div class="am-empty">Installations, version changes, state writes and disables remain in the registry history.</div></div><button class="am-text-button" data-action="more-history" hidden data-node="more-history">Read next history page \u2192</button></section>
 <section role="tabpanel" id="${prefix}-panel-journal" aria-labelledby="${prefix}-tab-journal" tabindex="0" data-panel="journal" hidden><form data-form="journal" class="am-card am-form"><span class="am-eyebrow">PERSONAL MEMORY</span><h3>A note you choose to keep.</h3><label for="${prefix}-ledger">Existing MemoryLedger<input id="${prefix}-ledger" name="ledger" placeholder="0x\u2026" autocomplete="off" required></label><label for="${prefix}-note">Your words<textarea id="${prefix}-note" name="text" rows="5" maxlength="3000" placeholder="An idea, a dedication, a moment\u2026" required></textarea></label><p class="am-muted">Up to 3,000 UTF-8 bytes. Encrypted entries keep the words private with your passphrase; their identity metadata remains public.</p><label for="${prefix}-privacy">Publication privacy<select id="${prefix}-privacy" name="mode"><option value="encrypted" selected>Encrypted words \xB7 public ciphertext</option><option value="public">Public words</option></select></label><label for="${prefix}-passphrase" data-node="journal-passphrase-group">Encryption passphrase<input id="${prefix}-passphrase" type="password" name="passphrase" autocomplete="new-password" minlength="12" maxlength="1024" placeholder="At least 12 characters; never a wallet seed" required></label><label class="am-check"><input type="checkbox" name="consent" required><span data-node="journal-consent">Publish this encrypted packet permanently. Its identity metadata remains public; I will keep the passphrase to recover the words.</span></label><button class="am-primary" type="submit">Review personal inscription</button><button type="button" class="am-text-button" data-action="export-journal" data-node="export-journal" disabled>Export prepared encrypted packet \u2193</button><p class="am-muted">Encryption happens locally before transaction review. No module can inscribe automatically. Exporting a packet does not publish it.</p></form><details class="am-card am-journal-recovery"><summary>Recover an encrypted journal packet</summary><div class="am-form"><p class="am-muted">Paste its exact exported JSON or import the file. Recovery is local and needs no wallet. The authenticated header shows the original NFT, owner and custody epoch, including historical entries.</p><label for="${prefix}-packet">Encrypted packet<textarea id="${prefix}-packet" rows="5" data-node="journal-packet" spellcheck="false"></textarea></label><label class="am-file" for="${prefix}-packet-file">Read an exported packet<input id="${prefix}-packet-file" type="file" accept="application/json,.json" data-node="journal-packet-file"></label><label for="${prefix}-recovery-passphrase">Recovery passphrase<input id="${prefix}-recovery-passphrase" type="password" autocomplete="off" data-node="recovery-passphrase"></label><button type="button" class="am-secondary" data-action="decrypt-journal">Decrypt local preview</button><button type="button" class="am-text-button" data-action="clear-journal-preview">Clear recovered words</button><pre data-node="journal-decrypted" hidden></pre></div></details></section>
</section>
 <aside class="am-inspector am-card" aria-labelledby="${prefix}-inspector-title"><span class="am-eyebrow">RECOVER / INSPECT</span><h2 id="${prefix}-inspector-title" tabindex="-1">Release inspector</h2><form data-form="recover" class="am-form"><label for="${prefix}-release">Exact release ID<input id="${prefix}-release" name="releaseId" placeholder="0x\u2026" autocomplete="off" required></label><button class="am-secondary" type="submit">Recover package</button></form><div data-node="package" class="am-package"><div class="am-empty">Select a release to inspect its publisher, exact version, capabilities and recovered files.</div></div><div class="am-actions"><button data-action="install" class="am-primary" disabled data-node="install">Review installation</button><button data-action="launch" class="am-secondary" disabled data-node="launch">Open isolated module</button><button data-action="disable" class="am-text-button" disabled data-node="disable">Review disable</button><button data-action="export-package" class="am-text-button" disabled data-node="export-package">Export recovered package \u2193</button></div>
 <details class="am-state" data-node="state-details"><summary>State, history & migration</summary><p class="am-muted">Local drafts are namespaced to this NFT, module and schema. Chain snapshots are public and require a separate review.</p><div data-node="state-summary" class="am-muted">No module selected.</div><div class="am-actions"><button data-action="restore-chain" data-node="restore-chain" class="am-secondary" disabled>Preview chain state</button><button data-action="export-state" class="am-text-button" disabled>Export browser draft \u2193</button></div><label for="${prefix}-migration">Candidate state \xB7 JSON<textarea id="${prefix}-migration" data-node="migration-json" rows="5" placeholder='{"draft": {}}'></textarea></label><label class="am-file">Read a JSON file<input type="file" accept="application/json,.json" data-node="migration-file"></label><button data-action="preview-migration" class="am-secondary" disabled>Preview migration</button><pre data-node="migration-preview" hidden></pre><button data-action="commit-migration" class="am-secondary" disabled data-node="commit-migration">Apply reviewed browser draft</button><label class="am-check"><input type="checkbox" data-node="state-consent"><span>I approve publishing this state onchain.</span></label><div class="am-actions"><button data-action="save-state" class="am-secondary" disabled>Review chain snapshot</button><button data-action="stage-state" class="am-secondary" disabled>Review staged migration</button></div><p class="am-muted" data-node="staged">A schema change requires a staged snapshot, then a separate reviewed activation.</p></details></aside></div>
 <section class="am-continuity am-card" aria-labelledby="${prefix}-continuity-title"><div class="am-section-heading"><div><span class="am-eyebrow">YOUR CONTINUITY</span><h2 id="${prefix}-continuity-title">Every version has a way home.</h2></div><button class="am-secondary" type="button" data-action="open-state">Open state & migration</button></div><ol class="am-steps"><li><span>01</span><div><strong>Recover release</strong><p>Read its exact package and permissions.</p></div></li><li><span>02</span><div><strong>Preview state</strong><p>Inspect a snapshot before applying it.</p></div></li><li><span>03</span><div><strong>Stage migration</strong><p>Review the next state separately.</p></div></li><li><span>04</span><div><strong>Activate version</strong><p>Select only the release you reviewed.</p></div></li></ol></section>
 <section class="am-runtime am-card" hidden data-node="runtime"><div class="am-section-heading"><div><span class="am-eyebrow">ISOLATED SESSION</span><h2 data-node="runtime-title">Your module</h2></div><button data-action="close-runtime" class="am-secondary">Close module \xD7</button></div><p class="am-muted" data-node="runtime-status">Only declared capabilities are available. Every transaction returns here for review.</p><div class="am-frame" data-node="runtime-container"></div></section>
 <footer class="am-footer"><span>ANIMA <span aria-hidden="true">/</span> PRISM CATHEDRAL II</span><span>Publishing a release does not change your selected version.</span></footer>
 <dialog class="am-review" data-node="review" aria-labelledby="${prefix}-review-title" aria-describedby="${prefix}-review-note"><div class="am-review-body"><span class="am-eyebrow">PAUSE \xB7 READ \xB7 CHOOSE</span><h2 id="${prefix}-review-title" data-node="review-title">Review this action</h2><div data-node="review-summary"></div><pre data-node="review-content"></pre><div class="am-actions"><button data-action="cancel-review" class="am-secondary">Cancel</button><button data-action="confirm-review" class="am-primary" data-node="confirm-review">Sign this reviewed transaction</button></div><p id="${prefix}-review-note" class="am-muted" data-node="review-note">Only this exact action will be submitted. A changed owner, epoch, module or review invalidates it.</p></div></dialog>`;
}
export function mountWorkbench(container, options = {}) {
  if (!container?.ownerDocument) throw Error("A workbench container is required.");
  const prefix = "am-" + ++mounts, doc = container.ownerDocument, win = doc.defaultView ?? globalThis.window;
  const suppliedWallet = options.wallet, wallet = suppliedWallet ?? new ConfluenceWallet((message, type) => {
    if (type === "invalidate") invalidate(message);
  });
  const initial = { ...options, ...wallet.connected ? { chainId: String(wallet.chainId), collection: wallet.collection, tokenId: String(wallet.tokenId) } : {} };
  container.classList.add("anima-modules");
  container.innerHTML = workbenchMarkup(prefix, initial);
  const q = (name) => container.querySelector(`[data-node="${name}"]`), form = (name) => container.querySelector(`[data-form="${name}"]`);
  let adapter, identity, view, selected, state, migration, staged, runtime, session, review, reviewMode = "transaction", runtimeApproval, journalPacket, journalDecryptRevision = 0, disposed = false, generation = 0, busy = 0;
  let cursors = { catalog: 0, modules: 0, history: 0 };
  const storage = options.storage ?? win.localStorage;
  const reducedMotion = win.matchMedia?.("(prefers-reduced-motion: reduce)");
  let motionEnabled = !reducedMotion?.matches, artFrame = 0, artVisible = true, artClock = 12, artTick = null;
  const artwork = new PrismArtwork(q("loom-canvas"), { identity: "ANIMA Prism Cathedral Module Workbench", mode: "modules", quality: "auto" });
  const motionLabel = () => {
    q("motion").textContent = motionEnabled ? "Pause artwork" : "Animate artwork";
    q("motion").setAttribute("aria-pressed", String(motionEnabled));
  };
  const stopArtwork = () => {
    if (artFrame) win.cancelAnimationFrame(artFrame);
    artFrame = 0;
    artTick = null;
  };
  const drawArtwork = (time = 0) => {
    artFrame = 0;
    if (disposed || doc.hidden || !artVisible) return;
    if (motionEnabled && artTick !== null) artClock += Math.min((time - artTick) / 1e3, 0.1);
    artTick = time;
    const rect = q("loom-canvas").getBoundingClientRect();
    artwork.draw({ width: rect.width, height: rect.height, time: artClock, motion: motionEnabled, zoom: 0.91, background: false });
    if (motionEnabled) artFrame = win.requestAnimationFrame(drawArtwork);
  };
  const refreshArtwork = () => {
    stopArtwork();
    if (!disposed && !doc.hidden && artVisible) artFrame = win.requestAnimationFrame(drawArtwork);
  };
  const systemMotion = () => {
    if (reducedMotion.matches) motionEnabled = false;
    motionLabel();
    refreshArtwork();
  };
  const artResize = win.ResizeObserver ? new win.ResizeObserver(refreshArtwork) : null;
  artResize?.observe(q("loom-canvas"));
  const artIntersection = win.IntersectionObserver ? new win.IntersectionObserver((entries) => {
    artVisible = entries[0]?.isIntersecting ?? true;
    refreshArtwork();
  }, { rootMargin: "100px" }) : null;
  artIntersection?.observe(q("loom-canvas"));
  reducedMotion?.addEventListener?.("change", systemMotion);
  doc.addEventListener("visibilitychange", refreshArtwork);
  motionLabel();
  refreshArtwork();
  const status = (message, error = false) => {
    if (disposed) return;
    q("status").textContent = message;
    q("status").classList.toggle("am-error", error);
  };
  const clearJournalSecrets = () => {
    journalDecryptRevision++;
    form("journal").elements.passphrase.value = "";
    form("journal").elements.text.value = "";
    form("journal").elements.consent.checked = false;
    q("recovery-passphrase").value = "";
    q("journal-decrypted").textContent = "";
    q("journal-decrypted").hidden = true;
  };
  const closeRuntime = () => {
    runtime?.destroy();
    runtime = null;
    session?.close();
    session = null;
    q("runtime").hidden = true;
  };
  const closeReview = () => {
    review?.invalidate();
    runtimeApproval = null;
    q("review").close?.();
    q("review").removeAttribute("open");
  };
  function invalidate(message = "Workbench selection changed. Connect and review again.") {
    generation++;
    clearJournalSecrets();
    closeRuntime();
    closeReview();
    adapter = null;
    identity = null;
    view = null;
    selected = null;
    state = null;
    migration = null;
    staged = null;
    q("connection").textContent = "Not connected";
    q("disconnect").hidden = true;
    q("migration-json").value = "";
    q("migration-preview").textContent = "";
    q("migration-preview").hidden = true;
    q("commit-migration").disabled = true;
    q("state-consent").checked = false;
    q("staged").textContent = "A schema change requires a staged snapshot, then a separate reviewed activation.";
    q("identity-summary").textContent = "Connecting checks the current owner, account and custody epoch. It does not install or send anything.";
    drawList("catalog", [], "Published releases will appear here after connecting to a registry.");
    drawList("installed", [], "Your NFT\u2019s selected versions and enabled modules will appear here.");
    drawList("history", [], "Connect a registry to read this NFT\u2019s release and state history.");
    for (const node of ["more-catalog", "more-installed", "more-history"]) q(node).hidden = true;
    renderPackage();
    status(message);
  }
  const run = async (task) => {
    if (disposed) return;
    busy++;
    container.setAttribute("aria-busy", "true");
    try {
      return await task();
    } catch (error) {
      status(error.message || String(error), true);
      return void 0;
    } finally {
      busy--;
      if (!disposed) container.setAttribute("aria-busy", String(busy > 0));
    }
  };
  const requireSelection = () => {
    if (!selected || !state) throw Error("Recover or open a module first.");
  };
  const requireLive = () => {
    requireSelection();
    if (!adapter || !identity || selected.local) throw Error("Connect the NFT and select a recovered onchain release for this action.");
  };
  const drawList = (node, items, empty2) => {
    q(node).innerHTML = items.length ? items.join("") : `<div class="am-empty">${empty2}</div>`;
  };
  function renderView() {
    if (!view) return;
    q("connection").textContent = "NFT #" + identity.tokenId + " \xB7 connected";
    q("disconnect").hidden = false;
    q("identity-summary").textContent = `Account ${identity.account} \xB7 owner ${identity.owner} \xB7 custody epoch ${identity.epoch} \xB7 block ${BigInt(view.snapshot.block)}`;
    drawList("catalog", view.catalog.map((entry) => entry.invalid ? `<article class="am-release"><span><strong>Unsupported release</strong><code>${escape(entry.releaseId)}</code><small>${escape(entry.error)}</small></span></article>` : `<button class="am-release" data-release="${entry.releaseId}"><span class="am-release-icon">\u25C7</span><span><strong>${escape(entry.manifest.name)}</strong><small>Version ${entry.manifest.version} \xB7 ${escape(short(entry.manifest.publisher))}</small><small>${escape(entry.manifest.capabilities.join(" \xB7 ") || "No host capabilities")}</small></span><span class="am-release-arrow">\u2197</span></button>`), "No releases are published at this registry page.");
    drawList("installed", view.modules.map((entry) => `<button class="am-release" data-release="${entry.releaseId}"><span class="am-release-icon">${entry.enabled ? "\u2726" : "\u25CB"}</span><span><strong>${escape(short(entry.moduleKey))}</strong><small>${entry.enabled ? "Enabled" : "Disabled"} \xB7 release ${escape(short(entry.releaseId))}</small><small>State ${escape(short(entry.stateHead))}</small></span><span class="am-release-arrow">\u2197</span></button>`), "No modules have been selected for this NFT yet.");
    drawList("history", view.history.map((entry) => `<button class="am-history-item" data-release="${entry.releaseId}" data-state-head="${entry.stateHead}"><span>${{ 1: "Activated", 2: "Disabled", 3: "State saved" }[Number(entry.operation)] ?? "Changed"}</span><strong>${escape(short(entry.moduleKey))}</strong><small>Epoch ${escape(entry.epoch)} \xB7 ${escape(new Date(Number(entry.at) * 1e3).toISOString())}</small><code>${escape(short(entry.root))}</code></button>`), "No changes recorded on this page.");
    for (const [key, node] of [["catalog", "more-catalog"], ["modules", "more-installed"], ["history", "more-history"]]) q(node).hidden = view.cursors[key] >= view.counts[key];
  }
  async function refresh(reset = false) {
    if (!adapter) throw Error("Connect an NFT and module registry first.");
    const revision = generation;
    if (reset) cursors = { catalog: 0, modules: 0, history: 0 };
    const next = await adapter.refresh({ catalogCursor: cursors.catalog, moduleCursor: cursors.modules, historyCursor: cursors.history });
    if (revision !== generation || disposed) return;
    view = next;
    identity = next.identity;
    renderView();
    status("Read the registry and exact release metadata at block " + BigInt(view.snapshot.block) + ".");
  }
  function renderPackage() {
    for (const name of ["install", "disable", "launch", "export-package"]) q(name).disabled = !selected;
    for (const name of ["export-state", "preview-migration"]) container.querySelector(`[data-action="${name}"]`).disabled = !selected;
    for (const name of ["restore-chain", "save-state", "stage-state"]) container.querySelector(`[data-action="${name}"]`).disabled = !selected || selected.local || !identity;
    for (const node of container.querySelectorAll("[data-release]")) node.setAttribute("aria-pressed", String(!!selected && !selected.local && node.dataset.release === selected.releaseId));
    for (const node of container.querySelectorAll("[data-example]")) node.setAttribute("aria-pressed", String(!!selected && !!selected.local && node.dataset.example === selected.manifest.name));
    if (!selected) {
      q("package").innerHTML = '<div class="am-empty">Select a release to inspect its publisher, exact version, capabilities and recovered files.</div>';
      q("state-summary").textContent = "No module selected.";
      return;
    }
    const m = selected.manifest;
    q("package").innerHTML = `<span class="am-small-badge">${selected.local ? "LOCAL SAMPLE" : "RECOVERED & HASH VERIFIED"}</span><h3>${escape(selected.label ?? m.name)}</h3><dl><dt>Version</dt><dd>${m.version}</dd><dt>Publisher</dt><dd><code>${escape(m.publisher)}</code></dd><dt>Release</dt><dd><code>${escape(selected.releaseId)}</code></dd><dt>Schema</dt><dd><code>${escape(m.stateSchema)}</code></dd><dt>Entrypoint</dt><dd>${escape(selected.entrypoint)}</dd><dt>Dependencies</dt><dd>${selected.dependencies?.length ?? 0} exact releases</dd></dl><div class="am-capabilities">${m.capabilities.map((cap) => `<span>${escape(cap)}</span>`).join("") || "<span>No host capabilities</span>"}</div><details><summary>Verified package files</summary><ul>${selected.files.map((file) => `<li><code>${escape(file.path)}</code> \xB7 ${file.bytes.length} bytes</li>`).join("")}</ul></details>`;
    q("install").disabled = selected.local || !identity;
    q("disable").disabled = selected.local || !identity;
    q("install").textContent = selected.installation?.releaseId !== ZERO_HASH && selected.installation?.releaseId ? "Review version / activation" : "Review installation";
    q("restore-chain").textContent = selected.historyStateHead !== void 0 ? "Preview historical snapshot" : "Preview chain state";
    q("state-summary").textContent = (selected.historyStateHead !== void 0 ? "Historical snapshot " + short(selected.historyStateHead) + ". " : "") + "Browser draft \xB7 " + new TextEncoder().encode(json(state?.read() ?? {})).length + " bytes. " + (selected.installation?.stateHead && selected.installation.stateHead !== ZERO_HASH ? "A chain snapshot is available." : "No selected chain snapshot.");
  }
  async function choose(release, local = false, historyStateHead) {
    if (historyStateHead !== void 0) hashValue(historyStateHead);
    closeRuntime();
    closeReview();
    const revision = ++generation;
    let recovered = local ? await examplePackage(release) : await adapter?.recover(release);
    if (!recovered) throw Error("Connect an NFT registry before recovering a release.");
    if (revision !== generation || disposed) return;
    selected = recovered;
    selected.historyStateHead = historyStateHead;
    migration = null;
    staged = null;
    if (!local) {
      selected.installation = await adapter.installation(selected.moduleKey);
      if (revision !== generation) return;
    }
    const context = identity ?? previewIdentity;
    state = new ModuleState({ storage, identity: context, moduleKey: selected.moduleKey, stateSchema: selected.manifest.stateSchema, maxBytes: selected.manifest.resources?.maxStateBytes });
    q("migration-json").value = json(state.read());
    q("migration-preview").hidden = true;
    q("commit-migration").disabled = true;
    q("state-consent").checked = false;
    q("staged").textContent = "A schema change requires a staged snapshot, then a separate reviewed activation.";
    renderPackage();
    status(local ? "Local sample recovered from its bundled package. No onchain installation is implied." : "Recovered and verified this release and its exact dependency closure.");
  }
  async function beginReview(intent) {
    if (!adapter || !identity) throw Error("Connect your NFT before reviewing a chain action.");
    closeRuntime();
    closeReview();
    reviewMode = "transaction";
    review = new ReviewedAction({ verifyContext: (expected) => adapter.fresh(expected), prepare: (value) => adapter.prepare(value), send: (prepared2, value) => adapter.send(prepared2, value), cancel: () => {
      wallet.plan = null;
    } });
    const prepared = await review.review(intent, identity);
    q("review-title").textContent = intent.description ?? "Review this exact action";
    q("review-content").textContent = json({ NFT: identity, action: intent, gasEstimate: prepared.prepared.gas, gasLimit: (BigInt(prepared.prepared.gas) * 120n / 100n).toString(), transaction: prepared.prepared.transaction });
    q("review-summary").textContent = intent.permissions ? "Declared module capabilities: " + intent.permissions.join(", ") : "This action is prepared and simulated. No transaction has been sent.";
    q("review-note").textContent = "Check the destination, value, calldata and permissions. Signing submits only this action; future actions need another review.";
    q("confirm-review").textContent = "Sign this reviewed transaction";
    q("confirm-review").disabled = false;
    showDialog();
  }
  const showDialog = () => {
    if (q("review").showModal && !q("review").open) q("review").showModal();
    else q("review").setAttribute("open", "");
  };
  async function launchApproved(html = false) {
    requireSelection();
    const selectedAtLaunch = selected, revision = generation, context = identity ?? previewIdentity;
    if (!selected.local) {
      requireLive();
      await adapter.fresh(context, selected.releaseId, selected.moduleKey);
    }
    if (revision !== generation) return;
    closeRuntime();
    session = new ModuleHostSession({ identity: context, releaseId: selected.releaseId, moduleKey: selected.moduleKey, manifest: selected.manifest, files: selected.files, dependencies: selected.dependencies, storage, verifyContext: async (expected) => identity ? adapter.fresh(expected, selectedAtLaunch.local ? void 0 : selectedAtLaunch.releaseId, selectedAtLaunch.moduleKey) : previewIdentity, onState: renderPackage, onProposal: async (proposal) => {
      if (selectedAtLaunch.local) {
        localRequestPreview(proposal);
        return { preview: true, sent: false };
      }
      await beginReview({ kind: "module-proposal", proposal, releaseId: selectedAtLaunch.releaseId, moduleKey: selectedAtLaunch.moduleKey, identity: context, description: proposal.description });
      return { queued: true, sent: false };
    }, onJournal: async (proposal) => {
      switchTab("journal");
      form("journal").elements.text.value = proposal.text;
      form("journal").elements.consent.checked = false;
      status("Journal draft copied to the host. Read it, choose the privacy mode and MemoryLedger, then explicitly approve inscription.");
      return { drafted: true, sent: false };
    } });
    q("runtime").hidden = false;
    q("runtime-title").textContent = selected.manifest.name;
    q("runtime-status").textContent = html ? "HTML is inert in the frame; its scripts run in a worker with a bounded #id text/value/event bridge. Full browser DOM APIs are not supported." : "Typed visual/audio data uses a trusted renderer and bounded worker. Sound starts only with your click.";
    runtime = html ? mountHTML({ container: q("runtime-container"), recovered: selected, session, window: win, maxRuntimeMs: selected.manifest.resources?.maxRuntimeMs }) : mountScene({ container: q("runtime-container"), scene: sceneFromRelease(selected), session, window: win, maxRuntimeMs: selected.manifest.resources?.maxRuntimeMs });
    q("runtime").scrollIntoView?.({ behavior: reducedMotion?.matches ? "auto" : "smooth", block: "start" });
  }
  function localRequestPreview(proposal) {
    closeRuntime();
    reviewMode = "preview";
    q("review-title").textContent = "Local sample \xB7 request preview";
    q("review-content").textContent = json(proposal);
    q("review-summary").textContent = "This sample is not an installed release. No wallet preparation or signing request has been made.";
    q("review-note").textContent = "Publish and install a verified release to request live actions through this host.";
    q("confirm-review").textContent = "Preview only";
    q("confirm-review").disabled = true;
    showDialog();
  }
  async function launch() {
    requireSelection();
    if (selected.entrypoint.endsWith(".html")) {
      closeReview();
      reviewMode = "runtime";
      runtimeApproval = { releaseId: selected.releaseId, generation };
      const file = selected.files.find((file2) => file2.path === selected.entrypoint);
      q("review-title").textContent = "Run this recovered HTML tool?";
      q("review-content").textContent = json({ releaseId: selected.releaseId, publisher: selected.manifest.publisher, capabilities: selected.manifest.capabilities }) + "\n\n" + new TextDecoder().decode(file.bytes);
      q("review-summary").textContent = "Review the exact source and permissions. Scripts run only in an isolated worker; HTML stays inert. Supported DOM calls: #id lookup, text/value/checked/disabled, click/input/change.";
      q("review-note").textContent = "External networking is restricted by the worker\u2019s inherited CSP. No untrusted script runs in a navigable frame. Unsupported browser DOM calls fail; the session closes after at most five minutes.";
      q("confirm-review").textContent = "Run reviewed HTML in isolation";
      q("confirm-review").disabled = false;
      showDialog();
    } else await launchApproved();
  }
  function switchTab(tab) {
    if (!Object.hasOwn(tabGlyph, tab)) return;
    for (const node of container.querySelectorAll("[data-panel]")) node.hidden = node.dataset.panel !== tab;
    for (const node of container.querySelectorAll("[data-tab]")) {
      const active = node.dataset.tab === tab;
      node.setAttribute("aria-pressed", String(active));
      node.setAttribute("aria-selected", String(active));
      node.tabIndex = active ? 0 : -1;
    }
  }
  function download(name, value) {
    const blob = new Blob([typeof value === "string" ? value : json(value)], { type: "application/json" }), url = win.URL.createObjectURL(blob), a = doc.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    win.setTimeout(() => win.URL.revokeObjectURL(url), 1e3);
  }
  async function handleAction(action) {
    if (action === "toggle-motion") {
      motionEnabled = !motionEnabled;
      motionLabel();
      refreshArtwork();
      return;
    }
    if (action === "open-state") {
      q("state-details").open = true;
      q("state-details").scrollIntoView?.({ behavior: reducedMotion?.matches ? "auto" : "smooth", block: "start" });
      q("state-details").querySelector("summary").focus();
      return;
    }
    if (action === "close" || action === "original") {
      closeRuntime();
      closeReview();
      if (options.onClose) options.onClose();
      else win.location.href = options.originalHref ?? "../index.html";
      return;
    }
    if (action === "disconnect") {
      invalidate();
      if (!suppliedWallet) wallet.disconnect();
      return;
    }
    if (action === "export-journal") {
      if (!journalPacket) throw Error("Prepare an encrypted journal packet first.");
      return download("anima-encrypted-journal.json", exportJournalPacket(journalPacket));
    }
    if (action === "clear-journal-preview") {
      journalDecryptRevision++;
      q("journal-decrypted").textContent = "";
      q("journal-decrypted").hidden = true;
      q("recovery-passphrase").value = "";
      return;
    }
    if (action === "decrypt-journal") {
      const revision = generation, decryptRevision = ++journalDecryptRevision;
      q("journal-decrypted").textContent = "";
      q("journal-decrypted").hidden = true;
      try {
        const recovered = await decryptJournalPacket(q("journal-packet").value, q("recovery-passphrase").value);
        if (disposed || revision !== generation || decryptRevision !== journalDecryptRevision) return;
        q("journal-decrypted").textContent = json(recovered);
        q("journal-decrypted").hidden = false;
        status("Decrypted locally. The authenticated header identifies the original NFT and custody epoch. No chain action was prepared.");
      } finally {
        if (!disposed) q("recovery-passphrase").value = "";
      }
      return;
    }
    if (action === "refresh") return refresh(true);
    if (action.startsWith("more-")) {
      if (!view) return;
      const key = action === "more-installed" ? "modules" : action.slice(5);
      cursors[key] = view.cursors[key];
      return refresh();
    }
    if (action === "close-runtime") {
      closeRuntime();
      return;
    }
    if (action === "cancel-review") {
      closeReview();
      return;
    }
    if (action === "confirm-review") {
      if (reviewMode === "runtime") {
        const approval = runtimeApproval;
        if (!approval || approval.generation !== generation || approval.releaseId !== selected?.releaseId) throw Error("Runtime selection changed. Review again.");
        q("review").close?.();
        runtimeApproval = null;
        await launchApproved(true);
        return;
      }
      if (reviewMode !== "transaction") return;
      q("confirm-review").disabled = true;
      const receipt = await review.confirm();
      q("review").close?.();
      closeRuntime();
      if (receipt.stagedStateId) {
        staged = { stateId: receipt.stagedStateId, releaseId: selected.releaseId };
        q("staged").textContent = "Staged " + receipt.stagedStateId + ". Review activation separately to select it.";
      }
      await refresh();
      if (selected) {
        selected.installation = await adapter.installation(selected.moduleKey);
        renderPackage();
      }
      status("Transaction mined: " + receipt.hash + (receipt.stagedStateId ? " \xB7 migration staged; activation still requires review." : ""));
      return;
    }
    if (action === "launch") return launch();
    if (action === "install" || action === "disable") {
      requireLive();
      const intent = await adapter.intent(action === "install" ? "activate" : "disable", selected, { nextStateHead: staged?.releaseId === selected.releaseId ? staged.stateId : void 0 });
      return beginReview(intent);
    }
    if (action === "export-package") {
      requireSelection();
      return download(selected.manifest.name + "-recovered.json", { schema: "anima.recovered-module-export/1", manifest: selected.manifest, releaseId: selected.releaseId, local: !!selected.local, files: selected.files.map((file) => ({ path: file.path, mime: file.mime, bytes: Array.from(file.bytes) })), dependencies: (selected.dependencies ?? []).map((dep) => ({ releaseId: dep.releaseId, manifest: dep.manifest, files: dep.files.map((file) => ({ path: file.path, mime: file.mime, bytes: Array.from(file.bytes) })) })) });
    }
    if (action === "export-state") {
      requireSelection();
      return download(selected.manifest.name + "-draft.json", state.read());
    }
    if (action === "restore-chain") {
      requireLive();
      const revision = generation, release = selected;
      const saved = await adapter.savedState(release, { stateHead: release.historyStateHead });
      if (disposed || revision !== generation || selected !== release) return;
      migration = null;
      q("migration-preview").hidden = true;
      q("commit-migration").disabled = true;
      q("state-consent").checked = false;
      q("migration-json").value = json(saved.value);
      status("Verified " + (release.historyStateHead !== void 0 ? "historical snapshot" : "chain state") + " loaded into the candidate editor. Preview before applying it to this browser.");
      return;
    }
    if (action === "preview-migration") {
      requireSelection();
      const value = boundedJSON(JSON.parse(q("migration-json").value), state.maxBytes);
      migration = previewMigration({ source: state, destination: state, value });
      q("migration-preview").textContent = json({ namespace: state.namespace, before: migration.before, after: migration.after, changedKeys: migration.changedKeys });
      q("migration-preview").hidden = false;
      q("commit-migration").disabled = false;
      status("Migration preview ready. Review it before applying the browser draft.");
      return;
    }
    if (action === "commit-migration") {
      requireSelection();
      if (!migration) throw Error("Preview the candidate state first.");
      await (session?.fresh() ?? Promise.resolve());
      commitMigration(migration, state, state);
      migration = null;
      q("commit-migration").disabled = true;
      renderPackage();
      status("Applied the reviewed browser draft. No chain state changed.");
      return;
    }
    if (action === "save-state" || action === "stage-state") {
      requireLive();
      if (!q("state-consent").checked) throw Error("Approve publishing this module state before preparing a chain review.");
      const value = state.read();
      return beginReview(await adapter.intent(action === "save-state" ? "writeState" : "stageState", selected, { value }));
    }
  }
  const click = (event) => {
    const target = event.target.closest?.("button,a");
    if (!target || !container.contains(target)) return;
    if (target.dataset.tab) {
      switchTab(target.dataset.tab);
      return;
    }
    if (target.dataset.example) {
      void run(() => choose(target.dataset.example, true).then(() => launch()));
      return;
    }
    if (target.dataset.release) {
      void run(() => choose(target.dataset.release, false, target.dataset.stateHead));
      return;
    }
    if (target.dataset.action) {
      event.preventDefault();
      void run(() => handleAction(target.dataset.action));
    }
  };
  const submit = (event) => {
    const name = event.target.dataset.form;
    if (!name) return;
    event.preventDefault();
    void run(async () => {
      if (name === "identity") {
        const values = Object.fromEntries(new win.FormData(event.target));
        invalidate("Reading the selected NFT\u2026");
        const revision = generation;
        await wallet.connect(values.collection, values.tokenId);
        if (revision !== generation) return;
        if (String(wallet.chainId) !== String(BigInt(values.chainId))) throw Error("Select chain " + values.chainId + " in your wallet, then connect again.");
        adapter = options.createAdapter ? options.createAdapter(wallet, values) : new RegistryAdapter(wallet, values);
        await refresh(true);
        if (wallet.modules?.journal) form("journal").elements.ledger.value = wallet.modules.journal;
      } else if (name === "recover") await choose(form("recover").elements.releaseId.value.trim());
      else if (name === "journal") {
        if (!identity || !adapter) throw Error("Connect your NFT first.");
        const journalForm = event.target, values = Object.fromEntries(new win.FormData(journalForm));
        if (!values.consent) throw Error("Approve the selected publication mode first.");
        const revision = generation, context = identity;
        let prepared;
        try {
          prepared = await prepareJournal({ mode: values.mode, text: values.text, passphrase: values.passphrase, identity: context });
        } finally {
          journalForm.elements.passphrase.value = "";
        }
        if (disposed || revision !== generation || context !== identity) throw Error("NFT context changed during journal preparation. Review again.");
        journalPacket = prepared.packet ?? null;
        q("export-journal").disabled = !journalPacket;
        await beginReview({ kind: "journal", ledger: values.ledger, text: prepared.chainText, privacyMode: prepared.mode, description: prepared.mode === "encrypted" ? "Publish this encrypted personal memory" : "Publish these public words", identity: context });
      }
    });
  };
  const change = (event) => {
    if (event.target === form("journal").elements.mode) {
      const encrypted = event.target.value === "encrypted";
      form("journal").elements.consent.checked = false;
      form("journal").elements.passphrase.required = encrypted;
      form("journal").elements.passphrase.value = "";
      q("journal-passphrase-group").hidden = !encrypted;
      q("journal-consent").textContent = encrypted ? "Publish this encrypted packet permanently. Its identity metadata remains public; I will keep the passphrase to recover the words." : "Publish these words onchain. They will be public and permanent.";
    }
    if (event.target === q("journal-packet-file")) void run(async () => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > JOURNAL_PACKET_BYTES) throw Error("Journal packet exceeds 16 KiB.");
      q("journal-packet").value = await file.text();
      journalDecryptRevision++;
      q("journal-decrypted").textContent = "";
      q("journal-decrypted").hidden = true;
      status("Encrypted packet imported. Enter its passphrase for a local recovery preview.");
    });
    if (form("identity").contains(event.target) && adapter) invalidate();
    if (event.target === q("migration-json")) {
      migration = null;
      q("commit-migration").disabled = true;
    }
    if (event.target === q("migration-file")) void run(async () => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 65536) throw Error("State import exceeds 64 KiB.");
      q("migration-json").value = json(boundedJSON(JSON.parse(await file.text()), 65536));
      migration = null;
      q("commit-migration").disabled = true;
      status("Imported candidate JSON. Preview before applying it.");
    });
  };
  const cancelled = () => closeReview();
  const tabKeydown = (event) => {
    if (!event.target.matches?.('[role="tab"]') || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...container.querySelectorAll("[data-tab]")], at = tabs.indexOf(event.target), next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (at + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    switchTab(tabs[next].dataset.tab);
    tabs[next].focus();
  };
  container.addEventListener("click", click);
  container.addEventListener("submit", submit);
  container.addEventListener("change", change);
  container.addEventListener("keydown", tabKeydown);
  q("review").addEventListener("cancel", cancelled);
  const walletChanged = () => invalidate("Wallet account or chain changed. Connect this NFT again.");
  win.ethereum?.on?.("accountsChanged", walletChanged);
  win.ethereum?.on?.("chainChanged", walletChanged);
  return { get selected() {
    return selected;
  }, get identity() {
    return identity;
  }, refresh: () => run(() => refresh(true)), destroy() {
    if (disposed) return;
    generation++;
    clearJournalSecrets();
    closeRuntime();
    closeReview();
    disposed = true;
    stopArtwork();
    artResize?.disconnect();
    artIntersection?.disconnect();
    artwork.dispose();
    reducedMotion?.removeEventListener?.("change", systemMotion);
    doc.removeEventListener("visibilitychange", refreshArtwork);
    container.removeEventListener("click", click);
    container.removeEventListener("submit", submit);
    container.removeEventListener("change", change);
    container.removeEventListener("keydown", tabKeydown);
    q("review").removeEventListener("cancel", cancelled);
    win.ethereum?.removeListener?.("accountsChanged", walletChanged);
    win.ethereum?.removeListener?.("chainChanged", walletChanged);
    if (!suppliedWallet) wallet.disconnect();
    container.replaceChildren();
    container.classList.remove("anima-modules");
  } };
}
var previewIdentity = Object.freeze({ chainId: "0", collection: "0x" + "01".repeat(20), tokenId: "0", account: "0x" + "02".repeat(20), registry: "0x" + "03".repeat(20), owner: "0x" + "04".repeat(20), epoch: "0" });

