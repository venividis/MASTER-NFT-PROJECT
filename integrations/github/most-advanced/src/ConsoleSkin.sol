// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SSTORE2} from "./lib/SSTORE2.sol";

/*═══════════════════════════════════════════════════════════════════════════

  CONSOLE SKIN — the stylesheet, held as code, served raw

  Ten kilobytes of CSS will not fit in a contract that also has to render a
  document, so it lives where the engine's own bytes live: as the runtime
  code of a contract that is nothing but data, read back with EXTCODECOPY.

  ── why this one is NOT compressed, when the engine is ──

  Everything else the console ships — its core and its nine lanes — arrives
  gzipped and base64'd and is inflated on demand. That is the right trade
  for a script: gzip buys about four and a half times, base64 costs a third
  back, and the net is a real saving on bytes nobody executes until a verb
  is opened.

  A stylesheet cannot take that trade, because of WHEN it is needed. A
  `<style>` has to be in the document before the first paint. Inflating one
  in JavaScript means the document paints once with no stylesheet and again
  with it — a flash of unstyled console, on every load, forever, to save
  about six kilobytes on a document that is already reading a chain.

  Paint correctness beats bytes. It is also the thing that makes the
  console's degradation promise true rather than soothing: when the network
  is bad enough that no script runs at all, what is left is a correct,
  styled, server-rendered page — because the stylesheet was never a script.

  ── the palette is not here ──

  `--h` is the token's own hue and is written into `:root` by the document,
  not by this file, because it is per-token and this contract is per-
  collection. Every accent in this stylesheet is derived from `--h`, so one
  number written by a contract colours the whole console.

  A band re-derives `--a` rather than inheriting it, and the comment in
  `.sub` says why: a custom property whose value contains `var()` is
  substituted where it is DECLARED. An `--a` written once on `:root` keeps
  `:root`'s hue forever no matter what a descendant does to `--h`. Getting
  that wrong produces a walk where every level is the first token's colour,
  which is precisely the illegibility this console was built to end.

═══════════════════════════════════════════════════════════════════════════*/
contract ConsoleSkin {
    error NotCurator();
    error IsFrozen();
    error Empty();

    event Loaded(uint256 index, address pointer, uint256 length);
    event Frozen();

    address public curator;
    bool public frozen;

    /// @dev Sharded for the same reason the engine is: EIP-170 caps one
    ///      contract's runtime at 24,575 usable bytes, and a stylesheet that
    ///      grows past it should not require a redesign of how it is stored.
    address[] public shard;

    constructor() {
        curator = msg.sender;
    }

    modifier onlyCurator() {
        if (msg.sender != curator) revert NotCurator();
        _;
    }

    /*──────────────────────── loading ────────────────────────*/

    function load(bytes calldata chunk) external onlyCurator {
        if (frozen) revert IsFrozen();
        if (chunk.length == 0) revert Empty();
        address p = SSTORE2.write(chunk);
        shard.push(p);
        emit Loaded(shard.length - 1, p, chunk.length);
    }

    /// @notice Drop the last shard, for a load that went in wrong.
    /// @dev    Only backwards, and only before the freeze. A stylesheet that
    ///         can be edited in the middle is a stylesheet whose middle
    ///         nobody can price.
    function dropLast() external onlyCurator {
        if (frozen) revert IsFrozen();
        shard.pop();
    }

    /// @notice After this the stylesheet is what it is, on this chain, for
    ///         as long as the chain is.
    function freeze() external onlyCurator {
        if (frozen) revert IsFrozen();
        frozen = true;
        curator = address(0);
        emit Frozen();
    }

    function setCurator(address who) external onlyCurator {
        if (frozen) revert IsFrozen();
        curator = who;
    }

    /*──────────────────────── reading ────────────────────────*/

    /// @notice The stylesheet, ready to go straight between `<style>` tags.
    function css() external view returns (bytes memory out) {
        uint256 n = shard.length;
        for (uint256 i; i < n; ++i) out = bytes.concat(out, SSTORE2.read(shard[i]));
    }

    function size() external view returns (uint256 total) {
        uint256 n = shard.length;
        for (uint256 i; i < n; ++i) total += SSTORE2.size(shard[i]);
    }

    function shardCount() external view returns (uint256) {
        return shard.length;
    }
}
