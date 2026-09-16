// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Fixed-supply ERC20. No hidden minting, tax, platform allocation or business category.
contract OwnerLaunchToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    error InvalidLaunch();
    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidRecipient();
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint256 supply_, address recipient_) {
        if (bytes(name_).length == 0 || bytes(name_).length > 128
            || bytes(symbol_).length == 0 || bytes(symbol_).length > 32 || supply_ == 0) revert InvalidLaunch();
        if (recipient_ == address(0) || recipient_ == address(this)) revert InvalidRecipient();
        name = name_;
        symbol = symbol_;
        totalSupply = supply_;
        balanceOf[recipient_] = supply_;
        emit Transfer(address(0), recipient_, supply_);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 approved = allowance[from][msg.sender];
        if (approved != type(uint256).max) {
            if (approved < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = approved - amount;
            emit Approval(from, msg.sender, approved - amount);
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        if (to == address(0)) revert InvalidRecipient();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

/// @notice Permissionless fixed-supply launches with creator-authored configuration commitments.
/// @dev A recorded hook/pool commitment is metadata, NOT proof that a v4 pool exists.
contract OwnerLaunchFactory {
    struct Configuration {
        address selectedHook;
        bytes32 poolConfigurationHash;
        bytes32 metadataHash;
    }
    mapping(address token => address creator) public creatorOf;
    mapping(address token => Configuration) public configurationOf;
    error Unauthorized();
    event TokenLaunched(address indexed creator, address indexed token, address indexed recipient, uint256 supply);
    event ConfigurationRecorded(address indexed token, address indexed creator, address selectedHook,
        bytes32 poolConfigurationHash, bytes32 metadataHash);

    function launch(string calldata name, string calldata symbol, uint256 supply, address recipient,
        Configuration calldata configuration) external returns (address token)
    {
        token = address(new OwnerLaunchToken(name, symbol, supply, recipient));
        creatorOf[token] = msg.sender;
        configurationOf[token] = configuration;
        emit TokenLaunched(msg.sender, token, recipient, supply);
        emit ConfigurationRecorded(token, msg.sender, configuration.selectedHook,
            configuration.poolConfigurationHash, configuration.metadataHash);
    }

    function recordConfiguration(address token, Configuration calldata configuration) external {
        if (creatorOf[token] != msg.sender) revert Unauthorized();
        configurationOf[token] = configuration;
        emit ConfigurationRecorded(token, msg.sender, configuration.selectedHook,
            configuration.poolConfigurationHash, configuration.metadataHash);
    }
}
