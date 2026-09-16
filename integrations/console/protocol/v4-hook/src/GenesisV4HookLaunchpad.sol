// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {GenesisFixedToken, GenesisV4Position, GenesisPayment} from "./GenesisV4Launchpad.sol";
import {OwnerV4FeeHook} from "./OwnerV4FeeHook.sol";

/// @notice Separate opt-in factory: fixed token, genuine v4 hook pool and redeemable LP shares in one transaction.
/// @dev The hook is explicit and part of the deterministic address namespace. The client pins the known hook runtime.
/// This factory only checks manager/permission compatibility; on-chain callers must independently trust their chosen hook.
/// Token and LP-share holders retain the exact rights of GenesisFixedToken and GenesisV4Position.
contract GenesisV4HookLaunchpad {
    struct Terms {
        string name; string symbol; uint256 supply; address quoteToken;
        uint256 tokenBudget; uint256 quoteBudget; uint24 fee; int24 tickSpacing;
        int24 tickLower; int24 tickUpper; uint160 sqrtPriceX96; uint128 liquidity;
        uint256 deadline; bytes32 salt;
    }
    IPoolManager public immutable manager;
    bool private active;
    event Launched(address indexed token, address indexed position, bytes32 indexed poolId);
    constructor(IPoolManager m) { require(address(m).code.length != 0, "MANAGER"); manager = m; }
    function _salt(Terms calldata t, address payer, address hooks) private pure returns (bytes32) { return keccak256(abi.encode(payer, t.salt, hooks)); }
    function predict(Terms calldata t, address payer, address hooks) public view returns (address token, address position) {
        bytes32 salt = _salt(t, payer, hooks);
        token = _address(salt, keccak256(abi.encodePacked(type(GenesisFixedToken).creationCode, abi.encode(t.name, t.symbol, t.supply))));
        PoolKey memory k = _key(t, token, hooks);
        position = _address(salt, keccak256(abi.encodePacked(type(GenesisV4Position).creationCode, abi.encode(manager, k, t.tickLower, t.tickUpper))));
    }
    function launch(Terms calldata t, address hooks) external returns (address token, address position) {
        require(!active, "BUSY"); active = true;
        require(block.timestamp <= t.deadline && t.quoteToken.code.length != 0 && t.tokenBudget > 0 && t.tokenBudget <= t.supply && t.quoteBudget > 0 && t.fee <= 100000 && t.tickSpacing > 0, "TERMS");
        require(hooks.code.length != 0 && (uint160(hooks) & 0x3fff) == 0x00c8, "HOOK_FLAGS");
        require(address(OwnerV4FeeHook(payable(hooks)).poolManager()) == address(manager), "HOOK_MANAGER");
        bytes32 salt = _salt(t, msg.sender, hooks);
        token = address(new GenesisFixedToken{salt: salt}(t.name, t.symbol, t.supply));
        PoolKey memory k = _key(t, token, hooks);
        position = address(new GenesisV4Position{salt: salt}(manager, k, t.tickLower, t.tickUpper));
        GenesisPayment.transfer(token, position, t.tokenBudget);
        GenesisPayment.pull(t.quoteToken, msg.sender, position, t.quoteBudget);
        manager.initialize(k, t.sqrtPriceX96);
        GenesisV4Position(position).seed(t.liquidity, msg.sender);
        GenesisPayment.transfer(token, msg.sender, t.supply - t.tokenBudget);
        emit Launched(token, position, keccak256(abi.encode(k))); active = false;
    }
    function _key(Terms calldata t, address token, address hooks) private pure returns (PoolKey memory) {
        require(token != t.quoteToken && t.quoteToken != address(0), "PAIR");
        (address a, address b) = token < t.quoteToken ? (token, t.quoteToken) : (t.quoteToken, token);
        // Ordinary LP fees remain owned by position shareholders; the explicit hook accounts its separate fee.
        return PoolKey(Currency.wrap(a), Currency.wrap(b), t.fee, t.tickSpacing, IHooks(hooks));
    }
    function _address(bytes32 salt, bytes32 initHash) private view returns (address) { return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initHash))))); }
}
