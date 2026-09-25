/** Prism Cathedral II: deterministic three-dimensional filament geometry.
 * No textures, user text, wallet secrets, services or external dependencies.
 * The same vertices are projected outside and inside the shell.
 */
const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const smooth = n => { n = clamp(n, 0, 1); return n * n * (3 - 2 * n); };
export const PRISM_MODES = Object.freeze({
  home: 0, swap: 1, trade: 1, launch: 2, launchpad: 2, vault: 3,
  memory: 4, commons: 5, chat: 5, worlds: 6, atlas: 7,
  modules: 8, identity: 9, privacy: 10, burners: 10, burner: 10,
  governance: 11, crosschain: 12, agents: 13, distribution: 13,
});
export function prismMode(mode = 'home') {
  return PRISM_MODES[mode] ?? 8;
}

/** Full identity strings participate in the seed; no network state is inferred. */
export function prismIdentity(identity = {}) {
  const domain = typeof identity === 'string' ? identity : [
    identity.domain || '', identity.seed || '', identity.genome || '',
    identity.root || '', ...(identity.axes || []),
  ].join('|');
  let h = 2166136261;
  for (let i = 0; i < domain.length; i++) h = Math.imul(h ^ domain.charCodeAt(i), 16777619);
  const random = () => {
    h += 0x6d2b79f5;
    let n = Math.imul(h ^ (h >>> 15), 1 | h);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  return { key: domain, axes: Array.from({ length: 16 }, random) };
}

/** Continuous deformations retain the polar seam and recognizable central body. */
export function prismTopology(x, y, z, mode, phase = 0) {
  const angle = Math.atan2(z, x), r = Math.hypot(x, z);
  let a = 0, stretch = 1;
  switch (prismMode(mode)) {
    case 1: // Two currents, connected through one narrowed waist.
      x *= .64 + .54 * Math.abs(y);
      x += .26 * Math.sin(y * Math.PI);
      z *= .76; y *= 1.02;
      break;
    case 2: // A branching crown opens above the common nucleus.
      stretch = 1 + .26 * Math.max(0, y) * Math.cos(angle * 5 + phase);
      x *= stretch; z *= stretch; y *= 1.12;
      y += .13 * Math.max(0, y) * Math.cos(angle * 5 + phase);
      break;
    case 3: // Braided chamber, broad shoulders and a quiet inner axis.
      x *= .84 + .17 * Math.cos(y * Math.PI); z *= .86; y *= 1.06;
      break;
    case 4: // Curved folios separate around their common binding.
      a = .24 * Math.sin(y * 3 + phase); x *= 1.12; z *= .62;
      y += .09 * Math.sin(angle * 3 + phase);
      break;
    case 5: // A ring of connected chambers in one continuous weave.
      stretch = 1 + .14 * Math.cos(angle * 6 + phase) * (1 - y * y);
      x *= stretch; z *= stretch; y *= .88;
      break;
    case 6: // Folded horizons reveal concave landscape windows.
      y *= .79; y += .14 * Math.sin(angle * 3 + phase) * r;
      z *= .9; x *= 1.08;
      break;
    case 7: // Armillary atlas expands the equatorial bands.
      stretch = 1 + .22 * Math.pow(Math.cos(y * 1.7), 2);
      x *= stretch; z *= stretch; y *= .82;
      break;
    case 8: // Individual woven ribs reveal the living loom.
      stretch = 1 + .075 * Math.cos(angle * 10 + phase);
      x *= stretch; z *= stretch; y *= 1.03;
      break;
    case 9: a = .12 * Math.sin(y * 4); break;
    case 10: x *= .86; z *= 1.12; a = .17 * Math.sin(y * 3); break;
    case 11: y *= .84; x *= 1.1; a = .15 * Math.cos(y * 3); break;
    case 12: x += .19 * Math.sin(y * Math.PI); z *= .8; break;
    case 13: stretch = 1 + .1 * Math.cos(angle * 8); x *= stretch; z *= stretch; break;
  }
  return [x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)];
}

export function createPrismGeometry(identity, { mode = 'home', strands = 132, samples = 144 } = {}) {
  const id = prismIdentity(identity), a = id.axes, curves = [];
  strands = Math.floor(clamp(strands, 16, 224));
  samples = Math.floor(clamp(samples, 32, 192));
  const phase = a[0] * TAU;
  for (let i = 0; i < strands; i++) {
    const group = Math.floor(i / 6), thread = (i % 6 - 2.5) * .008;
    const bias = group * 2.399963229728653 + phase;
    const shell = group % 9 === 7 ? .67 + a[3] * .06 : .94 + .035 * Math.sin(group * 1.7 + a[4] * 6);
    const inclination = group * 1.61803398875 + a[5] * TAU + thread;
    const points = new Float32Array((samples + 1) * 3);
    for (let j = 0; j <= samples; j++) {
      const t = j / samples * TAU;
      // Tilted, gently braided great circles avoid a shared artificial pole.
      // Adjacent curves are distinct strands of one translucent optical ribbon.
      const wave = .075 * Math.sin(t * 3 + bias) + thread * 1.8;
      const px = Math.cos(t), py = Math.sin(t) * Math.cos(inclination) + wave * Math.sin(inclination);
      const pz = Math.sin(t) * Math.sin(inclination) - wave * Math.cos(inclination);
      const norm = Math.hypot(px, py, pz);
      const breathe = 1 + .012 * Math.sin(t * 7 + group + phase);
      const x = (px * Math.cos(bias) - py * Math.sin(bias)) / norm * shell * breathe * (1 + (a[9] - .5) * .07);
      const y = (px * Math.sin(bias) + py * Math.cos(bias)) / norm * shell;
      const z = pz / norm * shell * breathe;
      points.set(prismTopology(x, y, z, mode, phase), j * 3);
    }
    const color = [0, 0, 1, 0, 2, 3, 0, 1, 0, 4, 0, 3][group % 12];
    curves.push({ points, kind: 'fiber', color, strength: .7 + a[i % 16] * .35 });
  }
  // Nested optical vaults make the aperture a place with depth. They are real
  // smaller shells, so travelling inward reveals rather than replaces them.
  for (let i = 0; i < 30; i++) {
    const group = Math.floor(i / 5), thread = (i % 5 - 2) * .009;
    const radius = .27 + group * .057 + a[6] * .035;
    const inclination = .35 + group * .61 + thread;
    const points = new Float32Array((samples + 1) * 3);
    for (let j = 0; j <= samples; j++) {
      const t = j / samples * TAU, r = radius * (1 + .045 * Math.sin(t * 5 + phase));
      const x = Math.cos(t) * r, y = Math.sin(t) * r * Math.cos(inclination);
      const z = Math.sin(t) * r * Math.sin(inclination) + thread * 2;
      points.set(prismTopology(x, y, z, mode, phase), j * 3);
    }
    curves.push({ points, kind: 'inner', color: i % 10 < 5 ? 1 : 2, strength: .62 });
  }
  // The same polar meridian is retained in every topology as an orientation landmark.
  for (let i = 0; i < 9; i++) {
    const points = new Float32Array((samples + 1) * 3);
    const radius = i === 0 ? 1.015 : 1.08 + i * .028;
    for (let j = 0; j <= samples; j++) {
      const t = j / samples * TAU;
      const tilt = i === 0 ? 0 : .35 + i * .28 + a[10];
      const x = Math.sin(t) * Math.sin(tilt) * radius;
      const y = Math.cos(t) * radius;
      const z = Math.sin(t) * Math.cos(tilt) * radius;
      points.set([x, y, z], j * 3);
    }
    curves.push({ points, kind: i === 0 ? 'seam' : 'orbit', color: i % 3 === 0 ? 4 : 1, strength: i === 0 ? .78 : .2 });
  }
  const stars = Array.from({ length: 184 }, (_, i) => {
    const s = Math.sin((i + 1) * (19.731 + a[11] * 2)) * 43758.5453;
    const q = Math.sin((i + 1) * (43.17 + a[12])) * 19283.134;
    return [s - Math.floor(s), q - Math.floor(q), .25 + a[i % 16] * .6];
  });
  return { identity: id.key, mode, curves, stars, axes: a, vertices: curves.reduce((n, c) => n + c.points.length / 3, 0) };
}

/** Caller owns scheduling. Time is seconds; dimensions are CSS pixels.
 * The backing store is sized here (DPR capped at 1.5). Draw never reads a form.
 */
export class PrismArtwork {
  constructor(canvas, { identity = 'anima-prism-preview', mode = 'home', quality = 'auto' } = {}) {
    this.canvas = canvas;
    this.context = canvas?.getContext?.('2d');
    this.identity = identity;
    this.mode = mode;
    this.quality = quality;
    this.spectrum = 1;
    this.enabled = true;
    this.draws = 0;
    this.lastDraw = -Infinity;
    this.disposed = false;
  }
  setIdentity(identity) {
    if (prismIdentity(identity).key === prismIdentity(this.identity).key) return;
    this.identity = identity; this.geometry = null; this.previous = null; this.lastKey = '';
  }
  setMode(mode = 'home') {
    if (this.mode === mode) return;
    this.previous = this.geometry; this.mode = mode; this.geometry = null; this.transitionStart = null; this.lastKey = '';
  }
  setQuality(quality = 'auto') {
    const next = ['auto', 'detail', 'economy'].includes(quality) ? quality : 'auto';
    if (next !== this.quality) { this.quality = next; this.geometry = null; this.previous = null; this.lastKey = ''; }
  }
  setSpectrumIntensity(value) {
    this.spectrum = clamp(Number.isFinite(Number(value)) ? Number(value) : 1, 0, 1.6);
    this.lastKey = '';
  }
  build(compact) {
    const economy = this.quality === 'economy';
    const strands = economy ? 54 : this.quality === 'detail' ? 180 : compact ? 78 : 132;
    const samples = economy ? 88 : this.quality === 'detail' ? 176 : compact ? 112 : 144;
    this.geometry = createPrismGeometry(this.identity, { mode: this.mode, strands, samples });
    this.projected = this.geometry.curves.map(c => new Float32Array(c.points.length));
    if (this.previous?.curves.length !== this.geometry.curves.length) this.previous = null;
  }
  draw({ width = this.canvas?.clientWidth || 480, height = this.canvas?.clientHeight || 480,
    time = 12, yaw = 0, pitch = -.08, zoom = 1, motion = true,
    interior = null, spectrum = this.spectrum, center = .5, opacity = 1,
    background = false, force = false, fold = 0, centerX = .5, sizeScale = 1 } = {}) {
    const c = this.context;
    if (!c || this.disposed || !this.enabled || width < 1 || height < 1) return false;
    const compact = width < 700;
    if (this.compact !== compact) { this.compact = compact; this.geometry = null; this.previous = null; }
    if (!this.geometry) this.build(compact);
    const dpr = Math.min(globalThis.devicePixelRatio || 1, this.quality === 'economy' ? 1 : 1.5);
    const w = Math.round(width * dpr), h = Math.round(height * dpr);
    const resized = this.canvas.width !== w || this.canvas.height !== h;
    if (resized) { this.canvas.width = w; this.canvas.height = h; }
    time = Number.isFinite(time) ? time : 12;
    const now = globalThis.performance?.now?.() || 0;
    const key = [width, height, yaw, pitch, zoom, center, centerX, sizeScale, opacity, spectrum, fold, interior?.camera, interior?.look, this.mode, motion].join('|');
    if (!force && !resized && key === this.lastKey && (!motion || now - this.lastDraw < (compact ? 32 : 23))) return false;
    this.lastKey = key; this.lastDraw = now;
    if (this.transitionStart === null || this.transitionStart === undefined) this.transitionStart = time;
    const transition = !motion ? 1 : smooth((time - this.transitionStart) / .8);
    if (transition >= 1) this.previous = null;
    const a = this.geometry.axes;
    const turn = yaw + a[1] * .28 + time * .014;
    const tilt = pitch + .09 * Math.sin(a[2] * TAU);
    const sy = Math.sin(turn), cy = Math.cos(turn), sx = Math.sin(tilt), cx = Math.cos(tilt);
    const camera = interior?.camera || [0, 0, -2.75 * Math.max(.48, zoom), Math.PI];
    const look = interior?.look?.[0] || 0;
    const ca = (camera[3] ?? Math.PI) - Math.PI;
    const sc = Math.sin(ca), cc = Math.cos(ca), sl = Math.sin(look), cl = Math.cos(look);
    const focal = Math.min(height * .99, width * (compact ? .99 : .66)) * sizeScale;
    const midX = width * centerX, midY = height * center;
    const inside = !!interior;
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, width, height);
    if (background) { c.fillStyle = '#070b1b'; c.fillRect(0, 0, width, height); }
    c.globalAlpha = clamp(opacity, 0, 1);
    // Very restrained depth haze: most of the field remains truly dark.
    const radius = focal / Math.max(1.05, -camera[2]);
    const atmosphere = c.createRadialGradient(midX, midY, radius * .08, midX, midY, radius * 1.85);
    atmosphere.addColorStop(0, 'rgba(25,82,173,.2)');
    atmosphere.addColorStop(.25, 'rgba(20,57,155,.08)');
    atmosphere.addColorStop(.52, 'rgba(42,63,157,.16)');
    atmosphere.addColorStop(.7, 'rgba(83,52,137,.09)');
    atmosphere.addColorStop(1, 'rgba(7,11,27,0)');
    c.fillStyle = atmosphere; c.fillRect(0, 0, width, height);
    if (!inside) {
      for (const [x, y, strength] of this.geometry.stars) {
        c.fillStyle = `rgba(153,175,255,${strength * .62})`;
        c.fillRect(x * width, y * height, strength > .76 ? 1.2 : .65, strength > .76 ? 1.2 : .65);
      }
    }
    const project = (x, y, z) => {
      const oldY = y; y = y * cx - z * sx; z = oldY * sx + z * cx;
      const oldX = x; x = x * cy + z * sy; z = -oldX * sy + z * cy;
      if (fold) { const f = fold * .32, w4 = Math.sin(y * 2.4 + a[0] * TAU) * .24; x = x * Math.cos(f) - w4 * Math.sin(f); }
      x -= camera[0]; y -= camera[1]; z -= camera[2];
      const xx = x; x = x * cc - z * sc; z = xx * sc + z * cc;
      const yy = y; y = y * cl - z * sl; z = yy * sl + z * cl;
      if (z <= .065) return [NaN, NaN, z];
      return [midX + x / z * focal, midY - y / z * focal, z];
    };
    const spectral = c.createLinearGradient(midX - radius, midY + radius * .7, midX + radius, midY - radius);
    spectral.addColorStop(0, '#62dcff'); spectral.addColorStop(.22, '#477cff');
    spectral.addColorStop(.43, '#a478ff'); spectral.addColorStop(.64, '#f28aca');
    spectral.addColorStop(.78, '#f4ce91'); spectral.addColorStop(1, '#7ceaff');
    const colors = ['#477cff', '#7ceaff', '#ab80ff', spectral, '#f4d8a0'];
    for (let i = 0; i < this.geometry.curves.length; i++) {
      const curve = this.geometry.curves[i], points = curve.points, out = this.projected[i];
      const prior = this.previous?.curves[i]?.points;
      for (let j = 0; j < points.length; j += 3) {
        const x = prior ? prior[j] + (points[j] - prior[j]) * transition : points[j];
        const y = prior ? prior[j + 1] + (points[j + 1] - prior[j + 1]) * transition : points[j + 1];
        const z = prior ? prior[j + 2] + (points[j + 2] - prior[j + 2]) * transition : points[j + 2];
        out.set(project(x, y, z), j);
      }
    }
    c.globalCompositeOperation = 'lighter';
    const middle = Math.max(.1, -camera[2]);
    // Thin-film membranes span adjacent fibers. This creates light within the
    // weave, not an opaque skin, and the interior sees the same ribbon surfaces.
    for (let i = 0; i + 5 < this.geometry.curves.length; i += 6) {
      if (this.geometry.curves[i].kind !== 'fiber') continue;
      const left = this.projected[i], right = this.projected[i + 5];
      c.fillStyle = colors[this.geometry.curves[i].color];
      const fillRibbon = (start, end, front) => {
        if (end - start < 3) return;
        c.globalAlpha = opacity * (front ? .22 : .066) * (this.geometry.curves[i].color > 1 ? Math.min(1.2, spectrum) : 1);
        c.beginPath(); c.moveTo(left[start], left[start + 1]);
        for (let k = start + 3; k <= end; k += 3) c.lineTo(left[k], left[k + 1]);
        for (let k = end; k >= start; k -= 3) c.lineTo(right[k], right[k + 1]);
        c.closePath(); c.fill();
      };
      let start = -1, front = false;
      for (let j = 0; j < left.length; j += 3) {
        const valid = Number.isFinite(left[j]) && Number.isFinite(right[j]) && Math.abs(left[j] - midX) < width * 2 && Math.abs(left[j + 1] - midY) < height * 2;
        const nextFront = left[j + 2] < middle;
        if (!valid || (start >= 0 && nextFront !== front)) {
          if (start >= 0) fillRibbon(start, j - 3, front);
          start = -1;
        }
        if (valid && start < 0) { start = j; front = nextFront; }
      }
      if (start >= 0) fillRibbon(start, left.length - 3, front);
    }
    // Bounded multi-width emission avoids expensive full-frame filter/readback
    // passes. Only one strand per ribbon supplies its broad colored halo.
    for (let pass = this.quality === 'economy' ? 0 : -2; pass < 3; pass++) {
      for (let i = 0; i < this.geometry.curves.length; i++) {
        const curve = this.geometry.curves[i], out = this.projected[i];
        const isFiber = curve.kind === 'fiber' || curve.kind === 'inner';
        if (pass < 0 && (!isFiber || i % 6)) continue;
        if (pass === 0 && (!isFiber || i % 2)) continue;
        const color = spectrum <= .02 || curve.color === 0 ? colors[0] : colors[curve.color];
        c.strokeStyle = color;
        c.lineWidth = pass === -2 ? 23 : pass === -1 ? 12 : pass === 0 ? (inside ? 5.4 : 4.4) : curve.kind === 'seam' ? .85 : inside ? .9 : .77;
        const chroma = curve.color > 1 ? Math.min(1.2, .3 + spectrum * .7) : 1;
        c.globalAlpha = opacity * curve.strength * chroma * (pass === -2 ? .027 : pass === -1 ? .055 : pass === 0 ? .15 : pass === 1 ? .23 : .66);
        c.beginPath();
        let pen = false;
        for (let j = 0; j < out.length; j += 3) {
          const x = out[j], y = out[j + 1], z = out[j + 2];
          const visible = Number.isFinite(x) && Math.abs(x - midX) < width * 3 && Math.abs(y - midY) < height * 3;
          const depth = pass <= 0 || (pass === 1 ? z >= middle : z < middle);
          if (!visible || !depth) { pen = false; continue; }
          if (pen) c.lineTo(x, y); else c.moveTo(x, y);
          pen = true;
        }
        c.stroke();
      }
    }
    // The pearl core and polar glints are physical landmarks in the same space.
    const light = (point, size, tint = '124,234,255', intensity = 1) => {
      const p = project(...point);
      if (!Number.isFinite(p[0]) || p[0] < -40 || p[0] > width + 40 || p[1] < -40 || p[1] > height + 40) return;
      const s = clamp(size * focal / Math.max(.5, p[2]) / 220, 1.2, 32);
      const g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], s * 7);
      g.addColorStop(0, `rgba(244,240,255,${intensity})`);
      g.addColorStop(.055, `rgba(${tint},${intensity * .88})`);
      g.addColorStop(.2, `rgba(${tint},${intensity * .18})`);
      g.addColorStop(1, `rgba(${tint},0)`);
      c.globalAlpha = opacity; c.fillStyle = g; c.fillRect(p[0] - s * 7, p[1] - s * 7, s * 14, s * 14);
      if (size > 4) {
        c.strokeStyle = 'rgba(244,240,255,.66)'; c.lineWidth = .55;
        c.beginPath(); c.moveTo(p[0] - s * 7, p[1]); c.lineTo(p[0] + s * 7, p[1]);
        c.moveTo(p[0], p[1] - s * 7); c.lineTo(p[0], p[1] + s * 7); c.stroke();
      }
    };
    light([0, 0, 0], 5.6, '244,216,160', .95);
    light([0, 1.015, 0], 2.3, '124,234,255', .85);
    light([0, -1.015, 0], 1.8, '176,155,255', .6);
    for (let i = 0; i < 25; i++) {
      const curve = this.geometry.curves[(i * 7) % this.geometry.curves.length];
      const idx = Math.floor(((i * .137 + a[i % 16] * .25) % 1) * (curve.points.length / 3 - 1)) * 3;
      light(Array.from(curve.points.subarray(idx, idx + 3)), i % 5 === 0 ? 2.6 : 1.3,
        i % 4 === 0 ? '244,216,160' : i % 3 === 0 ? '242,169,218' : '124,234,255', .65);
    }
    c.restore();
    this.draws++;
    this.lastFrame = { mode: this.mode, vertices: this.geometry.vertices, interior: inside, backend: 'projected-3d-filaments', spectrum, width, height };
    return true;
  }
  dispose() { this.disposed = true; this.geometry = null; this.previous = null; this.projected = null; }
}
