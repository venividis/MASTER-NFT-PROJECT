/** Three explicit deliverables, made from the verified current release. No network or deployment. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  releaseFiles,
  writeSourceManifest,
  verifySourceManifest,
} from "./lib/source-integrity.mjs";
import { selectReleasePackages } from "./lib/release-packages.mjs";
import { sha256, verifyBuild, atomicDirectory } from "./lib/runtime-graph.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
verifyBuild(root);
execFileSync(
  process.execPath,
  [path.join(root, "scripts/verify-confluence.mjs")],
  { cwd: root, stdio: "inherit" },
);
const files = releaseFiles(root).filter((name) => !name.startsWith("release/"));
const selections = selectReleasePackages(files);
const counts = {};
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "anima-packaging-"));
try {
  await atomicDirectory(path.join(root, "release"), async (stage) => {
    const jobs = [];
    for (const [kind, names] of Object.entries(selections)) {
      const payload = path.join(temporary, kind);
      fs.mkdirSync(payload);
      for (const name of names) {
        const output = path.join(payload, name);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.copyFileSync(path.join(root, name), output);
      }
      const manifest = names.map((name) => ({
        file: name,
        bytes: fs.statSync(path.join(payload, name)).size,
        sha256: sha256(fs.readFileSync(path.join(payload, name))),
      }));
      fs.writeFileSync(
        path.join(payload, "PACKAGE-MANIFEST.json"),
        JSON.stringify(
          { schema: "anima.package/1", kind, files: manifest },
          null,
          2,
        ) + "\n",
      );
      const guidance = {
        source:
          "# ANIMA current source\n\nThis package contains authored source, required v4 dependencies and exact optical comparison fixtures. Generated contract artifacts and browser distribution are rebuilt.\n\nWith Node 22.11 or newer: `npm run setup:validation`, `npm run compile:local`, `npm run compile:v4`, `npm run build`, `npm run archive:confluence`, `npm run verify:confluence`. Then `npm run demo` serves the current application at http://127.0.0.1:4173. See README.md for full gates and platform dependencies.\n\nBefore editing, `npm run integrity:verify` verifies this extracted package. SHA256 checks establish byte integrity, not security. Historical donor research and old reports are in the reference package.\n",
        runtime:
          "# ANIMA runnable application\n\nFrom this extracted directory, run `python3 -m http.server 4173 --directory dist`, then open http://127.0.0.1:4173. Use a local HTTP server so native browser modules load correctly.\n\n`dist/index.html` is the current application; `dist/original.html` is the exact approved comparison fixture. `onchain-app/confluence` contains prepared archive bytes and their ordered chunk manifest; packaging is not deployment. The privacy worker is present for local preview and remains a separately verified archived resource for minted editions.\n\nPACKAGE-MANIFEST.json lists original build files. SOURCE-SHA256.json verifies all package contents, including this guide. The source package supplies the verifier and rebuild tools.\n",
        reference:
          "# ANIMA preserved references\n\nThis package preserves historical documentation, research, donor code, reports and visual references with their original bytes. Historical claims describe their original versions and are not current verification evidence. See the current source package for supported build and runtime entrypoints. PACKAGE-MANIFEST.json and SOURCE-SHA256.json record the included bytes.\n",
      };
      fs.writeFileSync(
        path.join(payload, "PACKAGE-START-HERE.md"),
        guidance[kind],
      );
      writeSourceManifest(payload);
      verifySourceManifest(payload);
      const instructions = {
        root: payload,
        output: path.join(stage, "ANIMA-" + kind + ".zip"),
        files: [...releaseFiles(payload), "SOURCE-SHA256.json"].sort(),
      };
      counts[kind] = instructions.files.length;
      jobs.push(instructions);
    }
    const input = path.join(temporary, "packages.json");
    fs.writeFileSync(input, JSON.stringify({packages: jobs.sort((a, b) => Number(a.output.endsWith("ANIMA-runtime.zip")) - Number(b.output.endsWith("ANIMA-runtime.zip")))}));
    execFileSync("python3", [path.join(root, "scripts/lib/write-package.py"), input], {stdio: "inherit"});
    const summary = Object.fromEntries(
      Object.keys(selections).map((kind) => {
        const file = "ANIMA-" + kind + ".zip",
          bytes = fs.readFileSync(path.join(stage, file));
        return [
          kind,
          {
            file,
            files: counts[kind],
            bytes: bytes.length,
            sha256: sha256(bytes),
          },
        ];
      }),
    );
    fs.writeFileSync(
      path.join(stage, "PACKAGES.json"),
      JSON.stringify(summary, null, 2) + "\n",
    );
    console.log(JSON.stringify(summary));
  });
  // Verify the delivered paths after the atomic directory publication as well.
  for (const kind of Object.keys(selections)) {
    execFileSync("python3", [path.join(root, "scripts/lib/write-package.py"), "--verify", path.join(root, "release", "ANIMA-" + kind + ".zip")], {stdio: "inherit"});
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
