import {
  AbiCoder,
  Contract,
  ContractFactory,
  getAddress,
  getCreateAddress,
  keccak256,
  ZeroAddress,
  ZeroHash,
} from "../vendor/ethers.min.js";
import { GOVERNANCE_ARTIFACTS } from "./artifacts.mjs";
import {
  verifyAccountRuntime,
  NFTAccountSession,
} from "../launchpad/account-session.mjs";

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const uint = (value, label) => {
  try {
    const n = BigInt(value);
    if (n < 0n) throw Error();
    return n;
  } catch {
    throw Error(`${label} must be a nonnegative integer in base units.`);
  }
};
const json = (value) =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
const ACCOUNT_ABI = [
  "function actionNonce() view returns(uint256)",
  "function sessionEpoch() view returns(uint64)",
  "function mode() view returns(uint8)",
  "function currentOwner() view returns(address)",
  "function collection() view returns(address)",
  "function tokenId() view returns(uint256)",
  "function instrumentGrantCount() view returns(uint256)",
];
const COLLECTION_ABI = [
  "function ownerOf(uint256) view returns(address)",
  "function accountOf(uint256) view returns(address)",
  "function approve(address,uint256)",
  "event Approval(address indexed owner,address indexed approved,uint256 indexed tokenId)",
];

export async function verifyGovernanceContract(
  provider,
  address,
  name = "OperatingNFTGovernance",
  blockTag = "latest",
) {
  address = getAddress(address);
  const a = GOVERNANCE_ARTIFACTS[name];
  if (!a) throw Error("Unknown ownership contract.");
  let code = (await provider.getCode(address, blockTag)).slice(2).toLowerCase();
  if (code.length !== a.bytes * 2)
    throw Error("Ownership runtime size does not match this NFT edition.");
  for (const group of a.immutableGroups) {
    let first;
    for (const m of group) {
      const word = code.slice(m.start * 2, (m.start + m.length) * 2);
      if (first !== undefined && first !== word)
        throw Error("Inconsistent immutable ownership policy.");
      first = word;
    }
    for (const m of group)
      code =
        code.slice(0, m.start * 2) +
        "0".repeat(m.length * 2) +
        code.slice((m.start + m.length) * 2);
  }
  if (keccak256("0x" + code) !== a.normalizedHash)
    throw Error("Ownership runtime is not this source-verified edition.");
  return new Contract(address, a.abi, provider);
}

/** All writes enter the shared exact transaction review; no wallet signature is requested here. */
export class GovernanceClient {
  constructor({ chain }) {
    if (!chain) throw Error("A shared transaction controller is required.");
    this.chain = chain;
    this.contract = null;
    this.address = null;
    this.binding = null;
  }
  async context() {
    await this.chain.assertContext();
    if (this.chain.execution?.mode === "nft")
      throw Error(
        "Use your signing wallet for ownership votes and setup. The governance contract itself operates its NFT account.",
      );
    return `${this.chain.chainId}:${this.chain.address}`;
  }
  async configure(address) {
    const binding = await this.context(),
      c = await verifyGovernanceContract(this.chain.provider, address),
      s = await verifyGovernanceContract(
        this.chain.provider,
        await c.shares(),
        "OperatingVotingShares",
      );
    if (!same(await s.governance(), await c.getAddress()))
      throw Error("Voting shares point to a different custodian.");
    verifyAccountRuntime(
      await this.chain.provider.getCode(await c.collection()),
      "IDontFuckingBelieveIt",
    );
    verifyAccountRuntime(
      await this.chain.provider.getCode(await c.account()),
      "SovereignAccount",
    );
    if (binding !== (await this.context())) throw Error("Wallet changed.");
    this.contract = c;
    this.shares = s;
    this.address = await c.getAddress();
    this.binding = binding;
    return this.snapshot();
  }
  async require() {
    if (!this.contract || this.binding !== (await this.context()))
      throw Error(
        "Open and verify an ownership contract for this wallet/network.",
      );
    return this.contract;
  }
  async snapshot({ before } = {}) {
    const c = await this.require(),
      block = await this.chain.provider.getBlock("latest"),
      opts = { blockTag: block.number };
    const names = [
      "collection",
      "tokenId",
      "account",
      "shares",
      "issuer",
      "deposited",
      "exited",
      "quorumBps",
      "supportBps",
      "buyoutBps",
      "proposalBps",
      "votingPeriod",
      "executionDelay",
      "minimumBuyoutPrice",
      "originalSupply",
      "proposalCount",
      "redemptionPool",
      "outstandingNative",
      "custodyEpoch",
      "disclosure",
      "obligationsRoot",
    ];
    const values = await Promise.all(names.map((n) => c[n](opts))),
      state = Object.fromEntries(names.map((n, i) => [n, values[i]]));
    state.totalSupply = await this.shares.totalSupply(opts);
    state.balance = await c.balanceOf(this.chain.address, opts);
    state.refund = await c.refunds(this.chain.address, opts);
    state.block = block.number;
    state.timestamp = block.timestamp;
    state.address = this.address;
    state.chainId = this.chain.chainId;
    state.assets = [];
    const count = await c.trackedAssetCount(opts);
    for (let i = 0n; i < count; i++)
      state.assets.push(await c.trackedAssets(i, opts));
    state.proposals = [];
    const start =
      before === undefined
        ? state.proposalCount
        : uint(before, "Earlier proposal");
    if (start > state.proposalCount)
      throw Error("Proposal number exceeds the chain count.");
    for (let id = start; id > 0n && id > start - 20n; id--) {
      const p = await c.proposal(id, opts);
      state.proposals.push({
        id,
        proposer: p.proposer,
        kind: Number(p.kind),
        snapshot: p.snapshot,
        voteEnd: p.voteEnd,
        eta: p.eta,
        yes: p.yes,
        no: p.no,
        executed: p.executed,
        cancelled: p.cancelled,
        payload: p.payload,
        details: this.decode(p),
        voted: await c.voted(id, this.chain.address, opts),
        successful: await c.successful(id, opts),
      });
    }
    state.nextProposal = start > 20n ? start - 20n : 0n;
    return json(state);
  }
  decode(p) {
    const coder = AbiCoder.defaultAbiCoder(),
      actionType =
        this.contract.interface.getFunction("proposeAction").inputs[0];
    switch (Number(p.kind)) {
      case 0:
        return coder.decode([actionType], p.payload)[0].toObject();
      case 1: {
        const [caller, action, budget, maxCalls, expires] = coder.decode(
          ["address", actionType, "uint112", "uint32", "uint48"],
          p.payload,
        );
        return { caller, action: action.toObject(), budget, maxCalls, expires };
      }
      case 2:
        return { operatorProposal: coder.decode(["uint256"], p.payload)[0] };
      case 3: {
        const [recipient, price, accountNonce, obligations] = coder.decode(
          ["address", "uint256", "uint256", "bytes32"],
          p.payload,
        );
        return { recipient, price, accountNonce, obligations };
      }
      case 4:
        return { asset: coder.decode(["address"], p.payload)[0] };
      default:
        throw Error("Unknown proposal kind.");
    }
  }
  async prepareDeploy({
    collection,
    tokenId,
    holders,
    amounts,
    assets = [],
    policy,
    disclosure,
  }) {
    await this.context();
    collection = getAddress(collection);
    tokenId = uint(tokenId, "NFT number");
    await NFTAccountSession.connect(this.chain.provider, this.chain.address, {
      collection,
      tokenId,
    });
    const a = GOVERNANCE_ARTIFACTS.OperatingNFTGovernance;
    if (keccak256(a.bytecode) !== a.creationHash)
      throw Error("Ownership deployment integrity failed.");
    const nft = new Contract(collection, COLLECTION_ABI, this.chain.provider),
      owner = await nft.ownerOf(tokenId),
      account = new Contract(
        await nft.accountOf(tokenId),
        ACCOUNT_ABI,
        this.chain.provider,
      );
    if (
      !same(owner, this.chain.address) ||
      !same(await account.collection(), collection) ||
      (await account.tokenId()) !== tokenId ||
      (await account.mode()) !== 0n ||
      (await account.actionNonce()) !== 0n ||
      (await account.instrumentGrantCount()) !== 0n
    )
      throw Error(
        "Operating custody requires your unused Bound NFT, with no earlier account actions or instrument grants.",
      );
    const args = [
        collection,
        tokenId,
        this.chain.address,
        holders.map(getAddress),
        amounts.map((x) => uint(x, "Share amount")),
        assets.map(getAddress),
        policy,
        disclosure,
      ],
      request = await new ContractFactory(
        a.abi,
        a.bytecode,
      ).getDeployTransaction(...args),
      nonce = await this.chain.provider.getTransactionCount(
        this.chain.address,
        "pending",
      );
    request.nonce = nonce;
    return this.chain.prepareExternal({
      kind: "governance-deploy",
      request,
      meta: {
        predictedAddress: getCreateAddress({ from: this.chain.address, nonce }),
        collection,
        tokenId: String(tokenId),
      },
      summary: {
        purpose: "Deploy operating shared ownership",
        description:
          "A separate operating custodian with immutable voting and buyout policies. Your NFT moves only in the later approval and deposit steps.",
        policy: json(policy),
        distribution: holders.map((holder, i) => ({
          holder,
          amount: String(amounts[i]),
        })),
        disclosure,
        creationHash: a.creationHash,
      },
    });
  }
  async action(input) {
    const c = await this.require(),
      account = new Contract(
        await c.account(),
        ACCOUNT_ABI,
        this.chain.provider,
      ),
      target = getAddress(input.target),
      conditionTarget = input.conditionTarget
        ? getAddress(input.conditionTarget)
        : ZeroAddress;
    const code = await this.chain.provider.getCode(target);
    if (code === "0x")
      throw Error("The operation target must be a deployed contract.");
    return {
      target,
      targetCodeHash: keccak256(code),
      inputAsset: input.inputAsset ? getAddress(input.inputAsset) : ZeroAddress,
      maxInput: uint(input.maxInput || 0, "Maximum input"),
      value: uint(input.value || 0, "Native value"),
      outputAsset: input.outputAsset
        ? getAddress(input.outputAsset)
        : ZeroAddress,
      minOutput: uint(input.minOutput || 0, "Minimum output"),
      expectedNonce: await account.actionNonce(),
      deadline: uint(input.deadline, "Deadline"),
      data: input.data,
      conditionTarget,
      conditionCodeHash: same(conditionTarget, ZeroAddress)
        ? ZeroHash
        : keccak256(await this.chain.provider.getCode(conditionTarget)),
      conditionData: input.conditionData || "0x",
      conditionResultHash: input.conditionResultHash || ZeroHash,
      priorObligations: await c.obligationsRoot(),
      nextObligations: input.nextObligations || (await c.obligationsRoot()),
    };
  }
  async prepare(action, input = {}) {
    const c = await this.require();
    let request,
      purpose,
      details = {};
    const id = uint(input.id || 0, "Proposal number");
    switch (action) {
      case "approve": {
        const nft = new Contract(
          await c.collection(),
          COLLECTION_ABI,
          this.chain.provider,
        );
        request = await nft.approve.populateTransaction(
          this.address,
          await c.tokenId(),
        );
        purpose = "Approve this exact NFT for operating custody";
        break;
      }
      case "deposit":
        request = await c.deposit.populateTransaction();
        purpose = "Transfer the NFT into operating shared ownership";
        details.description =
          "Shareholders receive the configured voting shares. Account actions require governance. Recovery requires all shares or an approved funded buyout.";
        break;
      case "propose": {
        const a = await this.action(input);
        request = await c.proposeAction.populateTransaction(a);
        purpose = "Propose an exact NFT account operation";
        details.action = json(a);
        break;
      }
      case "operator": {
        const a = await this.action(input);
        request = await c.proposeOperator.populateTransaction(
          getAddress(input.caller),
          a,
          uint(input.budget, "Total operator budget"),
          uint(input.maxCalls, "Maximum calls"),
          uint(input.expires, "Operator expiry"),
        );
        purpose = "Propose a bounded repeat operator";
        details = {
          action: json(a),
          caller: input.caller,
          budget: input.budget,
          maxCalls: input.maxCalls,
          expires: input.expires,
        };
        break;
      }
      case "revoke":
        request = await c.proposeRevocation.populateTransaction(id);
        purpose = "Propose operator revocation";
        break;
      case "operator-run":
        request = await c.executeOperator.populateTransaction(id);
        purpose = "Execute the approved bounded operator call";
        break;
      case "operator-renounce":
        request = await c.renounceOperator.populateTransaction(id);
        purpose = "Immediately renounce your operator permission";
        break;
      case "track":
        request = await c.proposeTrackedAsset.populateTransaction(
          getAddress(input.asset),
        );
        purpose = "Propose monitoring an additional fungible asset";
        break;
      case "buyout":
        request = await c.proposeBuyout.populateTransaction(
          getAddress(input.recipient),
          { value: uint(input.price, "Funded buyout price") },
        );
        purpose = "Fund a buyout offer for shareholder voting";
        details.price = input.price;
        details.recipient = input.recipient;
        break;
      case "yes":
      case "no":
        request = await c.vote.populateTransaction(id, action === "yes");
        purpose = `Vote ${action === "yes" ? "for" : "against"} proposal ${id}`;
        break;
      case "queue":
        request = await c.queue.populateTransaction(id);
        purpose = `Start proposal ${id} execution delay`;
        break;
      case "execute":
        request = await c.execute.populateTransaction(id);
        purpose = `Execute approved proposal ${id}`;
        break;
      case "cancel":
        request = await c.cancel.populateTransaction(id);
        purpose = `Cancel or expire proposal ${id}`;
        break;
      case "redeem":
        request = await c.redeem.populateTransaction(
          uint(input.amount, "Shares"),
          getAddress(input.recipient),
        );
        purpose = "Redeem shares for funded buyout proceeds";
        break;
      case "whole":
        request = await c.redeemWhole.populateTransaction(
          getAddress(input.recipient),
        );
        purpose = "Reunite all ownership shares and recover the NFT";
        break;
      case "refund":
        request = await c.claimRefund.populateTransaction(
          getAddress(input.recipient),
        );
        purpose = "Withdraw your rejected or cancelled buyout funding";
        break;
      case "transfer":
        request = await this.shares.transfer.populateTransaction(
          getAddress(input.recipient),
          uint(input.amount, "Shares"),
        );
        purpose = "Transfer operating ownership shares";
        break;
      default:
        throw Error("Unknown ownership operation.");
    }
    return this.chain.prepareExternal({
      kind: "governance-action",
      request,
      meta: { governance: this.address, action, proposal: String(id) },
      summary: { purpose, ...details },
    });
  }
}

/** Verify semantic outcomes at the mined block before the shared controller marks success. */
export async function verifyGovernanceReceipt(provider, record, receipt) {
  if (!record.kind?.startsWith("governance-") || !record.final) return null;
  if (Number(receipt.status) !== 1)
    throw Error("Ownership transaction did not succeed.");
  const block = receipt.blockNumber,
    at = { blockTag: block },
    meta = record.meta || {},
    sender = getAddress(record.account);
  const tx = await provider.getTransaction(receipt.hash || record.hash);
  if (
    !tx ||
    !same(tx.from, sender) ||
    tx.data.toLowerCase() !== record.request.data.toLowerCase() ||
    BigInt(tx.value) !== BigInt(record.request.value || 0) ||
    Number(tx.nonce) !== Number(record.nonce) ||
    !same(tx.to || ZeroAddress, record.request.to || ZeroAddress)
  )
    throw Error("Mined ownership transaction differs from its exact review.");
  const address =
      record.kind === "governance-deploy"
        ? getAddress(receipt.contractAddress)
        : getAddress(meta.governance),
    c = await verifyGovernanceContract(
      provider,
      address,
      "OperatingNFTGovernance",
      block,
    ),
    shareAddress = await c.shares(at),
    shares = await verifyGovernanceContract(
      provider,
      shareAddress,
      "OperatingVotingShares",
      block,
    );
  if (!same(await shares.governance(at), address))
    throw Error("Ownership voting token belongs to another custodian.");
  if (record.kind === "governance-deploy") {
    if (
      !same(address, meta.predictedAddress) ||
      !same(await c.collection(at), meta.collection) ||
      (await c.tokenId(at)) !== BigInt(meta.tokenId) ||
      !same(await c.issuer(at), sender) ||
      (await c.deposited(at))
    )
      throw Error(
        "Mined ownership identity differs from the reviewed deployment.",
      );
    const policy = record.summary.policy,
      names = {
        quorum: "quorumBps",
        support: "supportBps",
        buyout: "buyoutBps",
        proposal: "proposalBps",
        voting: "votingPeriod",
        delay: "executionDelay",
        minimumBuyout: "minimumBuyoutPrice",
      };
    for (const [key, getter] of Object.entries(names))
      if ((await c[getter](at)) !== BigInt(policy[key]))
        throw Error("Mined ownership policy differs: " + key);
    if ((await c.disclosure(at)) !== record.summary.disclosure)
      throw Error("Mined ownership disclosure differs.");
    const distribution = record.summary.distribution,
      expectedSupply = distribution.reduce(
        (sum, row) => sum + BigInt(row.amount),
        0n,
      );
    if (
      (await c.originalSupply(at)) !== expectedSupply ||
      (await shares.originalSupply(at)) !== expectedSupply
    )
      throw Error("Mined ownership share supply differs.");
    const compiled = GOVERNANCE_ARTIFACTS.OperatingNFTGovernance;
    if (!tx.data.toLowerCase().startsWith(compiled.bytecode.toLowerCase()))
      throw Error("Ownership creation bytes differ from this edition.");
    const constructorInterface = new ContractFactory(
        compiled.abi,
        compiled.bytecode,
      ).interface,
      args = AbiCoder.defaultAbiCoder().decode(
        constructorInterface.deploy.inputs,
        "0x" + tx.data.slice(compiled.bytecode.length),
      );
    if (
      args[3].length !== distribution.length ||
      args[4].length !== distribution.length ||
      distribution.some(
        (row, i) =>
          !same(row.holder, args[3][i]) || BigInt(row.amount) !== args[4][i],
      )
    )
      throw Error("Mined ownership allocations differ.");
    record.contractAddress = address;
    return { address, shares: shareAddress, deployed: true };
  }
  const expectedAccount = await c.account(at),
    collectionAddress = await c.collection(at);
  verifyAccountRuntime(
    await provider.getCode(collectionAddress, block),
    "IDontFuckingBelieveIt",
  );
  verifyAccountRuntime(
    await provider.getCode(expectedAccount, block),
    "SovereignAccount",
  );
  if (
    !same(
      record.request.to,
      meta.action === "approve"
        ? collectionAddress
        : meta.action === "transfer"
          ? shareAddress
          : address,
    )
  )
    throw Error("Ownership operation destination differs.");
  const logs = receipt.logs
      .filter((l) => same(l.address, address))
      .map((l) => {
        try {
          return c.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean),
    request = c.interface.parseTransaction({
      data: record.request.data,
      value: record.request.value || 0,
    }),
    action = meta.action;
  const exactly = (name, predicate = () => true) => {
    const found = logs.filter((e) => e.name === name && predicate(e.args));
    if (found.length !== 1)
      throw Error("Ownership receipt lacks one matching " + name + " event.");
    return found[0];
  };
  if (action === "approve") {
    const nft = new Contract(await c.collection(at), COLLECTION_ABI, provider),
      id = await c.tokenId(at);
    const events = receipt.logs
      .filter((l) => same(l.address, nft.target))
      .map((l) => {
        try {
          return nft.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .filter(
        (e) =>
          e?.name === "Approval" &&
          same(e.args.owner, sender) &&
          same(e.args.approved, address) &&
          e.args.tokenId === id,
      );
    if (events.length !== 1)
      throw Error("Exact NFT custody approval event is missing.");
  } else if (action === "transfer") {
    const parsed = shares.interface.parseTransaction({
      data: record.request.data,
    });
    const events = receipt.logs
      .filter((l) => same(l.address, shareAddress))
      .map((l) => {
        try {
          return shares.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .filter(
        (e) =>
          e?.name === "Transfer" &&
          same(e.args.from, sender) &&
          same(e.args.to, parsed.args[0]) &&
          e.args.value === parsed.args[1],
      );
    if (events.length !== 1)
      throw Error("Ownership share transfer event is missing.");
  } else if (action === "deposit") {
    exactly(
      "Deposited",
      (a) => same(a.issuer, sender) && same(a.account, expectedAccount),
    );
  } else if (
    ["propose", "operator", "revoke", "track", "buyout"].includes(action)
  ) {
    const kind = { propose: 0, operator: 1, revoke: 2, buyout: 3, track: 4 }[
        action
      ],
      event = exactly(
        "Proposed",
        (a) => same(a.proposer, sender) && Number(a.kind) === kind,
      );
    record.governanceProposal = String(event.args.id);
  } else if (action === "yes" || action === "no")
    exactly(
      "Voted",
      (a) =>
        a.id === request.args[0] &&
        same(a.voter, sender) &&
        a.support === (action === "yes"),
    );
  else if (action === "queue")
    exactly("Queued", (a) => a.id === request.args[0]);
  else if (action === "execute")
    exactly("Executed", (a) => a.id === request.args[0]);
  else if (action === "cancel")
    exactly("Cancelled", (a) => a.id === request.args[0]);
  else if (action === "operator-run")
    exactly(
      "OperatorUsed",
      (a) => a.id === request.args[0] && same(a.caller, sender),
    );
  else if (action === "operator-renounce") {
    const o = await c.operator(request.args[0], at);
    if (!same(o.caller, sender) || !o.revoked)
      throw Error("Operator permission was not renounced.");
  } else if (action === "refund") {
    if ((await c.refunds(sender, at)) !== 0n)
      throw Error("Ownership refund remains unclaimed.");
  } else if (action === "redeem")
    exactly(
      "Redeemed",
      (a) =>
        same(a.holder, sender) &&
        same(a.recipient, request.args[1]) &&
        a.shares === request.args[0],
    );
  else if (action === "whole")
    exactly(
      "Redeemed",
      (a) =>
        same(a.holder, sender) &&
        same(a.recipient, request.args[0]) &&
        a.proceeds === 0n,
    );
  else throw Error("Unknown ownership receipt action.");
  return {
    address,
    shares: shareAddress,
    action,
    proposal: record.governanceProposal || meta.proposal,
  };
}
