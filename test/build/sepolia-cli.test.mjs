import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const run = (...args) =>
  spawnSync(process.execPath, ["scripts/sepolia.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, SEPOLIA_DEPLOYER_PRIVATE_KEY: "" },
  });

test("Sepolia help documents an explicit recipient and environment-only signing key", () => {
  const result = run("help");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--recipient 0x\.\.\./);
  assert.match(result.stdout, /SEPOLIA_DEPLOYER_PRIVATE_KEY/);
  assert.doesNotMatch(result.stdout, /private key\s*:/i);
});

test("Sepolia deploy and mint reject missing literal confirmation before RPC or file access", () => {
  const deploy = run(
    "deploy",
    "--rpc",
    "https://invalid.example",
    "--plan",
    "missing.json",
    "--journal",
    "missing-journal.json",
  );
  assert.notEqual(deploy.status, 0);
  assert.match(deploy.stderr, /requires --confirm DEPLOY_ANIMA_TO_SEPOLIA/);
  assert.doesNotMatch(deploy.stderr, /ENOENT|fetch|network/i);

  const mint = run(
    "mint",
    "--rpc",
    "https://invalid.example",
    "--plan",
    "missing.json",
    "--recovery",
    "missing-recovery.json",
    "--recipient",
    "0x0000000000000000000000000000000000000001",
  );
  assert.notEqual(mint.status, 0);
  assert.match(mint.stderr, /requires --confirm MINT_ANIMA_ON_SEPOLIA/);
  assert.doesNotMatch(mint.stderr, /ENOENT|fetch|network/i);
});

test("Sepolia runner rejects ambiguous commands and repeated options", () => {
  const commands = run("prepare", "deploy");
  assert.notEqual(commands.status, 0);
  assert.match(commands.stderr, /Choose exactly one command/);

  const repeated = run("prepare", "--rpc", "first", "--rpc", "second");
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /Invalid or repeated option --rpc/);
});
