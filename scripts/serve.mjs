// The default development server always serves the current verified application.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startCurrentServer } from "./serve-confluence.mjs";
export { createStaticServer } from "./lib/static-server.mjs";
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  startCurrentServer();
