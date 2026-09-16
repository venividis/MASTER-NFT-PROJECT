import {
  Contract,
  ContractFactory,
  Interface,
  getAddress,
  getCreateAddress,
  keccak256,
  parseUnits,
  formatUnits,
  ZeroAddress,
  toBeHex,
  zeroPadValue,
  toUtf8Bytes,
} from "../vendor/ethers.min.js";
import { marketAction, readMarketState } from "../extensions/markets.mjs";
import { normalizeRuntime, TOKEN_ABI } from "../v4/client.mjs";
import { AUCTION_ARTIFACT } from "./auction-artifacts.mjs";
import { LIFECYCLE_ARTIFACTS } from "./lifecycle-artifacts.mjs";

export const AUCTION_LABEL = "ANIMA streaming auction";
const U64 = (1n << 64n) - 1n,
  U96 = (1n << 96n) - 1n,
  U112 = (1n << 112n) - 1n;
const immutableNames = [
  "seller",
  "saleToken",
  "lotSize",
  "totalLots",
  "startBlock",
  "endBlock",
  "reservePrice",
];
const tokenInterface = new Interface([
  ...TOKEN_ABI,
  "function name() view returns(string)",
]);
const auctionInterface = new Interface(AUCTION_ARTIFACT.abi);
const same = (a, b) => getAddress(a) === getAddress(b);
const rpcFor = (provider) => ({
  request: ({ method, params = [] }) => provider.send(method, params),
});
function address(value) {
  const a = getAddress(value);
  if (a === ZeroAddress) throw Error("Choose a nonzero address.");
  return a;
}
function uint(value, max, label, { zero = false } = {}) {
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw Error(`${label} must be an exact integer.`);
  if (!/^\d+$/.test(String(value))) throw Error(`${label} must be an integer.`);
  const n = BigInt(value);
  if (n < (zero ? 0n : 1n) || n > max)
    throw Error(`${label} is outside the supported range.`);
  return n;
}
function units(value, decimals, max, label) {
  let n;
  try {
    n = parseUnits(String(value), decimals);
  } catch {
    throw Error(
      `${label} must be a decimal amount with at most ${decimals} fractional digits.`,
    );
  }
  if (n <= 0n || n > max)
    throw Error(`${label} must be positive and fit the auction bounds.`);
  return n;
}
async function network(provider, config = {}) {
  const n = (await provider.getNetwork()).chainId;
  if (config.chainId !== undefined && n !== BigInt(config.chainId))
    throw Error("Wallet network changed.");
  const block = await provider.getBlock("latest");
  if (!block?.hash) throw Error("Current auction block unavailable.");
  return { ...config, chainId: Number(n), timestamp: block.timestamp };
}
async function latest(provider) {
  const b = await provider.send("eth_getBlockByNumber", ["latest", false]);
  if (!b?.hash) throw Error("Latest block identity unavailable.");
  return {
    number: BigInt(b.number),
    hash: b.hash,
    timestamp: BigInt(b.timestamp),
    tag: b.number,
  };
}
async function tokenInfo(provider, value, block = "latest", holder) {
  const a = address(value);
  if ((await provider.send("eth_getCode", [a, block])) === "0x")
    throw Error("The sale token must be a deployed ERC20.");
  const read = async (name, args = []) =>
    tokenInterface.decodeFunctionResult(
      name,
      await provider.send("eth_call", [
        { to: a, data: tokenInterface.encodeFunctionData(name, args) },
        block,
      ]),
    )[0];
  const d = Number(await read("decimals"));
  if (!Number.isInteger(d) || d < 0 || d > 36)
    throw Error("Sale-token decimals are unsupported.");
  const symbol = await read("symbol").catch(() => "TOKEN");
  return {
    address: a,
    decimals: d,
    symbol: String(symbol).slice(0, 80),
    ...(holder
      ? { balance: (await read("balanceOf", [holder])).toString() }
      : {}),
  };
}
function plan(config, kind, request, summary, extra = {}) {
  const purpose = summary.purpose;
  return {
    kind,
    chainId: config.chainId,
    payer: config.payer,
    purpose,
    request,
    spend: [],
    deadline: config.timestamp + 900,
    summary: { mechanism: AUCTION_LABEL, ...summary },
    ...extra,
  };
}
function checkTerms(terms) {
  if (
    !terms.lotSize ||
    !terms.totalLots ||
    !terms.reservePrice ||
    terms.lotSize > U112 ||
    terms.totalLots > U64 ||
    terms.reservePrice > U96 ||
    terms.lotSize * terms.totalLots > U112 ||
    terms.endBlock <= terms.startBlock ||
    terms.endBlock - terms.startBlock > 10_000_000n
  )
    throw Error("Auction terms are outside the compiled contract bounds.");
}

/** Exact executable runtime plus consistent values at every compiler immutable reference. */
export async function verifyAuctionContract(
  provider,
  value,
  expected = {},
  block = "latest",
) {
  const target = address(value),
    code = await provider.send("eth_getCode", [target, block]);
  if (
    normalizeRuntime(code, AUCTION_ARTIFACT) !== AUCTION_ARTIFACT.normalizedHash
  )
    throw Error("Auction runtime does not match the reviewed ANIMA release.");
  const entries = await Promise.all(
    immutableNames.map(async (name) => {
      const raw = await provider.send("eth_call", [
        { to: target, data: auctionInterface.encodeFunctionData(name) },
        block,
      ]);
      return [name, auctionInterface.decodeFunctionResult(name, raw)[0]];
    }),
  );
  const terms = Object.fromEntries(entries);
  for (const [name, value] of entries) {
    const word =
      typeof value === "string"
        ? zeroPadValue(value, 32)
        : zeroPadValue(toBeHex(value), 32);
    for (const ref of AUCTION_ARTIFACT.immutables[name])
      if (
        code
          .slice(2 + ref.start * 2, 2 + (ref.start + ref.length) * 2)
          .toLowerCase() !== word.slice(2).toLowerCase()
      )
        throw Error(`Auction ${name} is inconsistent in executable code.`);
    if (
      expected[name] !== undefined &&
      (typeof value === "string"
        ? !same(value, expected[name])
        : value !== BigInt(expected[name]))
    )
      throw Error(`Auction ${name} differs from the reviewed terms.`);
  }
  checkTerms(terms);
  return new Contract(target, AUCTION_ARTIFACT.abi, provider);
}

/** Pinned native-asset auction state, augmented with the missing lotSize and human token units. */
export async function inspectAuction(
  provider,
  { auction, target = auction, owner } = {},
) {
  target = address(target);
  if (owner) owner = address(owner);
  const result = await readMarketState(rpcFor(provider), {
      kind: "auction",
      target,
      owner,
    }),
    block = result.block;
  await verifyAuctionContract(provider, target, {}, block);
  const [lotSize, token] = await Promise.all([
    provider
      .send("eth_call", [
        { to: target, data: auctionInterface.encodeFunctionData("lotSize") },
        block,
      ])
      .then((x) => auctionInterface.decodeFunctionResult("lotSize", x)[0]),
    tokenInfo(provider, result.state.saleToken, block, owner),
  ]);
  const state = { ...result.state, lotSize: lotSize.toString() },
    current = BigInt(block),
    funded = state.funded === "1",
    closed = state.closed === "1";
  const phase = closed
    ? "closed"
    : !funded
      ? current < BigInt(state.startBlock)
        ? "unfunded"
        : "expired-unfunded"
      : current < BigInt(state.startBlock)
        ? "scheduled"
        : current < BigInt(state.endBlock)
          ? "active"
          : "awaiting-close";
  const activeBids = state.bids.filter((b) => b.bidder !== ZeroAddress),
    ownBids = owner ? activeBids.filter((b) => same(b.bidder, owner)) : [];
  const final = await provider.send("eth_getBlockByNumber", [block, false]);
  if (final?.hash !== result.blockHash)
    throw Error("Auction state block changed. Refresh.");
  return {
    ...result,
    state,
    auction: target,
    account: owner || null,
    personalKnown: !!owner,
    label: AUCTION_LABEL,
    currentBlock: current.toString(),
    phase,
    funded,
    closed,
    token,
    terms: Object.fromEntries(immutableNames.map((n) => [n, state[n]])),
    inventory: formatUnits(lotSize * BigInt(state.totalLots), token.decimals),
    lotTokens: formatUnits(lotSize, token.decimals),
    reservePerLot: formatUnits(state.reservePrice, 18),
    activeBids,
    ownBids,
    availableSlots: 64 - activeBids.length,
    claims: {
      tokens: owner ? state.tokenClaims || "0" : null,
      refund: owner ? state.refunds || "0" : null,
      proceeds: owner
        ? same(owner, state.seller)
          ? state.sellerCredit
          : "0"
        : null,
    },
    disclosure:
      "Standing quantity-limit bids. Earlier sequence breaks equal-price ties. Filled tokens and seller proceeds are claimable during the auction. Unspent bid funds are refundable; this auction has no minimum-raise guarantee or automatic liquidity migration.",
  };
}

/** input.lotSize is human token units; reservePrice is native currency per lot, not per token. */
export async function auctionDeployPlan(provider, config, input, payer) {
  config = await network(provider, config);
  payer = address(payer);
  config.payer = payer;
  const seller = address(input.seller || payer);
  if (!same(seller, payer))
    throw Error("Use the seller wallet to deploy and fund this auction.");
  const contractPayer = (await provider.getCode(payer)) !== "0x";
  const b = await latest(provider),
    token = await tokenInfo(provider, input.saleToken, b.tag, payer);
  const terms = {
    seller,
    saleToken: token.address,
    lotSize: units(input.lotSize, token.decimals, U112, "Tokens per lot"),
    totalLots: uint(input.totalLots, U64, "Number of lots"),
    startBlock: uint(input.startBlock, U64, "Start block"),
    endBlock: uint(input.endBlock, U64, "End block"),
    reservePrice: units(input.reservePrice, 18, U96, "Reserve price per lot"),
  };
  checkTerms(terms);
  if (terms.startBlock < b.number + 8n)
    throw Error(
      "Choose a start at least eight blocks ahead to allow deployment, approval and funding.",
    );
  const inventory = terms.lotSize * terms.totalLots;
  if (BigInt(token.balance) < inventory)
    throw Error(
      `The seller needs ${formatUnits(inventory, token.decimals)} ${token.symbol} to fund the sale.`,
    );
  if (keccak256(AUCTION_ARTIFACT.bytecode) !== AUCTION_ARTIFACT.creationHash)
    throw Error("Auction deployment bytecode integrity check failed.");
  if (contractPayer) {
    const factoryAddress = address(
        input.auctionFactory || config.auctionFactory,
      ),
      artifact = LIFECYCLE_ARTIFACTS.NFTAuctionFactory;
    if (
      normalizeRuntime(await provider.getCode(factoryAddress), artifact) !==
      artifact.normalizedHash
    )
      throw Error("NFT auction factory runtime differs from this release.");
    const factory = new Contract(factoryAddress, artifact.abi, provider),
      salt =
        input.salt ||
        keccak256(
          toUtf8Bytes(
            [
              payer,
              token.address,
              terms.startBlock,
              String(input.name || ""),
              String(input.totalLots),
            ].join(":"),
          ),
        ),
      factoryTerms = {
        saleToken: terms.saleToken,
        lotSize: terms.lotSize,
        totalLots: terms.totalLots,
        startBlock: terms.startBlock,
        endBlock: terms.endBlock,
        reservePrice: terms.reservePrice,
        salt,
      },
      predictedAddress = await factory.predict(factoryTerms, payer);
    if ((await provider.getCode(predictedAddress)) !== "0x")
      throw Error(
        "This deterministic auction already exists. Choose a fresh salt.",
      );
    return plan(
      config,
      "auction-create",
      {
        to: factoryAddress,
        data: factory.interface.encodeFunctionData("create", [factoryTerms]),
        value: 0n,
      },
      {
        purpose: "Create an auction owned by the NFT account",
        seller: payer,
        saleToken: token.address,
        tokenSymbol: token.symbol,
        inventory: formatUnits(inventory, token.decimals),
        lotTokens: String(input.lotSize),
        totalLots: terms.totalLots.toString(),
        reservePerLot: String(input.reservePrice),
        startBlock: terms.startBlock.toString(),
        endBlock: terms.endBlock.toString(),
        predictedAddress,
        funding:
          "Review the separate exact token-inventory funding call before opening.",
        rights:
          "Seller control and unclaimed proceeds stay with this NFT account and follow NFT ownership. Token inventory is committed by the later funding call.",
      },
      {
        terms,
        token,
        predictedAddress,
        verification: { name: "ContinuousClearingAuction", ...terms },
        meta: {
          deploymentType: "nft-auction",
          auction: predictedAddress,
          factory: factoryAddress,
          predictedAddress,
          verification: { name: "ContinuousClearingAuction", ...terms },
          notAfterBlock: (terms.startBlock - 4n).toString(),
          sourceBlock: b.number.toString(),
        },
      },
    );
  }
  const nonce = await provider.getTransactionCount(payer, "pending"),
    predictedAddress = getCreateAddress({ from: payer, nonce });
  const request = {
    ...(await new ContractFactory(
      AUCTION_ARTIFACT.abi,
      AUCTION_ARTIFACT.bytecode,
    ).getDeployTransaction(...immutableNames.map((n) => terms[n]))),
    nonce,
    value: 0n,
  };
  const verification = { name: "ContinuousClearingAuction", ...terms };
  return plan(
    config,
    "auction-deploy",
    request,
    {
      purpose: "Deploy your ANIMA streaming auction",
      seller,
      saleToken: token.address,
      tokenSymbol: token.symbol,
      lotTokens: String(input.lotSize),
      totalLots: terms.totalLots.toString(),
      inventory: formatUnits(inventory, token.decimals),
      reservePerLot: String(input.reservePrice),
      startBlock: terms.startBlock.toString(),
      endBlock: terms.endBlock.toString(),
      predictedAddress,
      bidCapacity: 64,
      priceTieRule: "Earlier bid sequence first",
      settlement:
        "Released inventory clears against standing quantity-limit bids",
      funding:
        "Public native-currency bids; seller must deposit token inventory before start",
      minimumRaise: "None",
      migration: "Separate action after auction",
    },
    {
      terms,
      token,
      predictedAddress,
      verification,
      meta: {
        deploymentType: "auction",
        predictedAddress,
        verification,
        notAfterBlock: (terms.startBlock - 1n).toString(),
        sourceBlock: b.number.toString(),
      },
    },
  );
}

export async function auctionFundPlan(provider, config, { auction }, payer) {
  config = await network(provider, config);
  payer = address(payer);
  config.payer = payer;
  const a = await inspectAuction(provider, { auction, owner: payer });
  if (!same(payer, a.state.seller))
    throw Error("Only the auction seller can fund inventory.");
  if (a.closed || a.funded)
    throw Error("This auction is already funded or closed.");
  if (BigInt(a.currentBlock) + 3n >= BigInt(a.state.startBlock))
    throw Error("Too few blocks remain for token approval and funding.");
  const amount = BigInt(a.state.lotSize) * BigInt(a.state.totalLots);
  if (BigInt(a.token.balance) < amount)
    throw Error("Seller token balance cannot cover all sale inventory.");
  const action = marketAction("F01.fund", a.auction);
  return plan(
    config,
    "auction-fund",
    { to: action.to, data: action.data, value: 0n },
    {
      purpose: "Fund the exact auction inventory",
      auction: a.auction,
      token: a.token.address,
      amount: formatUnits(amount, a.token.decimals),
      symbol: a.token.symbol,
      startBlock: a.state.startBlock,
    },
    {
      spend: [{ tokenAddress: a.token.address, amount }],
      meta: {
        auction: a.auction,
        notAfterBlock: (BigInt(a.state.startBlock) - 1n).toString(),
        verification: { name: "ContinuousClearingAuction", ...a.terms },
      },
    },
  );
}

export async function auctionBidPlan(provider, config, input, payer) {
  config = await network(provider, config);
  payer = address(payer);
  config.payer = payer;
  const a = await inspectAuction(provider, {
    auction: input.auction,
    owner: payer,
  });
  if (a.phase !== "active")
    throw Error("This funded auction is not currently accepting bids.");
  const lots = uint(input.lots, BigInt(a.state.totalLots), "Bid lots"),
    limitPrice = units(input.limitPrice, 18, U96, "Maximum price per lot"),
    escrow = lots * limitPrice;
  if (limitPrice < BigInt(a.state.reservePrice))
    throw Error("Maximum price is below the auction reserve price.");
  if (escrow > U112)
    throw Error("Bid escrow exceeds the auction uint112 bound.");
  if (escrow >= (await provider.getBalance(payer)))
    throw Error(
      "Insufficient native currency for bid escrow and transaction gas.",
    );
  const action = marketAction("F01.bid", a.auction, {
    lots,
    limitPrice,
    value: escrow,
  });
  return plan(
    config,
    "auction-bid",
    { to: action.to, data: action.data, value: escrow },
    {
      purpose: "Place a funded standing bid",
      auction: a.auction,
      lots: lots.toString(),
      lotTokens: a.lotTokens,
      maximumPricePerLot: String(input.limitPrice),
      maximumEscrow: formatUnits(escrow, 18),
      maximumTokens: formatUnits(
        lots * BigInt(a.state.lotSize),
        a.token.decimals,
      ),
      token: a.token.address,
      tokenSymbol: a.token.symbol,
      clearing:
        "Your limit caps price per lot; arrival first checkpoints earlier standing bids",
      refund:
        "Unspent escrow becomes claimable after fills, cancellation or closing",
      endBlock: a.state.endBlock,
    },
    {
      meta: {
        auction: a.auction,
        notBeforeBlock: a.state.startBlock,
        notAfterBlock: (BigInt(a.state.endBlock) - 1n).toString(),
        verification: { name: "ContinuousClearingAuction", ...a.terms },
      },
    },
  );
}

/** Actions: checkpoint, cancel, cancelBeforeStart, claimTokens, claimRefund, claimProceeds. */
export async function auctionActionPlan(provider, config, input, payer) {
  config = await network(provider, config);
  payer = address(payer);
  config.payer = payer;
  const a = await inspectAuction(provider, {
      auction: input.auction,
      owner: payer,
    }),
    action = input.action;
  if (
    ![
      "checkpoint",
      "cancel",
      "cancelBeforeStart",
      "claimTokens",
      "claimRefund",
      "claimProceeds",
    ].includes(action)
  )
    throw Error("Choose a supported auction action.");
  const values = {},
    summary = { auction: a.auction },
    meta = {
      auction: a.auction,
      verification: { name: "ContinuousClearingAuction", ...a.terms },
    };
  if (action === "checkpoint") {
    if (
      !a.funded ||
      a.closed ||
      BigInt(a.currentBlock) <= BigInt(a.state.startBlock)
    )
      throw Error("No active auction inventory can be checkpointed yet.");
    summary.purpose = "Settle released auction inventory";
  }
  if (action === "cancel") {
    const slot = uint(input.slot, 63n, "Bid slot", { zero: true }),
      expectedSequence = uint(input.expectedSequence, U64, "Bid sequence"),
      bid = a.state.bids[Number(slot)];
    if (!same(bid.bidder, payer) || BigInt(bid.sequence) !== expectedSequence)
      throw Error("This bid slot is stale or belongs to another wallet.");
    values.slot = slot;
    values.expectedSequence = expectedSequence;
    summary.purpose = "Cancel the remaining standing bid";
    summary.sequence = expectedSequence.toString();
    summary.refund =
      "Elapsed fills settle first; only remaining unspent escrow becomes a refundable credit.";
  }
  if (action === "cancelBeforeStart") {
    if (
      !same(payer, a.state.seller) ||
      a.closed ||
      BigInt(a.currentBlock) >= BigInt(a.state.startBlock)
    )
      throw Error("Only the seller can cancel an unstarted auction.");
    summary.purpose = "Cancel the auction before it starts";
    meta.notAfterBlock = (BigInt(a.state.startBlock) - 1n).toString();
  }
  if (action.startsWith("claim")) {
    const recipient = address(input.recipient || payer);
    if (same(recipient, a.auction))
      throw Error("The auction cannot receive its own claim.");
    const balance = BigInt(
      action === "claimTokens"
        ? a.claims.tokens
        : action === "claimRefund"
          ? a.claims.refund
          : a.claims.proceeds,
    );
    if (balance <= 0n)
      throw Error("There is no recorded balance for this claim.");
    if (action === "claimProceeds" && !same(payer, a.state.seller))
      throw Error("Only the seller can claim sale proceeds.");
    values.recipient = recipient;
    summary.purpose =
      action === "claimTokens"
        ? "Claim your auction tokens"
        : action === "claimRefund"
          ? "Claim your unspent bid funds"
          : "Claim settled auction proceeds";
    summary.recipient = recipient;
    summary.amount = balance.toString();
    summary.asset = action === "claimTokens" ? a.token.address : ZeroAddress;
  }
  const encoded = marketAction("F01." + action, a.auction, values);
  return plan(
    config,
    "auction-" + action,
    { to: encoded.to, data: encoded.data, value: 0n },
    summary,
    { meta },
  );
}

/** Verified per-operation NFT recipes; arbitrary external calls cannot enter this path. */
export async function prepareAuctionOperation(chain, prepared) {
  const generation = chain.generation;
  await chain.assertContext(generation);
  const payer = getAddress(chain.payer || chain.address);
  if (prepared.payer && !same(prepared.payer, payer))
    throw Error("Auction preparation belongs to another funding account.");
  if (prepared.kind === "auction-deploy") {
    if (chain.nftSession)
      throw Error(
        "Use the NFT auction factory to create an auction owned by the NFT account.",
      );
    return chain.prepareExternal(prepared);
  }
  const allowed = {
      "auction-create": "create",
      "auction-fund": "fund",
      "auction-bid": "bid",
      "auction-checkpoint": "checkpoint",
      "auction-cancel": "cancel",
      "auction-cancelBeforeStart": "cancelBeforeStart",
      "auction-claimTokens": "claimTokens",
      "auction-claimRefund": "claimRefund",
      "auction-claimProceeds": "claimProceeds",
    },
    method = allowed[prepared.kind];
  if (!method || !prepared.request.to)
    throw Error("This auction operation has no reviewed NFT recipe.");
  let iface = auctionInterface;
  if (method === "create") {
    const artifact = LIFECYCLE_ARTIFACTS.NFTAuctionFactory;
    if (
      normalizeRuntime(
        await chain.provider.getCode(prepared.request.to),
        artifact,
      ) !== artifact.normalizedHash
    )
      throw Error("NFT auction factory runtime differs from this release.");
    iface = new Interface(artifact.abi);
  } else
    await verifyAuctionContract(
      chain.provider,
      prepared.request.to,
      prepared.meta?.verification || {},
    );
  const call = iface.parseTransaction({
    data: prepared.request.data,
    value: prepared.request.value || 0n,
  });
  if (call.name !== method)
    throw Error("Auction calldata differs from its approved operation.");
  if (method === "create") {
    const t = call.args[0],
      expected = prepared.meta?.verification || {},
      factory = new Contract(
        prepared.request.to,
        LIFECYCLE_ARTIFACTS.NFTAuctionFactory.abi,
        chain.provider,
      );
    if (
      !same(expected.seller, payer) ||
      !same(
        await factory.predict(Array.from(t), payer),
        prepared.meta.predictedAddress,
      )
    )
      throw Error(
        "NFT auction prediction or seller differs from the reviewed recipe.",
      );
    for (const name of immutableNames.filter((x) => x !== "seller"))
      if (
        typeof t[name] === "string"
          ? !same(t[name], expected[name])
          : BigInt(t[name]) !== BigInt(expected[name])
      )
        throw Error("NFT auction terms differ from the reviewed recipe.");
  }
  if (
    method.startsWith("claim") &&
    !same(call.args[0], prepared.summary.recipient)
  )
    throw Error("Auction claim recipient differs from the review.");

  const spend = prepared.spend || [],
    value = BigInt(prepared.request.value || 0n);
  if (method === "fund") {
    const a = await inspectAuction(chain.provider, {
        auction: prepared.request.to,
        owner: payer,
      }),
      amount = BigInt(a.state.lotSize) * BigInt(a.state.totalLots);
    if (
      spend.length !== 1 ||
      !same(spend[0].tokenAddress, a.token.address) ||
      BigInt(spend[0].amount) !== amount ||
      value !== 0n
    )
      throw Error(
        "NFT auction funding must approve exactly its fixed token inventory.",
      );
  } else if (method === "bid") {
    if (spend.length || value !== BigInt(call.args[0]) * BigInt(call.args[1]))
      throw Error(
        "NFT auction bid escrow differs from its exact quantity and limit.",
      );
  } else if (spend.length || value !== 0n)
    throw Error("This auction action cannot spend additional assets.");
  await chain.assertContext(generation);
  return chain.prepareExternal(
    {
      ...prepared,
      payer,
      summary: {
        ...prepared.summary,
        payer,
        rights:
          "The selected account owns its auction inventory, bids and claim credits. Selling an NFT transfers control of those account-held rights. Any explicitly chosen claim recipient receives the payout.",
      },
    },
    { nftCompatible: true },
  );
}
export async function verifyNFTAuctionReceipt(provider, record, receipt) {
  if (!record.final || record.kind !== "auction-create") return;
  const artifact = LIFECYCLE_ARTIFACTS.NFTAuctionFactory;
  if (
    normalizeRuntime(
      await provider.getCode(record.meta.factory, receipt.blockNumber),
      artifact,
    ) !== artifact.normalizedHash
  )
    throw Error(
      "NFT auction factory runtime differs from the reviewed release.",
    );
  const iface = new Interface(artifact.abi),
    events = receipt.logs
      .filter((l) => same(l.address, record.meta.factory))
      .map((l) => {
        try {
          return iface.parseLog(l);
        } catch {
          return null;
        }
      })
      .filter((e) => e?.name === "AuctionCreated");
  if (
    events.length !== 1 ||
    !same(events[0].args.auction, record.meta.predictedAddress) ||
    !same(
      events[0].args.seller,
      record.execution?.payer || record.summary.seller,
    )
  )
    throw Error(
      "The created NFT auction differs from the reviewed account or address.",
    );
  await verifyAuctionContract(
    provider,
    events[0].args.auction,
    record.meta.verification,
    "0x" + receipt.blockNumber.toString(16),
  );
  record.contractAddress = events[0].args.auction;
  record.auction = events[0].args.auction;
}
