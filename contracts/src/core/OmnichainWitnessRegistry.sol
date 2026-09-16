// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Administrated} from "../lib/Administrated.sol";

/// @notice Minimal transport-neutral registry of finalized remote state commitments.
/// @dev LayerZero, Hyperlane, IBC adapters, light clients, or custom proof bridges can be authorized per domain.
contract OmnichainWitnessRegistry is Administrated {
    struct Witness {
        uint64 nonce;
        uint64 observedAt;
        bytes32 stateRoot;
        bytes32 messageId;
        address adapter;
    }

    mapping(uint32 => address) public adapterForDomain;
    mapping(bytes32 => mapping(uint32 => Witness)) private _witnesses;
    bool public frozen;

    event AdapterSet(uint32 indexed remoteDomain, address indexed adapter);
    event RegistryFrozen();
    event WitnessAccepted(
        bytes32 indexed identity,
        uint32 indexed remoteDomain,
        uint64 indexed nonce,
        bytes32 stateRoot,
        bytes32 messageId,
        address adapter
    );

    error RegistryIsFrozen();
    error InvalidAdapter();
    error UnauthorizedAdapter();
    error NonMonotonicNonce();
    error InvalidWitness();

    constructor(address admin) Administrated(admin) {}

    function setAdapter(uint32 remoteDomain, address adapter) external onlyOwner {
        if (frozen) revert RegistryIsFrozen();
        if (remoteDomain == 0 || adapter == address(0)) revert InvalidAdapter();
        adapterForDomain[remoteDomain] = adapter;
        emit AdapterSet(remoteDomain, adapter);
    }

    function freeze() external onlyOwner {
        if (frozen) revert RegistryIsFrozen();
        frozen = true;
        emit RegistryFrozen();
    }

    function submitWitness(
        bytes32 identity,
        uint32 remoteDomain,
        uint64 nonce,
        bytes32 stateRoot,
        bytes32 messageId
    ) external {
        if (msg.sender != adapterForDomain[remoteDomain]) revert UnauthorizedAdapter();
        if (identity == bytes32(0) || stateRoot == bytes32(0) || messageId == bytes32(0)) {
            revert InvalidWitness();
        }
        Witness storage current = _witnesses[identity][remoteDomain];
        if (nonce <= current.nonce) revert NonMonotonicNonce();
        current.nonce = nonce;
        current.observedAt = uint64(block.timestamp);
        current.stateRoot = stateRoot;
        current.messageId = messageId;
        current.adapter = msg.sender;
        emit WitnessAccepted(identity, remoteDomain, nonce, stateRoot, messageId, msg.sender);
    }

    function witnessOf(bytes32 identity, uint32 remoteDomain) external view returns (Witness memory) {
        return _witnesses[identity][remoteDomain];
    }

    function witnessDigest(bytes32 identity, uint32 remoteDomain) external view returns (bytes32) {
        Witness memory w = _witnesses[identity][remoteDomain];
        return keccak256(
            abi.encode(
                "IDONTFUCKINGBELIEVEIT_REMOTE_WITNESS_V1",
                block.chainid,
                address(this),
                identity,
                remoteDomain,
                w.nonce,
                w.stateRoot,
                w.messageId,
                w.adapter
            )
        );
    }
}
