export const EVM = {
    family: "evm", implementation: "rpc-adapter", verifiedAt: "2026-09-05",
    capabilities: [
        { name: "asset.owner.read", description: "Read ERC-721 owner at an observed block", status: "implemented" },
        { name: "contract.read", description: "Injected RPC eth_call", status: "implemented" },
        { name: "transaction.prepare", description: "Unsigned owner-scoped transaction intents", status: "implemented" },
        { name: "account.binding.read", description: "Read an ERC-6551 token() binding", status: "implemented" },
        { name: "account.execute.prepare", description: "Encode the optional ERC-6551 CALL execution interface", status: "implemented" },
        { name: "children.enumerate", description: "Needs a collection-specific nesting adapter or indexer", status: "planned" },
        { name: "match.settle", description: "Needs the selected game's contract and verifier", status: "planned" }
    ],
    sources: ["https://eips.ethereum.org/EIPS/eip-6551", "https://eips.ethereum.org/EIPS/eip-7401", "https://eips.ethereum.org/EIPS/eip-5773", "https://eips.ethereum.org/EIPS/eip-6220"]
};
export const SOLANA = {
    family: "solana", implementation: "research-only", verifiedAt: "2026-09-05",
    capabilities: [
        { name: "core.asset-signer", description: "Integrate Core Execute Asset Signing and current owner authority", status: "planned" },
        { name: "core.app-data", description: "Per-game plugin data authorities", status: "planned" },
        { name: "compressed.items", description: "Bubblegum V2 with DAS data and Merkle proofs", status: "planned" }
    ],
    sources: ["https://www.metaplex.com/docs/smart-contracts/core/execute-asset-signing", "https://www.metaplex.com/docs/smart-contracts/core/external-plugins/overview", "https://www.metaplex.com/docs/smart-contracts/bubblegum-v2"]
};
export const SUI = {
    family: "sui", implementation: "research-only", verifiedAt: "2026-09-05",
    capabilities: [
        { name: "object.inventory", description: "Dynamic object fields and explicit receiving capabilities", status: "planned" },
        { name: "creator.shop", description: "Kiosk with applicable transfer policies", status: "planned" },
        { name: "world.transactions", description: "Move game modules and programmable transactions", status: "planned" }
    ],
    sources: ["https://docs.sui.io/develop/objects/dynamic-fields", "https://docs.sui.io/develop/objects/transfers/transfer-to-object", "https://docs.sui.io/onchain-finance/kiosk/kiosk-example"]
};
export const STARKNET = {
    family: "starknet", implementation: "research-only", verifiedAt: "2026-09-05",
    capabilities: [
        { name: "dojo.world", description: "Cairo models, systems and scoped world permissions", status: "planned" },
        { name: "dojo.indexer", description: "Torii subscriptions; chain remains authoritative", status: "planned" },
        { name: "engine.clients", description: "Dojo JS/Godot/Unity/Unreal integration", status: "planned" }
    ],
    sources: ["https://dojoengine.org/framework/world", "https://dojoengine.org/client/sdk", "https://dojoengine.org/client/sdk/godot"]
};
export const CHAIN_DESCRIPTORS = Object.freeze({ evm: EVM, solana: SOLANA, sui: SUI, starknet: STARKNET });
