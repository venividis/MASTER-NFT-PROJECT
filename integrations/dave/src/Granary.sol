// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./lib/Interfaces.sol";

interface IHubY {
    function vaultOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
    function treasury() external view returns (address);
    function timelock() external view returns (address);
}
interface IVaultAckY { function acknowledge(address t) external; }
interface ISilo {
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner_) external returns (uint256 assets);
    function convertToAssets(uint256 shares) external view returns (uint256);
}

/// @title Granary — Codicil XVI. Sealed capital that still farms.
///
/// @notice The seal locks value in; it never said the value must sit
///         idle. The Granary routes vault capital into ERC-4626 yield
///         SILOS — and only into silos the covenant's timelock has
///         BLESSED, because a rotten silo is an exit wearing a yield
///         costume. Curation is the contract's whole job; the other half
///         is the pin:
///
///         EVERYTHING LANDS IN THE VAULT. sow() deposits with the
///         receiver hard-pinned to the Dave's vault — shares arrive
///         inside the covenant, accretive under the Chambers boundary by
///         construction. reap() redeems with the receiver pinned the
///         same way — assets come home. No parameter exists that could
///         point either flow anywhere else; a rogue module calling the
///         Granary can only ever feed the vault it serves.
///
///         A sealed Dave farms through the Chambers like any act:
///         approve the Granary (a venue), declare the spend, sow. The
///         boundary measures the seed out and the shares in. The toll —
///         0.42% of assets sown, 69/31 — rides the entry, as it rides
///         every floor.
///
/// @dev    The Granary holds nothing at rest — pure pass-through, no
///         backing, no bond, no ragequit surface. Silo risk is timelock-
///         curated, not eliminated: bless conservatively. ERC-20 assets
///         only; shares must be a standard ERC-20.
contract Granary {
    uint16 public constant TOLL_BPS   = 42;
    uint16 public constant POOL_SHARE = 69;

    address public immutable hub;

    mapping(address => bool) public blessed;   // silo => vetted

    uint256 private _lock = 1;

    error NotTimelock(); error NotBlessed(); error Empty(); error Reentry();

    event Blessed(address indexed silo, bool ok);
    event Sown(uint256 indexed daveId, address indexed silo, uint256 assets, uint256 shares);
    event Reaped(uint256 indexed daveId, address indexed silo, uint256 shares, uint256 assets);

    constructor(address hub_) { hub = hub_; }

    modifier nonReentrant() { if (_lock != 1) revert Reentry(); _lock = 2; _; _lock = 1; }

    // ─── curation (the timelock) ─────────────────────────────────────
    function bless(address silo, bool ok) external {
        if (msg.sender != IHubY(hub).timelock()) revert NotTimelock();
        blessed[silo] = ok;
        emit Blessed(silo, ok);
    }

    // ─── sowing (anyone; the vault is the only beneficiary) ──────────
    /// @notice pull assets from the caller, toll them, deposit the rest
    ///         into a blessed silo — shares to THE VAULT, nowhere else.
    function sow(uint256 daveId, address silo, uint256 assets)
        external nonReentrant returns (uint256 shares)
    {
        if (!blessed[silo]) revert NotBlessed();
        if (assets == 0) revert Empty();
        address asset = ISilo(silo).asset();
        require(IERC20(asset).transferFrom(msg.sender, address(this), assets), "pull");

        uint256 toll = assets * TOLL_BPS / 10_000;
        _splitToll(asset, toll);
        uint256 seed = assets - toll;

        address vault = IHubY(hub).vaultOf(daveId);
        _approve(asset, silo, seed);
        shares = ISilo(silo).deposit(seed, vault);            // the pin
        _ack(vault, silo);                                    // shares token indexes as a bag
        emit Sown(daveId, silo, assets, shares);
    }

    /// @notice pull shares from the caller, redeem — assets to THE
    ///         VAULT, nowhere else.
    function reap(uint256 daveId, address silo, uint256 shares)
        external nonReentrant returns (uint256 assets)
    {
        if (!blessed[silo]) revert NotBlessed();
        if (shares == 0) revert Empty();
        require(IERC20(silo).transferFrom(msg.sender, address(this), shares), "pull");
        address vault = IHubY(hub).vaultOf(daveId);
        assets = ISilo(silo).redeem(shares, vault, address(this));   // the pin
        _ack(vault, ISilo(silo).asset());
        emit Reaped(daveId, silo, shares, assets);
    }

    // ─── views ────────────────────────────────────────────────────────
    function previewReap(address silo, uint256 shares) external view returns (uint256) {
        return ISilo(silo).convertToAssets(shares);
    }

    // ─── plumbing ─────────────────────────────────────────────────────
    function _splitToll(address token, uint256 toll) internal {
        if (toll == 0) return;
        uint256 toPool = toll * POOL_SHARE / 100;
        require(IERC20(token).transfer(IHubY(hub).pool(), toPool), "toll");
        require(IERC20(token).transfer(IHubY(hub).treasury(), toll - toPool), "toll");
    }
    function _approve(address token, address spender, uint256 amt) internal {
        (bool ok,) = token.call(abi.encodeWithSelector(0x095ea7b3, spender, amt));
        require(ok, "approve");
    }
    function _ack(address vault, address token) internal {
        try IVaultAckY(vault).acknowledge(token) {} catch {}
    }
}
