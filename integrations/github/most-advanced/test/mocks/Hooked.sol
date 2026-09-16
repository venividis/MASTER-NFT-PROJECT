// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPoolSync { function syncCurve(uint256 id) external; }
interface INftCommit { function commit(uint256 id, uint256 word) external; }

/*───────────────────────────────────────────────────────────────────────────
  A token that calls out during transferFrom.

  ERC-777, ERC-1363, and every "transfer hook" token does this. The pool
  pulls the input before it reads the curve it is about to price against,
  so the pull is a window — and the holder is the one contract allowed to
  move the curve.
───────────────────────────────────────────────────────────────────────────*/
contract Hooked {
    string public name = "Hooked";
    string public symbol = "HOOK";
    uint8 public constant decimals = 18;

    mapping(address => uint256) public balanceOf;
    address public pool;
    address public nft;
    uint256 public id;
    bool public armed;

    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address, uint256) external pure returns (bool) { return true; }

    function arm(address pool_, address nft_, uint256 id_) external {
        pool = pool_; nft = nft_; id = id_; armed = true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }

    function transferFrom(address from, address to, uint256 a) external returns (bool) {
        if (armed) {
            armed = false;                       // once, so the re-anchor cannot recurse
            // flatten the curve mid-pull: commit concentration zero, then sync
            try INftCommit(nft).commit(id, 0) {} catch {}
            try IPoolSync(pool).syncCurve(id) {} catch {}
        }
        balanceOf[from] -= a; balanceOf[to] += a; return true;
    }
}
