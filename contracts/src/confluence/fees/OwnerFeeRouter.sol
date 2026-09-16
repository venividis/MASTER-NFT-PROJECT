// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISettlementConverter} from "./interfaces/ISettlementConverter.sol";

interface IERC20FeeAsset {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
}

/// @notice Owner-defined fee allocation with earned, independently withdrawable claims.
/// @dev Standalone router, NOT a Uniswap hook. Standard ERC20 and native currency only.
/// Deposits are attributed immediately. A later split change cannot rewrite claims.
contract OwnerFeeRouter {
    uint256 public constant MAX_RECIPIENTS = 64;
    uint256 public constant MAX_WEIGHT = 1e18;
    address public owner;
    address public pendingOwner;
    uint256 public configurationVersion;
    uint256 public totalWeight;
    bool public splitCommitted;
    bytes32 public committedSplitHash;
    event SplitCommitted(uint256 indexed version, bytes32 indexed policyHash);
    address[] private _recipients;
    uint256[] private _weights;
    mapping(address token => mapping(address recipient => uint256)) public claimable;
    mapping(address token => uint256) public totalClaimable;
    mapping(address converter => bool) public converterAllowed;
    uint256 private _entered;
    address private _activeConverter;

    struct Conversion {
        address tokenIn;
        uint256 amountIn;
        address tokenOut;
        address converter;
        uint256 minAmountOut;
        uint256 deadline;
        bytes route;
    }

    error Unauthorized();
    error ReentrantCall();
    error InvalidConfiguration();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidAsset();
    error AssetTransferFailed();
    error NonStandardAsset();
    error InsufficientClaim();
    error ConversionNotAllowed();
    error ConversionExpired();
    error InsufficientOutput();
    error IncompleteInputConsumption();
    error NoSurplus();

    event OwnershipProposed(address indexed owner, address indexed proposedOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event SplitConfigured(uint256 indexed version, address[] recipients, uint256[] weights);
    event Deposited(address indexed payer, address indexed token, uint256 amount, uint256 indexed version);
    event Claimed(address indexed beneficiary, address indexed token, address indexed to, uint256 amount);
    event ConverterPermission(address indexed converter, bool allowed);
    event Converted(address indexed beneficiary, address indexed tokenIn, address indexed tokenOut,
        uint256 amountIn, uint256 amountOut, address converter);
    event SurplusAllocated(address indexed token, uint256 amount, uint256 indexed version);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (_entered != 0) revert ReentrantCall();
        _entered = 1;
        _;
        _entered = 0;
    }

    constructor(address owner_, address[] memory recipients_, uint256[] memory weights_) {
        if (owner_ == address(0) || owner_ == address(this)) revert InvalidAddress();
        owner = owner_;
        _configure(recipients_, weights_);
        emit OwnershipTransferred(address(0), owner_);
    }

    /// @dev An active converter returns native output without creating a second deposit.
    receive() external payable {
        if (_activeConverter != address(0) && msg.sender == _activeConverter) return;
        if (_entered != 0) revert ReentrantCall();
        if (msg.value == 0) revert InvalidAmount();
        _entered = 1;
        _allocate(address(0), msg.value);
        emit Deposited(msg.sender, address(0), msg.value, configurationVersion);
        _entered = 0;
    }

    function recipients() external view returns (address[] memory, uint256[] memory) {
        return (_recipients, _weights);
    }

    function configureSplit(address[] calldata recipients_, uint256[] calldata weights_)
        external onlyOwner nonReentrant
    {
        if (splitCommitted) revert InvalidConfiguration();
        _configure(recipients_, weights_);
    }

    /// @notice Irrevocably freeze future deposit allocation; existing claims were already immutable.
    function commitSplit() external onlyOwner nonReentrant {
        if (splitCommitted) revert InvalidConfiguration();
        splitCommitted = true;
        committedSplitHash = keccak256(abi.encode(_recipients, _weights));
        emit SplitCommitted(configurationVersion, committedSplitHash);
    }

    function proposeOwner(address next) external onlyOwner nonReentrant {
        if (next == address(0) || next == address(this)) revert InvalidAddress();
        pendingOwner = next;
        emit OwnershipProposed(owner, next);
    }

    function acceptOwnership() external nonReentrant {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previous = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, msg.sender);
    }

    function setConverter(address converter, bool allowed) external onlyOwner nonReentrant {
        if (converter == address(this) || converter == address(0)) revert InvalidAddress();
        if (allowed && converter.code.length == 0) revert InvalidAddress();
        converterAllowed[converter] = allowed;
        emit ConverterPermission(converter, allowed);
    }

    function depositNative() external payable nonReentrant {
        if (msg.value == 0) revert InvalidAmount();
        _allocate(address(0), msg.value);
        emit Deposited(msg.sender, address(0), msg.value, configurationVersion);
    }

    function depositToken(address token, uint256 amount) external nonReentrant {
        if (token == address(0)) revert InvalidAsset();
        _pull(token, msg.sender, amount);
        _allocate(token, amount);
        emit Deposited(msg.sender, token, amount, configurationVersion);
    }

    /// @notice Convert a new payment before splitting. The payer supplies all input.
    /// @dev Configure a converter to use a DEX route; no conversion market is assumed.
    function depositConverted(Conversion calldata request)
        external payable nonReentrant returns (uint256 amountOut)
    {
        _collect(request.tokenIn, request.amountIn);
        amountOut = _convert(request);
        _allocate(request.tokenOut, amountOut);
        emit Converted(msg.sender, request.tokenIn, request.tokenOut,
            request.amountIn, amountOut, request.converter);
        emit Deposited(msg.sender, request.tokenOut, amountOut, configurationVersion);
    }

    /// @notice Withdraw only the caller's own earned funds to any chosen destination.
    function claim(address token, uint256 amount, address payable to) external nonReentrant {
        _debit(msg.sender, token, amount);
        _pay(token, to, amount);
        emit Claimed(msg.sender, token, to, amount);
    }

    /// @notice Permissionless automation may pay a beneficiary at their own address.
    function claimFor(address token, address payable beneficiary) external nonReentrant returns (uint256 amount) {
        amount = claimable[token][beneficiary];
        _debit(beneficiary, token, amount);
        _pay(token, beneficiary, amount);
        emit Claimed(beneficiary, token, beneficiary, amount);
    }

    /// @notice The beneficiary chooses an output token and explicit conversion constraints.
    function claimConverted(Conversion calldata request, address payable to)
        external nonReentrant returns (uint256 amountOut)
    {
        _debit(msg.sender, request.tokenIn, request.amountIn);
        amountOut = _convert(request);
        _pay(request.tokenOut, to, amountOut);
        emit Converted(msg.sender, request.tokenIn, request.tokenOut,
            request.amountIn, amountOut, request.converter);
        emit Claimed(msg.sender, request.tokenOut, to, amountOut);
    }

    /// @notice Attribute uncredited direct ERC20 transfers / forced native transfers.
    /// @dev Attribution occurs NOW under the current split, not at transfer time.
    /// Integrations must use depositToken/depositNative for historical attribution.
    function allocateSurplus(address token) external nonReentrant returns (uint256 amount) {
        uint256 balance = _balance(token);
        uint256 reserved = totalClaimable[token];
        if (balance <= reserved) revert NoSurplus();
        amount = balance - reserved;
        _allocate(token, amount);
        emit SurplusAllocated(token, amount, configurationVersion);
    }

    function _configure(address[] memory recipients_, uint256[] memory weights_) private {
        uint256 length = recipients_.length;
        if (length == 0 || length > MAX_RECIPIENTS || length != weights_.length) revert InvalidConfiguration();
        uint256 total;
        for (uint256 i; i < length; ++i) {
            if (recipients_[i] == address(0) || recipients_[i] == address(this)) revert InvalidAddress();
            if (weights_[i] == 0 || weights_[i] > MAX_WEIGHT) revert InvalidConfiguration();
            for (uint256 j; j < i; ++j) {
                if (recipients_[i] == recipients_[j]) revert InvalidConfiguration();
            }
            total += weights_[i];
        }
        _recipients = recipients_;
        _weights = weights_;
        totalWeight = total;
        ++configurationVersion;
        emit SplitConfigured(configurationVersion, recipients_, weights_);
    }

    function _allocate(address token, uint256 amount) private {
        uint256 remaining = amount;
        uint256 length = _recipients.length;
        uint256 denominator = totalWeight;
        for (uint256 i; i < length; ++i) {
            // Exact conservation: the final configured recipient receives integer dust.
            // Bounded weights keep the remainder multiplication below 2**256.
            uint256 share = i + 1 == length ? remaining
                : (amount / denominator) * _weights[i] + ((amount % denominator) * _weights[i]) / denominator;
            claimable[token][_recipients[i]] += share;
            remaining -= share;
        }
        totalClaimable[token] += amount;
    }

    function _debit(address beneficiary, address token, uint256 amount) private {
        if (amount == 0) revert InvalidAmount();
        if (claimable[token][beneficiary] < amount) revert InsufficientClaim();
        claimable[token][beneficiary] -= amount;
        totalClaimable[token] -= amount;
    }

    function _collect(address token, uint256 amount) private {
        if (amount == 0) revert InvalidAmount();
        if (token == address(0)) {
            if (msg.value != amount) revert InvalidAmount();
        } else {
            if (msg.value != 0) revert InvalidAmount();
            _pull(token, msg.sender, amount);
        }
    }

    function _convert(Conversion calldata request) private returns (uint256 amountOut) {
        if (request.amountIn == 0) revert InvalidAmount();
        if (block.timestamp > request.deadline) revert ConversionExpired();
        if (request.tokenIn == request.tokenOut) {
            if (request.amountIn < request.minAmountOut) revert InsufficientOutput();
            return request.amountIn;
        }
        address converter = request.converter;
        if (!converterAllowed[converter] || converter.code.length == 0) revert ConversionNotAllowed();
        if (request.minAmountOut == 0) revert InsufficientOutput();
        uint256 inputBefore = _balance(request.tokenIn);
        uint256 outputBefore = _balance(request.tokenOut);
        if (request.tokenIn != address(0)) {
            _approve(request.tokenIn, converter, 0);
            _approve(request.tokenIn, converter, request.amountIn);
        }
        _activeConverter = converter;
        ISettlementConverter(converter).convert{value: request.tokenIn == address(0) ? request.amountIn : 0}(
            request.tokenIn, request.tokenOut, request.amountIn,
            request.minAmountOut, request.deadline, request.route
        );
        _activeConverter = address(0);
        if (request.tokenIn != address(0)) _approve(request.tokenIn, converter, 0);
        uint256 inputAfter = _balance(request.tokenIn);
        if (inputAfter > inputBefore || inputBefore - inputAfter != request.amountIn) revert IncompleteInputConsumption();
        uint256 outputAfter = _balance(request.tokenOut);
        if (outputAfter < outputBefore) revert InsufficientOutput();
        amountOut = outputAfter - outputBefore;
        if (amountOut < request.minAmountOut) revert InsufficientOutput();
    }

    function _balance(address token) private view returns (uint256) {
        if (token == address(0)) return address(this).balance;
        if (token.code.length == 0) revert InvalidAsset();
        return IERC20FeeAsset(token).balanceOf(address(this));
    }

    function _pull(address token, address from, uint256 amount) private {
        if (amount == 0) revert InvalidAmount();
        uint256 beforeBalance = _balance(token);
        _tokenCall(token, abi.encodeCall(IERC20FeeAsset.transferFrom, (from, address(this), amount)));
        uint256 afterBalance = _balance(token);
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) revert NonStandardAsset();
    }

    function _approve(address token, address spender, uint256 amount) private {
        _tokenCall(token, abi.encodeCall(IERC20FeeAsset.approve, (spender, amount)));
    }

    function _pay(address token, address payable to, uint256 amount) private {
        if (to == address(0) || to == address(this)) revert InvalidAddress();
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert AssetTransferFailed();
        } else {
            uint256 beforeBalance = _balance(token);
            uint256 recipientBefore = IERC20FeeAsset(token).balanceOf(to);
            _tokenCall(token, abi.encodeCall(IERC20FeeAsset.transfer, (to, amount)));
            uint256 afterBalance = _balance(token);
            uint256 recipientAfter = IERC20FeeAsset(token).balanceOf(to);
            if (beforeBalance < afterBalance || beforeBalance - afterBalance != amount
                || recipientAfter < recipientBefore || recipientAfter - recipientBefore != amount) revert NonStandardAsset();
        }
    }

    function _tokenCall(address token, bytes memory callData) private {
        if (token.code.length == 0) revert InvalidAsset();
        (bool ok, bytes memory data) = token.call(callData);
        if (!ok || (data.length != 0 && (data.length != 32 || !abi.decode(data, (bool))))) revert AssetTransferFailed();
    }
}
