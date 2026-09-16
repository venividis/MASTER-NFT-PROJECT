import { assertMintBinding } from "./minted-identity.mjs";
import { assertRehearsal } from "../rehearsal/client.mjs";
import { assertQuoteProof } from "../extensions/proof.mjs";
import {
  BrowserProvider,
  Contract,
  Interface,
  getAddress,
  formatEther,
  parseEther,
  keccak256,
  toUtf8Bytes,
  sha256,
  toUtf8String,
} from "../vendor/ethers.min.js";
const coreABI = [
  "function ownerOf(uint256) view returns(address)",
  "function accountOf(uint256) view returns(address)",
  "function renderSnapshot(uint256) view returns(uint256,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint64,uint64,uint32,uint32,uint256,uint256,bool,address,address)",
];
const accountABI = [
  "function execute(address,uint256,bytes) payable returns(bytes)",
  "function sessionEpoch() view returns(uint64)",
  "function currentOwner() view returns(address)",
  "function mode() view returns(uint8)",
  "function sovereignAuthorityReady() view returns(bool)",
  "function actionNonce() view returns(uint256)",
  "function configureSovereignVerifier(uint32)",
  "function executeUtility(uint256,uint48,address,address,uint256,bytes,uint256) payable returns(bytes)",
];
export class ConfluenceWallet {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.connected = false;
    this.revision = 0;
    this.invalidation = () => {
      this.connected = false;
      this.plan = null;
      this.snapshot = null;
      this.revision++;
      this.onChange(
        "Wallet or network changed. Connect this NFT again.",
        "invalidate",
      );
    };
  }
  async connect(collection, tokenId) {
    this.connected = false;
    this.plan = null;
    this.snapshot = null;
    const revision = ++this.revision;
    this.raw?.removeListener?.("accountsChanged", this.invalidation);
    this.raw?.removeListener?.("chainChanged", this.invalidation);
    if (!window.ethereum?.request)
      throw Error(
        "No injected wallet found. Open this URL in a wallet-enabled browser.",
      );
    const selectedCollection = getAddress(collection),
      selectedToken = BigInt(tokenId);
    if (selectedToken < 1n) throw Error("Token ID must be positive.");
    assertMintBinding(
      window.ANIMA_SIM_SAMPLE ? null : window.AWE_CHAIN_IDENTITY,
      selectedCollection,
      selectedToken,
    );
    const raw = window.ethereum;
    this.raw = raw;
    raw.on?.("accountsChanged", this.invalidation);
    raw.on?.("chainChanged", this.invalidation);
    await raw.request({ method: "eth_requestAccounts" });
    const provider = new BrowserProvider(raw, undefined, { cacheTimeout: -1 }),
      signer = await provider.getSigner(),
      address = await signer.getAddress(),
      chainId = (await provider.getNetwork()).chainId;
    assertMintBinding(
      window.ANIMA_SIM_SAMPLE ? null : window.AWE_CHAIN_IDENTITY,
      selectedCollection,
      selectedToken,
      chainId,
    );
    const core = new Contract(selectedCollection, coreABI, provider),
      block = await provider.getBlockNumber();
    const [owner, accountValue, snapshot] = await Promise.all([
      core.ownerOf(selectedToken, { blockTag: block }),
      core.accountOf(selectedToken, { blockTag: block }),
      core.renderSnapshot(selectedToken, { blockTag: block }),
    ]);
    if (owner.toLowerCase() !== address.toLowerCase())
      throw Error("This wallet does not own the selected NFT.");
    const account = getAddress(accountValue);
    if ((await provider.getCode(account)) === "0x")
      throw Error("The NFT account has no deployed code.");
    const contract = new Contract(account, accountABI, signer),
      balance = formatEther(await provider.getBalance(account));
    const state = {
      seed: snapshot[1],
      genome: snapshot[2],
      root: snapshot[3],
      nonce: snapshot[13].toString(),
      sovereign: snapshot[14],
      chainId: chainId.toString(),
      collection: selectedCollection,
      tokenId: selectedToken.toString(),
      owner: address,
      account,
      balance,
      block,
      stale: false,
    };
    let modules = {};
    const directory = window.ANIMA_SIM_SAMPLE
      ? null
      : window.AWE_CHAIN_IDENTITY?.manifest;
    if (directory) {
      const manifest = new Contract(
        getAddress(directory),
        ["function modulesOf(address) view returns(address[6])"],
        provider,
      );
      const addresses = await manifest.modulesOf(selectedCollection, {
        blockTag: block,
      });
      const names = [
        "market",
        "vault",
        "journal",
        "ledger",
        "cartridges",
        "exit",
      ];
      for (let i = 0; i < names.length; i++) {
        const value = getAddress(addresses[i]);
        if ((await provider.getCode(value, block)) === "0x")
          throw Error("This NFT’s deployment manifest is not complete.");
        modules[names[i]] = value;
      }
    }
    if (revision !== this.revision)
      throw Error("Wallet context changed while connecting. Connect again.");
    Object.assign(this, {
      modules,
      provider,
      signer,
      address,
      chainId,
      core,
      account,
      contract,
      snapshot: state,
      collection: selectedCollection,
      tokenId: selectedToken,
      connected: true,
    });
    this.onChange("NFT identity read at block " + block + ".", "snapshot");
    return { ...state, account, owner: address, balance, block };
  }
  async refreshSnapshot({ blockTag } = {}) {
    if (!this.connected) throw Error("Connect an owned NFT first.");
    const revision = this.revision,
      core = this.core,
      tokenId = this.tokenId,
      provider = this.provider;
    try {
      const block = blockTag ?? (await provider.getBlockNumber());
      const [snapshot, owner, accountValue, chain, accounts, balance] =
        await Promise.all([
          core.renderSnapshot(tokenId, { blockTag: block }),
          core.ownerOf(tokenId, { blockTag: block }),
          core.accountOf(tokenId, { blockTag: block }),
          this.raw.request({ method: "eth_chainId" }),
          this.raw.request({ method: "eth_accounts" }),
          provider.getBalance(this.account, block),
        ]);
      if (revision !== this.revision)
        throw Error("NFT selection changed while refreshing.");
      if (
        BigInt(chain) !== this.chainId ||
        accounts[0]?.toLowerCase() !== this.address.toLowerCase() ||
        owner.toLowerCase() !== this.address.toLowerCase() ||
        accountValue.toLowerCase() !== this.account.toLowerCase()
      ) {
        this.invalidation();
        throw Error("NFT custody or wallet context changed. Connect again.");
      }
      this.snapshot = {
        seed: snapshot[1],
        genome: snapshot[2],
        root: snapshot[3],
        nonce: String(snapshot[13]),
        sovereign: snapshot[14],
        chainId: String(this.chainId),
        collection: this.collection,
        tokenId: String(tokenId),
        account: this.account,
        owner,
        balance: formatEther(balance),
        block,
        stale: false,
      };
      this.onChange(
        "NFT identity refreshed at block " + block + ".",
        "snapshot",
      );
      return this.snapshot;
    } catch (error) {
      if (revision === this.revision && this.connected && this.snapshot) {
        this.snapshot = { ...this.snapshot, stale: true };
        this.onChange(
          "The last NFT snapshot is stale: " + error.message,
          "snapshot-stale",
        );
      }
      throw error;
    }
  }
  async readCartridge(registry, id) {
    await this.assertOwner();
    registry = getAddress(registry);
    let artifact = window.CONFLUENCE_BUNDLED?.["abis/CartridgeRegistry.json"];
    if (artifact) artifact = JSON.parse(artifact);
    else {
      const response = await fetch("abis/CartridgeRegistry.json");
      if (!response.ok) throw Error("Cartridge ABI unavailable.");
      artifact = await response.json();
    }
    const { abi } = artifact;
    const contract = new Contract(registry, abi, this.provider);
    const block = await this.provider.getBlockNumber();
    const info = await contract.launchManifest(BigInt(id), this.address, {
      blockTag: block,
    });
    if (
      !info.authorized ||
      info.holder.toLowerCase() !== this.account.toLowerCase() ||
      info.controller.toLowerCase() !== this.address.toLowerCase()
    )
      throw Error(
        "This cartridge is not controlled through your selected NFT.",
      );
    if (!info.onchainContentAvailable)
      throw Error(
        "This cartridge has no published onchain executable. Import its exact content-pinned package.",
      );
    const bytes = await contract.contentOf(BigInt(id), { blockTag: block });
    if (sha256(bytes).toLowerCase() !== info.contentHash.toLowerCase())
      throw Error("Executable hash does not match the onchain commitment.");
    const manifest = JSON.parse(info.manifestJSON);
    await this.assertOwner();
    return {
      html: toUtf8String(bytes),
      name: manifest.name || "Onchain cartridge",
      hash: info.contentHash,
      registry,
      id: String(id),
      revision: info.revision.toString(),
      block,
    };
  }
  async assertOwner() {
    if (!this.connected) throw Error("Connect an owned NFT first.");
    const [chain, accounts, owner] = await Promise.all([
      this.raw.request({ method: "eth_chainId" }),
      this.raw.request({ method: "eth_accounts" }),
      this.core.ownerOf(this.tokenId),
    ]);
    if (
      BigInt(chain) !== this.chainId ||
      accounts[0]?.toLowerCase() !== this.address.toLowerCase() ||
      owner.toLowerCase() !== this.address.toLowerCase()
    ) {
      this.invalidation();
      throw Error("Ownership or wallet context changed. Review again.");
    }
    if ((await this.contract.mode()) !== 0n)
      throw Error(
        "This NFT uses proof-authorized execution. The owner-call adapter cannot execute it.",
      );
  }
  async prepare({ target, value = "0", data = "0x" }) {
    this.plan = null;
    const revision = this.revision;
    await this.assertOwner();
    const epoch = String(await this.contract.sessionEpoch());
    target = getAddress(target);
    if (!/^0x([\da-f]{2})*$/i.test(data))
      throw Error("Calldata must contain whole hex bytes.");
    const amount = parseEther(String(value));
    if (amount < 0n) throw Error("Value cannot be negative.");
    const transaction = await this.contract.execute.populateTransaction(
      target,
      amount,
      data,
    );
    transaction.from = this.address;
    await this.provider.call(transaction);
    const gas = await this.provider.estimateGas(transaction);
    const balance = await this.provider.getBalance(this.account);
    if (amount > balance)
      throw Error("The NFT account has insufficient native balance.");
    const p = {
      target,
      value: String(value),
      data,
      account: this.account,
      collection: this.collection,
      tokenId: this.tokenId.toString(),
      chainId: this.chainId.toString(),
      revision,
      epoch,
      gas: gas.toString(),
      transaction,
      createdAt: Date.now(),
    };
    p.digest = keccak256(
      toUtf8Bytes(JSON.stringify({ ...p, transaction: undefined })),
    );
    await this.assertReviewContext(revision, epoch);
    this.plan = p;
    return p;
  }
  async prepareUtility({ target, asset, amount, value = "0", data }) {
    this.plan = null;
    const revision = this.revision;
    await this.assertOwner();
    const epoch = String(await this.contract.sessionEpoch());
    target = getAddress(target);
    asset = getAddress(asset);
    const nonce = await this.contract.actionNonce(),
      block = await this.provider.getBlock("latest"),
      deadline = block.timestamp + 600,
      native = parseEther(String(value));
    const transaction = await this.contract.executeUtility.populateTransaction(
      nonce,
      deadline,
      asset,
      target,
      native,
      data,
      BigInt(amount),
    );
    transaction.from = this.address;
    await this.provider.call(transaction);
    const gas = await this.provider.estimateGas(transaction);
    const p = {
      target,
      value: String(value),
      data,
      asset,
      allowance: String(amount),
      account: this.account,
      collection: this.collection,
      tokenId: this.tokenId.toString(),
      chainId: this.chainId.toString(),
      revision,
      epoch,
      gas: gas.toString(),
      transaction,
      createdAt: Date.now(),
    };
    p.digest = keccak256(
      toUtf8Bytes(JSON.stringify({ ...p, transaction: undefined })),
    );
    await this.assertReviewContext(revision, epoch);
    this.plan = p;
    return p;
  }
  async prepareVerifier(id) {
    this.plan = null;
    const revision = this.revision;
    await this.assertOwner();
    const epoch = String(await this.contract.sessionEpoch());
    const transaction =
      await this.contract.configureSovereignVerifier.populateTransaction(
        BigInt(id),
      );
    transaction.from = this.address;
    await this.provider.call(transaction);
    const gas = await this.provider.estimateGas(transaction);
    const p = {
      target: this.account,
      value: "0",
      data: transaction.data,
      account: this.account,
      collection: this.collection,
      tokenId: this.tokenId.toString(),
      chainId: this.chainId.toString(),
      revision,
      epoch,
      gas: gas.toString(),
      transaction,
      createdAt: Date.now(),
    };
    await this.assertReviewContext(revision, epoch);
    this.plan = p;
    return p;
  }
  async assertReviewContext(revision, epoch) {
    await this.assertOwner();
    if (
      revision !== this.revision ||
      String(await this.contract.sessionEpoch()) !== epoch
    )
      throw Error(
        "NFT custody or wallet context changed. Prepare a new review.",
      );
  }
  async preparePersonal({ target, data }) {
    this.plan = null;
    const revision = this.revision;
    await this.assertOwner();
    const epoch = String(await this.contract.sessionEpoch());
    target = getAddress(target);
    if (!/^0x([\da-f]{2})*$/i.test(data))
      throw Error("Calldata must contain whole hex bytes.");
    const transaction = { to: target, from: this.address, data, value: 0n };
    await this.provider.call(transaction);
    const gas = await this.provider.estimateGas(transaction);
    const p = {
      target,
      value: "0",
      data,
      account: this.address,
      execution: "personal",
      collection: this.collection,
      tokenId: this.tokenId.toString(),
      chainId: this.chainId.toString(),
      revision,
      epoch,
      gas: String(gas),
      transaction,
      createdAt: Date.now(),
    };
    await this.assertReviewContext(revision, epoch);
    this.plan = p;
    return p;
  }
  async connectSigner() {
    if (this.signer && this.raw) {
      try {
        await this.assertSignerContext(
          this.revision,
          this.chainId,
          this.address,
        );
        return this.address;
      } catch {}
    }
    this.connected = false;
    this.plan = null;
    this.snapshot = null;
    const revision = ++this.revision;
    this.raw?.removeListener?.("accountsChanged", this.invalidation);
    this.raw?.removeListener?.("chainChanged", this.invalidation);
    const raw = globalThis.window?.ethereum;
    if (!raw?.request)
      throw Error("Open this artifact in a wallet-enabled browser.");
    this.raw = raw;
    raw.on?.("accountsChanged", this.invalidation);
    raw.on?.("chainChanged", this.invalidation);
    await raw.request({ method: "eth_requestAccounts" });
    const provider = new BrowserProvider(raw, undefined, { cacheTimeout: -1 }),
      signer = await provider.getSigner(),
      address = await signer.getAddress(),
      chainId = (await provider.getNetwork()).chainId;
    if (revision !== this.revision)
      throw Error("Wallet changed while connecting.");
    Object.assign(this, { provider, signer, address, chainId });
    return address;
  }
  async assertSignerContext(revision, chainId, address) {
    const [chain, accounts] = await Promise.all([
      this.raw.request({ method: "eth_chainId" }),
      this.raw.request({ method: "eth_accounts" }),
    ]);
    if (
      revision !== this.revision ||
      BigInt(chain) !== BigInt(chainId) ||
      accounts[0]?.toLowerCase() !== address.toLowerCase()
    )
      throw Error("Signing wallet or network changed. Prepare a new review.");
  }
  async prepareExternal({ target, data = "0x", value = 0n }) {
    this.plan = null;
    await this.connectSigner();
    const revision = this.revision,
      chainId = this.chainId,
      address = this.address;
    target = getAddress(target);
    value = BigInt(value);
    if (value < 0n || !/^0x([\da-f]{2})*$/i.test(data))
      throw Error("Invalid transaction value or calldata.");
    const code = await this.provider.getCode(target);
    if (code === "0x")
      throw Error("The selected extension has no deployed code.");
    const transaction = { to: target, from: address, data, value, chainId };
    await this.provider.call(transaction);
    const gas = await this.provider.estimateGas(transaction);
    await this.assertSignerContext(revision, chainId, address);
    const p = Object.freeze({
      target,
      value: formatEther(value),
      data,
      account: address,
      execution: "external",
      chainId: String(chainId),
      revision,
      gas: String(gas),
      transaction: Object.freeze(transaction),
      codeHash: keccak256(code),
      createdAt: Date.now(),
    });
    this.plan = p;
    return p;
  }
  async send() {
    const p = this.plan;
    this.plan = null;
    if (!p || Date.now() - p.createdAt > 300000 || p.revision !== this.revision)
      throw Error("This review expired or changed. Prepare it again.");
    const signer = this.signer;
    const check = async () => {
      if (p.execution === "external") {
        await this.assertSignerContext(p.revision, p.chainId, p.account);
        if (keccak256(await this.provider.getCode(p.target)) !== p.codeHash)
          throw Error("Extension code changed. Prepare a new review.");
      } else await this.assertReviewContext(p.revision, p.epoch);
    };
    if (p.execution !== "external") {
      await assertRehearsal(p, this.provider, this.contract);
      await assertQuoteProof(p, this.provider);
    }
    await check();
    await this.provider.call(p.transaction);
    await check();
    const tx = await signer.sendTransaction({
      ...p.transaction,
      gasLimit: (BigInt(p.gas) * 120n) / 100n,
    });
    this.onChange("Transaction submitted: " + tx.hash);
    const r = await tx.wait();
    if (!r || r.status !== 1) throw Error("Transaction reverted: " + tx.hash);
    const receipt = {
      hash: tx.hash,
      blockNumber: r.blockNumber,
      chainId: p.chainId,
      account: p.account,
      collection: p.collection,
      tokenId: p.tokenId,
      logs: r.logs.map((l) => ({
        address: l.address,
        topics: [...l.topics],
        data: l.data,
      })),
    };
    if (this.connected && p.revision === this.revision) {
      try {
        await this.refreshSnapshot();
        receipt.snapshotStatus = "refreshed";
      } catch (error) {
        receipt.snapshotStatus = "unavailable";
        receipt.snapshotError = error.message;
      }
    }
    return receipt;
  }
  encode(signature, args) {
    return new Interface(["function " + signature]).encodeFunctionData(
      signature.slice(0, signature.indexOf("(")),
      args,
    );
  }
  disconnect() {
    this.connected = false;
    this.plan = null;
    this.snapshot = null;
    this.signer = null;
    this.revision++;
    this.raw?.removeListener?.("accountsChanged", this.invalidation);
    this.raw?.removeListener?.("chainChanged", this.invalidation);
    this.onChange("Disconnected. Your artifact remains open.", "disconnect");
  }
}
