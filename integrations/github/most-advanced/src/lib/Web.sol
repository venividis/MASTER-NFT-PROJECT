// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  Web — putting untrusted bytes into a document without handing over the page

  Every page this collection serves is assembled on chain out of values read
  from the chain, and most of those values are safe by construction: an
  address renders as hex, a uint renders as digits, neither can contain a
  `<`. Two kinds cannot:

    · ERC-20 `symbol()` and `name()`, on a token address a *holder* chose.
      The pool takes any ERC-20 unless the allowlist is enforced, so the
      string is chosen by whoever wanted it in the page.
    · path segments, if one is ever echoed back to say what was not found.

  This matters more here than on an ordinary site, because
  `/token/<id>/live` serves the instrument on this same origin — that is the
  entire reason it exists, so wallet extensions will inject into it. A
  script injected through a market page is same-origin with a live wallet
  client. "The index is only convenience" stops being true the moment the
  index can run code next to the instrument.

  So: a whitelist, not a blacklist. Printable ASCII passes, the five HTML
  metacharacters become entities, everything else is dropped. A symbol in a
  script that does not survive is a symbol rendered wrong, which is a
  cosmetic bug. A symbol in a script that does survive is an origin.

  Reading those strings is its own hazard, and `staticcall` is used rather
  than an interface for four reasons that have all happened on mainnet: the
  address may hold no code, the call may revert, the token may answer in
  `bytes32` instead of `string` (MKR and its generation), and the answer may
  be arbitrarily long — a megabyte symbol is a denial of service against
  every page that lists that market.
───────────────────────────────────────────────────────────────────────────*/
library Web {
    /// @dev Long enough for every real ticker, short enough that a hostile
    ///      one cannot push a page over an `eth_call` cap on its own.
    uint256 internal constant MAX_LABEL = 32;

    /*═══════════════════ escaping ═══════════════════*/

    /// @notice HTML text and double-quoted attribute contexts, which after
    ///         escaping `"` and `<` are the same context.
    function esc(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        // 6x is the worst case: every byte becomes `&quot;`
        bytes memory o = new bytes(b.length * 6);
        uint256 n;
        for (uint256 i; i < b.length; ++i) {
            uint8 c = uint8(b[i]);
            if (c == 0x26) { n = _put(o, n, "&amp;"); }
            else if (c == 0x3C) { n = _put(o, n, "&lt;"); }
            else if (c == 0x3E) { n = _put(o, n, "&gt;"); }
            else if (c == 0x22) { n = _put(o, n, "&quot;"); }
            else if (c == 0x27) { n = _put(o, n, "&#39;"); }
            // the whitelist: printable ASCII only. Anything else — control
            // bytes, lone UTF-8 continuation bytes, the line separators that
            // terminate a JS string literal — is not rendered rather than
            // rendered carefully.
            else if (c >= 0x20 && c <= 0x7E) { o[n++] = b[i]; }
        }
        assembly ("memory-safe") { mstore(o, n) }
        return string(o);
    }

    /// @notice A JSON string body, without the surrounding quotes.
    /// @dev The same whitelist. `<` and `&` are escaped here too, because
    ///      a JSON document is routinely pasted into HTML and a `</script>`
    ///      inside a legal JSON string ends a script block.
    function jsonEsc(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory o = new bytes(b.length * 6);
        uint256 n;
        for (uint256 i; i < b.length; ++i) {
            uint8 c = uint8(b[i]);
            if (c == 0x22) { n = _put(o, n, "\\\""); }
            else if (c == 0x5C) { n = _put(o, n, "\\\\"); }
            else if (c == 0x3C) { n = _put(o, n, "\\u003c"); }
            else if (c == 0x3E) { n = _put(o, n, "\\u003e"); }
            else if (c == 0x26) { n = _put(o, n, "\\u0026"); }
            else if (c >= 0x20 && c <= 0x7E) { o[n++] = b[i]; }
        }
        assembly ("memory-safe") { mstore(o, n) }
        return string(o);
    }

    function _put(bytes memory o, uint256 n, bytes memory lit)
        private pure returns (uint256)
    {
        for (uint256 i; i < lit.length; ++i) o[n + i] = lit[i];
        return n + lit.length;
    }

    /*═══════════════════ reading what may not answer ═══════════════════*/

    /// @notice An ERC-20's symbol, already escaped for HTML, or "?" when the
    ///         address will not say. Never reverts.
    function symbolOf(address t) internal view returns (string memory) {
        return esc(_label(t, 0x95d89b41));          // symbol()
    }

    /// @notice The same, escaped for JSON.
    function symbolOfJson(address t) internal view returns (string memory) {
        return jsonEsc(_label(t, 0x95d89b41));
    }

    function nameOf(address t) internal view returns (string memory) {
        return esc(_label(t, 0x06fdde03));          // name()
    }

    /// @notice Decimals, or 18 when the address will not say — which is the
    ///         assumption every client makes anyway, made explicitly here so
    ///         a page never divides by a value it invented silently.
    function decimalsOf(address t) internal view returns (uint8) {
        (bool ok, bytes memory ret) =
            t.staticcall{gas: 30_000}(abi.encodeWithSelector(bytes4(0x313ce567)));
        if (!ok || ret.length < 32) return 18;
        uint256 d = abi.decode(ret, (uint256));
        return d > 77 ? 18 : uint8(d);              // 10**78 overflows uint256
    }

    /// @dev Raw and defensive. A gas stipend, because a hostile token can
    ///      burn everything the page was given and a page that dies on one
    ///      row is a directory nobody can read.
    function _label(address t, uint32 selector) private view returns (string memory) {
        if (t.code.length == 0) return "?";
        (bool ok, bytes memory ret) =
            t.staticcall{gas: 50_000}(abi.encodeWithSelector(bytes4(uint32(selector))));
        if (!ok || ret.length == 0) return "?";

        // the bytes32 generation: no offset, no length, just the word
        if (ret.length == 32) {
            bytes32 w = abi.decode(ret, (bytes32));
            uint256 n;
            while (n < 32 && w[n] != 0) ++n;
            if (n == 0) return "?";
            bytes memory s = new bytes(n);
            for (uint256 i; i < n; ++i) s[i] = w[i];
            return string(s);
        }

        /*  A well-formed `string` return: offset, length, body. Decoding it
            with abi.decode would accept a length the payload does not
            contain, so the header is read by hand — and the order of the
            two reads is the whole point.

            This used to read the offset and then, in the same assembly
            block, dereference it: `if lt(off, 0xffffffff) { len :=
            mload(add(add(ret, 32), off)) }`. The bound was on the wrong
            side. A token answering with an offset of 0xfffffffe is asking
            for a load four gigabytes past the buffer, and the EVM charges
            for memory quadratically whether or not anything is there — so
            one hostile ERC-20 in one market took every page that listed it
            out of gas, including the directory listing twenty-three
            innocent ones beside it.

            The offset must be exactly 32 for this to be a `string` at all,
            so it is checked in Solidity first and the length is then read
            from a fixed position. Nothing attacker-supplied is ever used
            as an address.                                                */
        if (ret.length < 64) return "?";
        uint256 off;
        assembly ("memory-safe") { off := mload(add(ret, 32)) }
        if (off != 32) return "?";
        uint256 len;
        assembly ("memory-safe") { len := mload(add(ret, 64)) }
        if (len == 0) return "?";
        if (len > ret.length - 64) return "?";      // claims more than it sent
        if (len > MAX_LABEL) len = MAX_LABEL;       // and truncation is fine
        bytes memory out = new bytes(len);
        for (uint256 i; i < len; ++i) out[i] = ret[64 + i];
        return string(out);
    }

    /*═══════════════════ numbers a person can read ═══════════════════*/

    /// @notice A fixed-point amount, at most `places` digits after the point
    ///         and no trailing zeroes. Display only — every page also prints
    ///         the exact integer, because a rounded number is not a number a
    ///         transaction can be built from.
    function amount(uint256 v, uint8 decimals, uint8 places)
        internal pure returns (string memory)
    {
        if (decimals > 36) return _u(v);
        uint256 unit = 10 ** decimals;
        uint256 whole = v / unit;
        uint256 frac = v % unit;
        if (frac == 0 || places == 0) return _group(whole);

        // scale the remainder down to `places` digits
        uint256 keep = places > decimals ? decimals : places;
        frac /= 10 ** (decimals - keep);
        bytes memory f = bytes(_u(frac));
        // left-pad to `keep` digits, then trim the trailing zeroes
        bytes memory padded = new bytes(keep);
        for (uint256 i; i < keep; ++i) padded[i] = "0";
        for (uint256 i; i < f.length; ++i) padded[keep - f.length + i] = f[i];
        uint256 end = keep;
        while (end > 0 && padded[end - 1] == "0") --end;
        if (end == 0) return _group(whole);
        bytes memory trimmed = new bytes(end);
        for (uint256 i; i < end; ++i) trimmed[i] = padded[i];
        return string.concat(_group(whole), ".", string(trimmed));
    }

    /// @dev Thousands separators, because a reserve is a number people are
    ///      about to trade against and 1000000000 is not readable.
    function _group(uint256 v) private pure returns (string memory) {
        bytes memory d = bytes(_u(v));
        uint256 commas = (d.length - 1) / 3;
        if (commas == 0) return string(d);
        bytes memory o = new bytes(d.length + commas);
        uint256 j = o.length;
        for (uint256 i; i < d.length; ++i) {
            if (i != 0 && i % 3 == 0) o[--j] = ",";
            o[--j] = d[d.length - 1 - i];
        }
        return string(o);
    }

    function _u(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        uint256 n = v;
        uint256 len;
        unchecked { while (n != 0) { ++len; n /= 10; } }
        bytes memory b = new bytes(len);
        unchecked { while (v != 0) { b[--len] = bytes1(uint8(48 + (v % 10))); v /= 10; } }
        return string(b);
    }
}
