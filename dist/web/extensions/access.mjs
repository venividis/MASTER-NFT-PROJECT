import {
  Contract,
  Interface,
  ZeroAddress,
  formatEther,
  getAddress,
  keccak256,
  toUtf8Bytes,
  namehash,
  hexlify,
  randomBytes,
} from "../vendor/ethers.min.js";
const f = (name, label, type = "uint256", value) => ({
  name,
  label,
  type,
  ...(value === undefined ? {} : { default: value }),
});
export const ACTIONS = [
  {
    id: "sponsor-deposit",
    label: "Fund sponsored gas",
    contract: "SessionSponsor",
    method: "depositFor",
    sender: "wallet",
    description:
      "Deposit native currency for the named sponsor. Only their exact signed vouchers can spend this balance.",
    fields: [
      f("sponsor", "Sponsor wallet", "address"),
      f("amount", "Deposit in native wei"),
    ],
    valueField: "amount",
  },
  {
    id: "sponsor-withdraw",
    label: "Recover unused sponsorship",
    contract: "SessionSponsor",
    method: "withdrawDeposit",
    sender: "wallet",
    description:
      "Withdraw your unused gas deposit. Issued vouchers need sufficient funds when submitted.",
    fields: [f("amount", "Native wei"), f("recipient", "Recipient", "address")],
  },
  {
    id: "sponsor-credit",
    label: "Claim reimbursed gas",
    contract: "SessionSponsor",
    method: "withdrawCredit",
    sender: "wallet",
    description: "Relayer withdraws its accrued gas credit.",
    fields: [f("recipient", "Recipient", "address")],
  },
  {
    id: "names-bind",
    label: "Name an existing NFT",
    contract: "GenesisNames",
    method: "bind",
    sender: "wallet",
    description:
      "Bind the deterministic anima-TOKEN_ID subname under the explicitly delegated parent. Existing names cannot be overwritten.",
    fields: [f("tokenId", "NFT token ID")],
  },
  {
    id: "names-session",
    label: "Create a named mint entry",
    contract: "NamedMintFactory",
    method: "createSession",
    sender: "wallet",
    description:
      "Create your personal mint commitment slot. This does not mint an NFT or spend an endowment.",
    fields: [],
  },
  {
    id: "names-cancel",
    label: "Cancel expired named mint",
    contract: "NamedMintSession",
    method: "cancelExpired",
    sender: "wallet",
    description:
      "After 200 blocks, return an unrevealed endowment from the collection into your mint entry.",
    fields: [],
  },
  {
    id: "names-refund",
    label: "Recover cancelled mint endowment",
    contract: "NamedMintSession",
    method: "refund",
    sender: "wallet",
    description:
      "Withdraw the cancelled endowment from your mint entry to your chosen recipient.",
    fields: [f("recipient", "Recipient", "address")],
  },
];
export const SPONSOR_TYPES = {
  Request: [
    ["account", "address"],
    ["target", "address"],
    ["value", "uint256"],
    ["dataHash", "bytes32"],
    ["epoch", "uint64"],
    ["accountNonce", "uint256"],
    ["nonce", "uint256"],
    ["deadline", "uint48"],
    ["sponsor", "address"],
    ["relayer", "address"],
    ["callGas", "uint256"],
    ["maxGasPrice", "uint256"],
    ["maxRefund", "uint256"],
    ["instrumentId", "uint256"],
  ].map(([name, type]) => ({ name, type })),
};
export const sponsorDomain = (chainId, verifyingContract) => ({
  name: "ANIMA Session Sponsor",
  version: "2",
  chainId: String(chainId),
  verifyingContract: getAddress(verifyingContract),
});
export async function resolveGenesisName(provider, registryAddress, name) {
  const registry = new Contract(
      getAddress(registryAddress),
      ["function resolver(bytes32) view returns(address)"],
      provider,
    ),
    node = namehash(name),
    block = await provider.getBlockNumber(),
    resolverAddress = await registry.resolver(node, { blockTag: block });
  if (resolverAddress === ZeroAddress)
    throw Error("This name has no resolver.");
  const resolver = new Contract(
    resolverAddress,
    [
      "function nftRecord(bytes32) view returns(uint256 chainId,address nft,uint256 tokenId,address account,address holder)",
      "function addr(bytes32) view returns(address)",
    ],
    provider,
  );
  const record = await resolver.nftRecord(node, { blockTag: block });
  if (record.chainId !== (await provider.getNetwork()).chainId)
    throw Error("Switch to the NFT’s declared chain.");
  const collection = new Contract(
    record.nft,
    [
      "function accountOf(uint256) view returns(address)",
      "function ownerOf(uint256) view returns(address)",
    ],
    provider,
  );
  const [account, owner, resolved] = await Promise.all([
    collection.accountOf(record.tokenId, { blockTag: block }),
    collection.ownerOf(record.tokenId, { blockTag: block }),
    resolver.addr(node, { blockTag: block }),
  ]);
  if (
    account !== record.account ||
    resolved !== account ||
    owner !== record.holder ||
    (await provider.getCode(account, block)) === "0x"
  )
    throw Error("Name and NFT account records disagree.");
  return {
    name,
    node,
    registry: getAddress(registryAddress),
    resolver: resolverAddress,
    chainId: String(record.chainId),
    collection: record.nft,
    tokenId: String(record.tokenId),
    account,
    owner,
    block,
  };
}
export function mountAccessDesk(container, config) {
  const { wallet, contract, review, notify = () => {} } = config,
    abort = new AbortController();
  let capsule,
    mint,
    resolved,
    revision = 0,
    jobRevision = 0,
    busy = false;
  container.innerHTML =
    '<details><summary>Developer workflow: exact sponsored actions</summary><h3>Sponsored actions</h3><p>The owner grants one exact account action with an asset budget, then the owner and sponsor sign the same exact request. A relayer pays gas and receives a capped reimbursement from the sponsor’s deposit. Failed authorized attempts can use that capped reimbursement.</p><label>Target<input id="ax-target"></label><label>Exact calldata<textarea id="ax-data">0x</textarea></label><label>Native value from the NFT (wei)<input id="ax-value" value="0"></label><label>Budget asset (zero address for native ETH)<input id="ax-asset" value="0x0000000000000000000000000000000000000000"></label><label>Maximum debit in asset base units<input id="ax-budget" value="1"></label><label>Account permission number (blank uses latest)<input id="ax-grant"></label><label>Sponsor wallet<input id="ax-sponsor"></label><label>Relayer wallet<input id="ax-relayer"></label><label>Gas allotted to the account call<input id="ax-gas" value="300000"></label><label>Maximum gas price (wei)<input id="ax-price" value="10000000000"></label><label>Maximum reimbursement (wei)<input id="ax-refund" value="5000000000000000"></label><button id="ax-request">Prepare exact sponsor request</button><button id="ax-session">Review one-call asset permission</button><label>Public request and signatures<textarea id="ax-capsule" rows="10"></textarea></label><label><input type="checkbox" id="ax-sign-consent"> I reviewed this exact request, its payment source and reimbursement cap.</label><button id="ax-owner-sign">Sign as NFT owner</button><button id="ax-sponsor-sign">Sign as gas sponsor</button><button id="ax-cancel">Review voucher cancellation</button><button id="ax-relay">Review relayer submission</button></details><h3>Mint with an ENS name</h3><p>Your naming deployment must already control its ENS parent. A personal mint entry keeps your commitment separate; revealing mints the NFT and binds its deterministic subname in one transaction. ENS ancestor control and renewal rules still apply.</p><label>Recipient wallet<input id="ax-recipient"></label><label>Endowment in native wei<input id="ax-endowment" value="0"></label><button id="ax-mint-slot">Review creation of my mint entry</button><button id="ax-mint-secret">Prepare and download mint backup</button><label>Restore mint backup<input type="file" id="ax-mint-file" accept="application/json"></label><label><input id="ax-backup" type="checkbox"> I saved the mint backup securely. It contains the unrevealed mint secret.</label><button id="ax-mint-commit">Review mint commitment</button><button id="ax-mint-reveal">Review mint and name</button><p>Reveal after two blocks and within 200 blocks. Expired endowments can be recovered using the cancellation and refund actions in the developer console.</p><h3>Enter through an ENS name</h3><label>ENS registry on this chain<input id="ax-registry"></label><label>Name<input id="ax-name" placeholder="anima-1.your-domain.eth"></label><button id="ax-resolve">Resolve NFT identity</button><button id="ax-connect">Connect the resolved NFT</button><pre id="ax-status" style="white-space:pre-wrap;overflow-wrap:anywhere" role="status"></pre>';
  const $ = (id) => container.querySelector("#ax-" + id),
    value = (id) => $(id).value.trim(),
    status = (x) => {
      $("status").textContent =
        typeof x === "string" ? x : JSON.stringify(x, null, 2);
    },
    json = (x) =>
      JSON.stringify(x, (_, v) => (typeof v === "bigint" ? String(v) : v), 2);
  function on(id, fn, type = "click") {
    $(id).addEventListener(
      type,
      async () => {
        if (busy) return;
        busy = true;
        jobRevision = revision;
        for (const b of container.querySelectorAll("button")) b.disabled = true;
        try {
          await fn();
        } catch (e) {
          if (!abort.signal.aborted) {
            status(e.message);
            notify(e.message);
          }
        } finally {
          busy = false;
          for (const b of container.querySelectorAll("button"))
            b.disabled = false;
        }
      },
      { signal: abort.signal },
    );
  }
  container.addEventListener(
    "input",
    (event) => {
      revision++;
      if (event.target?.id !== "ax-sign-consent")
        $("sign-consent").checked = false;
    },
    { signal: abort.signal },
  );
  const checkJob = () => {
    if (
      abort.signal.aborted ||
      config.signal?.aborted ||
      jobRevision !== revision
    )
      throw Error("Terms changed or the panel closed. Prepare again.");
  };
  function readCapsule() {
    const c = JSON.parse(value("capsule"));
    if (
      c.schema !== "anima.sponsor-request/2" ||
      keccak256(c.data) !== c.request.dataHash
    )
      throw Error("Invalid sponsor request.");
    return c;
  }
  function renderCapsule() {
    $("capsule").value = json(capsule);
    $("sign-consent").checked = false;
    status({ request: capsule.request, domain: capsule.domain });
  }
  async function current(c) {
    await wallet.connectSigner();
    checkJob();
    const relay = await contract("SessionSponsor");
    checkJob();
    if (
      c.domain.verifyingContract.toLowerCase() !==
        (await relay.getAddress()).toLowerCase() ||
      BigInt(c.domain.chainId) !== wallet.chainId ||
      c.domain.name !== "ANIMA Session Sponsor" ||
      c.domain.version !== "2"
    )
      throw Error("Request belongs to another chain or sponsor relay.");
    checkJob();
    return relay;
  }
  const reviewTx = (title, description, transaction) => {
    checkJob();
    return review({ title, description, transaction, sender: "wallet" });
  };
  on("request", async () => {
    await wallet.assertOwner();
    const relay = await contract("SessionSponsor"),
      data = value("data");
    if (!/^0x[\da-f]{8}(?:[\da-f]{2})*$/i.test(data))
      throw Error("Choose an exact function call.");
    const now = (await wallet.provider.getBlock("latest")).timestamp;
    const permissions = new Contract(
      wallet.account,
      [
        "function instrumentGrantCount() view returns(uint256)",
        "function actionGrant(uint256) view returns(tuple(bytes32 adoption,address caller,address target,address asset,bytes32 dataHash,bytes32 targetCodeHash,uint112 perCall,uint112 remaining,uint96 value,uint48 expires,uint64 epoch,uint32 callsRemaining,bool revoked))",
      ],
      wallet.provider,
    );
    const instrumentId =
        value("grant") || String(await permissions.instrumentGrantCount()),
      g = await permissions.actionGrant(instrumentId);
    const epoch = await wallet.contract.sessionEpoch();
    const targetCode = await wallet.provider.getCode(g.target);
    checkJob();
    if (
      g.caller.toLowerCase() !== (await relay.getAddress()).toLowerCase() ||
      g.target !== getAddress(value("target")) ||
      g.dataHash !== keccak256(data) ||
      g.value !== BigInt(value("value")) ||
      g.revoked ||
      g.expires <= now ||
      g.callsRemaining === 0n ||
      g.remaining === 0n ||
      g.remaining < g.value ||
      g.epoch !== epoch ||
      targetCode === "0x" ||
      keccak256(targetCode) !== g.targetCodeHash
    )
      throw Error("Create and confirm the exact account permission first.");
    capsule = {
      schema: "anima.sponsor-request/2",
      domain: sponsorDomain(wallet.chainId, await relay.getAddress()),
      data,
      request: {
        account: wallet.account,
        target: getAddress(value("target")),
        value: value("value"),
        dataHash: keccak256(data),
        epoch: String(epoch),
        accountNonce: String(await wallet.contract.actionNonce()),
        nonce: BigInt(hexlify(randomBytes(16))).toString(),
        deadline: String(Math.min(now + 3600, Number(g.expires))),
        instrumentId: String(instrumentId),
        sponsor: getAddress(value("sponsor")),
        relayer: getAddress(value("relayer")),
        callGas: value("gas"),
        maxGasPrice: value("price"),
        maxRefund: value("refund"),
      },
    };
    checkJob();
    renderCapsule();
  });
  on("session", async () => {
    await wallet.assertOwner();
    const relay = await contract("SessionSponsor"),
      data = value("data"),
      amount = BigInt(value("budget")),
      now = (await wallet.provider.getBlock("latest")).timestamp;
    if (!/^0x[\da-f]{8}(?:[\da-f]{2})*$/i.test(data) || amount <= 0n)
      throw Error("Choose exact calldata and a positive asset debit cap.");
    const iface = new Interface([
      "function grantAction(address,address,address,bytes32,uint112,uint112,uint96,uint48,uint32)",
    ]);
    await reviewTx(
      "Authorize sponsored action",
      "One exact call, " +
        amount +
        " base units maximum asset debit, one hour. Confirm this transaction before preparing the sponsor request.",
      {
        to: wallet.account,
        data: iface.encodeFunctionData("grantAction", [
          await relay.getAddress(),
          getAddress(value("target")),
          getAddress(value("asset")),
          keccak256(data),
          amount,
          amount,
          BigInt(value("value")),
          now + 3600,
          1,
        ]),
        value: 0n,
      },
    );
  });
  for (const [id, field, role] of [
    ["owner-sign", "ownerSignature", "owner"],
    ["sponsor-sign", "sponsorSignature", "sponsor"],
  ])
    on(id, async () => {
      if (!$("sign-consent").checked)
        throw Error("Review and accept the exact request first.");
      const candidate = readCapsule();
      await current(candidate);
      let expected = candidate.request.sponsor;
      if (role === "owner")
        expected = await new Contract(
          candidate.request.account,
          ["function currentOwner() view returns(address)"],
          wallet.provider,
        ).currentOwner();
      if (expected.toLowerCase() !== wallet.address.toLowerCase())
        throw Error("Connect the " + role + " wallet.");
      checkJob();
      const signing = {
        address: wallet.address.toLowerCase(),
        chainId: String(wallet.chainId),
        signer: wallet.signer,
      };
      const signature = await signing.signer.signTypedData(
        candidate.domain,
        SPONSOR_TYPES,
        candidate.request,
      );
      checkJob();
      if (
        signing.address !== wallet.address?.toLowerCase() ||
        signing.chainId !== String(wallet.chainId) ||
        signing.signer !== wallet.signer
      )
        throw Error(
          "Wallet or network changed while signing. The returned signature was discarded.",
        );
      candidate[field] = signature;
      capsule = candidate;
      renderCapsule();
      status(
        "Signature added. Copy this public request to the other signer or relayer; it contains no wallet private key.",
      );
    });
  on("cancel", async () => {
    const c = readCapsule(),
      relay = await current(c);
    await reviewTx(
      "Cancel sponsor voucher",
      "Stops this exact signed request.",
      await relay.cancel.populateTransaction(c.request),
    );
  });
  on("relay", async () => {
    const c = readCapsule(),
      relay = await current(c);
    if (!c.ownerSignature || !c.sponsorSignature)
      throw Error("Both signatures are required.");
    await reviewTx(
      "Submit sponsored action",
      "Relayer pays gas; sponsor reimburses up to " +
        c.request.maxRefund +
        " wei, even if the authorized inner call fails.",
      await relay.relay.populateTransaction(
        c.request,
        c.data,
        c.ownerSignature,
        c.sponsorSignature,
      ),
    );
  });
  async function mintSession() {
    await wallet.connectSigner();
    const factory = await contract("NamedMintFactory"),
      address = await factory.sessionOf(wallet.address);
    if (address === ZeroAddress) throw Error("Create your mint entry first.");
    return {
      factory,
      session: await contract("NamedMintSession", address),
      address,
    };
  }
  on("mint-slot", async () =>
    reviewTx(
      "Create named mint entry",
      "Creates a personal commitment slot; no NFT is minted yet.",
      await (
        await contract("NamedMintFactory")
      ).createSession.populateTransaction(),
    ),
  );
  on("mint-secret", async () => {
    const { session, address } = await mintSession();
    mint = {
      schema: "anima.named-mint/1",
      chainId: String(wallet.chainId),
      session: address,
      collection: await session.collection(),
      recipient: getAddress(value("recipient")),
      endowment: value("endowment"),
      secret: hexlify(randomBytes(32)),
    };
    const url = URL.createObjectURL(
        new Blob([json(mint)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "anima-mint-secret.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    $("backup").checked = false;
    status("Mint backup downloaded. Save it securely before committing.");
  });
  on(
    "mint-file",
    async () => {
      const file = $("mint-file").files[0];
      if (!file || file.size > 8192)
        throw Error("Choose a mint backup under 8 KiB.");
      mint = JSON.parse(await file.text());
      if (mint.schema !== "anima.named-mint/1")
        throw Error("Invalid mint backup.");
      $("recipient").value = mint.recipient;
      $("endowment").value = mint.endowment;
      status("Backup loaded in memory. Verify its recipient and amount.");
    },
    "change",
  );
  async function boundMint() {
    if (!mint || !$("backup").checked)
      throw Error("Prepare or restore your saved mint backup first.");
    const { session, address } = await mintSession();
    if (
      BigInt(mint.chainId) !== wallet.chainId ||
      mint.session.toLowerCase() !== address.toLowerCase() ||
      (await session.collection()).toLowerCase() !==
        mint.collection.toLowerCase() ||
      getAddress(value("recipient")) !== getAddress(mint.recipient) ||
      BigInt(value("endowment")) !== BigInt(mint.endowment)
    )
      throw Error("Mint backup and current selection differ.");
    return session;
  }
  on("mint-commit", async () => {
    const session = await boundMint(),
      collection = new Contract(
        mint.collection,
        [
          "function commitmentFor(address,bytes32,address) view returns(bytes32)",
        ],
        wallet.provider,
      ),
      hash = await collection.commitmentFor(
        mint.session,
        mint.secret,
        mint.recipient,
      );
    await reviewTx(
      "Commit named mint",
      "Endow the future NFT with " +
        mint.endowment +
        " wei. Keep the backup for reveal.",
      await session.commit.populateTransaction(hash, {
        value: BigInt(mint.endowment),
      }),
    );
  });
  on("mint-reveal", async () => {
    const session = await boundMint();
    await reviewTx(
      "Mint NFT and bind ENS subname",
      "Reveals your mint secret and creates the recipient’s NFT account and deterministic ENS subname atomically.",
      await session.reveal.populateTransaction(mint.secret, mint.recipient),
    );
  });
  on("resolve", async () => {
    await wallet.connectSigner();
    resolved = await resolveGenesisName(
      wallet.provider,
      value("registry"),
      value("name"),
    );
    status(resolved);
  });
  on("connect", async () => {
    if (!resolved) throw Error("Resolve a name first.");
    const fresh = await resolveGenesisName(
      wallet.provider,
      resolved.registry,
      resolved.name,
    );
    if (
      fresh.collection !== resolved.collection ||
      fresh.tokenId !== resolved.tokenId
    )
      throw Error("Name changed. Resolve it again.");
    await wallet.connect(fresh.collection, fresh.tokenId);
    status("Connected named NFT " + fresh.name);
  });
  on(
    "capsule",
    () => {
      $("sign-consent").checked = false;
    },
    "input",
  );
  return () => {
    abort.abort();
    capsule = null;
    mint = null;
    container.replaceChildren();
  };
}
export const DEPLOYMENTS = {
  SessionSponsor: { args: [], value: "0" },
  GenesisNames: {
    args: ["ENS registry", "collection", "delegated parent namehash:bytes32"],
    value: "0",
  },
  NamedMintFactory: { args: ["GenesisNames"], value: "0" },
};
