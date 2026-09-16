#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · a browser, a wallet, a testnet

  The last gap between "the suite passes" and "a person used it": Chromium
  loads the site from the gateway, a wallet-shaped provider is injected the
  way an extension injects one, and the whole journey runs — connect, be
  recognised as a holder, say something in the commons, watch it come back
  off the chain and onto the page.

  The provider holds no key. Reads go to the node through the gateway's
  /__rpc; eth_sendTransaction goes to /__wallet, where the gateway signs
  with a hardhat development key — the same shape as a real wallet, where
  the page never sees the key either.

      node tools/testnet.mjs && node tools/gateway.mjs &
      node tools/testnet-drive.mjs
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { RpcChain, DEV_KEYS } from "./rpc.mjs";
import { decUint } from "./evm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(ROOT, "dist/gallery/shots");
const record = JSON.parse(fs.readFileSync(path.join(ROOT, "dist/testnet.json"), "utf8"));
const GATEWAY = "http://localhost:8080";

let fail = 0;
const ok = (name, cond, detail) => {
  cond ? 0 : fail++;
  console.log(`  ${cond ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${name}`);
  if (!cond && detail) console.log(`      ${detail}`);
};
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);

const c = await RpcChain.open(record.rpc, DEV_KEYS[0]);
fs.mkdirSync(SHOTS, { recursive: true });

const CHROME = (() => {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  return fs.readdirSync(base).filter((d) => d.startsWith("chromium-"))
    .map((d) => path.join(base, d, "chrome-linux/chrome"))
    .find((f) => fs.existsSync(f));
})();
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--enable-webgl"]
});

/*  The provider, injected before any page script runs — the same moment an
    extension injects. It answers like a wallet: accounts are its own, reads
    are forwarded, sends go to the thing that holds the key.             */
const withWallet = async (address) => {
  const page = await browser.newPage({ viewport: { width: 1380, height: 940 } });
  page.setDefaultTimeout(120000);
  await page.addInitScript((addr) => {
    let id = 0;
    const rpc = async (method, params) => {
      const r = await fetch("/__rpc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params || [] })
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    };
    window.ethereum = {
      isTestnetHarness: true,
      request: async ({ method, params }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [addr];
        if (method === "eth_sendTransaction") {
          const t = params[0];
          const r = await fetch("/__wallet", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from: addr, to: t.to, data: t.data, value: t.value || null })
          });
          const j = await r.json();
          if (!r.ok || j.error) throw new Error(j.error || "the wallet refused");
          return j.hash;
        }
        return rpc(method, params);
      }
    };
  }, address);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { page, errors };
};

const holder1 = record.holders["1"];
const holder2 = record.holders["2"];

/*  A wallet that answers eth_accounts without a prompt is one the person
    already authorised, and the page treats it exactly as it should: boot()
    sees the account and the gate is down before anyone can click connect.
    So "connect" here is: arrive, and wait to be recognised.             */
const connected = async (page) => {
  await page.goto(page.url(), { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForSelector("body.held", { timeout: 45000 });
};

/*──────────────── the commons, as a person meets it ────────────────*/
head("a holder walks in and says something");
{
  const { page, errors } = await withWallet(holder1);
  await page.goto(GATEWAY + "/chat");
  await page.waitForSelector("body.held", { timeout: 45000 });
  ok("an authorised wallet is recognised as a holder on arrival", true);
  ok("and it is speaking as #1",
     (await page.locator(".asme").first().innerText()) === "#1");

  const before = decUint(await c.read(record.contracts.parley, "stateOf(uint256)", [0]), 1);
  const line = "typed in a real browser, mined by a real node";
  await page.locator("#say").fill(line);
  await page.locator("#send").click();

  /*  Nothing here waits on a fixed clock for the chain — the count is the
      contract's own, and the page repaints on its own schedule after a
      send. Wait for each in turn.                                       */
  await page.waitForFunction(async () => true); // yield
  let after = before;
  for (let i = 0; i < 40 && after === before; i++) {
    await page.waitForTimeout(500);
    after = decUint(await c.read(record.contracts.parley, "stateOf(uint256)", [0]), 1);
  }
  ok("the message was mined", after === before + 1n, `count ${before} → ${after}`);

  await page.waitForFunction((want) => {
    const box = document.getElementById("log");
    return box && box.textContent.includes(want);
  }, line, { timeout: 30000 });
  ok("and came back off the chain onto the page", true);

  const got = await page.evaluate(() => {
    const ps = document.querySelectorAll("#log .msg p");
    const last = ps[ps.length - 1];
    return { text: last.textContent, kids: last.children.length, html: last.innerHTML };
  });
  ok("as text, through textContent, with no markup parsed out of it",
     got.kids === 0, JSON.stringify(got).slice(0, 120));

  await page.screenshot({ path: path.join(SHOTS, "testnet-chat.png") });
  ok("no page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

/*──────────────── the second holder answers ────────────────*/
head("the other holder answers from another browser");
{
  const { page } = await withWallet(holder2);
  await page.goto(GATEWAY + "/chat");
  await page.waitForSelector("body.held", { timeout: 45000 });
  ok("this wallet speaks as #2",
     (await page.locator(".asme").first().innerText()) === "#2");

  await page.locator("#say").fill("and answered from a second wallet");
  await page.locator("#send").click();
  await page.waitForFunction(() => {
    const box = document.getElementById("log");
    return box && box.textContent.includes("and answered from a second wallet");
  }, null, { timeout: 30000 });
  ok("the answer is on the page too", true);
  await page.close();
}

/*──────────────── the door ────────────────*/
head("the door hands over what this wallet holds");
{
  const { page } = await withWallet(holder1);
  await page.goto(GATEWAY + "/");
  await page.waitForSelector("#yours .room", { timeout: 45000 });
  const rows = await page.locator("#yours .room").count();
  ok(`the door lists this wallet's tokens (${rows})`, rows >= 1);
  await page.screenshot({ path: path.join(SHOTS, "testnet-door.png") });
  await page.close();
}

/*──────────────── the instrument, on a real origin ────────────────*/
head("the instrument, served by the chain, on a real origin");
{
  const { page, errors } = await withWallet(holder1);
  await page.goto(GATEWAY + "/token/1/live");
  const drew = await page.waitForFunction(() => {
    const c = document.getElementById("field");
    return !!c && !!c.getContext("webgl2") && document.body.classList.contains("up");
  }, null, { timeout: 60000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(2500);
  ok("it draws", drew, errors.slice(0, 2).join(" | "));
  ok("and it is not sandboxed here — storage works, wallets can inject",
     await page.evaluate(() => { try { localStorage.setItem("t", "1"); return true; }
                                 catch (e) { return false; } }));
  await page.screenshot({ path: path.join(SHOTS, "testnet-live.png") });
  await page.close();
}

await browser.close();
console.log(`\n  ${fail === 0 ? "\x1b[32mthe whole journey holds\x1b[0m" : `\x1b[31m${fail} failed\x1b[0m`}\n`);
process.exit(fail ? 1 : 0);
