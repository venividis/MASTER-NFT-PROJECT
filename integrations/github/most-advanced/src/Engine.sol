// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SSTORE2} from "./lib/SSTORE2.sol";

/*───────────────────────────────────────────────────────────────────────────
  ENGINE — the document, held as bytecode

  The interface is stored in two runs of shards with a gap between them.
  tokenURI() writes each token's live state into that gap, so the state
  arrives before the engine's first line runs and no contract ever has to
  search a string for a marker.

      head shards   <!DOCTYPE …  through  </head>
      ─── gap ───   <script>window.IPSE={…}</script>
      body shards   <body> … </html>

  Compression
    A DEFLATE stream is roughly a fifth of the size of this document, and
    every byte costs 200 gas to deposit and inflates the base64 that comes
    back out of tokenURI(). When `compressed` is set, the shards hold gzip
    bytes and the renderer emits a small loader that hands them to the
    browser's own DecompressionStream. Nothing is fetched either way; the
    decompressor is part of the platform, like the JSON parser.

  Sealing
    freeze() is one way. After it, no shard can be added, replaced or
    removed by anyone, including the curator, forever.
───────────────────────────────────────────────────────────────────────────*/
contract Engine {
    address public curator;
    bool    public frozen;
    bool    public compressed;

    address[] public head;
    address[] public body;

    /// @dev Set when compressed, so a client can check what it inflated.
    uint32 public inflatedSize;

    event Loaded(bool isHead, uint256 index, address pointer, uint256 size);
    event Frozen(uint256 headBytes, uint256 bodyBytes);
    event CuratorChanged(address curator);

    error NotCurator();
    error IsFrozen();
    error NothingLoaded();

    modifier onlyCurator() {
        if (msg.sender != curator) revert NotCurator();
        _;
    }

    constructor(bool compressed_) {
        curator = msg.sender;
        compressed = compressed_;
    }

    /*──────────────────────── loading ────────────────────────*/

    function loadHead(bytes calldata chunk) external onlyCurator {
        if (frozen) revert IsFrozen();
        address p = SSTORE2.write(chunk);
        head.push(p);
        emit Loaded(true, head.length - 1, p, chunk.length);
    }

    function loadBody(bytes calldata chunk) external onlyCurator {
        if (frozen) revert IsFrozen();
        address p = SSTORE2.write(chunk);
        body.push(p);
        emit Loaded(false, body.length - 1, p, chunk.length);
    }

    /// @notice Record the size of the document once inflated, so a reader
    ///         can check the decompression produced what was intended.
    function setInflatedSize(uint32 n) external onlyCurator {
        if (frozen) revert IsFrozen();
        inflatedSize = n;
    }

    /// @notice Throw away the last shard of either run, while still loading.
    function dropLast(bool isHead) external onlyCurator {
        if (frozen) revert IsFrozen();
        if (isHead) head.pop();
        else body.pop();
    }

    /// @notice Irreversible. Nothing about the document can change afterwards.
    function freeze() external onlyCurator {
        if (frozen) revert IsFrozen();
        if (head.length == 0 || body.length == 0) revert NothingLoaded();
        frozen = true;
        (uint256 h, uint256 b) = sizes();
        emit Frozen(h, b);
    }

    function setCurator(address who) external onlyCurator {
        curator = who;
        emit CuratorChanged(who);
    }

    /*──────────────────────── reading ────────────────────────*/

    function headBytes() public view returns (bytes memory out) {
        uint256 n = head.length;
        for (uint256 i; i < n; ++i) out = bytes.concat(out, SSTORE2.read(head[i]));
    }

    function bodyBytes() public view returns (bytes memory out) {
        uint256 n = body.length;
        for (uint256 i; i < n; ++i) out = bytes.concat(out, SSTORE2.read(body[i]));
    }

    function sizes() public view returns (uint256 headSize, uint256 bodySize) {
        uint256 n = head.length;
        for (uint256 i; i < n; ++i) headSize += SSTORE2.size(head[i]);
        n = body.length;
        for (uint256 i; i < n; ++i) bodySize += SSTORE2.size(body[i]);
    }

    function shardCount() external view returns (uint256 headShards, uint256 bodyShards) {
        return (head.length, body.length);
    }
}
