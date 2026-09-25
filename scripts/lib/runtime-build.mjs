import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import {
  parse,
  serialize,
  elements,
  attr,
  setAttr,
  append,
  replace,
  inlineScript,
} from "./runtime-html.mjs";
import { sha256 } from "./runtime-graph.mjs";

export const APPROVED_SHA256 =
  "6b1fb23f63cf5aa65283b8be2f1446dddae38622b7ea8c164249c8cc74146bb6";
export const CONTROLLERS = [
  "web/instruments/app.js",
  "web/operating/app.js",
  "web/memory/app.js",
  "web/exit/app.js",
  "web/memory/renderer-bridge.js",
];
export const STYLES = [
  "web/styles.css",
  "web/instruments/styles.css",
  "web/memory/styles.css",
  "web/confluence/styles.css",
  "web/genesis/styles.css",
  "web/genesis/interior.css",
  "web/launchpad/studio.css",
  "web/launchpad/desk.css",
  "web/launchpad/participant.css",
  "web/launchpad/lifecycle.css",
  "web/launchpad/strategies.css",
  "web/launchpad/economics.css",
  "web/launchpad/protocols.css",
  "web/governance/desk.css",
  "web/crosschain/desk.css",
  "web/commons/desk.css",
  "web/confluence/surfaces.css",
];
export const SHELLS = [
  "web/instruments/shell.html",
  "web/confluence/shell.html",
];
export const OPTICAL_INPUTS = [
  "render/field.frag",
  "render/original.frag",
  "render/field.wasm",
  "render/living/field.frag",
  "render/living/field.wasm",
  "web/reference/original.html",
];
export const MODULE_ENTRY = "web/confluence/app.js";
export const RESOURCES = [
  "web/cartridges/lumen-drift.html",
  "web/privacy/railgun-worker.js",
];
const json = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
export function opticalAssets(root) {
  const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
  return {
    shader: read("render/field.frag"),
    original: read("render/original.frag"),
    wasm: fs
      .readFileSync(path.join(root, "render/field.wasm"))
      .toString("base64"),
    referenceHTML: read("web/reference/original.html"),
  };
}
export function verifyOriginal(root) {
  const approved = fs.readFileSync(
    path.join(root, "web/reference/approved-1.2.html"),
  );
  if (sha256(approved) !== APPROVED_SHA256)
    throw Error("Approved original reference changed.");
  const document = parse(approved.toString());
  const script = elements(document, (node) => node.tagName === "script").find(
    (node) => node.childNodes?.[0]?.value.startsWith("const ASSETS = "),
  );
  if (!script) throw Error("Original optical fixture is missing.");
  const source = script.childNodes[0].value;
  const assets = JSON.parse(
    source.slice("const ASSETS = ".length).trim().replace(/;$/, ""),
  );
  const current = opticalAssets(root);
  for (const name of Object.keys(current))
    if (current[name] !== assets[name])
      throw Error("Original optical asset changed: " + name);
  return {
    referenceSha256: APPROVED_SHA256,
    assetHashes: Object.fromEntries(
      Object.entries(current).map(([name, bytes]) => [name, sha256(bytes)]),
    ),
  };
}
export async function compileBase(root) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["web/app.js"],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    write: false,
    metafile: true,
    legalComments: "inline",
  });
  return {
    code: result.outputFiles[0].text,
    inputs: Object.keys(result.metafile.inputs),
  };
}
export async function compileInstruments(root) {
  const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
  // Only the mutually dependent view controllers retain a shared lexical scope.
  // Model/codec imports remain real ESM: esbuild resolves and validates every binding.
  const preamble = `import {wei,format,releasable,KingdomModel} from './web/kingdom/model.mjs';
import {DAY} from './web/instruments/engine.mjs';
import {LAB_MODULES,opGet} from './web/operating/engine.mjs';
import {memoryBody,encryptMemory,decryptMemory,memorySeal} from './web/memory/crypto.mjs';
import {MEM_ZERO,FORM_CHANNELS} from './web/memory/engine.mjs';
import {exitSlices,ExitEngine} from './web/exit/engine.mjs';
const LIVED_ASSETS=${json({ shader: read("render/living/field.frag"), wasm: fs.readFileSync(path.join(root, "render/living/field.wasm")).toString("base64") })};
const IX_CATALOG=${json(JSON.parse(read("web/instruments/capabilities.json")))};\n`;
  const result = await build({
    absWorkingDir: root,
    stdin: {
      contents:
        preamble +
        CONTROLLERS.map((name) => "\n// " + name + "\n" + read(name)).join(
          "\n",
        ),
      resolveDir: root,
      sourcefile: "anima-instrument-controllers.mjs",
      loader: "js",
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    write: false,
    metafile: true,
    legalComments: "inline",
  });
  return {
    code: result.outputFiles[0].text,
    inputs: [
      ...Object.keys(result.metafile.inputs).filter(
        (name) => name !== "anima-instrument-controllers.mjs",
      ),
      ...CONTROLLERS,
      "web/instruments/capabilities.json",
    ],
  };
}
export async function composeRuntime(
  root,
  { instruments = true, confluence = true } = {},
) {
  const read = (name) => fs.readFileSync(path.join(root, name), "utf8"),
    preservation = verifyOriginal(root),
    base = await compileBase(root),
    instrument = instruments ? await compileInstruments(root) : null;
  const document = parse(read("web/index.html")),
    head = elements(document, (n) => n.tagName === "head")[0],
    body = elements(document, (n) => n.tagName === "body")[0];
  for (const node of elements(
    document,
    (n) =>
      n.tagName === "script" &&
      ["assets.js", "app.js"].includes(attr(n, "src")),
  ))
    replace(node, "");
  for (const node of elements(
    document,
    (n) => n.tagName === "link" && attr(n, "href") === "styles.css",
  ))
    replace(node, "");
  const styles = confluence
    ? STYLES
    : instruments
      ? STYLES.slice(0, 3)
      : STYLES.slice(0, 1);
  for (const file of styles)
    append(head, '<link rel="stylesheet" href="' + file + '">');
  append(
    body,
    inlineScript(
      "const ASSETS = " + json(opticalAssets(root)) + ";",
      "optical-assets",
    ) + inlineScript(base.code, "original-runtime"),
  );
  if (instrument) {
    append(body, read(SHELLS[0]));
    append(body, inlineScript(instrument.code, "instrument-runtime"));
  }
  if (confluence) {
    setAttr(body, "class", "anima-genesis");
    append(head, '<meta name="referrer" content="no-referrer">');
    const title = elements(head, (n) => n.tagName === "title")[0];
    replace(title, "<title>ANIMA · Prism Cathedral</title>");
    append(body, read(SHELLS[1]));
    append(body, '<script type="module" src="' + MODULE_ENTRY + '"></script>');
  }
  return {
    html: serialize(document),
    preservation,
    inputs: [
      "web/index.html",
      ...base.inputs,
      ...(instrument?.inputs || []),
      ...OPTICAL_INPUTS,
      ...styles,
      ...(instruments ? [SHELLS[0]] : []),
      ...(confluence ? [SHELLS[1]] : []),
      "web/reference/approved-1.2.html",
    ],
  };
}
