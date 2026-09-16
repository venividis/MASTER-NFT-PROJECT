// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  A minimal ERC-721, for the question the manifest never asked.

  `balanceOf` on an ERC-20 is an amount. `balanceOf` on an ERC-721 is a
  COUNT. A vault holding one valuable NFT and a vault holding one worthless
  one read identically to anything measuring balances.
───────────────────────────────────────────────────────────────────────────*/
contract MockERC721 {
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    function mint(address to, uint256 id) external {
        ownerOf[id] = to; balanceOf[to] += 1;
    }
    function approve(address to, uint256 id) external { getApproved[id] = to; }
    function setApprovalForAll(address op, bool ok) external { isApprovedForAll[msg.sender][op] = ok; }

    function transferFrom(address from, address to, uint256 id) public {
        require(ownerOf[id] == from, "owner");
        require(msg.sender == from || getApproved[id] == msg.sender
             || isApprovedForAll[from][msg.sender], "auth");
        ownerOf[id] = to; balanceOf[from] -= 1; balanceOf[to] += 1;
    }

    /// @dev One call, one swap: the caller gives up `give` and receives
    ///      `take`, and `to` collects the good one. The caller's COUNT never
    ///      moves — which is the whole point. `to` is explicit because the
    ///      caller here is the vault, and sending to msg.sender would be
    ///      sending it to itself.
    function trade(uint256 give, uint256 take, address to) external {
        require(ownerOf[give] == msg.sender, "not held");
        address other = ownerOf[take];
        require(other != address(0) && other != msg.sender, "no counterparty");
        ownerOf[give] = to;
        ownerOf[take] = msg.sender;
        balanceOf[other] -= 1;
        balanceOf[to] += 1;
        // msg.sender's count is unchanged: one out, one in
    }
    function supportsInterface(bytes4) external pure returns (bool) { return true; }
}
