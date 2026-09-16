// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IN721 {
    function ownerOf(uint256) external view returns (address);
    function transferFrom(address, address, uint256) external;
}

/*───────────────────────────────────────────────────────────────────────────
  A venue, which is not a token.

  The deny-by-default rule restricts what a sealed account may say to an
  asset ON ITS MANIFEST. A marketplace is not on the manifest — it is the
  counterparty, not the promise — so calls to it are unrestricted, exactly
  as they must be for a sealed account to be able to act at all.

  Which is the whole point of this mock: it swaps the vault's NFT for a
  worthless one without the vault ever calling the NFT contract. The count
  is unmoved, the manifest is unmoved, and only a check on IDENTITY sees it.
───────────────────────────────────────────────────────────────────────────*/
contract Broker {
    function swapPieces(address collection, uint256 give, uint256 take, address to) external {
        IN721(collection).transferFrom(msg.sender, to, give);
        IN721(collection).transferFrom(IN721(collection).ownerOf(take), msg.sender, take);
    }
}
