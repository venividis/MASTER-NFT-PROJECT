// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Hook} from "./lib/Hook.sol";
import {Curve} from "./lib/Curve.sol";
import {Facet} from "./Facet.sol";

interface IHolds {
    function ownerOf(uint256 id) external view returns (address);
    function account(uint256 id) external view returns (address);
    function sectionOf(uint256 id) external view returns (uint256);
}

/*───────────────────────────────────────────────────────────────────────────
  Kiln — where a launch is made

  A launchpad is four transactions with a lot of choices in front of them:
  make a token, choose what may intercept its pool, create the pool, put
  liquidity in it. This contract owns the first two. The other two go
  straight to Uniswap, from the visitor's wallet, like everything else here.

  ── the token has no owner, and that is the point ──

  `Coin` is a fixed-supply ERC-20 with no mint, no burn-from, no pause, no
  blacklist, no owner and no upgrade path. The entire supply exists at
  deployment and goes where the deployer said.

  That is a deliberate limit on what this launchpad will make, and it costs
  some flexibility. Every one of the omitted features is a lever the token's
  deployer can pull against everybody who bought it, and a launchpad that
  offers those levers is not a launchpad, it is a rug factory with a form.
  If a launch genuinely needs mintability, it needs a token this contract
  did not make — the pool step below takes any address, so nothing here
  stops that. It just will not be the thing with our name on it.

  Everything a person might actually want to vary — supply, decimals, the
  split between pool and treasury, the price, the range, the fee, the tick
  spacing, and what may intercept the pool — is varied at the launch, not
  smuggled into the token as a permission.

  ── mining a hook's address ──

  Uniswap v4 encodes a hook's permissions in the low fourteen bits of its
  address. So a hook that wants `beforeSwap` must *be deployed at* an
  address with that bit set, which means trying CREATE2 salts until one
  lands. Roughly 2^14 attempts for a full pattern.

  A browser cannot do that here: the client this collection ships has no
  keccak-256, on purpose. This contract does. `mine` is a `view` function
  that walks salts and returns the first that lands — run by the visitor's
  own node under `eth_call`, which executes and discards, so the search
  costs nobody anything and commits nothing. Sixty thousand candidates fit
  comfortably in one call; the page asks for a window at a time and says how
  many it has tried.

  That is the whole trick, and it is the reason a launchpad with hooks can
  exist on a page with no server: the expensive, keccak-shaped part of
  deploying a hook is a read, and reads are free.
───────────────────────────────────────────────────────────────────────────*/

/*───────────────────────────────────────────────────────────────────────────
  A token that cannot be used against the people who hold it.
───────────────────────────────────────────────────────────────────────────*/
contract Coin {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public immutable totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error NotEnough();

    constructor(string memory n, string memory s, uint8 d, uint256 supply, address to) {
        name = n;
        symbol = s;
        decimals = d;
        totalSupply = supply;
        balanceOf[to] = supply;
        emit Transfer(address(0), to, supply);
    }

    function transfer(address to, uint256 v) external returns (bool) {
        return _move(msg.sender, to, v);
    }

    function approve(address spender, uint256 v) external returns (bool) {
        allowance[msg.sender][spender] = v;
        emit Approval(msg.sender, spender, v);
        return true;
    }

    function transferFrom(address from, address to, uint256 v) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            if (a < v) revert NotEnough();
            unchecked { allowance[from][msg.sender] = a - v; }
        }
        return _move(from, to, v);
    }

    function _move(address from, address to, uint256 v) private returns (bool) {
        uint256 b = balanceOf[from];
        if (b < v) revert NotEnough();
        unchecked { balanceOf[from] = b - v; balanceOf[to] += v; }
        emit Transfer(from, to, v);
        return true;
    }
}

contract Kiln {
    /// @notice The PoolManager the shipped hooks will accept calls from.
    /// @dev    A constructor argument, like every other address in this
    ///         collection. A hook that trusted the wrong manager would let
    ///         anybody call its callbacks directly, which for a hook that
    ///         gates withdrawals means anybody can ask it to allow one.
    address public immutable POOL_MANAGER;

    /// @notice The collection. A launch is signed by a token of it — the
    ///         same attribution rule the old coin pourer had, kept for the
    ///         same reason: what this contract deploys carries the
    ///         collection's name, so the collection's tokens are what may
    ///         deploy it. It confers no other power; there is no privileged
    ///         caller anywhere here.
    IHolds public immutable HUB;

    constructor(IHolds hub, address poolManager) {
        HUB = hub;
        POOL_MANAGER = poolManager;
    }

    /// @dev Owner or the token's own 6551 account — never a renter.
    function mayActAs(uint256 token, address who) public view returns (bool) {
        if (who == address(0)) return false;
        try HUB.ownerOf(token) returns (address o) {
            return who == o || who == HUB.account(token);
        } catch { return false; }
    }

    error DeployFailed();
    error AlreadyLaunched();
    error NothingToLaunch();
    error NotYours();
    error BadBand();
    error WrongFlags(uint16 wanted, uint16 got);

    /// @notice Every token this contract has made, in order, so the page can
    ///         list them without an indexer.
    address[] public coins;
    /// @notice Who launched each one, for the page to print. It confers
    ///         nothing — there is no privileged caller anywhere here.
    mapping(address => address) public launcher;
    /// @notice Which token of the collection signed each launch.
    mapping(address => uint256) public launchedBy;
    mapping(address => uint256) public launchedAt;

    event Launched(address indexed coin, address indexed by,
                   uint256 indexed token, string symbol, uint256 supply);
    event HookDeployed(address indexed hook, address indexed by, uint16 flags);

    /*═══════════════════ making a token ═══════════════════*/

    /// @notice Deploy a fixed-supply token to a deterministic address.
    /// @dev    CREATE2 so the address is known before the transaction is
    ///         sent and cannot be changed by a reorder — a launch that
    ///         announces its address in advance can be checked against what
    ///         actually appeared.
    function launch(
        uint256 token, string memory name_, string memory symbol_,
        uint8 decimals_, uint256 supply, bytes32 salt
    ) external returns (address coin) {
        if (!mayActAs(token, msg.sender)) revert NotYours();
        if (supply == 0) revert NothingToLaunch();
        /*  The launcher is mixed into the salt, so two people using the same
            vanity salt do not collide and neither can front-run the other's
            address. Without this, watching the mempool for a `launch` and
            re-sending it with more gas takes the address.                */
        bytes32 s = keccak256(abi.encode(msg.sender, salt));
        coin = address(new Coin{salt: s}(name_, symbol_, decimals_, supply, msg.sender));
        coins.push(coin);
        launcher[coin] = msg.sender;
        launchedBy[coin] = token;
        launchedAt[coin] = block.timestamp;
        emit Launched(coin, msg.sender, token, symbol_, supply);
    }

    function coinCount() external view returns (uint256) {
        return coins.length;
    }

    /// @notice A window of the launched tokens, newest first.
    /// @dev    Newest first because a launchpad's list is read for what just
    ///         happened. Paged, because reading all of them in one
    ///         `eth_call` is a call no node will finish.
    function recent(uint256 from, uint256 count)
        external view returns (address[] memory out)
    {
        uint256 n = coins.length;
        if (from >= n) return new address[](0);
        uint256 take = n - from;
        if (take > count) take = count;
        out = new address[](take);
        for (uint256 i; i < take; ++i) out[i] = coins[n - 1 - from - i];
    }

    /// @notice Where `launch` would put a token, before sending it.
    function coinAt(
        address by, string memory name_, string memory symbol_,
        uint8 decimals_, uint256 supply, bytes32 salt
    ) external view returns (address) {
        return Hook.at(
            address(this),
            keccak256(abi.encode(by, salt)),
            keccak256(abi.encodePacked(
                type(Coin).creationCode,
                abi.encode(name_, symbol_, decimals_, supply, by)
            ))
        );
    }

    /*═══════════════════ mining a hook's address ═══════════════════*/

    /// @notice Walk CREATE2 salts until one lands on an address whose low
    ///         fourteen bits are exactly `flags`.
    /// @dev    A `view`, so a browser runs it with `eth_call` — it executes
    ///         and commits nothing, and costs the searcher nothing but their
    ///         own node's time. This is the only reason a client with no
    ///         keccak can deploy a v4 hook at all.
    ///
    ///         Bounded rather than looping to success, because an `eth_call`
    ///         has a gas ceiling and a function that ignored it would simply
    ///         fail at some size with no partial answer. The caller asks for
    ///         a window, gets told whether it landed, and moves the window
    ///         along — so the page can say "tried 180,000" instead of
    ///         hanging.
    ///
    ///         `flags` must be matched exactly, not merely contained: v4
    ///         requires a hook's address bits to equal its declared
    ///         permissions, so an address with a *spare* bit set is one the
    ///         PoolManager will hand a callback the hook does not implement.
    /// @param initCodeHash keccak of the hook's creation code plus its
    ///                     constructor arguments — the thing CREATE2 hashes
    /// @param flags        the fourteen-bit pattern wanted
    /// @param from         the first salt to try, as a number
    /// @param tries        how many to try before giving up
    function mine(bytes32 initCodeHash, uint16 flags, uint256 from, uint256 tries)
        external view returns (bool found, bytes32 salt, address at)
    {
        uint160 want = uint160(flags) & Hook.MASK;
        address self = address(this);
        assembly ("memory-safe") {
            let p := mload(0x40)
            // 0xff ++ deployer(20) ++ salt(32) ++ initCodeHash(32) = 85 bytes.
            // Laid out once; only the salt word moves between attempts.
            mstore8(p, 0xff)
            mstore(add(p, 1), shl(96, self))
            mstore(add(p, 53), initCodeHash)
            let mask := 0x3fff
            for { let i := 0 } lt(i, tries) { i := add(i, 1) } {
                let s := add(from, i)
                mstore(add(p, 21), s)
                let a := and(keccak256(p, 85), 0xffffffffffffffffffffffffffffffffffffffff)
                if eq(and(a, mask), want) {
                    found := 1
                    salt := s
                    at := a
                    break
                }
            }
        }
    }

    /// @notice Deploy one of the hooks this contract ships, at a salt that
    ///         `mine` found, and refuse to hand back an address that does
    ///         not carry the permissions the hook declares.
    /// @dev    The check is not ceremony. A hook deployed to an address
    ///         missing one of its bits is a hook whose callback the pool
    ///         will simply never invoke — the code is there, it compiles, it
    ///         is verified on the explorer, and it never runs. A lock that
    ///         is never consulted looks exactly like a lock.
    function deployHook(uint8 kind, bytes32 salt, bytes32 arg)
        external returns (address hook)
    {
        (bytes memory code, uint16 flags) = _recipe(kind, arg);
        assembly ("memory-safe") {
            hook := create2(0, add(code, 32), mload(code), salt)
        }
        if (hook == address(0)) revert DeployFailed();
        uint16 got = Hook.flags(hook);
        if (got != flags) revert WrongFlags(flags, got);
        emit HookDeployed(hook, msg.sender, flags);
    }

    /// @notice The creation-code hash for a shipped hook, which is what
    ///         `mine` needs and what a reader can recompute themselves.
    /*  What a Facet built on this band would charge right now, and the
        reading underneath it. A band is the one choice on the launch page
        with no obvious right answer, and picking it blind is picking it
        badly — so the number is available before the hook exists, computed
        by the same `Curve` the hook will use, from the same section.

        `arg` is not taken here: a page choosing a band has a token and two
        fees, not a packed word, and making it pack one just to ask a
        question is the sort of ABI work this site exists to remove.     */
    function band(uint256 token, uint24 floor_, uint24 ceiling_)
        external view
        returns (uint256 section, uint256 concentration, uint24 feeNow)
    {
        if (floor_ > ceiling_ || ceiling_ > Hook.MAX_FEE) revert BadBand();
        section = HUB.sectionOf(token);
        concentration = Curve.concentration(section);
        feeNow = uint24(uint256(floor_)
            + ((uint256(ceiling_) - uint256(floor_)) * concentration) / Curve.MAX_CONCENTRATION);
    }

    /// @notice The word `deployHook` wants for a Facet, built from the three
    ///         numbers a person actually chooses.
    /// @dev    Packing is the kind of off-by-eight a client gets wrong once
    ///         and silently — the token lands in the fee bits and the hook
    ///         prices a token nobody owns. `_recipe` unpacks exactly this.
    function facetArg(uint256 token, uint24 floor_, uint24 ceiling_)
        external pure returns (bytes32)
    {
        if (floor_ > ceiling_ || ceiling_ > Hook.MAX_FEE) revert BadBand();
        if (token > type(uint64).max) revert BadBand();
        return bytes32((token << 48) | (uint256(floor_) << 24) | uint256(ceiling_));
    }

    function recipeHash(uint8 kind, bytes32 arg)
        external view returns (bytes32 hash, uint16 flags)
    {
        bytes memory code;
        (code, flags) = _recipe(kind, arg);
        hash = keccak256(code);
    }

    /// @dev The catalogue. Kind 0 is the Gate — the header of `Gate.sol`
    ///      says why it is the one most launches want. Kind 1 is the Facet,
    ///      which is the only kind that ever sets a fee, and therefore the
    ///      only kind a dynamic-fee pool can be initialised with.
    function _recipe(uint8 kind, bytes32 arg)
        private view returns (bytes memory code, uint16 flags)
    {
        if (kind == 0) {
            return (
                abi.encodePacked(type(Gate).creationCode, abi.encode(
                    POOL_MANAGER,
                    uint64(uint256(arg) >> 64),      // trading opens
                    uint64(uint256(arg))             // liquidity unlocks
                )),
                uint16(Hook.BEFORE_REMOVE_LIQUIDITY | Hook.BEFORE_SWAP)
            );
        }
        /*  The fee this pool charges, read out of a token's own section on
            every swap. `arg` packs the token id and the band it may move
            inside — 64 bits of token, then floor and ceiling as 24 each,
            in hundredths of a basis point.                              */
        if (kind == 1) {
            return (
                abi.encodePacked(type(Facet).creationCode, abi.encode(
                    POOL_MANAGER,
                    HUB,
                    uint256(uint64(uint256(arg) >> 48)),   // which token
                    uint24(uint256(arg) >> 24),            // floor
                    uint24(uint256(arg))                   // ceiling
                )),
                uint16(Hook.BEFORE_INITIALIZE | Hook.BEFORE_SWAP)
            );
        }
        revert NothingToLaunch();
    }

}

/*═══════════════════ the shapes v4 hands a hook ═══════════════════*/

/*  Declared here, once, because a hook's callbacks are matched BY SELECTOR
    and a selector is the hash of the whole signature. Get one field's type
    wrong and the PoolManager calls a function this contract does not have —
    which, with no fallback, reverts every swap and every withdrawal on any
    pool that trusted it.

    `Currency` and `IHooks` in v4's own source are user-defined types
    wrapping `address`, and a user-defined value type ABI-encodes as the type
    it wraps — so `address` here produces byte-identical selectors. The
    `HookSignatures` test pins all of that against the strings.           */
struct PoolKey {
    address currency0;
    address currency1;
    uint24  fee;
    int24   tickSpacing;
    address hooks;
}

struct ModifyLiquidityParams {
    int24   tickLower;
    int24   tickUpper;
    int256  liquidityDelta;
    bytes32 salt;
}

struct SwapParams {
    bool    zeroForOne;
    int256  amountSpecified;
    uint160 sqrtPriceLimitX96;
}

/*───────────────────────────────────────────────────────────────────────────
  Gate — the one hook a launchpad actually needs

  Two promises every token launch makes and almost none of them can keep:

    "trading opens at <time>"   and   "liquidity is locked until <date>".

  Both are normally kept by a third-party locker holding the LP position, or
  by nothing at all. Under v4 they are kept by the pool: this hook holds
  `beforeSwap` and `beforeRemoveLiquidity`, and the PoolManager will not
  process either without asking it first.

  So the lock is not a promise about what somebody will do later. It is a
  pool that cannot pay the liquidity out, enforced by the same contract that
  would have paid it. And the two bits are readable off the hook's address
  before anyone buys, without trusting a word of this file.

  ── the half of that which is not reassuring ──

  **These are exactly the bits a trap has.** A hook that refuses withdrawals
  until Friday and a hook that refuses them forever have the same address
  shape, and no amount of reading the address distinguishes them. The page
  says so beside every hook it shows, this one included.

  What makes *this* hook safe is not the shape. It is that both timestamps
  are `immutable`, fixed at deployment, readable by anyone, and have no
  setter, no owner and no upgrade path — so the only thing that can open the
  gate is the clock, and the only thing that can keep it shut is the clock.
───────────────────────────────────────────────────────────────────────────*/
contract Gate {
    /// @notice The PoolManager, and the only address these callbacks accept.
    address public immutable MANAGER;
    /// @notice No swap goes through before this.
    uint64 public immutable OPENS;
    /// @notice No liquidity leaves before this.
    uint64 public immutable UNLOCKS;

    error NotTheManager();
    error NotOpenYet(uint64 opens);
    error StillLocked(uint64 unlocks);

    constructor(address manager, uint64 opens, uint64 unlocks) {
        MANAGER = manager;
        OPENS = opens;
        UNLOCKS = unlocks;
    }

    modifier onlyManager() {
        if (msg.sender != MANAGER) revert NotTheManager();
        _;
    }

    /*  Both arguments lists are ignored, deliberately. This hook's decision
        depends on the clock and nothing else — not on who is trading, not on
        how much, not on which pool. A hook that read more than it needs is a
        hook with more ways to be wrong, and every field it touches is a
        field whose layout it has to be right about.

        `beforeSwap` returns three values: the selector, a delta, and a fee
        override. Zero for the last two is "change nothing", which is the
        only honest thing for a hook that merely gates to say — a nonzero fee
        override on a pool that is not dynamic-fee reverts.              */

    function beforeSwap(
        address, PoolKey calldata, SwapParams calldata, bytes calldata
    ) external view onlyManager returns (bytes4, int256, uint24) {
        if (block.timestamp < OPENS) revert NotOpenYet(OPENS);
        return (Gate.beforeSwap.selector, int256(0), uint24(0));
    }

    function beforeRemoveLiquidity(
        address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata
    ) external view onlyManager returns (bytes4) {
        if (block.timestamp < UNLOCKS) revert StillLocked(UNLOCKS);
        return Gate.beforeRemoveLiquidity.selector;
    }

    /// @notice What the gate is doing right now, for a page to print.
    function status() external view returns (bool tradingOpen, bool liquidityFree) {
        return (block.timestamp >= OPENS, block.timestamp >= UNLOCKS);
    }
}
