// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IDataVerifier} from "../../src/interfaces/Standards.sol";

/// @dev A stand-in for the oracle an ERC-7857 deployment would really use —
///      a TEE attestation verifier or a zero-knowledge proof verifier. This
///      one just unpacks three words so the token's own logic can be tested
///      without pretending to have attested anything.
contract MockVerifier is IDataVerifier {
    function verifyTransfer(bytes calldata proof)
        external pure
        returns (bool ok, bytes32[] memory oldHashes, bytes32[] memory newHashes, bytes32 to_)
    {
        require(proof.length == 96, "proof");
        oldHashes = new bytes32[](1);
        newHashes = new bytes32[](1);
        oldHashes[0] = bytes32(proof[0:32]);
        newHashes[0] = bytes32(proof[32:64]);
        to_ = bytes32(proof[64:96]);
        ok = true;
    }
}
