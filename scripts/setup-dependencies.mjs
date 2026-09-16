import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2),
  mode =
    args.find((value) => value.startsWith("--mode="))?.slice(7) ?? "validation";
if (
  !["validation", "full", "ui"].includes(mode) ||
  args.some((value) => !["--mode=" + mode, "--offline"].includes(value))
)
  throw Error(
    "Usage: node scripts/setup-dependencies.mjs [--mode=validation|full|ui] [--offline]",
  );
const packages = [
  "",
  "agent/extensions",
  "packages/communication",
  "integrations/console/protocol/v4-hook",
  "integrations/official-launch",
];
if (mode !== "ui")
  packages.push("packages/rehearsal-proof", "packages/crosschain");
if (mode === "full") packages.push("packages/privacy");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
for (const directory of packages) {
  console.log("Installing locked dependencies: " + (directory || "root"));
  // The pinned v4 package installs its platform-specific Anvil binary in a lifecycle script.
  const installArgs = ["ci", "--include=dev", "--no-audit", "--no-fund"];
  if (directory !== "integrations/console/protocol/v4-hook")
    installArgs.push("--ignore-scripts");
  if (args.includes("--offline")) installArgs.push("--offline");
  const result = spawnSync(npm, installArgs, {
    cwd: path.join(root, directory),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  `Installed ${mode} dependency set from lockfiles. Browser visual tests additionally require Python and Playwright; Rust checks require Cargo.`,
);
