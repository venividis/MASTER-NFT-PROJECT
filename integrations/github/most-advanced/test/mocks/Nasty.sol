// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  Tokens that answer badly, so the pages can be shown to survive them.

  A market's pair is chosen by whoever opened it. `symbol()` is therefore a
  string an attacker picks, on an address an attacker deployed, called by a
  page served on the same origin as a live wallet client. Every one of these
  has happened to a real front end.
───────────────────────────────────────────────────────────────────────────*/

/// @dev A symbol that is a script tag. The whole point of the escaper.
contract ScriptToken {
    function symbol() external pure returns (string memory) {
        return "<script>alert(document.domain)</script>";
    }
    function name() external pure returns (string memory) {
        return "\" onerror=\"alert(1)";
    }
    function decimals() external pure returns (uint8) { return 18; }
    function balanceOf(address) external pure returns (uint256) { return 0; }
    function transfer(address, uint256) external pure returns (bool) { return true; }
    function transferFrom(address, address, uint256) external pure returns (bool) { return true; }
}

/// @dev Refuses to say. Older tokens, proxies mid-upgrade, plain mistakes.
contract SilentToken {
    function symbol() external pure returns (string memory) { revert("no"); }
    function decimals() external pure returns (uint8) { revert("no"); }
    function balanceOf(address) external pure returns (uint256) { return 0; }
    function transfer(address, uint256) external pure returns (bool) { return true; }
    function transferFrom(address, address, uint256) external pure returns (bool) { return true; }
}

/// @dev The bytes32 generation — MKR and its contemporaries. Not a `string`
///      at all, and `abi.decode(ret, (string))` on it reverts.
contract Bytes32Token {
    function symbol() external pure returns (bytes32) { return bytes32("MKR"); }
    function decimals() external pure returns (uint8) { return 18; }
    function balanceOf(address) external pure returns (uint256) { return 0; }
    function transfer(address, uint256) external pure returns (bool) { return true; }
    function transferFrom(address, address, uint256) external pure returns (bool) { return true; }
}

/// @dev Answers with eight kilobytes. A directory that prints this once is a
///      directory nobody can load.
contract HugeToken {
    function symbol() external pure returns (string memory) {
        bytes memory b = new bytes(8192);
        for (uint256 i; i < 8192; ++i) b[i] = "A";
        return string(b);
    }
    function decimals() external pure returns (uint8) { return 18; }
    function balanceOf(address) external pure returns (uint256) { return 0; }
    function transfer(address, uint256) external pure returns (bool) { return true; }
    function transferFrom(address, address, uint256) external pure returns (bool) { return true; }
}

/// @dev Burns everything it is given rather than answering. The reason the
///      metadata reads carry a stipend instead of forwarding all gas.
contract GasBurnerToken {
    function symbol() external view returns (string memory) {
        uint256 x;
        while (gasleft() > 2000) { x = uint256(keccak256(abi.encode(x))); }
        return "burned";
    }
    function decimals() external view returns (uint8) {
        uint256 x;
        while (gasleft() > 2000) { x = uint256(keccak256(abi.encode(x))); }
        return 18;
    }
    function balanceOf(address) external pure returns (uint256) { return 0; }
    function transfer(address, uint256) external pure returns (bool) { return true; }
    function transferFrom(address, address, uint256) external pure returns (bool) { return true; }
}

/// @dev A `string` return whose declared length is longer than the payload.
///      `abi.decode` would accept it; reading the header by hand does not.
contract LiarToken {
    function symbol() external pure returns (bytes memory) {
        // offset 32, length 4096, four bytes of body
        return abi.encodePacked(uint256(32), uint256(4096), "abcd");
    }
    function decimals() external pure returns (uint8) { return 18; }
    function balanceOf(address) external pure returns (uint256) { return 0; }
    function transfer(address, uint256) external pure returns (bool) { return true; }
    function transferFrom(address, address, uint256) external pure returns (bool) { return true; }
}

/*  The one that got through.

    It has to answer in raw returndata, not with a Solidity `bytes memory`,
    and that distinction is why the first version of this mock tested
    nothing. A `returns (bytes memory)` is ABI-wrapped: the head word is a
    perfectly legitimate 0x20 pointing at the length, and the payload the
    author meant as the offset ends up one word further in, where it is
    read as a length and rejected. The reader never sees a hostile offset
    at all, and the test passes with the bug put straight back.

    So the runtime writes the two words itself. Word zero is the ABI head a
    caller will read as the offset of a `string`; a reader that dereferences
    it before checking it performs an `mload` that far past the buffer, and
    the EVM charges memory expansion quadratically on the highest offset
    touched — about 2.15 billion gas for 0x02000000, in the caller's own
    frame, after the staticcall has already returned. The gas stipend on the
    call gives no protection whatsoever.

    Measured: 2,151M before the fix, 0.17M after.                        */
contract OffsetBombToken {
    uint256 private immutable OFF;

    constructor(uint256 off) { OFF = off; }

    fallback() external {
        uint256 o = OFF;
        assembly {
            let s := shr(224, calldataload(0))
            // symbol() / name(): a 64-byte answer whose head word is `o`
            if or(eq(s, 0x95d89b41), eq(s, 0x06fdde03)) {
                mstore(0x00, o)
                mstore(0x20, 0)
                return(0x00, 0x40)
            }
            if eq(s, 0x313ce567) { mstore(0x00, 18) return(0x00, 0x20) }  // decimals
            mstore(0x00, 1)                                              // everything else
            return(0x00, 0x20)
        }
    }
}

/// @dev Claims 200 decimals. `10 ** 200` overflows a uint256.
contract MadDecimalsToken {
    function symbol() external pure returns (string memory) { return "MAD"; }
    function decimals() external pure returns (uint8) { return 200; }
    function balanceOf(address) external pure returns (uint256) { return 0; }
    function transfer(address, uint256) external pure returns (bool) { return true; }
    function transferFrom(address, address, uint256) external pure returns (bool) { return true; }
}

/// @dev Refuses ether, so a payout to it fails. Used to prove that a failed
///      collection reverts and leaves the books intact rather than burning
///      the balance.
contract Rejector {
    function collectFrom(address lease, uint256 id) external {
        (bool ok, ) = lease.call(
            abi.encodeWithSignature("collect(uint256,address)", id, address(this)));
        require(ok, "collect failed");
    }
    function callOn(address to, bytes calldata data) external payable returns (bool ok) {
        (ok, ) = to.call{value: msg.value}(data);
    }
}

/*───────────────────────────────────────────────────────────────────────────
  A lease agent that wants more than it was given.

  The claim being tested is that naming a lease agent grants exactly one
  power — setting the ERC-4907 user — and not the transfer right an ERC-721
  approval would have carried with it. That claim is only tested by a
  contract which genuinely IS the named agent and genuinely tries.
───────────────────────────────────────────────────────────────────────────*/
contract RogueAgent {
    /// @dev The one thing it may do, so the test is not passing because the
    ///      agent was never wired up.
    function setUser(address hub, uint256 id, address user, uint64 until) external {
        (bool ok, ) = hub.call(
            abi.encodeWithSignature("setUserVia(uint256,address,uint64)", id, user, until));
        require(ok, "setUserVia refused");
    }

    function trySteal(address hub, uint256 id, address from, address to)
        external returns (bool ok)
    {
        (ok, ) = hub.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, id));
    }

    function tryApprove(address hub, uint256 id) external returns (bool ok) {
        (ok, ) = hub.call(abi.encodeWithSignature("approve(address,uint256)", address(this), id));
    }

    function tryLock(address hub, uint256 id) external returns (bool ok) {
        (ok, ) = hub.call(abi.encodeWithSignature("lock(uint256)", id));
    }

    function trySetUserDirect(address hub, uint256 id) external returns (bool ok) {
        (ok, ) = hub.call(
            abi.encodeWithSignature("setUser(uint256,address,uint64)", id, address(this),
                                    uint64(4102444800)));
    }

    function tryRetarget(address hub, uint256 id) external returns (bool ok) {
        (ok, ) = hub.call(
            abi.encodeWithSignature("setLeaseAgent(uint256,address)", id, address(this)));
    }
}
