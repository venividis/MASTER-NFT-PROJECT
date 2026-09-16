/** Current source, deployable runtime, and preserved reference evidence have explicit scopes. */
export function selectReleasePackages(files) {
  // An interrupted packaging process may leave a staging directory. Such outputs
  // are never source inputs, even when a later packaging command succeeds.
  files = files.filter(
    (name) =>
      !name.startsWith("release/") &&
      !name.startsWith("release.stage-") &&
      !name.startsWith("release.previous-"),
  );
  const generated = (name) =>
    name === "index.html" ||
    name === "preview.html" ||
    name === "SOURCE-SHA256.json" ||
    name.startsWith("dist/") ||
    name.startsWith("onchain-app/") ||
    name.startsWith("contracts/artifacts/") ||
    name.startsWith("integrations/console/protocol/v4-hook/artifacts/") ||
    name.startsWith("integrations/console/protocol/fee-router/artifacts/") ||
    name.endsWith("/bundle.check.js") ||
    name === "web/assets.js";
  const historical = (name) =>
    name.startsWith("history/") ||
    name.startsWith("reports/") ||
    name.startsWith("web/reference/") ||
    (name.startsWith("integrations/") &&
      !name.startsWith("integrations/console/protocol/v4-hook/") &&
      !name.startsWith("integrations/console/protocol/fee-router/"));
  const vendorEvidence = (name) =>
    name.startsWith("integrations/console/protocol/v4-hook/vendor/") &&
    (/\/(?:docs|audits)\//.test(name) ||
      /\/test\/js-scripts\/dist\//.test(name) ||
      /\.(?:pdf|png|jpg|jpeg)$/i.test(name));
  const source = files.filter(
    (name) => !generated(name) && !historical(name) && !vendorEvidence(name),
  );
  // These exact optical fixtures also belong to the source build and historical command.
  for (const name of [
    "web/reference/approved-1.2.html",
    "web/reference/original.html",
    "web/reference/four-chambers-1.3.html",
  ])
    if (files.includes(name) && !source.includes(name)) source.push(name);
  const currentArchive = (name) =>
    name.startsWith("onchain-app/confluence/") ||
    name.startsWith("onchain-app/privacy-worker/");
  const runtime = files.filter(
    (name) => name.startsWith("dist/") || currentArchive(name),
  );
  const reference = files.filter(
    (name) =>
      historical(name) ||
      name.startsWith("integrations/") ||
      name.startsWith("docs/") ||
      (name.startsWith("onchain-app/") && !currentArchive(name)) ||
      name === "preview.html",
  );
  // Keep distribution notices with every download, including generated code.
  const notices = files.filter(
    (name) =>
      [
        "LICENSE",
        "NOTICE.md",
        "CLEANUP.md",
        "packages/rehearsal-proof/LICENSE",
        "contracts/src/confluence/vendor/solady/LICENSE.txt",
      ].includes(name) ||
      (name.startsWith("integrations/console/protocol/v4-hook/vendor/") &&
        /\/(?:LICENSE[^/]*|MIT_LICENSE|BUSL_LICENSE)$/i.test(name)),
  );
  const withNotices = (names) => [...new Set([...names, ...notices])].sort();
  return {
    source: withNotices(source),
    runtime: withNotices(runtime),
    reference: withNotices(reference),
  };
}
