// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev A plain ERC-20 for tests, plus two behaviours that break naive
///      pool code: a token that returns nothing from transfer (USDT), and
///      a token that takes a cut on the way through (fee-on-transfer).
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    /// @dev basis points skimmed on every transfer; 0 for a normal token
    uint256 public immutable transferFeeBps;
    /// @dev when true, transfer/transferFrom return no data at all
    bool public immutable silent;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory n, string memory s, uint8 d, uint256 feeBps, bool silent_) {
        name = n; symbol = s; decimals = d;
        transferFeeBps = feeBps; silent = silent_;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return _ret();
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount);
        return _ret();
    }

    function _move(address from, address to, uint256 amount) private {
        balanceOf[from] -= amount;
        uint256 net = amount - (amount * transferFeeBps) / 10_000;
        balanceOf[to] += net;
        if (net != amount) totalSupply -= amount - net;   // the cut is burned
        emit Transfer(from, to, net);
    }

    /// @dev Returns true normally; returns nothing when `silent`.
    function _ret() private view returns (bool) {
        if (silent) assembly { return(0, 0) }
        return true;
    }
}
