import { phenotype } from "./model.mjs";
/** Opt-in procedural audio; no microphone, recordings, or remote media. */
export class OrganismAudio {
  constructor() {
    this.enabled = false;
    this.volume = 0.035;
    this.nodes = [];
    this.context = null;
  }
  async enable(state) {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) throw new Error("Web Audio is unavailable in this browser.");
    if (!this.context) {
      this.context = new Audio();
      const c = this.context;
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.limiter = c.createDynamicsCompressor();
      this.limiter.threshold.value = -18;
      this.limiter.ratio.value = 12;
      this.analyser = c.createAnalyser();
      this.analyser.fftSize = 128;
      this.master.connect(this.limiter);
      this.limiter.connect(this.analyser);
      this.analyser.connect(c.destination);
      [1, 1.5, 2].forEach((ratio, i) => {
        const osc = c.createOscillator(),
          gain = c.createGain(),
          pan = c.createStereoPanner();
        osc.type = i === 1 ? "triangle" : "sine";
        gain.gain.value = [0.45, 0.12, 0.13][i];
        pan.pan.value = [-0.35, 0.4, 0][i];
        osc.connect(gain);
        gain.connect(pan);
        pan.connect(this.master);
        osc.start();
        this.nodes.push({ osc, gain, ratio });
      });
    }
    await this.context.resume();
    this.enabled = true;
    this.tune(state);
    this.master.gain.setTargetAtTime(
      this.volume,
      this.context.currentTime,
      0.35,
    );
  }
  async disable() {
    if (!this.context) return;
    this.enabled = false;
    this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.06);
  }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(0.09, value));
    if (this.enabled)
      this.master.gain.setTargetAtTime(
        this.volume,
        this.context.currentTime,
        0.05,
      );
  }
  identity(state) {
    const selected = globalThis.window?.__animaSelection?.get();
    const source =
      selected?.source && selected.mode !== "local-preview"
        ? selected.source
        : state;
    return {
      ...state,
      ...source,
      genome: source.genome || source.seed,
      memory: source.memory || source.root || source.seed,
      audit: source.audit || source.root || source.seed,
    };
  }
  tune(state) {
    state = this.identity(state);
    if (!this.context) return;
    const { pitch } = phenotype(state),
      c = this.context;
    this.nodes.forEach((n, i) => {
      n.osc.frequency.setTargetAtTime(
        pitch * n.ratio * (state.sovereign ? 0.5 : 1),
        c.currentTime,
        0.8,
      );
      n.osc.detune.setTargetAtTime(i === 1 ? 4 : 0, c.currentTime, 0.5);
    });
  }
  note(state, kind = "SELECT") {
    state = this.identity(state);
    if (!this.enabled || this.context.state !== "running") return;
    const c = this.context,
      pitch = phenotype(state).pitch;
    const intervals = {
      EVOLVE: [0, 7, 12, 15],
      SPAWN: [0, 12, 19],
      SEAL_MEMORY: [12, 7, 3],
      ASCEND: [0, 3, 7, -12],
      ENTROPY: [0, 5],
      SELECT: [12],
    };
    (intervals[kind] || intervals.SELECT).forEach((step, i) => {
      const o = c.createOscillator(),
        g = c.createGain(),
        pan = c.createStereoPanner(),
        t = c.currentTime + i * 0.15;
      o.type = "sine";
      o.frequency.value = pitch * 2 ** (step / 12);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
      pan.pan.value = (i % 2 ? 1 : -1) * 0.4;
      o.connect(g);
      g.connect(pan);
      pan.connect(this.master);
      o.start(t);
      o.stop(t + 1.5);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
        pan.disconnect();
      };
    });
  }
  async visibility(hidden) {
    if (!this.context || !this.enabled) return;
    if (hidden) await this.context.suspend();
    else await this.context.resume();
  }
}
