import fs from "node:fs";
import path from "node:path";
import {
  parse,
  serialize,
  elements,
  attr,
  replace,
  append,
} from "./runtime-html.mjs";
import {
  archiveModule,
  discoverModules,
  inside,
  sha256,
  verifyBuild,
} from "./runtime-graph.mjs";
import {MODULE_IMPORT_MARKER} from '../../web/confluence/module-loader.mjs';
export async function expandedRuntime(root, dist = path.join(root, "dist")) {
  const build = verifyBuild(root, dist),
    graph = await discoverModules(dist, [build.entry]);
  if (JSON.stringify(graph) !== JSON.stringify(build.moduleGraph))
    throw Error("Runtime module graph differs from source build.");
  const imports = {};
  for (const name of Object.keys(graph)) {
    const source = fs.readFileSync(inside(dist, name), "utf8");
    imports["awe/" + name] =
      "data:text/javascript;base64," +
      Buffer.from(await archiveModule(source, name)).toString("base64");
  }
  const bundled = Object.fromEntries(
    ["web/cartridges/lumen-drift.html", "abis/CartridgeRegistry.json"].map(
      (name) => [name, fs.readFileSync(inside(dist, name), "utf8")],
    ),
  );
  const document = parse(
    fs.readFileSync(path.join(dist, "index.html"), "utf8"),
  );
  for (const node of elements(
    document,
    (n) => n.tagName === "link" && attr(n, "rel") === "stylesheet",
  )) {
    const name = attr(node, "href"),
      css = fs.readFileSync(inside(dist, name), "utf8");
    if (/<\/style/i.test(css))
      throw Error("Unsafe CSS archive delimiter: " + name);
    replace(node, '<style data-source="' + name + '">' + css + "</style>");
  }
  const entry = elements(
    document,
    (n) =>
      n.tagName === "script" &&
      attr(n, "type") === "module" &&
      attr(n, "src") === build.entry,
  );
  if (entry.length !== 1)
    throw Error("Expected exactly one current runtime entry.");
  const safe = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
  replace(
    entry[0],
    "<script>window.CONFLUENCE_BUNDLED=" +
      safe(bundled) +
      ';</script><script type="importmap">' +
      MODULE_IMPORT_MARKER +
      '</script><script type="module">import ' +
      JSON.stringify("awe/" + build.entry) +
      ";</script>",
  );
  const shell=serialize(document);
  return {
    html: shell.replace(MODULE_IMPORT_MARKER,safe({imports})),
    shell,
    imports,
    moduleGraph: graph,
    buildManifestSha256: sha256(
      fs.readFileSync(path.join(dist, "build-manifest.json")),
    ),
  };
}
