// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  LibNum — numbers and addresses as text

  Every string this contract emits ends up inside a JSON document that a
  marketplace will parse, or inside a JavaScript object literal that a
  browser will evaluate. Both are unforgiving, so nothing here is allowed
  to produce a malformed token.
───────────────────────────────────────────────────────────────────────────*/
library LibNum {
    bytes16 private constant HEX = "0123456789abcdef";

    function str(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 n = v;
        uint256 len;
        unchecked { while (n != 0) { len++; n /= 10; } }
        bytes memory b = new bytes(len);
        unchecked { while (v != 0) { b[--len] = bytes1(uint8(48 + v % 10)); v /= 10; } }
        return string(b);
    }

    /// @dev Signed, for coordinates that live on both sides of the origin.
    function strInt(int256 v) internal pure returns (string memory) {
        if (v >= 0) return str(uint256(v));
        return string(abi.encodePacked("-", str(uint256(-v))));
    }

    function hexAddr(address a) internal pure returns (string memory) {
        bytes memory o = new bytes(42);
        o[0] = "0"; o[1] = "x";
        uint160 v = uint160(a);
        unchecked {
            for (uint256 i = 41; i > 1; i--) { o[i] = HEX[v & 0xf]; v >>= 4; }
        }
        return string(o);
    }

    function hex32(bytes32 v) internal pure returns (string memory) {
        bytes memory o = new bytes(66);
        o[0] = "0"; o[1] = "x";
        unchecked {
            for (uint256 i; i < 32; i++) {
                o[2 + i * 2] = HEX[uint8(v[i]) >> 4];
                o[3 + i * 2] = HEX[uint8(v[i]) & 0x0f];
            }
        }
        return string(o);
    }

    /// @dev A fixed-point decimal with `places` digits after the point, for
    ///      writing angles and offsets into SVG without a float type.
    function fixed1(int256 scaled, uint256 places) internal pure returns (string memory) {
        uint256 unit = 10 ** places;
        bool neg = scaled < 0;
        uint256 a = neg ? uint256(-scaled) : uint256(scaled);
        uint256 whole = a / unit;
        uint256 frac = a % unit;
        bytes memory f = bytes(str(frac));
        bytes memory pad = new bytes(places - f.length);
        for (uint256 i; i < pad.length; i++) pad[i] = "0";
        return string(abi.encodePacked(neg ? "-" : "", str(whole), ".", pad, f));
    }
}
