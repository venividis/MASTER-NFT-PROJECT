import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import ganache from "ganache";
import {
  BrowserProvider,
  Contract,
  ContractFactory,
  ZeroAddress,
  ZeroHash,
  keccak256,
  toUtf8Bytes,
} from "ethers";
const root = path.resolve(import.meta.dirname, "../..");
const fixtureSource = `pragma solidity ^0.8.24;
contract SafetyToken {
 mapping(address=>uint256) internal balances;mapping(address=>mapping(address=>uint256))public allowance;uint8 public failure;
 function mint(address who,uint256 amount)external{balances[who]+=amount;}
 function setFailure(uint8 mode)external{failure=mode;}
 function balanceOf(address who)external view returns(uint256){if(failure==1)revert();if(failure==2){assembly{mstore(0,1) return(0,64)}}if(failure==3){while(gasleft()>100){}}return balances[who];}
 function approve(address spender,uint256 n)external returns(bool){allowance[msg.sender][spender]=n;return true;}
 function transfer(address to,uint256 n)external returns(bool){balances[msg.sender]-=n;balances[to]+=n;return true;}
 function transferFrom(address from,address to,uint256 n)external returns(bool){allowance[from][msg.sender]-=n;balances[from]-=n;balances[to]+=n;return true;}
}
contract SafetyAdapter {function spend(address token,address to,uint256 amount)external{require(SafetyToken(token).transferFrom(msg.sender,to,amount));}function noop()external{}}
contract SafetyAgentRegistry {mapping(uint256=>address)public ownerOf;function setOwner(uint256 id,address owner)external{ownerOf[id]=owner;}}
`;
let compiled;
function artifacts() {
  if (compiled) return compiled;
  const names = [
    "contracts/src/core/IDontFuckingBelieveIt.sol",
    "contracts/src/core/SovereignAccountFactory.sol",
    "contracts/src/operating/ExperimentCell.sol",
    "contracts/src/test/OperatingHarness.sol",
  ];
  const sources = Object.fromEntries(
    names.map((n) => [
      n,
      { content: fs.readFileSync(path.join(root, n), "utf8") },
    ]),
  );
  sources["Safety.sol"] = { content: fixtureSource };
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources,
        settings: {
          optimizer: { enabled: true, runs: 1000 },
          viaIR: true,
          evmVersion: "shanghai",
          outputSelection: {
            "*": {
              "*": [
                "abi",
                "evm.bytecode.object",
                "evm.deployedBytecode.object",
              ],
            },
          },
        },
      }),
      {
        import: (n) => ({
          contents: fs.readFileSync(path.join(root, n), "utf8"),
        }),
      },
    ),
  );
  assert.deepEqual(
    (output.errors || []).filter((e) => e.severity === "error"),
    [],
  );
  compiled = Object.assign({}, ...Object.values(output.contracts));
  for (const [n, a] of Object.entries(compiled))
    assert.ok(
      a.evm.deployedBytecode.object.length / 2 <= 24576,
      `${n} EIP-170`,
    );
  return compiled;
}
async function fixture(t) {
  const rpc = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 31337, hardfork: "shanghai" },
    wallet: { totalAccounts: 4 },
  });
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 5;
  t.after(async () => {
    provider.destroy();
    await rpc.disconnect();
  });
  const [owner, worker, recipient, buyer] = await Promise.all(
    [0, 1, 2, 3].map((i) => provider.getSigner(i)),
  );
  async function deploy(n, args = []) {
    const a = artifacts()[n],
      c = await new ContractFactory(
        a.abi,
        "0x" + a.evm.bytecode.object,
        owner,
      ).deploy(...args);
    await c.waitForDeployment();
    return c;
  }
  const adapter = await deploy("SafetyAdapter");
  return { rpc, provider, owner, worker, recipient, buyer, deploy, adapter };
}
const tx = async (p) => (await p).wait(),
  reject = async (fn) =>
    assert.rejects(async () => {
      const t = await fn();
      if (t?.wait) await t.wait();
    }),
  hash = (s) => keccak256(toUtf8Bytes(s));
async function nft(f) {
  const c = await f.deploy("IDontFuckingBelieveIt", [
      f.owner.address,
      f.adapter.target,
      f.adapter.target,
      f.adapter.target,
      f.owner.address,
      0,
    ]),
    factory = await f.deploy("SovereignAccountFactory", [
      c.target,
      f.adapter.target,
    ]);
  await tx(c.setAccountFactory(factory.target));
  const secret = hash("exact owner safety");
  await tx(
    c.commitAwakening(
      await c.commitmentFor(f.owner.address, secret, f.owner.address),
      { value: 1000 },
    ),
  );
  await f.provider.send("evm_mine", []);
  await tx(c.revealAwakening(secret, f.owner.address));
  return {
    collection: c,
    account: new Contract(
      await c.accountOf(1),
      artifacts().SovereignAccount.abi,
      f.owner,
    ),
  };
}
test("exact token budgets reject changed recipient, excess spend, replay, revoke and old custody", async (t) => {
  const f = await fixture(t),
    { account, collection } = await nft(f),
    token = await f.deploy("SafetyToken");
  await tx(token.mint(account.target, 1000));
  const data = f.adapter.interface.encodeFunctionData("spend", [
      token.target,
      f.recipient.address,
      40,
    ]),
    now = (await f.provider.getBlock("latest")).timestamp;
  await reject(() =>
    account.createSession(
      f.worker.address,
      f.adapter.target,
      data.slice(0, 10),
      0,
      0,
      now + 1000,
      10,
    ),
  );
  await tx(
    account.grantAction(
      f.worker.address,
      f.adapter.target,
      token.target,
      keccak256(data),
      40,
      80,
      0,
      now + 1000,
      3,
    ),
  );
  await reject(() =>
    account
      .connect(f.worker)
      .executeInstrument(
        1,
        0,
        f.adapter.interface.encodeFunctionData("spend", [
          token.target,
          f.buyer.address,
          40,
        ]),
      ),
  );
  await tx(account.connect(f.worker).executeInstrument(1, 0, data));
  assert.equal(await token.balanceOf(f.recipient.address), 40n);
  assert.equal(await token.allowance(account.target, f.adapter.target), 0n);
  assert.equal((await account.actionGrant(1)).remaining, 40n);
  await reject(() => account.connect(f.worker).executeInstrument(1, 0, data));
  await tx(account.connect(f.worker).executeInstrument(1, 1, data));
  await reject(() => account.connect(f.worker).executeInstrument(1, 2, data));
  await tx(
    account.grantAction(
      f.worker.address,
      f.adapter.target,
      token.target,
      keccak256(data),
      30,
      90,
      0,
      now + 1000,
      3,
    ),
  );
  await reject(() => account.connect(f.worker).executeInstrument(2, 2, data));
  assert.equal(await token.allowance(account.target, f.adapter.target), 0n);
  await tx(
    account.grantAction(
      f.worker.address,
      f.adapter.target,
      token.target,
      keccak256(data),
      40,
      80,
      0,
      now + 1000,
      2,
    ),
  );
  await tx(account.revokeInstrument(3));
  await reject(() => account.connect(f.worker).executeInstrument(3, 2, data));
  await tx(
    account.grantAction(
      f.worker.address,
      f.adapter.target,
      token.target,
      keccak256(data),
      40,
      80,
      0,
      now + 1000,
      2,
    ),
  );
  await tx(collection.transferFrom(f.owner.address, f.buyer.address, 1));
  await tx(
    collection
      .connect(f.buyer)
      .transferFrom(f.buyer.address, f.owner.address, 1),
  );
  await reject(() => account.connect(f.worker).executeInstrument(4, 2, data));
  assert.equal(await token.balanceOf(account.target), 920n);
});
test("unreadable tracked token remains disclosed while quarantined unrelated operations and recovery work", async (t) => {
  const f = await fixture(t),
    root = await f.deploy("OperatingAccountMock", [f.owner.address]),
    cell = await f.deploy("ExperimentCell", [root.target]),
    bad = await f.deploy("SafetyToken"),
    good = await f.deploy("SafetyToken");
  await tx(good.mint(f.owner.address, 100));
  await tx(good.approve(cell.target, 100));
  await tx(cell.fund(good.target, 100));
  await tx(cell.adopt(f.adapter.target, [bad.target]));
  await tx(bad.mint(cell.target, 9));
  const data = f.adapter.interface.encodeFunctionData("spend", [
      good.target,
      f.recipient.address,
      10,
    ]),
    deadline = (await f.provider.getBlock("latest")).timestamp + 1000;
  await reject(() => cell.quarantine(good.target, hash("not broken")));
  await tx(bad.setFailure(1));
  await reject(() =>
    cell.execute(f.adapter.target, data, [[good.target, 10]], [], deadline, 0),
  );
  assert.notEqual(await cell.snapshot(), ZeroHash);
  assert.equal(await cell.unresolvedAssets(), 1n);
  await tx(cell.quarantine(bad.target, hash("balance query reverted")));
  await tx(
    cell.execute(f.adapter.target, data, [[good.target, 10]], [], deadline, 0),
  );
  assert.equal(await good.balanceOf(f.recipient.address), 10n);
  assert.equal((await cell.assetStatus(bad.target)).readable, false);
  await reject(() => cell.retire(bad.target));
  await reject(() => cell.restore(bad.target));
  await reject(() =>
    cell.execute(
      f.adapter.target,
      data,
      [[good.target, 10]],
      [[bad.target, 1]],
      deadline,
      1,
    ),
  );
  await tx(bad.setFailure(2));
  assert.equal((await cell.assetStatus(bad.target)).readable, false);
  await tx(bad.setFailure(3));
  assert.equal(
    (await cell.assetStatus(bad.target, { gasLimit: 200000 })).readable,
    false,
  );
  await tx(bad.setFailure(0));
  await tx(cell.restore(bad.target));
  assert.equal(await cell.unresolvedAssets(), 0n);
  await reject(() => cell.retire(bad.target));
  await tx(cell.withdraw(bad.target, 9));
  await tx(cell.retire(bad.target));
  assert.equal(await cell.isTracked(bad.target), false);
  assert.notEqual(await cell.retiredHistory(), ZeroHash);
  await tx(root.transferControl(f.buyer.address));
  await reject(() => cell.withdraw(good.target, 10));
  await tx(cell.connect(f.buyer).withdraw(good.target, 90));
  assert.equal(await good.balanceOf(root.target), 90n);
});
test("agent binding verifies selected registry ownership and live custody; stale links can be replaced", async (t) => {
  const f = await fixture(t),
    { collection, account } = await nft(f),
    registry = await f.deploy("SafetyAgentRegistry");
  await reject(() =>
    collection.bindERC8004(1, f.adapter.target, 7, hash("claim")),
  );
  await tx(registry.setOwner(7, f.worker.address));
  await reject(() =>
    collection.bindERC8004(1, registry.target, 7, hash("claim")),
  );
  await tx(registry.setOwner(7, f.owner.address));
  await tx(collection.bindERC8004(1, registry.target, 7, hash("claim")));
  assert.equal((await collection.agentBindingStatus(1)).verified, true);
  await tx(registry.setOwner(7, f.worker.address));
  assert.equal((await collection.agentBindingStatus(1)).verified, false);
  await tx(registry.setOwner(7, f.owner.address));
  await tx(collection.transferFrom(f.owner.address, f.buyer.address, 1));
  assert.equal((await collection.agentBindingStatus(1)).verified, false);
  await reject(() => collection.unbindERC8004(1));
  await tx(collection.connect(f.buyer).unbindERC8004(1));
  await tx(registry.setOwner(8, account.target));
  await tx(
    collection
      .connect(f.buyer)
      .bindERC8004(1, registry.target, 8, hash("account-owned agent")),
  );
  assert.equal((await collection.agentBindingStatus(1)).verified, true);
});

test("seeded authority sequences preserve token budgets and invalidate every earlier custody grant", async (t) => {
  const f = await fixture(t);
  // This model covers one conventional token and exact SafetyAdapter spends.
  // It deliberately makes no claim about proxies, other assets or liabilities.
  for (const seed of [0x62a11ce, 0xc0570d7]) {
    const trace = [];
    let random = seed;
    const next = () => {
      random ^= random << 13;
      random ^= random >>> 17;
      random ^= random << 5;
      return random >>> 0;
    };
    try {
      const { account, collection } = await nft(f);
      const token = await f.deploy("SafetyToken");
      const initialBalance = 10000n;
      await tx(token.mint(account.target, initialBalance));
      const expires = (await f.provider.getBlock("latest")).timestamp + 86400;
      const model = {
        owner: f.owner,
        epoch: 1n,
        grants: [],
        successful: [],
        rejected: 0,
        transfers: 0,
        credits: new Map(
          [f.owner, f.worker, f.recipient, f.buyer].map((s) => [s.address, 0n]),
        ),
      };
      const nonce = () => BigInt(model.successful.length);
      async function check() {
        assert.equal(await account.currentOwner(), model.owner.address, "current controller");
        assert.equal(await collection.ownerOf(1), model.owner.address, "NFT custody");
        assert.equal(await account.sessionEpoch(), model.epoch, "custody epoch");
        assert.equal(await account.actionNonce(), nonce(), "successful-call nonce");
        assert.equal(await account.instrumentGrantCount(), BigInt(model.grants.length));
        let paid = 0n;
        for (const [recipient, amount] of model.credits) {
          assert.equal(await token.balanceOf(recipient), amount, "recipient ledger");
          paid += amount;
        }
        assert.equal(await token.balanceOf(account.target), initialBalance - paid, "token conservation");
        assert.equal(await token.allowance(account.target, f.adapter.target), 0n, "temporary approval cleared");
        for (const g of model.grants) {
          const actual = await account.actionGrant(g.id);
          assert.equal(actual.epoch, g.epoch, `grant ${g.id} issuance epoch`);
          assert.equal(actual.remaining, g.budget - g.spent, `grant ${g.id} budget`);
          assert.equal(actual.callsRemaining, BigInt(g.maxCalls - g.used), `grant ${g.id} calls`);
          assert.equal(actual.revoked, g.revoked, `grant ${g.id} revocation`);
        }
      }
      async function create({ budgetCalls = 4, maxCalls = 4, residue = 0n } = {}) {
        const amount = BigInt(3 + next() % 17);
        const recipient = [f.recipient.address, f.buyer.address][next() % 2];
        const g = {
          id: model.grants.length + 1,
          amount,
          recipient,
          budget: amount * BigInt(budgetCalls) + residue,
          maxCalls,
          epoch: model.epoch,
          spent: 0n,
          used: 0,
          revoked: false,
          data: f.adapter.interface.encodeFunctionData("spend", [token.target, recipient, amount]),
        };
        trace.push(`grant ${g.id}: epoch=${g.epoch} amount=${amount} budget=${g.budget} calls=${maxCalls}`);
        await tx(account.connect(model.owner).grantAction(
          f.worker.address, f.adapter.target, token.target, keccak256(g.data),
          amount, g.budget, 0, expires, maxCalls,
        ));
        model.grants.push(g);
        await check();
        return g;
      }
      async function execute(g, { expectedNonce = nonce(), changedRecipient = false, caller = f.worker } = {}) {
        // The reference ledger records issued capabilities and accepted spends;
        // no onchain grant value is used to decide whether this call should work.
        const accepted = !g.revoked && g.epoch === model.epoch &&
          g.used < g.maxCalls && g.spent + g.amount <= g.budget &&
          expectedNonce === nonce() && caller === f.worker && !changedRecipient;
        const data = changedRecipient
          ? f.adapter.interface.encodeFunctionData("spend", [token.target, f.worker.address, g.amount])
          : g.data;
        trace.push(`execute ${g.id}: nonce=${expectedNonce} epoch=${model.epoch} caller=${caller === f.worker ? "worker" : "other"} changedRecipient=${changedRecipient} expect=${accepted ? "success" : "revert"}`);
        const beforeAudit = await account.auditRoot();
        const send = () => account.connect(caller).executeInstrument(
          g.id, expectedNonce, data, { gasLimit: 1000000 },
        );
        if (accepted) {
          const receipt = await tx(send());
          const used = receipt.logs.flatMap((log) => {
            try {
              const event = account.interface.parseLog(log);
              return event?.name === "InstrumentUsed" ? [event] : [];
            } catch { return []; }
          });
          assert.equal(used.length, 1, "one confirmed instrument use");
          assert.equal(used[0].args.grant, BigInt(g.id));
          assert.equal(used[0].args.nonce, expectedNonce);
          assert.equal(used[0].args.debit, g.amount);
          model.successful.push({ grant: g.id, nonce: expectedNonce, amount: g.amount });
          g.used++;
          g.spent += g.amount;
          model.credits.set(g.recipient, model.credits.get(g.recipient) + g.amount);
          assert.notEqual(await account.auditRoot(), beforeAudit, "successful action recorded");
        } else {
          // Explicit gas makes these actual reverted transactions, including
          // an insufficient residual allowance after partial budget exhaustion.
          await assert.rejects(
            async () => { await tx(send()); },
            (error) => error.code === "CALL_EXCEPTION" && error.receipt?.status === 0,
            "expected a mined reverted transaction, not an infrastructure error",
          );
          model.rejected++;
          assert.equal(await account.auditRoot(), beforeAudit, "revert preserves audit state");
        }
        await check();
      }
      async function revoke(g) {
        trace.push(`revoke ${g.id} by current owner at epoch=${model.epoch}`);
        await tx(account.connect(model.owner).revokeInstrument(g.id));
        g.revoked = true;
        await check();
      }
      async function transfer() {
        const recipient = model.owner === f.owner ? f.buyer : f.owner;
        trace.push(`transfer to ${recipient === f.owner ? "original owner" : "buyer"}: epoch=${model.epoch + 1n}`);
        await tx(collection.connect(model.owner).transferFrom(model.owner.address, recipient.address, 1));
        model.owner = recipient;
        model.epoch++;
        model.transfers++;
        await check();
      }

      await check();
      const budgetLimited = await create({ budgetCalls: 2, maxCalls: 4, residue: 1n });
      const callLimited = await create({ budgetCalls: 4, maxCalls: 1 });
      const revocable = await create({ budgetCalls: 8, maxCalls: 8 });
      const firstPair = next() % 2 ? [budgetLimited, callLimited] : [callLimited, budgetLimited];
      for (const g of firstPair) await execute(g);
      const previous = model.successful.find((call) => call.grant === budgetLimited.id);
      await execute(budgetLimited, { expectedNonce: previous.nonce });
      await execute(callLimited); // Calls exhausted with budget still available.
      await execute(budgetLimited);
      await execute(budgetLimited); // One token remains, below the exact spend.
      await execute(revocable, { changedRecipient: true });
      await execute(revocable, { caller: f.recipient });
      await execute(revocable);
      await revoke(revocable);
      await execute(revocable);

      const originalGrant = await create();
      await execute(originalGrant);
      await transfer();
      await execute(originalGrant);
      const buyerGrant = await create();
      await execute(buyerGrant); // New custody can issue and use real authority.
      await transfer();
      await execute(originalGrant); // Returning the NFT cannot resurrect a grant.
      await execute(buyerGrant);
      await execute(await create());

      // Mix later operations across all historical grants, including stale and
      // revoked ones, instead of resetting state for each negative assertion.
      for (let i = 0; i < 12; i++) {
        switch (next() % 4) {
          case 0: await create({ budgetCalls: 1 + next() % 4, maxCalls: 1 + next() % 4 }); break;
          case 1: await execute(model.grants[next() % model.grants.length]); break;
          case 2: await revoke(model.grants[next() % model.grants.length]); break;
          case 3: await transfer(); break;
        }
      }
      // Guard against an accidental all-revert campaign or lost mandatory paths.
      assert.ok(model.successful.length >= 7, "valid actions actually executed");
      assert.ok(model.rejected >= 9, "required stale/replay/budget/caller paths exercised");
      assert.ok(model.transfers >= 2, "custody moved out and back");
    } catch (error) {
      throw new Error(`Authority seed=0x${seed.toString(16)}\n${trace.map((action, index) => `${index + 1}. ${action}`).join("\n")}\n${error.message}`, { cause: error });
    }
  }
});
