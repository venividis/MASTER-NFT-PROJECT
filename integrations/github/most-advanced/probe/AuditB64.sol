// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Base64} from "../src/lib/Base64.sol";

/// Isolates the cost curve the design documents extrapolate from.
contract AuditB64 {
    /// one pass, as Renderer does for animation_url
    function once(bytes calldata b) external pure returns (uint256) {
        return bytes(Base64.encode(b)).length;
    }
    /// the real shape: document -> b64 -> wrapped -> b64 again
    function twice(bytes calldata b) external pure returns (uint256) {
        bytes memory json = abi.encodePacked(
            '{"name":"IPSEITY","description":"x","animation_url":"data:text/html;base64,',
            Base64.encode(b), '"}');
        return bytes(Base64.encode(json)).length;
    }
}
