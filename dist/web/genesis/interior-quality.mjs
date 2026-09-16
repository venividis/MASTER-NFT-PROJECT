// Sampling changes only: the optical medium and its equations stay unchanged.
const PROFILES = Object.freeze({
  auto: { pixels: 220000, samples: 80, movingPixels: 140000, movingSamples: 64, floorPixels: 32000 },
  economy: { pixels: 100000, samples: 48, movingPixels: 70000, movingSamples: 40, floorPixels: 20000 },
  detail: { pixels: 450000, samples: 128, movingPixels: 240000, movingSamples: 96, floorPixels: 40000 },
});
const WINDOW_MS = 600, LONG_GAP_MS = 750, MOVEMENT_HOLD_MS = 240, MAX_LEVEL = 6;

export class InteriorQualityController {
  constructor() {
    this.reset();
  }

  reset() {
    this.level = 0;
    this.quality = 'auto';
    this.movingUntil = -Infinity;
    this.clearTiming();
  }

  clearTiming() {
    this.last = null;
    this.elapsed = 0;
    this.frames = 0;
    this.slowWindows = 0;
    this.fastWindows = 0;
  }

  budget(now) {
    const profile = PROFILES[this.quality];
    const navigating = now < this.movingUntil;
    const pixels = navigating ? profile.movingPixels : profile.pixels;
    const samples = navigating ? profile.movingSamples : profile.samples;
    return {
      pixels: Math.max(profile.floorPixels, Math.round(pixels * Math.pow(.78, this.level))),
      samples: Math.max(32, samples - this.level * 8),
      navigating,
      level: this.level,
      quality: this.quality,
    };
  }

  // Call once per drawn frame using its actual RAF timestamp. Duplicate calls
  // are ignored, so an export or a second projection pass is not a fast frame.
  update(now, { navigating = false, quality = 'auto', hidden = false } = {}) {
    if (!Number.isFinite(now)) throw new TypeError('Frame timestamp must be finite');
    const nextQuality = Object.hasOwn(PROFILES, quality) ? quality : 'auto';
    if (nextQuality !== this.quality) {
      this.quality = nextQuality;
      this.clearTiming();
    }
    if (hidden) {
      this.clearTiming();
      this.movingUntil = -Infinity;
      return this.budget(now);
    }
    if (this.last !== null && (now < this.last || now - this.last > LONG_GAP_MS)) {
      // Returning from another tab must not be counted as a slow render, or
      // retain an unfinished gesture. Keep the already learned workload limit.
      this.clearTiming();
      this.movingUntil = -Infinity;
    }
    if (navigating) this.movingUntil = now + MOVEMENT_HOLD_MS;
    if (this.last === null) {
      this.last = now;
      return this.budget(now);
    }
    const dt = now - this.last;
    if (dt <= 0) return this.budget(now);
    this.last = now;
    this.elapsed += dt;
    this.frames++;

    if (this.elapsed >= WINDOW_MS && this.frames >= 6) {
      const frameMs = this.elapsed / this.frames;
      if (frameMs > 30) {
        this.slowWindows++;
        this.fastWindows = 0;
      } else if (frameMs < 19.5) {
        this.fastWindows++;
        this.slowWindows = 0;
      } else {
        // A wide neutral band prevents continual down/up changes around 30 fps.
        this.fastWindows = this.slowWindows = 0;
      }
      if (this.slowWindows >= 2) {
        this.level = Math.min(MAX_LEVEL, this.level + 1);
        this.slowWindows = this.fastWindows = 0;
      } else if (this.fastWindows >= 5) {
        this.level = Math.max(0, this.level - 1);
        this.slowWindows = this.fastWindows = 0;
      }
      this.elapsed = this.frames = 0;
    }
    return this.budget(now);
  }
}
