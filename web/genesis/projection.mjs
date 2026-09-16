import { InteriorQualityController } from "./interior-quality.mjs";
import { interiorShader } from "./interior-shader.mjs";
import { InteriorSoftwareRenderer } from "./interior-cpu.mjs";
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
 void main(){
  vec2 originalUV=(gl_FragCoord.xy-vec2(resolution.x*.5,resolution.y*(1.-center)))/resolution.y*3.2;
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
      if (field.interiorState?.depth) {
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
        ...field.id.axes.slice(8, 12),
      ].join("|");
    if (key !== lastProjection) {
      r.dirty = true;
      lastProjection = key;
      document.documentElement.style.setProperty("--ag-opening", opening);
    }
    field.motion = r.motion;
  };
  field.blueRenderer = r;
  ensure();
}
