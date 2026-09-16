// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "./lib/Base64.sol";
import {LibNum} from "./lib/LibNum.sol";
import {Section, TokenView} from "./lib/Types.sol";
import {Engine} from "./Engine.sol";
import {Sigil} from "./Sigil.sol";

/*═══════════════════════════════════════════════════════════════════════════

  RENDERER — everything a marketplace is ever handed

  Three faces, per ERC-7160, and the holder pins whichever one the market
  shows:

    0  The instrument   the living document, with the token's state written
                        into the gap between its head and its body
    1  The sigil        the whole solid, projected and still — no script,
                        no animation, nothing to run
    2  The quartet      four elevations of the same solid, along x, y, z
                        and w

  Face 1 exists because face 0 is a quarter of a megabyte of base64 and
  some clients will not touch that. A token that becomes invisible when a
  client is cautious is not really on chain.

═══════════════════════════════════════════════════════════════════════════*/
contract Renderer {
    using LibNum for uint256;

    Engine public immutable engine;
    Sigil  public immutable sigil;

    /// @dev Only used when the engine holds gzip rather than plain text.
    ///      DecompressionStream has been in every shipping browser since
    ///      2023; it is part of the platform, not a library, so using it
    ///      fetches nothing.
    ///
    ///      The loader declares nothing in global scope, and that is not
    ///      tidiness. document.open() clears the document but keeps the
    ///      Window, and a lexical declaration made before the write is
    ///      still there after it - so a `const D` here and a `const D`
    ///      anywhere at the top level of the document being written are
    ///      the same binding, and the write throws before a pixel is
    ///      drawn. The engine is minified, and a minifier hands out short
    ///      top-level names; the collision is not hypothetical. Both
    ///      halves of the payload arrive on one property instead, and the
    ///      property is deleted as soon as it has been read.
    string internal constant INFLATE =
        '<script>(async()=>{try{'
        'const[S,D]=self.$IPSE;delete self.$IPSE;'
        'const b=Uint8Array.from(atob(D),c=>c.charCodeAt(0));'
        'const t=await new Response(new Blob([b]).stream()'
        '.pipeThrough(new DecompressionStream("gzip"))).text();'
        'const i=t.indexOf("</head>");'
        'document.open();document.write(i<0?t:t.slice(0,i)+S+t.slice(i));document.close();'
        '}catch(e){document.body.innerHTML='
        '"<pre style=\\"color:#8b95ad;font:12px monospace;padding:24px;line-height:1.7\\">'
        'IPSEITY could not inflate itself in this browser.\\n\\n"+e+"</pre>";}})()</script>';

    constructor(Engine engine_, Sigil sigil_) {
        engine = engine_;
        sigil = sigil_;
    }

    /*───────────────────── facets ─────────────────────*/

    function facetCount() external pure returns (uint256) {
        return 3;
    }

    function facetURI(TokenView calldata v, uint256 index)
        external view returns (string memory)
    {
        if (index == 1) return _still(v);
        if (index == 2) return _quartet(v);
        return _instrument(v);
    }

    /*───────────────────── 0 · the instrument ─────────────────────*/

    /// @notice The complete page, byte for byte, with this token's state
    ///         written into the gap between the head and the body.
    function document(TokenView memory v) public view returns (bytes memory) {
        bytes memory state = _state(v);
        if (engine.compressed()) {
            // the shards hold gzip; hand the browser its own inflater
            return abi.encodePacked(
                engine.headBytes(),
                "<script>self.$IPSE=[", _quote(state), ",\"",
                Base64.encode(engine.bodyBytes()), "\"];</script>",
                INFLATE
            );
        }
        return abi.encodePacked(engine.headBytes(), state, engine.bodyBytes());
    }

    function _state(TokenView memory v) internal view returns (bytes memory) {
        return abi.encodePacked("<script>window.IPSE={", _who(v), _form(v), "}</script>");
    }

    function _who(TokenView memory v) private view returns (bytes memory) {
        return abi.encodePacked(
            'id:', v.id.str(),
            ',collection:"', LibNum.hexAddr(v.collection),
            '",chainId:', block.chainid.str(),
            ',owner:"', LibNum.hexAddr(v.owner),
            '",account:"', LibNum.hexAddr(v.boundAccount),
            '",grip:"', LibNum.hexAddr(v.grip),
            '",reachImpl:"', LibNum.hexAddr(v.reachImpl),
            '",gripImpl:"', LibNum.hexAddr(v.gripImpl),
            '",pool:"', LibNum.hexAddr(v.pool),
            '",seed:"', LibNum.hex32(v.seed), '"'
        );
    }

    function _form(TokenView memory v) private view returns (bytes memory) {
        uint256 w = v.word;
        return abi.encodePacked(
            ',word:"', w.str(),
            '",rot:[', _rot(w), ']',
            ',w:', uint256(Section.offsetW(w)).str(),
            ',form:', uint256(Section.form(w)).str(),
            ',hue:', uint256(Section.hue(w)).str(),
            ',ops:', uint256(v.ops).str(),
            ',strata:', uint256(v.strata).str(),
            ',xfers:', uint256(v.xfers).str(),
            ',open:', uint256(v.open).str(),
            ',locked:', v.locked ? "1" : "0",
            ',block:', block.number.str(),
            ',depth:0,rpc:""'
        );
    }

    function _rot(uint256 w) internal pure returns (bytes memory out) {
        for (uint256 i; i < 6; ++i) {
            out = abi.encodePacked(out, i == 0 ? "" : ",", uint256(Section.angle(w, i)).str());
        }
    }

    /// @dev A JavaScript string literal holding the state script, for the
    ///      compressed path — the only characters that can appear are from
    ///      the fixed template above plus hex and digits, but the closing
    ///      tag still has to be broken so the outer parser does not eat it.
    function _quote(bytes memory s) internal pure returns (bytes memory out) {
        out = "\"";
        for (uint256 i; i < s.length; ++i) {
            bytes1 c = s[i];
            if (c == '"') out = abi.encodePacked(out, "\\\"");
            else if (c == "\\") out = abi.encodePacked(out, "\\\\");
            else if (c == "<") out = abi.encodePacked(out, "\\x3c");
            else out = abi.encodePacked(out, c);
        }
        out = abi.encodePacked(out, "\"");
    }

    function _instrument(TokenView memory v) internal view returns (string memory) {
        return _json(v, abi.encodePacked(
            '"animation_url":"data:text/html;base64,',
              Base64.encode(document(v)), '",',
            '"image":"data:image/svg+xml;base64,',
              Base64.encode(sigil.svg(v.id, v.word, v.seed, v.strata)), '",'
        ), 0);
    }

    function _still(TokenView memory v) internal view returns (string memory) {
        return _json(v, abi.encodePacked(
            '"image":"data:image/svg+xml;base64,',
              Base64.encode(sigil.svg(v.id, v.word, v.seed, v.strata)), '",'
        ), 1);
    }

    function _quartet(TokenView memory v) internal view returns (string memory) {
        return _json(v, abi.encodePacked(
            '"image":"data:image/svg+xml;base64,',
              Base64.encode(sigil.quartet(v.id, v.word, v.seed)), '",'
        ), 2);
    }

    /*───────────────────── the JSON ─────────────────────*/

    string internal constant DESCRIPTION =
        "What you are looking at is a three-dimensional section of a four-dimensional solid. "
        "The solid is never on screen; only the 3-space that currently cuts through it. "
        "The orientation of that cut - six plane angles, a position along w, which solid, and "
        "the colour the interface takes from it - is one 256-bit word in this contract's storage.\\n\\n"
        "tokenURI returns the instrument for editing that word. It is a WebGL2 engine, a keccak-256, "
        "an ABI coder and a wallet client, held in this chain's state as contract bytecode. It reads "
        "this contract, encodes its own calldata, and signs transactions - including transactions "
        "against this token, which change what it renders the next time anyone opens it. It can also "
        "open itself, inside itself, one section deeper, until the plane runs out of room.\\n\\n"
        "The still image is the complement of the animation: the whole solid, projected on chain from "
        "the same word, all of it at once and none of it somewhere you could stand.\\n\\n"
        "Nothing is fetched. No IPFS, no gateway, no CDN, no font, no library.";

    function _json(TokenView memory v, bytes memory media, uint256 facet)
        internal view returns (string memory)
    {
        string[3] memory faceName = ["The instrument", "The sigil", "The quartet"];
        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(abi.encodePacked(
                '{"name":"IPSEITY #', v.id.str(),
                  facet == 0 ? "" : string(abi.encodePacked(" - ", faceName[facet])), '",',
                '"description":"', DESCRIPTION, '",',
                media,
                '"attributes":', _attributes(v),
                '}'
            ))
        ));
    }

    function _attributes(TokenView memory v) internal view returns (bytes memory) {
        uint256 w = v.word;
        uint8 f = Section.form(w);
        return abi.encodePacked(
            '[',
              _trait("Solid", sigil.solidName(f)),
              ',', _trait("Notation", sigil.solidNotation(f)),
              ',', _trait("Turned through w", _turnedThroughW(w)),
              ',', _num("Hue", uint256(Section.hue(w))),
              ',', _num("Section w", uint256(Section.offsetW(w))),
              ',', _num("Strata", uint256(v.strata)),
              ',', _num("Operations", uint256(v.ops)),
              ',', _num("Transfers", uint256(v.xfers)),
              ',', _numMax("Nodes open", _popcount(v.open), 12),
              ',', _trait("Reach", LibNum.hexAddr(v.boundAccount)),
              ',', _trait("Grip", LibNum.hexAddr(v.grip)),
              ',', _trait("Bound", v.locked ? "yes" : "no"),
              // "sealed" would have been a lie on a kernel the token has
              // already outrun: a plain transfer leaves the payload
              // encrypted to whoever held it before, and a buyer reading a
              // marketplace trait is exactly who needs told
              ',', _trait("Kernel", _kernelWord(v.kernel)),
            ']'
        );
    }

    function _kernelWord(uint8 k) private pure returns (string memory) {
        if (k == 0) return "none";
        if (k == 1) return "current";
        return "stale";
    }

    /// @dev How far the solid has been turned out of the holder's own
    ///      3-space — the sum of the three angles that contain w. This is
    ///      the trait that has no analogue in a three-dimensional work.
    function _turnedThroughW(uint256 w) internal pure returns (string memory) {
        uint256 t;
        for (uint256 p = 3; p < 6; ++p) {
            uint256 a = uint256(Section.angle(w, p));
            t += a > 32768 ? 65536 - a : a;       // distance from rest, either way
        }
        if (t < 6000)  return "barely";
        if (t < 24000) return "partly";
        if (t < 56000) return "far";
        return "nearly edge on";
    }

    function _trait(string memory k, string memory val) internal pure returns (bytes memory) {
        return abi.encodePacked('{"trait_type":"', k, '","value":"', val, '"}');
    }

    function _num(string memory k, uint256 val) internal pure returns (bytes memory) {
        return abi.encodePacked('{"trait_type":"', k, '","value":', val.str(), "}");
    }

    function _numMax(string memory k, uint256 val, uint256 max) internal pure returns (bytes memory) {
        return abi.encodePacked(
            '{"trait_type":"', k, '","value":', val.str(), ',"max_value":', max.str(), "}");
    }

    function _popcount(uint16 x) internal pure returns (uint256 n) {
        unchecked { while (x != 0) { n += x & 1; x >>= 1; } }
    }

    /*───────────────────── the collection · ERC-7572 ─────────────────────*/

    function collectionURI(address collection, uint256 supply, uint256 ceiling)
        external view returns (string memory)
    {
        collection;   // the collection speaks for itself; there is no site to link to
        (uint256 h, uint256 b) = engine.sizes();
        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(abi.encodePacked(
                '{"name":"IPSEITY",',
                '"description":"', ceiling.str(),
                  " four-dimensional solids, and the instrument for turning them, are the same token. ",
                  "The engine that draws them - ", (h + b).str(),
                  engine.compressed()
                    ? " bytes of gzip, inflated by the browser's own decompressor"
                    : " bytes of HTML",
                  " - is held in this chain's state as contract bytecode and returned by tokenURI. ",
                  "Nothing is fetched.\\",'n\\n',
                  supply.str(), " of ", ceiling.str(), " issued.\",",
                '"image":"data:image/svg+xml;base64,', Base64.encode(_mark()), '",',
                '"banner_image":"data:image/svg+xml;base64,', Base64.encode(_mark()), '",',
                '"collaborators":[]}'
            ))
        ));
    }

    function _mark() internal pure returns (bytes memory) {
        return abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">',
            '<rect width="1000" height="1000" fill="#04050a"/>',
            '<g fill="none" stroke="#ffc46b" stroke-width="1.6" opacity=".9">',
            '<rect x="330" y="330" width="340" height="340"/>',
            '<rect x="420" y="420" width="160" height="160"/>',
            '<path d="M330 330 420 420M670 330 580 420M670 670 580 580M330 670 420 580"/></g>',
            '<circle cx="500" cy="500" r="404" fill="none" stroke="#212838"/>',
            '<text x="500" y="906" text-anchor="middle" font-family="ui-monospace,Menlo,monospace"',
            ' font-size="26" letter-spacing="16" fill="#8b95ad">IPSEITY</text></svg>'
        );
    }

    /*───────────────────── the traits · ERC-7496 ─────────────────────*/

    function traitMetadataURI() external pure returns (string memory) {
        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(bytes(
                '{"traits":{'
                '"solid":{"displayName":"Solid","dataType":{"type":"string",'
                  '"acceptableValues":["Tesseract","Hexadecachoron","Icositetrachoron","Duocylinder",'
                  '"Clifford torus","Tiger","Ditorus","Quaternion Julia"]}},'
                '"hue":{"displayName":"Hue","dataType":{"type":"decimal","signed":false,"decimals":0,'
                  '"minValue":"0","maxValue":"255"}},'
                '"w":{"displayName":"Section along w","dataType":{"type":"decimal","signed":false,'
                  '"decimals":0,"minValue":"0","maxValue":"65535"}},'
                '"strata":{"displayName":"Strata","dataType":{"type":"decimal","signed":false,"decimals":0}},'
                '"ops":{"displayName":"Operations","dataType":{"type":"decimal","signed":false,"decimals":0}},'
                '"xfers":{"displayName":"Transfers","dataType":{"type":"decimal","signed":false,"decimals":0}},'
                '"nodes":{"displayName":"Nodes open","dataType":{"type":"decimal","signed":false,'
                  '"decimals":0,"minValue":"0","maxValue":"12"}},'
                '"locked":{"displayName":"Bound","dataType":{"type":"decimal","signed":false,'
                  '"decimals":0,"minValue":"0","maxValue":"1"}},'
                '"kernel":{"displayName":"Sealed kernel","dataType":{"type":"decimal","signed":false,'
                  '"decimals":0,"minValue":"0","maxValue":"1"}},'
                '"section":{"displayName":"Section word","dataType":{"type":"string"}}'
                "}}"
            ))
        ));
    }
}
