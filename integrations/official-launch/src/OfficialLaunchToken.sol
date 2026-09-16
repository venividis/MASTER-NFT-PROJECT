// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {ERC20} from "@solady/tokens/ERC20.sol";
/// @notice Fixed-supply token for CCA. No owner, taxes, blacklist or future mint authority.
contract OfficialLaunchToken is ERC20 {
    string private n; string private s;
    constructor(string memory name_, string memory symbol_, uint256 supply, address recipient) {
        require(bytes(name_).length > 0 && bytes(symbol_).length > 0 && supply > 0 && recipient != address(0));
        n = name_; s = symbol_; _mint(recipient, supply);
    }
    function name() public view override returns (string memory) { return n; }
    function symbol() public view override returns (string memory) { return s; }
}
