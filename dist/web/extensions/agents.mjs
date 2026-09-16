import {
  getAddress,
  keccak256,
  toUtf8Bytes,
  verifyTypedData,
} from "../vendor/ethers.min.js";
import { serviceOrigin } from "./service-origin.mjs";

const f = (name, label, type, def) => ({
  name,
  label,
  type,
  ...(def === undefined ? {} : { default: def }),
});
const id = f("id", "Record number", "uint256");
const reason = f(
  "reason",
  "Evidence hash (bytes32)",
  "bytes32",
  "0x" + "00".repeat(32),
);
export const ACTIONS = [
  {
    id: "agent-session",
    label: "Authorize an exact account action",
    contract: "SovereignAccount",
    method: "grantAction",
    sender: "wallet",
    description:
      "Approve every byte of calldata and one monitored asset budget. Token allowances are exact and cleared after execution. Transfer, expiry and revocation stop this permission.",
    fields: [
      f("caller", "AgentPolicyGuard or delegated caller", "address"),
      f("target", "Reviewed target", "address"),
      f(
        "asset",
        "Budget asset (zero for native ETH)",
        "address",
        "0x" + "00".repeat(20),
      ),
      f("dataHash", "Hash of exact action calldata", "bytes32"),
      f("perCall", "Maximum asset debit per call (base units)", "uint112", "1"),
      f("budget", "Total asset debit budget (base units)", "uint112", "1"),
      f(
        "value",
        "Native value per call (zero for token budgets)",
        "uint96",
        "0",
      ),
      f("expires", "Expires at (Unix seconds)", "uint48"),
      f("maxCalls", "Maximum calls", "uint32", "1"),
    ],
  },
  {
    id: "agent-session-revoke",
    label: "Revoke account action permission",
    contract: "SovereignAccount",
    method: "revokeInstrument",
    sender: "wallet",
    description:
      "Stops the delegated action at the NFT account permission layer.",
    fields: [id],
  },
  {
    id: "agent-grant",
    label: "Schedule an authorized action",
    contract: "AgentPolicyGuard",
    method: "grantBudgeted",
    sender: "wallet",
    description:
      "Assign a worker and minimum interval to an existing exact account permission whose caller is this guard. The account enforces the real token or ETH budget.",
    fields: [
      f("account", "Your NFT account", "address"),
      f("instrumentId", "Account permission number", "uint256"),
      f("worker", "Operator wallet", "address"),
      f("data", "Exact approved calldata", "bytes"),
      f("validAfter", "Starts at (Unix seconds)", "uint48"),
      f("minInterval", "Minimum seconds between actions", "uint32", "60"),
    ],
  },
  {
    id: "agent-grant-revoke",
    label: "Revoke the repeating action",
    contract: "AgentPolicyGuard",
    method: "revoke",
    sender: "wallet",
    description:
      "The current NFT owner can stop this worker grant immediately.",
    fields: [id],
  },
  {
    id: "agent-run",
    label: "Run an approved action once",
    contract: "AgentPolicyGuard",
    method: "run",
    sender: "wallet",
    description:
      "The configured worker executes one authorized action. The onchain guard checks the current nonce, budget, exact calldata and NFT owner.",
    fields: [
      id,
      f("expectedNonce", "Current NFT action nonce", "uint256"),
      f("data", "Exact approved calldata", "bytes"),
    ],
  },
  {
    id: "agent-job-create",
    label: "Create a service job",
    contract: "AgentCommerce",
    method: "createJob",
    sender: "account",
    description:
      "Write what the provider must deliver, who judges it and when the refund clock ends. This uses the ERC-8183 draft job lifecycle.",
    fields: [
      f("provider", "Provider wallet (zero to choose later)", "address"),
      f("evaluator", "Reviewer wallet", "address"),
      f("expiredAt", "Refund deadline (Unix seconds)", "uint256"),
      f("description", "Work and acceptance terms", "string"),
      f(
        "hook",
        "Hook (zero address; non-hooked kernel)",
        "address",
        "0x" + "00".repeat(20),
      ),
    ],
  },
  {
    id: "agent-job-provider",
    label: "Choose the service provider",
    contract: "AgentCommerce",
    method: "setProvider",
    sender: "account",
    description: "Choose a provider for an open job that has none.",
    fields: [id, f("provider", "Provider wallet", "address")],
  },
  {
    id: "agent-job-budget",
    label: "Set the proposed service price",
    contract: "AgentCommerce",
    method: "setBudget",
    sender: "account",
    description:
      "Sets the job price before funding. The exact price must still match when funding.",
    fields: [id, f("amount", "Payment token base units", "uint256")],
  },
  {
    id: "agent-job-fund",
    label: "Fund the service job",
    contract: "AgentCommerce",
    method: "fund",
    sender: "account",
    approval: { assetMethod: "paymentToken", amountField: "expectedBudget" },
    description:
      "Move the reviewed payment amount into escrow. The account grants this exact token allowance for the action and resets it afterward.",
    fields: [
      id,
      f("expectedBudget", "Reviewed payment token base units", "uint256"),
    ],
  },
  {
    id: "agent-job-submit",
    label: "Submit the finished work",
    contract: "AgentCommerce",
    method: "submit",
    sender: "wallet",
    description:
      "The chosen provider submits the hash of their work. The reviewer can now accept or reject it.",
    fields: [id, f("deliverable", "Delivered work hash", "bytes32")],
  },
  {
    id: "agent-job-complete",
    label: "Accept delivered work and pay",
    contract: "AgentCommerce",
    method: "complete",
    sender: "wallet",
    description:
      "Only the chosen reviewer may accept submitted work and release payment to the provider.",
    fields: [id, reason],
  },
  {
    id: "agent-job-reject",
    label: "Reject submitted work",
    contract: "AgentCommerce",
    method: "reject",
    sender: "wallet",
    description:
      "The chosen reviewer refunds a funded/submitted job to its client. Before funding, only the client may cancel.",
    fields: [id, reason],
  },
  {
    id: "agent-job-refund",
    label: "Refund an expired service job",
    contract: "AgentCommerce",
    method: "claimRefund",
    sender: "wallet",
    description:
      "Anyone may trigger the expired-job refund. Tokens always return to the client.",
    fields: [id],
  },
  {
    id: "agent-provider-register",
    label: "Publish a signed provider card",
    contract: "ProviderDirectory",
    method: "register",
    sender: "wallet",
    description:
      "Relay a provider wallet’s exact signed metadata update. Use the host signing helper to create a card; it authenticates the wallet, not the quality of its service.",
    fields: [
      f("provider", "Provider wallet", "address"),
      f("metadataHash", "Exact metadata file hash", "bytes32"),
      f("uri", "Metadata URI", "string"),
      f("capabilities", "Capability tag hash", "bytes32"),
      f("nonce", "Provider update nonce", "uint256"),
      f("validUntil", "Card expires at (Unix seconds)", "uint48"),
      f("active", "Accepting work", "bool", true),
      f("signature", "Provider EIP-712 signature", "bytes"),
    ],
  },
  {
    id: "agent-provider-feedback",
    label: "Review a finished paid job",
    contract: "ProviderDirectory",
    method: "giveFeedback",
    sender: "account",
    description:
      "Only the paying client can record one score from -5 to +5 for this settled job, with an evidence hash. Reviews remain attributable.",
    fields: [
      f("jobId", "Paid job number", "uint256"),
      f("score", "Score (-5 to +5)", "int8", "5"),
      f("evidence", "Review evidence hash", "bytes32"),
    ],
  },
  {
    id: "agent-provider-revoke-feedback",
    label: "Withdraw a provider review",
    contract: "ProviderDirectory",
    method: "revokeFeedback",
    sender: "account",
    description:
      "The original reviewer can withdraw their feedback. Historical transactions remain visible.",
    fields: [f("jobId", "Paid job number", "uint256")],
  },
];

export const PROVIDER_TYPES = {
  Provider: [
    ["provider", "address"],
    ["metadataHash", "bytes32"],
    ["uriHash", "bytes32"],
    ["capabilities", "bytes32"],
    ["nonce", "uint256"],
    ["validUntil", "uint48"],
    ["active", "bool"],
  ].map(([name, type]) => ({ name, type })),
};
const json = (value) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v), 2);
const metadataBytes = (raw) => {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > 131072)
    throw Error("Provider metadata must fit within 128 KiB.");
  return raw;
};

/** Pure verification: endpoints are returned as data and are never requested. */
export function inspectProviderMetadata(entry, raw) {
  raw = metadataBytes(raw);
  if (keccak256(toUtf8Bytes(raw)) !== entry.metadataHash)
    throw Error("Metadata bytes do not match the provider’s signed hash.");
  const card = JSON.parse(raw);
  if (
    !card ||
    typeof card !== "object" ||
    Array.isArray(card) ||
    typeof card.name !== "string" ||
    !card.name.trim() ||
    card.name.length > 120 ||
    !Array.isArray(card.services) ||
    card.services.length > 30
  )
    throw Error(
      "Invalid provider card: a name and up to 30 services are required.",
    );
  for (const service of card.services)
    if (
      !service ||
      typeof service.name !== "string" ||
      service.name.length > 120 ||
      typeof service.endpoint !== "string" ||
      service.endpoint.length > 2048
    )
      throw Error("Invalid provider service metadata.");
  return {
    card,
    services: card.services,
    raw,
    metadataHash: entry.metadataHash,
    endpointVerified: false,
  };
}

/** Chain-only discovery. Query filters this bounded page, never silently queries service endpoints. */
export async function listProviderPage({
  registry,
  provider,
  start = 0,
  limit = 10,
  query = "",
  includeInactive = false,
}) {
  if (
    !Number.isSafeInteger(start) ||
    start < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw Error("Choose a nonnegative page offset and 1–100 providers.");
  if (typeof query !== "string" || query.length > 200)
    throw Error("Provider filter is too long.");
  const network = await provider.getNetwork(),
    block = await provider.getBlock("latest"),
    directory = getAddress(await registry.getAddress());
  const options = { blockTag: block.number };
  const [addresses, total] = await Promise.all([
    registry.list(start, limit, options),
    registry.count(options),
  ]);
  if (addresses.length > limit)
    throw Error("Directory returned too many providers.");
  const records = await Promise.all(
    addresses.map(async (address) => {
      const r = await registry.provider(address, options);
      const active = r.active && BigInt(r.validUntil) > BigInt(block.timestamp);
      return {
        address: getAddress(address),
        metadataHash: r.metadataHash,
        uri: r.uri,
        capabilities: r.capabilities,
        revision: String(r.revision),
        validUntil: Number(r.validUntil),
        active,
        endpointVerified: false,
        block: block.number,
      };
    }),
  );
  if ((await provider.getNetwork()).chainId !== network.chainId)
    throw Error("Wallet network changed while reading the directory.");
  const filter = query.trim().toLowerCase();
  return {
    chainId: String(network.chainId),
    directory,
    block: block.number,
    total: String(total),
    start,
    limit,
    next: start + addresses.length,
    scanned: addresses.length,
    hasNext: BigInt(start + addresses.length) < BigInt(total),
    providers: records.filter(
      (r) =>
        (includeInactive || r.active) &&
        (!filter ||
          [r.address, r.uri, r.capabilities].some((value) =>
            String(value).toLowerCase().includes(filter),
          )),
    ),
  };
}

/** Includes full attributable job evidence; an average uses only the selected reviewer set. */
export async function readProviderFeedback({
  registry,
  commerce,
  provider,
  address,
  fromBlock,
  toBlock,
  trustedReviewers = [],
}) {
  address = getAddress(address);
  if (
    !Number.isSafeInteger(fromBlock) ||
    !Number.isSafeInteger(toBlock) ||
    fromBlock < 0 ||
    toBlock < fromBlock ||
    toBlock - fromBlock > 10000
  )
    throw Error("Choose a feedback range of at most 10,000 blocks.");
  if (!Array.isArray(trustedReviewers) || trustedReviewers.length > 100)
    throw Error("Choose at most 100 trusted reviewers.");
  const trusted = new Set(trustedReviewers.map(getAddress));
  const snapshot = await provider.getBlock("latest"),
    network = await provider.getNetwork();
  if (toBlock > snapshot.number)
    throw Error("The feedback range ends after the current chain head.");
  if (
    getAddress(await registry.commerce({ blockTag: snapshot.number })) !==
    getAddress(await commerce.getAddress())
  )
    throw Error(
      "Selected service contract is not this directory’s immutable job source.",
    );
  const events = await registry.queryFilter(
    registry.filters.FeedbackGiven(null, address),
    fromBlock,
    toBlock,
  );
  if (events.length > 250)
    throw Error(
      "This range has more than 250 reviews. Narrow the block range.",
    );
  const reviews = [];
  for (const event of events) {
    const jobId = event.args.jobId;
    const [feedback, job, funded] = await Promise.all([
      registry.feedback(jobId, { blockTag: snapshot.number }),
      commerce.jobs(jobId, { blockTag: snapshot.number }),
      commerce.wasFunded(jobId, { blockTag: snapshot.number }),
    ]);
    if (
      getAddress(feedback.provider) !== address ||
      getAddress(job.provider) !== address ||
      getAddress(job.client) !== getAddress(feedback.reviewer) ||
      !funded ||
      ![3n, 4n, 5n].includes(BigInt(job.status))
    )
      throw Error("Feedback does not match its paid, settled job.");
    reviews.push({
      jobId: String(jobId),
      provider: address,
      reviewer: getAddress(feedback.reviewer),
      score: Number(feedback.score),
      evidence: feedback.evidence,
      revoked: feedback.revoked,
      trusted: trusted.has(getAddress(feedback.reviewer)),
      transaction: event.transactionHash,
      job: {
        client: job.client,
        evaluator: job.evaluator,
        status: [
          "Open",
          "Funded",
          "Submitted",
          "Completed",
          "Rejected",
          "Expired",
        ][Number(job.status)],
        budget: String(job.budget),
        description: job.description,
      },
    });
  }
  if ((await provider.getNetwork()).chainId !== network.chainId)
    throw Error("Wallet network changed while reading feedback.");
  const counted = reviews.filter((r) => !r.revoked && r.trusted);
  return {
    address,
    chainId: String(network.chainId),
    block: snapshot.number,
    fromBlock,
    toBlock,
    reviews,
    trustedReviewerCount: new Set(counted.map((r) => r.reviewer)).size,
    trustedAverage: counted.length
      ? counted.reduce((n, r) => n + r.score, 0) / counted.length
      : null,
    trust:
      "Signed wallets and paid jobs establish attribution. They do not certify service quality, endpoint control or independent people.",
  };
}

export async function prepareProviderRegistration({
  registry,
  provider,
  signer,
  metadata,
  uri,
  capabilities,
  validUntil,
  active = true,
}) {
  metadata = metadataBytes(metadata);
  const metadataHash = keccak256(toUtf8Bytes(metadata));
  inspectProviderMetadata({ metadataHash }, metadata);
  if (
    typeof uri !== "string" ||
    !uri.length ||
    new TextEncoder().encode(uri).length > 2048
  )
    throw Error("Choose a metadata URI of at most 2048 bytes.");
  if (
    typeof capabilities !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(capabilities)
  )
    throw Error("Capability hash must be bytes32.");
  if (typeof active !== "boolean")
    throw Error("Provider activity must be true or false.");
  const address = getAddress(await signer.getAddress()),
    network = await provider.getNetwork(),
    block = await provider.getBlock("latest");
  if (
    !/^\d+$/.test(String(validUntil)) ||
    BigInt(validUntil) <= BigInt(block.timestamp) ||
    BigInt(validUntil) > (1n << 48n) - 1n
  )
    throw Error("Choose a future card expiry.");
  const nonce = await registry.nonces(address),
    directory = getAddress(await registry.getAddress());
  return {
    schema: "anima.provider-registration/1",
    domain: {
      name: "ANIMA Provider Directory",
      version: "1",
      chainId: String(network.chainId),
      verifyingContract: directory,
    },
    message: {
      provider: address,
      metadataHash,
      uriHash: keccak256(toUtf8Bytes(uri)),
      capabilities,
      nonce: String(nonce),
      validUntil: String(validUntil),
      active,
    },
    uri,
    metadata,
  };
}

export async function validateProviderRegistration({
  registry,
  provider,
  signer,
  capsule,
  requireSignature = false,
}) {
  const c = capsule;
  if (
    c?.schema !== "anima.provider-registration/1" ||
    c.domain?.name !== "ANIMA Provider Directory" ||
    c.domain?.version !== "1"
  )
    throw Error("Invalid registration scope.");
  const m = c.message;
  inspectProviderMetadata({ metadataHash: m?.metadataHash }, c.metadata);
  if (
    keccak256(toUtf8Bytes(c.uri)) !== m.uriHash ||
    getAddress(c.domain.verifyingContract) !==
      getAddress(await registry.getAddress()) ||
    BigInt(c.domain.chainId) !== (await provider.getNetwork()).chainId ||
    getAddress(m.provider) !== getAddress(await signer.getAddress())
  )
    throw Error(
      "Registration belongs to another wallet, directory, chain or metadata URI.",
    );
  if (
    BigInt(m.nonce) !== (await registry.nonces(m.provider)) ||
    BigInt(m.validUntil) <=
      BigInt((await provider.getBlock("latest")).timestamp)
  )
    throw Error(
      "Registration nonce changed or card expired. Prepare it again.",
    );
  if (
    requireSignature &&
    getAddress(verifyTypedData(c.domain, PROVIDER_TYPES, m, c.signature)) !==
      getAddress(m.provider)
  )
    throw Error("Registration signature does not match the provider wallet.");
  return c;
}

export async function signProviderRegistration(options) {
  const c = await validateProviderRegistration(options);
  const signature = await options.signer.signTypedData(
    c.domain,
    PROVIDER_TYPES,
    c.message,
  );
  await validateProviderRegistration({
    ...options,
    capsule: { ...c, signature },
    requireSignature: true,
  });
  return { ...c, signature };
}

/** The browser only consumes configured contracts and metadata supplied by the owner. */
export function mountProviderDirectory(container, config) {
  const section = document.createElement("section");
  section.className = "extensions-provider-directory";
  let destroyed = false,
    revision = 0,
    formRevision = 0,
    page,
    selected,
    registration;
  const entries = new Map(),
    verified = new Map(),
    comparison = new Set();
  const make = (tag, text, parent = section) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    parent.append(node);
    return node;
  };
  make("h3", "Discover and compare providers");
  make(
    "p",
    "Browse the signed ANIMA directory on your selected chain. Provider cards and service endpoints are displayed as data. No provider endpoint is contacted automatically. This is an ANIMA directory, not an ERC-8004 registry.",
  );
  const labelInput = (label, type = "text", value = "", parent = section) => {
    const l = make("label", label, parent),
      input = make(type === "textarea" ? "textarea" : "input", undefined, l);
    if (type !== "textarea") input.type = type;
    input.value = value;
    input.setAttribute("aria-label", label);
    return input;
  };
  const query = labelInput(
      "Filter this page by wallet, URI or capability hash",
    ),
    offset = labelInput("Provider page offset", "number", "0"),
    limit = labelInput("Providers per page", "number", "10");
  const inactive = labelInput(
    "Include inactive or expired providers",
    "checkbox",
  );
  const status = make("p", "Choose a directory page to begin.");
  status.setAttribute("role", "status");
  const controls = make("div"),
    tableBox = make("div"),
    compareBox = make("div");
  const showError = (e) => {
    if (!destroyed) {
      status.textContent = e.message;
      config.notify?.(e.message);
    }
  };
  const button = (label, fn, parent = controls) => {
    const b = make("button", label, parent);
    b.type = "button";
    b.addEventListener("click", async () => {
      if (destroyed) return;
      b.disabled = true;
      try {
        await fn();
      } catch (e) {
        showError(e);
      } finally {
        if (!destroyed) {
          b.disabled = false;
          previous.disabled = Number(offset.value) === 0;
          next.disabled = !page?.hasNext;
        }
      }
    });
    return b;
  };
  const current = async () => {
    if (typeof config.contract !== "function")
      throw Error(
        "Configure a ProviderDirectory deployment in the extension desk.",
      );
    const registry = await config.contract("ProviderDirectory");
    const provider = config.provider ?? config.wallet?.provider;
    if (!provider) throw Error("Connect the selected chain first.");
    return { registry, provider };
  };
  const row = (parent, values, header = false) => {
    const r = make("tr", undefined, parent);
    for (const value of values) make(header ? "th" : "td", value, r);
    return r;
  };
  const compare = () => {
    compareBox.replaceChildren();
    if (!comparison.size) return;
    make("h4", "Selected providers", compareBox);
    const table = make("table", undefined, compareBox);
    row(
      make("thead", undefined, table),
      [
        "Provider",
        "Snapshot block",
        "Card name",
        "Active until",
        "Capabilities",
        "Service endpoints",
      ],
      true,
    );
    const body = make("tbody", undefined, table);
    for (const address of comparison) {
      const e = entries.get(address),
        v = verified.get(address);
      if (!e) continue;
      row(body, [
        address,
        String(e.block),
        v?.card.name ?? "Metadata not loaded",
        e.active
          ? new Date(e.validUntil * 1000).toISOString()
          : "Inactive/expired",
        e.capabilities,
        v?.services.map((s) => `${s.name}: ${s.endpoint}`).join("\n") ??
          "No verified metadata loaded",
      ]);
    }
  };
  async function loadPage(start) {
    const ticket = ++revision;
    const { registry, provider } = await current();
    const loaded = await listProviderPage({
      registry,
      provider,
      start,
      limit: Number(limit.value),
      query: query.value,
      includeInactive: inactive.checked,
    });
    if (destroyed || ticket !== revision) return;
    if (
      page &&
      (page.chainId !== loaded.chainId || page.directory !== loaded.directory)
    ) {
      entries.clear();
      verified.clear();
      comparison.clear();
      selected = null;
      selectedText.textContent =
        "Directory scope changed. Choose a provider again.";
      cardOut.textContent = "";
      feedbackOut.textContent = "";
    }
    page = loaded;
    offset.value = String(start);
    tableBox.replaceChildren();
    status.textContent = `Showing ${loaded.providers.length} matches from ${loaded.scanned} records; ${loaded.total} registered providers. Snapshot block ${loaded.block} on chain ${loaded.chainId}.`;
    const table = make("table", undefined, tableBox);
    row(
      make("thead", undefined, table),
      ["Compare", "Provider wallet", "Metadata URI", "Status", "Inspect"],
      true,
    );
    const body = make("tbody", undefined, table);
    for (const entry of loaded.providers) {
      if (verified.get(entry.address)?.metadataHash !== entry.metadataHash)
        verified.delete(entry.address);
      entries.set(entry.address, entry);
      const tr = make("tr", undefined, body),
        cell = make("td", undefined, tr),
        check = make("input", undefined, cell);
      check.type = "checkbox";
      check.checked = comparison.has(entry.address);
      check.setAttribute("aria-label", `Compare ${entry.address}`);
      check.addEventListener("change", () => {
        if (check.checked) {
          if (comparison.size >= 8) {
            check.checked = false;
            showError(Error("Compare up to eight providers at once."));
            return;
          }
          comparison.add(entry.address);
        } else comparison.delete(entry.address);
        compare();
      });
      make("td", entry.address, tr);
      make("td", entry.uri, tr);
      make("td", entry.active ? "Active" : "Inactive / expired", tr);
      button(
        "Inspect card and reviews",
        () => inspect(entry),
        make("td", undefined, tr),
      );
    }
    if (!loaded.providers.length)
      make(
        "p",
        "No providers match this page. Try the next page or clear the filter.",
        tableBox,
      );
    previous.disabled = start === 0;
    next.disabled = !loaded.hasNext;
    compare();
  }
  button("Load provider page", () => loadPage(Number(offset.value)));
  const previous = button("Previous providers", () =>
    loadPage(Math.max(0, Number(offset.value) - Number(limit.value))),
  );
  const next = button("Next providers", () =>
    loadPage(page?.next ?? Number(offset.value) + Number(limit.value)),
  );
  previous.disabled = true;
  next.disabled = true;
  make("h4", "Inspect a signed provider card");
  const selectedText = make("p", "Choose a provider above.");
  const metadata = labelInput("Exact provider metadata JSON", "textarea", "");
  metadata.rows = 8;
  const metadataFile = labelInput("Load provider metadata file", "file");
  metadataFile.accept = "application/json";
  metadataFile.addEventListener("change", async () => {
    try {
      const file = metadataFile.files?.[0];
      if (!file || file.size > 131072)
        throw Error("Choose a metadata file under 128 KiB.");
      metadata.value = await file.text();
    } catch (e) {
      showError(e);
    }
  });
  const cardOut = make("pre");
  cardOut.style.whiteSpace = "pre-wrap";
  cardOut.style.overflowWrap = "anywhere";
  const inspect = (entry) => {
    selected = entry;
    selectedText.textContent = `Provider ${entry.address} · signed metadata hash ${entry.metadataHash} · revision ${entry.revision} · URI ${entry.uri}`;
    cardOut.textContent = json(entry);
    feedbackOut.textContent = "";
    metadata.value = verified.get(entry.address)?.raw ?? "";
  };
  button(
    "Verify and display this metadata",
    () => {
      if (!selected) throw Error("Choose a provider first.");
      const value = inspectProviderMetadata(selected, metadata.value);
      verified.set(selected.address, value);
      cardOut.textContent = json({
        provider: selected.address,
        signedMetadataHash: value.metadataHash,
        endpointVerified: false,
        card: value.card,
      });
      compare();
    },
    section,
  );
  button(
    "Read embedded onchain metadata",
    () => {
      if (!selected) throw Error("Choose a provider first.");
      const uri = selected.uri;
      if (!uri.startsWith("data:application/json"))
        throw Error(
          "This URI is not embedded JSON. Supply its exact metadata file to verify it.",
        );
      const comma = uri.indexOf(",");
      if (comma < 0) throw Error("Invalid embedded metadata.");
      const encoded = uri.slice(comma + 1);
      if (encoded.length > 180000)
        throw Error("Embedded metadata is too large.");
      metadata.value = uri.slice(0, comma).includes(";base64")
        ? new TextDecoder().decode(
            Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
          )
        : decodeURIComponent(encoded);
      const value = inspectProviderMetadata(selected, metadata.value);
      verified.set(selected.address, value);
      cardOut.textContent = json({
        provider: selected.address,
        endpointVerified: false,
        card: value.card,
      });
      compare();
    },
    section,
  );
  make("h4", "Attributable feedback from paid jobs");
  const trusted = labelInput(
    "Trusted reviewer wallets (comma or space separated)",
    "textarea",
    "",
  );
  const from = labelInput("Feedback from block", "number", "0"),
    to = labelInput("Feedback through block", "number", "0");
  const feedbackOut = make("pre");
  feedbackOut.style.whiteSpace = "pre-wrap";
  feedbackOut.style.overflowWrap = "anywhere";
  button(
    "Use the latest 10,000 blocks",
    async () => {
      const { provider } = await current();
      const head = await provider.getBlockNumber();
      from.value = String(Math.max(0, head - 10000));
      to.value = String(head);
    },
    section,
  );
  button(
    "Read this provider’s paid-job feedback",
    async () => {
      if (!selected) throw Error("Choose a provider first.");
      const ticket = revision,
        address = selected.address,
        { registry, provider } = await current();
      const commerce = await config.contract(
        "AgentCommerce",
        await registry.commerce(),
      );
      const result = await readProviderFeedback({
        registry,
        commerce,
        provider,
        address,
        fromBlock: Number(from.value),
        toBlock: Number(to.value),
        trustedReviewers: trusted.value.split(/[\s,]+/).filter(Boolean),
      });
      if (!destroyed && ticket === revision && selected?.address === address)
        feedbackOut.textContent = json(result);
    },
    section,
  );
  make(
    "p",
    "The average counts only your chosen reviewers and excludes withdrawn reviews. All matching records retain their reviewer, paid job, result, evidence and transaction. Wallets can still collude.",
  );
  const publishing = make("details");
  make("summary", "Publish or update my signed provider card", publishing);
  make(
    "p",
    "Prepare the exact card, review its chain, expiry and nonce, then ask your connected wallet to sign. Publishing still goes through the normal transaction review.",
    publishing,
  );
  const card = labelInput(
      "My exact provider card JSON",
      "textarea",
      json({
        name: "My ANIMA service",
        description: "What I provide",
        services: [
          { name: "service", endpoint: "https://example.com/service" },
        ],
      }),
      publishing,
    ),
    uri = labelInput("My provider metadata URI", "text", "", publishing),
    capability = labelInput(
      "My capability name",
      "text",
      "service",
      publishing,
    ),
    expiry = labelInput(
      "My card expiry (Unix seconds)",
      "number",
      "",
      publishing,
    ),
    active = labelInput(
      "My provider card is active",
      "checkbox",
      "",
      publishing,
    );
  active.checked = true;
  const consent = labelInput(
    "I reviewed this exact provider card and signing scope",
    "checkbox",
    "",
    publishing,
  );
  const prepared = make("pre", undefined, publishing);
  prepared.style.whiteSpace = "pre-wrap";
  prepared.style.overflowWrap = "anywhere";
  const invalidate = () => {
    ++formRevision;
    registration = null;
    consent.checked = false;
    prepared.textContent = "Card changed. Prepare a new signing review.";
  };
  for (const field of [card, uri, capability, expiry, active])
    field.addEventListener("input", invalidate);
  button(
    "Use a 30-day card expiry",
    async () => {
      const { provider } = await current();
      expiry.value = String(
        (await provider.getBlock("latest")).timestamp + 30 * 86400,
      );
      invalidate();
    },
    publishing,
  );
  button(
    "Use embedded metadata URI",
    () => {
      const raw = metadataBytes(card.value);
      uri.value = "data:application/json," + encodeURIComponent(raw);
      invalidate();
    },
    publishing,
  );
  button(
    "Prepare provider signing review",
    async () => {
      const ticket = formRevision,
        { registry, provider } = await current();
      const result = await prepareProviderRegistration({
        registry,
        provider,
        signer: config.signer ?? config.wallet.signer,
        metadata: card.value,
        uri: uri.value,
        capabilities: keccak256(toUtf8Bytes(capability.value.trim())),
        validUntil: expiry.value,
        active: active.checked,
      });
      if (destroyed || ticket !== formRevision)
        throw Error("Provider form changed. Prepare a new signing review.");
      registration = result;
      consent.checked = false;
      prepared.textContent = json(registration);
    },
    publishing,
  );
  const scope = async () => {
    if (!registration || !consent.checked)
      throw Error(
        "Prepare and accept the exact provider signing review first.",
      );
    const { registry, provider } = await current();
    return {
      registry,
      provider,
      signer: config.signer ?? config.wallet.signer,
      capsule: registration,
    };
  };
  button(
    "Sign my reviewed provider card",
    async () => {
      const ticket = formRevision,
        context = await scope();
      const result = await signProviderRegistration(context);
      if (destroyed || ticket !== formRevision)
        throw Error(
          "Provider form changed during signing. Prepare a new review.",
        );
      registration = result;
      prepared.textContent = json(registration);
    },
    publishing,
  );
  button(
    "Review publication transaction",
    async () => {
      const context = await scope(),
        c = await validateProviderRegistration({
          ...context,
          requireSignature: true,
        }),
        m = c.message;
      if (typeof config.review !== "function")
        throw Error("The transaction review interface is unavailable.");
      const transaction = await context.registry.register.populateTransaction(
        m.provider,
        m.metadataHash,
        c.uri,
        m.capabilities,
        m.nonce,
        m.validUntil,
        m.active,
        c.signature,
      );
      await config.review({
        title: "Publish signed provider card",
        description: `Wallet ${m.provider} publishes this exact card until ${m.validUntil}. Services remain claims from this wallet.`,
        transaction,
        sender: "wallet",
      });
    },
    publishing,
  );
  container.append(section);
  return () => {
    destroyed = true;
    revision++;
    registration = null;
    verified.clear();
    entries.clear();
    comparison.clear();
    section.remove();
  };
}

export async function requestAgentHost({
  hostUrl,
  hostToken,
  route,
  body,
  signal,
  fetcher = fetch,
}) {
  const origin = serviceOrigin(hostUrl, "agent host");
  const endpoint = new URL(route, origin);
  if (endpoint.origin !== origin)
    throw Error("Agent requests must stay on the selected host.");
  if (typeof hostToken !== "string" || hostToken.length < 32)
    throw Error("Enter the agent host access token.");
  const response = await fetcher(endpoint, {
    method: body ? "POST" : "GET",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${hostToken}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: signal ?? AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? "Host request failed");
  return result;
}

/** Extra offchain operator/x402 controls. Host is explicitly chosen; bearer is held in memory only. */
export function mountAgentsDesk(container, config = {}) {
  const { hostUrl = "", hostToken = "", services = [] } = config;
  const removeProviders = mountProviderDirectory(container, config);
  const section = document.createElement("section");
  section.className = "extensions-agent-host";
  const title = document.createElement("h3");
  title.textContent = "Agent service host";
  section.append(title);
  const detail = document.createElement("p");
  detail.textContent =
    "Connect your configured operator host to run approved tasks or buy a service with a separate capped payment wallet. The NFT grant controls onchain actions; x402 purchases use the host’s pinned service list.";
  section.append(detail);
  const host = document.createElement("input");
  host.type = "url";
  host.placeholder = "http://127.0.0.1:8793";
  host.value = hostUrl;
  host.setAttribute("aria-label", "Configured agent host URL");
  section.append(host);
  const token = document.createElement("input");
  token.type = "password";
  token.placeholder = "Host access token";
  token.value = hostToken;
  token.autocomplete = "off";
  token.setAttribute("aria-label", "Host access token");
  section.append(token);
  const output = document.createElement("pre");
  output.setAttribute("role", "status");
  const controller = new AbortController();
  const request = async (route, body) => {
    const hostUrl = host.value,
      hostToken = token.value;
    const result = await requestAgentHost({
      hostUrl,
      hostToken,
      route,
      body,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
    });
    if (
      controller.signal.aborted ||
      host.value !== hostUrl ||
      token.value !== hostToken
    )
      throw Error("Agent host changed. Prepare a fresh request.");
    output.textContent = JSON.stringify(result, null, 2);
    return result;
  };
  const button = (label, fn) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await fn();
      } catch (e) {
        output.textContent = e.message;
      } finally {
        b.disabled = false;
      }
    });
    section.append(b);
    return b;
  };
  button("Inspect operator and payment limits", () => request("/status"));
  button("Run one approved action", () => request("/operator/tick", {}));
  button("Start continuous operator", () => request("/operator/start", {}));
  button("Stop this operator process", () => request("/operator/stop", {}));
  let reviewed;
  const service = document.createElement("select");
  service.setAttribute("aria-label", "Configured service");
  services.forEach((s, i) => {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = s.label ?? s.url;
    service.append(option);
  });
  section.append(service);
  button("Load configured services", async () => {
    const result = await request("/status");
    service.replaceChildren();
    for (const s of result.services ?? []) {
      const option = document.createElement("option");
      option.value = String(s.id);
      option.textContent = `${s.label ?? s.url} · maximum ${s.maxAmount} token units`;
      service.append(option);
    }
  });
  button("Review this service purchase", async () => {
    reviewed = await request("/purchase/review", {
      service: Number(service.value),
    });
  });
  button("Pay for the reviewed service", async () => {
    if (!reviewed?.reviewId) throw Error("Review a configured service first");
    const approval = reviewed;
    reviewed = null;
    await request("/purchase", { reviewId: approval.reviewId });
  });
  for (const field of [host, token, service])
    field.addEventListener("input", () => {
      reviewed = null;
      output.textContent =
        "Connection or service changed. Review the purchase again.";
    });
  section.append(output);
  container.append(section);
  return () => {
    controller.abort();
    reviewed = null;
    removeProviders();
    token.value = "";
    output.textContent = "";
    section.remove();
  };
}
