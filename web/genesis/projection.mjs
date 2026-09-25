import { InteriorQualityController } from "./interior-quality.mjs";
import { interiorShader } from "./interior-shader.mjs";
import { InteriorSoftwareRenderer } from "./interior-cpu.mjs";
import { PrismArtwork, prismMode } from "./prism-art.mjs";
import { prismShader } from "./prism-shader.mjs";
export function blueVector(hex) {
  const s = String(hex).replace(/^0x/, "").padEnd(64, "0");
  return [0, 1, 2, 3].map(
    (i) =>
      ((parseInt(s.slice(i * 8, i * 8 + 8), 16) ^
        parseInt(s.slice((i + 4) * 8, (i + 5) * 8), 16)) >>>
        0) /
      4294967295,
  );
}
// Only the screen projection changes. The complete blue lived optical field stays intact.
export function formationShader(source) {
  const main = source.lastIndexOf("void main()");
  if (main < 0 || !source.includes("radiance(float x,float y)"))
    throw Error("Blue field source is not compatible");
  return (
    source.slice(0, main) +
    `
 uniform float genesisOpening;
 uniform vec2 genesisViewport;
 uniform vec4 genesisPanel,genesisIdentity;
 float genesisDistance(vec2 point,vec2 extent,float radius){vec2 q=abs(point)-extent+radius;return length(max(q,0.))+min(max(q.x,q.y),0.)-radius;}
 ${interiorShader}
 ${prismShader}
 void main(){
  vec2 originalUV=(gl_FragCoord.xy-vec2(resolution.x*.5,resolution.y*(1.-center)))/resolution.y*3.2;
  // Explicit opt-in keeps the approved projection and its hash regression intact.
  if(prismEnabled>.5){outColor=vec4(prismBackdrop(originalUV),1.);return;}
  // One optical scene at every distance; only camera rays change.
  if(genesisDepth>0.){outColor=vec4(agInterior(originalUV),1.);return;}
  if(genesisOpening<=0.){outColor=vec4(radiance(originalUV.x,originalUV.y),1.);return;}
  vec2 pixel=vec2(gl_FragCoord.x/resolution.x*genesisViewport.x,(1.-gl_FragCoord.y/resolution.y)*genesisViewport.y);
  vec2 local=pixel-genesisPanel.xy;
  float theta=atan(local.y/genesisPanel.w,local.x/genesisPanel.z);
  vec2 formedUV=vec2(local.x/genesisPanel.z,-local.y/genesisPanel.w)*1.18;
  float unfold=genesisOpening;
  vec2 uv=mix(originalUV,formedUV,unfold);
  uv+=sin(vec2(uv.y*4.,uv.x*3.)+t*.12+genesisIdentity.xy*6.)*sin(unfold*3.14159265)*.14;
  vec3 blue=radiance(uv.x,uv.y);
  float distance=genesisDistance(local,genesisPanel.zw,26.+genesisIdentity.z*26.);
  float tide=sin(theta*(5.+floor(genesisIdentity.x*4.))+t*.11+genesisIdentity.y*6.)*7.+sin(theta*13.-t*.06)*3.;
  float shore=distance-14.-tide;
  float skin=exp(-abs(shore)*.057),edge=exp(-abs(shore)*.24);
  vec3 nacre=mix(vec3(.12,.42,.96),vec3(.38,.83,1.),.5+.5*sin(theta*2.+t*.09+genesisIdentity.w*6.));
  vec3 formed=blue*(skin*1.9)+nacre*(skin*.055+edge*.28);
  float interior=1.-smoothstep(-18.,-3.,distance);
  formed=mix(formed,vec3(.006,.016,.031)+blue*.012,interior*.995);
  outColor=vec4(mix(blue,formed,unfold),1.);
 }`
  );
}
export function installBlueProjection(field, r) {
  let installed = null,
    rejected = null,
    lastProjection = "";
  const interiorQuality = new InteriorQualityController();
  const prism = (field.prismArtwork = new PrismArtwork(r.overlay, {
    identity: field.opticalIdentity || field.id,
    mode: field.mode,
  }));
  field.prismEnabled = field.prismEnabled !== false;
  field.spectrumIntensity = field.spectrumIntensity ?? 1;
  field.setPrismEnabled = (enabled) => {
    field.prismEnabled = !!enabled;
    prism.lastKey = "";
    r.dirty = true;
  };
  field.setSpectrumIntensity = (value) => {
    prism.setSpectrumIntensity(value);
    field.spectrumIntensity = prism.spectrum;
    r.dirty = true;
  };
  field.setPrismQuality = (quality) => {
    prism.setQuality(quality);
    r.quality = prism.quality;
    r.dirty = true;
  };
  const isPrism = () => field.prismEnabled && !r.original && !!prism.context;
  function drawPrism(force = false) {
    prism.setIdentity(field.opticalIdentity || field.id);
    prism.setMode(field.mode || "home");
    prism.setQuality(r.quality);
    const instrument = field.mode !== "home" && !field.interiorState;
    const compact = r.width < 900;
    const rendered = prism.draw({
      width: r.width,
      height: r.height,
      time: r.time,
      yaw: r.cameraY,
      pitch: r.cameraX,
      zoom: r.zoom,
      center: instrument && !compact ? .54 : r.center,
      centerX: instrument && !compact ? .185 : .5,
      sizeScale: instrument && !compact ? .50 : 1,
      motion: r.motion,
      interior: field.interiorState,
      spectrum: field.spectrumIntensity,
      fold: r.fold,
      force,
    });
    // Preserve the existing lineage hit targets, always from the selected
    // identity. An external token never inherits local-preview descendants.
    const subject = field.opticalIdentity && field.selectionMode !== "local-preview"
      ? field.opticalIdentity : r.state;
    const children = subject?.children || [];
    r.childPositions = [];
    if (!field.interiorState) {
      const radius = Math.min(r.height * .36, r.width * .31) / Math.max(.48, r.zoom || 1);
      const c = prism.context;
      if (rendered) {
        c.save();
        c.setTransform(Math.min(globalThis.devicePixelRatio || 1, prism.quality === "economy" ? 1 : 1.5), 0, 0,
          Math.min(globalThis.devicePixelRatio || 1, prism.quality === "economy" ? 1 : 1.5), 0, 0);
      }
      children.slice(0, 12).forEach((child, i) => {
        const a = i * 2.399963 + .6 + r.time * .035;
        const x = r.width * .5 + Math.cos(a) * radius * 1.27;
        const y = r.height * r.center + Math.sin(a) * radius * .76;
        r.childPositions.push({ x, y, i });
        if (!rendered) return;
        const glow = c.createRadialGradient(x, y, 0, x, y, 21);
        glow.addColorStop(0, "rgba(244,240,255,.9)");
        glow.addColorStop(.15, "rgba(244,216,160,.68)");
        glow.addColorStop(1, "rgba(176,155,255,0)");
        c.fillStyle = glow; c.fillRect(x - 21, y - 21, 42, 42);
        c.strokeStyle = "rgba(244,216,160,.55)"; c.lineWidth = .7;
        c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.stroke();
      });
      if (rendered) c.restore();
    }
    r.onChildren?.(r.childPositions);
  }
  function ensure() {
    if (
      !r.gl ||
      r.lost ||
      !r.livedFieldSource ||
      r.program === installed ||
      r.program === rejected
    )
      return;
    const prior = r.program;
    try {
      installed = r.makeProgram(formationShader(r.livedFieldSource));
      r.program = installed;
      if (prior !== r._approvedProgram) r.gl.deleteProgram(prior.pr);
    } catch (error) {
      rejected = prior;
      field.blueProjectionError = error.message;
    }
  }
  const sameRendererSubject = () =>
    r.state?.seed === field.opticalIdentity?.seed &&
    r.state?.root === field.opticalIdentity?.root;
  const separateSubject = () =>
    field.selectionMode &&
    field.selectionMode !== "local-preview" &&
    !sameRendererSubject();
  const lens = () => {
    const snapshot = field.opticalIdentity;
    if (!snapshot) return null;
    const prior = r.params;
    r.params = [
      ...blueVector(snapshot.seed),
      ...blueVector(snapshot.genome),
      ...blueVector(snapshot.root || snapshot.seed),
      ...prior.slice(12),
    ];
    r.params[13] = snapshot.sovereign ? 1 : 0;
    if (field.selectionMode && field.selectionMode !== "local-preview") {
      for (let i = 23; i < 31; i++) r.params[i] = 0;
      if (!sameRendererSubject()) {
        r.params[14] = 0;
        r.params[21] = 0;
      }
    }
    return prior;
  };
  const draw = r.drawGL.bind(r);
  r.drawGL = function () {
    const prior = lens(),
      quality = this.quality,
      scale = this.renderScale,
      priorPulse = this.pulse,
      priorEvent = this.eventKind;
    if (separateSubject()) {
      this.pulse = 0;
      this.eventKind = 0;
    }
    let budget;
    try {
      ensure();
      if (field.interiorState?.depth && !isPrism()) {
        budget = interiorQuality.update(this.last || performance.now(), {
          quality,
          navigating: field.interiorState.moving,
          hidden: document.hidden,
        });
        field.interiorBudget = budget;
        this.quality = "auto";
        this.renderScale = Math.min(
          scale || 0.9,
          Math.sqrt(budget.pixels / (this.width * this.height)),
        );
      }
      if (this.gl && this.program === installed && !this.original) {
        const gl = this.gl,
          l = field.layout,
          p = l.panel;
        gl.useProgram(installed.pr);
        const values = {
          prismEnabled: isPrism() ? 1 : 0,
          prismSpectrum: field.spectrumIntensity,
          prismMode: prismMode(field.mode),
          genesisDepth: field.interiorState?.depth || 0,
          genesisCamera: field.interiorState?.camera || [0, 0, -2.6, Math.PI],
          genesisLook: field.interiorState?.look || [0, 2.6],
          genesisOptics: field.interiorState ? [field.interiorState.focus, 1] : [0, 0],
          genesisSamples: budget?.samples || 80,
          genesisAudio: field.interiorState?.audio || 0,
          genesisOpening: field.unfold || 0,
          genesisViewport: [this.width, this.height],
          genesisPanel: [
            p.x + p.width / 2,
            p.y + p.height / 2 + field.viewport().top,
            p.width / 2,
            p.height / 2,
          ],
          genesisIdentity: field.id.axes.slice(8, 12),
          life0: this.params.slice(23, 27),
          life1: this.params.slice(27, 31),
        };
        for (const [name, value] of Object.entries(values)) {
          const a = Array.isArray(value) ? value : [value];
          if (a.length !== 1 && a.length !== 2 && a.length !== 4) continue;
          gl["uniform" + a.length + "f"](
            gl.getUniformLocation(installed.pr, name),
            ...a,
          );
        }
      }
      draw();
    } finally {
      this.quality = quality;
      this.renderScale = scale;
      this.pulse = priorPulse;
      this.eventKind = priorEvent;
      if (prior) this.params = prior;
    }
  };
  // Hide exterior screen-space orbit overlays while the camera is in the volume.
  const atmosphere = r.drawAtmosphere?.bind(r);
  if (atmosphere)
    r.drawAtmosphere = function () {
      if (isPrism()) {
        drawPrism();
        return;
      }
      prism.lastKey = "";
      if (field.interiorState) {
        this.fx.setTransform(1, 0, 0, 1, 0, 0);
        this.fx.clearRect(0, 0, this.overlay.width, this.overlay.height);
        this.childPositions = [];
        return;
      }
      const priorState = this.state,
        priorPulse = this.pulse,
        priorEvent = this.eventKind;
      try {
        if (
          field.opticalIdentity &&
          field.selectionMode &&
          field.selectionMode !== "local-preview"
        ) {
          if (separateSubject()) {
            this.pulse = 0;
            this.eventKind = 0;
          }
          this.state = {
            ...field.opticalIdentity,
            nonce: Number(field.opticalIdentity.nonce || 0),
            children: field.opticalIdentity.children || [],
          };
        }
        atmosphere();
      } finally {
        this.state = priorState;
        this.pulse = priorPulse;
        this.eventKind = priorEvent;
      }
    };
  // The software path integrates the same volume; the exterior keeps its WASM.
  const fallback = (field.interiorFallback = new InteriorSoftwareRenderer());
  const cpu = r.drawCPU.bind(r),
    copy = document.createElement("canvas");
  r.drawCPU = function (ts) {
    const prior = lens();
    try {
      if (isPrism() && this.ctx) {
        // The same geometry remains interactive without WebGL, WASM or workers.
        if (this.canvas.width !== this.width || this.canvas.height !== this.height) {
          this.canvas.width = this.width;
          this.canvas.height = this.height;
        }
        this.ctx.globalAlpha = 1;
        this.ctx.fillStyle = "#070b1b";
        this.ctx.fillRect(0, 0, this.width, this.height);
        if (fallback.started) fallback.reset();
        return;
      }
      if (field.interiorState?.depth) {
        fallback.draw(this, this.params, field.interiorState, ts);
        return;
      }
      if (fallback.started) fallback.reset();
      cpu(ts);
    } finally {
      if (prior) this.params = prior;
    }
    const o = field.unfold || 0;
    if (!o || !this.ctx) return;
    const c = this.ctx,
      l = field.layout,
      p = l.panel,
      w = this.width,
      h = this.height;
    copy.width = w;
    copy.height = h;
    copy.getContext("2d").drawImage(this.canvas, 0, 0);
    c.fillStyle = "#020509";
    c.fillRect(0, 0, w, h);
    const x = p.x * o,
      y = (p.y + field.viewport().top) * o,
      ww = w + (p.width - w) * o,
      hh = h + (p.height - h) * o;
    for (let i = 0; i < 48; i++) {
      const phase = i / 48,
        warp = Math.sin(phase * 12 + this.time * 0.1 + field.id.phase) * 9 * o;
      c.drawImage(
        copy,
        0,
        h * phase,
        w,
        h / 48,
        x + warp,
        y + hh * phase,
        ww,
        hh / 48 + 1,
      );
    }
    c.globalAlpha = o * 0.97;
    c.fillStyle = "#020811";
    c.beginPath();
    c.roundRect(
      p.x + 4,
      p.y + 4 + field.viewport().top,
      p.width - 8,
      p.height - 8,
      26 + field.id.axes[10] * 26,
    );
    c.fill();
    c.globalAlpha = 1;
  };
  field.updateBlue = () => {
    ensure();
    const opening = field.unfold || 0;
    const p = field.layout.panel,
      key = [
        opening,
        r.width,
        r.height,
        p.x,
        p.y,
        p.width,
        p.height,
        field.viewport().top,
        field.opticalIdentity?.seed,
        field.opticalIdentity?.genome,
        field.opticalIdentity?.root,
        field.opticalIdentity?.sovereign,
        field.prismEnabled,
        field.mode,
        field.spectrumIntensity,
        r.original,
        ...field.id.axes.slice(8, 12),
      ].join("|");
    if (key !== lastProjection) {
      r.dirty = true;
      lastProjection = key;
      document.documentElement.style.setProperty("--ag-opening", isPrism() ? 0 : opening);
    }
    field.motion = r.motion;
    // A lost optical GPU context must not hide the independent filament view.
    if (r.lost && isPrism()) drawPrism();
  };
  const dispose = r.dispose?.bind(r);
  r.dispose = () => {
    prism.dispose();
    fallback.reset();
    dispose?.();
  };
  field.blueRenderer = r;
  ensure();
}
