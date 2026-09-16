// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TokenView} from "../lib/Types.sol";

/*───────────────────────────────────────────────────────────────────────────
  The site's view of the collection.

  Five contracts render this site, and they read the same eight or nine
  things. Declaring those once is not tidiness — a page that declares its
  own copy of an interface is a page that keeps compiling after the
  contract it reads has changed shape, and then serves a number that means
  something else.
───────────────────────────────────────────────────────────────────────────*/

interface IHub {
    function totalSupply() external view returns (uint256);
    function MAX_SUPPLY() external view returns (uint256);
    function COLLECTION() external view returns (uint256);
    function FIRST_ID() external view returns (uint256);
    function LAST_ID() external view returns (uint256);
    function price() external view returns (uint256);
    function ownerOf(uint256 id) external view returns (address);
    function tokenURI(uint256 id) external view returns (string memory);
    function tokenURIAt(uint256 id, uint256 index) external view returns (string memory);
    function hasPinnedTokenURI(uint256 id) external view returns (bool);
    function sectionOf(uint256 id) external view returns (uint256);
    function kernelStatus(uint256 id) external view returns (uint8);
    function locked(uint256 id) external view returns (bool);
    function account(uint256 id) external view returns (address);
    function grip(uint256 id) external view returns (address);
    function viewOf(uint256 id) external view returns (TokenView memory);
    function renderer() external view returns (address);
    function userOf(uint256 id) external view returns (address);
    function userExpires(uint256 id) external view returns (uint256);
    function leaseAgentOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
}

interface ISigilDraw {
    function svg(uint256 id, uint256 word, bytes32 seed, uint32 strata)
        external view returns (bytes memory);
}

interface IRendererDoc {
    /// @dev The document before it is base64'd into a data: URI — the same
    ///      bytes, one step earlier.
    function document(TokenView memory v) external view returns (bytes memory);
    function sigil() external view returns (address);
    function facetCount() external view returns (uint256);
}

/*  `market()` returns twelve values, and a page that wants to print all
    twelve alongside four ERC-20 metadata reads runs out of stack even
    through the IR pipeline. One memory struct is one stack slot, so the
    reader packs once and every helper takes the struct.                */
struct MarketView {
    address base;
    address quote;
    uint112 rBase;
    uint112 rQuote;
    uint16  feeBps;
    bool    open;
    uint256 conc;
    uint256 spot;
    uint256 maxBaseOut;
    uint256 maxQuoteOut;
    uint256 trades;
    uint64  bondUntil;
    uint8   dBase;
    uint8   dQuote;
}

interface IPoolRead {
    function market(uint256 id)
        external view
        returns (
            address base, address quote,
            uint112 rBase, uint112 rQuote,
            uint16 feeBps, bool open,
            uint256 concentrationBps,
            uint256 spotBaseInQuote,
            uint256 maxBaseOut, uint256 maxQuoteOut,
            uint256 trades, uint64 bondUntil
        );
    function quote(uint256 id, bool baseIn, uint256 amountIn) external view returns (uint256);
    function isBonded(uint256 id) external view returns (bool);
    function paused() external view returns (bool);
    function pendingCurve(uint256 id)
        external view returns (bool pending, uint256 atCurve, uint256 atArtwork);
    function openCount() external view returns (uint256);
    function openIds(uint256 from, uint256 count) external view returns (uint256[] memory);
}

interface ILeaseRead {
    function listing(uint256 id)
        external view
        returns (
            bool rentable, uint8 reason,
            uint128 perDay, uint32 minDays, uint32 maxDays,
            address renter, uint64 until,
            uint256 vested, bool bound
        );
    function cost(uint256 id, uint32 dayCount) external view returns (uint256);
    function MAX_DAYS() external view returns (uint32);
}

interface IDesk {
    function config(uint256 id) external view returns (string memory);
    function bare() external view returns (string memory);
    function core() external pure returns (string memory);
    function swap() external pure returns (string memory);
    function pool() external pure returns (string memory);
    function rent() external pure returns (string memory);
}

/*═══════════════════ where the tokens talk ═══════════════════*/

interface IParley {
    function COMMONS() external view returns (uint256);
    function MAX_BODY() external view returns (uint256);
    function MAX_NAME() external view returns (uint256);
    function groups() external view returns (uint256);
    function groupKey(uint256 index) external pure returns (uint256);
    function pairKey(uint256 a, uint256 b) external pure returns (uint256);
    function mayActAs(uint256 token, address who) external view returns (bool);
    function sealX(uint256 token) external view returns (bytes32);
    function stateOf(uint256 room)
        external view
        returns (uint64 last, uint64 count, uint64 opened, uint32 members,
                 uint8 kind, bool open, uint256 steward, uint256 index, string memory name);
    function topics()
        external pure
        returns (bytes32 said, bytes32 founded, bytes32 entered,
                 bytes32 departed, bytes32 announced);
}

interface ITalkDesk {
    function config(uint256 room, uint256 other, uint256 group)
        external view returns (string memory);
    function core() external pure returns (string memory);
    function rooms() external pure returns (string memory);
    function door() external pure returns (string memory);
}

/*═══════════════════ the rest of the chain ═══════════════════*/

/*  What a Uniswap v3 pool is, as far as anything here reads it.

    Declared beside MarketView for the same reason MarketView exists: five
    contracts read this shape and a contract that declares its own copy is a
    contract that keeps compiling after the shape has changed, and then
    prints a number that means something else.                            */
struct Look {
    bool    found;
    address pool;
    uint24  fee;
    uint128 liquidity;
    uint160 sqrtPriceX96;
    int24   tick;
    /// @dev What one whole unit of the base is worth in the quote's
    ///      smallest unit. Zero when nothing was found.
    uint256 spot;
}

struct PoolState {
    bool    ok;
    uint160 sqrtPriceX96;
    int24   tick;
    uint128 liquidity;
    address token0;
    address token1;
    uint24  fee;
    int24   spacing;
    /// @dev How many observations the pool's own oracle keeps. One means it
    ///      has no history at all, which is the default every pool is
    ///      created with — and the reason the chart on this site can be
    ///      empty for a pool that trades constantly.
    uint16  cardinality;
}

interface IVenue {
    function FACTORY() external view returns (address);
    function QUOTER() external view returns (address);
    function ROUTER() external view returns (address);
    function ROUTER_KIND() external view returns (uint8);
    function POSITIONS() external view returns (address);
    function WRAPPED() external view returns (address);
    function GOVERNOR() external view returns (address);
    function GOV_TOKEN() external view returns (address);
    function POOL_MANAGER() external view returns (address);

    function present() external view returns (bool);
    function hasV4() external view returns (bool);
    function tiers() external pure returns (uint24[4] memory);
    function enabled(uint24 fee) external view returns (int24);
    function spacings() external view returns (int24[4] memory);

    function poolAt(address a, address b, uint24 fee) external view returns (address);
    function best(address base, address quote, uint8 baseDecimals)
        external view returns (Look memory);
    function survey(address base, address quote, uint8 baseDecimals)
        external view returns (Look[4] memory);
    function state(address pool) external view returns (PoolState memory);
    function history(address pool, uint32 window, uint8 points)
        external view returns (bool ok, int24[] memory ticks, uint32 step);
    function oldest(address pool) external view returns (bool ok, uint32 secondsAgo);

    function sqrtAt(int24 tick) external pure returns (uint160);
    function priceAt(int24 tick, uint256 unit, bool baseIsToken0)
        external pure returns (uint256);
    function spacing(uint24 fee) external pure returns (int24);
    function usable(int24 tick, int24 sp) external pure returns (int24);
}

interface IChrome {
    function head(string memory title) external pure returns (string memory);
    function wallet() external pure returns (string memory);
    function tabs(string memory t, uint8 here) external pure returns (string memory);
    function nav(uint256 id, uint8 here) external pure returns (string memory);
    function navTop(uint8 here) external pure returns (string memory);
    function foot(address premises, uint256 chainId) external pure returns (string memory);
}
