// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ModuleTypes} from "./ModuleTypes.sol";
import {ModuleArchiveFactory} from "./ModuleArchiveFactory.sol";
import {AppChunk} from "../protocol/OnchainApp.sol";

/// @notice Append-only snapshots; only the bound installation registry can append.
/// @dev No publisher, program or external caller can mutate state here. Selection lives
/// in TokenModuleRegistry so release/state activation is atomic. Public chain bytes
/// are public; encryption and recoverable keys are the client's responsibility.
contract ModuleStateStore {
    bytes32 public constant serviceType = keccak256("anima.module-state-store/1");
    bytes32 public constant STATE_DOMAIN = keccak256("anima.module-state/1");
    uint256 public constant MAX_DIRECT_BYTES = 32768;
    uint256 private constant DIRECT_CHUNK_BYTES = 23000;
    uint256 public constant MAX_PAGE = 64;
    address public immutable registry;
    address public immutable collection;
    ModuleArchiveFactory public immutable archiveFactory;

    struct Record {
        bytes32 namespace;
        bytes32 schema;
        bytes32 parent;
        bytes32 dataHash;
        ModuleTypes.Archive archive;
        uint64 epoch;
        uint64 createdAt;
        uint256 index;
    }
    mapping(bytes32 => Record) private _records;
    // A full 32 KiB SSTORE snapshot exceeds the EIP-7825 transaction gas cap.
    // Canonical STOP-prefixed data contracts retain the same bytes in one call
    // while keeping each runtime below EIP-170 and avoiding per-word SSTORE.
    struct DirectData {
        address first;
        address second;
        uint32 length;
    }
    mapping(bytes32 => DirectData) private _data;
    mapping(bytes32 => bytes32[]) private _history;

    error Unauthorized();
    error InvalidState();
    error InvalidPage();
    event StateStaged(bytes32 indexed stateId, bytes32 indexed namespace, bytes32 indexed parent, bytes32 schema, uint64 epoch, bytes32 dataHash);

    constructor(address registry_, address collection_, address factory_) {
        if (registry_ == address(0) || collection_.code.length == 0 || factory_.code.length == 0) revert InvalidState();
        registry = registry_; collection = collection_; archiveFactory = ModuleArchiveFactory(factory_);
    }

    function namespaceOf(uint256 tokenId, bytes32 moduleKey) public view returns (bytes32) {
        return keccak256(abi.encode(collection, tokenId, moduleKey));
    }

    function append(uint256 tokenId, bytes32 moduleKey, bytes32 schema, bytes32 parent, uint64 epoch, bytes calldata data, ModuleTypes.Archive calldata archive) external returns (bytes32 id) {
        if (msg.sender != registry) revert Unauthorized();
        if (schema == bytes32(0) || moduleKey == bytes32(0) || epoch == 0) revert InvalidState();
        bytes32 namespace = namespaceOf(tokenId, moduleKey);
        if (parent != bytes32(0) && _records[parent].namespace != namespace) revert InvalidState();
        bytes32 dataHash;
        if (archive.archive == address(0)) {
            ModuleTypes.Archive memory empty;
            if (data.length > MAX_DIRECT_BYTES || keccak256(abi.encode(archive)) != keccak256(abi.encode(empty))) revert InvalidState();
            dataHash = sha256(data);
        } else {
            if (data.length != 0) revert InvalidState();
            archiveFactory.validateArchive(archive);
            dataHash = archive.expandedHash;
        }
        uint256 index = _history[namespace].length;
        id = keccak256(abi.encode(STATE_DOMAIN, block.chainid, address(this), namespace, index, schema, parent, epoch, dataHash, archive));
        _records[id] = Record(namespace, schema, parent, dataHash, archive, epoch, uint64(block.timestamp), index);
        if (archive.archive == address(0) && data.length != 0) {
            uint256 firstLength = data.length > DIRECT_CHUNK_BYTES ? DIRECT_CHUNK_BYTES : data.length;
            address first = address(new AppChunk(data[:firstLength]));
            address second;
            if (data.length > firstLength) second = address(new AppChunk(data[firstLength:]));
            _data[id] = DirectData(first, second, uint32(data.length));
        }
        _history[namespace].push(id);
        emit StateStaged(id, namespace, parent, schema, epoch, dataHash);
    }

    function record(bytes32 id) external view returns (Record memory) { _requireRecord(id); return _records[id]; }
    function dataOf(bytes32 id) external view returns (bytes memory) {
        _requireRecord(id);
        DirectData memory stored = _data[id];
        uint256 length = stored.length;
        bytes memory data = new bytes(length);
        if (length != 0) {
            uint256 firstLength = length > DIRECT_CHUNK_BYTES ? DIRECT_CHUNK_BYTES : length;
            address first = stored.first;
            assembly ("memory-safe") { extcodecopy(first, add(data, 32), 1, firstLength) }
            if (length > firstLength) {
                address second = stored.second;
                uint256 remaining = length - firstLength;
                assembly ("memory-safe") { extcodecopy(second, add(add(data, 32), firstLength), 1, remaining) }
            }
        }
        return data;
    }
    function countOf(uint256 tokenId, bytes32 moduleKey) external view returns (uint256) { return _history[namespaceOf(tokenId, moduleKey)].length; }
    function historyOf(uint256 tokenId, bytes32 moduleKey, uint256 cursor, uint256 limit) external view returns (bytes32[] memory ids, uint256 next) {
        bytes32[] storage history = _history[namespaceOf(tokenId, moduleKey)];
        if (limit == 0 || limit > MAX_PAGE || cursor > history.length) revert InvalidPage();
        uint256 length = history.length - cursor;
        if (length > limit) length = limit;
        ids = new bytes32[](length);
        for (uint256 i; i < length; ++i) ids[i] = history[cursor + i];
        next = cursor + length;
    }
    function _requireRecord(bytes32 id) private view { if (_records[id].schema == bytes32(0)) revert InvalidState(); }
}
