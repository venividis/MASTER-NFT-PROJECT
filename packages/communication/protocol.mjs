import { consumeRatchet } from "ts-mls/secretTree.js";
import {
  createGroup,
  joinGroup,
  encodeGroupState,
  decodeGroupState,
} from "ts-mls/clientState.js";
import { generateKeyPackage } from "ts-mls/keyPackage.js";
import { createCommit } from "ts-mls/createCommit.js";
import { createApplicationMessage } from "ts-mls/createMessage.js";
import { processMessage } from "ts-mls/processMessages.js";
import { encodeMlsMessage, decodeMlsMessage } from "ts-mls/message.js";
import { defaultCapabilities } from "ts-mls/defaultCapabilities.js";
import { defaultLifetime } from "ts-mls/lifetime.js";
import { defaultLifetimeConfig } from "ts-mls/lifetimeConfig.js";
import { defaultKeyPackageEqualityConfig } from "ts-mls/keyPackageEqualityConfig.js";
import { emptyPskIndex } from "ts-mls/pskIndex.js";
import { getCiphersuiteFromName } from "ts-mls/crypto/ciphersuite.js";
import { makeHashImpl } from "ts-mls/crypto/implementation/default/makeHashImpl.js";
import {
  makeKdfImpl,
  makeKdf,
} from "ts-mls/crypto/implementation/default/makeKdfImpl.js";
import { makeGenericHpke } from "ts-mls/crypto/implementation/hpke.js";
import {
  CipherSuite,
  DhkemP256HkdfSha256,
  HkdfSha256,
  Aes128Gcm,
} from "@hpke/core";
import { p256 } from "@noble/curves/nist.js";
const te = new TextEncoder(),
  td = new TextDecoder();
export const MLS_VERSION = "ts-mls@1.6.4 / RFC9420 / ciphersuite 0x0002";
export const hex = (b) =>
  "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const bytes = (h) => {
  if (h instanceof Uint8Array) return h;
  if (!/^0x(?:[0-9a-f]{2})*$/i.test(h)) throw Error("Invalid hex bytes.");
  return Uint8Array.from(h.slice(2).match(/../g) || [], (x) => parseInt(x, 16));
};
export const wipe = (value) => {
  if (value instanceof Uint8Array) value.fill(0);
  else if (value instanceof Map)
    for (const [k, v] of value) {
      wipe(k);
      wipe(v);
    }
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) wipe(v);
};
const decode = (decoder, b) => {
  const found = decoder(bytes(b), 0);
  if (!found || found[1] !== bytes(b).length)
    throw Error("Malformed or trailing MLS bytes.");
  return found[0];
};
const msg = (body) => ({ version: "mls10", ...body });
export const decodeWire = (b) => decode(decodeMlsMessage, b);
const identity = (wallet) => ({
  credentialType: "basic",
  identity: te.encode(wallet.toLowerCase()),
});
const who = (leaf) =>
  leaf?.credential?.credentialType === "basic"
    ? td.decode(leaf.credential.identity).toLowerCase()
    : "";
export const roster = (state) =>
  state.ratchetTree
    .filter((x) => x?.nodeType === "leaf")
    .map((x) => who(x.leaf))
    .sort();
const aad = (meta) =>
  te.encode(
    JSON.stringify([
      "anima.mls.transport/1",
      String(meta.chainId),
      meta.contract.toLowerCase(),
      meta.group.toLowerCase(),
      String(meta.index),
      String(meta.epoch),
      meta.sender.toLowerCase(),
      meta.kind,
    ]),
  );
let suitePromise;
export async function suite() {
  if (!suitePromise)
    suitePromise = (async () => {
      const cs = getCiphersuiteFromName(
          "MLS_128_DHKEMP256_AES128GCM_SHA256_P256",
        ),
        subtle = globalThis.crypto.subtle;
      const aead = {
        keyLength: 16,
        nonceLength: 12,
        tagLength: 16,
        async encrypt(key, nonce, aad, plaintext) {
          const k = await subtle.importKey("raw", key, "AES-GCM", false, [
            "encrypt",
          ]);
          return new Uint8Array(
            await subtle.encrypt(
              { name: "AES-GCM", iv: nonce, additionalData: aad },
              k,
              plaintext,
            ),
          );
        },
        async decrypt(key, nonce, aad, ciphertext) {
          const k = await subtle.importKey("raw", key, "AES-GCM", false, [
            "decrypt",
          ]);
          return new Uint8Array(
            await subtle.decrypt(
              { name: "AES-GCM", iv: nonce, additionalData: aad },
              k,
              ciphertext,
            ),
          );
        },
      };
      return {
        name: cs.name,
        hash: makeHashImpl(subtle, cs.hash),
        kdf: makeKdfImpl(makeKdf(cs.hpke.kdf)),
        rng: { randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)) },
        hpke: await makeGenericHpke(
          cs.hpke,
          aead,
          new CipherSuite({
            kem: new DhkemP256HkdfSha256(),
            kdf: new HkdfSha256(),
            aead: new Aes128Gcm(),
          }),
        ),
        signature: {
          async sign(key, m) {
            return p256.sign(m, key, {
              prehash: true,
              format: "der",
              lowS: false,
            });
          },
          async verify(key, m, s) {
            return p256.verify(s, m, key, {
              prehash: true,
              format: "der",
              lowS: false,
            });
          },
          async keygen() {
            const signKey = p256.utils.randomSecretKey();
            return { signKey, publicKey: p256.getPublicKey(signKey, false) };
          },
        },
      };
    })();
  return suitePromise;
}
export function config(validateCredential) {
  return {
    authService: {
      validateCredential: async (c, s) =>
        c.credentialType === "basic" &&
        s.length === 65 &&
        s[0] === 4 &&
        (await validateCredential(td.decode(c.identity), s)),
    },
    keyRetentionConfig: {
      retainKeysForGenerations: 0,
      retainKeysForEpochs: 0,
      maximumForwardRatchetSteps: 32,
    },
    lifetimeConfig: defaultLifetimeConfig,
    keyPackageEqualityConfig: defaultKeyPackageEqualityConfig,
    paddingConfig: { kind: "alwaysPad", paddingLength: 256 },
  };
}
export async function newPackage(wallet) {
  const s = await suite();
  return generateKeyPackage(
    identity(wallet),
    {
      versions: ["mls10"],
      ciphersuites: [s.name],
      extensions: [],
      proposals: [],
      credentials: ["basic"],
    },
    {
      notBefore: BigInt(Math.floor(Date.now() / 1000) - 60),
      notAfter: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400),
    },
    [],
    s,
  );
}
export function publicPackage(p) {
  return hex(
    encodeMlsMessage(
      msg({ wireformat: "mls_key_package", keyPackage: p.publicPackage }),
    ),
  );
}
export function packageSignature(p) {
  return hex(p.publicPackage.leafNode.signaturePublicKey);
}
export function readPackage(wire, wallet) {
  const p = decodeWire(wire);
  if (
    p.wireformat !== "mls_key_package" ||
    p.keyPackage.cipherSuite !== "MLS_128_DHKEMP256_AES128GCM_SHA256_P256" ||
    who(p.keyPackage.leafNode) !== wallet.toLowerCase()
  )
    throw Error("KeyPackage identity or ciphersuite mismatch.");
  return p.keyPackage;
}
export function exportState(state) {
  return hex(encodeGroupState(state));
}
export function importState(encoded, validateCredential) {
  return {
    ...decode(decodeGroupState, encoded),
    clientConfig: config(validateCredential),
  };
}
export async function create(groupId, p, validateCredential) {
  return createGroup(
    bytes(groupId),
    p.publicPackage,
    p.privatePackage,
    [],
    await suite(),
    config(validateCredential),
  );
}
export async function fingerprint(state) {
  return hex(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new Uint8Array([
          ...state.groupContext.groupId,
          ...state.groupContext.confirmedTranscriptHash,
          ...state.confirmationTag,
        ]),
      ),
    ),
  );
}
export async function commit(state, { add = [], remove = [], meta }) {
  const proposals = [
    ...remove.map((wallet) => {
      const index = state.ratchetTree.findIndex(
        (n) => n?.nodeType === "leaf" && who(n.leaf) === wallet.toLowerCase(),
      );
      if (index < 0) throw Error("Removed member absent from MLS tree.");
      return { proposalType: "remove", remove: { removed: index / 2 } };
    }),
    ...add.map(({ wallet, wire }) => ({
      proposalType: "add",
      add: { keyPackage: readPackage(wire, wallet) },
    })),
  ];
  // Preserve the old epoch with its consumed handshake generation advanced. This is
  // the recovery state for an abandoned commit, not a rollback to an already used key.
  const before = {
    ...decode(decodeGroupState, exportState(state)),
    clientConfig: state.clientConfig,
  };
  const advanced = await consumeRatchet(
    before.secretTree,
    before.privatePath.leafIndex,
    "commit",
    await suite(),
  );
  const cancelState = exportState({ ...before, secretTree: advanced.newTree });
  advanced.consumed.forEach(wipe);
  wipe(before);
  wipe(advanced.newTree);
  const result = await createCommit(
    { state, cipherSuite: await suite() },
    {
      extraProposals: proposals,
      ratchetTreeExtension: true,
      authenticatedData: aad(meta),
    },
  );
  result.consumed.forEach(wipe);
  return {
    state: result.newState,
    cancelState,
    body: hex(encodeMlsMessage(result.commit)),
    welcome: result.welcome
      ? hex(
          encodeMlsMessage(
            msg({ wireformat: "mls_welcome", welcome: result.welcome }),
          ),
        )
      : "0x",
    transcript: await fingerprint(result.newState),
    roster: roster(result.newState),
  };
}
export async function join(welcome, p, groupId, validateCredential) {
  const wire = decodeWire(welcome);
  if (wire.wireformat !== "mls_welcome") throw Error("Expected MLS Welcome.");
  const state = await joinGroup(
    wire.welcome,
    p.publicPackage,
    p.privatePackage,
    emptyPskIndex,
    await suite(),
    undefined,
    undefined,
    config(validateCredential),
  );
  if (hex(state.groupContext.groupId) !== groupId.toLowerCase())
    throw Error("Welcome belongs to another group.");
  const isolated = importState(exportState(state), validateCredential);
  return isolated;
}
export async function send(state, text, meta) {
  if (te.encode(text).length > 6000)
    throw Error("Message exceeds 6,000 UTF-8 bytes.");
  const result = await createApplicationMessage(
    state,
    te.encode(JSON.stringify({ sender: meta.sender.toLowerCase(), text })),
    await suite(),
    aad(meta),
  );
  result.consumed.forEach(wipe);
  return {
    state: result.newState,
    body: hex(
      encodeMlsMessage(
        msg({
          wireformat: "mls_private_message",
          privateMessage: result.privateMessage,
        }),
      ),
    ),
  };
}
export async function receive(state, body, meta, expectedRoster) {
  const wire = decodeWire(body);
  if (
    wire.wireformat !== "mls_private_message" &&
    wire.wireformat !== "mls_public_message"
  )
    throw Error("Unexpected MLS wire type.");
  const data =
    wire.privateMessage?.authenticatedData ??
    wire.publicMessage?.content?.authenticatedData;
  if (hex(data || new Uint8Array()) !== hex(aad(meta)))
    throw Error(
      "MLS message does not authenticate its chain transport coordinates.",
    );
  const result = await processMessage(
    wire,
    state,
    emptyPskIndex,
    (incoming) => {
      if (incoming.kind !== "commit") return "reject";
      return who(state.ratchetTree[incoming.senderLeafIndex * 2]?.leaf) ===
        meta.sender.toLowerCase()
        ? "accept"
        : "reject";
    },
    await suite(),
  );
  if (meta.kind === 1) {
    if (
      result.kind !== "newState" ||
      result.newState.groupContext.epoch !== state.groupContext.epoch + 1n ||
      JSON.stringify(roster(result.newState)) !==
        JSON.stringify(expectedRoster.map((x) => x.toLowerCase()).sort())
    )
      throw Error(
        "MLS commit did not authenticate the expected epoch and membership.",
      );
  } else if (result.kind !== "applicationMessage")
    throw Error("Unexpected handshake in message transport.");
  let text;
  if (result.kind === "applicationMessage") {
    const envelope = JSON.parse(td.decode(result.message));
    if (
      envelope.sender !== meta.sender.toLowerCase() ||
      typeof envelope.text !== "string"
    )
      throw Error("MLS sender differs from signing wallet.");
    text = envelope.text;
    wipe(result.message);
  }
  result.consumed.forEach(wipe);
  return { state: result.newState, text };
}
