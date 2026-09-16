/* Versioned visual projection, NOT an account state transition. */
let lifeReady = false,
  lifeInstalling = false,
  lifeLast = "",
  lifeTarget = Array(8).fill(0),
  lifeCurrent = Array(8).fill(0),
  lifeStamp = 0,
  lifeDescriptor = null,
  lifeProjectionKey = "";
const lifeWorker = `let e;onmessage=async({data:d})=>{try{if(d.init){e=(await WebAssembly.instantiate(d.wasm,{math:{sin:Math.sin,cos:Math.cos,exp:Math.exp,pow:Math.pow,atan2:Math.atan2}})).instance.exports;postMessage({ready:true});return;}const start=performance.now();d.params.forEach((v,i)=>e.set_param(i,v));if(!e.render_region(d.w,d.h,d.center,d.y0,d.y1))throw Error('Invalid framebuffer region');const rgba=new Uint8ClampedArray(e.memory.buffer,e.buffer_ptr(),d.w*(d.y1-d.y0)*4).slice();postMessage({rgba,w:d.w,h:d.h,y0:d.y0,y1:d.y1,ms:performance.now()-start,seq:d.seq},[rgba.buffer]);}catch(e){postMessage({error:e.message});}};`;
async function memoryInstallField() {
  const r = window.__idfbi?.renderer;
  if (lifeInstalling || lifeReady || !r || (!r.gl && !r.cpuReady)) return;
  lifeInstalling = true;
  try {
    const oldUniforms = r.uniforms.bind(r);
    r.uniforms = function () {
      const p = oldUniforms(),
        now = performance.now(),
        dt = Math.min(0.1, (now - (lifeStamp || now)) / 1000);
      lifeStamp = now;
      let moving = false;
      lifeCurrent = lifeCurrent.map((x, i) => {
        const y = this.motion
          ? x + (lifeTarget[i] - x) * (1 - Math.exp(-dt * 1.5))
          : lifeTarget[i];
        if (Math.abs(y - lifeTarget[i]) > 0.00001) moving = true;
        return y;
      });
      for (let i = 0; i < 8; i++) p[23 + i] = lifeCurrent[i];
      if (moving) this.dirty = true;
      return p;
    };
    if (r.gl) {
      const oldProgram = r.program;
      r.program = r.makeProgram(LIVED_ASSETS.shader);
      r._approvedProgram = oldProgram;
      const oldDraw = r.drawGL.bind(r);
      r.drawGL = function () {
        if (!this.original) {
          const gl = this.gl,
            pr = this.program;
          gl.useProgram(pr.pr);
          gl.uniform4fv(
            gl.getUniformLocation(pr.pr, "life0"),
            this.params.slice(23, 27),
          );
          gl.uniform4fv(
            gl.getUniformLocation(pr.pr, "life1"),
            this.params.slice(27, 31),
          );
        }
        oldDraw();
      };
      r.backend = "WebGL 2 · lived field";
    } else {
      r.workers?.forEach((w) => w.terminate());
      r.workers = [];
      r.cpu = null;
      r.cpuBusy = false;
      r.cpuReady = false;
      r.cpuJob = null;
      r.sequence++;
      r.acceptedSequence = r.sequence;
      const bytes = Uint8Array.from(atob(LIVED_ASSETS.wasm), (c) =>
        c.charCodeAt(0),
      );
      try {
        const count = Math.min(
            4,
            Math.max(1, (navigator.hardwareConcurrency || 2) - 1),
          ),
          url = URL.createObjectURL(
            new Blob([lifeWorker], { type: "text/javascript" }),
          );
        let ready = 0;
        for (let i = 0; i < count; i++) {
          const w = new Worker(url);
          r.workers.push(w);
          w.onerror = (e) => {
            r.cpuReady = false;
            r.cpuBusy = false;
            r.notify("Lived field worker unavailable: " + e.message);
          };
          w.onmessage = ({ data: d }) => {
            if (d.ready) {
              if (++ready === count) r.cpuReady = true;
              return;
            }
            if (d.error) {
              r.cpuBusy = false;
              r.notify(d.error);
              return;
            }
            const j = r.cpuJob;
            if (!j || d.seq !== j.seq) return;
            j.rgba.set(d.rgba, d.y0 * d.w * 4);
            j.done++;
            if (j.done === count) {
              r.cpuBusy = false;
              r.cpuMs = performance.now() - j.start;
              r.acceptCPU({ ...j, ms: r.cpuMs });
            }
          };
          const copy = bytes.slice();
          w.postMessage({ init: true, wasm: copy.buffer }, [copy.buffer]);
        }
        URL.revokeObjectURL(url);
        r.backend = "WASM lived optical field";
      } catch {
        r.workers?.forEach((w) => w.terminate());
        r.workers = null;
        r.cpu = (
          await WebAssembly.instantiate(bytes, {
            math: {
              sin: Math.sin,
              cos: Math.cos,
              exp: Math.exp,
              pow: Math.pow,
              atan2: Math.atan2,
            },
          })
        ).instance.exports;
        r.cpuReady = true;
        r.backend = "WASM main-thread lived field";
      }
    }
    const oldInit = r.init.bind(r);
    r.init = function () {
      oldInit();
      if (this.gl) {
        this.program = this.makeProgram(LIVED_ASSETS.shader);
        this.backend = "WebGL 2 · lived field";
      } else {
        lifeReady = false;
      }
    };
    r.livedFieldSource = LIVED_ASSETS.shader;
    lifeReady = true;
    r.dirty = true;
    r.lastJob = 0;
    r.notify(r.backend);
  } catch (e) {
    console.error(e);
    r.notify("Lived form unavailable: " + e.message);
  } finally {
    lifeInstalling = false;
  }
}
function memorySyncField() {
  if (!window.__idfbi || !ixEngine?.mem) return;
  const original = window.__idfbi,
    selection = window.__animaSelection?.get(),
    blocked =
      (selection
        ? !selection.localLife
        : !!window.AWE_CHAIN_IDENTITY || !!original.chain()) ||
      original.state().root !== original.world().state.root;
  const projectionKey = [
    ixEngine.mem.origin,
    ixEngine.mem.start,
    W().s.selected,
    W().s.head,
    memFormThrough,
  ].join("|");
  if (projectionKey !== lifeProjectionKey) {
    lifeDescriptor = ixEngine.form(
      undefined,
      memFormThrough === null ? W().s.seq : memFormThrough,
    );
    lifeProjectionKey = projectionKey;
  }
  const descriptor = lifeDescriptor;
  const key = [descriptor.root, memFormOriginal, !!blocked].join("|");
  if (key !== lifeLast) {
    lifeLast = key;
    lifeTarget =
      memFormOriginal || blocked ? Array(8).fill(0) : descriptor.traits.slice();
    if (blocked) lifeCurrent = Array(8).fill(0);
    const r = original.renderer;
    r.dirty = true;
    r.lastJob = 0;
  }
  let badge = ix$("#life-badge");
  if (!badge) {
    badge = document.createElement("button");
    badge.id = "life-badge";
    badge.type = "button";
    badge.addEventListener("click", () => {
      nav("form");
      ix$("#instrument-dialog").showModal();
    });
    document.body.append(badge);
  }
  badge.textContent = blocked
    ? "ORIGINAL HISTORY / LOCAL LIFE NOT APPLIED"
    : memFormOriginal
      ? "ORIGINAL FORM · COMPARE"
      : (memFormThrough === null ? "LIVED FORM" : "PAST LIVED FORM") +
        " / " +
        descriptor.count +
        " TRACES";
  badge.title =
    "Inspect activity, compare the original, and revisit earlier forms";
  badge.hidden = !!blocked;
  memoryInstallField();
}
const memoryFrame = (now) => {
  if (document.hidden || now - memoryFrame.last < 400) return;
  memoryFrame.last = now;
  if (window.__instruments) {
    memorySyncField();
    if (memCheckSession()) draw();
  }
};
memoryFrame.last = 0;
(window.__animaFrameSubscribers ??= new Set()).add(memoryFrame);
window.addEventListener("anima:selection", () => {
  memorySyncField();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && window.__instruments) {
    memLock();
    if (["journal", "memory-write", "trade"].includes(ixView)) draw();
  }
});
