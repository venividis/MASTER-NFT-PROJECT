import {
  Contract,
  Interface,
  ZeroAddress,
  getAddress,
  keccak256,
} from "../vendor/ethers.min.js";
import { ARTIFACTS } from "../extensions/artifacts.mjs";

const same = (a, b) => getAddress(a) === getAddress(b);
const collectionABI = [
  "function ownerOf(uint256) view returns(address)",
  "function accountOf(uint256) view returns(address)",
  "function proofRouter() view returns(address)",
];
const accountABI = [
  "function collection() view returns(address)",
  "function tokenId() view returns(uint256)",
  "function proofRouter() view returns(address)",
  "function currentOwner() view returns(address)",
  "function sessionEpoch() view returns(uint64)",
  "function actionNonce() view returns(uint256)",
  "function mode() view returns(uint8)",
  "function executeUtility(uint256,uint48,address,address,uint256,bytes,uint256) payable returns(bytes)",
];
const accountInterface = new Interface(accountABI);

/** Pin the whole executable and require every occurrence of each immutable to agree. */
export function verifyAccountRuntime(runtime, name) {
  const artifact = ARTIFACTS[name];
  if (
    !artifact ||
    !/^0x[0-9a-f]+$/i.test(runtime) ||
    runtime.length !== artifact.runtime.length
  )
    throw Error(`${name} does not match this NFT edition's reviewed runtime.`);
  let actual = runtime.slice(2).toLowerCase(),
    expected = artifact.runtime.slice(2).toLowerCase();
  for (const locations of Object.values(artifact.immutableReferences || {})) {
    let immutable;
    for (const { start, length } of locations) {
      const word = actual.slice(start * 2, (start + length) * 2);
      if (immutable !== undefined && immutable !== word)
        throw Error(`${name} has inconsistent immutable bindings.`);
      immutable = word;
    }
    for (const { start, length } of locations) {
      actual =
        actual.slice(0, start * 2) +
        "0".repeat(length * 2) +
        actual.slice((start + length) * 2);
      expected =
        expected.slice(0, start * 2) +
        "0".repeat(length * 2) +
        expected.slice((start + length) * 2);
    }
  }
  if (actual !== expected)
    throw Error(`${name} does not match this NFT edition's reviewed runtime.`);
  return keccak256(runtime);
}

/** No delegate is installed: each call is signed by the current NFT owner. */
export class NFTAccountSession {
  static async connect(provider, signer, identity) {
    const collection = getAddress(identity.collection),
      tokenId = BigInt(identity.tokenId);
    if (collection === ZeroAddress || tokenId < 1n)
      throw Error("Choose a minted NFT collection and positive token ID.");
    const network = await provider.getNetwork(),
      block = await provider.getBlock("latest");
    if (!block?.hash) throw Error("The NFT identity block is unavailable.");
    if (
      identity.chainId !== undefined &&
      BigInt(identity.chainId) !== network.chainId
    )
      throw Error("The NFT belongs to a different chain.");
    const core = new Contract(collection, collectionABI, provider),
      at = { blockTag: block.number };
    const [owner, account, router, collectionCode] = await Promise.all([
      core.ownerOf(tokenId, at),
      core.accountOf(tokenId, at),
      core.proofRouter(at),
      provider.getCode(collection, block.number),
    ]);
    if (!same(owner, signer))
      throw Error("The signing wallet does not own this NFT.");
    if (identity.account && !same(account, identity.account))
      throw Error("The selected account is not bound to this NFT.");
    const collectionHash = verifyAccountRuntime(
      collectionCode,
      "IDontFuckingBelieveIt",
    );
    const accountHash = verifyAccountRuntime(
      await provider.getCode(account, block.number),
      "SovereignAccount",
    );
    const session = new NFTAccountSession();
    Object.assign(session, {
      provider,
      core,
      collection,
      tokenId,
      account: getAddress(account),
      signer: getAddress(signer),
      chainId: network.chainId,
      router: getAddress(router),
      collectionHash,
      accountHash,
      contract: new Contract(account, accountABI, provider),
    });
    const head = await session.read(block);
    session.epoch = head.epoch;
    await session.assert(signer);
    return session;
  }

  get descriptor() {
    return {
      mode: "nft",
      signer: this.signer,
      payer: this.account,
      account: this.account,
      collection: this.collection,
      tokenId: this.tokenId.toString(),
      chainId: Number(this.chainId),
      epoch: this.epoch,
      runtimeHash: this.accountHash,
      rights:
        "Token balances, liquidity shares, sale allocations, bids, claim credits and seller controls held by this account follow NFT ownership. Fixed external beneficiaries and vesting schedules do not change automatically.",
    };
  }

  async read(block) {
    const at = { blockTag: block.number },
      c = this.contract;
    const [
      owner,
      bound,
      holder,
      collection,
      tokenId,
      router,
      mode,
      epoch,
      nonce,
    ] = await Promise.all([
      this.core.ownerOf(this.tokenId, at),
      this.core.accountOf(this.tokenId, at),
      c.currentOwner(at),
      c.collection(at),
      c.tokenId(at),
      c.proofRouter(at),
      c.mode(at),
      c.sessionEpoch(at),
      c.actionNonce(at),
    ]);
    if (!same(owner, this.signer) || !same(holder, owner))
      throw Error(
        "NFT ownership changed. Connect its current owner and prepare again.",
      );
    if (
      !same(bound, this.account) ||
      !same(collection, this.collection) ||
      tokenId !== this.tokenId ||
      !same(router, this.router)
    )
      throw Error("NFT account identity changed. Prepare a fresh connection.");
    if (mode !== 0n)
      throw Error(
        "This NFT requires proof-authorized execution; the owner-call launch route is unavailable.",
      );
    return { epoch: epoch.toString(), nonce, block };
  }

  async assert(signer, { nonce } = {}) {
    if (!same(signer, this.signer))
      throw Error("NFT signing owner changed. Prepare again.");
    const block = await this.provider.getBlock("latest");
    if (!block?.hash) throw Error("The NFT identity block is unavailable.");
    const [network, collectionCode, accountCode, head] = await Promise.all([
      this.provider.getNetwork(),
      this.provider.getCode(this.collection, block.number),
      this.provider.getCode(this.account, block.number),
      this.read(block),
    ]);
    if (
      network.chainId !== this.chainId ||
      keccak256(collectionCode) !== this.collectionHash ||
      keccak256(accountCode) !== this.accountHash
    )
      throw Error("NFT network or runtime changed. Connect again.");
    if (this.epoch !== undefined && head.epoch !== this.epoch)
      throw Error(
        "NFT custody or permission epoch changed. Select the NFT again.",
      );
    if (nonce !== undefined && head.nonce !== BigInt(nonce))
      throw Error(
        "The NFT account executed another action. Prepare a new transaction review.",
      );
    if ((await this.provider.getBlock(block.number))?.hash !== block.hash)
      throw Error("The NFT identity block changed. Refresh before signing.");
    return head;
  }

  async wrap(plan) {
    if (!plan.request.to)
      throw Error(
        "Contract creation requires wallet funding. Select your wallet for infrastructure deployment.",
      );
    const head = await this.assert(this.signer),
      target = getAddress(plan.request.to);
    if (same(target, this.account))
      throw Error("The launch account cannot call itself through this route.");
    const approvals = (plan.spend || []).filter(
      (s) => !same(s.tokenAddress, target),
    );
    if (approvals.length > 1)
      throw Error(
        "This NFT route supports one exact approved input asset per atomic operation.",
      );
    const asset = approvals[0]
      ? getAddress(approvals[0].tokenAddress)
      : ZeroAddress;
    const allowance = approvals[0] ? BigInt(approvals[0].amount) : 0n;
    const value = BigInt(plan.request.value || 0);
    if (value > (await this.provider.getBalance(this.account)))
      throw Error(
        "The NFT account needs more native currency for this operation.",
      );
    return {
      request: {
        to: this.account,
        value: 0n,
        data: accountInterface.encodeFunctionData("executeUtility", [
          head.nonce,
          plan.deadline,
          asset,
          target,
          value,
          plan.request.data,
          allowance,
        ]),
      },
      execution: {
        ...this.descriptor,
        nonce: head.nonce.toString(),
        target,
        asset,
        allowance: allowance.toString(),
        value: value.toString(),
      },
      allowance:
        asset === ZeroAddress
          ? null
          : {
              token: asset,
              spender: target,
              amount: allowance.toString(),
              atomic: true,
              resetAfter: true,
            },
    };
  }
}
