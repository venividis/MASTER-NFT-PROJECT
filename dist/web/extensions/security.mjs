import {
  Contract,
  ZeroAddress,
  getAddress,
  keccak256,
  toUtf8Bytes,
  formatUnits,
} from "../vendor/ethers.min.js";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const json = (v) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? String(x) : x), 2);
export function trackedBalanceText(balance, decimals, readable = true) {
  if (!readable) return "Unknown";
  try {
    if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 80)
      return formatUnits(balance, decimals);
  } catch {}
  return String(balance) + " base units";
}
const ACCOUNT = [
  "function instrumentGrantCount() view returns(uint256)",
  "function actionGrant(uint256) view returns(tuple(bytes32 adoption,address caller,address target,address asset,bytes32 dataHash,bytes32 targetCodeHash,uint112 perCall,uint112 remaining,uint96 value,uint48 expires,uint64 epoch,uint32 callsRemaining,bool revoked))",
];
export function mountSecurityDesk(
  container,
  { wallet, contract, review, signal },
) {
  const controller = new AbortController();
  let revision = 0,
    busy = false,
    cell;
  const aborted = () => controller.signal.aborted || signal?.aborted;
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  container.innerHTML = `<section><h3>Your NFT’s authority</h3><p>Review exactly who can operate this account and revoke a permission immediately. Each permission fixes the target, every byte of the call, one asset budget and an expiry.</p><button data-sec="permissions">Read current permissions</button><label>Start from permission number<input data-field="start" value="1" inputmode="numeric"></label><div data-sec-grants></div></section><section><h3>Agent identity</h3><p>Verify ownership of the agent token in your selected registry. A verified link proves current ownership there; it does not authenticate an endpoint or promise service quality.</p><button data-sec="identity">Check identity</button><label>Identity registry<input data-field="registry" autocomplete="off"></label><label>Agent token number<input data-field="agent" inputmode="numeric"></label><label>Binding statement<textarea data-field="statement" placeholder="Describe this agent’s role"></textarea></label><button data-sec="bind">Review identity link</button><button data-sec="unbind">Review removal of identity link</button></section><section><h3>Experimental asset recovery</h3><p>An unreadable token remains an unresolved asset. Isolating it allows unrelated operations while preserving its address, evidence and status. Isolation does not prove that debts or approvals have been resolved.</p><label>Experiment cell<input data-field="cell" autocomplete="off"></label><button data-sec="discover">Find this NFT’s cell</button><button data-sec="assets">Read asset health</button><div data-sec-assets></div><label>Reason for isolating an unreadable asset<textarea data-field="reason" placeholder="Record what failed and the evidence you reviewed"></textarea></label></section><pre data-sec-status role="status" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>`;
  const field = (k) => container.querySelector(`[data-field="${k}"]`),
    status = (v) => {
      if (!aborted())
        container.querySelector("[data-sec-status]").textContent =
          typeof v === "string" ? v : json(v);
    };
  const check = (ticket) => {
    if (aborted() || ticket !== revision)
      throw Error(
        "This view or its terms changed. Read the current state again.",
      );
  };
  const reviewCall = async (
    ticket,
    title,
    description,
    c,
    method,
    args = [],
  ) => {
    await wallet.assertOwner();
    const transaction = await c[method].populateTransaction(...args);
    check(ticket);
    return review({ title, description, transaction, sender: "wallet" });
  };
  const readCell = async () => {
    const c = await contract(
      "ExperimentCell",
      getAddress(field("cell").value.trim()),
    );
    if ((await c.root()).toLowerCase() !== wallet.account.toLowerCase())
      throw Error("This cell belongs to another NFT account.");
    return c;
  };
  container.addEventListener("input", () => revision++, {
    signal: controller.signal,
  });
  container.addEventListener(
    "click",
    async (event) => {
      const button = event.target.closest("[data-sec]");
      if (!button || busy || aborted()) return;
      busy = true;
      const ticket = revision;
      try {
        await wallet.connectSigner();
        if (!wallet.account) throw Error("Connect the NFT first.");
        const op = button.dataset.sec;
        if (op === "permissions") {
          const a = new Contract(wallet.account, ACCOUNT, wallet.provider),
            start = Number(field("start").value),
            count = Number(await a.instrumentGrantCount()),
            epoch = await wallet.contract.sessionEpoch();
          if (!Number.isSafeInteger(start) || start < 1)
            throw Error("Choose a positive permission number.");
          const rows = [];
          for (let id = start; id <= Math.min(count, start + 19); id++) {
            const g = await a.actionGrant(id);
            rows.push({
              id,
              ...Object.fromEntries(
                [
                  "caller",
                  "target",
                  "asset",
                  "dataHash",
                  "perCall",
                  "remaining",
                  "expires",
                  "epoch",
                  "callsRemaining",
                  "revoked",
                  "value",
                  "targetCodeHash",
                ].map((k) => [k, g[k]]),
              ),
              active:
                !g.revoked &&
                g.epoch === epoch &&
                g.callsRemaining > 0n &&
                g.remaining > 0n &&
                g.remaining >= g.value &&
                keccak256(await wallet.provider.getCode(g.target)) ===
                  g.targetCodeHash &&
                g.expires >
                  BigInt((await wallet.provider.getBlock("latest")).timestamp),
            });
          }
          check(ticket);
          container.querySelector("[data-sec-grants]").innerHTML = rows.length
            ? rows
                .map(
                  (g) =>
                    `<article><h4>Permission ${g.id} · ${g.active ? "Active" : "Inactive"}</h4><p>Caller <code>${esc(g.caller)}</code></p><p>Target <code>${esc(g.target)}</code></p><p>Budget asset <code>${g.asset === ZeroAddress ? "ETH" : esc(g.asset)}</code> · ${g.remaining} base units left · ${g.callsRemaining} calls</p><details><summary>Exact committed terms</summary><pre>${esc(json(g))}</pre></details>${g.active ? `<button data-sec="revoke:${g.id}">Review revocation</button>` : ""}</article>`,
                )
                .join("")
            : "<p>No permissions in this page.</p>";
          status(
            `${count} permission records. NFT transfers invalidate earlier authority.`,
          );
        } else if (op.startsWith("revoke:")) {
          const a = await contract("SovereignAccount");
          await reviewCall(
            ticket,
            "Revoke delegated action",
            "Immediately stops this exact account permission.",
            a,
            "revokeInstrument",
            [op.split(":")[1]],
          );
        } else if (op === "identity") {
          const c = await contract("IDontFuckingBelieveIt"),
            state = await c.agentBindingStatus(wallet.tokenId),
            being = await c.organismOf(wallet.tokenId);
          check(ticket);
          status({
            verified: state.verified,
            registry: being.agentRegistry,
            agentId: being.agentId,
            currentAgentOwner: state.agentOwner,
            registryCodeHash: state.codeHash,
          });
        } else if (op === "bind") {
          const statement = field("statement").value.trim();
          if (!statement) throw Error("Describe the identity link first.");
          await reviewCall(
            ticket,
            "Link agent identity",
            "Publicly links this NFT to a registry agent token currently owned by you or this NFT account.",
            await contract("IDontFuckingBelieveIt"),
            "bindERC8004",
            [
              wallet.tokenId,
              getAddress(field("registry").value.trim()),
              field("agent").value.trim(),
              keccak256(toUtf8Bytes(statement)),
            ],
          );
        } else if (op === "unbind") {
          await reviewCall(
            ticket,
            "Remove agent identity link",
            "Clears the current claim. Earlier transactions remain public.",
            await contract("IDontFuckingBelieveIt"),
            "unbindERC8004",
            [wallet.tokenId],
          );
        } else if (op === "discover") {
          const factory = await contract("ExperimentCellFactory"),
            address = await factory.cellOf(wallet.account);
          check(ticket);
          if (address === ZeroAddress)
            throw Error("This factory has no cell for the NFT.");
          field("cell").value = address;
          status("Cell found. Read asset health to inspect it.");
        } else if (op === "assets") {
          cell = await readCell();
          const rows = [];
          for (let i = 0; i < 32; i++) {
            let asset;
            try {
              asset = await cell.tracked(i);
            } catch {
              break;
            }
            const s = await cell.assetStatus(asset);
            let label = asset === ZeroAddress ? "ETH" : asset,
              decimals = asset === ZeroAddress ? 18 : null;
            if (asset !== ZeroAddress) {
              try {
                const token = new Contract(
                  asset,
                  [
                    "function symbol() view returns(string)",
                    "function decimals() view returns(uint8)",
                  ],
                  wallet.provider,
                );
                label = String(await token.symbol()).slice(0, 80);
                decimals = Number(await token.decimals());
              } catch {}
            }
            rows.push({
              asset,
              state: Number(s.state),
              readable: s.readable,
              amount: trackedBalanceText(s.balance, decimals, s.readable),
              label,
            });
          }
          check(ticket);
          const unresolved = await cell.unresolvedAssets();
          check(ticket);
          container.querySelector("[data-sec-assets]").innerHTML = rows
            .map(
              (r) =>
                `<article><h4>${esc(r.label)} · ${esc(r.amount)}</h4><p><code>${esc(r.asset)}</code></p><p>${r.state === 1 ? "Isolated; unresolved asset" : r.readable ? "Balance readable" : "Balance unreadable; unrelated execution blocked until explicitly isolated"}</p>${r.asset !== ZeroAddress ? (r.state === 1 && r.readable ? `<button data-sec="restore:${r.asset}">Review restoration</button>` : r.state === 0 && !r.readable ? `<button data-sec="quarantine:${r.asset}">Review isolation</button>` : r.state === 0 && /^0(?:\.0+)?(?: base units)?$/.test(r.amount) ? `<button data-sec="retire:${r.asset}">Retire empty tracking slot</button>` : "") : ""}</article>`,
            )
            .join("");
          status(
            `${unresolved} unresolved tracked assets. Untracked assets and external liabilities are not certified.`,
          );
        } else if (/^(quarantine|restore|retire):/.test(op)) {
          const [method, asset] = op.split(":"),
            c = await readCell(),
            args = [asset];
          if (method === "quarantine") {
            const reason = field("reason").value.trim();
            if (!reason) throw Error("Record the failure and evidence first.");
            args.push(keccak256(toUtf8Bytes(reason)));
          }
          await reviewCall(
            ticket,
            method === "quarantine"
              ? "Isolate unreadable asset"
              : method === "restore"
                ? "Restore asset monitoring"
                : "Retire zero-balance tracking slot",
            "The transaction preserves the asset history and checks its current state on chain.",
            c,
            method,
            args,
          );
        }
      } catch (error) {
        status(error.shortMessage || error.message);
      } finally {
        busy = false;
      }
    },
    { signal: controller.signal },
  );
  return () => {
    revision++;
    controller.abort();
    container.replaceChildren();
  };
}
