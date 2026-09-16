// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  Hook — what a v4 hook's address already tells you

  Uniswap v4 does something no other protocol here does: it puts a
  contract's *permissions in its address*. The PoolManager decides whether
  to call a hook's `beforeSwap` by testing one bit of the hook's own
  address. Fourteen callbacks, fourteen bits, the low fourteen.

  Two consequences, and both of them are unusually good for a page that
  cannot fetch anything.

  **A hook's powers are legible with no call at all.** Paste an address and
  this library says exactly which of the fourteen callbacks the pool will
  hand it, from the address alone — no RPC, no ABI, no source, and nothing
  the hook's author can lie about. A hook cannot claim not to intercept
  swaps while having the swap bit set, because the bit *is* what makes the
  interception happen. That is a stronger guarantee than reading verified
  source, which tells you what the code says and not what the pool will do.

  **And a hook cannot be deployed to just any address.** To have the powers
  it declares, its address must carry those bits — which means mining a
  CREATE2 salt until the derived address matches. Roughly 2^14 tries for a
  full pattern. That is why `Kiln` mines salts in an `eth_call`: the browser
  has no keccak, and this contract does.

  Reproduced from `v4-core/src/libraries/Hooks.sol` rather than imported,
  because this collection compiles from `src/` with no dependency tree. The
  values are the ones the deployed PoolManager tests against; a different
  set here would describe every hook on the site wrongly.
───────────────────────────────────────────────────────────────────────────*/
library Hook {
    uint160 internal constant BEFORE_INITIALIZE                = 1 << 13;
    uint160 internal constant AFTER_INITIALIZE                 = 1 << 12;
    uint160 internal constant BEFORE_ADD_LIQUIDITY             = 1 << 11;
    uint160 internal constant AFTER_ADD_LIQUIDITY              = 1 << 10;
    uint160 internal constant BEFORE_REMOVE_LIQUIDITY          = 1 << 9;
    uint160 internal constant AFTER_REMOVE_LIQUIDITY           = 1 << 8;
    uint160 internal constant BEFORE_SWAP                      = 1 << 7;
    uint160 internal constant AFTER_SWAP                       = 1 << 6;
    uint160 internal constant BEFORE_DONATE                    = 1 << 5;
    uint160 internal constant AFTER_DONATE                     = 1 << 4;
    uint160 internal constant BEFORE_SWAP_RETURNS_DELTA        = 1 << 3;
    uint160 internal constant AFTER_SWAP_RETURNS_DELTA         = 1 << 2;
    uint160 internal constant AFTER_ADD_LIQUIDITY_RETURNS_DELTA    = 1 << 1;
    uint160 internal constant AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA = 1 << 0;

    /// @notice The low fourteen bits — everything above them is ordinary
    ///         address entropy and says nothing about permissions.
    uint160 internal constant MASK = uint160((1 << 14) - 1);

    /// @notice `fee` in a PoolKey equal to this marks the pool dynamic-fee:
    ///         the hook sets the fee per swap rather than the key fixing it.
    /// @dev    v4-core `LPFeeLibrary.DYNAMIC_FEE_FLAG`. A pool created with
    ///         it and no hook is a pool nothing can ever set a fee on.
    uint24 internal constant DYNAMIC_FEE = 0x800000;

    /// @notice The largest static fee a key may carry: 1,000,000 hundredths
    ///         of a basis point, which is 100%.
    uint24 internal constant MAX_FEE = 1_000_000;

    /// @notice A fee a hook returns from `beforeSwap` only counts if this
    ///         bit is set on it.
    /// @dev    v4-core `LPFeeLibrary.OVERRIDE_FEE_FLAG`. Without it the
    ///         PoolManager keeps the pool's stored fee and the hook's
    ///         return value is silently ignored — which is the failure a
    ///         dynamic-fee hook is most likely to ship with, because
    ///         nothing reverts and every swap simply charges the old
    ///         number.
    uint24 internal constant OVERRIDE_FEE = 0x400000;

    /// @notice The fee bits themselves, under the two flags above.
    uint24 internal constant FEE_MASK = 0x3fffff;

    /*═══════════════════ reading an address ═══════════════════*/

    function flags(address hook) internal pure returns (uint16) {
        return uint16(uint160(hook) & MASK);
    }

    function has(address hook, uint160 flag) internal pure returns (bool) {
        return uint160(hook) & flag != 0;
    }

    /// @notice Whether this address will ever be handed control by a pool.
    /// @dev    An address with no flag bits set is a hook the PoolManager
    ///         never calls — which is a legitimate thing to be (v4 allows
    ///         address(0)) and also the shape of a "hook" that does nothing
    ///         while its author says otherwise.
    function inert(address hook) internal pure returns (bool) {
        return uint160(hook) & MASK == 0;
    }

    /// @notice Whether a hook may change what a swap costs.
    /// @dev    The single most important question to ask of a hook you did
    ///         not write, and it is answerable from the address. Any of
    ///         these three lets the hook take a cut of, or refuse, a trade.
    function touchesSwaps(address hook) internal pure returns (bool) {
        return uint160(hook) & (BEFORE_SWAP | AFTER_SWAP
            | BEFORE_SWAP_RETURNS_DELTA | AFTER_SWAP_RETURNS_DELTA) != 0;
    }

    /// @notice Whether a hook can stop liquidity being taken out.
    /// @dev    This is how a launchpad locks liquidity honestly: not with a
    ///         promise, and not with a timelock a deployer can bypass, but
    ///         with a pool that will not process the withdrawal. It is also
    ///         exactly how a hook traps liquidity forever, and the address
    ///         cannot tell you which — only that the power is there.
    function guardsExits(address hook) internal pure returns (bool) {
        return uint160(hook) & (BEFORE_REMOVE_LIQUIDITY
            | AFTER_REMOVE_LIQUIDITY | AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA) != 0;
    }

    /// @notice The name of the i-th flag, most significant first, or "" past
    ///         the end. Fourteen short strings rather than one big one, so a
    ///         caller can build a list without a delimiter to split on.
    function name(uint256 i) internal pure returns (string memory) {
        if (i == 0)  return "beforeInitialize";
        if (i == 1)  return "afterInitialize";
        if (i == 2)  return "beforeAddLiquidity";
        if (i == 3)  return "afterAddLiquidity";
        if (i == 4)  return "beforeRemoveLiquidity";
        if (i == 5)  return "afterRemoveLiquidity";
        if (i == 6)  return "beforeSwap";
        if (i == 7)  return "afterSwap";
        if (i == 8)  return "beforeDonate";
        if (i == 9)  return "afterDonate";
        if (i == 10) return "beforeSwapReturnsDelta";
        if (i == 11) return "afterSwapReturnsDelta";
        if (i == 12) return "afterAddLiquidityReturnsDelta";
        if (i == 13) return "afterRemoveLiquidityReturnsDelta";
        return "";
    }

    /// @notice What the i-th flag actually lets a hook do to you.
    function meaning(uint256 i) internal pure returns (string memory) {
        if (i == 0)  return "runs when the pool is created";
        if (i == 1)  return "runs after the pool is created";
        if (i == 2)  return "can refuse liquidity being added";
        if (i == 3)  return "runs after liquidity is added";
        if (i == 4)  return "CAN REFUSE LIQUIDITY BEING TAKEN OUT";
        if (i == 5)  return "runs after liquidity is removed";
        if (i == 6)  return "CAN REFUSE OR REPRICE EVERY SWAP";
        if (i == 7)  return "runs after every swap";
        if (i == 8)  return "runs before a donation";
        if (i == 9)  return "runs after a donation";
        if (i == 10) return "CAN TAKE A CUT OF THE INPUT OF EVERY SWAP";
        if (i == 11) return "CAN TAKE A CUT OF THE OUTPUT OF EVERY SWAP";
        if (i == 12) return "can take a cut of liquidity added";
        if (i == 13) return "CAN TAKE A CUT OF LIQUIDITY REMOVED";
        return "";
    }

    /// @notice The flag value for index `i`, most significant first.
    function bit(uint256 i) internal pure returns (uint160) {
        return i > 13 ? 0 : uint160(1) << uint160(13 - i);
    }

    /*═══════════════════ where a salt lands ═══════════════════*/

    /// @notice The address `CREATE2` would produce, without deploying.
    /// @dev    keccak(0xff ++ deployer ++ salt ++ initCodeHash), low 20
    ///         bytes. The same arithmetic every CREATE2 factory does, and
    ///         the reason a hook's address can be chosen at all.
    function at(address deployer, bytes32 salt, bytes32 initCodeHash)
        internal pure returns (address)
    {
        return address(uint160(uint256(
            keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash))
        )));
    }
}
