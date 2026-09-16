// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  A token that stops answering.

  Not a contrived one. This is what a real asset does when its proxy is
  upgraded to something broken, when its implementation is gone, when a
  pausable token pauses hard, or when a compliance layer decides an address
  is not entitled to a reply. The account cannot prevent any of that and
  should not pretend it can.

  Two switches, because they are different failures and the account has to
  tell them apart:

    breakBalance   balanceOf reverts — the account goes blind
    breakTransfer  transfer reverts — the asset is stuck but still visible
───────────────────────────────────────────────────────────────────────────*/
contract Breakable {
    string public name = "Breakable";
    string public symbol = "BRK";
    uint8 public constant decimals = 18;

    mapping(address => uint256) internal _bal;
    bool public breakBalance;
    bool public breakTransfer;

    function setBreakBalance(bool v) external { breakBalance = v; }
    function setBreakTransfer(bool v) external { breakTransfer = v; }

    function mint(address to, uint256 amount) external {
        _bal[to] += amount;
    }

    function balanceOf(address who) external view returns (uint256) {
        require(!breakBalance, "balanceOf is gone");
        return _bal[who];
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(!breakTransfer, "transfer is gone");
        _bal[msg.sender] -= amount;
        _bal[to] += amount;
        return true;
    }

    function approve(address, uint256) external pure returns (bool) {
        return true;
    }
}
