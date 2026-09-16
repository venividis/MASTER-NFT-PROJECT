import type { AssetRef, ControllerState, EvmBlockTag, EvmTransactionIntent, GameAction, Hex, ReadCallAdapter, SessionGrant } from "./types.js";
export interface RpcTransport {
    request(input: {
        method: string;
        params: readonly unknown[];
    }): Promise<unknown>;
}
export declare const SELECTORS: Readonly<{
    readonly ownerOf: "0x6352211e";
    readonly safeTransferFrom: "0x42842e0e";
    readonly token: "0xfc0c546a";
    readonly executeCall: "0x51945447";
    readonly supportsInterface: "0x01ffc9a7";
}>;
export declare class EvmAdapter implements ReadCallAdapter {
    readonly descriptor: import("./types.js").ChainDescriptor;
    readonly chain: `eip155:${string}`;
    private readonly rpc;
    private readonly now;
    constructor(rpc: RpcTransport, chainId: bigint, now?: () => number);
    /** Recheck every read; do not cache a wallet provider's mutable chain selection. */
    assertChain(): Promise<void>;
    readCall(target: Hex, calldata: Hex, block?: EvmBlockTag): Promise<Hex>;
    resolveController(asset: AssetRef, block?: EvmBlockTag): Promise<ControllerState>;
    readAccountBinding(account: Hex, block?: EvmBlockTag): Promise<AssetRef>;
    prepareAction(action: GameAction, grant: SessionGrant): EvmTransactionIntent;
    /** Owner-driven raw call preparation. Never exposed implicitly to cartridge code. */
    prepareCall(target: Hex, calldata: Hex, value?: bigint, description?: string): EvmTransactionIntent;
    prepareERC721Transfer(asset: AssetRef, from: Hex, to: Hex): EvmTransactionIntent;
    /** Optional ERC-6551 execution interface; the account implementation must support it. CALL only. */
    prepareAccountExecution(account: Hex, inner: EvmTransactionIntent): EvmTransactionIntent;
}
