/**
 * Renders the poster frames for the paint surface from the very same shader the
 * live canvas uses, so a poster and the WebGL frame are never two different
 * artworks. Posters are the first paint, and what people see with reduced
 * motion, data saving, no WebGL or a slow device.
 *
 *   bun run scripts/render-finish-posters.ts
 *
 * Output: public/finish/f<percent>-<wide|narrow>.webp (needs Chromium; the
 * encoding is done by the browser, so there is no image library to install).
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fragmentSource, VERT } from "../src/lib/paint/shader";
import { POSTER_LEVELS } from "../src/lib/paint/posters";

const SIZES = { wide: [1280, 340], narrow: [720, 560] } as const;
const OUT = "public/finish";

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<canvas id=c></canvas>");

for (const [name, [w, h]] of Object.entries(SIZES)) {
  for (const level of POSTER_LEVELS) {
    const url = await page.evaluate(
      ({ w, h, level, vert, frag }) => {
        const c = document.getElementById("c") as HTMLCanvasElement;
        c.width = w;
        c.height = h;
        const gl = c.getContext("webgl", { preserveDrawingBuffer: true, antialias: false })!;
        const sh = (t: number, s: string) => {
          const o = gl.createShader(t)!;
          gl.shaderSource(o, s);
          gl.compileShader(o);
          if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) ?? "shader");
          return o;
        };
        const p = gl.createProgram()!;
        gl.attachShader(p, sh(gl.VERTEX_SHADER, vert));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag));
        gl.linkProgram(p);
        gl.useProgram(p);
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const a = gl.getAttribLocation(p, "a");
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        const u = (n: string) => gl.getUniformLocation(p, n);
        gl.uniform2f(u("u_res"), w, h);
        gl.uniform1f(u("u_level"), level >= 1 ? 1.06 : level);
        gl.uniform3f(u("u_torch"), 0.5, 0.5, 0);
        gl.uniform2f(u("u_tilt"), 0, 0);
        gl.uniform1f(u("u_pass"), -1);
        gl.uniform1f(u("u_focus"), -1);
        gl.viewport(0, 0, w, h);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return c.toDataURL("image/webp", 0.7);
      },
      { w, h, level, vert: VERT, frag: fragmentSource(name === "narrow") },
    );
    const file = `${OUT}/f${String(Math.round(level * 100)).padStart(2, "0")}-${name}.webp`;
    writeFileSync(file, Buffer.from(url.split(",")[1]!, "base64"));
    console.log(file, Math.round((url.length * 3) / 4 / 1024) + " KB");
  }
}
await browser.close();
