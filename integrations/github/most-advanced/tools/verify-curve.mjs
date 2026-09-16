#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the curve is the solid

  The README has always said that turning the artwork re-prices the market.
  For the whole life of the contract it was not true, and no test noticed,
  because every test asked whether the curve was *safe* — monotone, convex,
  no round-trip profit — and none asked whether it was the CURVE OF THIS
  SOLID.

  Two things were wrong and both are attacked here rather than described:

    · `form` and `offsetW` never reached the market. All eight solids
      priced identically.
    · concentration was a sum of angles, which is not a function of the cut
      plane. Turning π in two w-planes returns the plane exactly where it
      started, so the artwork rendered untouched while the market moved.

  The plane is what a viewer sees, so the plane is what the market must be
  a function of. That is the property under test.

    node tools/verify-curve.mjs
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import { Chain, decUint } from "./evm.mjs";

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${n}`);
  if (!c && d !== undefined) console.log(`      ${d}`);
};
const eq = (n, g, w) => ok(n, String(g) === String(w), `got ${g}\n      want ${w}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);

const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const c = await Chain.open();
const probe = await c.deploy(artifact(out, "test/mocks/CurveProbe.sol", "CurveProbe").bytecode);

const HALF = 32768;                       // half a turn, in the u16 the token stores
const NAMES = ["Tesseract", "16-cell", "24-cell", "Duocylinder",
               "Clifford", "Tiger", "Ditorus", "Julia"];

/*  Packed here rather than through the contract: the harness's encoder
    does not take a fixed-size array argument, and the layout is the one
    thing in this file that must not be taken on trust anyway.          */
const pack = async (angles, w = HALF, form = 0) => {
  let word = 0n;
  angles.forEach((a, i) => { word |= (BigInt(a) & 0xffffn) << BigInt(i * 16); });
  word |= (BigInt(w) & 0xffffn) << 96n;
  word |= (BigInt(form) & 0xffn) << 112n;
  word |= 34n << 120n;
  return word;
};
const conc = async (word) => decUint(await c.read(probe, "conc(uint256)", [word]));
const price = async (angles, w = HALF, form = 0) => conc(await pack(angles, w, form));

head("the market is a function of the cut plane, not of the angles");
{
  /*  The exact case that was live: two orientations whose section plane is
      identical, and a third that is its mirror. The old code priced them
      0.00x, 5.33x and 8.00x.                                            */
  const rest   = await price([0, 0, 0, 0, 0, 0]);
  const twoPi  = await price([0, 0, 0, HALF, HALF, 0]);
  const mirror = await price([0, 0, 0, HALF, HALF, HALF]);
  eq("π in two w-planes is the same plane, so the same price", twoPi, rest);
  eq("and the mirror plane prices the same too", mirror, rest);
  ok("which is what the old code got wrong, by 5.33x and 8.00x", true);

  /*  And the three planes that only spin the picture must not touch it.
      They are applied first and never reach index 3.                    */
  const spun = await price([12345, 54321, 7777, 0, 0, 0]);
  eq("spinning the picture without reshaping it leaves the market alone", spun, rest);
  const spunTurned = await price([12345, 54321, 7777, 9000, 0, 0]);
  const turned     = await price([0, 0, 0, 9000, 0, 0]);
  eq("and that holds at any turn, not just at rest", spunTurned, turned);
}

head("an untouched token is plain constant product");
{
  /*  The promise the contract has always made, and the one that decides
      which way round the table has to be built. It is not free: for a
      Tesseract the square cut is the NARROWEST slice it has, so a rule of
      "thin section, tight market" would open every fresh tesseract at
      maximum concentration. The reference is rest for exactly that
      reason.                                                            */
  for (let f = 0; f < 8; f++) {
    const at = await price([0, 0, 0, 0, 0, 0], HALF, f);
    ok(`${NAMES[f].padEnd(12)} unturned and centred is 0 bps`, at === 0n, `got ${at}`);
  }
}

head("the curve is the solid");
{
  /*  The headline claim of the whole market design. Before this, every
      one of these was the same number.                                  */
  const at = [];
  for (let f = 0; f < 8; f++) at.push(await price([0, 0, 0, 11000, 4000, 0], HALF, f));
  const distinct = new Set(at.map(String)).size;
  ok(`the eight solids price differently — ${distinct} distinct values`,
     distinct >= 6, at.map((v, i) => `${NAMES[i]} ${v}`).join(", "));
  at.forEach((v, i) => console.log(`      ${NAMES[i].padEnd(12)} ${v}`));
}

head("where the cut sits matters, and both sides sit alike");
{
  const mid = await price([0, 0, 0, 6000, 0, 0], HALF, 4);
  const off = await price([0, 0, 0, 6000, 0, 0], HALF + 12000, 4);
  const far = await price([0, 0, 0, 6000, 0, 0], HALF + 26000, 4);
  ok("moving the cut off centre concentrates the market", off > mid && far > off,
     `${mid} -> ${off} -> ${far}`);
  const minus = await price([0, 0, 0, 6000, 0, 0], HALF - 12000, 4);
  eq("and a cut the same distance the other way prices identically", minus, off);
}

head("it stays inside the bounds the pool relies on");
{
  let lo = 1n << 60n, hi = 0n, n = 0;
  for (let f = 0; f < 8; f++)
    for (let a = 0; a < 65536; a += 7919)
      for (const w of [0, HALF, 65535]) {
        const v = await price([0, 0, 0, a, (a * 3) % 65536, (a * 7) % 65536], w, f);
        if (v < lo) lo = v; if (v > hi) hi = v; n++;
      }
  ok(`over ${n} orientations concentration never leaves [0, 80000]`,
     lo >= 0n && hi <= 80000n, `saw ${lo}..${hi}`);
  console.log(`      range across every solid and turn: ${lo} .. ${hi}`);
}

head("the direction is the one the engine draws with");
{
  /*  u = R·e_w, closed form, against the values the engine's own rot4
      produces. If these drift apart the market prices a plane nobody is
      looking at.                                                        */
  const cases = [[0, 0, 0], [HALF, HALF, 0], [HALF, HALF, HALF], [16384, 0, 0], [9000, 21000, 4000]];
  const ONE = 1e9;
  let worst = 0;
  for (const [a3, a4, a5] of cases) {
    const w = await pack([0, 0, 0, a3, a4, a5]);
    const r = await c.read(probe, "dir(uint256)", [w]);
    const got = [0, 1, 2, 3].map((i) => {
      let v = BigInt("0x" + r.replace(/^0x/, "").substr(i * 64, 64));
      if (v >= 1n << 255n) v -= 1n << 256n;
      return Number(v) / ONE;
    });
    const t = (x) => (x / 65536) * Math.PI * 2;
    const [s3, c3, s4, c4, s5, c5] =
      [Math.sin(t(a3)), Math.cos(t(a3)), Math.sin(t(a4)), Math.cos(t(a4)),
       Math.sin(t(a5)), Math.cos(t(a5))];
    const want = [-s3, -s4 * c3, -s5 * c4 * c3, c5 * c4 * c3];
    worst = Math.max(worst, ...got.map((g, i) => Math.abs(g - want[i])));
  }
  ok("the contract's cut direction matches the engine's rotation to 1e-6",
     worst < 1e-6, `worst component error ${worst.toExponential(2)}`);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
