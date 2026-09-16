// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev The .eth registrar's clock. `nameExpires` is keyed by the LABEL's
///      hash — keccak("ipseity4d") — not the namehash of the full name,
///      which is a different 32 bytes that returns zero and reads exactly
///      like a name nobody has registered.
contract MockRegistrar {
    mapping(uint256 => uint256) public nameExpires;
    uint256 public GRACE_PERIOD = 90 days;

    function setExpiry(uint256 labelhash, uint256 at) external { nameExpires[labelhash] = at; }
    function setGrace(uint256 g) external { GRACE_PERIOD = g; }
}

/// @dev A registrar that answers nothing, for the branch where the call
///      succeeds shape-wise and the contract is simply not one.
contract DumbRegistrar {
    fallback() external { }
}

/// @dev The controller's quoting half. `renew` itself is not modelled: the
///      point under test is that the page is handed a real address and a
///      real price, or is told plainly that it has neither.
contract MockController {
    uint256 public perYear;
    constructor(uint256 p) { perYear = p; }

    function rentPrice(string calldata, uint256 duration)
        external view returns (uint256 base, uint256 premium)
    {
        return ((perYear * duration) / 365 days, 0);
    }
}
