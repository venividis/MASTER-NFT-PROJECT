// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SSTORE2} from "../src/lib/SSTORE2.sol";
import {LibNum}  from "../src/lib/LibNum.sol";
import {Base64}  from "../src/lib/Base64.sol";

/*───────────────────────────────────────────────────────────────────────────
  PARTS — bytes with a declared kind, held as an ERC-721

  A part is not a page. It has no animation_url and never will: nothing in
  this system mounts a stranger's document, so a part that tried to be one
  would be inert anyway, and a metadata field that promises a document is
  a promise. Three kinds, and the list is closed:

     1 FIELD  a `float map(vec4 q)` body in GLSL ES 3.00, no loops
     2 SCORE  a SoundBox song, the bytes its own parser reads
     3 ROM    a CHIP-8 program image

  The FIELD gate is the only place in this design where consensus checks a
  stranger's code, and it is deliberately crude: an alphabet, a refusal of
  comments so that no token can be split across one, and three keywords
  refused on word boundaries so that nothing loops. It is not a compiler
  and does not pretend to be. The real boundary is a fragment shader —
  no DOM, no network, no storage, one output, pixels.
───────────────────────────────────────────────────────────────────────────*/
contract Parts {
    using LibNum for uint256;

    uint8 public constant KIND_FIELD = 1;
    uint8 public constant KIND_SCORE = 2;
    uint8 public constant KIND_ROM   = 3;

    uint256 public constant MAX_FIELD =  1_024;
    uint256 public constant MAX_SCORE =  4_096;
    uint256 public constant MAX_ROM   = 24_575;   // SSTORE2.MAX_SHARD

    struct Head { uint8 kind; address ptr; }

    mapping(uint256 => Head)    internal _head;
    mapping(uint256 => address) internal _owner;
    mapping(address => uint256) internal _bal;
    mapping(uint256 => address) internal _approved;
    mapping(address => mapping(address => bool)) internal _opFor;

    uint256 public totalSupply;

    event Transfer(address indexed from, address indexed to, uint256 indexed id);
    event Approval(address indexed owner, address indexed spent, uint256 indexed id);
    event ApprovalForAll(address indexed owner, address indexed op, bool ok);
    event Minted(uint256 indexed id, uint8 kind, uint256 size, address ptr);

    error BadKind();
    error TooLong();
    error NotClean(uint256 at);
    error Loops(uint256 at);
    error Escapes(uint256 at);
    error Nonexistent();
    error NotAllowed();

    /*═════════════════════ minting ═════════════════════*/

    function mint(uint8 kind, bytes calldata body) external returns (uint256 id) {
        uint256 n = body.length;
        if (n == 0) revert TooLong();
        if (kind == KIND_FIELD) {
            if (n > MAX_FIELD) revert TooLong();
            _gate(body);
        } else if (kind == KIND_SCORE) {
            if (n > MAX_SCORE) revert TooLong();
        } else if (kind == KIND_ROM) {
            if (n > MAX_ROM) revert TooLong();
        } else {
            revert BadKind();
        }

        address ptr = SSTORE2.write(body);
        unchecked { id = ++totalSupply; }
        _head[id] = Head(kind, ptr);
        _owner[id] = msg.sender;
        unchecked { _bal[msg.sender] += 1; }
        emit Transfer(address(0), msg.sender, id);
        emit Minted(id, kind, n, ptr);
    }

    /*═════════════════════ the gate ═════════════════════*/

    /// @dev One pass for the alphabet and for comment openers, then three
    ///      word-boundary refusals. Comments are refused first so that the
    ///      keyword scan is exact: with no comment able to sit inside an
    ///      identifier, a word-boundary match IS a token match.
    function _gate(bytes calldata b) private pure {
        uint256 n = b.length;
        bool prevWord;
        uint256 depth;
        for (uint256 i; i < n; ++i) {
            uint8 c = uint8(b[i]);
            if (!_ok(c)) revert NotClean(i);
            //  The body is spliced between a `{` and a `}` this contract
            //  does not hand over. A body that closed its own function
            //  would be writing at file scope: new functions, new uniforms,
            //  a second `out`. Balanced and never negative means it cannot
            //  leave the room it was let into.
            if (c == 0x7B) { unchecked { ++depth; } }
            else if (c == 0x7D) { if (depth == 0) revert Escapes(i); unchecked { --depth; } }
            if (c == 0x2F && i + 1 < n) {                        // '/'
                uint8 d = uint8(b[i + 1]);
                if (d == 0x2F || d == 0x2A) revert NotClean(i);  // '//' or '/*'
            }
            bool w = _word(c);
            //  Only ever tested at the first byte of a word, and only when
            //  that byte can begin one of the three. In real GLSL that is
            //  a few per cent of the bytes, which is why one pass costs
            //  what four passes did not.
            if (w && !prevWord && (c == 0x66 || c == 0x77 || c == 0x64)) {
                if (c == 0x66) _at(b, i, n, "for");
                else if (c == 0x77) _at(b, i, n, "while");
                else _at(b, i, n, "do");
            }
            prevWord = w;
        }
        if (depth != 0) revert Escapes(n);
    }

    /// @dev `w` sits at `i` as a whole token. The opening boundary is the
    ///      caller's business; this one closes it.
    function _at(bytes calldata b, uint256 i, uint256 n, bytes memory w) private pure {
        uint256 m = w.length;
        if (i + m > n) return;
        for (uint256 j = 1; j < m; ++j) if (b[i + j] != w[j]) return;
        if (i + m < n && _word(uint8(b[i + m]))) return;
        revert Loops(i);
    }

    function _ok(uint8 c) private pure returns (bool) {
        if (c >= 0x61 && c <= 0x7A) return true;              // a-z
        if (c >= 0x41 && c <= 0x5A) return true;              // A-Z
        if (c >= 0x30 && c <= 0x39) return true;              // 0-9
        if (c == 0x20 || c == 0x09 || c == 0x0A) return true; // space tab LF
        // + - * / ( ) . , ; = < > ? : { } [ ] ! & | _
        if (c == 0x2B || c == 0x2D || c == 0x2A || c == 0x2F) return true;
        if (c == 0x28 || c == 0x29 || c == 0x2E || c == 0x2C) return true;
        if (c == 0x3B || c == 0x3D || c == 0x3C || c == 0x3E) return true;
        if (c == 0x3F || c == 0x3A || c == 0x7B || c == 0x7D) return true;
        if (c == 0x5B || c == 0x5D || c == 0x21 || c == 0x26) return true;
        if (c == 0x7C || c == 0x5F) return true;
        return false;                     // # " ' \ % ^ ~ ` @ $ and everything >0x7E
    }

    function _word(uint8 c) private pure returns (bool) {
        return (c >= 0x61 && c <= 0x7A) || (c >= 0x41 && c <= 0x5A)
            || (c >= 0x30 && c <= 0x39) || c == 0x5F;
    }

    /*═════════════════════ reading ═════════════════════*/

    function partOf(uint256 id) external view returns (uint8 kind, bytes memory body) {
        Head memory h = _head[id];
        if (h.ptr == address(0)) revert Nonexistent();
        return (h.kind, SSTORE2.read(h.ptr));
    }

    function kindOf(uint256 id) external view returns (uint8) {
        Head memory h = _head[id];
        if (h.ptr == address(0)) revert Nonexistent();
        return h.kind;
    }

    function sizeOf(uint256 id) external view returns (uint256) {
        Head memory h = _head[id];
        if (h.ptr == address(0)) revert Nonexistent();
        return SSTORE2.size(h.ptr);
    }

    /*═════════════════════ ERC-721, the parts of it that matter ═══════*/

    function ownerOf(uint256 id) public view returns (address o) {
        o = _owner[id];
        if (o == address(0)) revert Nonexistent();
    }
    function balanceOf(address a) external view returns (uint256) { return _bal[a]; }
    function name() external pure returns (string memory) { return "IPSEITY Parts"; }
    function symbol() external pure returns (string memory) { return "PART"; }

    function approve(address to, uint256 id) external {
        address o = ownerOf(id);
        if (msg.sender != o && !_opFor[o][msg.sender]) revert NotAllowed();
        _approved[id] = to;
        emit Approval(o, to, id);
    }
    function setApprovalForAll(address op, bool ok) external {
        _opFor[msg.sender][op] = ok;
        emit ApprovalForAll(msg.sender, op, ok);
    }
    function getApproved(uint256 id) external view returns (address) { return _approved[id]; }
    function isApprovedForAll(address o, address op) external view returns (bool) { return _opFor[o][op]; }

    function transferFrom(address from, address to, uint256 id) public {
        address o = ownerOf(id);
        if (o != from || to == address(0)) revert NotAllowed();
        if (msg.sender != o && msg.sender != _approved[id] && !_opFor[o][msg.sender]) revert NotAllowed();
        delete _approved[id];
        unchecked { _bal[from] -= 1; _bal[to] += 1; }
        _owner[id] = to;
        emit Transfer(from, to, id);
    }
    function safeTransferFrom(address from, address to, uint256 id) external {
        safeTransferFrom(from, to, id, "");
    }
    function safeTransferFrom(address from, address to, uint256 id, bytes memory data) public {
        transferFrom(from, to, id);
        if (to.code.length != 0) {
            (bool ok, bytes memory r) = to.call(
                abi.encodeWithSelector(0x150b7a02, msg.sender, from, id, data));
            if (!ok || r.length < 32 || bytes4(r) != bytes4(0x150b7a02)) revert NotAllowed();
        }
    }

    function supportsInterface(bytes4 iid) external pure returns (bool) {
        return iid == 0x01ffc9a7            // ERC-165
            || iid == 0x80ac58cd            // ERC-721
            || iid == 0x5b5e139f            // ERC-721Metadata
            || iid == this.partOf.selector; // IPart
    }

    /*  Metadata. No animation_url, by design: a part is not a page.      */
    function tokenURI(uint256 id) external view returns (string memory) {
        Head memory h = _head[id];
        if (h.ptr == address(0)) revert Nonexistent();
        string memory k = h.kind == KIND_FIELD ? "field"
                        : h.kind == KIND_SCORE ? "score" : "rom";
        bytes memory j = abi.encodePacked(
            '{"name":"Part #', id.str(),
            '","description":"A part. ', k, ', ',
            SSTORE2.size(h.ptr).str(),
            ' bytes, held as contract code. It is not a page and carries no document.",',
            '"attributes":[{"trait_type":"Kind","value":"', k,
            '"},{"trait_type":"Bytes","value":', SSTORE2.size(h.ptr).str(), '}]}'
        );
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(j)));
    }
}
