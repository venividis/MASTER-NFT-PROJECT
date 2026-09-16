const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dependency = require('../scripts/dependencies.cjs');
const ganache = dependency('ganache');
const { BrowserProvider, ContractFactory } = dependency('ethers');
const artifact = require('../artifacts/PrismRelay.json');

function neighbors(cell) {
  const x = cell % 9, y = Math.floor(cell / 9);
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
    .filter(([a, b]) => a >= 0 && a < 9 && b >= 0 && b < 9)
    .map(([a, b]) => b * 9 + a);
}
function initial(terrain) {
  return {
    terrain,
    cells: Array.from({ length: 81 }, (_, i) => i === 0 ? 1 : i === 80 ? 2 : 0),
    turn: 1, moves: 0, scores: [1, 1], winner: null,
  };
}
function legal(m, player = m.turn) {
  if (m.winner !== null) return [];
  return m.cells.flatMap((owner, i) => owner === 0 && m.terrain[i] !== 1 && neighbors(i).some(n => m.cells[n] === player) ? [i] : []);
}
function play(m, cell) {
  const player = m.turn;
  const next = { ...m, cells: [...m.cells], scores: [...m.scores], moves: m.moves + 1, turn: 3 - player };
  next.cells[cell] = player;
  next.scores[player - 1] += m.terrain[cell] === 2 ? 4 : 1;
  if (!legal(next).length) next.turn = player;
  if (next.moves >= 36 || !legal(next).length) next.winner = next.scores[0] === next.scores[1] ? 0 : next.scores[0] > next.scores[1] ? 1 : 2;
  return next;
}
function events(receipt, contract, name) {
  return receipt.logs.map(log => {
    try { return contract.interface.parseLog(log); } catch { return null; }
  }).filter(event => event?.name === name);
}
function compare(actual, expected, status) {
  assert.deepEqual(Array.from(actual.terrain, Number), expected.terrain);
  assert.deepEqual(Array.from(actual.cells, Number), expected.cells);
  assert.deepEqual(Array.from(actual.scores, Number), expected.scores);
  assert.equal(Number(actual.turn), expected.turn);
  assert.equal(Number(actual.moves), expected.moves);
  assert.equal(Number(actual.status), status);
  assert.equal(Number(actual.winner), expected.winner ?? 0);
}

(async () => {
  const rpc = ganache.provider({
    logging: { quiet: true },
    chain: { hardfork: 'shanghai', chainId: 31337 },
    wallet: { totalAccounts: 2 },
  });
  const provider = new BrowserProvider(rpc);
  provider.pollingInterval = 10;
  const players = [await provider.getSigner(0), await provider.getSigner(1)];
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, players[0]).deploy();
  await contract.waitForDeployment();
  const results = [];
  const maxGas = { create: 0n, join: 0n, move: 0n };

  async function run(name, terrain, chooser, assertions) {
    let state = initial(terrain);
    const creation = await (await contract.createMatch(terrain)).wait();
    maxGas.create = creation.gasUsed > maxGas.create ? creation.gasUsed : maxGas.create;
    const id = events(creation, contract, 'MatchCreated')[0].args.matchId;
    compare(await contract.getMatch(id), state, 0);
    assert.equal((await contract.getMatch(id)).players[0], await players[0].getAddress());
    assert.deepEqual(Array.from(await contract.getLegalMoves(id)), []);
    const joining = await (await contract.connect(players[1]).joinMatch(id)).wait();
    maxGas.join = joining.gasUsed > maxGas.join ? joining.gasUsed : maxGas.join;
    assert.equal(events(joining, contract, 'MatchJoined').length, 1);
    assert.equal((await contract.getMatch(id)).players[1], await players[1].getAddress());
    compare(await contract.getMatch(id), state, 1);
    let skippedTurns = 0, prismClaims = 0;
    while (state.winner === null) {
      assert.deepEqual(Array.from(await contract.getLegalMoves(id), Number), legal(state));
      const cell = chooser(state);
      assert.ok(legal(state).includes(cell));
      const actor = state.turn;
      const receipt = await (await contract.connect(players[actor - 1]).move(id, cell)).wait();
      maxGas.move = receipt.gasUsed > maxGas.move ? receipt.gasUsed : maxGas.move;
      state = play(state, cell);
      if (state.turn === actor && state.winner === null) skippedTurns++;
      if (terrain[cell] === 2) prismClaims++;
      const claimed = events(receipt, contract, 'CellClaimed');
      assert.equal(claimed.length, 1);
      assert.equal(Number(claimed[0].args.cell), cell);
      assert.equal(Number(claimed[0].args.points), terrain[cell] === 2 ? 4 : 1);
      compare(await contract.getMatch(id), state, state.winner === null ? 1 : 2);
      const finished = events(receipt, contract, 'MatchFinished');
      assert.equal(finished.length, state.winner === null ? 0 : 1);
      if (finished.length) assert.equal(Number(finished[0].args.winner), state.winner);
    }
    assert.deepEqual(Array.from(await contract.getLegalMoves(id)), []);
    assertions(state, { skippedTurns, prismClaims });
    results.push({ name, matchId: Number(id), moves: state.moves, scores: state.scores, winner: state.winner, skippedTurns, prismClaims });
  }

  try {
    await run('plain board / 36-move draw', Array(81).fill(0), m => legal(m)[0], m => {
      assert.equal(m.moves, 36);
      assert.equal(m.winner, 0);
      assert.deepEqual(m.scores, [19, 19]);
    });
    const walls = [12, 15, 29, 33, 47, 51, 65, 68];
    const prisms = [8, 22, 40, 58, 72];
    const defaultTerrain = Array.from({ length: 81 }, (_, i) => walls.includes(i) ? 1 : prisms.includes(i) ? 2 : 0);
    await run('default world / prism scoring', defaultTerrain, m => legal(m).sort((a, b) => (m.terrain[b] === 2 ? 100 : 0) - (m.terrain[a] === 2 ? 100 : 0) || a - b)[0], (m, stats) => {
      assert.equal(m.moves, 36);
      assert.ok(stats.prismClaims > 0);
      assert.equal(m.scores[0] + m.scores[1], 2 + m.moves + 3 * stats.prismClaims);
    });
    const narrowTerrain = Array.from({ length: 81 }, (_, i) => i < 27 || [35, 44, 53, 62, 71, 80].includes(i) ? 0 : 1);
    await run('33-cell world / forced pass and exhausted board', narrowTerrain, m => legal(m)[0], (m, stats) => {
      assert.equal(m.moves, 31);
      assert.ok(stats.skippedTurns > 0);
      assert.equal(m.scores[0] + m.scores[1], 33);
    });
    const report = {
      result: 'pass',
      network: 'local in-process Ganache only',
      compiler: artifact.compiler,
      runtimeBytes: artifact.runtimeBytes,
      checkedTransitions: results.reduce((sum, result) => sum + result.moves, 0),
      maxObservedGas: Object.fromEntries(Object.entries(maxGas).map(([key, value]) => [key, value.toString()])),
      matches: results,
    };
    fs.writeFileSync(path.resolve(__dirname, '../artifacts/test-results.json'), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } finally {
    await provider.destroy();
    await rpc.disconnect();
  }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
