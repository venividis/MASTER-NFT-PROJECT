import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyBuild } from "./lib/runtime-graph.mjs";
import { createStaticServer } from "./lib/static-server.mjs";
import { verifyCompilation } from "./lib/compiler-artifacts.mjs";
import { verifyV4Compilation } from "./lib/v4-compilation.mjs";
export { createStaticServer };
export function startCurrentServer() {
  const root = path.resolve(import.meta.dirname, "..");
  verifyCompilation(root);
  verifyV4Compilation(root);
  verifyBuild(root);
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT must be an integer from 1 to 65535.");
  return createStaticServer({ directory: path.join(root, "dist") }).listen(
    port,
    "127.0.0.1",
    () => console.log("Anima Genesis: http://127.0.0.1:" + port),
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  startCurrentServer();
