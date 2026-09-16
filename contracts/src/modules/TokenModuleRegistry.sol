// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ModuleTypes} from "./ModuleTypes.sol";
import {ExtensionReleaseRegistry} from "./ExtensionReleaseRegistry.sol";
import {ModuleStateStore} from "./ModuleStateStore.sol";

interface IModuleCollection {
    function accountOf(uint256 tokenId) external view returns (address);
    function artifactIdOfAccount(address account) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}
interface IModuleAccount {
    function currentOwner() external view returns (address);
    function sessionEpoch() external view returns (uint64);
}

/// @notice Same-NFT module choices with atomic release/state selection and stale-review protection.
/// @dev Only the canonical NFT account may mutate its catalog or state. The existing
/// account decides how that call is authorized. Publication, installation and state
/// writes create no spending grants. Disabling preserves history and selected state.
contract TokenModuleRegistry {
    bytes32 public constant serviceType = keccak256("anima.token-module-registry/1");
    bytes32 public constant ROOT_DOMAIN = keccak256("anima.token-modules/1");
    uint256 public constant MAX_PAGE = 64;
    IModuleCollection public immutable collection;
    ExtensionReleaseRegistry public immutable releases;
    ModuleStateStore public immutable stateStore;

    struct Installation { bytes32 releaseId; bytes32 stateHead; bool enabled; uint64 epoch; }
    struct History {
        bytes32 root;
        bytes32 previousRoot;
        bytes32 moduleKey;
        bytes32 releaseId;
        bytes32 stateHead;
        uint64 epoch;
        uint64 at;
        uint8 operation; // 1 activate, 2 disable, 3 active-state write
    }
    mapping(uint256 => bytes32) public rootOf;
    mapping(uint256 => mapping(bytes32 => Installation)) private _installations;
    mapping(uint256 => bytes32[]) private _modules;
    // Independent recovery index: staging may precede any activation and never changes rootOf.
    mapping(uint256 => bytes32[]) private _stateModules;
    mapping(uint256 => mapping(bytes32 => bool)) private _hasStateModule;
    mapping(uint256 => History[]) private _history;
    uint256 private _entered = 1;

    error Unauthorized();
    error StaleReview();
    error InvalidInstallation();
    error InvalidState();
    error InvalidPage();
    error Reentered();
    event ModuleChanged(uint256 indexed tokenId, bytes32 indexed moduleKey, bytes32 indexed releaseId, bytes32 stateHead, bool enabled, uint64 epoch, bytes32 previousRoot, bytes32 root, uint8 operation);

    constructor(address collection_, address releases_) {
        if (collection_.code.length == 0 || releases_.code.length == 0
            || ExtensionReleaseRegistry(releases_).serviceType() != keccak256("anima.extension-release-registry/1")) revert InvalidInstallation();
        collection = IModuleCollection(collection_);
        releases = ExtensionReleaseRegistry(releases_);
        stateStore = new ModuleStateStore(address(this), collection_, address(releases.archiveFactory()));
    }

    modifier nonReentrant() { if (_entered != 1) revert Reentered(); _entered = 2; _; _entered = 1; }

    /// @notice Prepare recoverable state without changing the active release or state head.
    /// A later activation must still match the current catalog root, parent and custody epoch.
    function stageState(uint256 tokenId, bytes32 moduleKey, bytes32 expectedRoot, uint64 expectedEpoch, bytes32 schema, bytes calldata data, ModuleTypes.Archive calldata archive) external nonReentrant returns (bytes32) {
        _authorize(tokenId, expectedRoot, expectedEpoch);
        if (moduleKey == bytes32(0)) revert InvalidInstallation();
        bytes32 stateId = stateStore.append(tokenId, moduleKey, schema, _installations[tokenId][moduleKey].stateHead, expectedEpoch, data, archive);
        _indexStateModule(tokenId, moduleKey);
        return stateId;
    }

    /// @notice Atomically choose code and compatible state. Clearing nonempty state or
    /// selecting a historical incompatible head requires an explicitly staged new branch.
    function activate(uint256 tokenId, bytes32 releaseId, bytes32 expectedRoot, uint64 expectedEpoch, bytes32 expectedStateHead, bytes32 nextStateHead) external nonReentrant {
        _authorize(tokenId, expectedRoot, expectedEpoch);
        ModuleTypes.Release memory release = releases.release(releaseId);
        Installation storage current = _installations[tokenId][release.moduleKey];
        if (current.stateHead != expectedStateHead) revert StaleReview();
        if (nextStateHead == bytes32(0)) {
            if (expectedStateHead != bytes32(0)) revert InvalidState();
        } else {
            ModuleStateStore.Record memory state = stateStore.record(nextStateHead);
            if (state.namespace != stateStore.namespaceOf(tokenId, release.moduleKey) || state.schema != release.input.stateSchema) revert InvalidState();
            if (nextStateHead != expectedStateHead && (state.parent != expectedStateHead || state.epoch != expectedEpoch)) revert InvalidState();
        }
        if (current.releaseId == bytes32(0)) _modules[tokenId].push(release.moduleKey);
        current.releaseId = releaseId; current.stateHead = nextStateHead; current.enabled = true; current.epoch = expectedEpoch;
        _commit(tokenId, release.moduleKey, current, 1);
    }

    function writeState(uint256 tokenId, bytes32 moduleKey, bytes32 expectedRoot, uint64 expectedEpoch, bytes calldata data, ModuleTypes.Archive calldata archive) external nonReentrant returns (bytes32 stateId) {
        _authorize(tokenId, expectedRoot, expectedEpoch);
        Installation storage current = _installations[tokenId][moduleKey];
        if (!current.enabled) revert InvalidInstallation();
        ModuleTypes.Release memory release = releases.release(current.releaseId);
        if (release.input.stateSchema == bytes32(0)) revert InvalidState();
        stateId = stateStore.append(tokenId, moduleKey, release.input.stateSchema, current.stateHead, expectedEpoch, data, archive);
        _indexStateModule(tokenId, moduleKey);
        current.stateHead = stateId; current.epoch = expectedEpoch;
        _commit(tokenId, moduleKey, current, 3);
    }

    function disable(uint256 tokenId, bytes32 moduleKey, bytes32 expectedRoot, uint64 expectedEpoch) external nonReentrant {
        _authorize(tokenId, expectedRoot, expectedEpoch);
        Installation storage current = _installations[tokenId][moduleKey];
        if (!current.enabled) revert InvalidInstallation();
        current.enabled = false; current.epoch = expectedEpoch;
        _commit(tokenId, moduleKey, current, 2);
    }

    function installation(uint256 tokenId, bytes32 moduleKey) external view returns (Installation memory) { return _installations[tokenId][moduleKey]; }
    function moduleCount(uint256 tokenId) external view returns (uint256) { return _modules[tokenId].length; }
    function stateModuleCount(uint256 tokenId) external view returns (uint256) { return _stateModules[tokenId].length; }
    function historyCount(uint256 tokenId) external view returns (uint256) { return _history[tokenId].length; }
    function modulesOf(uint256 tokenId, uint256 cursor, uint256 limit) external view returns (bytes32[] memory keys, uint256 next) {
        uint256 length = _pageLength(_modules[tokenId].length, cursor, limit); keys = new bytes32[](length);
        for (uint256 i; i < length; ++i) keys[i] = _modules[tokenId][cursor + i];
        next = cursor + length;
    }
    /// @notice Discover every state namespace, including staged and never-activated modules.
    function stateModulesOf(uint256 tokenId, uint256 cursor, uint256 limit) external view returns (bytes32[] memory keys, uint256 next) {
        uint256 length = _pageLength(_stateModules[tokenId].length, cursor, limit); keys = new bytes32[](length);
        for (uint256 i; i < length; ++i) keys[i] = _stateModules[tokenId][cursor + i];
        next = cursor + length;
    }
    function historyOf(uint256 tokenId, uint256 cursor, uint256 limit) external view returns (History[] memory entries, uint256 next) {
        uint256 length = _pageLength(_history[tokenId].length, cursor, limit); entries = new History[](length);
        for (uint256 i; i < length; ++i) entries[i] = _history[tokenId][cursor + i];
        next = cursor + length;
    }

    function _indexStateModule(uint256 tokenId, bytes32 moduleKey) private {
        if (!_hasStateModule[tokenId][moduleKey]) {
            _hasStateModule[tokenId][moduleKey] = true;
            _stateModules[tokenId].push(moduleKey);
        }
    }
    function _authorize(uint256 tokenId, bytes32 expectedRoot, uint64 expectedEpoch) private view {
        if (tokenId == 0 || collection.accountOf(tokenId) != msg.sender || collection.artifactIdOfAccount(msg.sender) != tokenId
            || IModuleAccount(msg.sender).currentOwner() != collection.ownerOf(tokenId)) revert Unauthorized();
        if (rootOf[tokenId] != expectedRoot || IModuleAccount(msg.sender).sessionEpoch() != expectedEpoch) revert StaleReview();
    }
    function _commit(uint256 tokenId, bytes32 key, Installation storage current, uint8 operation) private {
        bytes32 previous = rootOf[tokenId];
        bytes32 next = keccak256(abi.encode(ROOT_DOMAIN, block.chainid, address(this), tokenId, previous, key, current.releaseId, current.stateHead, current.enabled, current.epoch, _history[tokenId].length, operation));
        rootOf[tokenId] = next;
        _history[tokenId].push(History(next, previous, key, current.releaseId, current.stateHead, current.epoch, uint64(block.timestamp), operation));
        emit ModuleChanged(tokenId, key, current.releaseId, current.stateHead, current.enabled, current.epoch, previous, next, operation);
    }
    function _pageLength(uint256 total, uint256 cursor, uint256 limit) private pure returns (uint256 length) {
        if (limit == 0 || limit > MAX_PAGE || cursor > total) revert InvalidPage();
        length = total - cursor; if (length > limit) length = limit;
    }
}
