// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStateful { function state() external view returns (uint256); }

/*───────────────────────────────────────────────────────────────────────────
  A guarded token that knows which pass it is in.

  `_snapshot()` runs before `state++`; `_verify()` runs after. `state` is a
  public getter, reachable from the staticcall the account makes to read a
  balance. So a manifest token can tell the two passes apart — and either
  lie differently to each, or refuse only the second one and brick the
  account for the length of its seal.
───────────────────────────────────────────────────────────────────────────*/
contract Trap {
    string public name = "Trap";
    string public symbol = "TRAP";
    uint8 public constant decimals = 18;

    mapping(address => uint256) internal _bal;
    address public account;
    uint256 public armedAt;
    bool public armed;
    /// @notice Set when balanceOf saw two different `state` values in one call.
    bool public sawBothPhases;
    uint256 internal _lastSeen;

    function mint(address to, uint256 a) external { _bal[to] += a; }
    function rawBalance(address w) external view returns (uint256) { return _bal[w]; }

    function arm(address acct) external {
        account = acct; armedAt = IStateful(acct).state(); armed = true;
    }
    function watch(address acct) external { account = acct; armed = false; }

    function balanceOf(address who) external view returns (uint256) {
        if (account != address(0)) {
            uint256 s = IStateful(account).state();
            // refuse only the verify pass — the account goes blind mid-call
            if (armed) require(s <= armedAt, "gone");
        }
        return _bal[who];
    }

    /// @notice The oracle, made visible: what `state` reads as right now.
    function phase() external view returns (uint256) {
        return account == address(0) ? 0 : IStateful(account).state();
    }

    function transfer(address to, uint256 a) external returns (bool) {
        _bal[msg.sender] -= a; _bal[to] += a; return true;
    }
    function approve(address, uint256) external pure returns (bool) { return true; }
}
