/** Procedural, painter-sorted 3D crystal geometry. No images, network, or model inference.
 * Art-directed glass: facet gradients and atmospheric scattering, not a physical optical solver.
 * The shared local identity selects architecture; the future lens changes lock-light, not balances.
 */
class KingdomScene {
  constructor(canvas, getState) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.getState = getState;
    this.time = 0;
    this.yaw = 0;
    this.tyaw = 0;
    this.pitch = 0;
    this.tpitch = 0;
    this.zoom = 1;
    this.tzoom = 1;
    this.motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.visible = true;
    this.burst = 0;
    this.lens = 0;
    this.last = 0;
    this.section = "sanctum";
    this.bind();
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }
  bind() {
    let drag = null;
    this.canvas.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      drag = [e.pointerId, e.clientX, e.clientY];
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (drag && e.pointerId === drag[0]) {
        this.tyaw = Math.max(
          -0.5,
          Math.min(0.5, this.tyaw + (e.clientX - drag[1]) * 0.002),
        );
        this.tpitch = Math.max(
          -0.2,
          Math.min(0.2, this.tpitch + (e.clientY - drag[2]) * 0.001),
        );
        drag = [e.pointerId, e.clientX, e.clientY];
      }
    });
    for (const name of ["pointerup", "pointercancel"])
      this.canvas.addEventListener(name, () => (drag = null));
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        if (this.section !== "sanctum") return;
        e.preventDefault();
        this.tzoom = Math.max(
          0.78,
          Math.min(1.22, this.tzoom - e.deltaY * 0.00035),
        );
      },
      { passive: false },
    );
    this.canvas.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") this.tyaw -= 0.08;
      else if (e.key === "ArrowRight") this.tyaw += 0.08;
      else if (e.key === "ArrowUp") this.tpitch -= 0.04;
      else if (e.key === "ArrowDown") this.tpitch += 0.04;
      else if (e.key === "+" || e.key === "=")
        this.tzoom = Math.min(1.22, this.tzoom + 0.06);
      else if (e.key === "-") this.tzoom = Math.max(0.78, this.tzoom - 0.06);
      else return;
      e.preventDefault();
    });
    addEventListener("resize", () => this.resize());
  }
  resize() {
    this.w = innerWidth;
    this.h = innerHeight;
    this.dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.dirty = true;
    this.makeSky();
  }
  rand(n) {
    const x = Math.sin(n * 127.13 + this.seed * 2.91) * 43758.5453;
    return x - Math.floor(x);
  }
  makeSky() {
    this.sky = document.createElement("canvas");
    this.sky.width = this.w;
    this.sky.height = this.h;
    const c = this.sky.getContext("2d"),
      w = this.w,
      h = this.h;
    const sky = c.createLinearGradient(0, 0, w * 0.45, h);
    sky.addColorStop(0, "#030b15");
    sky.addColorStop(0.44, "#142331");
    sky.addColorStop(0.72, "#455869");
    sky.addColorStop(1, "#12182b");
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    this.seed = 17;
    const glow = (x, y, r, stops) => {
      let g = c.createRadialGradient(x, y, 0, x, y, r);
      for (const [t, col] of stops) g.addColorStop(t, col);
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    };
    glow(w * 0.66, h * 0.42, h * 0.72, [
      [0, "#bad9d41c"],
      [0.5, "#71aea710"],
      [1, "#09142100"],
    ]);
    glow(w * 0.9, h * 0.23, h * 0.48, [
      [0, "#9b8dc124"],
      [1, "#0d152600"],
    ]);
    for (let layer = 0; layer < 4; layer++) {
      for (let i = 0; i < 23; i++) {
        const x = (this.rand(i + layer * 60) * 1.3 - 0.15) * w,
          y =
            h * (0.54 + layer * 0.115 + this.rand(600 + i + layer * 40) * 0.12),
          r = h * (0.06 + this.rand(i + 400 + layer) * 0.17);
        glow(x, y, r, [
          [0, layer === 2 ? "#a9bec530" : "#c1d3d116"],
          [0.45, "#afc8d20a"],
          [1, "#8092ae00"],
        ]);
      }
    }
    // A distant auroral caustic, constructed from curved light, not a texture.
    c.save();
    c.globalCompositeOperation = "screen";
    for (let i = 0; i < 28; i++) {
      c.beginPath();
      c.moveTo(-w * 0.1, h * (0.42 + i * 0.001));
      c.bezierCurveTo(
        w * 0.33,
        h * (0.64 + i * 0.001),
        w * 0.48,
        h * (0.06 + i * 0.002),
        w * 1.1,
        h * (0.35 + i * 0.001),
      );
      c.strokeStyle = `rgba(152,211,214,${0.013 * (1 - i / 35)})`;
      c.lineWidth = 2 + i * 1.4;
      c.stroke();
    }
    c.restore();
    for (let i = 0; i < 130; i++) {
      c.fillStyle = `rgba(219,236,232,${this.rand(i + 400) * 0.5})`;
      const x = this.rand(i + 200) * w,
        y = this.rand(i + 600) * h * 0.64;
      c.beginPath();
      c.arc(x, y, i % 19 === 0 ? 1 : 0.4, 0, 7);
      c.fill();
    }
  }
  project(p) {
    const co = Math.cos(this.yaw),
      si = Math.sin(this.yaw),
      cp = Math.cos(this.pitch),
      sp = Math.sin(this.pitch);
    let x = p[0] * co + p[2] * si,
      z = p[2] * co - p[0] * si,
      y = p[1] * cp - z * sp;
    z = z * cp + p[1] * sp;
    const perspective = 5.8 / (5.8 + z),
      unit =
        Math.min(this.w * (this.w < 760 ? 0.75 : 0.54), this.h * 0.77) *
        this.zoom;
    const mobile = this.w < 760;
    return [
      this.w * (mobile ? 0.52 : 0.65) + x * unit * perspective,
      this.h * (mobile ? 0.63 : 0.45) - y * unit * perspective,
      z,
    ];
  }
  facet(points, tone = 0, light = 0.5, alpha = 0.7) {
    this.faces.push({
      p: points,
      tone,
      light,
      alpha,
      z: points.reduce((a, v) => a + v[2], 0) / points.length,
    });
  }
  crystal(x, y, z, r, height, tone = 0, twist = 0, alpha = 0.7) {
    const sides = 5,
      ring = [];
    for (let k = 0; k < sides; k++) {
      const a = (k * Math.PI * 2) / sides + twist;
      ring.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]);
    }
    const top = [x + r * 0.13, y + height, z],
      bottom = [x - r * 0.12, y - height * 0.27, z];
    for (let k = 0; k < sides; k++) {
      this.facet(
        [ring[k], ring[(k + 1) % sides], top],
        tone,
        0.28 + 0.13 * k,
        alpha,
      );
      this.facet(
        [ring[(k + 1) % sides], ring[k], bottom],
        tone,
        0.2 + 0.11 * k,
        alpha * 0.75,
      );
    }
  }
  feather(a, b, width, tone, shine = 0) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy),
      nx = (-dy / len) * width,
      ny = (dx / len) * width;
    const m = [a[0] + dx * 0.4, a[1] + dy * 0.4, a[2] + (b[2] - a[2]) * 0.4],
      ridge = [m[0], m[1], m[2] - 0.038];
    const l = [m[0] + nx, m[1] + ny, m[2]],
      r = [m[0] - nx, m[1] - ny, m[2]];
    this.facet([a, l, ridge], tone, 0.6 + shine, 0.77);
    this.facet([l, b, ridge], tone, 0.82, 0.76);
    this.facet([b, r, ridge], tone, 0.42, 0.8);
    this.facet([r, a, ridge], tone, 0.31, 0.73);
  }
  architecture() {
    const a = this.getState().identity,
      seed = a.seed;
    this.seed = seed;
    const islands = 11;
    for (let i = 0; i < islands; i++) {
      const x = (i % 2 ? 1 : -1) * (0.18 + (i % 6) * 0.14),
        z = 0.35 + this.rand(i + 72) * 1.4,
        y =
          (this.w < 760 ? -0.1 : -0.29) -
          this.rand(i + 22) * (this.w < 760 ? 0.35 : 0.45) +
          Math.sin(this.time * 0.12 + i) * 0.008;
      const small = i % 3 === 0 ? 1 : 0.6;
      const r = (0.035 + this.rand(i + 12) * 0.024) * small;
      this.crystal(
        x,
        y,
        z,
        r * 2.6,
        -0.1 - this.rand(i + 29) * 0.14,
        a.color,
        0.2,
        0.39,
      );
      for (let j = 0; j < 10; j++) {
        const angle = j * 2.39996,
          spread = j === 0 ? 0 : r * (0.4 + Math.sqrt(j) * 0.67),
          cx = x + Math.cos(angle) * spread,
          cz = z + Math.sin(angle) * spread;
        const ht =
          (j === 0 ? 0.26 : 0.06 + this.rand(i * 20 + j) * 0.16) * small;
        this.crystal(
          cx,
          y + 0.025,
          cz,
          r * (j === 0 ? 0.32 : 0.16),
          ht,
          (a.color + (i % 3)) % 3,
          i * 0.31,
          0.61,
        );
        if (j < 4) {
          this.crystal(cx, y + 0.013, cz, r * 0.21, ht * 0.43, 1, 1, 0.28);
        }
      }
      // Slender terraces are solid translucent surfaces; their anchors share the island.
      for (let q = 0; q < 3; q++) {
        const yy = y + q * 0.028;
        const p = [];
        for (let k = 0; k < 6; k++) {
          const t = (k * Math.PI) / 3;
          p.push([
            x + Math.cos(t) * r * (1.45 - q * 0.18),
            yy,
            z + Math.sin(t) * r * (1.45 - q * 0.18),
          ]);
        }
        this.facet(p, 2, 0.38, 0.18);
      }
    }
    const locks = this.getState().locks;
    locks.slice(0, 9).forEach((l, i) => {
      const theta = i * 2.3999 + this.time * 0.055,
        r = 0.33 + i * 0.022;
      const frac =
        Number(
          (releasable(l, this.getState().now + this.lens * 86400) * 1000n) /
            BigInt(l.amount),
        ) / 1000;
      this.crystal(
        Math.cos(theta) * r,
        -0.38 + Math.sin(theta) * r * 0.21,
        -0.16 + Math.sin(theta) * 0.1,
        0.013,
        0.04 + frac * 0.06,
        frac > 0 ? 2 : 0,
        theta,
        0.6 + frac * 0.2,
      );
    });
  }
  phoenix() {
    const t = this.time,
      flap = Math.sin(t * 0.45) * 0.035,
      shift = 0.01 * Math.sin(t * 0.32),
      a = this.getState().identity;
    // Each wing comprises interleaved prismatic remiges, with a lifted leading edge.
    for (const sign of [-1, 1]) {
      for (let j = 0; j < 33; j++) {
        const u = j / 32,
          root = [
            sign * (0.008 + u * 0.14),
            0.105 + u * 0.047 + shift,
            0.02 + u * 0.05,
          ],
          tip = [
            sign * (0.13 + Math.sin(u * 1.26) * 0.42),
            0.155 +
              Math.sin(u * Math.PI * 0.86) * 0.24 +
              flap * (0.2 + u) -
              u * u * 0.12 +
              shift,
            0.015 + u * 0.08 - Math.sin(u * Math.PI) * 0.15,
          ];
        this.feather(
          root,
          tip,
          0.01 + (1 - u) * 0.011,
          j % 9 === 0 ? 2 : a.color,
          (j % 4) * 0.022,
        );
      }
      for (let j = 0; j < 19; j++) {
        const u = j / 18,
          root = [
            sign * (0.02 + u * 0.25),
            0.123 + Math.sin(u * 2) * 0.12 + shift,
            -0.06,
          ],
          tip = [
            sign * (0.09 + u * 0.37),
            0.135 + Math.sin(u * 2.1) * 0.21 + flap + shift,
            -0.095 + u * 0.055,
          ];
        this.feather(root, tip, 0.009, a.color, 0.08);
      }
    }
    // Keeled torso, curving neck, hooked beak and seven refractive crown blades.
    this.crystal(0, 0.05 + shift, -0.065, 0.038, 0.115, a.color, 1.1, 0.65);
    for (let j = 0; j < 44; j++) {
      const row = Math.floor(j / 7),
        theta = ((j % 7) * Math.PI * 2) / 7 + row * 0.3,
        rad = 0.034 * Math.sin(((row + 1) / 8) * Math.PI);
      this.crystal(
        Math.cos(theta) * rad,
        0.021 + row * 0.018 + shift,
        -0.067 + Math.sin(theta) * rad,
        0.008,
        0.028,
        a.color,
        j * 0.1,
        0.55,
      );
    }
    for (let j = 0; j < 6; j++)
      this.crystal(
        0.003 + j * 0.0015,
        0.135 + j * 0.013 + shift,
        -0.086,
        0.017 - j * 0.0015,
        0.023,
        a.color,
        j * 0.8,
        0.76,
      );
    this.crystal(
      0.012,
      0.211 + shift,
      -0.088,
      0.017,
      0.025,
      a.color,
      0.4,
      0.85,
    );
    this.feather(
      [0.022, 0.213 + shift, -0.12],
      [0.061, 0.21 + shift, -0.1],
      0.012,
      2,
      0.14,
    );
    for (let j = 0; j < 7; j++)
      this.feather(
        [-0.004, 0.225 + shift, -0.074],
        [-0.036 - j * 0.007, 0.275 + j * 0.007 + shift, -0.07 + j * 0.005],
        0.004,
        j % 3,
        0.1,
      );
    // Long, curling tail streamers descend into the architecture. Their geometry is temporal.
    for (let j = 0; j < 11; j++) {
      const spread = (j - 5) / 5,
        pts = [];
      for (let k = 0; k < 9; k++) {
        const u = k / 8;
        pts.push([
          spread * (0.015 + u * 0.08) +
            Math.sin(u * 4.1 + t * 0.19 + j * 0.11) * u * 0.037,
          0.035 - u * (0.3 + Math.abs(spread) * 0.13) + shift,
          -0.04 + u * 0.065,
        ]);
      }
      for (let k = 0; k < 8; k++) {
        const a0 = pts[k],
          b0 = pts[k + 1],
          w = 0.0045 * (1 - k / 10);
        this.facet(
          [
            [a0[0] - w, a0[1], a0[2]],
            [a0[0], a0[1], a0[2] - 0.012],
            [b0[0], b0[1], b0[2] - 0.009],
            [b0[0] - w * 0.8, b0[1], b0[2]],
          ],
          j % 5 === 0 ? 2 : a.color,
          0.58,
          0.61,
        );
        this.facet(
          [
            [a0[0], a0[1], a0[2] - 0.012],
            [a0[0] + w, a0[1], a0[2]],
            [b0[0] + w * 0.8, b0[1], b0[2]],
            [b0[0], b0[1], b0[2] - 0.009],
          ],
          a.color,
          0.78,
          0.63,
        );
      }
    }
  }
  paintFaces() {
    const c = this.ctx;
    this.faces.sort((a, b) => b.z - a.z);
    const hues = [
      [165, 221, 230],
      [201, 187, 238],
      [237, 212, 168],
    ];
    for (const f of this.faces) {
      const p = f.p.map((v) => this.project(v)),
        h = hues[f.tone % 3],
        l = f.light;
      const g = c.createLinearGradient(
        p[0][0],
        p[0][1],
        p[2][0] + 0.1,
        p[2][1] + 0.1,
      );
      g.addColorStop(
        0,
        `rgba(${h.map((v) => Math.round(v * (0.35 + l * 0.47))).join(",")},${f.alpha * 0.5})`,
      );
      g.addColorStop(
        0.42,
        `rgba(${h.map((v) => Math.min(255, Math.round(v * (0.63 + l * 0.55)))).join(",")},${f.alpha})`,
      );
      g.addColorStop(
        1,
        `rgba(${h.map((v) => Math.round(v * 0.36)).join(",")},${f.alpha * 0.5})`,
      );
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(p[0][0], p[0][1]);
      for (let k = 1; k < p.length; k++) c.lineTo(p[k][0], p[k][1]);
      c.closePath();
      c.fill();
      c.strokeStyle = `rgba(220,249,248,${0.04 + l * 0.16})`;
      c.lineWidth = 0.55;
      c.stroke();
    }
  }
  halo(x, y, r, color, opacity = 0.4) {
    const c = this.ctx,
      g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${opacity})`);
    g.addColorStop(0.2, `rgba(${color},${opacity * 0.24})`);
    g.addColorStop(1, `rgba(${color},0)`);
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  draw() {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.drawImage(this.sky, 0, 0);
    const mid = this.project([0, 0.1, 0]);
    c.save();
    c.globalCompositeOperation = "screen";
    this.halo(mid[0], mid[1], this.h * 0.38, "130,214,211", 0.085);
    c.restore();
    this.faces = [];
    this.architecture();
    this.phoenix();
    this.paintFaces();
    c.save();
    c.globalCompositeOperation = "screen";
    const eye = this.project([0.03, 0.22, -0.12]);
    this.halo(eye[0], eye[1], this.h * 0.04, "228,246,229", 0.5);
    const heart = this.project([0, 0.105, -0.11]);
    this.halo(heart[0], heart[1], this.h * 0.1, "193,250,241", 0.27);
    for (let i = 0; i < 65; i++) {
      const u = (i / 65 + this.time * 0.018) % 1,
        phase = i * 2.3999,
        x = Math.sin(phase + u * 2) * (0.08 + u * 0.3),
        y = -0.46 + u * 0.7,
        z = Math.cos(phase) * 0.24;
      const p = this.project([x, y, z]);
      c.fillStyle = `rgba(232,239,216,${Math.sin(u * Math.PI) * 0.52})`;
      c.beginPath();
      c.arc(p[0], p[1], i % 12 === 0 ? 1.35 : 0.6, 0, 7);
      c.fill();
      if (i % 19 === 0) this.halo(p[0], p[1], 8, "219,222,184", 0.12);
    }
    if (this.burst > 0.001) {
      const r = (1 - this.burst) * this.h * 0.7 + 20;
      c.strokeStyle = `rgba(190,232,226,${this.burst * 0.32})`;
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(heart[0], heart[1], r, r * 0.52, -0.1, 0, 7);
      c.stroke();
      this.halo(heart[0], heart[1], r, "216,234,227", this.burst * 0.12);
    }
    c.restore();
    const vign = c.createLinearGradient(0, 0, this.w * 0.7, 0);
    vign.addColorStop(0, "#030b15a8");
    vign.addColorStop(0.5, "#0813201c");
    vign.addColorStop(1, "#08132000");
    c.fillStyle = vign;
    c.fillRect(0, 0, this.w, this.h);
    const bottom = c.createLinearGradient(0, this.h * 0.73, 0, this.h);
    bottom.addColorStop(0, "#0b162300");
    bottom.addColorStop(1, "#060e1ad9");
    c.fillStyle = bottom;
    c.fillRect(0, this.h * 0.73, this.w, this.h * 0.27);
  }
  loop(ts) {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible || document.hidden) {
      this.last = 0;
      return;
    }
    const dt = this.last ? Math.min(0.05, (ts - this.last) / 1000) : 0.016;
    this.last = ts;
    const cameraChanged =
      Math.abs(this.tyaw - this.yaw) +
        Math.abs(this.tpitch - this.pitch) +
        Math.abs(this.tzoom - this.zoom) >
      0.000001;
    if (cameraChanged) this.dirty = true;
    const e = this.motion ? Math.min(1, dt * 4) : 1;
    this.yaw += (this.tyaw - this.yaw) * e;
    this.pitch += (this.tpitch - this.pitch) * e;
    this.zoom += (this.tzoom - this.zoom) * e;
    if (this.motion) {
      this.time += dt;
      this.burst = Math.max(0, this.burst - dt * 0.25);
    }
    if (this.motion || this.dirty) {
      this.draw();
      this.dirty = false;
    }
  }
  flash() {
    this.burst = this.motion ? 1 : 0;
    this.dirty = true;
  }
  reset() {
    this.tyaw = 0;
    this.tpitch = 0;
    this.tzoom = 1;
    this.dirty = true;
  }
}
