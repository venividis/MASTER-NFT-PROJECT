// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  A token carrying an allowance function the refusal list never heard of.

  Permit2's `approve(address,address,uint160,uint48)` is 0x87517c45 and
  grants standing custody exactly as `approve(address,uint256)` does. The
  seal's approval defence is a six-selector enumeration — the one shape of
  defence the file's own comment says cannot be completed.
───────────────────────────────────────────────────────────────────────────*/
contract Permit2ish {
    string public name = "Permit2ish";
    string public symbol = "P2";
    uint8 public constant decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a; return true;
    }
    /// @notice 0x87517c45 — the Permit2 shape. Same authority, different word.
    function approve(address token, address spender, uint160 amount, uint48) external {
        token; allowance[msg.sender][spender] = amount;
    }
    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[t] += a; return true;
    }
}
