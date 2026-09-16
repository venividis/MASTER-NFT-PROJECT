// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Administrated} from "../lib/Administrated.sol";
import {IActionVerifier, IProofRouter} from "../interfaces/Interfaces.sol";
import {ThresholdAttestationVerifier} from "./ThresholdAttestationVerifier.sol";

/// @notice Upgrade-minimized verifier dispatch. Configuration can be frozen forever.
contract ProofRouter is Administrated, IProofRouter {
    mapping(uint32 => address) private _verifiers;
    mapping(uint32 => bytes32) public verifierCodehash;
    bool public frozen;

    event VerifierSet(uint32 indexed verifierId, address indexed verifier, bytes32 codehash);
    event RouterFrozen();

    error RouterIsFrozen();
    error InvalidVerifier();

    constructor(address admin) Administrated(admin) {}

    function setVerifier(uint32 verifierId, address verifier) external onlyOwner {
        if (frozen) revert RouterIsFrozen();
        if (verifierId == 0 || verifier.code.length == 0) revert InvalidVerifier();
        bytes32 codehash = verifier.codehash;
        _verifiers[verifierId] = verifier;
        verifierCodehash[verifierId] = codehash;
        emit VerifierSet(verifierId, verifier, codehash);
    }

    function freeze() external onlyOwner {
        if (frozen) revert RouterIsFrozen();
        frozen = true;
        emit RouterFrozen();
    }

    function verifierOf(uint32 verifierId) external view returns (address) {
        return _verifiers[verifierId];
    }

    /// @notice A supported authority whose configuration can no longer be changed.
    /// @dev Deliberately excludes arbitrary adapters, proxies and recursive composites.
    /// A frozen() claim from unknown bytecode is not proof of immutable authority.
    function frozenAuthority(uint32 verifierId) external view returns (bool) {
        address verifier = _verifiers[verifierId];
        if (!frozen || verifier.codehash != keccak256(type(ThresholdAttestationVerifier).runtimeCode)) return false;
        ThresholdAttestationVerifier authority = ThresholdAttestationVerifier(verifier);
        return authority.frozen() && authority.threshold() != 0 && authority.signerCount() >= authority.threshold();
    }

    function verify(uint32 verifierId, bytes32 statement, bytes calldata proof) external view returns (bool) {
        address verifier = _verifiers[verifierId];
        if (verifier == address(0)) return false;
        if (verifier.codehash != verifierCodehash[verifierId]) return false;
        try IActionVerifier(verifier).verify(statement, proof) returns (bool valid) {
            return valid;
        } catch {
            return false;
        }
    }
}
