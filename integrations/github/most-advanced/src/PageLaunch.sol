// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {Web} from "./lib/Web.sol";
import {Hook} from "./lib/Hook.sol";
import {IChrome, IDesk, IVenue} from "./interfaces/Site.sol";

interface IDeskUni {
    function config() external view returns (string memory);
    function base() external pure returns (string memory);
}

interface IDeskLaunch {
    function launch() external pure returns (string memory);
}

interface IKiln {
    function POOL_MANAGER() external view returns (address);
    function coinCount() external view returns (uint256);
    function recent(uint256 from, uint256 count) external view returns (address[] memory);
    function launcher(address coin) external view returns (address);
    function launchedBy(address coin) external view returns (uint256);
    function launchedAt(address coin) external view returns (uint256);
}

/*───────────────────────────────────────────────────────────────────────────
  PageLaunch — a launchpad, and the one thing it can tell you that no
  hosted launchpad can

  A launch is four transactions: make a token, choose what may intercept its
  pool, create the pool, put liquidity in it. Everything a person would want
  to vary is a real parameter of one of those four, and this page exposes
  all of them rather than picking for you — supply and decimals, the split
  between pool and treasury, the starting price, the range, the fee tier or
  a dynamic fee, the tick spacing, and the hook.

  ── the hook, and why this page is worth having ──

  Uniswap v4 puts a hook's permissions in the low fourteen bits of its
  address. The PoolManager decides whether to call `beforeSwap` by testing
  one bit of the hook's own address — so the bits are not a description of
  the hook, they are the mechanism.

  Which means: **paste any hook address and this page tells you exactly what
  it will be allowed to do to you, with no call, no ABI, no source, and
  nothing its author can misstate.** A hook cannot claim not to intercept
  swaps while carrying the swap bit, because the bit is what causes the
  interception. That is a stronger guarantee than reading verified source,
  which tells you what the code says rather than what the pool will do.

  It cuts the other way too, and the page says so beside every hook it
  shows. A hook that can refuse withdrawals until Friday and a hook that can
  refuse them forever have **the same address shape**. The bits tell you the
  power exists. They cannot tell you it will be used kindly. Anyone who
  reads "liquidity locked" off an address and stops reading has learned the
  wrong half.

  ── what this page will not make ──

  Tokens with an owner. `Kiln.launch` produces a fixed supply with no mint,
  no pause, no blacklist and no upgrade path, and that is a deliberate limit
  rather than an omission: every one of those is a lever the deployer can
  pull against the people who bought. A launch that genuinely needs one
  needs a token this contract did not make — the pool step takes any address,
  so nothing here prevents it. It just will not carry this name.

  ── and what it cannot do ──

  Seed a v4 pool with liquidity. Creating one is reachable: `PoolKey` is five
  static fields, so `initialize` is six flat words. Adding liquidity goes
  through `modifyLiquidities(bytes,uint256)`, whose argument is a dynamic
  array of dynamic bytes with a decoder that rejects non-canonical encoding
  — and this client has no ABI coder. The page routes v4 liquidity nowhere
  rather than somewhere plausible, and says which step it stopped at.
───────────────────────────────────────────────────────────────────────────*/
contract PageLaunch {
    using LibNum for uint256;

    IChrome    public immutable CHROME;
    IDesk      public immutable DESK;
    IDeskUni   public immutable DESKU;
    IDeskLaunch public immutable DESKL;
    IVenue     public immutable VENUE;
    IKiln      public immutable KILN;

    uint256 public constant PAGE = 20;

    constructor(
        IChrome chrome, IDesk desk, IDeskUni deskU,
        IDeskLaunch deskL, IVenue venue, IKiln kiln
    ) {
        CHROME = chrome;
        DESK = desk;
        DESKU = deskU;
        DESKL = deskL;
        VENUE = venue;
        KILN = kiln;
    }

    /*═══════════════════ /launch ═══════════════════*/

    function launch() external view returns (string memory) {
        return string.concat(
            CHROME.head("IPSEITY \xc2\xb7 launch"),
            CHROME.navTop(15),
            DESKU.config(),
            _config(),
            _index(),
            CHROME.wallet(),
            DESK.core(),
            DESKU.base(),
            DESKL.launch(),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    /// @dev A second JSON block rather than an addition to the Uniswap one,
    ///      because the launchpad is this collection's own contract and the
    ///      other is a description of somebody else's. A reader checking one
    ///      against a block explorer should not have to separate them.
    function _config() private view returns (string memory) {
        return string.concat(
            "<script type=\"application/json\" id=\"K\">{",
            "\"kiln\":\"", LibNum.hexAddr(address(KILN)),
            "\",\"manager\":\"", LibNum.hexAddr(VENUE.POOL_MANAGER()),
            "\",\"v4\":", VENUE.hasV4() ? "true" : "false",
            ",\"wrapped\":\"", LibNum.hexAddr(VENUE.WRAPPED()),
            "\",\"dynamicFee\":", uint256(Hook.DYNAMIC_FEE).str(),
            ",\"maxFee\":", uint256(Hook.MAX_FEE).str(),
            ",\"gateFlags\":",
                uint256(Hook.BEFORE_REMOVE_LIQUIDITY | Hook.BEFORE_SWAP).str(),
            ",\"facetFlags\":",
                uint256(Hook.BEFORE_INITIALIZE | Hook.BEFORE_SWAP).str(),
            ",\"sel\":{",
            "\"launch\":\"", _sel("launch(uint256,string,string,uint8,uint256,bytes32)"),
            "\",\"coinAt\":\"",
                _sel("coinAt(address,string,string,uint8,uint256,bytes32)"),
            "\",\"mine\":\"", _sel("mine(bytes32,uint16,uint256,uint256)"),
            "\",\"recipeHash\":\"", _sel("recipeHash(uint8,bytes32)"),
            // the band's live reading, and the packing the client refuses to do
            "\",\"band\":\"", _sel("band(uint256,uint24,uint24)"),
            "\",\"facetArg\":\"", _sel("facetArg(uint256,uint24,uint24)"),
            "\",\"deployHook\":\"", _sel("deployHook(uint8,bytes32,bytes32)"),
            // six flat words: the five PoolKey fields then the price
            "\",\"initV4\":\"",
                _sel("initialize((address,address,uint24,int24,address),uint160)"),
            "\"}}</script>"
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

    /*═══════════════════ the form ═══════════════════*/

    function _index() private view returns (string memory) {
        return string.concat(
            "<h1>launch</h1>"
            "<p class=e>Four transactions, and every choice in front of them is a real "
            "parameter of one of the four. Nothing here is chosen for you and nothing "
            "is hidden behind a preset.</p>",
            _step1(), _step2(), _step3(),
            _inspector(),
            _recent(),
            _where()
        );
    }

    function _step1() private pure returns (string memory) {
        return
            "<h2>1 &middot; the token</h2>"
            "<div class=app>"
            "<div class=hd><b>Mint a supply</b></div>"
            "<label>launched as token # <span class=m>a token of this collection you "
            "hold &mdash; the launch is signed by it</span></label>"
            "<input id=ct placeholder=\"1\">"
            "<label>name</label><input id=cn placeholder=\"Example Coin\">"
            "<label>symbol</label><input id=cs placeholder=\"EXMPL\">"
            "<div class=two>"
            "<div><label>decimals</label><input id=cd value=\"18\"></div>"
            "<div><label>supply</label><input id=cv placeholder=\"1000000\"></div>"
            "</div>"
            "<input type=range id=cvR min=0 max=150 value=60 "
            "title=\"supply, on a log scale\">"
            "<label>salt <span class=m>any 32 bytes; changes the address, "
            "nothing else</span></label><input id=ck value=\"0x1\">"
            "<div class=det id=cpre></div>"
            "<button id=cchk>Where would it land?</button>"
            "<button class=go id=cgo>Mint it</button>"
            "<div id=s></div></div>"
            "<p class=e>Fixed supply, no mint, no pause, no blacklist, no owner, no "
            "upgrade path. The whole supply exists at deployment and goes to whoever "
            "sent the transaction. That is a limit on what this launchpad makes, not an "
            "oversight &mdash; each of those omissions is a lever a deployer could "
            "otherwise pull against the people who bought. If a launch needs one, it "
            "needs a token made elsewhere; step 3 takes any address.</p>"
            "<p class=e>The address is <code>CREATE2</code> and your own address is "
            "mixed into the salt, so it can be announced before it exists and cannot be "
            "taken by somebody re-sending your transaction with more gas.</p>";
    }

    function _step2() private view returns (string memory) {
        if (!VENUE.hasV4()) {
            return string.concat(
                "<h2>2 &middot; the hook</h2>"
                "<p class=w>No Uniswap v4 PoolManager is wired up on chain <code>",
                block.chainid.str(),
                "</code>, so there is nothing here for a hook to attach to. Hooks are a "
                "v4 mechanism and do not exist in v3 &mdash; a v3 pool has no callback "
                "surface at all. The rest of this page still works; step 3 will offer a "
                "v3 pool.</p>"
            );
        }
        return string.concat(
            "<h2>2 &middot; the hook</h2>",
            _hookProse(),
            "<div class=app>"
            "<div class=hd><b>Deploy a hook</b></div>"
            "<div><label>which one</label><select id=hk>"
            "<option value=\"0\">Gate &mdash; delays trading, locks liquidity</option>"
            "<option value=\"1\">Facet &mdash; the fee follows your solid</option>"
            "</select></div>"
            "<div id=hkg>"
            "<div class=two>"
            "<div><label>trading opens in (hours)</label><input id=ho value=\"0\">"
            "<input type=range id=hoR min=0 max=168 value=0 "
            "title=\"zero to one week\"></div>"
            "<div><label>liquidity locked for (days) <span class=m>up to ten "
            "years</span></label><input id=hl value=\"30\">"
            "<input type=range id=hlR min=0 max=3650 value=30 "
            "title=\"zero to ten years\"></div>"
            "</div>"
            "<div class=det id=hsum></div>"
            "</div>"
            "<div id=hkf style=\"display:none\">"
            "<div><label>the token whose section sets the fee</label>"
            "<input id=ft value=\"1\"></div>"
            "<div class=two>"
            "<div><label>fee at rest <span class=m>hundredths of a basis point; "
            "3000 is 0.30%</span></label><input id=ffl value=\"500\">"
            "<input type=range id=fflR min=0 max=600 value=270 "
            "title=\"nothing to one hundred per cent\"></div>"
            "<div><label>fee at the furthest cut</label><input id=fcl value=\"30000\">"
            "<input type=range id=fclR min=0 max=600 value=450 "
            "title=\"nothing to one hundred per cent\"></div>"
            "</div>"
            "<div class=det id=fsum></div>"
            "</div>"
            "<button id=hmine>Find an address</button>"
            "<div class=det id=hmined></div>"
            "<button class=go id=hgo disabled>Deploy it</button>"
            "<div id=s></div></div>",
            _mining()
        );
    }

    function _hookProse() private pure returns (string memory) {
        return
            "<p class=e>A hook is a contract the pool calls before or after the things "
            "it does. v4 decides which callbacks a hook receives by testing bits of the "
            "hook's own <em>address</em> &mdash; fourteen callbacks, the low fourteen "
            "bits &mdash; so a hook's powers are not a claim it makes, they are a "
            "property of where it lives.</p>"
            "<p class=e>Two are offered here, and they are not alternatives to each "
            "other so much as answers to different questions. Pick the one whose "
            "question you are actually asking.</p>"
            "<p class=e><b>The Facet</b> reads a token's four-dimensional section on "
            "every swap and charges a fee from it &mdash; at rest, the floor you set; "
            "at the furthest cut, the ceiling. You are not typing a number into a form, "
            "you are turning the artwork, and the pool follows because the artwork "
            "<em>is</em> the parameter. It only attaches to a dynamic-fee pool, and a "
            "dynamic-fee pool only works with a hook like it: v4 starts such a pool at "
            "zero and lets nothing but the hook move it, and a pool key cannot be "
            "edited afterwards. Choose one without the other and the pool is priced at "
            "nothing for ever &mdash; so this page will not let you.</p>"
            "<p class=e>The gate holds two of them. <code>beforeSwap</code> keeps "
            "trading shut until a time you set; <code>beforeRemoveLiquidity</code> keeps "
            "liquidity in until another. Both timestamps are fixed at deployment with no "
            "setter and no owner, so the only thing that opens the gate is the clock. "
            "That is what makes a lock a lock rather than a promise: the pool itself "
            "will not process the withdrawal.</p>"
            "<p class=e class=w><b>And the same two bits are what a trap looks like.</b> "
            "A hook that refuses withdrawals until Friday and a hook that refuses them "
            "forever are indistinguishable by address. The bits prove the power exists; "
            "nothing about them proves it will be used well. Read the hook, not just its "
            "address &mdash; the address only tells you what to look for.</p>";
    }

    function _mining() private pure returns (string memory) {
        return
            "<p class=e>Finding that address is the interesting part. To carry two "
            "specific bits out of fourteen, a hook has to be deployed at an address "
            "whose low fourteen bits match exactly &mdash; which means trying "
            "<code>CREATE2</code> salts until one lands, about sixteen thousand of them "
            "on average.</p>"
            "<p class=e>The client this collection ships has no keccak-256, on purpose. "
            "So the search is a <code>view</code> function on the launchpad, run by your "
            "own node under <code>eth_call</code>: it executes, returns the first salt "
            "that lands, and commits nothing. The expensive part of deploying a hook "
            "turns out to be a read, and reads are free. The button above asks for a "
            "window of candidates at a time and tells you how many it has tried.</p>";
    }

    function _step3() private view returns (string memory) {
        return string.concat(
            "<h2>3 &middot; the pool</h2>",
            VENUE.hasV4()
                ? "<p class=e>With a hook, the pool must be v4 &mdash; hooks do not "
                  "exist in v3. Creating one is <code>initialize</code> on the "
                  "PoolManager: the pool key is five fixed-size fields, so the whole "
                  "call is six flat words and this client can build it without an ABI "
                  "coder.</p>"
                : "<p class=e>This chain has v3 only, so the pool is a v3 pool and has "
                  "no hook.</p>",
            "<div class=app>"
            "<div class=hd><b>Create the pool</b></div>"
            "<label>paired with</label><input id=pq placeholder=\"0x\xe2\x80\xa6 the "
            "other token\">"
            "<div class=two>"
            "<div><label>fee <span class=m id=pfl>0.30%</span></label>"
            "<input id=pf value=\"3000\">"
            "<input type=range id=pfR min=0 max=600 value=348 "
            "title=\"hundredths of a basis point, on a log scale, up to 100%\">"
            "<label class=m style=\"display:block;margin-top:.3rem\">"
            "<input type=checkbox id=pfd style=\"width:auto;margin-right:.4rem\">"
            "dynamic &mdash; the hook sets it, per swap</label></div>"
            "<div><label>tick spacing <span class=m>1 is finest; v3 ties it to the "
            "fee, v4 lets you choose</span></label><input id=ps value=\"60\">"
            "<input type=range id=psR min=0 max=300 value=178 "
            "title=\"tick spacing, on a log scale\"></div></div>"
            "<label>starting price <span class=m>how many of the paired token one of "
            "yours is worth</span></label><input id=pp placeholder=\"0.0\">"
            "<div class=det id=psum></div>"
            "<button class=go id=pgo>Create it</button>"
            "<div id=s></div></div>",
            _step3Prose()
        );
    }

    function _step3Prose() private view returns (string memory) {
        return string.concat(
            "<p class=e>v4 lets you choose the tick spacing, which v3 does not &mdash; "
            "there the four fee tiers each come with a fixed one. Narrow spacing lets "
            "liquidity sit closer to the price and makes every position more precise; "
            "wide spacing is cheaper to cross. It is a real choice and there is no "
            "default that is right for every pair.</p>"
            "<p class=e>A fee of <code>", uint256(Hook.DYNAMIC_FEE).str(),
            "</code> marks the pool dynamic-fee: the key fixes no fee and the hook sets "
            "one per swap. Choosing it <em>without</em> a hook that returns a fee "
            "creates a pool nothing can ever price &mdash; the page will not let you, "
            "but it is worth knowing why.</p>"
            "<h2>4 &middot; the liquidity</h2>"
            "<p class=w>This is the step this page stops at, for v4. Adding liquidity "
            "goes through <code>modifyLiquidities(bytes,uint256)</code>, whose argument "
            "is a dynamic array of dynamic bytes behind a decoder that rejects any "
            "non-canonical encoding &mdash; and this client has no ABI coder. It could "
            "be built: the page contract has <code>abi.encode</code> and could hand the "
            "browser finished calldata to forward. It is not built yet, and until it is "
            "the page routes v4 liquidity nowhere rather than somewhere plausible.</p>"
            "<p class=e>So every launch finishes its liquidity on an interface you "
            "already trust with your positions &mdash; this site deliberately stopped "
            "carrying one. The pool exists either way, the hook is on it either way, "
            "and nothing about where the liquidity arrives from changes what the gate "
            "enforces.</p>"
        );
    }

    /*═══════════════════ reading a hook off its address ═══════════════════*/

    function _inspector() private pure returns (string memory) {
        return
            "<h2>what does this hook do?</h2>"
            "<p class=e>Paste any address. The answer is read from the address itself "
            "&mdash; no call, no ABI, no source, and nothing its author can misstate, "
            "because in v4 these bits are not a description of the hook, they are the "
            "mechanism that invokes it.</p>"
            "<div class=app style=\"padding:.9rem 1rem\">"
            "<label>a hook address</label><input id=hx placeholder=\"0x\xe2\x80\xa6\">"
            "<button class=go id=hxgo>Read it</button></div>";
    }

    /*═══════════════════ what has been launched ═══════════════════*/

    function _recent() private view returns (string memory) {
        uint256 n = KILN.coinCount();
        if (n == 0) {
            return "<h2>launched here</h2><p class=e>Nothing yet.</p>";
        }
        address[] memory list = KILN.recent(0, PAGE);
        string memory rows;
        for (uint256 i; i < list.length; ++i) {
            address c = list[i];
            string memory a = LibNum.hexAddr(c);
            rows = string.concat(
                rows,
                "<tr><td>", Web.esc(Web.symbolOf(c)), "</td>",
                "<td>", Web.esc(Web.nameOf(c)), "</td>",
                "<td>#", KILN.launchedBy(c).str(), "</td>",
                "<td><code class=coinaddr>", a, "</code></td>",
                "<td><button class=copy data-a=\"", a, "\">copy</button> ",
                "<button class=watch data-a=\"", a, "\" data-s=\"",
                Web.esc(Web.symbolOf(c)), "\" data-d=\"",
                uint256(Web.decimalsOf(c)).str(), "\">watch</button></td>",
                "</tr>"
            );
        }
        return string.concat(
            "<h2>launched here</h2>"
            "<p class=e>", n.str(), n == 1 ? " token" : " tokens",
            ", newest first, read from the launchpad's own list. Being on it means this "
            "contract deployed it and therefore that it has no owner and a fixed supply. "
            "It means nothing whatever about whether it is worth anything.</p>"
            "<table><tr><th>symbol</th><th>name</th><th>by</th><th>address</th><th></th></tr>",
            rows, "</table>"
        );
    }

    function _where() private view returns (string memory) {
        return string.concat(
            "<h2>where these transactions go</h2><dl>",
            "<dt>launchpad</dt><dd><code>", LibNum.hexAddr(address(KILN)), "</code>"
                "<span class=m>this collection's own contract &mdash; it deploys the "
                "token and the hook and has no other power over either</span></dd>",
            "<dt>pool manager</dt><dd><code>",
                LibNum.hexAddr(VENUE.POOL_MANAGER()), "</code>"
                "<span class=m>Uniswap v4, where the pool is created</span></dd>",
            "<dt>positions</dt><dd><code>", LibNum.hexAddr(VENUE.POSITIONS()), "</code>"
                "<span class=m>Uniswap v3. ",
                VENUE.hasV4()
                    ? "Not used on this chain &mdash; every launch here is v4, and the "
                      "line above says where its liquidity does not go"
                    : "Where a hookless launch seeds its liquidity",
                "</span></dd>",
            "</dl>"
            "<p class=e>Nothing here has been audited. A launchpad is a machine for "
            "making things other people put money into, and the only claims this one "
            "makes are the two it can enforce: the tokens it deploys have no owner, and "
            "a hook's address says which callbacks it receives. Everything else about "
            "any launch &mdash; whether the liquidity stays, whether the price means "
            "anything, whether the people behind it are honest &mdash; is not something "
            "a contract can tell you and this page does not pretend to.</p>"
        );
    }
}
