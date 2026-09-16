// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "../lib/Strings.sol";
import {OrganismRenderData} from "../interfaces/Interfaces.sol";

/// @notice A deterministic vector portrait of Anima's blue living body.
/// @dev All SVG bytes are generated from the onchain snapshot; no scripts, images,
/// fonts or network dependencies. Animation is decorative: frame zero is complete.
/// The legacy OnchainRenderer remains unchanged for existing collections.
library GenesisSVG {
    using Strings for uint256;

    function render(OrganismRenderData memory s) internal pure returns (string memory) {
        string memory accent = _accent(uint8(s.genome[0]));
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" role="img" aria-labelledby="title desc">',
            '<title id="title">Anima Genesis #', s.tokenId.toString(), '</title>',
            '<desc id="desc">A luminous blue living body within concentric orbital rings. Its filaments, stars and accents derive from its onchain seed, genome and state.</desc>',
            _defs(s, accent),
            '<rect width="1000" height="1000" fill="#02060e"/>',
            '<circle cx="500" cy="493" r="463" fill="url(#aura)"/>',
            _stars(s.seed),
            '<g transform="translate(500 493)">',
            _orbits(s), _body(s),
            '</g>', _caption(s), '</svg>'
        );
    }

    function _defs(OrganismRenderData memory s, string memory accent) private pure returns (string memory) {
        return string.concat(
            '<defs>',
            '<radialGradient id="aura"><stop stop-color="#17425e" stop-opacity=".8"/><stop offset=".5" stop-color="#13274a" stop-opacity=".7"/><stop offset="1" stop-color="#02060e" stop-opacity="0"/></radialGradient>',
            '<radialGradient id="body" cx="43%" cy="36%" r="68%"><stop stop-color="#84e4f5" stop-opacity=".1"/><stop offset=".4" stop-color="#165a87" stop-opacity=".2"/><stop offset=".82" stop-color="#103753" stop-opacity=".48"/><stop offset=".94" stop-color="#53d6f1" stop-opacity=".33"/><stop offset="1" stop-color="#aaeaff" stop-opacity=".06"/></radialGradient>',
            '<radialGradient id="heart"><stop stop-color="#f0ffff"/><stop offset=".09" stop-color="#bbfcff"/><stop offset=".25" stop-color="#63e2f0" stop-opacity=".9"/><stop offset=".48" stop-color="#2388be" stop-opacity=".32"/><stop offset="1" stop-color="#1545a8" stop-opacity="0"/></radialGradient>',
            '<linearGradient id="silk" x1="0" y1="0" x2="1" y2="1"><stop stop-color="', accent,
            '"/><stop offset=".28" stop-color="#a8f6ff"/><stop offset=".5" stop-color="#2398d5"/><stop offset=".76" stop-color="#88edff"/><stop offset="1" stop-color="', accent,
            '"/></linearGradient>',
            '<filter id="glow" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
            '<filter id="veil" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="fractalNoise" baseFrequency=".013" numOctaves="2" seed="',
            (1 + uint256(uint8(s.seed[0]))).toString(),
            '" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="',
            (10 + uint256(uint8(s.genome[3])) % 15).toString(),
            '" xChannelSelector="R" yChannelSelector="G"/></filter>',
            '</defs>'
        );
    }

    function _stars(bytes32 seed) private pure returns (string memory out) {
        for (uint256 i; i < 28; ++i) {
            // The source is mixed once per point, avoiding periodic 32-byte strips.
            bytes32 h = keccak256(abi.encodePacked(seed, i));
            out = string.concat(out,
                '<circle cx="', (58 + uint256(uint16(bytes2(h))) % 884).toString(),
                '" cy="', (160 + uint256(uint16(bytes2(h << 16))) % 652).toString(),
                '" r="', i % 7 == 0 ? '1.6' : '.8',
                '" fill="#b1eaff" opacity="', i % 3 == 0 ? '.65' : '.28', '"/>'
            );
        }
    }

    function _orbits(OrganismRenderData memory s) private pure returns (string memory out) {
        out = '<g fill="none" stroke="#5ccde8"><circle r="373" stroke-opacity=".12"/><circle r="384" stroke-opacity=".1" stroke-dasharray="1 12"/><circle r="410" stroke-opacity=".06"/></g>';
        for (uint256 i; i < 5; ++i) {
            uint256 r = 323 + i * 13 + uint256(uint8(s.genome[12 + i])) % 8;
            uint256 rotation = uint256(uint8(s.stateRoot[i])) + 37 * i;
            out = string.concat(out,
                '<g transform="rotate(', rotation.toString(), ')">',
                '<circle r="', r.toString(),
                '" fill="none" stroke="url(#silk)" stroke-width="', i == 2 ? '1.5' : '.6',
                '" opacity="', i == 2 ? '.62' : '.25', '" stroke-dasharray="',
                (25 + uint256(uint8(s.auditRoot[i])) % 110).toString(), ' ', (210 + i * 43).toString(), '"/>',
                '<circle cx="', r.toString(), '" r="', i == 2 ? '3' : '1.6',
                '" fill="#beefff" opacity=".8"/>',
                '<animateTransform attributeName="transform" type="rotate" from="', rotation.toString(),
                '" to="', (rotation + 360).toString(), '" dur="',
                (49 + i * 13 + uint256(uint8(s.seed[i])) % 17).toString(),
                's" repeatCount="indefinite"/>',
                '</g>'
            );
        }
    }

    function _body(OrganismRenderData memory s) private pure returns (string memory out) {
        out = '<g filter="url(#glow)"><g filter="url(#veil)"><circle r="294" fill="url(#body)" stroke="#68dcec" stroke-opacity=".53" stroke-width="1.3"/>';
        // Tilted meridians preserve the original ring composition while forming a body.
        for (uint256 i; i < 18; ++i) {
            uint256 rx = 258 + uint256(uint8(s.genome[i])) % 45;
            uint256 ry = 66 + i * 11 + uint256(uint8(s.seed[31 - i])) % 24;
            uint256 tilt = (i * 29 + uint256(uint8(s.genome[31 - i])) % 21) % 180;
            out = string.concat(out,
                '<ellipse rx="', rx.toString(), '" ry="', ry.toString(),
                '" transform="rotate(', tilt.toString(), ')" fill="none" stroke="url(#silk)" stroke-width="',
                i % 4 == 0 ? '1.6' : '.7', '" opacity="', i % 4 == 0 ? '.65' : '.27', '"/>'
            );
        }
        out = string.concat(out,
            '</g><circle r="108" fill="url(#heart)" opacity=".86">',
            '<animate attributeName="opacity" values=".86;.58;.86" dur="',
            (7 + uint256(uint8(s.seed[7])) % 6).toString(), 's" repeatCount="indefinite"/></circle>',
            '<path d="M-128 0H128M0-128V128" stroke="#c3faff" stroke-width=".55" opacity=".3"/>',
            '<circle r="4" fill="#e8ffff"/></g>',
            s.sovereign ? '<circle r="394" fill="none" stroke="#a9f1d9" stroke-width="1.4" stroke-dasharray="1 9" opacity=".6"/>' : ''
        );
    }

    function _caption(OrganismRenderData memory s) private pure returns (string memory) {
        return string.concat(
            '<g fill="#d8edf6" font-family="Arial,Helvetica,sans-serif">',
            '<text x="56" y="70" font-size="24" letter-spacing="9">ANIMA</text>',
            '<text x="58" y="99" font-size="10" letter-spacing="5" fill="#7f9caf">GENESIS</text>',
            '<text x="944" y="70" text-anchor="end" font-size="15" letter-spacing="2">#', s.tokenId.toString(), '</text>',
            '<text x="944" y="97" text-anchor="end" font-size="9" letter-spacing="2" fill="#7f9caf">',
            s.sovereign ? 'SOVEREIGN' : 'OWNER GUIDED', '</text>',
            '<path d="M56 862H944" stroke="#7cb2cb" stroke-opacity=".16"/>',
            '<text x="56" y="898" font-size="10" letter-spacing="3" fill="#789bae">A LIVING IDENTITY</text>',
            '<text x="944" y="898" text-anchor="end" font-size="10" letter-spacing="2" fill="#789bae">ONCHAIN PORTRAIT</text>',
            '<text x="56" y="937" font-family="monospace" font-size="13" letter-spacing="1">GEN ',
            uint256(s.generation).toString(), ' / EVO ', uint256(s.evolutions).toString(), ' / ACT ', s.actionNonce.toString(), '</text>',
            '<text x="944" y="937" text-anchor="end" font-family="monospace" font-size="12" letter-spacing="2" fill="#8bbbd0">',
            _fingerprint(s.seed), '</text></g>'
        );
    }

    function _fingerprint(bytes32 seed) private pure returns (string memory) {
        bytes memory alphabet = '0123456789ABCDEF';
        bytes memory out = new bytes(8);
        for (uint256 i; i < 4; ++i) {
            out[i * 2] = alphabet[uint8(seed[i]) >> 4];
            out[i * 2 + 1] = alphabet[uint8(seed[i]) & 15];
        }
        return string(out);
    }

    function _accent(uint8 value) private pure returns (string memory) {
        uint8 index = value % 6;
        if (index == 0) return '#bba4ea';
        if (index == 1) return '#efb8c5';
        if (index == 2) return '#a0dacd';
        if (index == 3) return '#8da3ef';
        if (index == 4) return '#d6bfdc';
        return '#94cbea';
    }
}
