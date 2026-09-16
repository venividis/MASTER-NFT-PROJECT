// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1271} from "../interfaces/Interfaces.sol";

library ECDSA {
    // secp256k1n / 2
    uint256 private constant HALF_ORDER =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    function toEthSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function tryRecover(bytes32 hash, bytes memory signature) internal pure returns (address signer, bool ok) {
        if (signature.length != 65) return (address(0), false);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        if (uint256(s) > HALF_ORDER || (v != 27 && v != 28)) return (address(0), false);
        signer = ecrecover(hash, v, r, s);
        ok = signer != address(0);
    }
}

library SignatureChecker {
    bytes4 private constant MAGICVALUE = 0x1626ba7e;

    function isValidSignatureNow(
        address signer,
        bytes32 hash,
        bytes memory signature
    ) internal view returns (bool) {
        if (signer.code.length == 0) {
            (address recovered, bool ok) = ECDSA.tryRecover(hash, signature);
            return ok && recovered == signer;
        }

        (bool success, bytes memory result) = signer.staticcall(
            abi.encodeCall(IERC1271.isValidSignature, (hash, signature))
        );
        if (!success || result.length < 32) return false;
        bytes4 returnedValue;
        assembly ("memory-safe") {
            returnedValue := mload(add(result, 32))
        }
        return returnedValue == MAGICVALUE;
    }
}
