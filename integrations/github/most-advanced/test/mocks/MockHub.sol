// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev The three functions the Nameplate reads off a collection, with
///      setters. The real Ipseity is exercised against the resolver in
///      `verify-site.mjs`; this exists so the cross-chain routing can be
///      driven at ids no single chain's hub would ever hold — a Base-band
///      id asked of a resolver sitting on Ethereum is the whole point, and
///      no real hub can be made to answer for one.
contract MockHub {
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => address) public account;
    mapping(uint256 => address) public grip;
    uint256 public totalSupply;

    function set(uint256 id, address who, address acct) external {
        ownerOf[id] = who;
        account[id] = acct;
        if (id > totalSupply) totalSupply = id;
    }

    function setGrip(uint256 id, address g) external { grip[id] = g; }
    function setSupply(uint256 n) external { totalSupply = n; }
}
