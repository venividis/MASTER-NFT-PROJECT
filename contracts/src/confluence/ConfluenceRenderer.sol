// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GenesisSVG} from "./GenesisSVG.sol";
import {OnchainRenderer} from "../core/OnchainRenderer.sol";
import {Base64} from "../lib/Base64.sol";
import {Strings} from "../lib/Strings.sol";
import {ConfluenceLoader} from "./ConfluenceLoader.sol";
import {AppChunk} from "../protocol/OnchainApp.sol";
import {IOrganismRenderSource, OrganismRenderData} from "../interfaces/Interfaces.sol";

interface IConfluenceArchive {
    function readAll() external view returns (bytes memory);
    function contentSha256() external view returns (bytes32);
}

/// @notice Fully stored application bytes plus per-token chain-qualified identity.
/// @dev Browsers execute the code offchain. No hosted URL is needed for the animation payload.
contract ConfluenceRenderer is OnchainRenderer {
    using Strings for uint256;
    using Strings for address;
    using Strings for bytes32;

    IConfluenceArchive public immutable runtime;
    bytes32 public immutable runtimeSha256;
    uint256 public immutable archiveVersion;
    address public immutable deploymentManifest;
    address public immutable privacyResource;
    address public immutable loaderStore;

    constructor(address runtime_, address manifest_, address privacy_) {
        require(privacy_.code.length > 0, "privacy resource required");
        privacyResource = privacy_;
        require(manifest_.code.length > 0, "manifest required");
        deploymentManifest = manifest_;
        require(runtime_.code.length > 0, "runtime required");
        runtime = IConfluenceArchive(runtime_);
        runtimeSha256 = runtime.contentSha256();
        (bool versioned, bytes memory result) = runtime_.staticcall(abi.encodeWithSignature("schemaVersion()"));
        uint256 version = versioned && result.length == 32 ? abi.decode(result, (uint256)) : 1;
        require(version == 1 || version == 2 || version == 3, "archive version");
        archiveVersion = version;
        // Keeping the recovery program in immutable data avoids embedding its complete
        // executable text in every renderer runtime (EIP-170). No URL or mutable loader.
        loaderStore=address(new AppChunk(bytes(ConfluenceLoader.html())));
    }

    function render(address collection, uint256 tokenId) external view override returns (string memory) {
        OrganismRenderData memory s = IOrganismRenderSource(collection).renderSnapshot(tokenId);
        bytes memory boot = _boot(collection, tokenId, s);
        bytes memory json = _metadata(tokenId, s, boot);
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    function _boot(address collection, uint256 tokenId, OrganismRenderData memory s)
        private view returns (bytes memory)
    {
        // Bound each packing operation's live values. One large encodePacked call
        // exceeds the Yul stack after adding the complete onchain resource identity.
        bytes memory identity = abi.encodePacked(
            '<script>window.AWE_CHAIN_IDENTITY={seed:"', s.seed.toHexString(),
            '",genome:"', s.genome.toHexString(), '",root:"', s.stateRoot.toHexString()
        );
        bytes memory origin = abi.encodePacked(
            '",chainId:"', block.chainid.toString(), '",collection:"', collection.toHexString(),
            '",tokenId:"', tokenId.toString()
        );
        bytes memory resources = abi.encodePacked(
            '",manifest:"', deploymentManifest.toHexString(),
            '",privacyResource:"', privacyResource.toHexString(),
            '",runtime:"', address(runtime).toHexString(),
            '",sha256:"', runtimeSha256.toHexString(), '",archiveVersion:"', archiveVersion.toString(), '"};</script>'
        );
        address location=loaderStore;uint256 length=location.code.length-1;bytes memory loader=new bytes(length);
        assembly ("memory-safe") {extcodecopy(location,add(loader,32),1,length)}
        return abi.encodePacked(identity, origin, resources, loader);
    }

    function _metadata(uint256 tokenId, OrganismRenderData memory s, bytes memory boot)
        private view returns (bytes memory)
    {
        bytes memory portrait = abi.encodePacked(
            '{"name":"Anima Genesis #', tokenId.toString(),
            '","description":"An iridescent chain-qualified living identity with the same owner-controlled capabilities as every Confluence artifact. Browser execution; explicit wallet approvals.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(GenesisSVG.render(s)))
        );
        bytes memory animation = abi.encodePacked(
            '","animation_url":"data:text/html;base64,', Base64.encode(boot)
        );
        bytes memory attributes = abi.encodePacked(
            '","attributes":[{"trait_type":"Origin seed","value":"', s.seed.toHexString(),
            '"},{"trait_type":"Runtime SHA-256","value":"', runtimeSha256.toHexString(), '"}]}'
        );
        return abi.encodePacked(portrait, animation, attributes);
    }
}
