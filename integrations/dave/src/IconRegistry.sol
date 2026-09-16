// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IconRegistry — every ERC-20 gets a face; official ones pay.
contract IconRegistry {
    struct Icon { string glyph; uint16 hue; }
    mapping(address => Icon) public iconOf;
    address public immutable timelock;
    address public immutable treasury;
    uint256 public constant LIST_PRICE = 0.25 ether;

    error NotTimelock(); error BadPrice(); error BadGlyph();
    event Listed(address indexed token, string glyph, uint16 hue);

    constructor(address timelock_, address treasury_) { timelock = timelock_; treasury = treasury_; }

    function list(address token_, string calldata glyph, uint16 hue) external payable {
        if (msg.value != LIST_PRICE) revert BadPrice();
        if (bytes(glyph).length == 0 || bytes(glyph).length > 8) revert BadGlyph();
        iconOf[token_] = Icon(glyph, hue % 360);
        (bool ok,) = treasury.call{value: msg.value}(""); require(ok, "tre");
        emit Listed(token_, glyph, hue % 360);
    }

    function seed(address[] calldata tokens, string[] calldata glyphs, uint16[] calldata hues) external {
        if (msg.sender != timelock) revert NotTimelock();
        for (uint256 i; i < tokens.length; ++i) {
            iconOf[tokens[i]] = Icon(glyphs[i], hues[i] % 360);
            emit Listed(tokens[i], glyphs[i], hues[i] % 360);
        }
    }
}
