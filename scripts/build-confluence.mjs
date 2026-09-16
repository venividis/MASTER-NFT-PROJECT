import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  composeRuntime,
  MODULE_ENTRY,
  RESOURCES,
} from "./lib/runtime-build.mjs";
import {
  atomicDirectory,
  discoverModules,
  listFiles,
  hashFiles,
  verifyBuild,
  inside,
} from "./lib/runtime-graph.mjs";
import { verifyCompilation } from "./lib/compiler-artifacts.mjs";
import { verifyV4Compilation } from "./lib/v4-compilation.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
verifyCompilation(root);
verifyV4Compilation(root);
for (const script of [
  "build-v4.mjs",
  "build-launch-chain.mjs",
  "build-hook-launch.mjs",
  "build-launch-sale.mjs",
  "build-launch-auction.mjs",
  "build-launch-lifecycle.mjs",
  "build-launch-strategies.mjs",
  "build-governance.mjs",
  "build-commons.mjs",
  "build-workshop.mjs",
  "build-extensions.mjs",
  "build-exit.mjs",
  "build-interior.mjs",
  "build-capabilities.mjs",
])
  execFileSync(process.execPath, [path.join(root, "scripts", script)], {
    cwd: root,
    stdio: "inherit",
  });
for (const script of [
  "packages/communication/build.mjs",
  "packages/crosschain/build.mjs",
  "integrations/official-launch/scripts/build.mjs",
])
  execFileSync(process.execPath, [path.join(root, script)], {
    cwd: root,
    stdio: "inherit",
  });
const composed = await composeRuntime(root),
  graph = await discoverModules(root, [MODULE_ENTRY]);
const abiName = "CartridgeRegistry",
  artifactFile = "contracts/artifacts/" + abiName + ".json";
const artifact = JSON.parse(
  fs.readFileSync(inside(root, artifactFile), "utf8"),
);
function featureBuildInputs(prefix) {
  const result = [];
  function walk(name) {
    for (const item of fs.readdirSync(path.join(root, name), {
      withFileTypes: true,
    })) {
      if (
        item.name.startsWith(".") ||
        [
          "node_modules",
          "artifacts",
          "reports",
          "test",
          "tests",
          "cache",
          "out",
        ].includes(item.name)
      )
        continue;
      const relative = name + "/" + item.name;
      if (item.isSymbolicLink())
        throw Error("Feature build input cannot be a symlink: " + relative);
      if (item.isDirectory()) walk(relative);
      else if (/\.(?:sol|mjs|cjs|js|json)$/.test(item.name))
        result.push(relative);
    }
  }
  walk(prefix);
  return result;
}
const inputs = [
  ...[
    "packages/communication",
    "packages/crosschain",
    "integrations/official-launch",
  ].flatMap(featureBuildInputs),
  ...composed.inputs,
  ...Object.keys(graph),
  ...RESOURCES,
  artifactFile,
  "contracts/artifacts/index.json",
  "integrations/console/protocol/v4-hook/artifacts/compilation-inputs.json",
  ...listFiles(path.join(root, "integrations/console/protocol/fee-router"))
    .filter(
      (file) =>
        (file.startsWith("src/") && file.endsWith(".sol")) ||
        (file.startsWith("scripts/") && file.endsWith(".cjs")) ||
        [
          "package.json",
          "package-lock.json",
          "artifacts/OwnerFeeRouter.json",
        ].includes(file),
    )
    .map((file) => "integrations/console/protocol/fee-router/" + file),
  "package.json",
  "package-lock.json",
  ...listFiles(path.join(root, "scripts"))
    .filter((file) => file.endsWith(".mjs"))
    .map((file) => "scripts/" + file),
  ...listFiles(path.join(root, "render"))
    .filter((file) => !file.endsWith(".png"))
    .map((file) => "render/" + file),
];
const result = await atomicDirectory(path.join(root, "dist"), async (stage) => {
  const write = (name, bytes) => {
    const file = inside(stage, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  };
  write("index.html", composed.html);
  // One deliberate visual comparison fixture. It is never an active build input.
  write(
    "original.html",
    fs.readFileSync(path.join(root, "web/reference/approved-1.2.html")),
  );
  for (const file of [
    ...Object.keys(graph),
    ...RESOURCES,
    ...composed.inputs.filter((file) => file.endsWith(".css")),
  ])
    write(file, fs.readFileSync(inside(root, file)));
  write(
    "abis/" + abiName + ".json",
    JSON.stringify({
      contractName: artifact.contractName,
      sourceName: artifact.sourceName,
      abi: artifact.abi,
    }),
  );
  write(
    "manifest.webmanifest",
    JSON.stringify({
      name: "Anima Genesis",
      short_name: "Genesis",
      start_url: "/",
      display: "standalone",
      background_color: "#04060a",
      theme_color: "#04060a",
    }),
  );
  const manifest = {
    schema: "anima.source-build/1",
    entry: MODULE_ENTRY,
    preservation: composed.preservation,
    inputs: hashFiles(root, inputs),
    moduleGraph: graph,
    resources: RESOURCES,
    outputs: hashFiles(stage, listFiles(stage)),
  };
  write("build-manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  verifyBuild(root, stage);
  return {
    bytes: Buffer.byteLength(composed.html),
    modules: Object.keys(graph).length,
    files: Object.keys(manifest.outputs).length,
  };
});
fs.writeFileSync(path.join(root, "index.html.next"), composed.html);
fs.renameSync(
  path.join(root, "index.html.next"),
  path.join(root, "index.html"),
);
console.log(
  JSON.stringify({
    application: "Anima Genesis",
    ...result,
    source: "authored modules",
    original: "byte-identical comparison fixture",
    output: "dist",
  }),
);
