// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  SSTORE2 — bytes held as contract code

  Storage costs 20,000 gas per 32-byte word: 625 gas per byte. Code costs
  200 gas per byte to deposit and is free to read with EXTCODECOPY. For a
  document that is written once and read forever, code is the cheaper
  medium by a factor of three, and the only one that can hold 24 KB in a
  single object.

  Each shard is deployed as the runtime code of a contract whose first
  byte is STOP, so that if anything ever CALLs a shard it halts instead of
  executing document text as opcodes.

                offset  0  1  2  3  4  5  6  7  8  9 10 11 | 12 ...
    init code           61 xx xx 80 60 0c 60 00 39 60 00 f3 | 00 <data>
                        PUSH2    DUP1 PUSH1 PUSH1 CC PUSH1 RET| STOP

    The PUSH1 at offset 4 is the CODECOPY source offset, and it must be 12
    — the length of everything above it. Get it wrong by two and every
    shard comes back with the tail of the init code glued to its front and
    two bytes missing from its end, which is exactly the kind of thing that
    reads fine and corrupts silently, so tools/verify.mjs takes the
    document back off a live EVM and compares it byte for byte.
───────────────────────────────────────────────────────────────────────────*/
library SSTORE2 {
    /// @dev EIP-170 caps deployed runtime code at 24,576 bytes; one is the STOP.
    uint256 internal constant MAX_SHARD = 24_575;

    error ShardTooLarge();
    error ShardEmpty();
    error DeployFailed();

    function write(bytes memory data) internal returns (address ptr) {
        uint256 n = data.length;
        if (n == 0) revert ShardEmpty();
        if (n > MAX_SHARD) revert ShardTooLarge();

        bytes memory init = abi.encodePacked(
            hex"61", uint16(n + 1),   // PUSH2 len+1
            hex"80",                  // DUP1
            hex"600c",                // PUSH1 12   (offset of runtime in init code)
            hex"6000",                // PUSH1 0
            hex"39",                  // CODECOPY
            hex"6000",                // PUSH1 0
            hex"f3",                  // RETURN
            hex"00",                  // STOP - first byte of the runtime
            data
        );

        assembly ("memory-safe") {
            ptr := create(0, add(init, 0x20), mload(init))
        }
        if (ptr == address(0)) revert DeployFailed();
    }

    function read(address ptr) internal view returns (bytes memory out) {
        uint256 n = ptr.code.length;
        if (n < 2) revert ShardEmpty();
        unchecked { n -= 1; }
        out = new bytes(n);
        assembly ("memory-safe") {
            extcodecopy(ptr, add(out, 0x20), 1, n)
        }
    }

    function size(address ptr) internal view returns (uint256 n) {
        n = ptr.code.length;
        unchecked { n = n == 0 ? 0 : n - 1; }
    }
}
