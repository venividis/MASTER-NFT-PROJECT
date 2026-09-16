// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  A token that is unreadable exactly when it suits, and readable again by
  the end of the call.

  This is the shape of a pausable token whose admin is not you — USDC, USDT,
  and most compliance-wrapped assets can stop answering for an address on
  somebody else's decision. `pull` models any protocol entry point that
  moves a balance and happens to unpause on the way through.
───────────────────────────────────────────────────────────────────────────*/
contract Winker {
    string public name = "Winker";
    string public symbol = "WINK";
    uint8 public constant decimals = 18;

    mapping(address => uint256) internal _bal;
    bool public paused;

    function pause() external { paused = true; }
    function unpause() external { paused = false; }
    function mint(address to, uint256 a) external { _bal[to] += a; }
    function rawBalance(address who) external view returns (uint256) { return _bal[who]; }

    function balanceOf(address who) external view returns (uint256) {
        require(!paused, "paused");
        return _bal[who];
    }

    /// @dev Unpauses first, so the account can read it again afterwards —
    ///      which is what makes the snapshot/verify asymmetry visible.
    function pull(address to, uint256 a) external {
        paused = false;
        _bal[msg.sender] -= a;
        _bal[to] += a;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        _bal[msg.sender] -= a; _bal[to] += a; return true;
    }
    function approve(address, uint256) external pure returns (bool) { return true; }
}
