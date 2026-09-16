// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  A token that answers balanceOf with the top bit set.

  Nothing about this is exotic. A balance is a uint256 and the standard says
  nothing about which bits a token may use; a token that packs a flag into
  the high bit, or that returns a scaled internal representation, is doing
  something ERC-20 permits. The account's assumption that "balances cannot
  reach 2^255, so the bit is free" is an assumption about somebody else's
  contract, and this is that contract.
───────────────────────────────────────────────────────────────────────────*/
contract HighBit {
    string public name = "HighBit";
    string public symbol = "HIBIT";
    uint8 public constant decimals = 18;

    mapping(address => uint256) internal _bal;
    bool public taint;

    function setTaint(bool v) external { taint = v; }
    function mint(address to, uint256 a) external { _bal[to] += a; }

    /// @notice The honest number, for the test to check against.
    function rawBalance(address who) external view returns (uint256) { return _bal[who]; }

    function balanceOf(address who) external view returns (uint256) {
        return taint ? (_bal[who] | (1 << 255)) : _bal[who];
    }

    function transfer(address to, uint256 a) external returns (bool) {
        _bal[msg.sender] -= a; _bal[to] += a; return true;
    }
    function approve(address, uint256) external pure returns (bool) { return true; }
}
