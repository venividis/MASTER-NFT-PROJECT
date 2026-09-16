export type Hex = `0x${string}`;
export type ChainFamily = "evm" | "solana" | "sui" | "starknet";

/** Always chain-qualified. A matching token ID on another chain is a different asset. */
export interface AssetRef {
  chain: string;
  standard: "erc721" | "erc1155" | "metaplex-core" | "bubblegum-v2" | "sui-object" | "starknet-erc721";
  collection: string;
  id: string;
}

export interface ControllerState {
  asset: AssetRef;
  owner: string;
  block: string;
  /** An RPC observation, not a portable cryptographic ownership proof. */
  evidence: "rpc-observation";
}

export interface Capability {
  name: string;
  description: string;
  status: "implemented" | "planned" | "unsupported";
}

export interface ChainDescriptor {
  family: ChainFamily;
  implementation: "rpc-adapter" | "research-only";
  capabilities: readonly Capability[];
  sources: readonly string[];
  verifiedAt: string;
}

export interface RequestedCapability {
  /** Extensible, application-namespaced identifier; never automatically granted. */
  method: string;
  reason: string;
  target?: string;
}

export interface CartridgeManifest {
  schemaVersion: "awe.cartridge/1";
  id: string;
  title: string;
  version: string;
  cartridge?: AssetRef;
  runtime: "web" | "wasm" | "native-client";
  entrypoint: string;
  contentHash: Hex;
  contentHashAlgorithm: "sha256";
  engine?: string;
  compatibleChains: string[];
  gameAdapter: string;
  rulesVersion: string;
  requestedCapabilities: RequestedCapability[];
  settlement: {
    mode: "local" | "server-attested" | "onchain-transitions" | "proof-verified";
    chain?: string;
    authority?: string;
    verifier?: string;
  };
  itemSchemas: string[];
}

export type EvmBlockTag = "latest" | "safe" | "finalized" | Hex;

export interface EvmTransactionIntent {
  family: "evm";
  chain: `eip155:${string}`;
  description: string;
  transaction: { from?: Hex; to: Hex; data: Hex; value: Hex };
  /** Preparation is not authorization or submission. The wallet must review/sign. */
  status: "unsigned";
}

/** Non-EVM variants are wire types only; this package does not build or submit them. */
export type TransactionIntent = EvmTransactionIntent
  | { family: "solana"; chain: string; status: "unsigned"; serializedMessageBase64: string }
  | { family: "sui"; chain: string; status: "unsigned"; transactionBytesBase64: string }
  | { family: "starknet"; chain: string; status: "unsigned"; calls: { contractAddress: string; entrypoint: string; calldata: string[] }[] };

export interface GameAction {
  chain: `eip155:${string}`;
  target: Hex;
  calldata: Hex;
  value: bigint;
  description: string;
}

/** Local intent filter. A production delegated account must enforce its grant onchain too. */
export interface SessionGrant {
  chain: `eip155:${string}`;
  /** Unix epoch milliseconds, matching Date.now(). */
  expiresAt: number;
  allowedCalls: readonly { target: Hex; selector: Hex }[];
  /** Native EVM currency in wei. This is not a cumulative session budget. */
  maxValuePerCall: bigint;
}

export interface ReadCallAdapter {
  descriptor: ChainDescriptor;
  resolveController(asset: AssetRef, block?: EvmBlockTag): Promise<ControllerState>;
  readCall(target: Hex, calldata: Hex, block?: EvmBlockTag): Promise<Hex>;
  prepareAction(action: GameAction, grant: SessionGrant): EvmTransactionIntent;
}

export interface MatchRef { chain: string; world: string; matchId: string; rulesVersion: string }
export interface SettlementReceipt {
  match: MatchRef;
  sequence: string;
  stateRoot: string;
  evidence: { kind: "transaction" | "attestation" | "proof"; payload: string };
}

/** Design contract for future game-specific adapters; no fake implementation exported. */
export interface GameSettlementAdapter {
  readMatch(ref: MatchRef): Promise<unknown>;
  prepareMint(claim: { match: MatchRef; recipient: string; schema: string; evidence: SettlementReceipt }): Promise<TransactionIntent>;
  verifySettlement(receipt: SettlementReceipt): Promise<{ valid: boolean; reason: string }>;
}
