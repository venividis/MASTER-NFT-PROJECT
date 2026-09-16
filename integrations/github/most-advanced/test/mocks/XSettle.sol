// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IERC721Min { function transferFrom(address f, address t, uint256 id) external;
                       function ownerOf(uint256 id) external view returns (address); }

/*  The smallest honest cross-chain sale, split across the two sides, so
    the destination gas limit that sets the LayerZero executor fee is a
    measurement rather than a guess.

    HOME sits on the seller's chain and holds the asset. AWAY sits on the
    buyer's chain and holds the money. Neither has an owner, a pause or an
    upgrade. Every number in the report comes from running these.        */
contract HomeEscrow {
    struct Lot { address seller; address collection; uint256 tokenId; uint96 price; uint64 deadline; }
    mapping(bytes32 => Lot) public lot;
    mapping(bytes32 => bool) public done;          // replay guard, per order
    mapping(address => uint256) public owed;
    address public immutable ENDPOINT;
    error NotEndpoint(); error NoLot(); error Replayed(); error Expired(); error TooSoon();

    constructor(address ep) { ENDPOINT = ep; }

    function list(bytes32 id, address collection, uint256 tokenId, uint96 price, uint64 deadline) external {
        lot[id] = Lot(msg.sender, collection, tokenId, price, deadline);
        IERC721Min(collection).transferFrom(msg.sender, address(this), tokenId);
    }

    /// @dev the destination half of a settle. This is what the executor runs.
    function settle(bytes32 id, address buyer, uint256 paid) external {
        if (msg.sender != ENDPOINT) revert NotEndpoint();
        Lot memory L = lot[id];
        if (L.seller == address(0)) revert NoLot();
        if (done[id]) revert Replayed();
        if (block.timestamp > L.deadline) revert Expired();
        done[id] = true;
        delete lot[id];
        owed[L.seller] += paid;
        IERC721Min(L.collection).transferFrom(address(this), buyer, L.tokenId);
    }

    /// @dev the seller's way out when no message ever lands. Permissionless
    ///      after the deadline, so a stuck relayer cannot hold the asset.
    function reclaim(bytes32 id) external {
        Lot memory L = lot[id];
        if (L.seller == address(0)) revert NoLot();
        if (block.timestamp <= L.deadline) revert TooSoon();
        delete lot[id];
        IERC721Min(L.collection).transferFrom(address(this), L.seller, L.tokenId);
    }
}

contract AwayEscrow {
    struct Bid { address buyer; uint96 paid; uint64 deadline; bool settled; }
    mapping(bytes32 => Bid) public bid;
    error NoBid(); error TooSoon(); error Already();
    function commit(bytes32 id, uint64 deadline) external payable {
        if (bid[id].buyer != address(0)) revert Already();
        bid[id] = Bid(msg.sender, uint96(msg.value), deadline, false);
    }
    function refund(bytes32 id) external {
        Bid memory b = bid[id];
        if (b.buyer == address(0)) revert NoBid();
        if (block.timestamp <= b.deadline) revert TooSoon();
        delete bid[id];
        (bool ok,) = b.buyer.call{value: b.paid}("");
        require(ok);
    }
}
