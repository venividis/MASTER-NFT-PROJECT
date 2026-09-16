// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*═══════════════════════════════════════════════════════════════════════════

  THE GRIP — the hand that only closes

  A second ERC-6551 account for every token, at a second salt. It receives
  and it does not spend. There is no `execute`, no `withdraw`, no sweep, no
  rescue, no owner override, and no admin. Read the ABI: there is no
  function on this contract that moves an asset out of it, for anybody,
  ever.

  ── why this rather than a better guard ──

  The other account in this collection — the Reach, IpseityAccount.sol —
  can be sealed for a time, and enforces that seal by measuring its own
  balances either side of every call. That works, and the suite proves it
  works, but look at what it cost: a manifest, a snapshot, a verification
  pass, an approval blocklist, a delegatecall ban, an ERC-1271 refusal, and
  a documented blind spot for assets nobody thought to list. Every one of
  those exists because the capability to spend exists and is being policed.

  This contract does not police the capability. It does not have it. The
  entire attack surface for "can the holder get the assets out" is a
  function that was never written. There is nothing to measure because
  there is nothing to measure against, no list to keep current, and no
  blind spot, because there is no sight line to be blind along.

  That asymmetry is the whole idea, and it is not mine: it is the Gate from
  the CONGREGATION meld design — *"Grip → Reach: never. No function
  exists. Not for the bearer, not for the mind, not for governance."*

  ── what it costs ──

  Permanence is not a feature that can be walked back. An asset sent here
  is here until the token that owns it stops existing, which in this
  collection is never — there is no burn. A mistaken transfer into a Grip
  is a permanent mistake, and the interface says so before it will build
  the calldata.

  This is the correct trade for the thing it is for: holdings a token
  carries as part of what it *is*, priced by every future buyer, provable
  without trusting a promise. It is the wrong trade for anything that has
  to stay liquid. Market inventory therefore lives in Pool.sol behind a
  time-boxed bond, and working capital lives in the Reach. Three places,
  three different promises, on purpose.

  ── what a buyer reads ──

  `holdings()` reports what this Grip contains right now. Because nothing
  can leave, that reading is not a snapshot that could be stale by the time
  a sale settles — it is a floor. That is the entire point: the number a
  buyer sees before they pay is a number the seller cannot move.

═══════════════════════════════════════════════════════════════════════════*/

interface IERC721Owner {
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IBalance {
    function balanceOf(address who) external view returns (uint256);
}

contract GripVault {
    /*──────────────── identity ────────────────*/

    /// @dev The registry appends salt, chainId, tokenContract and tokenId to
    ///      the proxy's runtime code. The proxy body is 45 bytes, so the
    ///      three values this needs begin at 0x4d.
    function token() public view returns (uint256 chainId, address tokenContract, uint256 tokenId) {
        bytes memory footer = new bytes(0x60);
        assembly {
            extcodecopy(address(), add(footer, 0x20), 0x4d, 0x60)
        }
        return abi.decode(footer, (uint256, address, uint256));
    }

    /// @notice Whoever holds the token holds this, and holding it is all
    ///         they can do with it.
    function owner() public view returns (address) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId != block.chainid) return address(0);
        return IERC721Owner(tokenContract).ownerOf(tokenId);
    }

    /*──────────────── receiving, and nothing else ────────────────*/

    receive() external payable {}

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external pure returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    /*──────────────── reading ────────────────*/

    /// @notice What this Grip holds, for a buyer pricing the token.
    /// @dev    A floor rather than a snapshot: nothing here can leave, so
    ///         this reading cannot be made stale by the seller between a
    ///         handshake and a settlement.
    function holdings(address[] calldata assets)
        external view returns (uint256 ether_, uint256[] memory balances)
    {
        ether_ = address(this).balance;
        balances = new uint256[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            (bool ok, bytes memory out) =
                assets[i].staticcall(abi.encodeWithSelector(IBalance.balanceOf.selector, address(this)));
            balances[i] = (ok && out.length >= 32) ? abi.decode(out, (uint256)) : 0;
        }
    }

    /// @notice Stated in the ABI as well as the prose, so a client can check
    ///         it rather than take this contract's word for it.
    function isOneWay() external pure returns (bool) {
        return true;
    }

    /*──────────────── ERC-6551 surface ────────────────*/

    /// @dev A constant. Nothing this account can do changes any state it
    ///      owns, so there is no state to count. Present because the
    ///      standard asks for it.
    function state() external pure returns (uint256) {
        return 0;
    }

    /// @notice Nobody is a valid signer. Not the holder, not an operator,
    ///         not the collection.
    /// @dev    ERC-6551 lets an account answer that no signer is valid, and
    ///         this one always does. An account that cannot act has no use
    ///         for the concept.
    function isValidSigner(address, bytes calldata) external pure returns (bytes4) {
        return bytes4(0);
    }

    /// @dev ERC-1271. Never valid, for the same reason: a signature is an
    ///      authority to act, and this account does not act.
    function isValidSignature(bytes32, bytes calldata) external pure returns (bytes4) {
        return bytes4(0);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7    // ERC-165
            || id == 0x6faff5f1    // IERC6551Account
            || id == 0x150b7a02    // ERC721Receiver
            || id == 0x4e2312e0;   // ERC1155Receiver
        // deliberately NOT 0x51945447 (IERC6551Executable): a client that
        // checks before calling execute() is told the truth up front
    }
}
