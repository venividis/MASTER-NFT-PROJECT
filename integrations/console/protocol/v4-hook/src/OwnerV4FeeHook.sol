// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";

interface IFeeDepositReceiver {
    function depositNative() external payable;
    function depositToken(address token, uint256 amount) external;
}

/// @notice Configurable exact-input v4 hook. Fees accrue as real PoolManager ERC6909 claims.
/// @dev Partial fills and exact-output swaps are explicitly unsupported. No custom AMM math.
contract OwnerV4FeeHook is IUnlockCallback {
    using CurrencyLibrary for Currency;
    using BalanceDeltaLibrary for BalanceDelta;

    uint24 public constant FEE_DENOMINATOR = 1_000_000;
    uint160 public constant REQUIRED_FLAGS = (1 << 7) | (1 << 6) | (1 << 3);
    IPoolManager public immutable poolManager;
    address public owner;
    address public pendingOwner;
    uint24 public feePpm;
    address public recipient;
    bool public routeToSplitter;
    mapping(address currency => mapping(address recipient => mapping(bool viaSplitter => uint256))) public accrued;
    bool public policyCommitted;
    uint24 public committedMaximumFee;
    address public committedRecipient;
    bool public committedSplitter;
    bool public committedExactFee;
    event PolicyCommitted(uint24 maximumFee, address indexed recipient, bool viaSplitter, bool exactFee);
    bool private _swapping;
    bool private _flushing;
    bytes32 private _swapKeyHash;
    uint256 private _expectedPoolInput;

    error Unauthorized();
    error InvalidAddress();
    error InvalidFee();
    error InvalidPool();
    error Busy();
    error ExactInputRequired();
    error InputTooLarge();
    error QuoteExpired();
    error FeeExceedsQuote();
    error InvalidQuote();
    error PartialFillUnsupported();
    error InvalidClaim();
    error TransferFailed();

    event ConfigurationChanged(uint24 feePpm, address indexed recipient, bool routeToSplitter);
    event OwnershipProposed(address indexed proposedOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed owner);
    event FeeAccrued(bytes32 indexed poolKeyHash, address indexed currency, address indexed recipient,
        uint256 amount, bool viaSplitter);
    event FeesFlushed(address indexed currency, address indexed recipient, uint256 amount, bool viaSplitter);

    modifier onlyManager() {
        if (msg.sender != address(poolManager)) revert Unauthorized();
        _;
    }

    modifier onlyOwnerIdle() {
        if (msg.sender != owner) revert Unauthorized();
        if (_swapping || _flushing) revert Busy();
        _;
    }

    constructor(IPoolManager manager_, address owner_, uint24 feePpm_, address recipient_, bool viaSplitter_) {
        if (address(manager_).code.length == 0 || owner_ == address(0) || owner_ == address(this)) revert InvalidAddress();
        poolManager = manager_;
        owner = owner_;
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
        _configure(feePpm_, recipient_, viaSplitter_);
        emit OwnershipTransferred(address(0), owner_);
    }

    receive() external payable {
        if (msg.sender != address(poolManager) || !_flushing) revert Unauthorized();
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory permissions) {
        permissions.beforeSwap = true;
        permissions.afterSwap = true;
        permissions.beforeSwapReturnDelta = true;
    }

    function configure(uint24 nextFeePpm, address nextRecipient, bool viaSplitter) external onlyOwnerIdle {
        _configure(nextFeePpm, nextRecipient, viaSplitter);
    }

    /// @notice Irrevocable fee ceiling and destination, optionally an exact fee.
    /// @dev If destination is a splitter, this does not freeze its beneficiary weights.
    function commitPolicy(uint24 maximumFee, address fixedRecipient, bool viaSplitter, bool exactFee) external onlyOwnerIdle {
        require(!policyCommitted && maximumFee < FEE_DENOMINATOR && feePpm <= maximumFee, "POLICY");
        require(recipient == fixedRecipient && routeToSplitter == viaSplitter && (!exactFee || feePpm == maximumFee), "CURRENT_TERMS");
        policyCommitted = true; committedMaximumFee = maximumFee; committedRecipient = fixedRecipient;
        committedSplitter = viaSplitter; committedExactFee = exactFee;
        emit PolicyCommitted(maximumFee, fixedRecipient, viaSplitter, exactFee);
    }
    function committedPolicy() external view returns (bool, uint24, address, bool, bool) {
        return (policyCommitted, committedMaximumFee, committedRecipient, committedSplitter, committedExactFee);
    }
    function proposeOwner(address next) external onlyOwnerIdle {
        if (next == address(0) || next == address(this)) revert InvalidAddress();
        pendingOwner = next;
        emit OwnershipProposed(next);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        if (_swapping || _flushing) revert Busy();
        address previous = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, msg.sender);
    }

    /// @dev hookData = abi.encode(uint24 maximumAcceptedHookFeePpm, uint64 deadline).
    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        external onlyManager returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (_swapping || _flushing) revert Busy();
        if (address(key.hooks) != address(this)) revert InvalidPool();
        if (params.amountSpecified >= 0) revert ExactInputRequired();
        if (params.amountSpecified < -int256(type(int128).max)) revert InputTooLarge();
        if (hookData.length != 64) revert InvalidQuote();
        (uint24 maximumFee, uint64 deadline) = abi.decode(hookData, (uint24, uint64));
        if (block.timestamp > deadline) revert QuoteExpired();
        uint24 rate = feePpm;
        if (rate > maximumFee) revert FeeExceedsQuote();
        uint256 grossInput = uint256(-params.amountSpecified);
        uint256 fee = grossInput * rate / FEE_DENOMINATOR;
        _swapping = true;
        _swapKeyHash = keccak256(abi.encode(key));
        _expectedPoolInput = grossInput - fee;
        if (fee != 0) {
            Currency input = params.zeroForOne ? key.currency0 : key.currency1;
            // Minting claims creates a negative hook delta. The positive specified
            // return delta below offsets it when PoolManager accounts this swap.
            poolManager.mint(address(this), input.toId(), fee);
            accrued[Currency.unwrap(input)][recipient][routeToSplitter] += fee;
            emit FeeAccrued(_swapKeyHash, Currency.unwrap(input), recipient, fee, routeToSplitter);
        }
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(uint128(fee)), 0), 0);
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external onlyManager returns (bytes4, int128)
    {
        if (!_swapping || keccak256(abi.encode(key)) != _swapKeyHash) revert InvalidPool();
        int128 inputDelta = params.zeroForOne ? delta.amount0() : delta.amount1();
        if (inputDelta >= 0 || uint256(-int256(inputDelta)) != _expectedPoolInput) revert PartialFillUnsupported();
        _swapping = false;
        _swapKeyHash = bytes32(0);
        _expectedPoolInput = 0;
        return (IHooks.afterSwap.selector, 0);
    }

    /// @notice Anyone may forward an existing claim only to its recorded recipient.
    /// @dev Call outside an existing PoolManager unlock. Splitter weights apply when flushed.
    function flush(address currency, address earnedRecipient, bool viaSplitter, uint256 amount) external {
        if (_swapping || _flushing) revert Busy();
        if (amount == 0 || accrued[currency][earnedRecipient][viaSplitter] < amount) revert InvalidClaim();
        accrued[currency][earnedRecipient][viaSplitter] -= amount;
        _flushing = true;
        poolManager.unlock(abi.encode(currency, earnedRecipient, viaSplitter, amount));
        _flushing = false;
        emit FeesFlushed(currency, earnedRecipient, amount, viaSplitter);
    }

    function unlockCallback(bytes calldata data) external onlyManager returns (bytes memory) {
        if (!_flushing || _swapping) revert Busy();
        (address token, address earnedRecipient, bool viaSplitter, uint256 amount) =
            abi.decode(data, (address, address, bool, uint256));
        Currency currency = Currency.wrap(token);
        // Burn produces a positive delta; take consumes it. Unlock ends balanced.
        poolManager.burn(address(this), currency.toId(), amount);
        if (!viaSplitter) {
            poolManager.take(currency, earnedRecipient, amount);
        } else {
            poolManager.take(currency, address(this), amount);
            if (token == address(0)) IFeeDepositReceiver(earnedRecipient).depositNative{value: amount}();
            else {
                _approve(token, earnedRecipient, 0);
                _approve(token, earnedRecipient, amount);
                IFeeDepositReceiver(earnedRecipient).depositToken(token, amount);
                _approve(token, earnedRecipient, 0);
            }
        }
        return bytes("");
    }

    function _configure(uint24 nextFeePpm, address nextRecipient, bool viaSplitter) private {
        if (policyCommitted) {
            require(nextFeePpm <= committedMaximumFee && nextRecipient == committedRecipient && viaSplitter == committedSplitter
                && (!committedExactFee || nextFeePpm == committedMaximumFee), "COMMITTED_POLICY");
        }
        if (nextFeePpm >= FEE_DENOMINATOR) revert InvalidFee();
        if (nextRecipient == address(0) || nextRecipient == address(this)
            || nextRecipient == address(poolManager) || (viaSplitter && nextRecipient.code.length == 0)) revert InvalidAddress();
        feePpm = nextFeePpm;
        recipient = nextRecipient;
        routeToSplitter = viaSplitter;
        emit ConfigurationChanged(nextFeePpm, nextRecipient, viaSplitter);
    }

    function _approve(address token, address spender, uint256 amount) private {
        (bool ok, bytes memory result) = token.call(abi.encodeWithSignature("approve(address,uint256)", spender, amount));
        if (!ok || (result.length != 0 && (result.length != 32 || !abi.decode(result, (bool))))) revert TransferFailed();
    }
}
