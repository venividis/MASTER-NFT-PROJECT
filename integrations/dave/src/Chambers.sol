// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./lib/Interfaces.sol";

interface IHubX {
    function ownerOf(uint256 id) external view returns (address);
    function vaultOf(uint256 id) external view returns (address);
    function approvedTarget(address t) external view returns (bool);
}
interface IVaultX {
    function chamberCall(address target, uint256 value, bytes calldata data) external returns (bytes memory);
    function unlockAt() external view returns (uint64);
    function bagsLength() external view returns (uint256);
    function bagAt(uint256 i) external view returns (address);
    function MAX_BAGS() external view returns (uint256);
}

/// @title Chambers — Codicil XII. The sovereign lane. Add your own organs.
///
/// @notice Everything before this codicil extended ALL Daves at once,
///         through the covenant's timelock. The Chambers extends ONE Dave
///         at a time, through its bearer alone: dock any contract on the
///         chain as a MODULE of your own token — an agent, a strategy, a
///         broker, code that will not exist for years. No global admin in
///         the loop, no permission to ask. The Dave becomes
///         owner-programmable, for life.
///
///         Sovereignty is disciplined by two covenant conditions:
///
///         THE CURE. A bearer's docking proposal cures for 7 days —
///         queued on-chain, visible, cancelable — before it can act. A
///         stolen key cannot flash-dock a drain; a coerced bearer has a
///         week of daylight; a buyer reads the chamber roster like the
///         bond ledger. Undocking is instant: removing power never waits.
///
///         THE SEALED BOUNDARY. While the vault is sealed, chamber acts
///         run behind the covenant wall, MEASURED, not trusted:
///           - the tracked estate (ETH + every bag) may only grow, except
///             ONE declared spend asset per act, capped by a declared
///             maximum — checked against live balances after the call;
///           - spends and value may only flow into covenant venues (the
///             hub's approved targets — Bourse, Charter, House, Registry,
///             Patronage...): THE SEALED MAY ONLY TRADE WHERE THE TOLL
///             LIVES. Sealed capital churns inside the covenant economy,
///             captive orderflow for every other sealed Dave;
///           - the SELECTOR FIREWALL: while sealed, transfer-family
///             words (transfer, transferFrom, both 721 safeTransferFroms,
///             1155 single and batch) are refused OUTRIGHT, on any
///             target — the boundary cannot measure every asset a vault
///             may hold (unacknowledged tokens, NFTs the floors swallow
///             in), so the words that move assets are simply not in the
///             sealed vocabulary. Approval-family words (approve,
///             increaseAllowance, setApprovalForAll) are permitted only
///             toward hub-approved venues — every venue pulls from
///             msg.sender alone, so a venue allowance is spendable only
///             inside a vault-initiated, measured act. Allowance is an
///             exit and is guarded like one.
///         Unsealed, the boundary lifts entirely: modules act with the
///         vault's full arm (that is what unsealed means), still behind
///         the 7-day cure.
///
///         Modules are organs: they persist through transfer with the
///         body. A new bearer inherits the roster and may purge() it in
///         one stroke — inspect before you buy, as with any covenant.
///
/// @dev    Threat model, stated plainly: a bearer's module is the
///         bearer's sovereign choice — the cure defends against stolen
///         keys and duress, not against the bearer's own judgment. The
///         sealed boundary defends the SEAL'S third-party promise (bags
///         do not leave, ragequit cannot be laundered around): exits are
///         blocked by measurement, spends are confined to venues whose
///         settlement is vault-ward by construction. Balance measurement
///         assumes honest-balanceOf tokens; exotic tokens are the
///         bearer's own risk, as everywhere in the covenant.
contract Chambers {
    // ─── constants ────────────────────────────────────────────────────
    uint64  public constant CURE   = 7 days;
    uint256 public constant MAX_MODULES = 16;


    address public immutable hub;

    // ─── the roster ───────────────────────────────────────────────────
    mapping(uint256 => mapping(address => uint64)) public proposedAt;  // daveId => module => t
    mapping(uint256 => mapping(address => bool))   public docked;
    mapping(uint256 => address[]) private _modulesOf;
    mapping(uint256 => mapping(address => uint256)) private _mIdx;     // idx+1

    uint256 private _lock = 1;

    // ─── errors / events ─────────────────────────────────────────────
    error NotBearer(); error NotDocked(); error NotProposed(); error StillCuring();
    error AlreadyDocked(); error TooManyModules(); error ZeroModule();
    error NotVenue(); error BadApprove(); error BoundaryBreached(); error Reentry();
    error ExitWord(); error BagOverflow();

    event Proposed(uint256 indexed daveId, address indexed module, uint64 readyAt);
    event Canceled(uint256 indexed daveId, address indexed module);
    event DockedIn(uint256 indexed daveId, address indexed module);
    event Undocked(uint256 indexed daveId, address indexed module);
    event Purged(uint256 indexed daveId, uint256 n);
    event Acted(uint256 indexed daveId, address indexed module, address target, uint256 value, bool sealedBoundary);

    constructor(address hub_) { hub = hub_; }

    modifier nonReentrant() { if (_lock != 1) revert Reentry(); _lock = 2; _; _lock = 1; }
    modifier onlyBearer(uint256 daveId) {
        if (msg.sender != IHubX(hub).ownerOf(daveId)) revert NotBearer();
        _;
    }

    // ─── docking (the bearer, cured) ─────────────────────────────────
    function propose(uint256 daveId, address module) external onlyBearer(daveId) {
        if (module == address(0)) revert ZeroModule();
        if (docked[daveId][module]) revert AlreadyDocked();
        proposedAt[daveId][module] = uint64(block.timestamp);
        emit Proposed(daveId, module, uint64(block.timestamp) + CURE);
    }

    function cancel(uint256 daveId, address module) external onlyBearer(daveId) {
        if (proposedAt[daveId][module] == 0) revert NotProposed();
        proposedAt[daveId][module] = 0;
        emit Canceled(daveId, module);
    }

    function dock(uint256 daveId, address module) external onlyBearer(daveId) {
        uint64 t = proposedAt[daveId][module];
        if (t == 0) revert NotProposed();
        if (uint64(block.timestamp) < t + CURE) revert StillCuring();
        if (docked[daveId][module]) revert AlreadyDocked();
        if (_modulesOf[daveId].length >= MAX_MODULES) revert TooManyModules();
        proposedAt[daveId][module] = 0;
        docked[daveId][module] = true;
        _modulesOf[daveId].push(module);
        _mIdx[daveId][module] = _modulesOf[daveId].length;
        emit DockedIn(daveId, module);
    }

    /// @notice instant — removing power never waits.
    function undock(uint256 daveId, address module) external onlyBearer(daveId) {
        if (!docked[daveId][module]) revert NotDocked();
        _remove(daveId, module);
        emit Undocked(daveId, module);
    }

    /// @notice one stroke for a fresh bearer: clear the inherited roster.
    function purge(uint256 daveId) external onlyBearer(daveId) {
        address[] storage ms = _modulesOf[daveId];
        uint256 n = ms.length;
        for (uint256 i = n; i > 0; --i) _remove(daveId, ms[i - 1]);
        emit Purged(daveId, n);
    }

    // ─── acting (the docked module) ──────────────────────────────────
    /// @notice a docked module acts with the vault's arm. Unsealed: the
    ///         full arm. Sealed: behind the boundary — declare at most
    ///         one spend (token, max), everything else must not shrink,
    ///         spends and value only into covenant venues.
    /// @param  spendToken address(0) = ETH; the ONE asset allowed to fall.
    function act(
        uint256 daveId, address target, uint256 value,
        bytes calldata data, address spendToken, uint256 maxSpend
    ) external nonReentrant returns (bytes memory out) {
        if (!docked[daveId][msg.sender]) revert NotDocked();
        address vault = IHubX(hub).vaultOf(daveId);
        bool sealedNow = IVaultX(vault).unlockAt() > uint64(block.timestamp);

        if (!sealedNow) {
            out = IVaultX(vault).chamberCall(target, value, data);
            emit Acted(daveId, msg.sender, target, value, false);
            return out;
        }

        // ── the sealed boundary ──
        (address[] memory bags, uint256[] memory pre, uint256 preEth) = _snapshot(vault);
        _firewall(target, value, data, maxSpend);

        out = IVaultX(vault).chamberCall(target, value, data);

        for (uint256 i; i < bags.length; ++i) {
            uint256 post = IERC20(bags[i]).balanceOf(vault);
            uint256 slack = bags[i] == spendToken ? maxSpend : 0;
            if (post + slack < pre[i]) revert BoundaryBreached();
        }
        uint256 ethSlack = spendToken == address(0) ? maxSpend : 0;
        if (vault.balance + ethSlack < preEth) revert BoundaryBreached();

        emit Acted(daveId, msg.sender, target, value, true);
    }

    // ─── views ────────────────────────────────────────────────────────
    function modulesOf(uint256 daveId) external view returns (address[] memory) {
        return _modulesOf[daveId];
    }
    function readyAt(uint256 daveId, address module) external view returns (uint64) {
        uint64 t = proposedAt[daveId][module];
        return t == 0 ? 0 : t + CURE;
    }

    // ─── plumbing ─────────────────────────────────────────────────────
    function _snapshot(address vault)
        internal view
        returns (address[] memory bags, uint256[] memory pre, uint256 preEth)
    {
        uint256 n = IVaultX(vault).bagsLength();
        // the measured set must never be a strict subset of the real
        // bag set — a skipped bag is an unmeasured exit. The vault caps
        // bags at MAX_BAGS; if that ever exceeds what we can read, refuse.
        if (n > IVaultX(vault).MAX_BAGS()) revert BagOverflow();
        bags = new address[](n);
        pre = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            address b = IVaultX(vault).bagAt(i);
            bags[i] = b;
            pre[i] = IERC20(b).balanceOf(vault);
        }
        preEth = vault.balance;
    }

    /// @dev the sealed vocabulary. Transfer-family words are not in it,
    ///      on ANY target: what cannot be enumerated cannot be measured,
    ///      so the words that move assets are refused by shape.
    ///      Approval-family words speak only toward covenant venues.
    ///      Spending value or declaring spend needs a venue target.
    function _firewall(address target, uint256 value, bytes calldata data, uint256 maxSpend) internal view {
        if (data.length >= 4) {
            bytes4 sel = bytes4(data[0:4]);
            if (
                sel == 0xa9059cbb ||   // transfer(address,uint256)
                sel == 0x23b872dd ||   // transferFrom(address,address,uint256)
                sel == 0x42842e0e ||   // safeTransferFrom(address,address,uint256)
                sel == 0xb88d4fde ||   // safeTransferFrom(address,address,uint256,bytes)
                sel == 0xf242432a ||   // 1155 safeTransferFrom
                sel == 0x2eb2c2d6     // 1155 safeBatchTransferFrom
            ) revert ExitWord();
            if (sel == 0x095ea7b3 || sel == 0x39509351) {          // approve / increaseAllowance
                if (data.length < 68) revert BadApprove();         // 4 + 32 + 32
                (address spender,) = abi.decode(data[4:], (address, uint256));
                if (!IHubX(hub).approvedTarget(spender)) revert BadApprove();
            } else if (sel == 0xa22cb465) {                        // setApprovalForAll
                if (data.length < 68) revert BadApprove();
                (address operator, bool ok) = abi.decode(data[4:], (address, bool));
                if (ok && !IHubX(hub).approvedTarget(operator)) revert BadApprove();
            }
        }
        if ((value > 0 || maxSpend > 0) && !IHubX(hub).approvedTarget(target)) revert NotVenue();
    }

    function _remove(uint256 daveId, address module) internal {
        docked[daveId][module] = false;
        uint256 ix = _mIdx[daveId][module];
        address[] storage ms = _modulesOf[daveId];
        address last = ms[ms.length - 1];
        ms[ix - 1] = last;
        _mIdx[daveId][last] = ix;
        ms.pop();
        delete _mIdx[daveId][module];
    }
}
