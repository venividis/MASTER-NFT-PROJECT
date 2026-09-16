/** Historical instrument composition. Current Genesis composes authored modules directly. */
import fs from "node:fs";
import path from "node:path";
import { composeRuntime } from "./lib/runtime-build.mjs";
import {
  parse,
  serialize,
  elements,
  attr,
  replace,
} from "./lib/runtime-html.mjs";
if (!process.argv.includes("--historical"))
  throw Error(
    "This is a historical composition command. Use npm run build for current Genesis, or add --historical.",
  );
const root = path.resolve(import.meta.dirname, ".."),
  out = path.join(root, "history/previews");
const { html } = await composeRuntime(root, {
    instruments: true,
    confluence: false,
  }),
  document = parse(html);
for (const node of elements(
  document,
  (n) => n.tagName === "link" && attr(n, "rel") === "stylesheet",
))
  replace(
    node,
    "<style>" +
      fs.readFileSync(path.join(root, attr(node, "href")), "utf8") +
      "</style>",
  );
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "instruments.html"), serialize(document));
console.log(
  "Historical instrument composition: history/previews/instruments.html",
);
