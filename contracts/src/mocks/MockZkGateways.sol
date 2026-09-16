// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockSP1Gateway {
    bytes32 public requiredVKey;
    bytes32 public requiredProofHash;

    constructor(bytes32 vkey, bytes32 proofHash) {
        requiredVKey = vkey;
        requiredProofHash = proofHash;
    }

    function verifyProof(bytes32 programVKey, bytes calldata, bytes calldata proofBytes) external view {
        require(programVKey == requiredVKey && keccak256(proofBytes) == requiredProofHash, "BAD_SP1_PROOF");
    }
}

contract MockRiscZeroVerifier {
    bytes32 public requiredImageId;
    bytes32 public requiredSealHash;

    constructor(bytes32 imageId, bytes32 sealHash) {
        requiredImageId = imageId;
        requiredSealHash = sealHash;
    }

    function verify(bytes calldata seal, bytes32 imageId, bytes32) external view {
        require(imageId == requiredImageId && keccak256(seal) == requiredSealHash, "BAD_R0_PROOF");
    }
}
