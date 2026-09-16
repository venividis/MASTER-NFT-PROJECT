// One immutable mint stays the subject even when its owner disconnects.
export function identitySource({
  preview,
  connected,
  snapshot,
  minted,
  local,
  legacy,
}) {
  const boundLegacy =
    minted &&
    legacy &&
    String(legacy.collection).toLowerCase() ===
      String(minted.collection).toLowerCase() &&
    String(legacy.tokenId) === String(minted.tokenId) &&
    String(legacy.chainId) === String(minted.chainId) &&
    legacy.seed === minted.seed
      ? legacy
      : null;
  return preview
    ? { seed: preview, genome: preview }
    : connected && snapshot
      ? snapshot
      : boundLegacy || minted || legacy || local;
}
export function assertMintBinding(minted, collection, tokenId, chainId) {
  if (!minted) return;
  if (
    String(collection).toLowerCase() !==
      String(minted.collection).toLowerCase() ||
    BigInt(tokenId) !== BigInt(minted.tokenId)
  )
    throw Error(
      "Connect the collection and token belonging to this minted Anima.",
    );
  if (chainId !== undefined && BigInt(chainId) !== BigInt(minted.chainId))
    throw Error(
      "Switch your wallet to this NFT’s home chain " + minted.chainId + ".",
    );
}
