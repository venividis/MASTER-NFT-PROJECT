// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Curve} from "../../src/lib/Curve.sol";
import {Section} from "../../src/lib/Types.sol";

/// A window onto the curve library, so the suite can price a section word
/// directly instead of inferring it from a pool's quotes.
contract CurveProbe {
    function conc(uint256 word) external pure returns (uint256) { return Curve.concentration(word); }
    function dir(uint256 word) external pure returns (int256, int256, int256, int256) {
        return Curve.cutDirection(word);
    }
    function pack(uint16[6] memory a, uint16 w, uint8 f, uint8 h) external pure returns (uint256) {
        return Section.pack(a, w, f, h);
    }
}
