import { build } from "../../node_modules/esbuild/lib/main.js";
import fs from "node:fs";
import path from "node:path";
import solc from "../../node_modules/solc/index.js";
import { keccak256 } from "../../node_modules/ethers/lib.esm/index.js";
const root = path.resolve(import.meta.dirname, "../..");
await build({
  entryPoints: [path.join(import.meta.dirname, "protocol.mjs")],
  outfile: path.join(root, "web/commons/mls-protocol.mjs"),
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  legalComments: "eof",
  plugins: [
    {
      name: "browser-webcrypto-only",
      setup(b) {
        b.onResolve({ filter: /^crypto$/ }, () => ({
          path: "webcrypto",
          namespace: "anima-browser",
        }));
        b.onLoad({ filter: /.*/, namespace: "anima-browser" }, () => ({
          contents:
            'if(!globalThis.crypto?.subtle)throw Error("MLS requires a secure browser context with WebCrypto.");export const webcrypto=globalThis.crypto;',
          loader: "js",
        }));
      },
    },
  ],
});
const source = "contracts/src/extensions/privacy/MLSGroupChat.sol",
  settings = {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "shanghai",
    metadata: { bytecodeHash: "none" },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  };
const output = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: {
        [source]: { content: fs.readFileSync(path.join(root, source), "utf8") },
      },
      settings,
    }),
  ),
);
const errors = (output.errors || []).filter((x) => x.severity === "error");
if (errors.length)
  throw Error(errors.map((x) => x.formattedMessage).join("\n"));
const c = output.contracts[source].MLSGroupChat,
  a = {
    abi: c.abi,
    bytecode: "0x" + c.evm.bytecode.object,
    runtimeHash: keccak256("0x" + c.evm.deployedBytecode.object),
    creationHash: keccak256("0x" + c.evm.bytecode.object),
    compiler: solc.version(),
    settings,
  };
fs.writeFileSync(
  path.join(root, "web/commons/mls-artifacts.mjs"),
  "// Generated from MLSGroupChat.sol by packages/communication/build.mjs.\nexport const MLS_ARTIFACT=" +
    JSON.stringify(a) +
    ";\n",
);
console.log(
  JSON.stringify({
    protocolBytes: fs.statSync(path.join(root, "web/commons/mls-protocol.mjs"))
      .size,
    contractBytes: c.evm.deployedBytecode.object.length / 2,
    version: "ts-mls@1.6.4",
  }),
);
