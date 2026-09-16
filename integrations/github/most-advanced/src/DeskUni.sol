// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {Web} from "./lib/Web.sol";
import {Assets} from "./lib/Assets.sol";
import {IPoolRead, IVenue} from "./interfaces/Site.sol";

/*───────────────────────────────────────────────────────────────────────────
  DeskUni — the Uniswap application, held as contract code

  `Desk` is the application for the collection's own markets. This is the
  application for everybody else's: the same client, the same discipline,
  pointed at Uniswap v3 instead of at `Pool`.

  ── the whole argument for building this at all ──

  Uniswap's interface is a React application served from a web server behind
  a domain name behind a registrar. The contracts underneath it are none of
  those things: they are on chain, permissionless, and equally callable by
  anybody. What the hosted app adds is a token list, a routing engine, a
  subgraph and a limit-order book — real work, all of it off chain.

  So the honest form of "use Uniswap's infrastructure with our own GUI" is
  not to reimplement the hosted parts badly. It is to serve, from contract
  code with no server anywhere, the parts that are genuinely on chain, and
  to say plainly which parts are not and what was done instead. Every page
  here does that at the bottom, in prose, next to the addresses.

  ── the selectors ──

  Every one is computed here from its own signature string. That is not
  ceremony. Two Uniswap routers have an `exactInputSingle`; their structs
  differ by one field; the wrong one does not revert, it shifts `recipient`
  and every amount by a word. Deriving each selector from the signature
  string of the contract it will be sent to, in the same contract that holds
  that contract's address, is what makes the pair checkable — a reader can
  hash the string themselves and compare.

  One more that is worth naming because it is a trap the ABI itself sets:
  QuoterV2's NatSpec comment lists its parameters in a different order from
  its struct declaration. The declaration is what the ABI encodes, so the
  signature here follows the declaration:

      quoteExactInputSingle((address,address,uint256,uint24,uint160))

  Hash the comment's order instead and you get a selector for a function
  that does not exist. Get the selector right but the words in the comment's
  order and you get a quote at fee = 1000000000 with no revert and a wrong
  number on the screen.

  ── what the browser still does not do ──

  No keccak, no ABI coder, no floating point for any amount. The client
  pads decimal text into words and concatenates. The two additions this
  side needed are a *signed* word — a tick is negative for most pairs, and
  a zero-padded -200 is 200, which mints a position in a range nobody chose
  — and a whitelist for tickers read off unvetted tokens, because a symbol
  the client reads is a symbol the client has to escape.
───────────────────────────────────────────────────────────────────────────*/
contract DeskUni {
    using LibNum for uint256;

    IVenue    public immutable VENUE;
    IPoolRead public immutable POOL;

    /// @dev How many of the collection's markets are read to build the
    ///      offered-asset list. A bound, because reading every one of them
    ///      in a single `eth_call` is a call no node will finish — and the
    ///      page says what it looked at rather than implying it looked at
    ///      everything.
    uint256 public constant SCAN = 32;

    constructor(IVenue venue, IPoolRead pool) {
        VENUE = venue;
        POOL = pool;
    }

    /*═══════════════════ the data the app runs on ═══════════════════*/

    /// @notice The config block every Uniswap page carries.
    /// @dev    Emitted under the same id as `Desk.config`, so one shared
    ///         client bootstraps both. The market client keys off `D.pool`
    ///         and this one off `D.uni`, and neither is present on the
    ///         other's page, so each no-ops where it does not belong.
    function config() external view returns (string memory) {
        return string.concat(
            "<script type=\"application/json\" id=\"D\">{",
            "\"chain\":", block.chainid.str(),
            ",\"uni\":{",
            "\"venue\":\"", LibNum.hexAddr(address(VENUE)),
            "\",\"factory\":\"", LibNum.hexAddr(VENUE.FACTORY()),
            "\",\"quoter\":\"", LibNum.hexAddr(VENUE.QUOTER()),
            "\",\"router\":\"", LibNum.hexAddr(VENUE.ROUTER()),
            "\",\"kind\":", uint256(VENUE.ROUTER_KIND()).str(),
            ",\"positions\":\"", LibNum.hexAddr(VENUE.POSITIONS()),
            "\",\"governor\":\"", LibNum.hexAddr(VENUE.GOVERNOR()),
            "\",\"gov\":\"", LibNum.hexAddr(VENUE.GOV_TOKEN()),
            "\",\"wrapped\":", _asset(VENUE.WRAPPED()),
            ",\"tiers\":", _tiers(),
            ",\"assets\":", _assets(),
            ",\"sel\":", selectors(),
            "}}</script>"
        );
    }

    function _asset(address t) private view returns (string memory) {
        return string.concat(
            "{\"a\":\"", LibNum.hexAddr(t),
            "\",\"s\":\"", t == address(0) ? "?" : Web.symbolOfJson(t),
            "\",\"d\":", uint256(Web.decimalsOf(t)).str(), "}"
        );
    }

    /// @dev Tiers and their spacings together, and the spacing read from the
    ///      factory rather than assumed. Three tiers are enabled by the v3
    ///      factory's constructor; the 0.01% one exists only where somebody
    ///      later turned it on. A page offering to create a pool at a tier
    ///      this chain has never enabled is offering a transaction that
    ///      reverts, so a zero spacing here means the page does not offer it.
    function _tiers() private view returns (string memory) {
        uint24[4] memory t = VENUE.tiers();
        int24[4] memory sp = VENUE.spacings();
        string memory out = "[";
        for (uint256 i; i < 4; ++i) {
            out = string.concat(
                out, i == 0 ? "" : ",",
                "{\"fee\":", uint256(t[i]).str(),
                ",\"sp\":", sp[i] < 0 ? "0" : uint256(uint24(sp[i])).str(), "}"
            );
        }
        return string.concat(out, "]");
    }

    /*  The offered assets: the chain's wrapped native token, then every
        ERC-20 that a market in this collection actually trades.

        This is the whole of the token list, and it is short. See
        `lib/Assets.sol` for why that is the honest shape rather than an
        apology — nothing here appears because somebody put it on a list,
        and anything not here can still be pasted in and is then checked
        against the venue that would fill the trade.                     */
    function _assets() private view returns (string memory) {
        (address[] memory list,) = Assets.derive(POOL, 0, SCAN);
        address w = VENUE.WRAPPED();
        string memory out = w == address(0) ? "[" : string.concat("[", _asset(w));
        bool first = w == address(0);
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == w) continue;
            out = string.concat(out, first ? "" : ",", _asset(list[i]));
            first = false;
        }
        return string.concat(out, "]");
    }

    /*═══════════════════ every selector, from its own signature ═══════════════════*/

    function selectors() public pure returns (string memory) {
        return string.concat("{", _selErc(), ",", _selPool(), ",", _selSwap(),
                             ",", _selPos(), ",", _selVenue(), ",", _selCivic(), "}");
    }

    /*  This collection's own reader.

        Everything here is arithmetic the browser must not do: turning a tick
        into the price it actually means, and snapping a tick a person chose
        onto the grid the pool will accept. The client picks a tick with a
        logarithm in double precision, which is fine — a tick is a choice,
        and being one out is being 0.01% out. It then asks these what that
        choice is worth and shows *that* number, so nobody is told their
        order fills at the price they typed when it fills at the nearest
        tick to it.                                                        */
    function _selVenue() private pure returns (string memory) {
        return string.concat(
            "\"vState\":\"", _sel("state(address)"),
            "\",\"vBest\":\"", _sel("best(address,address,uint8)"),
            "\",\"vPoolAt\":\"", _sel("poolAt(address,address,uint24)"),
            "\",\"vHistory\":\"", _sel("history(address,uint32,uint8)"),
            "\",\"vPriceAt\":\"", _sel("priceAt(int24,uint256,bool)"),
            "\",\"vSqrtAt\":\"", _sel("sqrtAt(int24)"),
            "\",\"vUsable\":\"", _sel("usable(int24,int24)"), "\""
        );
    }

    /// @dev ERC-20, and the two reads whose answer is a string. A token that
    ///      answers `symbol()` in `bytes32` rather than `string` — the MKR
    ///      generation — is decoded by the client, which is why it needs a
    ///      length-free path as well as a length-prefixed one.
    function _selErc() private pure returns (string memory) {
        return string.concat(
            "\"approve\":\"", _sel("approve(address,uint256)"),
            "\",\"allowance\":\"", _sel("allowance(address,address)"),
            "\",\"balanceOf\":\"", _sel("balanceOf(address)"),
            "\",\"symbol\":\"", _sel("symbol()"),
            "\",\"decimals\":\"", _sel("decimals()"),
            "\",\"totalSupply\":\"", _sel("totalSupply()"), "\""
        );
    }

    function _selPool() private pure returns (string memory) {
        return string.concat(
            "\"getPool\":\"", _sel("getPool(address,address,uint24)"),
            "\",\"spacingOf\":\"", _sel("feeAmountTickSpacing(uint24)"),
            "\",\"slot0\":\"", _sel("slot0()"),
            "\",\"liq\":\"", _sel("liquidity()"),
            "\",\"t0\":\"", _sel("token0()"),
            "\",\"t1\":\"", _sel("token1()"),
            "\",\"poolFee\":\"", _sel("fee()"),
            "\",\"poolFactory\":\"", _sel("factory()"),
            "\",\"observe\":\"", _sel("observe(uint32[])"),
            "\",\"grow\":\"", _sel("increaseObservationCardinalityNext(uint16)"), "\""
        );
    }

    /*  Both routers, both shapes, side by side and named for the router each
        belongs to. The client picks by `kind`, which came from the same
        contract as the address.                                          */
    function _selSwap() private pure returns (string memory) {
        return string.concat(
            "\"swapV3\":\"",
            _sel("exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))"),
            "\",\"swap02\":\"",
            _sel("exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))"),
            // the struct declaration's order, NOT the NatSpec comment's
            "\",\"quote\":\"",
            _sel("quoteExactInputSingle((address,address,uint256,uint24,uint160))"), "\""
        );
    }

    function _selPos() private pure returns (string memory) {
        return string.concat(
            "\"mint\":\"",
            _sel("mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))"),
            "\",\"initPool\":\"",
            _sel("createAndInitializePoolIfNecessary(address,address,uint24,uint160)"),
            "\",\"positions\":\"", _sel("positions(uint256)"),
            "\",\"inc\":\"", _sel("increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))"),
            "\",\"dec\":\"", _sel("decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))"),
            "\",\"collect\":\"", _sel("collect((uint256,address,uint128,uint128))"),
            "\",\"burn\":\"", _sel("burn(uint256)"),
            "\",\"ofOwner\":\"", _sel("tokenOfOwnerByIndex(address,uint256)"), "\""
        );
    }

    function _selCivic() private pure returns (string memory) {
        return string.concat(
            "\"vDeposit\":\"", _sel("deposit(uint256,address)"),
            "\",\"vRedeem\":\"", _sel("redeem(uint256,address,address)"),
            "\",\"vAsset\":\"", _sel("asset()"),
            "\",\"vTotal\":\"", _sel("totalAssets()"),
            "\",\"vToAssets\":\"", _sel("convertToAssets(uint256)"),
            "\",\"vMaxRedeem\":\"", _sel("maxRedeem(address)"),
            "\",\"vPreview\":\"", _sel("previewDeposit(uint256)"),
            "\",\"castVote\":\"", _sel("castVote(uint256,uint8)"),
            "\",\"proposals\":\"", _sel("proposals(uint256)"),
            "\",\"pState\":\"", _sel("state(uint256)"),
            "\",\"pCount\":\"", _sel("proposalCount()"),
            "\",\"quorum\":\"", _sel("quorumVotes()"),
            "\",\"receipt\":\"", _sel("getReceipt(uint256,address)"),
            "\",\"delegate\":\"", _sel("delegate(address)"),
            "\",\"delegates\":\"", _sel("delegates(address)"),
            "\",\"votes\":\"", _sel("getCurrentVotes(address)"), "\""
        );
    }

    function _sel(string memory sig) private pure returns (string memory) {
        bytes4 x = bytes4(keccak256(bytes(sig)));
        bytes memory hexd = "0123456789abcdef";
        bytes memory o = new bytes(10);
        o[0] = "0"; o[1] = "x";
        for (uint256 i; i < 4; ++i) {
            o[2 + i * 2] = hexd[uint8(x[i]) >> 4];
            o[3 + i * 2] = hexd[uint8(x[i]) & 0x0f];
        }
        return string(o);
    }

    /*═══════════════════ the clients ═══════════════════*/

    /// @notice Shared by every Uniswap page: resolving a token, finding its
    ///         pools, and switching chains.
    function base() external pure returns (string memory) {
        return string.concat("<script>", BASE_JS, "</script>");
    }

    /*───────────────────────────────────────────────────────────────────────

      Resolving a token, and finding out whether it can actually be traded.

      This is the part a hosted token list was standing in for, done against
      the chain instead. Paste an address and the page asks it what it is,
      then asks the factory whether a pool exists at each of the four fee
      tiers, then asks each of those pools how much liquidity is sitting at
      the current tick. What comes back is not a name somebody put on a
      list. It is whether the trade will fill and at what depth.

    ───────────────────────────────────────────────────────────────────────*/
    string internal constant BASE_JS =
        "window.UNI=(()=>{const I=window.IP;if(!I)return null;"
        "const D=I.D,U=D&&D.uni;if(!U)return null;"
        "const S=U.sel,K={};"
        "(U.assets||[]).forEach(t=>{if(t&&t.a)K[t.a.toLowerCase()]=t});"
        "if(U.wrapped&&U.wrapped.a)K[U.wrapped.a.toLowerCase()]=U.wrapped;"
        // an address is a token when it says so; a name is what it calls
        // itself, run through the whitelist, never trusted for anything
        // but display
        "const meta=async a=>{a=String(a||'').trim().toLowerCase();"
        "if(!/^0x[0-9a-f]{40}$/.test(a))throw new Error('not an address');"
        "if(K[a])return K[a];"
        "const d=await I.tryCall(a,S.decimals);"
        "if(!d)throw new Error('that address does not answer decimals() \\u2014 it is not an ERC-20');"
        "const n=Number(I.word(d,0));"
        "if(!(n>=0&&n<=36))throw new Error('that token reports '+n+' decimals, which cannot be right');"
        "const s=await I.tryCall(a,S.symbol);"
        "const t={a:a,s:I.TK(s?I.STR(s):'',a),d:n,pasted:1};K[a]=t;return t};"
        // every pool for a pair, deepest first. Zero from getPool means no
        // pool, and calling into it anyway is the mistake that turns "there
        // is no market" into an unexplained revert.
        "const pools=async(x,y)=>{const out=[];"
        "if(!x||!y||x.a===y.a||!U.factory)return out;"
        "for(const t of U.tiers){"
        "const r=await I.tryCall(U.factory,S.getPool+I.AD(x.a)+I.AD(y.a)+I.W(t.fee));"
        "if(!r)continue;const p='0x'+String(r).slice(26,66);"
        "if(/^0x0*$/.test(p))continue;"
        "const l=await I.tryCall(p,S.liq);"
        "out.push({fee:t.fee,sp:t.sp,pool:p,liq:l?I.word(l,0):0n})}"
        "out.sort((a,b)=>a.liq<b.liq?1:a.liq>b.liq?-1:0);return out};"
        // slot0, unpacked. Word 1 is the tick and it is signed.
        "const slot0=async p=>{const r=await I.tryCall(p,S.slot0);if(!r)return null;"
        "return{sqrt:I.word(r,0),tick:Number(I.SW(I.word(r,1))),card:Number(I.word(r,3))}};"
        // a <select> of the offered assets plus a paste box, wired together
        "const picker=(sel,box,onPick)=>{const e=I.$(sel),b=I.$(box);if(!e)return;"
        "const fire=async()=>{try{"
        "const v=e.value==='?'?String(b&&b.value||''):e.value;"
        "if(b)b.hidden=e.value!=='?';"
        "if(e.value==='?'&&!v)return onPick(null);"
        "onPick(await meta(v))}catch(x){I.say(String(x&&x.message||x),'no');onPick(null)}};"
        "e.addEventListener('change',fire);if(b)b.addEventListener('change',fire);"
        "return fire};"
        // EIP-3326, and EIP-3085 when the wallet has never heard of the chain
        "const goChain=async(id,add)=>{const p=I.pv();if(!p)throw new Error('no wallet found');"
        "const hex='0x'+BigInt(id).toString(16);"
        "try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:hex}]})}"
        "catch(e){if(e&&e.code===4902&&add)"
        "await p.request({method:'wallet_addEthereumChain',params:[add]});else throw e}};"
        "return{U:U,S:S,K:K,meta:meta,pools:pools,slot0:slot0,picker:picker,goChain:goChain}"
        "})();";

}
