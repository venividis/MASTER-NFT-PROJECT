// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IPoolManager} from "@v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "@v4-core/types/PoolKey.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@v4-core/types/BalanceDelta.sol";
/// @notice Runs the actual hook/pool swap and rolls every state change back before returning its quote.
contract OfficialV4QuoteLens {
    using BalanceDeltaLibrary for BalanceDelta;
    IPoolManager public immutable manager;
    error QuoteResult(uint256 spent,uint256 received);
    error InvalidQuote();
    constructor(IPoolManager manager_) { require(address(manager_).code.length != 0); manager=manager_; }
    function quote(PoolKey calldata key,bool zeroForOne,uint128 amountIn,uint160 limit) external returns(uint256 spent,uint256 received) {
        try manager.unlock(abi.encode(key,zeroForOne,amountIn,limit)) { revert InvalidQuote(); }
        catch(bytes memory reason) {
            if(reason.length!=68 || bytes4(reason)!=QuoteResult.selector) assembly { revert(add(reason,32),mload(reason)) }
            assembly { spent:=mload(add(reason,36)) received:=mload(add(reason,68)) }
        }
    }
    function unlockCallback(bytes calldata data) external returns(bytes memory) {
        require(msg.sender==address(manager));
        (PoolKey memory key,bool direction,uint128 amount,uint160 limit)=abi.decode(data,(PoolKey,bool,uint128,uint160));
        BalanceDelta delta=manager.swap(key,IPoolManager.SwapParams(direction,-int256(uint256(amount)),limit),bytes(""));
        int128 incoming=direction?delta.amount0():delta.amount1(); int128 outgoing=direction?delta.amount1():delta.amount0();
        if(incoming>0||outgoing<0) revert InvalidQuote();
        revert QuoteResult(uint256(-int256(incoming)),uint128(outgoing));
    }
}
