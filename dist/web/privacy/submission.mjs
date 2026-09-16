import { getAddress, keccak256 } from "../vendor/ethers.min.js";

const HASH = /^0x[0-9a-f]{64}$/i;
export function validateSubmission(value, { requireHash = true } = {}) {
  if (
    !value ||
    !Number.isSafeInteger(Number(value.chainId)) ||
    Number(value.chainId) < 1 ||
    !HASH.test(value.requestHash) ||
    (requireHash && !HASH.test(value.hash))
  )
    throw Error(
      "This submission has no verifiable transaction fingerprint. Preserve its backup and reconcile it independently.",
    );
  return {
    ...value,
    chainId: Number(value.chainId),
    relay: getAddress(value.relay),
  };
}

/** Resolve only the exact reviewed transaction; a missing receipt never permits resubmission. */
export async function inspectSubmission(
  provider,
  input,
  applicationError = () => null,
) {
  const pending = validateSubmission(input);
  if ((await provider.getNetwork()).chainId !== BigInt(pending.chainId))
    throw Error("Recovery network does not match the reserved submission.");
  const transaction = await provider.getTransaction(pending.hash);
  if (!transaction)
    return { state: "pending", hash: pending.hash, chainId: pending.chainId };
  if (
    !transaction.to ||
    getAddress(transaction.to) !== pending.relay ||
    keccak256(transaction.data) !== pending.requestHash ||
    BigInt(transaction.value || 0) !== 0n
  )
    throw Error(
      "Transaction does not match the exact reserved private operation.",
    );
  const receipt = await provider.getTransactionReceipt(pending.hash);
  if (!receipt)
    return { state: "pending", hash: pending.hash, chainId: pending.chainId };
  const confirmations = await receipt.confirmations();
  if (confirmations < 2)
    return {
      state: "confirming",
      hash: pending.hash,
      chainId: pending.chainId,
      confirmations,
    };
  const state =
    receipt.status !== 1
      ? "reverted"
      : applicationError(receipt.logs)
        ? "application-reverted"
        : "confirmed";
  return {
    state,
    hash: pending.hash,
    chainId: pending.chainId,
    blockNumber: receipt.blockNumber,
    confirmations,
  };
}

/** Called as soon as the broadcaster supplies a hash, before its receipt wait. */
export async function persistSubmission(vault, event) {
  // The decrypted snapshot in this tab may be stale. Merge only these receipt facts
  // into the latest authenticated envelope while holding the shared storage lock.
  await vault.updateReceipt((data) => {
    const pending = data.pending;
    if (!pending || pending.id !== event.id)
      throw Error("The reserved private submission is unavailable.");
    const next = validateSubmission({ ...pending, ...event });
    if (
      next.requestHash !== pending.requestHash ||
      next.chainId !== Number(pending.chainId) ||
      next.relay !== getAddress(pending.relay) ||
      (pending.hash && pending.hash !== next.hash)
    )
      throw Error("Private submission does not match its reserved operation.");
    return {
      ...data,
      pending: {
        ...pending,
        hash: next.hash,
        state: pending.state === "confirming" ? "confirming" : "submitted",
        submittedAt: Date.now(),
      },
    };
  });
  return true;
}

/** Release only an exact reservation whose verified worker never called the broadcaster. */
export async function releaseUnsubmitted(vault, result) {
  const record = validateSubmission(result, {requireHash: false});
  if (record.state !== "not-submitted" || record.broadcastAttempted !== false || record.hash)
    throw Error("Only a confirmed pre-broadcast rejection can release a reservation.");
  await vault.updateReceipt((data) => {
    const pending = data.pending;
    if (!pending || pending.id !== record.id || pending.hash || pending.state !== "reserved" ||
        pending.requestHash !== record.requestHash || Number(pending.chainId) !== record.chainId ||
        getAddress(pending.relay) !== record.relay)
      throw Error("Pre-broadcast rejection does not match the exact reserved operation.");
    const next = {...data};
    delete next.pending;
    return next;
  });
}
