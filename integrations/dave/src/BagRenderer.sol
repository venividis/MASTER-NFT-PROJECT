// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base64} from "solady/utils/Base64.sol";
import {LibString} from "solady/utils/LibString.sol";
import {IVaultViews} from "./lib/Interfaces.sol";
import {Tiers} from "./lib/Tiers.sol";

interface IHubR {
    function vaultOf(uint256 id) external view returns (address);
    function rankOf(uint256 id) external view returns (uint32);
}
interface IIcons { function iconOf(address t) external view returns (string memory glyph, uint16 hue); }
interface IKernelR { function version() external view returns (uint32); }

/// @title BagRenderer — the face that cannot lie.
/// @notice L0: a complete SVG certificate from pure chain state.
///         animation_url: a ~1.4KB bootloader that eth_calls the SiteKernel
///         and boots the full premises (Codicil III). Swappable only through
///         the 7-day lock; the certificate's claims are read, never written.
contract BagRenderer {
    using LibString for uint256;
    using LibString for uint32;

    address public immutable hub;
    address public immutable icons;
    address public immutable kernel;
    string  public constant RPC = "https://rpc.mainnet.chain.robinhood.com";

    constructor(address hub_, address icons_, address kernel_) {
        hub = hub_; icons = icons_; kernel = kernel_;
    }

    string constant INK   = "#0B1310";
    string constant PAPER = "#EFE7D2";
    string constant GREEN = "#1D4A38";
    string constant GOLD  = "#C8A63C";
    string constant RED   = "#8C2F2F";

    function tokenURI(uint256 id) external view returns (string memory) {
        IVaultViews v = IVaultViews(IHubR(hub).vaultOf(id));
        string memory svg = _svg(id, v);
        string memory boot = _bootloader(id);
        bytes memory json = abi.encodePacked(
            '{"name":"DAVE HELD ', _serial(id),
            '","description":"Certificate of Conviction. Sell the Dave, not the bags. The seal is bytecode; the face cannot lie.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)),
            '","animation_url":"data:text/html;base64,', Base64.encode(bytes(boot)),
            '",', _attrs(id, v), '}'
        );
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }

    // ─── serial: engraved rank once posted, else pending ──────────────
    function _serial(uint256 id) internal view returns (string memory) {
        uint32 r = IHubR(hub).rankOf(id);
        if (r == 0) return string(abi.encodePacked("No. ", _pad6(id), " (RANK PENDING)"));
        return string(abi.encodePacked("No. ", _pad6(r)));
    }
    function _pad6(uint256 n) internal pure returns (string memory) {
        bytes memory b = bytes(n.toString());
        while (b.length < 6) b = abi.encodePacked("0", b);
        return string(b);
    }

    function _tierName(uint8 t) internal pure returns (string memory) {
        return t == 3 ? "OBSIDIAN" : t == 2 ? "DIAMOND" : t == 1 ? "IRON" : "PAPER";
    }
    function _tierColor(uint8 t) internal pure returns (string memory) {
        return t == 3 ? "#3B2E58" : t == 2 ? "#A8D8DE" : t == 1 ? "#8A8F98" : "#C9BFA5";
    }

    // ─── the certificate ──────────────────────────────────────────────
    function _svg(uint256 id, IVaultViews v) internal view returns (string memory) {
        bool sealed_ = v.unlockAt() > block.timestamp;
        uint8 t = v.tier();
        string memory head = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 500" font-family="Georgia,serif">',
            '<rect width="360" height="500" fill="', PAPER, '"/>',
            '<rect x="10" y="10" width="340" height="480" fill="none" stroke="', GREEN, '" stroke-width="3"/>',
            '<rect x="17" y="17" width="326" height="466" fill="none" stroke="', GREEN, '" stroke-width="1"/>',
            '<text x="180" y="52" text-anchor="middle" font-size="24" letter-spacing="6" fill="', INK, '" font-weight="bold">DAVE HELD</text>',
            '<text x="180" y="72" text-anchor="middle" font-size="8" letter-spacing="3" fill="', GREEN, '">CERTIFICATE OF CONVICTION - CHAIN 4663</text>',
            '<text x="180" y="100" text-anchor="middle" font-size="15" letter-spacing="2" fill="', GOLD, '" font-weight="bold">', _serial(id), '</text>'
        ));
        string memory band = string(abi.encodePacked(
            '<rect x="30" y="115" width="300" height="26" fill="', _tierColor(t), '" opacity="0.85"/>',
            '<text x="180" y="132" text-anchor="middle" font-size="11" letter-spacing="4" fill="', INK, '" font-weight="bold">',
            sealed_ ? _tierName(t) : "UNSEALED",
            sealed_ ? string(abi.encodePacked(' SEAL - UNLOCKS T+', ((uint256(v.unlockAt()) - block.timestamp) / 1 days).toString(), 'D')) : "",
            '</text>'
        ));
        string memory bags = _bagRow(v);
        string memory ledger = string(abi.encodePacked(
            '<text x="34" y="380" font-size="9" letter-spacing="2" fill="', GREEN, '">CONVICTION ', (v.convictionLive() / 1 days).toString(), ' MULT-DAYS</text>',
            '<text x="34" y="398" font-size="9" letter-spacing="2" fill="', GREEN, '">TEMPER ', uint256(v.temper()).toString(), ' SEALS SERVED</text>',
            _stamps(v.paperHands()),
            '<text x="180" y="470" text-anchor="middle" font-size="7.5" letter-spacing="2" fill="', GREEN, '">SELL THE DAVE, NOT THE BAGS - THE BEARER HOLDS</text></svg>'
        ));
        return string(abi.encodePacked(head, band, bags, ledger));
    }

    function _bagRow(IVaultViews v) internal view returns (string memory out) {
        uint256 n = v.bagsLength(); if (n > 6) n = 6;
        out = string(abi.encodePacked(
            '<text x="34" y="170" font-size="8" letter-spacing="3" fill="', GREEN, '">SEALED CONTENTS</text>'));
        for (uint256 i; i < n; ++i) {
            address tk = v.bagAt(i);
            (string memory g, uint16 hue) = IIcons(icons).iconOf(tk);
            if (bytes(g).length == 0) { g = unicode"◆"; hue = uint16(uint160(tk) % 360); }
            uint256 y = 196 + i * 28;
            out = string(abi.encodePacked(out,
                '<circle cx="48" cy="', (y - 5).toString(), '" r="11" fill="hsl(', uint256(hue).toString(), ',55%,45%)"/>',
                '<text x="48" y="', (y - 1).toString(), '" text-anchor="middle" font-size="11" fill="', PAPER, '">', g, '</text>',
                '<text x="70" y="', y.toString(), '" font-size="10" letter-spacing="1" fill="', INK, '">', _amt(v.bagAmount(tk)), '</text>'
            ));
        }
        if (n == 0) out = string(abi.encodePacked(out,
            '<text x="34" y="196" font-size="9" fill="', GREEN, '" font-style="italic">the vault stands empty</text>'));
    }

    function _amt(uint256 raw) internal pure returns (string memory) {
        uint256 whole = raw / 1e18;
        if (whole >= 1_000_000) return string(abi.encodePacked((whole / 1_000_000).toString(), ".", ((whole % 1_000_000) / 100_000).toString(), "M"));
        if (whole >= 1_000) return string(abi.encodePacked((whole / 1_000).toString(), ".", ((whole % 1_000) / 100).toString(), "K"));
        return whole.toString();
    }

    function _stamps(uint32 ph) internal pure returns (string memory out) {
        if (ph == 0) return "";
        uint256 n = ph > 3 ? 3 : ph;
        for (uint256 i; i < n; ++i) {
            out = string(abi.encodePacked(out,
                '<g transform="rotate(-12 ', (250 + i * 30).toString(), ' 420)">',
                '<rect x="', (200 + i * 30).toString(), '" y="408" width="100" height="24" fill="none" stroke="', RED, '" stroke-width="2" opacity="0.8"/>',
                '<text x="', (250 + i * 30).toString(), '" y="424" text-anchor="middle" font-size="9" letter-spacing="1" fill="', RED, '" opacity="0.85">PAPER HANDS</text></g>'
            ));
        }
    }

    // ─── Codicil III bootloader: L0 inline, L1 kernel boot ────────────
    function _bootloader(uint256 id) internal view returns (string memory) {
        return string(abi.encodePacked(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
            '<style>body{margin:0;background:#0B1310;display:flex;align-items:center;justify-content:center;min-height:100vh}img{width:min(92vw,380px)}</style>',
            '</head><body><img id="l0" alt="DAVE HELD"/><script>',
            'var ID=', id.toString(), ',K="', LibString.toHexStringChecksummed(kernel), '",R="', RPC, '";',
            'var u=new URL(location.href);document.getElementById("l0").src=u.searchParams.get("img")||"";',
            'fetch(R,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_call",params:[{to:K,data:"0x9a3b6c14"},"latest"]})})',
            '.then(function(r){return r.json()}).then(function(j){',
            'var h=j.result;if(!h||h.length<130)return;',
            'var off=parseInt(h.slice(2,66),16)*2+2;var len=parseInt(h.slice(off,off+64),16)*2;var hex=h.slice(off+64,off+64+len);',
            'var s="";for(var i=0;i<hex.length;i+=2)s+=String.fromCharCode(parseInt(hex.substr(i,2),16));',
            'try{(new Function("ID",s))(ID)}catch(e){}',
            '}).catch(function(){});',
            '</script></body></html>'
        ));
    }

    // ─── attributes ───────────────────────────────────────────────────
    function _attrs(uint256 id, IVaultViews v) internal view returns (string memory) {
        uint32 r = IHubR(hub).rankOf(id);
        return string(abi.encodePacked(
            '"attributes":[',
            '{"trait_type":"Seal","value":"', v.unlockAt() > block.timestamp ? _tierName(v.tier()) : "UNSEALED", '"},',
            '{"trait_type":"Conviction (mult-days)","value":', (v.convictionLive() / 1 days).toString(), '},',
            '{"trait_type":"Temper","value":', uint256(v.temper()).toString(), '},',
            '{"trait_type":"Paper Hands","value":', uint256(v.paperHands()).toString(), '},',
            '{"trait_type":"Bags","value":', v.bagsLength().toString(), '},',
            '{"trait_type":"Rank","value":"', r == 0 ? "PENDING" : uint256(r).toString(), '"}]'
        ));
    }
}
