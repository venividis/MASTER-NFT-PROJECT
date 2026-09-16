// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Engine} from "../src/Engine.sol";
import {Sigil} from "../src/Sigil.sol";
import {Renderer} from "../src/Renderer.sol";
import {Ipseity, IRenderer} from "../src/Ipseity.sol";
import {IpseityAccount} from "../src/IpseityAccount.sol";
import {GripVault} from "../src/GripVault.sol";

/*───────────────────────────────────────────────────────────────────────────
  Deploying IPSEITY

    1  node tools/build-engine.mjs        writes dist/shards.json
    2  node tools/verify.mjs              proves the document round-trips
    3  forge script script/Deploy.s.sol --rpc-url <chain> --broadcast

  Step 2 is not optional. It deploys the whole collection into an EVM in
  this process, pulls tokenURI() back out, and checks that the document
  that comes back is byte for byte the document that went in. Everything
  below is irreversible once freeze() and sealRenderer() are called, and
  the failure this catches is silent.

  The site is not deployed here. It reads a Pool and a Lease that this
  script does not create, and it holds none of the artwork — every token
  renders identically whether the site exists, is abandoned, or is
  replaced. `script/Site.s.sol` deploys it once those addresses exist.

  The load loop below sends one transaction per shard. Each full shard
  deposits about 20 KB of code at 200 gas a byte, so budget ~4.4M gas per
  shard and check the chain's per-transaction gas cap before broadcasting
  — EIP-7825 caps a single transaction at 2^24 gas, which is why the
  packed build splits into three shards rather than one.
───────────────────────────────────────────────────────────────────────────*/
contract Deploy is Script {
    using stdJson for string;

    function run() external {
        string memory plan = vm.readFile("dist/shards.json");

        bool packed = keccak256(bytes(plan.readString(".mode"))) == keccak256("packed");
        uint256 headCount = plan.readUint(".head.length");
        uint256 bodyCount = plan.readUint(".body.length");

        console.log("mode          ", packed ? "packed (gzip)" : "raw (plain text)");
        console.log("head shards   ", headCount);
        console.log("body shards   ", bodyCount);
        console.log("stored bytes  ", plan.readUint(".storedBytes"));

        vm.startBroadcast();

        Engine engine = new Engine(packed);
        Sigil sigil = new Sigil();
        Renderer renderer = new Renderer(engine, sigil);

        // the two hands. Both are ERC-6551 implementations under the same
        // canonical registry, at two different salts — the Reach acts and is
        // measured, the Grip receives and has no function that spends.
        IpseityAccount reachImpl = new IpseityAccount();
        GripVault gripImpl = new GripVault();

        Ipseity token = new Ipseity(
            IRenderer(address(renderer)), address(reachImpl), address(gripImpl)
        );

        for (uint256 i; i < headCount; ++i) {
            engine.loadHead(plan.readBytes(string.concat(".head[", vm.toString(i), "].data")));
        }
        for (uint256 i; i < bodyCount; ++i) {
            engine.loadBody(plan.readBytes(string.concat(".body[", vm.toString(i), "].data")));
        }
        if (packed) engine.setInflatedSize(uint32(plan.readUint(".inflatedSize")));

        vm.stopBroadcast();

        (uint256 h, uint256 b) = engine.sizes();
        console.log("");
        console.log("Engine        ", address(engine));
        console.log("Sigil         ", address(sigil));
        console.log("Renderer      ", address(renderer));
        console.log("Ipseity       ", address(token));
        console.log("Reach impl    ", address(reachImpl));
        console.log("Grip impl     ", address(gripImpl));
        console.log("");
        console.log("head bytes    ", h);
        console.log("body bytes    ", b);
        console.log("");
        console.log("Check engine.headBytes() and engine.bodyBytes() against");
        console.log("dist/ipseity.min.html before going any further. Then:");
        console.log("  engine.freeze()          the document can never change again");
        console.log("  token.sealRenderer()     the renderer can never be replaced");
    }
}

/// @notice Run only after the document has been checked against the source.
///         Both of these are one-way.
contract Seal is Script {
    function run() external {
        Engine engine = Engine(vm.envAddress("ENGINE"));
        Ipseity token = Ipseity(payable(vm.envAddress("IPSEITY")));

        (uint256 h, uint256 b) = engine.sizes();
        require(h > 0 && b > 0, "nothing loaded");

        vm.startBroadcast();
        engine.freeze();
        token.sealRenderer();
        vm.stopBroadcast();

        console.log("Sealed. The document and the renderer are now permanent.");
    }
}
