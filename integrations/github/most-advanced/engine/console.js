/*═══════════════════════════════════════════════════════════════════════════
  IPSEITY · the console, client side

  The document that arrives is already correct: the crest, the still, the
  identity and all seven rows with their clocks are rendered by the
  contract. Nothing below repaints any of it. What this file adds is the
  three things a contract cannot do — say who is holding the wallet, carry
  the walk, and take a typed word.

  ── the walk, and where it is kept ──

  Every state of the console is a real URL, so walking into another token
  is a navigation rather than a client-side render. That is the honest
  choice: what you are looking at is served, one document, one token, and
  a link you can send somebody.

  But a navigation forgets where you came from, and where you came from is
  the whole point — it is the thing the owner could not see when
  instruments were stacking. So the walk rides in the FRAGMENT:

      /c/1024#w=2049:214

  id:hue pairs, outermost first, not including the token the document is
  already about. The fragment is the right place and not merely a
  convenient one: ERC-5219 hands `Premises.request` the path and the query
  and never the hash, so the walk crosses every navigation without costing
  a contract byte, without reaching a gateway's cache key, and without
  being written anywhere it does not belong.

  It carries the hue as well as the id because the rule for a token you
  walked out of has to be that token's colour, and asking a chain for it
  would mean the margin painting late — the one thing in this interface
  that must be true before anything else is.

  No localStorage. Nothing here is per-viewer state; the walk is history
  and it dies with the tab, which is what history does.
═══════════════════════════════════════════════════════════════════════════*/
(function () {
  "use strict";
  var C = window.CON;
  if (!C) return;

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  };
  /*  Always with the spaces around the ellipsis: an address printed without
      them reads as one word and gets copied wrong.                       */
  var short = function (a) {
    return !a || /^0x0{40}$/i.test(a) ? "nobody" : a.slice(0, 6) + " … " + a.slice(-4);
  };

  /*───────────────────────── the ticker ─────────────────────────*/
  /*  One line. It fades to .55 after seven seconds and never disappears,
      so the last thing that happened is always still readable. There is no
      toast stack anywhere in this console.                              */
  var tickT = 0;
  function say(msg, kind) {
    var t = $("#tick");
    if (!t) return;
    t.className = kind || "";
    t.textContent = msg;
    clearTimeout(tickT);
    tickT = setTimeout(function () { t.classList.add("fade"); }, 7000);
  }
  C.say = say;

  /*───────────────────────── the walk ─────────────────────────*/

  function readWalk() {
    var m = /(?:^|[#&])w=([^&]*)/.exec(location.hash);
    if (!m) return [];
    return m[1].split(",").map(function (pair) {
      var p = pair.split(":");
      var id = parseInt(p[0], 10), hue = parseInt(p[1], 10);
      return isFinite(id) && isFinite(hue) ? { id: id, hue: hue } : null;
    }).filter(Boolean);
  }

  var walk = readWalk();

  /*  MAX_DEPTH is three, the same number and the same reason as the
      instrument's own nest: past three the margin has run out of room, and
      a walk you cannot see is a walk that is not doing its job.        */
  var MAX_DEPTH = 3;

  function paintWalk() {
    var root = $("#root"), crest = $("#walk");
    if (!root || !crest) return;

    /*  One band per level walked out of, drawn OUTSIDE the standing band so
        its rule lands to the left of it. Each is 22px, so depth is the
        number of rules and nothing has to say it in words.            */
    Array.prototype.slice.call(document.querySelectorAll(".sub.past, .rung"))
      .forEach(function (e) { e.remove(); });

    walk.forEach(function (level, i) {
      var band = document.createElement("div");
      band.className = "sub past";
      band.style.setProperty("--h", level.hue);
      band.style.setProperty("--own", (i * 22) + "px");
      band.dataset.at = i;
      document.body.insertBefore(band, root);
      /*  ::before cannot take a tap and the rule has to be the way back
          out, so a real button sits over it, 22px wide because a thumb is
          not a mouse.                                                  */
      var rung = document.createElement("button");
      rung.className = "rung";
      rung.type = "button";
      rung.style.left = (i * 22) + "px";
      rung.setAttribute("aria-label", "back to #" + level.id);
      rung.addEventListener("click", function () { walkOut(i); });
      document.body.appendChild(rung);
    });

    /*  The standing band is always the innermost, so its rule sits right of
        every band you could walk back to.                              */
    root.style.setProperty("--own", (walk.length * 22) + "px");
    document.documentElement.style.setProperty("--walk", ((walk.length + 1) * 22) + "px");

    /*  The crumbs, in the crest. Each carries its own --h inline, and the
        stylesheet re-declares --a on the same element — declaring --h alone
        and inheriting --a does NOT re-tint, because the colour was already
        resolved where --a was written.                                  */
    crest.innerHTML = "";
    walk.concat([{ id: C.id, hue: C.hue }]).forEach(function (level, i) {
      var b = document.createElement("button");
      b.className = "cr";
      b.type = "button";
      b.style.setProperty("--h", level.hue);
      b.textContent = "#" + level.id;
      if (i < walk.length) b.addEventListener("click", function () { walkOut(i); });
      crest.appendChild(b);
    });
  }

  function frag(list) {
    return list.length
      ? "#w=" + list.map(function (l) { return l.id + ":" + l.hue; }).join(",")
      : "";
  }

  /// Walk in: the token you are on becomes a level you can walk back to.
  function walkTo(id) {
    id = Number(id);
    if (!isFinite(id) || id < C.first || id > C.last) {
      return say("#" + id + " is not one of this chain's ids — " +
                 C.first + " to " + C.last + ".", "err");
    }
    if (id === C.id) return say("You are already standing in #" + id + ".");
    if (walk.length + 1 >= MAX_DEPTH) {
      return say("The margin has run out of room. This is the last one that will open.", "err");
    }
    location.href = "/c/" + id + frag(walk.concat([{ id: C.id, hue: C.hue }]));
  }
  C.walkTo = walkTo;

  /// Walk out to level `i`, dropping every level inside it.
  function walkOut(i) {
    var level = walk[i];
    if (!level) return;
    location.href = "/c/" + level.id + frag(walk.slice(0, i));
  }

  /*───────────────────────── the wallet ─────────────────────────*/

  /*  The crest says HELD with an address in it from the first paint, and
      this rewrites it to the single word "you" when the wallet answers. It
      is never blank and never wrong, and nobody is asked to compare
      forty-two hex characters by eye.

      When nobody has answered, the same cell becomes the way to ask: it
      reads "read only — connect" and takes a tap. For one version the only
      connect affordance in the whole console was typing the word into the
      command line, which is a door with the handle on the inside; the spec
      always said the crest carries the wallet, so the crest carries the
      control too.                                                        */
  function paintAccount(acct) {
    var led = $("#led"), who = $("#acct"), held = $("#held"), by = $("#heldby");
    if (!acct) {
      if (led) led.className = "led ro";
      if (who) {
        if (window.ethereum) {
          who.textContent = "read only — connect";
          who.style.cursor = "pointer";
        } else {
          who.textContent = "read only";
        }
      }
      return;
    }
    if (led) led.className = "led live";
    if (who) { who.textContent = short(acct); who.style.cursor = ""; }
    var mine = C.owner && acct.toLowerCase() === C.owner.toLowerCase();
    if (mine) {
      if (held) held.textContent = "you";
      if (by) by.textContent = "you";
    }
  }

  /*  The wrong chain, said where the wallet is named — §E.5. A wallet on
      Base signing for a token that lives on Unichain is the sharpest trap
      this page can set, and it used to be sprung at signature time. Now
      the crest says so the moment the wallet answers, the cell offers the
      one move that fixes it, and `propose` refuses to build a transaction
      while it stands. A provider that cannot say which chain it is on —
      some cannot — leaves `chainOk` unknown, and unknown does not refuse:
      the wallet itself still guards its own chain.                      */
  function paintChain(walletChain) {
    var who = $("#acct"), led = $("#led");
    if (C.chainOk === false) {
      if (led) led.className = "led ro";
      if (who) {
        who.textContent = "wallet on chain " + walletChain + " — move it";
        who.style.cursor = "pointer";
      }
    }
  }

  function checkChain() {
    var eth = window.ethereum;
    if (!eth || !C.chain) return Promise.resolve(undefined);
    return eth.request({ method: "eth_chainId" }).then(function (h) {
      var n = parseInt(h, 16);
      C.chainOk = (n === Number(C.chain));
      if (!C.chainOk) paintChain(n);
      return C.chainOk;
    }).catch(function () { C.chainOk = undefined; return undefined; });
  }

  function switchChain() {
    var eth = window.ethereum;
    if (!eth) return;
    eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + Number(C.chain).toString(16) }]
    }).then(function () {
      say("The wallet moved to chain " + C.chain + ".", "ok");
      C.chainOk = true;
      connect(false);
    }).catch(function () {
      say("The wallet does not know chain " + C.chain + ". Add it there, then return.", "err");
    });
  }

  function connect(loud) {
    var eth = window.ethereum;
    if (!eth) {
      if (loud) say("No wallet in this browser. Everything above is still true.", "err");
      return Promise.resolve(null);
    }
    return eth.request({ method: loud ? "eth_requestAccounts" : "eth_accounts" })
      .then(function (a) {
        var acct = a && a[0] ? a[0] : null;
        C.account = acct;
        paintAccount(acct);
        if (loud && acct) say("Connected as " + short(acct) + ".", "ok");
        return checkChain().then(function () { return acct; });
      })
      .catch(function (e) {
        if (loud) say(e && e.message ? e.message : "The wallet refused.", "err");
        return null;
      });
  }
  C.connect = connect;

  /*  The crest cell is the control: not connected, it connects; on the
      wrong chain, it offers the move. Never both at once, and never a
      second button anywhere.                                             */
  var acctCell = $("#acct");
  if (acctCell) acctCell.addEventListener("click", function () {
    if (C.chainOk === false) return switchChain();
    if (!C.account) connect(true);
  });

  /*  A wallet is a thing that changes under a page — accounts switch,
      chains move — and a crest that keeps saying "you" to a stranger is
      wrong in the worst way. Repaint on both events; no storage, no
      polling.                                                            */
  if (window.ethereum && window.ethereum.on) {
    try {
      window.ethereum.on("accountsChanged", function () { connect(false); });
      window.ethereum.on("chainChanged", function () { connect(false); });
    } catch (e) { /* a provider without .on is a provider we ask once */ }
  }

  /*───────────────────────── the seven, and the words ─────────────────────*/

  var WORDS = ["", "turn", "hold", "trade", "hand", "speak", "make", "look"];
  /*  The words people say, rather than the ones the verbs are named. This
      table and the contract's `verbWord` are the same seven strings in the
      same order; a test holds them to each other, because two copies of a
      naming table is exactly the failure this redesign answers.        */
  var ALIAS = {
    turn:  "commit rotate section hue face pin word cut",
    hold:  "vault reach grip seal lock send balance call assets",
    trade: "market pool swap fee bond curve liquidity exchange",
    hand:  "transfer sell rent lease will estate consign heir keys session give",
    speak: "chat say dm whisper room rooms roster sign verify commons",
    make:  "mint draw launch coin hook name ens renew issue",
    look:  "gallery collection open markets scan address nest another"
  };

  function openVerb(i) {
    if (!i) return;
    location.href = "/c/" + C.id + "/" + WORDS[i] + frag(walk);
  }

  Array.prototype.slice.call(document.querySelectorAll(".vb")).forEach(function (b) {
    if (b.classList.contains("shut")) return;
    b.addEventListener("click", function () { openVerb(+b.dataset.v); });
  });

  /*───────────────────────── the command line ─────────────────────────*/

  function run(raw) {
    var s = String(raw || "").trim().toLowerCase();
    if (!s) return;

    /*  `#1024` walks. This is the complete answer to there being no way to
        reach a token by number.                                        */
    var hash = /^#?(\d+)$/.exec(s);
    if (hash) return walkTo(hash[1]);

    if (s === "connect") return connect(true), undefined;

    var head = s.split(/\s+/)[0];
    for (var i = 1; i <= 7; i++) {
      if (head === WORDS[i] || head === String(i)) return openVerb(i);
    }
    for (var w in ALIAS) {
      if (ALIAS[w].split(" ").indexOf(head) >= 0) {
        return openVerb(WORDS.indexOf(w));
      }
    }
    /*  Unknown input is an error sentence, never a guess. A console that
        guesses is a console that will one day guess a transaction.     */
    say("No word here is “" + esc(head) + "”. Try a verb, or #" + C.first + ".", "err");
  }
  C.run = run;

  var cin = $("#cin");
  if (cin) {
    cin.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var v = cin.value;
      cin.value = "";
      run(v);
    });
  }
  var palbtn = $("#palbtn");
  if (palbtn) palbtn.addEventListener("click", function () { cin && cin.focus(); });

  /*───────────────────────── arrival ─────────────────────────*/

  /*  The document is already visible by the time this runs — the fade is a
      CSS animation, so it cannot be withheld by a script that threw. What
      arrives here is only what a contract could not render.

      `ready` is handed on because the lanes need it. Painting a lane before
      the wallet has answered produced a surface that told a holder to
      connect a wallet while the crest beside it already said "you" —
      correct twice and contradictory once, which is worse than either. */
  paintWalk();
  C.ready = connect(false);

  /*  Escape closes the lane by going back to the token's own address,
      which keeps the URL and the screen agreeing at every moment.     */
  addEventListener("keydown", function (e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    if (e.key === "Escape" && C.verb) location.href = "/c/" + C.id + frag(walk);
    if (e.key === "/") { e.preventDefault(); cin && cin.focus(); }
  });
})();
