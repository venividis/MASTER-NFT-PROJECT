import { EVM } from "./descriptors.js";
const MAX_UINT = (1n << 256n) - 1n;
export const SELECTORS = Object.freeze({ ownerOf: "0x6352211e", safeTransferFrom: "0x42842e0e", token: "0xfc0c546a", executeCall: "0x51945447", supportsInterface: "0x01ffc9a7" });
function requireAddress(value) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(value))
        throw new Error("Invalid EVM address");
}
function requireBytes(value) {
    if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(value))
        throw new Error("Invalid hex bytes");
}
function uintWord(value) {
    if (value < 0n || value > MAX_UINT)
        throw new Error("Value outside uint256");
    return value.toString(16).padStart(64, "0");
}
function addressWord(value) { requireAddress(value); return value.slice(2).toLowerCase().padStart(64, "0"); }
function decodeAddress(word) {
    if (!/^[0-9a-fA-F]{64}$/.test(word) || !/^0{24}/.test(word))
        throw new Error("Malformed ABI address");
    return `0x${word.slice(24).toLowerCase()}`;
}
function quantity(value) { uintWord(value); return `0x${value.toString(16)}`; }
export class EvmAdapter {
    descriptor = EVM;
    chain;
    rpc;
    now;
    constructor(rpc, chainId, now = () => Date.now()) {
        if (chainId <= 0n)
            throw new Error("Positive chain ID required");
        this.rpc = rpc;
        this.chain = `eip155:${chainId}`;
        this.now = now;
    }
    /** Recheck every read; do not cache a wallet provider's mutable chain selection. */
    async assertChain() {
        const result = await this.rpc.request({ method: "eth_chainId", params: [] });
        if (typeof result !== "string" || !/^0x[0-9a-f]+$/i.test(result) || `eip155:${BigInt(result)}` !== this.chain)
            throw new Error("RPC chain does not match adapter");
    }
    async readCall(target, calldata, block = "finalized") {
        requireAddress(target);
        requireBytes(calldata);
        await this.assertChain();
        const value = await this.rpc.request({ method: "eth_call", params: [{ to: target, data: calldata }, block] });
        if (typeof value !== "string")
            throw new Error("RPC returned non-hex call result");
        requireBytes(value);
        return value;
    }
    async resolveController(asset, block = "finalized") {
        if (asset.chain !== this.chain || asset.standard !== "erc721")
            throw new Error("This method supports ERC-721 on the configured chain only");
        requireAddress(asset.collection);
        if (!/^(0|[1-9][0-9]*)$/.test(asset.id))
            throw new Error("Token ID must be an unsigned decimal string");
        await this.assertChain();
        // Pin the observation to a number; refuse unsupported finality tags rather than silently weakening them.
        const header = await this.rpc.request({ method: "eth_getBlockByNumber", params: [block, false] });
        if (!header || typeof header !== "object" || !("number" in header) || typeof header.number !== "string" || !/^0x[0-9a-f]+$/i.test(header.number))
            throw new Error("Requested block is unavailable");
        const result = await this.readCall(asset.collection, `${SELECTORS.ownerOf}${uintWord(BigInt(asset.id))}`, header.number);
        if (result.length !== 66)
            throw new Error("Malformed ownerOf result");
        const owner = decodeAddress(result.slice(2));
        if (BigInt(owner) === 0n)
            throw new Error("NFT has no owner");
        return { asset, owner, block: header.number, evidence: "rpc-observation" };
    }
    async readAccountBinding(account, block = "finalized") {
        const result = await this.readCall(account, SELECTORS.token, block);
        if (result.length !== 194)
            throw new Error("Malformed token-bound account binding");
        return {
            chain: `eip155:${BigInt(`0x${result.slice(2, 66)}`)}`,
            standard: "erc721",
            collection: decodeAddress(result.slice(66, 130)),
            id: BigInt(`0x${result.slice(130, 194)}`).toString()
        };
    }
    prepareAction(action, grant) {
        if (action.chain !== this.chain || grant.chain !== this.chain)
            throw new Error("Action/grant chain mismatch");
        if (!Number.isFinite(grant.expiresAt) || grant.expiresAt <= this.now())
            throw new Error("Session expired");
        requireAddress(action.target);
        requireBytes(action.calldata);
        if (action.calldata.length < 10)
            throw new Error("A function selector is required");
        if (action.value < 0n || action.value > grant.maxValuePerCall)
            throw new Error("Per-call value limit exceeded");
        const allowed = grant.allowedCalls.some(call => call.target.toLowerCase() === action.target.toLowerCase() && /^0x[0-9a-fA-F]{8}$/.test(call.selector) && call.selector.toLowerCase() === action.calldata.slice(0, 10).toLowerCase());
        if (!allowed)
            throw new Error("Target/method has not been granted");
        return this.prepareCall(action.target, action.calldata, action.value, action.description);
    }
    /** Owner-driven raw call preparation. Never exposed implicitly to cartridge code. */
    prepareCall(target, calldata, value = 0n, description = "Owner-selected contract call") {
        requireAddress(target);
        requireBytes(calldata);
        return { family: "evm", chain: this.chain, description, transaction: { to: target, data: calldata, value: quantity(value) }, status: "unsigned" };
    }
    prepareERC721Transfer(asset, from, to) {
        if (asset.chain !== this.chain || asset.standard !== "erc721")
            throw new Error("Unsupported transfer asset");
        if (!/^(0|[1-9][0-9]*)$/.test(asset.id))
            throw new Error("Token ID must be decimal");
        requireAddress(asset.collection);
        const data = `${SELECTORS.safeTransferFrom}${addressWord(from)}${addressWord(to)}${uintWord(BigInt(asset.id))}`;
        return this.prepareCall(asset.collection, data, 0n, "Transfer ERC-721 to the selected inventory or recipient");
    }
    /** Optional ERC-6551 execution interface; the account implementation must support it. CALL only. */
    prepareAccountExecution(account, inner) {
        if (inner.chain !== this.chain)
            throw new Error("Inner call chain mismatch");
        const { to, data, value } = inner.transaction;
        requireAddress(to);
        requireBytes(data);
        const byteLength = BigInt((data.length - 2) / 2);
        const padded = data.slice(2).padEnd(Math.ceil((data.length - 2) / 64) * 64, "0");
        const calldata = `${SELECTORS.executeCall}${addressWord(to)}${uintWord(BigInt(value))}${uintWord(128n)}${uintWord(0n)}${uintWord(byteLength)}${padded}`;
        return this.prepareCall(account, calldata, 0n, `NFT account: ${inner.description}`);
    }
}
