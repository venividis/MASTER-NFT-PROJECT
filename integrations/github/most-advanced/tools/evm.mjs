/*───────────────────────────────────────────────────────────────────────────
  A small harness around @ethereumjs/vm: deploy, call, read, and account for
  the gas. Enough to run the whole collection end to end in this process,
  with no node, no network and no fork.
───────────────────────────────────────────────────────────────────────────*/
import { createVM, runTx } from "@ethereumjs/vm";
import { Common, Mainnet, Hardfork, createCustomCommon } from "@ethereumjs/common";
import {
  Account, createAddressFromString, hexToBytes, bytesToHex, createAddressFromPrivateKey
} from "@ethereumjs/util";
import { createLegacyTx } from "@ethereumjs/tx";
import { createBlock } from "@ethereumjs/block";
import { keccak256 } from "ethereum-cryptography/keccak.js";

export const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });

/* A plausible mainnet block, so block.number, timestamp and prevrandao are
   the sort of values the contracts will actually see. */
const mkBlock = (number, timestamp) => createBlock(
  {
    header: {
      number,
      timestamp,
      gasLimit: 400_000_000n,
      baseFeePerGas: 7n,
      difficulty: 0n,
      mixHash: "0x" + "5e".repeat(32)
    }
  },
  { common, skipConsensusFormatValidation: true }
);

export const GENESIS_TIME = 1_733_000_000n;

/* A block header is frozen once built, so moving time means building a new
   one. `export let` is a live binding, so importers that reach through the
   module namespace see the change without re-importing. */
export let BLOCK = mkBlock(21_000_000n, GENESIS_TIME);

/// @notice Move the chain to an absolute block number.
/// @dev    Twelve seconds a block, so a harness that rolls and a harness
///         that warps do not disagree about what time it is.
export function roll(number) {
  const n = BigInt(number);
  BLOCK = mkBlock(n, GENESIS_TIME + (n - 21_000_000n) * 12n);
  return BLOCK;
}

/// @notice Move the chain clock to an absolute timestamp.
export function warp(timestamp) {
  const t = BigInt(timestamp);
  const advanced = t > GENESIS_TIME ? (t - GENESIS_TIME) / 12n : 0n;
  BLOCK = mkBlock(21_000_000n + advanced, t);
  return BLOCK;
}

/*──────────────── tiny ABI coder (enough for the harness) ────────────────*/
const pad = (h) => h.replace(/^0x/, "").padStart(64, "0");

export function sel(sig) {
  return "0x" + Buffer.from(keccak256(Buffer.from(sig, "utf8"))).toString("hex").slice(0, 8);
}

export function enc(sig, args = []) {
  const m = sig.match(/^([\w$]+)\((.*)\)$/);
  const types = m[2].trim() ? m[2].split(",").map((s) => s.trim()) : [];
  let head = "", tail = "";
  const headLen = types.length * 32;
  const word = (t, v) => {
    if (t === "address") return pad(String(v).slice(2).toLowerCase());
    if (t === "bool") return pad(v ? "1" : "0");
    if (t === "bytes32") {
      // a number means the value, not the digits: 77 is 0x4d, not 0x77
      if (typeof v === "number" || typeof v === "bigint") return pad(BigInt(v).toString(16));
      return pad(String(v).replace(/^0x/, ""));
    }
    if (/^bytes([1-9]|[12]\d|3[0-2])$/.test(t)) {
      // a fixed-size bytesN is LEFT-aligned in its word
      return String(v).replace(/^0x/, "").padEnd(64, "0");
    }
    if (/^u?int/.test(t)) {
      let n = BigInt(v);
      if (n < 0n) n = (1n << 256n) + n;
      return pad(n.toString(16));
    }
    throw new Error("harness cannot encode " + t);
  };
  for (let i = 0; i < types.length; i++) {
    const t = types[i], v = args[i];
    if (t === "bytes" || t === "string") {
      /*  `bytes` means a hex string here, and anything else used to be
          coerced silently: a Buffer was stringified to its own text and
          then re-read as hex, which for "the commons" parses to nothing
          and encodes an EMPTY argument. The contract then reverted for a
          reason that had nothing to do with the test, and the test looked
          like it had found a bug. Refuse it instead.                    */
      if (t === "bytes") {
        if (Buffer.isBuffer(v) || v instanceof Uint8Array)
          throw new Error("harness wants bytes as a hex string, not a Buffer — " +
                          'use "0x" + buf.toString("hex")');
        if (v !== "" && !/^(0x)?([0-9a-fA-F]{2})*$/.test(String(v)))
          throw new Error("not hex, so this would encode as empty: " + String(v).slice(0, 40));
      }
      const b = t === "string" ? Buffer.from(String(v), "utf8") : Buffer.from(String(v).replace(/^0x/, ""), "hex");
      head += pad((headLen + tail.length / 2).toString(16));
      tail += pad(b.length.toString(16)) + b.toString("hex").padEnd(Math.ceil(b.length / 32) * 64, "0");
    } else if (t === "address[]") {
      const arr = v || [];
      head += pad((headLen + tail.length / 2).toString(16));
      tail += pad(arr.length.toString(16)) +
              arr.map((x) => pad(String(x).slice(2).toLowerCase())).join("");
    } else if (/^bytes([1-9]|[12]\d|3[0-1])\[\]$/.test(t)) {
      // elements of a fixed-size bytesN array are LEFT-aligned in their words
      const arr = v || [];
      head += pad((headLen + tail.length / 2).toString(16));
      tail += pad(arr.length.toString(16)) +
              arr.map((x) => String(x).replace(/^0x/, "").padEnd(64, "0")).join("");
    } else if (t === "bytes32[]") {
      const arr = v || [];
      head += pad((headLen + tail.length / 2).toString(16));
      tail += pad(arr.length.toString(16)) + arr.map((x) => pad(String(x).replace(/^0x/, ""))).join("");
    } else head += word(t, v);
  }
  return sel(sig) + head + tail;
}

export const decUint = (hex, i = 0) => BigInt("0x" + (hex.replace(/^0x/, "").substr(i * 64, 64) || "0"));
export const decAddr = (hex, i = 0) => "0x" + hex.replace(/^0x/, "").substr(i * 64, 64).slice(24);
export const decBool = (hex, i = 0) => decUint(hex, i) !== 0n;

export function decString(hex) {
  const h = hex.replace(/^0x/, "");
  if (h.length < 128) return "";
  const off = Number(BigInt("0x" + h.substr(0, 64))) * 2;
  const len = Number(BigInt("0x" + h.substr(off, 64)));
  return Buffer.from(h.substr(off + 64, len * 2), "hex").toString("utf8");
}

/// @param at index of the head word holding the offset to the array
export function decStringArray(hex, at = 0) {
  const h = hex.replace(/^0x/, "");
  const base = Number(BigInt("0x" + h.substr(at * 64, 64))) * 2;
  const n = Number(BigInt("0x" + h.substr(base, 64)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const off = base + 64 + Number(BigInt("0x" + h.substr(base + 64 + i * 64, 64))) * 2;
    const len = Number(BigInt("0x" + h.substr(off, 64)));
    out.push(Buffer.from(h.substr(off + 64, len * 2), "hex").toString("utf8"));
  }
  return out;
}

/*──────────────── the chain ────────────────*/
export class Chain {
  constructor(vm, key) {
    this.vm = vm;
    this.key = key;
    this.from = createAddressFromPrivateKey(key);
    this.nonce = 0n;
    this.gas = {};
    /*  Shared with every actor `as()` mints, because a conversation with
        two people in it is one archive and not two.                     */
    this.log = [];
  }

  /**
   * @param {{chainId?: number|bigint}} [opts] A chain to pretend to be.
   *
   * Defaults to mainnet, which is what every existing suite expects. It is
   * an option because `block.chainid` is an opcode and no mock can stand
   * in front of it: a contract that behaves differently per chain — and
   * this collection's do, since the edition is partitioned across five —
   * has branches that simply cannot be reached from a harness pinned to
   * one. The branch that protects every testnet was the one out of reach.
   */
  static async open(opts = {}) {
    const chainCommon = opts.chainId === undefined
      ? common
      : createCustomCommon({ chainId: Number(opts.chainId) }, Mainnet,
          { hardfork: Hardfork.Cancun });
    const vm = await createVM({ common: chainCommon });
    const key = hexToBytes("0x" + "11".repeat(32));
    const chain = new Chain(vm, key);
    chain.common = chainCommon;
    await vm.stateManager.putAccount(
      chain.from,
      new Account(0n, 10n ** 24n)
    );
    return chain;
  }

  async fund(addrHex, wei) {
    const a = createAddressFromString(addrHex);
    const acct = (await this.vm.stateManager.getAccount(a)) ?? new Account();
    acct.balance += BigInt(wei);
    await this.vm.stateManager.putAccount(a, acct);
  }

  /// @notice A second actor on the same chain: same VM, same state, a
  ///         different key.
  /// @dev    Worth the four lines. "A renter cannot sell it" is only a
  ///         claim about the contract when the address attempting it
  ///         genuinely is not the holder — tested with one key and a flag,
  ///         it is a claim about the test.
  async as(keyHex, wei = 10n ** 22n) {
    const other = new Chain(this.vm, hexToBytes(keyHex));
    other.gas = this.gas;
    other.log = this.log;
    await this.fund(other.from.toString(), wei);
    return other;
  }

  /// The deployer's next nonce, read from state — the number CREATE hashes
  /// with the sender to decide where a contract lands.
  async nonceNow() {
    const acct = await this.vm.stateManager.getAccount(this.from);
    return acct ? acct.nonce : 0n;
  }

  async balanceOf(addrHex) {
    const acct = await this.vm.stateManager.getAccount(createAddressFromString(addrHex));
    return acct ? acct.balance : 0n;
  }

  async send({ to = null, data = "0x", value = 0n, label = "", gasLimit = 400_000_000n }) {
    // read the nonce back from state rather than tracking it: a tx that
    // reverts still consumes one, and a tx rejected at validation does not
    const sender = await this.vm.stateManager.getAccount(this.from);
    const tx = createLegacyTx(
      {
        nonce: sender ? sender.nonce : 0n,
        gasPrice: 10n,
        gasLimit,
        to: to ? createAddressFromString(to) : undefined,
        value: BigInt(value),
        data: hexToBytes(data.startsWith("0x") ? data : "0x" + data)
      },
      /*  This chain's own common, not the module's. A legacy transaction
          signed against mainnet and replayed on a chain that says it is
          8453 is a signature over the wrong id, and the sender recovers to
          somebody else — which reads as a balance error rather than as
          what it is.                                                   */
      { common: this.common || common }
    ).sign(this.key);

    const res = await runTx(this.vm, {
      tx, block: BLOCK,
      skipBalance: true, skipBlockGasLimitValidation: true, skipHardForkValidation: true
    });
    const err = res.execResult.exceptionError;
    if (err) {
      const ret = bytesToHex(res.execResult.returnValue || new Uint8Array());
      throw new Error(
        `${label || "tx"} reverted: ${err.error}` + (ret && ret !== "0x" ? ` data=${ret.slice(0, 138)}` : "")
      );
    }
    if (label) this.gas[label] = (this.gas[label] || 0n) + res.totalGasSpent;
    this._record(res, tx);
    return {
      gas: res.totalGasSpent,
      address: res.createdAddress ? res.createdAddress.toString() : null,
      ret: bytesToHex(res.execResult.returnValue || new Uint8Array()),
      logs: res.execResult.logs || []
    };
  }

  /*  A log ledger.

      The client this collection ships reads a conversation by walking logs
      one block at a time, and a harness with no logs in it cannot tell
      whether that walk terminates — which is the only property of the walk
      that matters, because the failure is a browser asking somebody's node
      for the same block forever.

      So every transaction's logs are kept with the block they landed in,
      and `getLogs` answers the shape and the filter rules a node answers
      with: inclusive block bounds, positional topic matching, null for
      "any", and an array for "any of these".                            */
  _record(res, tx) {
    const n = BLOCK.header.number;
    const hex = (u) => "0x" + Buffer.from(u).toString("hex");
    for (const l of res.execResult.logs || []) {
      const [addr, topics, data] = l;
      this.log.push({
        address: hex(addr),
        topics: topics.map(hex),
        data: hex(data),
        blockNumber: "0x" + n.toString(16),
        logIndex: "0x" + this.log.length.toString(16),
        transactionHash: hex(tx.hash())
      });
    }
  }

  getLogs({ address, fromBlock, toBlock, topics } = {}) {
    const at = (v, d) => (v == null || v === "latest" || v === "pending" ? d : BigInt(v));
    const lo = at(fromBlock, 0n);
    const hi = at(toBlock, BLOCK.header.number);
    const want = String(address || "").toLowerCase();
    return this.log.filter((l) => {
      const n = BigInt(l.blockNumber);
      if (n < lo || n > hi) return false;
      if (want && l.address.toLowerCase() !== want) return false;
      for (let i = 0; i < (topics || []).length; ++i) {
        const t = topics[i];
        if (t == null) continue;
        const set = Array.isArray(t) ? t : [t];
        const got = String(l.topics[i] || "").toLowerCase();
        if (!set.some((x) => String(x).toLowerCase() === got)) return false;
      }
      return true;
    });
  }

  async deploy(bytecode, args = "", label = "") {
    const r = await this.send({ data: bytecode + args, label: label || "deploy" });
    if (!r.address) throw new Error("deployment produced no address");
    return r.address;
  }

  /// @dev A read. Runs as a call so state is untouched and gas is free.
  async call(to, data, from) {
    const res = await this.vm.evm.runCall({
      to: createAddressFromString(to),
      caller: createAddressFromString(from || this.from.toString()),
      origin: createAddressFromString(from || this.from.toString()),
      data: hexToBytes(data.startsWith("0x") ? data : "0x" + data),
      gasLimit: 3_000_000_000n,
      value: 0n,
      block: BLOCK
    });
    if (res.execResult.exceptionError) {
      const ret = bytesToHex(res.execResult.returnValue || new Uint8Array());
      throw new Error(`call reverted: ${res.execResult.exceptionError.error} ${ret.slice(0, 138)}`);
    }
    this.lastGas = res.execResult.executionGasUsed;
    return bytesToHex(res.execResult.returnValue);
  }

  async read(to, sig, args = []) {
    return this.call(to, enc(sig, args));
  }

  async exec(to, sig, args = [], opts = {}) {
    return this.send({ to, data: enc(sig, args), label: opts.label || sig, ...opts });
  }

  async codeSize(addrHex) {
    const code = await this.vm.stateManager.getCode(createAddressFromString(addrHex));
    return code.length;
  }
}

export function encodeAddressArg(a) {
  return pad(String(a).slice(2).toLowerCase());
}
export function encodeUintArg(n) {
  return pad(BigInt(n).toString(16));
}
