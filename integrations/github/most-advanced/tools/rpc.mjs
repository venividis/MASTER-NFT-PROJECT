/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · a Chain that lives on the other side of a wire

  Every harness in tools/ runs the EVM in-process. This one signs real
  transactions and speaks JSON-RPC to a node it does not contain — a local
  hardhat, or a public testnet if you hand it an endpoint and a funded key.

  It deliberately implements the same narrow surface `tools/evm.mjs`'s
  Chain exposes (deploy / exec / read / call / getLogs / as), so that
  `deploySite` and the decoders run against a live node unchanged. The
  deployment sequence being identical in both worlds is the point: what the
  suite verified is what the testnet gets.
───────────────────────────────────────────────────────────────────────────*/
import { createLegacyTx } from "@ethereumjs/tx";
import { createCustomCommon, Mainnet, Hardfork } from "@ethereumjs/common";
import { hexToBytes, bytesToHex, privateToAddress } from "@ethereumjs/util";
import { enc } from "./evm.mjs";

/*  Node's global fetch does not read HTTP(S)_PROXY, so in an environment
    whose only road out is a proxy, a request to a public endpoint dies at
    the front door while localhost works perfectly — the exact shape of bug
    that passes every local test. For non-local URLs, route through the
    proxy with undici's own fetch and trust the environment's CA bundle,
    which is how the proxy signs what it carries.                        */
let proxied = null;
const fetcher = async (url) => {
  const host = new URL(url).hostname;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!proxy || host === "127.0.0.1" || host === "localhost" || host === "::1")
    return fetch;
  if (!proxied) {
    const { fetch: ufetch, ProxyAgent } = await import("undici");
    const fs = await import("node:fs");
    const caPath = process.env.NODE_EXTRA_CA_CERTS || "/root/.ccr/ca-bundle.crt";
    const requestTls = fs.existsSync(caPath) ? { ca: fs.readFileSync(caPath) } : undefined;
    const agent = new ProxyAgent({ uri: proxy, requestTls });
    proxied = (u, opts) => ufetch(u, { ...opts, dispatcher: agent });
  }
  return proxied;
};

/*  A kept-alive socket the node closed during a long local pause (solc
    compiling, mostly) surfaces as "other side closed" on the next request.
    That is not the node failing — retry on transport errors only, never on
    an RPC error, which is an answer.                                    */
const call = async (url, method, params = []) => {
  let last;
  for (let attempt = 0; attempt < 7; attempt++) {
    try {
      const f = await fetcher(url);
      const r = await f(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
      });
      const j = await r.json();
      if (j.error) throw Object.assign(new Error(`${method}: ${j.error.message}`), { rpc: true });
      return j.result;
    } catch (e) {
      /*  A load-balanced public endpoint answers each request from whichever
          replica the balancer picks, and a replica one block behind reports
          a pinned read as "header not found". That is lag, not an answer —
          retry it like a transport error.                               */
      if (e.rpc && !/not found|header|missing|unknown block/i.test(e.message)) throw e;
      last = e;
      await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
    }
  }
  throw new Error(`${method}: the node stopped answering — ${last && last.cause ? last.cause.code || last.cause : last}`);
};

export class RpcChain {
  constructor(url, keyHex, chainId) {
    this.url = url;
    this.key = hexToBytes(keyHex.startsWith("0x") ? keyHex : "0x" + keyHex);
    const addr = bytesToHex(privateToAddress(this.key));
    this.from = { toString: () => addr };
    this.common = createCustomCommon({ chainId: Number(chainId) }, Mainnet,
      { hardfork: Hardfork.Cancun });
    this.chainId = Number(chainId);
    this.nonce = null;
    this.gas = {};
    this.lastGas = 0n;
  }

  static async open(url, keyHex) {
    const chainId = Number(await call(url, "eth_chainId"));
    const c = new RpcChain(url, keyHex, chainId);
    c.nonce = BigInt(await call(url, "eth_getTransactionCount", [c.from.toString(), "pending"]));
    return c;
  }

  rpc(method, params = []) { return call(this.url, method, params); }

  /*  Legacy transactions on purpose: one shape that every chain and every
      block explorer understands, and nothing about fee markets to be wrong
      about. The price is asked of the node and padded, because a base fee
      can rise between asking and mining.                                 */
  async send({ to, data = "0x", value = 0n, label } = {}) {
    const gasPrice = (BigInt(await this.rpc("eth_gasPrice")) * 15n) / 10n + 1n;
    let gasLimit;
    try {
      const est = await this.rpc("eth_estimateGas", [{
        from: this.from.toString(), to: to || undefined,
        data, value: "0x" + BigInt(value).toString(16)
      }]);
      gasLimit = (BigInt(est) * 13n) / 10n;
    } catch (e) {
      /*  estimateGas replays the call and reports the revert here, which is
          a better error than a mined failure — surface it.              */
      throw new Error(`${label || "tx"} would revert: ${e.message}`);
    }
    const tx = createLegacyTx({
      nonce: this.nonce, gasPrice, gasLimit,
      to: to || undefined,
      value: BigInt(value),
      data: hexToBytes(data.startsWith("0x") ? data : "0x" + data)
    }, { common: this.common }).sign(this.key);

    const hash = await this.rpc("eth_sendRawTransaction", [bytesToHex(tx.serialize())]);
    this.nonce += 1n;

    let receipt = null;
    for (let i = 0; i < 240 && !receipt; i++) {
      receipt = await this.rpc("eth_getTransactionReceipt", [hash]);
      if (!receipt) await new Promise((r) => setTimeout(r, i < 10 ? 250 : 3000));
    }
    if (!receipt) throw new Error(`${label || "tx"} ${hash} not mined after four minutes`);
    if (receipt.status !== "0x1") throw new Error(`${label || "tx"} reverted in ${receipt.transactionHash}`);
    const gas = BigInt(receipt.gasUsed);
    if (label) this.gas[label] = (this.gas[label] || 0n) + gas;
    return { gas, hash, address: receipt.contractAddress || null,
             block: BigInt(receipt.blockNumber) };
  }

  async deploy(bytecode, args = "", label = "") {
    const r = await this.send({ data: bytecode + args, label: label || "deploy" });
    if (!r.address) throw new Error("deployment produced no address");
    return r.address;
  }

  async exec(to, sig, args = [], { value = 0n, label } = {}) {
    return this.send({ to, data: enc(sig, args), value, label: label || sig });
  }

  /*  The nonce this chain will use next. Read from the tracker rather
      than from the node: `eth_getTransactionCount` at "pending" lags
      transactions this process has already sent and is still waiting on,
      so asking the node mid-deploy answers about the past and any address
      predicted from it is wrong. The tracker is seeded from the node at
      open and stepped once per send, which is exactly the sequence CREATE
      hashes.                                                             */
  async nonceNow() {
    if (this.nonce !== null && this.nonce !== undefined) return BigInt(this.nonce);
    return BigInt(await this.rpc("eth_getTransactionCount",
      [this.from.toString(), "pending"]));
  }

  async call(to, data, from, tag = "latest") {
    const r = await this.rpc("eth_call", [{
      from: from || this.from.toString(), to,
      data: data.startsWith("0x") ? data : "0x" + data
    }, tag]);
    return r;
  }

  async read(to, sig, args = []) { return this.call(to, enc(sig, args)); }

  async codeSize(addr) {
    return (await this.rpc("eth_getCode", [addr, "latest"])).length / 2 - 1;
  }

  getLogs(filter) { return this.rpc("eth_getLogs", [filter]); }

  async as(keyHex) {
    const other = new RpcChain(this.url, keyHex, this.chainId);
    other.gas = this.gas;
    other.nonce = BigInt(await this.rpc("eth_getTransactionCount",
      [other.from.toString(), "pending"]));
    return other;
  }

  async balanceOf(addr, tag = "latest") {
    return BigInt(await this.rpc("eth_getBalance", [addr, tag]));
  }
}

/*  The hardhat development mnemonic's first accounts. Printed in every
    hardhat banner since 2019; they are for chains whose ether is free and
    for nothing else.                                                    */
export const DEV_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
];
