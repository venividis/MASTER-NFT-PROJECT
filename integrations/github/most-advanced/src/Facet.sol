// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Hook} from "./lib/Hook.sol";
import {Curve} from "./lib/Curve.sol";

interface IHubSection {
    function sectionOf(uint256 id) external view returns (uint256);
    function ownerOf(uint256 id) external view returns (address);
}

/*  The shapes v4 hands a hook. Declared here rather than imported because
    a callback is matched BY SELECTOR, and a selector is the hash of the
    whole signature — one field's type wrong and the PoolManager calls a
    function this contract does not have, which with no fallback reverts
    every swap on any pool that trusted it.                              */
struct PoolKey {
    address currency0;
    address currency1;
    uint24  fee;
    int24   tickSpacing;
    address hooks;
}
struct SwapParams {
    bool    zeroForOne;
    int256  amountSpecified;
    uint160 sqrtPriceLimitX96;
}

/*═══════════════════════════════════════════════════════════════════════════

  FACET — the pool charges what the solid is doing

  A coin launched from a token gets a Uniswap v4 pool whose FEE is read,
  on every swap, out of that token's four-dimensional section.

  Turn the solid so the cutting 3-space stays where it was and the pool is
  cheap. Turn it until the section is far from where it started and the
  pool holds its price harder — a higher fee against the flow crossing it.
  The holder is not setting a number in a form; they are turning the
  artwork, and the market they own responds because the artwork IS the
  parameter.

  ── why a fee and not a curve ──

  v4 will let a hook replace the pricing entirely, through
  `beforeSwapReturnDelta`, and that is the tempting version: make the
  liquidity itself the shape of the solid. It is refused here.

  A hook that returns its own delta is a hook that has to be right about
  the invariant on every path, in a contract nobody has audited, holding
  other people's liquidity. Get it wrong in the direction that pays out
  too much and the pool is drained by arithmetic rather than by theft. The
  measured version of that risk is already in this repository: an earlier
  curve re-anchored on every quote, and four hundred units in came back as
  seven hundred and eighteen. That was caught by a fuzz property. A custom
  v4 curve has no such backstop, because the pool's own accounting is what
  the hook replaced.

  A dynamic fee cannot do that. The constant-product maths stays exactly
  where v4 put it; the only thing this contract changes is what the swapper
  pays on top, bounded below by a floor and above by a ceiling, both
  `immutable`. The worst a bug here can do is charge the wrong fee inside a
  band that was fixed at deployment and is readable before anyone trades.

  ── the fee is the same function the token's own market uses ──

  `Curve.concentration` is measured off the engine's own distance
  functions: a real section volume for a real cut plane, per solid. The
  token's own AMM in Pool.sol already prices against it. This hook reads
  the same number, so a holder who turns their solid moves both markets in
  the same direction, for the same reason, and neither can disagree with
  what the artwork is showing.

  At rest — the section untouched and centred — concentration is zero on
  every solid, so the pool charges exactly FLOOR. That is the promise the
  whole curve library is built around, and it holds here without a special
  case.

  ── what an address tells you before you trade ──

  This hook takes BEFORE_INITIALIZE and BEFORE_SWAP, and nothing else. It
  cannot touch liquidity, it cannot take a delta, it cannot refuse a
  withdrawal. Those bits are absent from its address and any reader can
  check that without trusting a word here — which is the half of hook
  safety that does not depend on reading the source.

  BEFORE_INITIALIZE exists for one reason: to refuse a pool that was not
  created dynamic-fee. Without that check the hook deploys, the pool works,
  every swap charges the key's static fee, and the returned override is
  discarded in silence. A control that does nothing while appearing to
  work is the failure this contract is most likely to ship with, so it is
  made impossible at initialisation rather than documented.

═══════════════════════════════════════════════════════════════════════════*/
contract Facet {
    /// @notice The PoolManager, and the only address these callbacks accept.
    address public immutable MANAGER;
    /// @notice The collection, and the token whose section sets the fee.
    IHubSection public immutable HUB;
    uint256 public immutable TOKEN;

    /// @notice The fee at rest, and the fee at the furthest cut. Both fixed
    ///         at deployment, in hundredths of a basis point.
    uint24 public immutable FLOOR;
    uint24 public immutable CEILING;

    error NotTheManager();
    error NotDynamic();
    error BadBand();

    constructor(address manager, IHubSection hub, uint256 token, uint24 floor_, uint24 ceiling_) {
        /*  A band that runs backwards, or past what v4 will accept, is a
            band nobody could have meant. `MAX_FEE` is 100%.             */
        if (floor_ > ceiling_ || ceiling_ > Hook.MAX_FEE) revert BadBand();
        MANAGER = manager;
        HUB = hub;
        TOKEN = token;
        FLOOR = floor_;
        CEILING = ceiling_;
    }

    modifier onlyManager() {
        if (msg.sender != MANAGER) revert NotTheManager();
        _;
    }

    /*═══════════════════ the fee, as a public reading ═══════════════════*/

    /// @notice What the next swap will pay, in hundredths of a basis point.
    /// @dev    A `view`, so a page can show the number before anybody
    ///         trades and a trader can check it against the artwork.
    function fee() public view returns (uint24) {
        uint256 c = Curve.concentration(HUB.sectionOf(TOKEN));
        uint256 span = uint256(CEILING) - uint256(FLOOR);
        return uint24(uint256(FLOOR) + (span * c) / Curve.MAX_CONCENTRATION);
    }

    /// @notice The same number with its parts, for a page that would rather
    ///         explain than assert.
    function reading()
        external view
        returns (uint256 section, uint256 concentration, uint24 now_, uint24 floor_, uint24 ceiling_)
    {
        section = HUB.sectionOf(TOKEN);
        concentration = Curve.concentration(section);
        now_ = fee();
        floor_ = FLOOR;
        ceiling_ = CEILING;
    }

    /*═══════════════════ the two callbacks ═══════════════════*/

    /// @dev Refuses a pool that is not dynamic-fee. Without this the hook
    ///      would appear to work while every swap charged the key's static
    ///      number and the override was thrown away.
    function beforeInitialize(address, PoolKey calldata key, uint160)
        external view onlyManager returns (bytes4)
    {
        if (key.fee != Hook.DYNAMIC_FEE) revert NotDynamic();
        return Facet.beforeInitialize.selector;
    }

    /// @dev The override only counts with `OVERRIDE_FEE` set on it. Return
    ///      the bare number and the PoolManager keeps the stored fee and
    ///      says nothing.
    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external view onlyManager returns (bytes4, int256, uint24)
    {
        return (Facet.beforeSwap.selector, int256(0), fee() | Hook.OVERRIDE_FEE);
    }

    /// @notice The permissions this hook needs, and the whole of them.
    function flags() external pure returns (uint16) {
        return uint16(Hook.BEFORE_INITIALIZE | Hook.BEFORE_SWAP);
    }
}
