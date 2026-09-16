// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolRead} from "../interfaces/Site.sol";

/*───────────────────────────────────────────────────────────────────────────
  Assets — the token list, derived instead of fetched

  Every exchange on the web puts a dropdown in front of you, and behind that
  dropdown is a JSON file on somebody's server. Uniswap's is a token list
  from tokenlists.org, fetched over HTTP or IPFS at page load. It is the
  single most load-bearing piece of infrastructure in a swap interface and
  it is the one piece that is not on chain: the list decides what you can
  see, and something that is not the chain decides the list.

  This collection cannot fetch anything. So the question is not "how do we
  get the list" but "what is the list actually for", and the answer is: to
  stop you from typing an address that will not work.

  There are two honest ways to answer that without a server, and this file
  is the first of them.

    · **Derived.** An asset is on this list because a market in this
      collection trades it. That is read from the pool that would execute
      the trade, so nothing can appear here that cannot be traded — which
      is a stronger guarantee than a hosted list makes, and a hosted list
      routinely offers thousands of tokens of which a handful have any
      liquidity at all.

    · **Verified.** Anything not on the list can still be pasted in, and
      the page then asks the chain about it directly: does this address
      have code, what does it call itself, and is there a pool for it with
      liquidity in it. That check is the thing a token list was a proxy
      for, done properly, against the venue that will actually fill the
      trade.

  So the honest claim is not "this dropdown has every token Uniswap has".
  No dropdown assembled without a server can. It is: anything Uniswap can
  trade, this page can trade, because the page checks the pool rather than
  checking a list — and the check happens before you can press anything.

  The derivation is here rather than in one page contract because two
  contracts need it and they have separate 24kB budgets: the page that
  renders the list as a table, and the desk that hands it to the client as
  JSON. Two copies of the loop would be two places for the definition of
  "an asset" to drift apart.
───────────────────────────────────────────────────────────────────────────*/
library Assets {
    /// @notice Every distinct ERC-20 traded by an open market, in the order
    ///         the pool enumerates them.
    /// @param pool  the collection's pool
    /// @param from  the first market to look at
    /// @param count how many markets to read — a bound, because reading
    ///              every market in one `eth_call` is a call no node will
    ///              finish, and a page that quietly stops has to say so
    /// @return list the deduplicated addresses
    /// @return ids  the market ids that were read, so a caller can say what
    ///              it looked at rather than implying it looked at all of it
    function derive(IPoolRead pool, uint256 from, uint256 count)
        internal view returns (address[] memory list, uint256[] memory ids)
    {
        ids = pool.openIds(from, count);

        address[] memory buf = new address[](ids.length * 2);
        uint256 n;
        for (uint256 i; i < ids.length; ++i) {
            (address b, address q,,,,,,,,,,) = pool.market(ids[i]);
            for (uint256 k; k < 2; ++k) {
                address a = k == 0 ? b : q;
                if (a == address(0)) continue;
                bool dup;
                for (uint256 j; j < n; ++j) if (buf[j] == a) { dup = true; break; }
                if (!dup) buf[n++] = a;
            }
        }

        list = new address[](n);
        for (uint256 i; i < n; ++i) list[i] = buf[i];
    }
}
