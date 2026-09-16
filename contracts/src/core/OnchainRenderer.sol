// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "../lib/Base64.sol";
import {Strings} from "../lib/Strings.sol";
import {IOrganismRenderSource, OrganismRenderData} from "../interfaces/Interfaces.sol";

/// @notice Fully onchain, animated SVG renderer. No IPFS, HTTP, gateway, or mutable server.
contract OnchainRenderer {
    using Strings for uint256;
    using Strings for address;
    using Strings for bytes32;

    function render(address collection, uint256 tokenId) external view virtual returns (string memory) {
        OrganismRenderData memory being = IOrganismRenderSource(collection).renderSnapshot(tokenId);
        string memory svg = _svg(being);
        string memory encodedSvg = Base64.encode(bytes(svg));

        bytes memory json = abi.encodePacked(
            '{"name":"i dont fucking believe it! #',
            tokenId.toString(),
            '","description":"An owner-controlled digital organism rendered from live onchain state. Memory roots are public commitments; payload privacy depends on encryption. Optional sovereign actions depend on the configured proof authority.",',
            '"image":"data:image/svg+xml;base64,',
            encodedSvg,
            '","animation_url":"data:image/svg+xml;base64,',
            encodedSvg,
            '","background_color":"05050a","attributes":[',
            _trait("Mode", being.sovereign ? "SOVEREIGN" : "BOUND"),
            ',',
            _numberTrait("Generation", being.generation),
            ',',
            _numberTrait("Evolutions", being.evolutions),
            ',',
            _numberTrait("Actions", being.actionNonce),
            ',',
            _numberTrait("Parent", being.parentId),
            ',',
            _trait("Account", being.account.toHexString()),
            ',',
            _trait("State Root", being.stateRoot.toHexString()),
            ',',
            _trait("Audit Root", being.auditRoot.toHexString()),
            ']}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    function _svg(OrganismRenderData memory being) internal pure returns (string memory) {
        string memory c0 = _color(being.seed, 0);
        string memory c1 = _color(being.genome, 3);
        string memory c2 = _color(being.stateRoot, 6);
        string memory c3 = _color(being.auditRoot, 9);
        string memory rings;

        for (uint256 i = 0; i < 9; ++i) {
            uint256 radius = 92 + (i * 38) + (uint8(being.genome[i]) % 23);
            uint256 dash = 8 + (uint8(being.stateRoot[31 - i]) % 34);
            uint256 gap = 7 + (uint8(being.auditRoot[i]) % 29);
            uint256 duration = 11 + (uint8(being.seed[31 - i]) % 31);
            string memory stroke = i % 3 == 0 ? c0 : (i % 3 == 1 ? c1 : c2);
            rings = string.concat(
                rings,
                '<circle r="',
                radius.toString(),
                '" fill="none" stroke="',
                stroke,
                '" stroke-width="',
                (1 + (i % 4)).toString(),
                '" stroke-opacity="0.',
                (3 + (i % 7)).toString(),
                '" stroke-dasharray="',
                dash.toString(),
                ' ',
                gap.toString(),
                '"><animateTransform attributeName="transform" type="rotate" from="0" to="',
                i % 2 == 0 ? "360" : "-360",
                '" dur="',
                duration.toString(),
                's" repeatCount="indefinite"/></circle>'
            );
        }

        string memory mode = being.sovereign ? "SOVEREIGN / PROOF-ONLY" : "BOUND / HUMAN-GUIDED";
        string memory sovereignAura = being.sovereign
            ? string.concat(
                '<circle r="445" fill="none" stroke="',
                c3,
                '" stroke-width="5" stroke-dasharray="2 17" opacity=".9"><animate attributeName="stroke-dashoffset" from="0" to="-190" dur="8s" repeatCount="indefinite"/></circle>'
              )
            : "";

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">',
            '<defs>',
            '<radialGradient id="void"><stop offset="0" stop-color="#15152b"/><stop offset=".48" stop-color="#080812"/><stop offset="1" stop-color="#020204"/></radialGradient>',
            '<radialGradient id="core"><stop stop-color="#fff"/><stop offset=".18" stop-color="',
            c0,
            '"/><stop offset=".52" stop-color="',
            c1,
            '" stop-opacity=".8"/><stop offset="1" stop-color="',
            c2,
            '" stop-opacity="0"/></radialGradient>',
            '<filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
            '<filter id="noise"><feTurbulence baseFrequency=".75" numOctaves="4" seed="',
            (uint256(uint8(being.seed[0])) + 1).toString(),
            '"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .09 0"/></filter>',
            '</defs>',
            '<rect width="1000" height="1000" fill="url(#void)"/><rect width="1000" height="1000" filter="url(#noise)" opacity=".42"/>',
            '<g transform="translate(500 500)" filter="url(#glow)">',
            sovereignAura,
            rings,
            '<g><ellipse rx="310" ry="96" fill="none" stroke="',
            c3,
            '" stroke-width="3" opacity=".72"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="19s" repeatCount="indefinite"/></ellipse>',
            '<ellipse rx="292" ry="76" fill="none" stroke="',
            c1,
            '" stroke-width="2" opacity=".58"><animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="13s" repeatCount="indefinite"/></ellipse></g>',
            '<circle r="118" fill="url(#core)"><animate attributeName="r" values="106;132;106" dur="6s" repeatCount="indefinite"/></circle>',
            '<path d="M0 -205 L48 -58 L205 0 L48 58 L0 205 L-48 58 L-205 0 L-48 -58 Z" fill="none" stroke="white" stroke-width="2" opacity=".82"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="29s" repeatCount="indefinite"/></path>',
            '</g>',
            '<g font-family="ui-monospace,Menlo,monospace" fill="white">',
            '<text x="48" y="70" font-size="28" font-weight="700">i dont fucking believe it! #',
            being.tokenId.toString(),
            '</text>',
            '<text x="48" y="104" font-size="15" opacity=".72">',
            mode,
            '</text>',
            '<text x="48" y="910" font-size="14" opacity=".58">GEN ',
            uint256(being.generation).toString(),
            '  /  EVO ',
            uint256(being.evolutions).toString(),
            '  /  ACT ',
            being.actionNonce.toString(),
            '</text>',
            '<text x="48" y="940" font-size="12" opacity=".45">ACCOUNT ',
            being.account.toHexString(),
            '</text>',
            '</g></svg>'
        );
    }

    function _trait(string memory traitType, string memory value) internal pure returns (string memory) {
        return string.concat('{"trait_type":"', traitType, '","value":"', value, '"}');
    }

    function _numberTrait(string memory traitType, uint256 value) internal pure returns (string memory) {
        return string.concat(
            '{"display_type":"number","trait_type":"',
            traitType,
            '","value":',
            value.toString(),
            '}'
        );
    }

    function _color(bytes32 source, uint256 byteOffset) internal pure returns (string memory) {
        uint256 shift = (byteOffset % 30) * 8;
        uint24 raw = uint24(uint256(source) >> shift);
        // Keep generated colors luminous enough for the black field.
        uint24 luminous = raw | 0x505050;
        return Strings.toColor(luminous);
    }
}
