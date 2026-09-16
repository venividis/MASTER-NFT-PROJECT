import test from "node:test";
import assert from "node:assert/strict";
import * as m from "../protocol.mjs";
const alice = "0x" + "11".repeat(20),
  bob = "0x" + "22".repeat(20),
  carol = "0x" + "33".repeat(20),
  group = "0x" + "99".repeat(32),
  contract = "0x" + "aa".repeat(20);
const meta = (sender, index, epoch, kind) => ({
  chainId: 31337,
  contract,
  group,
  sender,
  index,
  epoch,
  kind,
});
test("MLS actual add, message ratchet, replay, erasure, removal and PCS after compromised member refresh", async () => {
  const packages = await Promise.all([alice, bob, carol].map(m.newPackage));
  for (const p of packages)
    assert.equal(
      m.packageSignature(p).length,
      132,
      "RFC 9420 P-256 uses a 65-byte uncompressed signature public key",
    );
  const authorised = new Map(
    packages.map((p, i) => [[alice, bob, carol][i], m.packageSignature(p)]),
  );
  const auth = async (w, s) => authorised.get(w) === m.hex(s);
  let a = await m.create(group, packages[0], auth);
  const add = await m.commit(a, {
    add: [{ wallet: bob, wire: m.publicPackage(packages[1]) }],
    meta: meta(alice, 0, 0, 1),
  });
  a = add.state;
  let b = await m.join(add.welcome, packages[1], group, auth);
  assert.deepEqual(m.roster(b), [alice, bob]);
  const first = await m.send(a, "first secret", meta(alice, 1, 1, 2));
  a = first.state;
  const received = await m.receive(b, first.body, meta(alice, 1, 1, 2));
  b = received.state;
  assert.equal(received.text, "first secret");
  await assert.rejects(m.receive(b, first.body, meta(alice, 1, 1, 2)));
  const compromisedCurrent = m.importState(m.exportState(b), auth);
  await assert.rejects(
    m.receive(compromisedCurrent, first.body, meta(alice, 1, 1, 2)),
  );
  await assert.rejects(
    m.receive(b, first.body, meta(carol, 1, 1, 2)),
    /coordinates/,
  );
  // A snapshot of Bob before his fresh-path commit cannot follow that commit or later application keys.
  const stolen = m.importState(m.exportState(b), auth);
  const healed = await m.commit(b, { meta: meta(bob, 2, 1, 1) });
  b = healed.state;
  a = (await m.receive(a, healed.body, meta(bob, 2, 1, 1), healed.roster))
    .state;
  await assert.rejects(
    m.receive(stolen, healed.body, meta(bob, 2, 1, 1), healed.roster),
  );
  const future = await m.send(a, "after fresh path", meta(alice, 3, 2, 2));
  a = future.state;
  assert.equal(
    (await m.receive(b, future.body, meta(alice, 3, 2, 2))).text,
    "after fresh path",
  );
  await assert.rejects(m.receive(stolen, future.body, meta(alice, 3, 2, 2)));
  const removedSnapshot = m.importState(m.exportState(b), auth);
  const removal = await m.commit(a, {
    remove: [bob],
    add: [{ wallet: carol, wire: m.publicPackage(packages[2]) }],
    meta: meta(alice, 4, 2, 1),
  });
  a = removal.state;
  const c = await m.join(removal.welcome, packages[2], group, auth);
  assert.deepEqual(m.roster(c), [alice, carol]);
  await assert.rejects(
    m.receive(
      removedSnapshot,
      removal.body,
      meta(alice, 4, 2, 1),
      removal.roster,
    ),
  );
  await assert.rejects(m.receive(c, first.body, meta(alice, 1, 1, 2)));
  assert.equal(c.historicalReceiverData.size, 0);
});
