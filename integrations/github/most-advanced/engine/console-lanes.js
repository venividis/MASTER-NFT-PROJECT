/*═══════════════════════════════════════════════════════════════════════════
  IPSEITY · the lanes

  The contract renders each lane's STATE — what is true about this token
  right now, read on chain in the same call that produced the document.
  This file does not repaint that. It adds the half a contract cannot have:
  the controls that send a transaction.

  So the layering is deliberate and it is the whole degradation story:

      no script at all → the crest, the still, the identity, seven rows
                          with their clocks, and each lane's state. A
                          correct page about the right token.
      script, no wallet → the same, plus the walk and the command line.
      script and wallet → the above, plus the controls.

  Nothing is ever a spinner over a number nobody read.

  ── selectors ──

  Every four-byte selector arrives in `CON.sel`, derived by the contract,
  because Solidity has keccak and a browser does not. Shipping two
  kilobytes of keccak so the client can recompute what the contract already
  knows is a client that can be wrong about something it never had to
  decide. The ABI encoding of the ARGUMENTS is done here, by hand, in the
  four shapes this file needs — which is a small thing to own and a large
  thing to depend on somebody else for.

  ── the slab ──

  There is no path from a text field to a broadcast transaction. Every
  send raises a slab that names, in words, what is about to happen and to
  what, and the transaction is built only after a person presses the
  button on it. The console types; the human presses.
═══════════════════════════════════════════════════════════════════════════*/
(function () {
  "use strict";
  var C = window.CON;
  if (!C) return;
  var $ = function (s) { return document.querySelector(s); };
  var say = C.say || function () {};

  /*───────────────────────── the smallest ABI coder ─────────────────────*/

  var pad = function (h) { return h.replace(/^0x/, "").padStart(64, "0"); };
  var enc = {
    addr: function (a) { return pad(String(a).toLowerCase()); },
    uint: function (n) { return pad(BigInt(n).toString(16)); }
  };
  var wei = function (s) {
    /*  Decimal ether to wei without a float anywhere near it. A balance
        that went through a double is a balance that is wrong in the last
        places, and those are somebody's.                               */
    var m = /^(\d*)(?:\.(\d*))?$/.exec(String(s).trim());
    if (!m) return null;
    var whole = m[1] || "0", frac = (m[2] || "").slice(0, 18).padEnd(18, "0");
    return BigInt(whole) * 10n ** 18n + BigInt(frac || "0");
  };
  var eth = function (v) {
    v = BigInt(v);
    var w = v / 10n ** 18n, f = (v % 10n ** 18n).toString().padStart(18, "0").slice(0, 5);
    f = f.replace(/0+$/, "");
    /*  Dust is still custody. A balance that rounds to zero and prints as
        zero is a lie a holder cannot argue with.                       */
    if (v > 0n && w === 0n && f === "") return "<0.00001";
    return w.toString() + (f ? "." + f : "");
  };

  function provider() { return window.ethereum || null; }

  function call(to, data) {
    var p = provider();
    if (!p) return Promise.reject(new Error("no wallet"));
    return p.request({ method: "eth_call", params: [{ to: to, data: data }, "latest"] });
  }

  /*───────────────────────── the confirm slab ─────────────────────────*/

  /*  §E.9, finally shipped. The slab always states where the transaction
      goes, what it carries, and which function it calls — a person should
      never have to trust the lane's title over the bytes. And after the
      press, the sentence keeps moving: sent, then mined or reverted, read
      back off the wallet's own node one hash at a time. "Sent · 0x…" used
      to be the entire post-signature experience of this console, which
      left a holder refreshing a block explorer to learn whether their own
      turn had landed.                                                    */

  function watch(h) {
    var p = provider();
    if (!p) return;
    var tries = 0;
    var poll = function () {
      tries += 1;
      p.request({ method: "eth_getTransactionReceipt", params: [h] })
        .then(function (r) {
          if (r && r.blockNumber) {
            var n = parseInt(r.blockNumber, 16);
            if (r.status === "0x0") {
              say("It reverted in block " + n + ". Nothing changed.", "err");
            } else {
              say("Mined in block " + n + ". What this page shows may lag it by one.", "ok");
            }
            return;
          }
          if (tries === 22) say("Still not mined. The chain is slow or the fee was low.");
          if (tries < 45) setTimeout(poll, 4000);
          else say("Not mined after three minutes. The wallet may still land it — check there.");
        })
        /*  A wallet that cannot answer for receipts is not a failure of
            the transaction — stop asking rather than guessing.          */
        .catch(function () {});
    };
    setTimeout(poll, 4000);
  }

  function propose(title, lines, tx, fn) {
    var box = $("#cbox"), slab = $("#cslab");
    if (!box || !slab) return;

    /*  The wrong chain refuses HERE, before a slab exists — §E.5. The
        crest already offers the move; a slab built for the wrong chain is
        a trap with a countdown. Unknown is not wrong: a provider that
        cannot say its chain leaves the wallet's own guard in charge.    */
    if (C.chainOk === false) {
      return say("Your wallet is on another chain. This token lives on chain " +
                 C.chain + " — the crest offers the move.", "err");
    }

    slab.innerHTML =
      '<div class="k" style="margin-bottom:10px"></div>' +
      '<div class="body"></div>' +
      '<button class="b" type="button" data-go>1</button>' +
      '<button class="b g" type="button" data-no>Not now</button>';
    slab.querySelector(".k").textContent = title;
    var body = slab.querySelector(".body");
    var put = function (k, v) {
      var d = document.createElement("div");
      d.className = "kv";
      var a = document.createElement("span"); a.className = "k"; a.textContent = k;
      var b = document.createElement("span"); b.className = "v"; b.textContent = v;
      d.appendChild(a); d.appendChild(b); body.appendChild(d);
    };
    lines.forEach(function (l) { put(l[0], l[1]); });
    put("To", short(tx.to));
    if (tx.value) put("Value", eth(BigInt(tx.value)) + " ETH");
    if (tx.data && tx.data.length >= 10) put("Function", (fn ? fn + " · " : "") + tx.data.slice(0, 10));
    slab.querySelector("[data-go]").textContent = "Sign it";
    box.classList.add("on");

    var shut = function () { box.classList.remove("on"); };
    slab.querySelector("[data-no]").onclick = shut;
    slab.querySelector("[data-go]").onclick = function () {
      shut();
      var p = provider();
      if (!p || !C.account) return say("Connect a wallet first.", "err");
      say("Waiting for the wallet…");
      p.request({ method: "eth_sendTransaction", params: [Object.assign({ from: C.account }, tx)] })
        .then(function (h) {
          say("Sent · " + h.slice(0, 10) + "… — watching for the block.", "ok");
          watch(h);
        })
        .catch(function (e) { say(e && e.message ? e.message : "The wallet refused.", "err"); });
    };
  }
  C.propose = propose;

  /*───────────────────────── lane furniture ─────────────────────────*/

  var el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  function kv(parent, k, v) {
    var d = el("div", "kv");
    d.appendChild(el("span", "k", k));
    d.appendChild(el("span", "v", v));
    parent.appendChild(d);
    return d;
  }
  function button(parent, label, grey, fn) {
    var b = el("button", "b" + (grey ? " g" : ""), label);
    b.type = "button";
    b.addEventListener("click", fn);
    parent.appendChild(b);
    return b;
  }
  function field(parent, label, placeholder) {
    parent.appendChild(el("div", "k", label));
    var i = el("input");
    i.type = "text";
    i.placeholder = placeholder || "";
    i.autocomplete = "off";
    parent.appendChild(i);
    return i;
  }
  /*  Always with the spaces around the ellipsis, and always used: a full
      address in a 300px column runs off the edge, and an address that runs
      off the edge is one a holder cannot check.                        */
  var short = function (a) {
    return !a || /^0x0{40}$/i.test(a) ? "nobody" : a.slice(0, 6) + " \u2026 " + a.slice(-4);
  };

  function note(parent, text, cls) {
    var p = el("p", "blurb" + (cls ? " " + cls : ""), text);
    parent.appendChild(p);
    return p;
  }

  /*  A lane says what it cannot do, in the place a holder would look for
      it. A surface that is silent about its own edges teaches somebody
      that the thing they want is impossible, when it is only unbuilt.  */
  function unbuilt(parent, what) {
    var p = el("p", "s", what);
    p.style.color = "var(--warn)";
    p.style.marginTop = "16px";
    parent.appendChild(p);
  }

  var mine = function () {
    return !!(C.account && C.owner && C.account.toLowerCase() === C.owner.toLowerCase());
  };
  function onlyHolder(parent) {
    if (mine()) return true;
    note(parent, C.account
      ? "You are reading somebody else's token. Nothing here will sign."
      : "Connect a wallet to act on this token.");
    return false;
  }

  /*───────────────────────── the seven ─────────────────────────*/

  var LANE = {};

  /* 1 · TURN IT — the word is one uint256, and committing it is one call */
  LANE[1] = function (h) {
    var word = BigInt(C.word);
    var planes = ["XY", "XZ", "YZ", "XW", "YW", "ZW"];
    var vals = planes.map(function (_, i) { return Number((word >> BigInt(i * 16)) & 0xffffn); });
    var wCut = Number((word >> 96n) & 0xffffn);
    var form = Number((word >> 112n) & 0xffn);
    var hue = Number((word >> 120n) & 0xffn);

    h.appendChild(el("div", "k", "THE WORD"));
    note(h, "Six planes and a cut. The three that contain w are the ones a " +
            "three-dimensional eye has no name for, and they are the ones worth turning.");

    var inputs = [];
    planes.forEach(function (nm, i) {
      var row = el("div", "kv");
      row.appendChild(el("span", "k", nm));
      var r = el("input");
      r.type = "range"; r.min = 0; r.max = 65535; r.value = vals[i];
      r.style.flex = "1";
      /*  The three containing w are drawn dashed, the way the instrument
          marks them. A plane you cannot picture should not look like one
          you can.                                                     */
      if (i >= 3) r.style.borderBottom = "1px dashed var(--a-dim)";
      row.appendChild(r);
      h.appendChild(row);
      inputs.push(r);
    });

    var cutRow = el("div", "kv");
    cutRow.appendChild(el("span", "k", "CUT"));
    var cut = el("input");
    cut.type = "range"; cut.min = 0; cut.max = 65535; cut.value = wCut; cut.style.flex = "1";
    cutRow.appendChild(cut); h.appendChild(cutRow);

    var hueRow = el("div", "kv");
    hueRow.appendChild(el("span", "k", "HUE"));
    var hu = el("input");
    hu.type = "range"; hu.min = 0; hu.max = 255; hu.value = hue; hu.style.flex = "1";
    hueRow.appendChild(hu); h.appendChild(hueRow);
    /*  The console re-tints live, the way the instrument does, because a
        colour you cannot see before you pay for it is a colour you are
        guessing at.                                                    */
    hu.addEventListener("input", function () {
      document.documentElement.style.setProperty("--h",
        String(Math.floor(Number(hu.value) * 360 / 256)));
    });

    if (!onlyHolder(h)) return;
    button(h, "Review the turn", false, function () {
      var next = 0n;
      inputs.forEach(function (r, i) { next |= BigInt(r.value) << BigInt(i * 16); });
      next |= BigInt(cut.value) << 96n;
      next |= BigInt(form) << 112n;
      next |= BigInt(hu.value) << 120n;
      if (next === word) return say("Nothing has moved.", "err");

      /*  The slab used to print the word before and after as two raw
          decimal uint256s, which no person can audit. It says what moved
          now, plane by plane, in degrees — the word itself rides in the
          calldata the slab already names.                               */
      var deg = function (v) { return String(Math.round(v * 360 / 65536)) + "°"; };
      var linesOut = [["Token", "#" + C.id]];
      planes.forEach(function (nm, i) {
        var now = vals[i], then = Number(inputs[i].value);
        if (now !== then) linesOut.push([nm, deg(now) + " → " + deg(then)]);
      });
      if (Number(cut.value) !== wCut)
        linesOut.push(["Cut", deg(wCut) + " → " + deg(Number(cut.value))]);
      if (Number(hu.value) !== hue)
        linesOut.push(["Hue", String(Math.floor(Number(hu.value) * 360 / 256)) + "°"]);
      propose("TURN IT", linesOut,
        { to: C.hub, data: C.sel.commit + enc.uint(C.id) + enc.uint(next) },
        "commit(uint256,uint256)");
    });
  };

  /* 2 · PUT SOMETHING IN IT — the two hands */
  LANE[2] = function (h) {
    /*  The contract already printed both addresses and the permanence
        sentence. Printing them again is not belt and braces, it is two
        answers to one question with no way to tell which is current. What
        is added here is what a contract could not know or could not do:
        the balances, and the acts.                                     */
    var p = provider();
    var rows = {};
    ["reach", "grip"].forEach(function (k) {
      rows[k] = kv(h, k === "reach" ? "In the Reach" : "In the Grip", "reading\u2026");
    });
    if (!p) {
      ["reach", "grip"].forEach(function (k) {
        rows[k].lastChild.textContent = "not reported";
      });
    } else {
      [["reach", C.reach], ["grip", C.grip]].forEach(function (pair) {
        p.request({ method: "eth_getBalance", params: [pair[1], "latest"] })
          .then(function (b) { rows[pair[0]].lastChild.textContent = eth(BigInt(b)) + " ETH"; })
          /*  Not zero. Nobody answered, and those are different facts. */
          .catch(function () { rows[pair[0]].lastChild.textContent = "not reported"; });
      });
    }

    if (!onlyHolder(h)) return;
    h.appendChild(el("hr"));
    h.appendChild(el("div", "k", "BRING THEM INTO BEING"));
    note(h, "Both addresses exist as arithmetic before anything is deployed to them. " +
            "A hand that has not been embodied can still receive; it cannot yet act.");
    button(h, "Embody the Reach", true, function () {
      propose("EMBODY THE REACH", [["Token", "#" + C.id], ["Deploys", short(C.reach)]],
        { to: C.hub, data: C.sel.embody + enc.uint(C.id) });
    });
    button(h, "Embody the Grip", true, function () {
      propose("EMBODY THE GRIP", [["Token", "#" + C.id], ["Deploys", short(C.grip)]],
        { to: C.hub, data: C.sel.embodyGrip + enc.uint(C.id) });
    });

    h.appendChild(el("hr"));
    h.appendChild(el("div", "k", "PAY INTO THE GRIP"));
    var amt = field(h, "AMOUNT IN ETH", "0.0");
    button(h, "Review the payment", false, function () {
      var v = wei(amt.value);
      if (v == null || v === 0n) return say("An amount, in ether.", "err");
      propose("PAY INTO THE GRIP", [
        ["Token", "#" + C.id],
        ["To", short(C.grip)],
        ["Amount", eth(v) + " ETH"],
        ["Reversible", "no \u2014 nothing can leave the Grip"]
      ], { to: C.grip, value: "0x" + v.toString(16) });
    });
  };

  /* 3 · TRADE THROUGH IT */
  LANE[3] = function (h) {
    /*  The contract already rendered the market's state above; what is
        missing is the acts. Bit 1 is the pool, and a clear bit means the
        pool did not answer rather than that there is no market.        */
    if (!(C.reported & 2)) {
      note(h, "No market contract answered on this chain. That is not the same as this " +
              "token having no market, and the console will not print one as the other.");
      return;
    }
    unbuilt(h, "Opening a market, setting its fee, bonding its inventory and syncing " +
               "the curve are not built into the console yet. The state above is read " +
               "from the chain this block.");
  };

  /* 4 · HAND IT ON */
  LANE[4] = function (h) {
    if (!onlyHolder(h)) return;
    h.appendChild(el("div", "k", "FOR GOOD"));
    note(h, "A transfer ends everything the token was doing under you — a lease, a " +
            "session key, a consignment. It is the only one of the four that cannot be undone.");
    var to = field(h, "SEND IT TO", "0x…");
    button(h, "Review the transfer", false, function () {
      var a = String(to.value).trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return say("That is not an address.", "err");
      if (a.toLowerCase() === C.owner.toLowerCase()) return say("It is already theirs.", "err");
      propose("HAND IT ON, FOR GOOD", [
        ["Token", "#" + C.id],
        ["From", short(C.owner)],
        ["To", short(a)],
        ["Reversible", "no"]
      ], { to: C.hub, data: C.sel.xfer + enc.addr(C.owner) + enc.addr(a) + enc.uint(C.id) });
    });
    unbuilt(h, "For an afternoon, for a season and for a price — session keys, the " +
               "lease and consignment — are not built into the console yet.");

    /*  The one the console will never build, pointed at instead: a session
        key's holder is not the token's holder and does not arrive from an
        instrument, so their door is their own — /k/<id>/<key> shows what a
        granted key may do and builds its one act. Granting still happens
        at /keys, as the holder.                                          */
    var links = el("p", "s");
    var a1 = el("a", "g", "grant a bounded key at /keys");
    a1.href = "/keys";
    var a2 = el("a", "g", "a granted key's own door is /k/" + C.id + "/‹key›");
    a2.href = "/k/" + C.id + "/" + (C.account || "0x0000000000000000000000000000000000000000");
    links.appendChild(a1);
    links.appendChild(document.createTextNode(" · "));
    links.appendChild(a2);
    h.appendChild(links);
  };

  /* 5 · SPEAK AS IT */
  LANE[5] = function (h) {
    unbuilt(h, "The commons, whispers, rooms and signatures are not built into the " +
               "console yet. They are live at the collection's own contracts and the " +
               "console does not pretend otherwise.");
  };

  /* 6 · MAKE SOMETHING WITH IT */
  LANE[6] = function (h) {
    h.appendChild(el("div", "k", "DRAW THE NEXT ONE"));
    note(h, "Every token is minted on the chain whose band its number falls in. This " +
            "chain issues " + C.first + " to " + C.last + ".");

    /*  The price, read before the button and attached to the send. The
        first version claimed "read by the wallet from the contract" and
        sent no value at all — a payable mint proposed at zero, which
        reverts, on the strength of a thing no injected wallet actually
        does. The cost is stated before the button, and the button sends
        what was stated; a price that does not answer refuses to guess. */
    var price = null;
    var row = kv(h, "Price now", "reading…");
    call(C.hub, C.sel.price).then(function (r) {
      if (r && r !== "0x") {
        price = BigInt(r);
        row.lastChild.textContent = eth(price) + " ETH, to the collection";
      } else {
        row.lastChild.textContent = "not reported";
      }
    }).catch(function () { row.lastChild.textContent = "not reported"; });

    button(h, "Review the mint", false, function () {
      if (price == null)
        return say("The price did not answer, and the console will not guess a payable value.", "err");
      propose("DRAW THE NEXT ONE", [
        ["On", "chain " + C.chain],
        ["Band", "#" + C.first + " to #" + C.last]
      ], { to: C.hub, data: C.sel.mint, value: "0x" + price.toString(16) },
        "mint()");
    });
    unbuilt(h, "Launching a coin and giving the token a name are not built into the " +
               "console yet.");
  };

  /* 7 · LOOK AT ANOTHER ONE */
  LANE[7] = function (h) {
    h.appendChild(el("div", "k", "ANY OF THEM"));
    note(h, "Walking into another token adds a rule to the left margin in that token's " +
            "colour. The rule is the way back. What opens there is its still, drawn on " +
            "chain — never its instrument, because two of those on one thread is what " +
            "made a phone hot.");
    var n = field(h, "BY NUMBER", "#" + C.first);
    button(h, "Walk into it", false, function () {
      C.walkTo(String(n.value).replace(/^#/, ""));
    });

    h.appendChild(el("hr"));
    h.appendChild(el("div", "k", "NEARBY"));
    var strip = el("div");
    strip.style.marginTop = "8px";
    for (var d = -3; d <= 3; d++) {
      var id = C.id + d;
      if (d === 0 || id < C.first || id > C.last) continue;
      (function (tid) {
        var b = el("button", "chip", "#" + tid);
        b.type = "button";
        b.addEventListener("click", function () { C.walkTo(tid); });
        strip.appendChild(b);
      })(id);
    }
    h.appendChild(strip);
  };

  /*───────────────────────── arrival ─────────────────────────*/

  var lane = $("#lane");
  if (lane && C.verb && LANE[C.verb]) {
    /*  After the wallet has answered, because whether these controls may
        act depends on who is holding it, and a lane painted before that
        answer told a holder to connect while the crest said "you".     */
    Promise.resolve(C.ready).then(function () {
      /*  The contract's note says the controls need a script. They are
          about to exist, so it goes — a surface that keeps apologising
          after it has delivered is a surface nobody trusts.           */
      var n = $("#lane-note");
      if (n) n.remove();
      var hold = el("div");
      hold.style.marginTop = "14px";
      lane.appendChild(hold);
      try { LANE[C.verb](hold); }
      catch (e) { say("This lane failed to open: " + (e && e.message), "err"); }
    });
  }
})();
