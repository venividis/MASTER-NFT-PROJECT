import test from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import { BrowserProvider, ZeroAddress, parseEther } from "ethers";
import { connectedExitVault } from "../../web/exit/live.mjs";
import { deployContract } from "../../scripts/lib/deploy-stack.mjs";
async function setup(t, native = false) {
  const rpc = ganache.provider({
    chain: { chainId: 31337, hardfork: "shanghai" },
    logging: { quiet: true },
  });
  t.after(() => rpc.disconnect());
  const p = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 });
  p.pollingInterval = 10;
  const owner = await p.getSigner(0),
    keeper = await p.getSigner(1),
    next = await p.getSigner(2),
    addr = await owner.getAddress();
  const d = (n, a = []) => deployContract(n, owner, a);
  const c = await d("ExitCollectionMock"),
    a = await d("ExitAccountMock", [addr]);
  await (await c.bind(1, a.target)).wait();
  const token = await d("OperatingTokenMock", [18]);
  const ledger = native
    ? await d("ExitNativeLedgerMock", [c.target, addr])
    : null;
  const market = await d(
    native ? "NativeMarket" : "ExitMarketMock",
    native ? [ledger.target] : [],
  );
  const v = await d("VestedExitVault", [c.target, market.target]);
  await (await token.mint(a.target, parseEther("100"))).wait();
  await (await token.mint(addr, parseEther("1000000"))).wait();
  if (native) {
    await (await token.approve(market.target, parseEther("100000"))).wait();
    await (
      await market.seed(token.target, parseEther("100000"), 1, {
        value: parseEther("100"),
      })
    ).wait();
  } else {
    await (await token.mint(market.target, parseEther("1000"))).wait();
    await (
      await owner.sendTransaction({
        to: market.target,
        value: parseEther("100"),
      })
    ).wait();
  }
  const send = async (method, args = [], value = 0n, signer = owner) => {
    await (
      await a
        .connect(signer)
        .run(v.target, v.interface.encodeFunctionData(method, args), { value })
    ).wait();
  };
  const at = async (timestamp) => {
    await rpc.request({ method: "evm_setTime", params: [timestamp * 1000] });
    await rpc.request({ method: "evm_mine", params: [] });
  };
  const fund = async ({
    input = token.target,
    output = ZeroAddress,
    minimum = 1n,
    amount = parseEther("1"),
    count = 2,
  } = {}) => {
    const now = (await p.getBlock("latest")).timestamp;
    const rows = Array.from({ length: count }, (_, i) => ({
      amount,
      minOut: minimum,
      due: now + 100 + i * 100,
      expires: now + 150 + i * 100,
      status: 0,
      received: 0,
    }));
    if (input !== ZeroAddress)
      await (
        await a.run(
          token.target,
          token.interface.encodeFunctionData("approve", [
            v.target,
            amount * BigInt(count),
          ]),
        )
      ).wait();
    await send(
      "createPlan",
      [1, input, output, rows, "0x" + "11".repeat(32)],
      input === ZeroAddress ? amount * BigInt(count) : 0n,
    );
    return { id: await v.planCount(), rows };
  };
  return {
    rpc,
    p,
    owner,
    keeper,
    next,
    addr,
    c,
    a,
    token,
    market,
    v,
    d,
    send,
    at,
    fund,
  };
}
test("real NativeMarket token/native exits conserve segregated plans, clear allowances, and update inventory commitments", async (t) => {
  const x = await setup(t, true),
    { v, a, token, p, keeper } = x;
  const f = await x.fund(),
    other = await x.fund();
  const factory = await x.d("ExperimentCellFactory"),
    index = await x.d("CommitmentIndex", [factory.target, [v.target]]),
    before = await index.snapshot(a.target);
  await assert.rejects(v.connect(keeper).executeSlice(f.id, 0));
  await x.at(f.rows[0].due);
  const inputBefore = await token.balanceOf(v.target),
    outputBefore = await p.getBalance(a.target);
  await (await v.connect(keeper).executeSlice(f.id, 0)).wait();
  const s = await v.sliceAt(f.id, 0);
  assert.equal(s.status, 1n);
  assert.equal(await token.balanceOf(v.target), inputBefore - f.rows[0].amount);
  assert.equal(await p.getBalance(a.target), outputBefore + s.received);
  assert.equal(await token.allowance(v.target, x.market.target), 0n);
  assert.notEqual(await index.snapshot(a.target), before);
  assert.equal((await v.sliceAt(other.id, 0)).status, 0n);
  await assert.rejects(v.executeSlice(f.id, 0));
  const reverse = await x.fund({
    input: ZeroAddress,
    output: token.target,
    amount: parseEther("0.1"),
    count: 1,
  });
  await x.at(reverse.rows[0].due);
  const beforeToken = await token.balanceOf(a.target);
  await (await v.connect(keeper).executeSlice(reverse.id, 0)).wait();
  assert.equal(
    await token.balanceOf(a.target),
    beforeToken + (await v.sliceAt(reverse.id, 0)).received,
  );
});
test("failed minimum and malicious adapter reports roll back funds, status, allowance and commitment", async (t) => {
  const x = await setup(t),
    f = await x.fund();
  await x.at(f.rows[0].due);
  for (const mode of [1, 2, 3]) {
    await (await x.market.configure(mode, ZeroAddress, "0x")).wait();
    const before = await x.v.accountCommitment(x.a.target),
      balance = await x.token.balanceOf(x.v.target);
    await assert.rejects(x.v.executeSlice(f.id, 0));
    assert.equal((await x.v.sliceAt(f.id, 0)).status, 0n);
    assert.equal(await x.v.accountCommitment(x.a.target), before);
    assert.equal(await x.token.balanceOf(x.v.target), balance);
    assert.equal(await x.token.allowance(x.v.target, x.market.target), 0n);
  }
  await (await x.market.configure(0, ZeroAddress, "0x")).wait();
  const expensive = await x.fund({ minimum: parseEther("10") });
  await x.at(expensive.rows[0].due);
  await assert.rejects(x.v.executeSlice(expensive.id, 0));
  assert.equal((await x.v.sliceAt(expensive.id, 0)).status, 0n);
});
test("NFT custody changes, away-and-back epochs and receiver callbacks suspend standing sales", async (t) => {
  const x = await setup(t),
    f = await x.fund();
  await x.at(f.rows[0].due);
  const na = await x.next.getAddress();
  await (await x.a.change(na)).wait();
  await assert.rejects(x.v.executeSlice(f.id, 0));
  await (await x.a.change(x.addr)).wait();
  await assert.rejects(x.v.executeSlice(f.id, 0));
  await x.send("control", [f.id, 3]);
  assert.equal((await x.v.plans(f.id)).paused, true);
  await assert.rejects(x.v.executeSlice(f.id, 0));
  await x.send("control", [f.id, 1]);
  await (await x.a.flip(true)).wait();
  await assert.rejects(x.v.executeSlice(f.id, 0));
  assert.equal((await x.v.sliceAt(f.id, 0)).status, 0n);
  await (await x.a.flip(false)).wait();
  await (await x.v.executeSlice(f.id, 0)).wait();
  assert.equal((await x.v.sliceAt(f.id, 0)).status, 1n);
});
test("market callback cannot change custody or reenter a funded installment", async (t) => {
  const x = await setup(t),
    f = await x.fund();
  await x.at(f.rows[0].due);
  await (
    await x.market.configure(
      0,
      x.a.target,
      x.a.interface.encodeFunctionData("change", [await x.next.getAddress()]),
    )
  ).wait();
  await assert.rejects(x.v.executeSlice(f.id, 0));
  assert.equal(await x.a.currentOwner(), x.addr);
  await (
    await x.market.configure(
      0,
      x.v.target,
      x.v.interface.encodeFunctionData("executeSlice", [f.id, 0]),
    )
  ).wait();
  await assert.rejects(x.v.executeSlice(f.id, 0));
  assert.equal((await x.v.sliceAt(f.id, 0)).status, 0n);
});
test("cancellation and expiry preserve maturity and return only to the fixed NFT account", async (t) => {
  const x = await setup(t),
    f = await x.fund();
  await x.send("control", [f.id, 2]);
  await assert.rejects(x.v.recover(f.id, 0));
  await assert.rejects(x.send("control", [f.id, 1]));
  await x.at(f.rows[0].due);
  const before = await x.token.balanceOf(x.a.target);
  await (await x.v.connect(x.keeper).recover(f.id, 0)).wait();
  assert.equal(await x.token.balanceOf(x.a.target), before + f.rows[0].amount);
  await assert.rejects(x.v.recover(f.id, 0));
  await assert.rejects(x.v.recover(f.id, 1));
  const g = await x.fund({ count: 1 });
  await x.at(g.rows[0].expires);
  await assert.rejects(x.v.executeSlice(g.id, 0));
  await (await x.v.connect(x.keeper).recover(g.id, 0)).wait();
  assert.equal((await x.v.sliceAt(g.id, 0)).status, 2n);
});
test("funding refuses direct EOAs, impossible output contracts, zero minimums and early dates", async (t) => {
  const x = await setup(t),
    now = (await x.p.getBlock("latest")).timestamp,
    rows = [
      {
        amount: 1,
        minOut: 1,
        due: now + 100,
        expires: now + 200,
        status: 0,
        received: 0,
      },
    ],
    hash = "0x" + "00".repeat(32);
  await assert.rejects(
    x.v.createPlan(1, ZeroAddress, x.token.target, rows, hash, { value: 1 }),
  );
  await assert.rejects(
    x.send("createPlan", [1, ZeroAddress, x.addr, rows, hash], 1n),
  );
  await assert.rejects(
    x.send(
      "createPlan",
      [1, ZeroAddress, x.token.target, [{ ...rows[0], minOut: 0 }], hash],
      1n,
    ),
  );
  await assert.rejects(
    x.send(
      "createPlan",
      [1, ZeroAddress, x.token.target, [{ ...rows[0], due: now }], hash],
      1n,
    ),
  );
});

test("live funding authenticates reviewed vault runtime before trusting collection and market getters", async (t) => {
  const x = await setup(t),
    wallet = {
      assertOwner: async () => {},
      provider: x.p,
      collection: x.c.target,
    };
  assert.equal(
    (await connectedExitVault(wallet, x.v.target)).target,
    x.v.target,
  );
  await assert.rejects(
    connectedExitVault({ ...wallet, collection: x.a.target }, x.v.target),
    /different NFT collection/,
  );
  const code = await x.p.getCode(x.v.target);
  await x.rpc.request({
    method: "evm_setAccountCode",
    params: [
      x.v.target,
      code.slice(0, -2) + (code.endsWith("00") ? "01" : "00"),
    ],
  });
  await assert.rejects(
    connectedExitVault(wallet, x.v.target),
    /bytecode does not match/,
  );
  await x.rpc.request({
    method: "evm_setAccountCode",
    params: [x.v.target, code],
  });
  await x.rpc.request({
    method: "evm_setAccountCode",
    params: [x.market.target, "0x60006000f3"],
  });
  await assert.rejects(
    connectedExitVault(wallet, x.v.target),
    /market code changed/,
  );
});
