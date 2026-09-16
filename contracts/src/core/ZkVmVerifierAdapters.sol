// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IActionVerifier} from "../interfaces/Interfaces.sol";

/// @dev Minimal gateway surface used by Succinct SP1 verifier contracts.
interface ISP1VerifierGateway {
    function verifyProof(
        bytes32 programVKey,
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view;
}

/// @dev Minimal verifier surface used by RISC Zero Ethereum verifier contracts.
interface IRiscZeroVerifier {
    function verify(bytes calldata seal, bytes32 imageId, bytes32 journalDigest) external view;
}

/// @notice Adapts an SP1 program whose public output is exactly the 32-byte action statement.
contract SP1ActionVerifier is IActionVerifier {
    address public immutable gateway;
    bytes32 public immutable gatewayCodehash;
    bytes32 public immutable programVKey;

    constructor(address gateway_, bytes32 programVKey_) {
        require(gateway_.code.length != 0 && programVKey_ != bytes32(0), "INVALID_SP1_CONFIG");
        gateway = gateway_;
        gatewayCodehash = gateway_.codehash;
        programVKey = programVKey_;
    }

    /// @param proof ABI encoding of (bytes publicValues, bytes proofBytes).
    function verify(bytes32 statement, bytes calldata proof) external view returns (bool) {
        if (gateway.codehash != gatewayCodehash) return false;
        (bytes memory publicValues, bytes memory proofBytes) = abi.decode(proof, (bytes, bytes));
        if (publicValues.length != 32 || _word(publicValues) != statement) return false;
        try ISP1VerifierGateway(gateway).verifyProof(programVKey, publicValues, proofBytes) {
            return true;
        } catch {
            return false;
        }
    }

    function _word(bytes memory value) private pure returns (bytes32 result) {
        assembly ("memory-safe") {
            result := mload(add(value, 32))
        }
    }
}

/// @notice Adapts a RISC Zero guest whose journal is exactly the 32-byte action statement.
contract RiscZeroActionVerifier is IActionVerifier {
    address public immutable verifier;
    bytes32 public immutable verifierCodehash;
    bytes32 public immutable imageId;

    constructor(address verifier_, bytes32 imageId_) {
        require(verifier_.code.length != 0 && imageId_ != bytes32(0), "INVALID_R0_CONFIG");
        verifier = verifier_;
        verifierCodehash = verifier_.codehash;
        imageId = imageId_;
    }

    /// @param proof ABI encoding of (bytes seal, bytes journal).
    function verify(bytes32 statement, bytes calldata proof) external view returns (bool) {
        if (verifier.codehash != verifierCodehash) return false;
        (bytes memory seal, bytes memory journal) = abi.decode(proof, (bytes, bytes));
        if (journal.length != 32 || _word(journal) != statement) return false;
        try IRiscZeroVerifier(verifier).verify(seal, imageId, sha256(journal)) {
            return true;
        } catch {
            return false;
        }
    }

    function _word(bytes memory value) private pure returns (bytes32 result) {
        assembly ("memory-safe") {
            result := mload(add(value, 32))
        }
    }
}

/// @notice Immutable M-of-N composition. Use 2-of-2 for TEE AND zkVM hybrid evidence.
contract CompositeActionVerifier is IActionVerifier {
    address[] public verifiers;
    bytes32[] public verifierCodehashes;
    uint8 public immutable threshold;

    constructor(address[] memory verifiers_, uint8 threshold_) {
        require(
            verifiers_.length > 0 &&
            verifiers_.length <= 8 &&
            threshold_ > 0 &&
            threshold_ <= verifiers_.length,
            "INVALID_COMPOSITE"
        );
        threshold = threshold_;
        for (uint256 i = 0; i < verifiers_.length; ++i) {
            require(verifiers_[i].code.length != 0, "INVALID_VERIFIER");
            for (uint256 j = 0; j < i; ++j) require(verifiers_[j] != verifiers_[i], "DUPLICATE_VERIFIER");
            verifiers.push(verifiers_[i]);
            verifierCodehashes.push(verifiers_[i].codehash);
        }
    }

    /// @param proof ABI encoding of bytes[] where each entry belongs to the verifier at the same index.
    function verify(bytes32 statement, bytes calldata proof) external view returns (bool) {
        bytes[] memory proofs = abi.decode(proof, (bytes[]));
        if (proofs.length != verifiers.length) return false;
        uint256 accepted;
        for (uint256 i = 0; i < verifiers.length; ++i) {
            address verifier = verifiers[i];
            if (verifier.codehash != verifierCodehashes[i]) return false;
            try IActionVerifier(verifier).verify(statement, proofs[i]) returns (bool valid) {
                if (valid) {
                    unchecked { ++accepted; }
                    if (accepted >= threshold) return true;
                }
            } catch {
                // A failed component is counted as false; threshold semantics remain deterministic.
            }
            if (accepted + (verifiers.length - i - 1) < threshold) return false;
        }
        return accepted >= threshold;
    }
}
