// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Administrated} from "../lib/Administrated.sol";
import {ECDSA} from "../lib/Crypto.sol";
import {IActionVerifier} from "../interfaces/Interfaces.sol";

/// @notice Threshold verifier for TEE operators, guardians, or a proving service quorum.
/// @dev Signers must be encoded in strictly increasing address order, preventing duplicates.
contract ThresholdAttestationVerifier is Administrated, IActionVerifier {
    mapping(address => bool) public isSigner;
    uint16 public signerCount;
    uint16 public threshold;
    bool public frozen;

    event SignerUpdated(address indexed signer, bool allowed);
    event ThresholdUpdated(uint16 threshold);
    event VerifierFrozen();

    error VerifierIsFrozen();
    error InvalidThreshold();
    error InvalidSigner();

    constructor(address admin, uint16 threshold_) Administrated(admin) {
        if (threshold_ == 0) revert InvalidThreshold();
        threshold = threshold_;
    }

    function setSigner(address signer, bool allowed) external onlyOwner {
        if (frozen) revert VerifierIsFrozen();
        if (signer == address(0) || isSigner[signer] == allowed) revert InvalidSigner();
        isSigner[signer] = allowed;
        if (allowed) {
            ++signerCount;
        } else {
            --signerCount;
        }
        if (!allowed && threshold > signerCount) revert InvalidThreshold();
        emit SignerUpdated(signer, allowed);
    }

    function setThreshold(uint16 threshold_) external onlyOwner {
        if (frozen) revert VerifierIsFrozen();
        if (threshold_ == 0 || threshold_ > signerCount) revert InvalidThreshold();
        threshold = threshold_;
        emit ThresholdUpdated(threshold_);
    }

    function freeze() external onlyOwner {
        if (frozen) revert VerifierIsFrozen();
        if (signerCount < threshold) revert InvalidThreshold();
        frozen = true;
        emit VerifierFrozen();
    }

    function attestationDigest(bytes32 statement) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "IDONTFUCKINGBELIEVEIT_ATTESTATION_V1",
                block.chainid,
                address(this),
                statement
            )
        );
    }

    function verify(bytes32 statement, bytes calldata proof) external view returns (bool) {
        bytes[] memory signatures = abi.decode(proof, (bytes[]));
        if (signatures.length < threshold) return false;

        bytes32 digest = ECDSA.toEthSignedMessageHash(attestationDigest(statement));
        address previous;
        uint256 accepted;

        for (uint256 i = 0; i < signatures.length; ++i) {
            (address recovered, bool ok) = ECDSA.tryRecover(digest, signatures[i]);
            if (!ok || recovered <= previous || !isSigner[recovered]) return false;
            previous = recovered;
            unchecked { ++accepted; }
        }
        return accepted >= threshold;
    }
}
