import { VERT, fragmentSource } from "./shader";

/**
 * A small WebGL engine for the paint surface. It draws one full-screen quad
 * with the paint shader, and only while something is changing: the finish edge
 * travelling, the torch following a finger, the light-pass. Once everything is
 * still the loop stops, so a customer reading their dashboard costs the GPU
 * nothing. Resolution is capped, and steps down by itself if frames run slow.
 */

export interface PaintEngine {
  /** Move the finish edge. `from` starts it somewhere else (a new visit travelling in). */
  setLevel(level: number, opts?: { ms?: number; from?: number; pass?: boolean }): void;
  /** Which segment (0..1 across the panel) is being looked at, or null. */
  setFocus(x: number | null): void;
  /** Aim the torch at a point (0..1, y down), or null to put it away. */
  aim(x: number | null, y?: number): void;
  resize(cssWidth: number, cssHeight: number): void;
  /** Off-screen or hidden: stop drawing. On again: draw a fresh frame. */
  setActive(active: boolean): void;
  dispose(): void;
}

export interface EngineOptions {
  /** Cheaper shader for phones and slower GPUs. */
  lite: boolean;
  /** Ceiling on device pixel ratio. */
  maxDpr: number;
  /** Frames stayed too slow even at the lowest resolution: stop and let the caller show a poster. */
  onOverload?: () => void;
  onLost?: () => void;
  onRestored?: () => void;
}

/** Finish edge for a 0..1 level. A finished panel puts the line past the edge and hides it. */
export const edgeFor = (level: number) => (level >= 1 ? 1.06 : Math.max(0, level));

const MAX_PIXELS = 1_250_000;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function createPaintEngine(
  canvas: HTMLCanvasElement,
  opts: EngineOptions,
): PaintEngine | null {
  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  const loc: Record<string, WebGLUniformLocation | null> = {};

  function compile(type: number, src: string) {
    const s = gl!.createShader(type);
    if (!s) throw new Error("no shader");
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error("shader compile failed");
    return s;
  }

  function init(): boolean {
    try {
      const p = gl!.createProgram();
      if (!p) return false;
      gl!.attachShader(p, compile(gl!.VERTEX_SHADER, VERT));
      gl!.attachShader(p, compile(gl!.FRAGMENT_SHADER, fragmentSource(opts.lite)));
      gl!.linkProgram(p);
      if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) return false;
      gl!.useProgram(p);
      program = p;
      buffer = gl!.createBuffer();
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
      gl!.bufferData(
        gl!.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl!.STATIC_DRAW,
      );
      const a = gl!.getAttribLocation(p, "a");
      gl!.enableVertexAttribArray(a);
      gl!.vertexAttribPointer(a, 2, gl!.FLOAT, false, 0, 0);
      for (const n of ["u_res", "u_level", "u_torch", "u_tilt", "u_pass", "u_focus"]) {
        loc[n] = gl!.getUniformLocation(p, n);
      }
      return true;
    } catch {
      return false;
    }
  }
  if (!init()) return null;

  // Animated state.
  let level = 0;
  let levelFrom = 0;
  let levelTo = 0;
  let levelT0 = 0;
  let levelMs = 0;
  let levelAnimating = false;
  let focusX = -1;
  let focusTarget = -1;
  let torchX = 0.5;
  let torchY = 0.5;
  let torchK = 0;
  let torchTarget = 0;
  let passT0 = 0;
  let passing = false;

  let cssW = 0;
  let cssH = 0;
  let scale = 1;
  let active = true;
  let raf = 0;
  let dead = false;
  let lastFrame = 0;
  const deltas: number[] = [];
  let slowSteps = 0;

  function applySize() {
    if (!cssW || !cssH) return;
    let dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr) * scale;
    const px = cssW * cssH * dpr * dpr;
    if (px > MAX_PIXELS) dpr *= Math.sqrt(MAX_PIXELS / px);
    canvas.width = Math.max(2, Math.round(cssW * dpr));
    canvas.height = Math.max(2, Math.round(cssH * dpr));
    gl!.viewport(0, 0, canvas.width, canvas.height);
  }

  function draw(now: number) {
    if (!program) return;
    gl!.uniform2f(loc["u_res"]!, canvas.width, canvas.height);
    gl!.uniform1f(loc["u_level"]!, edgeFor(level));
    gl!.uniform3f(loc["u_torch"]!, torchX, 1 - torchY, torchK);
    gl!.uniform2f(loc["u_tilt"]!, (torchX - 0.5) * 0.5 * (torchK > 0.01 ? 1 : 0), 0);
    const pass = passing ? (now - passT0) / 1100 : -1;
    gl!.uniform1f(loc["u_pass"]!, pass);
    gl!.uniform1f(loc["u_focus"]!, focusX);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }

  function step(now: number): boolean {
    let busy = false;
    if (levelAnimating) {
      const t = levelMs > 0 ? Math.min(1, (now - levelT0) / levelMs) : 1;
      level = levelFrom + (levelTo - levelFrom) * ease(t);
      if (t >= 1) levelAnimating = false;
      else busy = true;
    }
    if (passing && now - passT0 > 1250) passing = false;
    else if (passing) busy = true;
    if (Math.abs(focusX - focusTarget) > 0.0005) {
      focusX = focusX < 0 || focusTarget < 0 ? focusTarget : focusX + (focusTarget - focusX) * 0.3;
      busy = true;
    } else focusX = focusTarget;
    const dk = torchTarget - torchK;
    if (Math.abs(dk) > 0.004) {
      torchK += dk * 0.22;
      busy = true;
    } else torchK = torchTarget;
    return busy || torchK > 0.004;
  }

  function frame(now: number) {
    raf = 0;
    if (dead || !active) return;
    const busy = step(now);
    draw(now);

    // Watch the frame rate while things move. Step the resolution down before giving up.
    if (lastFrame) {
      deltas.push(now - lastFrame);
      if (deltas.length > 40) deltas.shift();
      if (deltas.length >= 30) {
        const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        if (avg > 40) {
          if (scale > 0.55) {
            scale *= 0.8;
            slowSteps++;
            applySize();
            deltas.length = 0;
          } else if (avg > 90 && slowSteps >= 3) {
            opts.onOverload?.();
            return;
          }
        }
      }
    }
    lastFrame = busy ? now : 0;
    if (!busy) deltas.length = 0;
    if (busy) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (dead || !active || raf) return;
    raf = requestAnimationFrame(frame);
  }

  const onLost = (e: Event) => {
    e.preventDefault();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    program = null;
    opts.onLost?.();
  };
  const onRestored = () => {
    if (init()) {
      applySize();
      kick();
      opts.onRestored?.();
    }
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  return {
    setLevel(next, o = {}) {
      const to = Math.min(1, Math.max(0, next));
      const from = o.from !== undefined ? Math.min(1, Math.max(0, o.from)) : level;
      levelFrom = from;
      levelTo = to;
      levelT0 = performance.now();
      levelMs = o.ms ?? 1000;
      levelAnimating = levelMs > 0 && from !== to;
      level = levelMs > 0 ? from : to;
      if (o.pass) {
        passing = true;
        passT0 = performance.now() + (levelMs > 0 ? levelMs * 0.55 : 0);
      }
      kick();
    },
    setFocus(x) {
      focusTarget = x === null ? -1 : x;
      if (focusX < 0 && x !== null) focusX = x;
      kick();
    },
    aim(x, y = 0.5) {
      if (x === null) torchTarget = 0;
      else {
        if (torchK < 0.01) {
          torchX = x;
          torchY = y;
        } else {
          torchX += (x - torchX) * 0.6;
          torchY += (y - torchY) * 0.6;
        }
        torchTarget = 1;
      }
      kick();
    },
    resize(w, h) {
      cssW = w;
      cssH = h;
      applySize();
      if (!raf && program && active) {
        draw(performance.now());
      }
    },
    setActive(next) {
      active = next;
      if (!next && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (next) {
        lastFrame = 0;
        deltas.length = 0;
        if (program) draw(performance.now());
        kick();
      }
    },
    dispose() {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (program) gl.deleteProgram(program);
      if (buffer) gl.deleteBuffer(buffer);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
