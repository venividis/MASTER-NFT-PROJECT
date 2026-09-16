// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Shared, versioned ABI for immutable extension payloads and releases.
library ModuleTypes {
    struct Archive {
        address archive;
        uint8 schema;
        bytes32 storedHash;
        uint32 storedBytes;
        bytes32 expandedHash;
        uint32 expandedBytes;
        bytes32 codeHash;
    }

    struct ReleaseInput {
        bytes32 moduleId;
        uint64 version;
        Archive payload;
        bytes32 runtime;
        bytes32 hostAPI;
        bytes32 stateSchema;
        bytes32[] capabilities;
        bytes32[] dependencies;
    }

    struct Release {
        address publisher;
        bytes32 moduleKey;
        bytes32 manifestHash;
        uint64 publishedAt;
        ReleaseInput input;
    }
}
