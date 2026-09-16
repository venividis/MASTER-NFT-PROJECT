// Read-only recovery. No signer, account access, private key or transaction submission.
import fs from "node:fs";
import path from "node:path";
import { Interface } from "ethers";
import { recoverArchive } from "../web/confluence/chain-loader.mjs";

const args = process.argv.slice(2),
  options = {};
if (args.length === 1 && args[0] === "--help") {
  console.log(
    "Recover a minted NFT and its exact identity:\n  node scripts/recover-runtime.mjs --rpc HTTPS_RPC --chain CHAIN_ID --collection ADDRESS --token-id ID --output nft.html\nRecover an explicit v1/v2/v3 archive:\n  node scripts/recover-runtime.mjs --rpc HTTPS_RPC --chain CHAIN_ID --runtime ADDRESS --sha256 DIGEST --archive-version 3 --output runtime.html\nRead-only. Existing output files are never overwritten.",
  );
} else {
  try {
    for (let i = 0; i < args.length; i += 2) {
      if (
        ![
          "--rpc",
          "--chain",
          "--collection",
          "--token-id",
          "--runtime",
          "--sha256",
          "--archive-version",
          "--output",
        ].includes(args[i]) ||
        !args[i + 1] ||
        options[args[i]]
      )
        throw Error("Invalid arguments; use --help.");
      options[args[i]] = args[i + 1];
    }
    if (!options["--rpc"] || !options["--chain"] || !options["--output"])
      throw Error("RPC, chain and a new output path are required.");
    const url = new URL(options["--rpc"]);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
    )
      throw Error("Use HTTPS or a local RPC.");
    const request = async (payload) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...payload }),
      });
      if (!response.ok) throw Error("RPC HTTP " + response.status);
      const body = await response.json();
      if (body.error) throw Error(body.error.message);
      return body.result;
    };
    if (
      BigInt(await request({ method: "eth_chainId", params: [] })) !==
      BigInt(options["--chain"])
    )
      throw Error("RPC chain differs from the requested chain.");
    let identity;
    if (options["--collection"]) {
      if (
        options["--runtime"] ||
        options["--sha256"] ||
        options["--archive-version"] ||
        !options["--token-id"] ||
        !/^0x[0-9a-f]{40}$/i.test(options["--collection"])
      )
        throw Error("Choose either NFT identity or explicit archive identity.");
      const abi = new Interface([
        "function tokenURI(uint256) view returns(string)",
      ]);
      const [uri] = abi.decodeFunctionResult(
        "tokenURI",
        await request({
          method: "eth_call",
          params: [
            {
              to: options["--collection"],
              data: abi.encodeFunctionData("tokenURI", [
                BigInt(options["--token-id"]),
              ]),
            },
            "latest",
          ],
        }),
      );
      if (!uri.startsWith("data:application/json;base64,"))
        throw Error("NFT does not return canonical onchain JSON metadata.");
      const metadata = JSON.parse(Buffer.from(uri.split(",")[1], "base64"));
      if (!metadata.animation_url?.startsWith("data:text/html;base64,"))
        throw Error("NFT does not return an onchain HTML loader.");
      const boot = Buffer.from(
          metadata.animation_url.split(",")[1],
          "base64",
        ).toString(),
        match = boot.match(/window\.AWE_CHAIN_IDENTITY=(\{[^\n;]+\});/);
      if (!match)
        throw Error("NFT loader has no recognized immutable identity.");
      identity = JSON.parse(
        match[1].replace(/([,{])([A-Za-z][A-Za-z0-9]*):/g, '$1"$2":'),
      );
      const allowed = [
        "seed",
        "genome",
        "root",
        "chainId",
        "collection",
        "tokenId",
        "manifest",
        "privacyResource",
        "runtime",
        "sha256",
        "archiveVersion",
      ];
      if (
        Object.keys(identity).some((k) => !allowed.includes(k)) ||
        String(identity.chainId) !== String(options["--chain"]) ||
        String(identity.tokenId) !== String(options["--token-id"]) ||
        identity.collection.toLowerCase() !==
          options["--collection"].toLowerCase()
      )
        throw Error(
          "NFT identity differs from the requested collection, number or chain.",
        );
    } else {
      if (!options["--runtime"] || !options["--sha256"])
        throw Error("Choose a collection/NFT or an explicit runtime/hash.");
      identity = {
        runtime: options["--runtime"],
        sha256: options["--sha256"],
        chainId: options["--chain"],
        archiveVersion: Number(options["--archive-version"] || 1),
      };
    }
    const output = path.resolve(options["--output"]);
    if (fs.existsSync(output))
      throw Error("Output already exists. Choose a fresh path.");
    let html = await recoverArchive(request, identity);
    if (options["--collection"])
      html =
        "<script>window.AWE_CHAIN_IDENTITY=" +
        JSON.stringify(identity).replaceAll("<", "\\u003c") +
        ";</script>" +
        html;
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, html, { flag: "wx" });
    console.log(
      JSON.stringify({
        recovered: true,
        archiveVersion: Number(identity.archiveVersion || 1),
        chainId: identity.chainId,
        runtime: identity.runtime,
        sha256: identity.sha256,
        output,
        bytes: Buffer.byteLength(html),
      }),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
