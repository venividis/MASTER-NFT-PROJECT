import { getAddress, ZeroAddress } from "../vendor/ethers.min.js";

/** A public launch identity contains no RPC endpoint, browser state, or wallet identity. */
export function launchIdentity(input) {
  const kind = input?.kind;
  if (
    !["community", "auction", "pool", "record", "cca", "doppler"].includes(kind)
  )
    throw Error(
      "Choose a community sale, auction, pool or permanent launch record.",
    );
  if (
    !/^[1-9]\d*$/.test(String(input.chainId)) ||
    !Number.isSafeInteger(Number(input.chainId))
  )
    throw Error("Use a positive, exact chain identifier.");
  const contract = getAddress(
    input.contract ?? input.launchpad ?? input.auction,
  );
  if (contract === ZeroAddress)
    throw Error("A launch needs a nonzero contract address.");
  const result = { kind, chainId: Number(input.chainId), contract };
  if (kind === "community" || kind === "record") {
    if (!/^[1-9]\d*$/.test(String(input.id)) || BigInt(input.id) >= 1n << 256n)
      throw Error("Use a valid community sale ID.");
    result.id = String(BigInt(input.id));
  }
  if (kind === "doppler") {
    result.asset = getAddress(input.asset ?? input.id);
    if (result.asset === ZeroAddress)
      throw Error("Use the launched token address.");
  }
  return Object.freeze(result);
}

export function buildLaunchHash(input) {
  const r = launchIdentity(input);
  return `#launch/${r.kind}/${r.chainId}/${r.contract}${["community", "record"].includes(r.kind) ? "/" + r.id : r.kind === "doppler" ? "/" + r.asset : ""}`;
}

export function parseLaunchHash(value = globalThis.location?.hash || "") {
  const hash = String(value).includes("#")
    ? String(value).slice(String(value).indexOf("#"))
    : String(value);
  if (!hash.startsWith("#launch/")) return null;
  const match =
    /^#launch\/(community|auction|pool|record|cca|doppler)\/([1-9]\d*)\/(0x[\da-fA-F]{40})(?:\/([1-9]\d*|0x[\da-fA-F]{40}))?$/.exec(
      hash,
    );
  if (
    !match ||
    ["community", "record", "doppler"].includes(match[1]) !== !!match[4]
  )
    throw Error("This launch link is incomplete or malformed.");
  return launchIdentity({
    kind: match[1],
    chainId: match[2],
    contract: match[3],
    id: match[4],
    asset: match[4],
  });
}

export function buildLaunchLink(input, base = globalThis.location?.href) {
  const hash = buildLaunchHash(input);
  if (!base) return hash;
  const url = new URL(base);
  if (
    !["http:", "https:", "web3:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw Error(
      "Open this app at a shareable website or web3 address before copying a full launch link.",
    );
  // Deliberately discard query state: provider credentials and private view settings never travel with a launch.
  url.search = "";
  url.hash = hash;
  return url.href;
}

export function sameLaunch(a, b) {
  try {
    return buildLaunchHash(a) === buildLaunchHash(b);
  } catch {
    return false;
  }
}

/** Reopen the recorded mechanism, including official strategies, without creator-device state. */
export function recordToRoute(record) {
  if (!record) return null;
  if (record.mechanism === "official-cca")
    return launchIdentity({
      kind: "cca",
      chainId: record.chainId,
      contract: record.target,
    });
  if (record.mechanism === "official-doppler")
    return launchIdentity({
      kind: "doppler",
      chainId: record.chainId,
      contract: record.target,
      asset: record.token,
    });
  if (record.position && getAddress(record.position) !== ZeroAddress)
    return launchIdentity({
      kind: "pool",
      chainId: record.chainId,
      contract: record.position,
    });
  if (record.mechanism === "community")
    return launchIdentity({
      kind: "community",
      chainId: record.chainId,
      contract: record.target,
      id: record.mechanismId,
    });
  if (record.mechanism === "auction")
    return launchIdentity({
      kind: "auction",
      chainId: record.chainId,
      contract: record.target,
    });
  return null;
}
