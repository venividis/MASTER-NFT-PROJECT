// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TokenModuleRegistry} from "./TokenModuleRegistry.sol";
import {ModuleArchiveFactory} from "./ModuleArchiveFactory.sol";

interface IWorkbenchArchive {
    function contentSha256() external view returns (bytes32);
    function byteLength() external view returns (uint256);
    function chunkCount() external view returns (uint256);
    function readChunk(uint256 index) external view returns (bytes memory);
}

/// @notice Immutable entry point for recovering the complete module workbench.
/// @dev A reader needs this address and a chain RPC, not a project web server.
/// The document is browser code stored as data, not executed by the EVM.
contract ModuleWorkbench {
    uint256 public constant schemaVersion = 1;
    uint256 public constant MAX_DOCUMENT_BYTES = 1048576;

    TokenModuleRegistry public immutable modules;
    address public immutable archive;
    bytes32 public immutable archiveCodeHash;
    bytes32 public immutable contentSha256;
    uint256 public immutable byteLength;
    uint256 public immutable chunkCount;

    error InvalidArchive();
    error InvalidChunk();

    constructor(TokenModuleRegistry modules_, address archive_) {
        if (address(modules_).code.length == 0) revert InvalidArchive();
        ModuleArchiveFactory factory = modules_.releases().archiveFactory();
        uint8 kind = factory.archiveSchema(archive_);
        bytes32 codeHash = factory.archiveCodeHash(archive_);
        if ((kind != 1 && kind != 2) || codeHash == bytes32(0) || archive_.codehash != codeHash)
            revert InvalidArchive();
        IWorkbenchArchive document = IWorkbenchArchive(archive_);
        uint256 size = document.byteLength();
        uint256 chunks = document.chunkCount();
        bytes32 digest = document.contentSha256();
        if (size == 0 || size > MAX_DOCUMENT_BYTES || chunks == 0 || chunks > 64 || digest == bytes32(0))
            revert InvalidArchive();
        modules = modules_;
        archive = archive_;
        archiveCodeHash = codeHash;
        contentSha256 = digest;
        byteLength = size;
        chunkCount = chunks;
    }

    /// @notice Bounded recovery. The client must verify the complete SHA-256 before opening HTML.
    function readChunk(uint256 index) external view returns (bytes memory data) {
        if (archive.codehash != archiveCodeHash || index >= chunkCount) revert InvalidChunk();
        data = IWorkbenchArchive(archive).readChunk(index);
        if (data.length == 0 || data.length > 23000) revert InvalidChunk();
    }

    /// @notice Public, immutable discovery links. No private key or signing permission is needed.
    function services() external view returns (
        uint256 chainId, address collection, address installations, address releases,
        address stateStore, address document, bytes32 documentHash
    ) {
        return (
            block.chainid, address(modules.collection()), address(modules),
            address(modules.releases()), address(modules.stateStore()), archive, contentSha256
        );
    }
}
