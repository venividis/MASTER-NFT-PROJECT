// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OnchainApp} from "../protocol/OnchainApp.sol";
import {OnchainAppDirectory} from "../protocol/OnchainAppDirectory.sol";
import {ModuleTypes} from "./ModuleTypes.sol";

interface IModuleStoredArchive {
    function contentSha256() external view returns (bytes32);
    function byteLength() external view returns (uint256);
    function chunkCount() external view returns (uint256);
}

/// @notice Creates canonical immutable readers while reusing existing AppChunk bytes.
/// @dev Merely pinning a proxy's runtime hash does not make its storage immutable.
/// Only readers constructed here are accepted. V2 concatenated and expanded hashes
/// remain commitments: clients MUST verify recovered bytes before executing them.
contract ModuleArchiveFactory {
    bytes32 public constant serviceType = keccak256("anima.module-archive-factory/1");
    uint32 public constant MAX_EXPANDED_BYTES = 64 * 1024 * 1024;
    mapping(address => uint8) public archiveSchema;
    mapping(address => bytes32) public archiveCodeHash;

    error InvalidArchive();
    event ArchiveCreated(address indexed archive, uint8 schema, bytes32 indexed digest, uint256 byteLength, bytes32 codeHash);

    function createArchive(address[] calldata chunks, bytes32 expectedSha) external returns (address archive) {
        if (expectedSha == bytes32(0)) revert InvalidArchive();
        archive = address(new OnchainApp(chunks, expectedSha));
        _record(archive, 1);
    }

    function createDirectory(address[] calldata leaves, bytes32 expectedSha) external returns (address archive) {
        if (leaves.length == 0 || leaves.length > 16 || expectedSha == bytes32(0)) revert InvalidArchive();
        for (uint256 i; i < leaves.length; ++i) {
            _known(leaves[i], 1);
            if (IModuleStoredArchive(leaves[i]).chunkCount() > 32) revert InvalidArchive();
        }
        archive = address(new OnchainAppDirectory(leaves, expectedSha));
        _record(archive, 2);
    }

    function validateArchive(ModuleTypes.Archive calldata descriptor) external view {
        _known(descriptor.archive, descriptor.schema);
        IModuleStoredArchive archive = IModuleStoredArchive(descriptor.archive);
        if (descriptor.codeHash != archiveCodeHash[descriptor.archive]
            || descriptor.storedHash == bytes32(0) || descriptor.expandedHash == bytes32(0)
            || descriptor.storedBytes == 0 || descriptor.expandedBytes == 0
            || descriptor.expandedBytes > MAX_EXPANDED_BYTES
            || archive.contentSha256() != descriptor.storedHash
            || archive.byteLength() != descriptor.storedBytes) revert InvalidArchive();
    }

    function _known(address archive, uint8 schema) private view {
        if ((schema != 1 && schema != 2) || archiveSchema[archive] != schema
            || archive.codehash != archiveCodeHash[archive]) revert InvalidArchive();
    }

    function _record(address archive, uint8 schema) private {
        archiveSchema[archive] = schema;
        bytes32 codeHash = archive.codehash;
        archiveCodeHash[archive] = codeHash;
        emit ArchiveCreated(archive, schema, IModuleStoredArchive(archive).contentSha256(), IModuleStoredArchive(archive).byteLength(), codeHash);
    }
}
