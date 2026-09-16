// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Curve} from "../../src/lib/Curve.sol";
import {Section} from "../../src/lib/Types.sol";
import {SSTORE2} from "../../src/lib/SSTORE2.sol";

/*───────────────────────────────────────────────────────────────────────────
  A window onto the internal libraries.

  Curve, Section and SSTORE2 are `internal`, which is right — they are
  inlined into the contracts that use them and have no business being a
  public surface. But a property test has to call them a hundred thousand
  times with hostile inputs, and it cannot do that through a library that
  does not exist at an address.

  So this exposes them, and only this does: it is under test/mocks and is
  never deployed alongside the collection. Every function here is a
  one-line forward, so a bug found through this window is a bug in the
  library rather than in the window.
───────────────────────────────────────────────────────────────────────────*/
contract Probe {
    /*──────────────── Curve ────────────────*/

    function MAX_CONCENTRATION() external pure returns (uint256) {
        return Curve.MAX_CONCENTRATION;
    }

    function concentration(uint256 word) external pure returns (uint256) {
        return Curve.concentration(word);
    }

    function anchor(uint256 word, uint256 rBase, uint256 rQuote)
        external pure returns (uint256 vBase, uint256 vQuote)
    {
        return Curve.anchor(word, rBase, rQuote);
    }

    function amountOut(uint256 amountIn, uint256 rIn, uint256 rOut,
                       uint256 vIn, uint256 vOut, uint256 feeBps)
        external pure returns (uint256)
    {
        return Curve.amountOut(amountIn, rIn, rOut, vIn, vOut, feeBps);
    }

    function invariant(uint256 rIn, uint256 rOut, uint256 vIn, uint256 vOut)
        external pure returns (uint256)
    {
        return Curve.invariant(rIn, rOut, vIn, vOut);
    }

    function spot(uint256 rIn, uint256 rOut, uint256 vIn, uint256 vOut)
        external pure returns (uint256)
    {
        return Curve.spot(rIn, rOut, vIn, vOut);
    }

    /*──────────────── Section ────────────────*/

    /// @dev Flat rather than `uint16[6]`, because a fixed-size array is the
    ///      one ABI shape the harness has no encoder for, and adding one to
    ///      encode a test helper would be the tail wagging the dog.
    function pack(uint16 a0, uint16 a1, uint16 a2, uint16 a3, uint16 a4, uint16 a5,
                  uint16 w, uint8 f, uint8 h)
        external pure returns (uint256)
    {
        uint16[6] memory a = [a0, a1, a2, a3, a4, a5];
        return Section.pack(a, w, f, h);
    }

    function unpack(uint256 word)
        external pure
        returns (uint16[6] memory angles, uint16 w, uint8 f, uint8 h, bool valid)
    {
        for (uint256 i; i < 6; ++i) angles[i] = Section.angle(word, i);
        return (angles, Section.offsetW(word), Section.form(word), Section.hue(word), Section.valid(word));
    }

    /*──────────────── SSTORE2 ────────────────*/

    function write(bytes calldata data) external returns (address) {
        return SSTORE2.write(data);
    }

    function read(address ptr) external view returns (bytes memory) {
        return SSTORE2.read(ptr);
    }

    function size(address ptr) external view returns (uint256) {
        return SSTORE2.size(ptr);
    }

    /// @notice Write and read back in one call, so a round-trip property
    ///         does not depend on the harness holding a pointer correctly.
    function roundTrip(bytes calldata data) external returns (bytes memory) {
        return SSTORE2.read(SSTORE2.write(data));
    }
}
