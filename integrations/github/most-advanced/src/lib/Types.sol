// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  The whole of a token's mutable form is one 256-bit word.

    bits   0.. 15   angle in the xy plane        ┐
    bits  16.. 31   angle in the xz plane        │ three rotations that leave
    bits  32.. 47   angle in the yz plane        ┘ w alone: the section spins
    bits  48.. 63   angle in the xw plane        ┐
    bits  64.. 79   angle in the yw plane        │ three that turn the solid
    bits  80.. 95   angle in the zw plane        ┘ through w: the section
                                                   changes shape
    bits  96..111   position of the section along w
    bits 112..119   which solid
    bits 120..127   hue

  Angles are sixteenths of a thousandth of a turn — 2π/65536 — which is
  finer than a display can resolve and costs nothing, because all six of
  them and everything else fit in a single storage slot. Committing a new
  orientation is one SSTORE.
───────────────────────────────────────────────────────────────────────────*/
library Section {
    uint256 internal constant FORM_COUNT = 8;

    function angle(uint256 word, uint256 plane) internal pure returns (uint16) {
        return uint16(word >> (plane * 16));
    }

    function offsetW(uint256 word) internal pure returns (uint16) {
        return uint16(word >> 96);
    }

    function form(uint256 word) internal pure returns (uint8) {
        return uint8(word >> 112);
    }

    function hue(uint256 word) internal pure returns (uint8) {
        return uint8(word >> 120);
    }

    /// @dev The only constraint: a solid that is not one of the eight cannot
    ///      be rendered, so it cannot be committed.
    function valid(uint256 word) internal pure returns (bool) {
        return form(word) < FORM_COUNT && (word >> 128) == 0;
    }

    function pack(uint16[6] memory angles, uint16 w, uint8 f, uint8 h)
        internal pure returns (uint256 word)
    {
        unchecked {
            for (uint256 i; i < 6; ++i) word |= uint256(angles[i]) << (i * 16);
            word |= uint256(w) << 96;
            word |= uint256(f) << 112;
            word |= uint256(h) << 120;
        }
    }
}

/// @dev Everything the renderer needs, gathered once by the token so the
///      renderer never has to call back into it.
struct TokenView {
    uint256 id;
    uint256 word;        // the section
    bytes32 seed;
    address owner;
    address collection;
    address boundAccount;   // the Reach — the hand that acts
    address grip;           // the Grip — the hand that only closes
    /// @dev The two implementations, so the instrument can re-derive both
    ///      addresses by CREATE2 rather than take this contract's word for
    ///      them. A viewer that only reads what it is handed cannot tell a
    ///      correct answer from a convenient one.
    address reachImpl;
    address gripImpl;
    address pool;
    uint32  ops;
    uint32  strata;
    uint32  xfers;
    uint16  open;
    uint64  mintBlock;
    bool    locked;
    /// @dev 0 absent · 1 current · 2 stale. Not a bool, because "there is a
    ///      kernel" and "it is sealed to whoever holds this token" are
    ///      different facts and a buyer needs the second one.
    uint8   kernel;
}
