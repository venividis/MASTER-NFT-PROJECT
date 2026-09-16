import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import solc from "solc";
import {emitCompilerArtifacts, sha256, solidityFiles} from './lib/compiler-artifacts.mjs';

await import("./build-chain-loader.mjs");

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "contracts", "src");
const artifactRoot = path.join(root, "contracts", "artifacts");
const reportRoot = path.join(root, "reports");

const sourceFiles = solidityFiles(sourceRoot);
const sources = Object.fromEntries(
  sourceFiles.map((file) => [
    path.relative(root, file).split(path.sep).join("/"),
    { content: fs.readFileSync(file, "utf8") },
  ]),
);

const evmVersion=process.env.IDFBI_EVM_TARGET||"cancun";
if(!["cancun","shanghai"].includes(evmVersion))throw Error("Unsupported explicit EVM target");
const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 1_000 },
    viaIR: true,
    evmVersion,
    metadata: { bytecodeHash: "ipfs", appendCBOR: true },
    outputSelection: {
      "*": {
        "*": [
          "abi",
          "metadata",
          "evm.bytecode.object",
          "evm.bytecode.linkReferences",
          "evm.deployedBytecode.object",
          "evm.deployedBytecode.linkReferences",
          "evm.deployedBytecode.immutableReferences",
          "evm.methodIdentifiers"
        ],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const diagnostics = output.errors ?? [];
for (const diagnostic of diagnostics) {
  const line = diagnostic.formattedMessage ?? diagnostic.message;
  (diagnostic.severity === "error" ? console.error : console.warn)(line.trimEnd());
}
if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
  process.exitCode = 1;
  throw new Error("Solidity compilation failed");
}

fs.mkdirSync(reportRoot, { recursive: true });
const stage = fs.mkdtempSync(path.join(path.dirname(artifactRoot), '.artifacts-'));
const buildInputs = Object.fromEntries([
  'scripts/compile.mjs', 'scripts/lib/compiler-artifacts.mjs', 'scripts/build-chain-loader.mjs', 'web/confluence/chain-loader.mjs', 'web/confluence/module-loader.mjs',
].map(name => [name, sha256(fs.readFileSync(path.join(root, name)))]));
const {sizes} = emitCompilerArtifacts({output, input, compiler: solc.version(), artifactDirectory: stage, buildInputs});

sizes.sort((a, b) => b.deployedBytes - a.deployedBytes);
fs.writeFileSync(
  path.join(reportRoot, "contract-sizes.json"),
  `${JSON.stringify({ compiler: solc.version(), limit: 24_576, contracts: sizes }, null, 2)}\n`,
);

const oversized = sizes.filter((item) => item.deployedBytes > 24_576);
console.log(`Compiled ${sizes.length} contracts with ${solc.version()}.`);
console.table(sizes.filter((item) => item.deployedBytes > 0));
if (oversized.length) {
  fs.rmSync(stage, {recursive: true, force: true});
  console.error("EIP-170 runtime size exceeded:", oversized);
  process.exitCode = 1;
  throw new Error("One or more contracts exceed the EIP-170 runtime size limit");
}
// Publish only a complete, size-checked set; a failed compile keeps the previous artifacts.
const previous = artifactRoot + '.previous';
fs.rmSync(previous, {recursive: true, force: true});
if (fs.existsSync(artifactRoot)) fs.renameSync(artifactRoot, previous);
try { fs.renameSync(stage, artifactRoot); }
catch (error) { if (fs.existsSync(previous)) fs.renameSync(previous, artifactRoot); throw error; }
fs.rmSync(previous, {recursive: true, force: true});
