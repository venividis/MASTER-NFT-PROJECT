// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHub, IRendererDoc, ISigilDraw, IChrome} from "./interfaces/Site.sol";
import {LibNum} from "./lib/LibNum.sol";
import {TokenView} from "./lib/Types.sol";

interface IPageDoor {
    function door() external view returns (string memory);
}

interface IPageToken {
    function token(uint256 id) external view returns (string memory);
    function faces(uint256 id) external view returns (string memory);
}

interface IPageMarket {
    function market(uint256 id) external view returns (string memory);
    function open(uint256 page) external view returns (string memory);
}

interface IPageTalk {
    function chat() external view returns (string memory);
    function dm(uint256 other) external view returns (string memory);
}

interface IPageRooms {
    function rooms() external view returns (string memory);
    function room(uint256 index) external view returns (string memory);
}

interface IPagePool {
    function pool(uint256 id) external view returns (string memory);
}

interface IPageTerminal { function terminal() external view returns (string memory); }
interface IPageSwap     { function swap() external view returns (string memory); }
interface IPageGallery  { function gallery(uint256 page) external view returns (string memory); }
interface IPageLaunch   { function launch() external view returns (string memory); }
interface IPageLock     { function lockPage() external view returns (string memory); }
interface IPageHook     { function hook(address at) external view returns (string memory); }
interface IPageCast     { function cast() external view returns (string memory); }
interface IPageSeal     { function sealPage() external view returns (string memory); }
interface IPageKeys     { function keys() external view returns (string memory); }
interface IPageName     { function namePage() external view returns (string memory); }
interface IPageEstate   { function estatePage() external view returns (string memory); }
interface IPageKey      { function keyPage(uint256 id, address k) external view returns (string memory); }

/*  The console. One route where nineteen were, so this is the only page
    interface here that takes a verb: `/c/<id>/hand` is a real address you
    can send somebody, and it opens on the thing they need rather than on a
    front door they then have to navigate out of.                        */
interface IConsole {
    function doc(uint256 id, uint8 verb) external view returns (string memory);
    function verbOf(string memory word) external pure returns (uint8);
}

interface IPageServices {
    function rent(uint256 id) external view returns (string memory);
    function vault(uint256 id) external view returns (string memory);
}

interface IPageManifest {
    function token(uint256 id) external view returns (string memory);
    function index(uint256 page) external view returns (string memory);
}

/*═══════════════════════════════════════════════════════════════════════════

  THE FRONT DOOR

  Every token in this collection is already a website. `tokenURI` returns a
  complete WebGL2 application with a keccak, an ABI coder and a wallet
  client inside it, held in contract code and handed back as a `data:` URI.
  Nothing is fetched. That part was never the problem.

  What was missing is a place a stranger can stand. Not to look at the
  artwork — the artwork can be looked at without help — but to see that each
  of these objects runs an exchange, rents itself out, holds a vault nobody
  can empty, and draws any four-dimensional form it is handed, and then to
  actually use one of those without asking anybody's permission.

  ── the line this contract will not cross ──

  **Premises never serves the artwork through a page contract.** `/raw` and
  `/live` are handled here, in this file, from the hub and the renderer
  directly. Every other route delegates to a page contract, and every page
  contract is an immutable constructor argument.

  That split is the whole safety argument. The pages are the mutable-ish
  part of the system in the only sense that matters — replacing them means
  deploying a new Premises and pointing a name at it — and they are exactly
  the routes where being wrong is cosmetic. The two routes where being wrong
  would mean serving someone else's bytes as the artwork do not touch them.

  Even so, the honest claim is narrow: a compromised front door controls
  pages that link to and frame the artwork, and cannot alter one byte of the
  artwork itself, because it does not hold those bytes. If this contract is
  never deployed, every token renders. If it is abandoned, every token
  renders. If it is replaced, every token renders identically.

  ── ERC-5219: the contract is the origin ──

  `request(resource, params)` is an HTTP handler written in Solidity. An
  ERC-4804 / ERC-6860 client reaches it over `web3://` with no DNS:

      /                          the door: connect, and what you hold opens
      /terminal                  every function, one line at a time
      /swap                      any ERC-20 with a pool, against the chain's Uniswap v3
      /gallery  /gallery/<p>     the whole collection, wearing its stills
      /launch                    a v4 launchpad: token, hook, pool
      /hook/<address>            what a hook's address already says
      /lock                      the vault: tokens in, a date, no early exit
      /projector                 the 4-D renderer, free for anyone
      /seal                      the three seals: soulbind, account, kernel
      /keys                      session keys: scoped, expiring permissions
      /k/<id>/<key>              a granted key's own door: envelope + one act
      /name                      an ENS name, bound to a token
      /chat                      the commons: one room, every token in it
      /rooms                     the groups this token has entered
      /room/<n>                  one group, numbered from 1
      /dm/<id>                   the room two tokens share
      /open  /open/<n>           every market that exists, from the pool's own list
      /services.json  /services.json/<n>    the same, for a program
      /token/<id>                one token's counter
      /token/<id>/live           the instrument, on a real origin
      /token/<id>/raw            that token's tokenURI, plain
      /token/<id>/face/<n>       one ERC-7160 face, plain
      /token/<id>/sigil.svg      the still, as an image
      /token/<id>/faces          what the three faces are
      /token/<id>/market         the swap card
      /token/<id>/pool           the holder's side: inventory, fee, bond, curve
      /token/<id>/rent           lease the instrument by the day
      /token/<id>/vault          the two hands, give, draw, verify
      /token/<id>/services.json  everything above, machine-readable

  A name resolves to this address through ERC-6821: the `contentcontract`
  TEXT record on the ENS resolver, holding either a plain `0x…` address or
  an ERC-3770 chain-scoped one like `eth:0x…`. If that record is unset the
  client falls back to the name's ordinary ERC-137 `addr()`. It is
  deliberately *not* `contenthash` — 6821 chose a human-readable text record
  over a codec nobody can read off a block explorer.

  An HTTP gateway is a convenience for everyone else,
  and a convenience is exactly what it should be: when the gateway is down
  the tokens are unaffected, which is the property a hostname compiled into
  bytecode can never have.

═══════════════════════════════════════════════════════════════════════════*/
contract Premises {
    IHub          public immutable HUB;
    IChrome       public immutable CHROME;
    IPageDoor     public immutable P_DOOR;
    IPageToken    public immutable P_TOKEN;
    IPageMarket   public immutable P_MARKET;
    IPagePool     public immutable P_POOL;
    IPageServices public immutable P_SERVICES;
    IPageManifest public immutable P_MANIFEST;
    IPageTalk     public immutable P_TALK;
    IPageRooms    public immutable P_ROOMS;
    IPageTerminal public immutable P_TERMINAL;
    IPageSwap     public immutable P_SWAP;
    IPageGallery  public immutable P_GALLERY;
    IPageLaunch   public immutable P_LAUNCH;
    IPageLock     public immutable P_LOCK;
    IPageHook     public immutable P_HOOK;
    IPageCast     public immutable P_CAST;
    IPageSeal     public immutable P_SEAL;
    IPageKeys     public immutable P_KEYS;
    IPageName     public immutable P_NAME;
    IPageEstate   public immutable P_ESTATE;
    IConsole      public immutable P_CONSOLE;
    IPageKey      public immutable P_KEY;

    struct KeyValue { string key; string value; }

    string private constant HTML = "text/html; charset=utf-8";
    string private constant TEXT = "text/plain; charset=utf-8";
    string private constant JSON = "application/json";
    string private constant SVG  = "image/svg+xml";

    /// @dev Short, because half of what this site reports is a live balance
    ///      and a cached market is a market that quotes last minute's price.
    string private constant CACHE = "public, max-age=15";

    struct Pages {
        IPageDoor door; IPageToken token; IPageMarket market; IPagePool pool;
        IPageServices services; IPageManifest manifest; IPageTalk talk;
        IPageRooms rooms; IPageTerminal terminal; IPageSwap swap;
        IPageGallery gallery; IPageLaunch launch; IPageLock lock;
        IPageHook hook; IPageCast cast; IPageSeal seal; IPageKeys keys;
        IPageName name; IPageEstate estate;
        IConsole console;
        /*  Named keyDoor, not key: `keys` above is the holder's granting
            page, and this is the granted key's own door — two surfaces,
            two names, or somebody wires one where the other goes.       */
        IPageKey keyDoor;
    }

    /// @dev Seventeen flat addresses is past what even viaIR keeps on a
    ///      stack; a named struct is the same calldata, one memory pointer.
    constructor(IHub hub, IChrome chrome, Pages memory p) {
        HUB = hub;
        CHROME = chrome;
        P_DOOR = p.door;
        P_TOKEN = p.token;
        P_MARKET = p.market;
        P_POOL = p.pool;
        P_SERVICES = p.services;
        P_MANIFEST = p.manifest;
        P_TALK = p.talk;
        P_ROOMS = p.rooms;
        P_TERMINAL = p.terminal;
        P_SWAP = p.swap;
        P_GALLERY = p.gallery;
        P_LAUNCH = p.launch;
        P_LOCK = p.lock;
        P_HOOK = p.hook;
        P_CAST = p.cast;
        P_SEAL = p.seal;
        P_KEYS = p.keys;
        P_NAME = p.name;
        P_ESTATE = p.estate;
        P_CONSOLE = p.console;
        P_KEY = p.keyDoor;
    }

    /*═══════════════════ ERC-6860 ═══════════════════*/

    /// @notice Declares that this contract answers in ERC-5219 mode.
    /// @dev    Not optional, and its absence is silent. ERC-6860 resolves
    ///         the mode by calling this and treating a revert as "auto" —
    ///         and in auto mode `web3://<addr>/` is an empty call to a
    ///         contract with no fallback, and `web3://<addr>/token/1` is a
    ///         call to a method named `token` taking a uint256. Neither
    ///         exists here, so both revert.
    ///
    ///         Without these four bytes the whole claim in the header —
    ///         that a name pointed here resolves natively in any
    ///         web3://-aware client — is false, and the site is reachable
    ///         only from a gateway that happens to hard-code ERC-5219 for
    ///         this address. Which is a server, which is the thing this
    ///         contract exists not to need.
    function resolveMode() external pure returns (bytes32) {
        return "5219";
    }

    /*═══════════════════ ERC-5219 ═══════════════════*/

    function request(string[] memory resource, KeyValue[] memory params)
        external view
        returns (uint16 statusCode, string memory body, KeyValue[] memory headers)
    {
        params;   // no query parameters are read; the path is the whole API

        /*  One resource, one URL. A trailing slash arrives as an empty last
            segment, so `/token/1/` is dropped to `/token/1` rather than
            404ing while `/token/1` succeeds; and past that, a leaf handler
            that ignores whatever follows it would serve the same page at
            unboundedly many addresses. Every response carries a
            Cache-Control, so "the same page at any URL you like" is an
            invitation to fill a gateway's cache with distinct entries for
            one document until the real ones are evicted.                 */
        uint256 n = resource.length;
        if (n > 0 && bytes(resource[n - 1]).length == 0) --n;

        /*  The front page is the instrument itself.

            For a long time this answered with a page *about* the
            collection, and the artwork was a link on it. That is the
            wrong way round: the token is the interface, and a visitor who
            clicks a link to an NFT should arrive at the NFT. So the root
            serves the live instrument for the collection's first token,
            and the flat pages — which are still the way to do everything
            a form does better than an orbit — sit behind its doors and at
            `/door`.

            Before the first mint there is no token to render, so the flat
            page answers instead. A door with nothing behind it is worse
            than a door that says so.                                   */
        if (n == 0) {
            if (HUB.totalSupply() == 0) {
                return (200, P_DOOR.door(), _headers(HTML));
            }
            return (
                200,
                string(IRendererDoc(HUB.renderer()).document(HUB.viewOf(1))),
                _headers(HTML)
            );
        }

        if (_eq(resource[0], "door")) {
            if (n != 1) return _notFound();
            return (200, P_DOOR.door(), _headers(HTML));
        }

        /*───── where the tokens talk ─────*/

        if (_eq(resource[0], "chat")) {
            if (n != 1) return _notFound();
            return (200, P_TALK.chat(), _headers(HTML));
        }

        if (_eq(resource[0], "rooms")) {
            if (n != 1) return _notFound();
            return (200, P_ROOMS.rooms(), _headers(HTML));
        }

        /*  A group is numbered, so its URL is short. `stateOf` on a number
            nobody has founded returns a room of kind 0, and the page says
            so — which is a 200 describing an absence rather than a 404,
            because "there is no room 9 yet" is a true answer about a room
            that can exist tomorrow.                                      */
        if (_eq(resource[0], "room")) {
            if (n != 2) return _notFound();
            (bool okR, uint256 index) = _toUint(resource[1]);
            if (!okR || index == 0) return _notFound();
            return (200, P_ROOMS.room(index), _headers(HTML));
        }

        /*  A pair room is not founded and has no number of its own — it is
            derived from two token ids, and this contract only knows one of
            them. The page is about the far side; the client supplies the
            near side once a wallet has said which token it is.           */
        if (_eq(resource[0], "dm")) {
            if (n != 2) return _notFound();
            (bool okD, uint256 other) = _toUint(resource[1]);
            if (!okD || !_exists(other)) return _notFound();
            return (200, P_TALK.dm(other), _headers(HTML));
        }

        /*───── the tabs ─────*/

        if (_eq(resource[0], "terminal")) {
            if (n != 1) return _notFound();
            return (200, P_TERMINAL.terminal(), _headers(HTML));
        }

        if (_eq(resource[0], "swap")) {
            if (n != 1) return _notFound();
            return (200, P_SWAP.swap(), _headers(HTML));
        }

        if (_eq(resource[0], "gallery")) {
            if (n > 2) return _notFound();
            uint256 page;
            if (n == 2) {
                (bool okG, uint256 v) = _toUint(resource[1]);
                if (!okG) return _notFound();
                page = v;
            }
            return (200, P_GALLERY.gallery(page), _headers(HTML));
        }

        if (_eq(resource[0], "launch")) {
            if (n != 1) return _notFound();
            return (200, P_LAUNCH.launch(), _headers(HTML));
        }

        if (_eq(resource[0], "lock")) {
            if (n != 1) return _notFound();
            return (200, P_LOCK.lockPage(), _headers(HTML));
        }

        if (_eq(resource[0], "projector")) {
            if (n != 1) return _notFound();
            return (200, P_CAST.cast(), _headers(HTML));
        }

        if (_eq(resource[0], "seal")) {
            if (n != 1) return _notFound();
            return (200, P_SEAL.sealPage(), _headers(HTML));
        }

        if (_eq(resource[0], "keys")) {
            if (n != 1) return _notFound();
            return (200, P_KEYS.keys(), _headers(HTML));
        }

        if (_eq(resource[0], "name")) {
            if (n != 1) return _notFound();
            return (200, P_NAME.namePage(), _headers(HTML));
        }

        if (_eq(resource[0], "estate")) {
            if (n != 1) return _notFound();
            return (200, P_ESTATE.estatePage(), _headers(HTML));
        }

        /*═══════════════ the console ═══════════════*/

        /*  `/c`, `/c/<id>`, `/c/<id>/<verb>`. One human route, so it does
            not have to distinguish itself from anything, and short because
            a phone's address bar truncates and `/c/2049/hand` fits whole.

            Every state of the console is a real URL. That is not a
            convenience: it is what makes a walk into somebody else's token
            a thing you can send to them rather than a thing that only
            exists inside one tab's history.                            */
        if (_eq(resource[0], "c")) {
            if (n == 1) {
                uint256 first = HUB.FIRST_ID();
                if (HUB.totalSupply() == 0) return _notFound();
                return (200, P_CONSOLE.doc(first, 0), _headers(HTML));
            }
            (bool okC, uint256 cid) = _toUint(resource[1]);
            if (!okC || !_exists(cid)) return _notFound();
            if (n == 2) return (200, P_CONSOLE.doc(cid, 0), _headers(HTML));
            if (n != 3) return _notFound();
            /*  An unknown verb is not a 404. The id resolved, the token is
                real, and the console opens on it with nothing expanded —
                which is what a person who mistyped one word wanted, and
                strictly better than being told the token does not exist. */
            return (200, P_CONSOLE.doc(cid, P_CONSOLE.verbOf(resource[2])), _headers(HTML));
        }

        if (_eq(resource[0], "k")) {
            /*  /k/<id>/<key> — the session key's own front door, the one
                surface where the actor is not the holder. The id is in the
                path because a bare key cannot find the account that
                granted it without an indexer; whoever hands out a key
                hands out this address with it. Exactly three segments —
                the pair IS the page.                                     */
            if (n != 3) return _notFound();
            (bool okI, uint256 kid) = _toUint(resource[1]);
            if (!okI || !_exists(kid)) return _notFound();
            (bool okK, address kAddr, bool kCanon) = _toAddr(resource[2]);
            if (!okK) return _notFound();
            if (!kCanon) {
                return _moved(string.concat("/k/", resource[1], "/", LibNum.hexAddr(kAddr)));
            }
            return (200, P_KEY.keyPage(kid, kAddr), _headers(HTML));
        }

        if (_eq(resource[0], "hook")) {
            if (n > 2) return _notFound();
            address subject;
            if (n == 2) {
                (bool okA, address v, bool canon) = _toAddr(resource[1]);
                if (!okA) return _notFound();
                /*  One resource, one URL — so one spelling. An address
                    pasted from a block explorer is EIP-55 mixed case and is
                    a perfectly good address; it is just not this document's
                    address. Sent there rather than refused.              */
                if (!canon) {
                    return _moved(string.concat("/hook/", LibNum.hexAddr(v)));
                }
                subject = v;
            }
            return (200, P_HOOK.hook(subject), _headers(HTML));
        }

        /*───── collection-wide ─────*/

        if (_eq(resource[0], "open")) {
            if (n > 2) return _notFound();
            uint256 page;
            if (n == 2) {
                (bool ok, uint256 v) = _toUint(resource[1]);
                if (!ok) return _notFound();
                page = v;
            }
            return (200, P_MARKET.open(page), _headers(HTML));
        }

        if (_eq(resource[0], "services.json")) {
            if (n > 2) return _notFound();
            uint256 page;
            if (n == 2) {
                (bool ok, uint256 v) = _toUint(resource[1]);
                if (!ok) return _notFound();
                page = v;
            }
            return (200, P_MANIFEST.index(page), _headers(JSON));
        }

        /*───── one token ─────*/

        if (!_eq(resource[0], "token")) return _notFound();
        if (n < 2) return _notFound();

        (bool valid, uint256 id) = _toUint(resource[1]);
        if (!valid || !_exists(id)) return _notFound();

        if (n == 2) return (200, P_TOKEN.token(id), _headers(HTML));

        string memory leaf = resource[2];

        /*  `face` is the only route that takes a fourth segment, and it
            *requires* one — the gate has to be an exact length per leaf
            rather than "three, or four if it is face", because the latter
            lets `/token/1/face` through to read `resource[3]` and panic.
            A 404 and an out-of-bounds panic look nothing alike to a
            client: one is an answer, the other is a broken origin.     */
        if (_eq(leaf, "face")) {
            if (n != 4) return _notFound();
        } else if (n != 3) {
            return _notFound();
        }

        /*  The two routes that hand over the artwork itself. Answered here,
            from the hub and the renderer, so that no page contract sits on
            the path between a viewer and the bytes they came for.       */

        if (_eq(leaf, "raw")) {
            return (200, HUB.tokenURI(id), _headers(TEXT));
        }

        /*  /live exists for one specific reason and it is not aesthetics. A
            `data:` document gets an opaque origin, and wallet extensions do
            not inject into one — so an instrument embedded in a frame
            renders perfectly and cannot connect to anything. It can be
            looked at and not used. Served here it has a real origin under
            `web3://`, EIP-6963 discovery works, and the instruments do what
            they were built to do.

            The bytes are `Renderer.document(...)` — exactly what `tokenURI`
            base64s, one step earlier, read from the same renderer the token
            itself uses. Nothing is stored here.                          */
        if (_eq(leaf, "live")) {
            return (
                200,
                string(IRendererDoc(HUB.renderer()).document(HUB.viewOf(id))),
                _headers(HTML)
            );
        }

        /*  The still, as an image rather than as a page.

            The counter page used to embed the whole instrument in an
            iframe, and measuring it said what prose had not: 21M gas of
            `eth_call` for the shopfront, against 0.2M for every other
            service page — to show a preview that a viewer cannot use,
            because a `data:` frame has an opaque origin and no wallet will
            inject into it. Strictly worse on both axes than the link
            beside it.

            An asset is its own request. The page costs what a page costs,
            the picture costs what a picture costs, and a browser that
            wants both makes two calls instead of one that no cautious node
            will run.                                                     */
        if (_eq(leaf, "sigil.svg")) {
            address sig = IRendererDoc(HUB.renderer()).sigil();
            if (sig == address(0)) return _notFound();
            TokenView memory v = HUB.viewOf(id);
            return (
                200,
                string(ISigilDraw(sig).svg(v.id, v.word, v.seed, v.strata)),
                _headers(SVG)
            );
        }

        /*  One ERC-7160 face, unwrapped. Also answered here: a face is the
            artwork too, just a different one.                            */
        if (_eq(leaf, "face")) {
            (bool okf, uint256 face) = _toUint(resource[3]);
            if (!okf) return _notFound();
            /*  `tokenURIAt` reverts BadIndex past the last face, and a
                revert is not an answer. Asking for face 9 of 3 is the same
                kind of mistake as asking for token 9999, and deserves the
                same reply.                                              */
            if (face >= IRendererDoc(HUB.renderer()).facetCount()) return _notFound();
            return (200, HUB.tokenURIAt(id, face), _headers(TEXT));
        }

        /*───── the counter ─────*/

        if (_eq(leaf, "faces"))         return (200, P_TOKEN.faces(id),      _headers(HTML));
        if (_eq(leaf, "market"))        return (200, P_MARKET.market(id),    _headers(HTML));
        if (_eq(leaf, "pool"))          return (200, P_POOL.pool(id),        _headers(HTML));
        if (_eq(leaf, "rent"))          return (200, P_SERVICES.rent(id),    _headers(HTML));
        if (_eq(leaf, "vault"))         return (200, P_SERVICES.vault(id),   _headers(HTML));
        if (_eq(leaf, "services.json")) return (200, P_MANIFEST.token(id),   _headers(JSON));

        return _notFound();
    }

    /*═══════════════════ answers that are not pages ═══════════════════*/

    /// @dev A 404 rather than a revert. A client asking for nonsense
    ///      deserves an answer, and the path is never echoed back — the one
    ///      thing on this page an attacker could have chosen is the one
    ///      thing that would be rendered.

    /// @dev 42 characters of hex to an address, refusing anything else.
    /// @return ok    whether it parsed at all
    /// @return a     the address
    /// @return canon whether it was written the one way this site writes it:
    ///               lower-case `0x`, lower-case digits. Anything else is a
    ///               different URL for the same document, and gets a 301.
    function _toAddr(string memory s)
        private pure returns (bool ok, address a, bool canon)
    {
        bytes memory b = bytes(s);
        if (b.length != 42 || b[0] != "0") return (false, address(0), false);
        if (b[1] != "x" && b[1] != "X") return (false, address(0), false);
        canon = b[1] == "x";
        uint256 v;
        for (uint256 i = 2; i < 42; ++i) {
            uint8 ch = uint8(b[i]);
            uint256 d;
            if (ch >= 0x30 && ch <= 0x39) d = ch - 0x30;
            else if (ch >= 0x61 && ch <= 0x66) d = ch - 0x61 + 10;
            else if (ch >= 0x41 && ch <= 0x46) { d = ch - 0x41 + 10; canon = false; }
            else return (false, address(0), false);
            v = v * 16 + d;
        }
        return (true, address(uint160(v)), canon);
    }

    /// @dev A 301 to the canonical spelling. Cached hard, because where a
    ///      resource lives does not change and a gateway that re-asked on
    ///      every request would have turned a de-duplication into a second
    ///      round trip.
    function _moved(string memory to)
        private pure returns (uint16, string memory, KeyValue[] memory)
    {
        KeyValue[] memory h = new KeyValue[](3);
        h[0] = KeyValue("Content-Type", HTML);
        h[1] = KeyValue("Cache-Control", "public, max-age=86400");
        h[2] = KeyValue("Location", to);
        return (
            301,
            string.concat(
                "<!doctype html><meta charset=utf-8><title>moved</title>"
                "<body style=\"background:#07080c;color:#8b95ad;"
                "font:14px ui-monospace,monospace;padding:3rem\">"
                "<p>That is the right address, written a different way.</p>"
                "<p><a style=\"color:#7fd4ff\" href=\"", to, "\">", to, "</a></p>"),
            h
        );
    }

    function _notFound() private pure returns (uint16, string memory, KeyValue[] memory) {
        return (
            404,
            "<!doctype html><meta charset=utf-8><title>no such section</title>"
            "<body style=\"background:#07080c;color:#8b95ad;font:14px ui-monospace,monospace;padding:3rem\">"
            "<p>There is nothing at that address of the collection.</p>"
            "<p><a style=\"color:#7fd4ff\" href=\"/\">back to the index</a></p>",
            _headers(HTML)
        );
    }

    function _headers(string memory contentType) private pure returns (KeyValue[] memory h) {
        h = new KeyValue[](2);
        h[0] = KeyValue("Content-Type", contentType);
        h[1] = KeyValue("Cache-Control", CACHE);
    }

    /*═══════════════════ small things ═══════════════════*/

    function _exists(uint256 id) private view returns (bool) {
        (bool ok, bytes memory out) =
            address(HUB).staticcall(abi.encodeWithSelector(IHub.ownerOf.selector, id));
        return ok && out.length >= 32 && abi.decode(out, (address)) != address(0);
    }

    function _eq(string memory a, string memory b) private pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    /// @dev A path segment is text. Anything that is not a plain decimal
    ///      number is not an index, and saying so is a 404 rather than a
    ///      revert.
    ///
    ///      A leading zero is refused, so `/token/0000000001` is not a
    ///      second address for token 1. The pager links and the manifest's
    ///      `next` both assume there is one canonical URL per resource,
    ///      and a caching layer in front of this contract assumes it much
    ///      more strongly than they do.
    function _toUint(string memory s) private pure returns (bool ok, uint256 v) {
        bytes memory b = bytes(s);
        if (b.length == 0 || b.length > 10) return (false, 0);
        if (b.length > 1 && b[0] == "0") return (false, 0);
        for (uint256 i; i < b.length; ++i) {
            uint8 ch = uint8(b[i]);
            if (ch < 0x30 || ch > 0x39) return (false, 0);
            v = v * 10 + (ch - 0x30);
        }
        return (true, v);
    }
}
