// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ModuleTypes} from "./ModuleTypes.sol";
import {ModuleArchiveFactory} from "./ModuleArchiveFactory.sol";

/// @notice Immutable publisher-namespaced releases, exact dependencies and host declarations.
/// @dev Publication is neither installation, compatibility certification nor spending authority.
/// The canonical manifest is opaque here. Hosts must validate its format and cross-check
/// every declared field against this ABI-bound record, then verify all payload hashes.
contract ExtensionReleaseRegistry {
    bytes32 public constant serviceType = keccak256("anima.extension-release-registry/1");
    bytes32 public constant RELEASE_DOMAIN = keccak256("anima.extension-release/1");
    uint256 public constant MAX_MANIFEST_BYTES = 16384;
    uint256 public constant MAX_DEPENDENCIES = 16;
    uint256 public constant MAX_CAPABILITIES = 16;
    uint256 public constant MAX_PAGE = 64;
    ModuleArchiveFactory public immutable archiveFactory;

    mapping(bytes32 => ModuleTypes.Release) private _releases;
    mapping(bytes32 => bytes) private _manifests;
    mapping(bytes32 => bytes32[]) private _moduleReleases;
    mapping(bytes32 => mapping(uint64 => bytes32)) public releaseAtVersion;
    bytes32[] private _catalog;

    error InvalidRelease();
    error UnknownRelease();
    error InvalidPage();
    event ReleasePublished(bytes32 indexed releaseId, bytes32 indexed moduleKey, address indexed publisher, uint64 version, bytes32 manifestHash);

    constructor(address factory) {
        if (factory.code.length == 0 || ModuleArchiveFactory(factory).serviceType() != keccak256("anima.module-archive-factory/1")) revert InvalidRelease();
        archiveFactory = ModuleArchiveFactory(factory);
    }

    function moduleKey(address publisher, bytes32 moduleId) public pure returns (bytes32) {
        return keccak256(abi.encode(publisher, moduleId));
    }

    function hashRelease(address publisher, ModuleTypes.ReleaseInput calldata input, bytes32 manifestHash) public pure returns (bytes32) {
        return keccak256(abi.encode(RELEASE_DOMAIN, publisher, input, manifestHash));
    }

    function publish(ModuleTypes.ReleaseInput calldata input, bytes calldata canonicalManifest) external returns (bytes32 releaseId) {
        if (input.moduleId == bytes32(0) || input.version == 0 || input.runtime == bytes32(0) || input.hostAPI == bytes32(0)
            || canonicalManifest.length == 0 || canonicalManifest.length > MAX_MANIFEST_BYTES
            || input.dependencies.length > MAX_DEPENDENCIES || input.capabilities.length > MAX_CAPABILITIES) revert InvalidRelease();
        bytes32 key = moduleKey(msg.sender, input.moduleId);
        if (releaseAtVersion[key][input.version] != bytes32(0)) revert InvalidRelease();
        archiveFactory.validateArchive(input.payload);
        // Dependencies must already exist, which also prevents publication-time cycles.
        for (uint256 i; i < input.dependencies.length; ++i) {
            bytes32 dependency = input.dependencies[i];
            if (_releases[dependency].publisher == address(0) || (i != 0 && input.dependencies[i - 1] >= dependency)) revert InvalidRelease();
        }
        for (uint256 i; i < input.capabilities.length; ++i) {
            if (input.capabilities[i] == bytes32(0) || (i != 0 && input.capabilities[i - 1] >= input.capabilities[i])) revert InvalidRelease();
        }
        bytes32 manifestHash = sha256(canonicalManifest);
        releaseId = hashRelease(msg.sender, input, manifestHash);
        if (_releases[releaseId].publisher != address(0)) revert InvalidRelease();
        ModuleTypes.Release storage entry = _releases[releaseId];
        entry.publisher = msg.sender;
        entry.moduleKey = key;
        entry.manifestHash = manifestHash;
        entry.publishedAt = uint64(block.timestamp);
        entry.input = input;
        _manifests[releaseId] = canonicalManifest;
        releaseAtVersion[key][input.version] = releaseId;
        _moduleReleases[key].push(releaseId);
        _catalog.push(releaseId);
        emit ReleasePublished(releaseId, key, msg.sender, input.version, manifestHash);
    }

    function exists(bytes32 id) external view returns (bool) { return _releases[id].publisher != address(0); }
    function release(bytes32 id) external view returns (ModuleTypes.Release memory) { _requireRelease(id); return _releases[id]; }
    function manifest(bytes32 id) external view returns (bytes memory) { _requireRelease(id); return _manifests[id]; }
    function releaseCount() external view returns (uint256) { return _catalog.length; }
    function moduleReleaseCount(bytes32 key) external view returns (uint256) { return _moduleReleases[key].length; }
    function releasesOf(bytes32 key, uint256 cursor, uint256 limit) external view returns (bytes32[] memory ids, uint256 next) { return _page(_moduleReleases[key], cursor, limit); }
    function catalog(uint256 cursor, uint256 limit) external view returns (bytes32[] memory ids, uint256 next) { return _page(_catalog, cursor, limit); }

    function _requireRelease(bytes32 id) private view { if (_releases[id].publisher == address(0)) revert UnknownRelease(); }
    function _page(bytes32[] storage source, uint256 cursor, uint256 limit) private view returns (bytes32[] memory ids, uint256 next) {
        if (limit == 0 || limit > MAX_PAGE || cursor > source.length) revert InvalidPage();
        uint256 length = source.length - cursor;
        if (length > limit) length = limit;
        ids = new bytes32[](length);
        for (uint256 i; i < length; ++i) ids[i] = source[cursor + i];
        next = cursor + length;
    }
}
