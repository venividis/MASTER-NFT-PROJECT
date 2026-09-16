// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// The salt miner's own arithmetic, exposed one salt at a time, so the
/// address it computes can be compared against an independent one.
contract MineProbe {
    function at(address deployer, bytes32 initCodeHash, uint256 salt)
        external pure returns (address a)
    {
        assembly ("memory-safe") {
            let p := mload(0x40)
            mstore8(p, 0xff)
            mstore(add(p, 1), shl(96, deployer))
            mstore(add(p, 53), initCodeHash)
            mstore(add(p, 21), salt)
            a := and(keccak256(p, 85), 0xffffffffffffffffffffffffffffffffffffffff)
        }
    }
    /// Kiln.mine's loop verbatim, but reporting what it computed rather
    /// than only whether it matched.
    function loop(address deployer, bytes32 initCodeHash, uint16 flags, uint256 from, uint256 tries)
        external pure returns (uint256 want, address firstAddr, uint256 firstLow, bool found)
    {
        want = uint256(uint160(flags) & uint160((1 << 14) - 1));
        assembly ("memory-safe") {
            let p := mload(0x40)
            mstore8(p, 0xff)
            mstore(add(p, 1), shl(96, deployer))
            mstore(add(p, 53), initCodeHash)
            let mask := 0x3fff
            for { let i := 0 } lt(i, tries) { i := add(i, 1) } {
                let s := add(from, i)
                mstore(add(p, 21), s)
                let a := and(keccak256(p, 85), 0xffffffffffffffffffffffffffffffffffffffff)
                if iszero(i) { firstAddr := a  firstLow := and(a, mask) }
                if eq(and(a, mask), want) { found := 1 break }
            }
        }
    }

    /// The same thing written the plain way, as a control.
    function plain(address deployer, bytes32 initCodeHash, uint256 salt)
        external pure returns (address)
    {
        return address(uint160(uint256(keccak256(
            abi.encodePacked(bytes1(0xff), deployer, bytes32(salt), initCodeHash)))));
    }
}
