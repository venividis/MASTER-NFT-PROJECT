// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library Strings {
    bytes16 private constant HEX = "0123456789abcdef";

    function toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            unchecked { ++digits; }
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            unchecked {
                digits -= 1;
                buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            }
            value /= 10;
        }
        return string(buffer);
    }

    function toHexString(address account) internal pure returns (string memory) {
        return toFixedHex(uint256(uint160(account)), 20);
    }

    function toHexString(bytes32 value) internal pure returns (string memory) {
        return toFixedHex(uint256(value), 32);
    }

    function toColor(uint24 value) internal pure returns (string memory) {
        bytes memory buffer = new bytes(7);
        buffer[0] = "#";
        for (uint256 i = 0; i < 6; ++i) {
            buffer[6 - i] = HEX[value & 0xf];
            value >>= 4;
        }
        return string(buffer);
    }

    function toFixedHex(uint256 value, uint256 length) internal pure returns (string memory) {
        bytes memory buffer = new bytes(2 * length + 2);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 2 * length + 1; i > 1; --i) {
            buffer[i] = HEX[value & 0xf];
            value >>= 4;
        }
        require(value == 0, "HEX_LENGTH");
        return string(buffer);
    }
}
