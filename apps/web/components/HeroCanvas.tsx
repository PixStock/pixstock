"use client";

import { useEffect, useRef } from "react";
import { BOX, FINDERS, FINDER_EYE, FINDER_RING, INK, MODULE, MODULES, MODULE_RADIUS, ORIGIN, moduleAt } from "@/lib/qr-mark";

/**
 * Ports hero.js: the mark assembled out of particles in HDR, accumulated
 * additively into a half-float target, bloomed, then tone-mapped. The pipeline
 * is the original line for line; only `markPoints` differs, because it now
 * rasterises the QR mark from lib/qr-mark.ts instead of the emblem hero.js
 * had hard-coded.
 */
export function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const gl = cv.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    if (!gl) return;

    const hdr = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
    const TEX_FMT = hdr ? gl.RGBA16F : gl.RGBA8;
    const TEX_TYPE = hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    function markPoints(n: number) {
      const S = 384;
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const g = c.getContext("2d")!;
      const k = S / BOX;

      // the primitive an <rect rx> gives us for free in SVG; arcTo keeps this
      // working on the browsers that still lack roundRect
      const rr = (x: number, y: number, size: number, r: number) => {
        const e = size * k;
        const px = x * k;
        const py = y * k;
        const pr = r * k;
        g.beginPath();
        g.moveTo(px + pr, py);
        g.arcTo(px + e, py, px + e, py + e, pr);
        g.arcTo(px + e, py + e, px, py + e, pr);
        g.arcTo(px, py + e, px, py, pr);
        g.arcTo(px, py, px + e, py, pr);
        g.closePath();
      };

      g.fillStyle = "#fff";
      MODULES.forEach(([col, row]) => {
        rr(moduleAt(col), moduleAt(row), MODULE, MODULE_RADIUS);
        g.fill();
      });
      FINDERS.forEach(([x, y]) => {
        rr(x + FINDER_EYE.inset, y + FINDER_EYE.inset, FINDER_EYE.size, FINDER_EYE.radius);
        g.fill();
      });

      g.strokeStyle = "#fff";
      g.lineWidth = FINDER_RING.stroke * k;
      FINDERS.forEach(([x, y]) => {
        rr(x + FINDER_RING.inset, y + FINDER_RING.inset, FINDER_RING.size, FINDER_RING.radius);
        g.stroke();
      });

      const px = g.getImageData(0, 0, S, S).data;
      const pool: number[] = [];
      for (let i = 3, p = 0; i < px.length; i += 4, p++) {
        if (px[i] > 110) pool.push(p);
      }
      if (!pool.length) return null;

      // normalised over the ink, not the whole box, so u_scale stays the mark's
      // half-size in pixels however wide a quiet zone the geometry carries
      const quiet = ORIGIN * k;
      const span = INK * k;

      const out = new Float32Array(n * 2);
      for (let j = 0; j < n; j++) {
        const idx = pool[(Math.random() * pool.length) | 0];
        const jx = (idx % S) + (Math.random() - 0.5) * 1.6;
        const jy = ((idx / S) | 0) + (Math.random() - 0.5) * 1.6;
        out[j * 2] = ((jx - quiet) / span) * 2 - 1;
        out[j * 2 + 1] = 1 - ((jy - quiet) / span) * 2;
      }
      return out;
    }

    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    // the QR covers ~2.7x the ink the old outline emblem did, so the counts go
    // up with it — at the old numbers the modules read as haze, not as squares
    const COUNT = small ? 24000 : 64000;
    const targets = markPoints(COUNT);
    if (!targets) return;

    const seeds = new Float32Array(COUNT * 2);
    for (let s = 0; s < COUNT; s++) {
      seeds[s * 2] = s / COUNT;
      seeds[s * 2 + 1] = Math.random();
    }

    function sh(type: number, src: string) {
      const o = gl!.createShader(type)!;
      gl!.shaderSource(o, src);
      gl!.compileShader(o);
      if (!gl!.getShaderParameter(o, gl!.COMPILE_STATUS)) {
        console.warn("shader:", gl!.getShaderInfoLog(o));
        return null;
      }
      return o;
    }
    function prog(vs: string, fs: string) {
      const a = sh(gl!.VERTEX_SHADER, vs),
        b = sh(gl!.FRAGMENT_SHADER, fs);
      if (!a || !b) return null;
      const p = gl!.createProgram()!;
      gl!.attachShader(p, a);
      gl!.attachShader(p, b);
      gl!.linkProgram(p);
      if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) {
        console.warn("link:", gl!.getProgramInfoLog(p));
        return null;
      }
      return p;
    }
    function uni(p: WebGLProgram) {
      const m: Record<string, WebGLUniformLocation | null> = {};
      const n = gl!.getProgramParameter(p, gl!.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const nm = gl!.getActiveUniform(p, i)!.name.replace("[0]", "");
        m[nm] = gl!.getUniformLocation(p, nm);
      }
      return m;
    }

    const VS_POINTS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_t;
layout(location=1) in vec2 a_s;
uniform vec2 u_res, u_center, u_mouse;
uniform float u_scale, u_time, u_conv, u_mforce, u_dpr;
out float v_a;
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main(){
  float sd = hash(a_s);
  float ph = a_s.x * 6.2831853;
  vec2 chaos = vec2(
    (a_s.x * 2.0 - 1.0) * u_res.x * 0.66,
    sin(ph * 3.0 + u_time * 0.5) * u_res.y * 0.17
    + cos(ph * 7.0 - u_time * 0.28) * u_res.y * 0.075
    + (a_s.y - 0.5) * u_res.y * 0.11 + u_center.y * 0.45);
  vec2 tgt = a_t * u_scale + u_center;
  float kp = clamp((u_conv - sd * 0.34) / 0.66, 0.0, 1.0);
  kp = kp * kp * (3.0 - 2.0 * kp);
  vec2 p = mix(chaos, tgt, kp);
  float amp = mix(30.0, 1.5, kp) * u_dpr;
  p.x += sin(u_time * 0.9 + ph * 4.0 + sd * 6.0) * amp;
  p.y += cos(u_time * 0.72 + ph * 5.3 + sd * 4.0) * amp;
  vec2 d = p - u_mouse;
  float dist = max(length(d), 1.0);
  float infl = exp(-dist / (u_res.y * 0.19)) * u_mforce;
  p += (d / dist) * infl * 105.0 * u_dpr;
  p += vec2(-d.y, d.x) / dist * infl * 52.0 * u_dpr;
  v_a = mix(0.30, 1.0, kp) * (0.5 + 0.5 * sd);
  gl_Position = vec4(p / (u_res * 0.5), 0.0, 1.0);
  gl_PointSize = (1.05 + sd * 1.35) * u_dpr;
}`;

    const FS_POINTS = `#version 300 es
precision highp float;
in float v_a;
uniform float u_gain;
out vec4 o;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c);
  if (r > 0.25) discard;
  float f = exp(-r * 9.5);
  vec3 col = vec3(1.0, 0.965, 0.925);
  float e = f * v_a * u_gain;
  o = vec4(col * e, e);
}`;

    const VS_QUAD = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_p;
out vec2 v_uv;
void main(){ v_uv = a_p * 0.5 + 0.5; gl_Position = vec4(a_p, 0.0, 1.0); }`;

    const FS_BLUR = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_dir;
uniform float u_thresh;
out vec4 o;
void main(){
  float wts[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec3 acc = vec3(0.0);
  for (int i = -4; i <= 4; i++) {
    vec3 c = texture(u_src, v_uv + u_dir * float(i)).rgb;
    c = max(c - u_thresh, 0.0);
    acc += c * wts[i < 0 ? -i : i];
  }
  o = vec4(acc, 1.0);
}`;

    const FS_COMP = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_acc, u_bloom;
uniform float u_amt, u_fade;
out vec4 o;
void main(){
  vec3 c = texture(u_acc, v_uv).rgb + texture(u_bloom, v_uv).rgb * u_amt;
  c *= u_fade;
  c = c / (1.0 + c);
  c = pow(max(c, 0.0), vec3(1.0 / 1.85));
  float a = max(max(c.r, c.g), c.b);
  o = vec4(c, clamp(a * 1.12, 0.0, 1.0));
}`;

    const pPoints = prog(VS_POINTS, FS_POINTS);
    const pBlur = prog(VS_QUAD, FS_BLUR);
    const pComp = prog(VS_QUAD, FS_COMP);
    if (!pPoints || !pBlur || !pComp) return;

    const uP = uni(pPoints),
      uB = uni(pBlur),
      uC = uni(pComp);

    const vaoP = gl.createVertexArray();
    gl.bindVertexArray(vaoP);
    const bT = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bT);
    gl.bufferData(gl.ARRAY_BUFFER, targets, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const bS = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bS);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

    const vaoQ = gl.createVertexArray();
    gl.bindVertexArray(vaoQ);
    const bQ = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bQ);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    type Target = { t: WebGLTexture; f: WebGLFramebuffer; w: number; h: number };
    function target(w: number, h: number): Target {
      const t = gl!.createTexture()!;
      gl!.bindTexture(gl!.TEXTURE_2D, t);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, TEX_FMT, w, h, 0, gl!.RGBA, TEX_TYPE, null);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      const f = gl!.createFramebuffer()!;
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, f);
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, t, 0);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      return { t, f, w, h };
    }

    let acc: Target | null = null,
      b1: Target | null = null,
      b2: Target | null = null;
    let W = 0,
      H = 0,
      DPR = 1;

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
      const w = Math.max(1, Math.round(cv!.clientWidth * DPR));
      const h = Math.max(1, Math.round(cv!.clientHeight * DPR));
      if (w === W && h === H) return;
      W = w;
      H = h;
      cv!.width = W;
      cv!.height = H;
      [acc, b1, b2].forEach((r) => {
        if (r) {
          gl!.deleteTexture(r.t);
          gl!.deleteFramebuffer(r.f);
        }
      });
      acc = target(W, H);
      const bw = Math.max(1, W >> 2),
        bh = Math.max(1, H >> 2);
      b1 = target(bw, bh);
      b2 = target(bw, bh);
      needsMeasure = true;
    }

    /**
     * The mark gets whatever band the copy leaves above it, and is centred in
     * it. Pinning it to a fraction of the canvas instead is what put it behind
     * the headline on a short phone: the copy is bottom-anchored and climbs as
     * the viewport shortens or a line wraps, and a fraction knows nothing about
     * that. Both values are device pixels measured down from the canvas top.
     */
    let bandTop = 0;
    let bandBottom = 0;
    let needsMeasure = true;

    function measureBand() {
      const box = cv!.getBoundingClientRect();
      const spacer = document.getElementById("head-spacer");
      const copy = cv!.parentElement?.querySelector<HTMLElement>(".hero-body h1");
      bandTop = spacer ? Math.max(0, spacer.getBoundingClientRect().bottom - box.top) * DPR : 0;
      bandBottom = copy ? (copy.getBoundingClientRect().top - box.top) * DPR : H;
    }

    let mx = 0,
      my = 0,
      tmx = 0,
      tmy = 0,
      force = 0,
      tforce = 0;

    const parent = cv.parentNode as HTMLElement;
    const onPointerMove = (e: PointerEvent) => {
      const r = cv!.getBoundingClientRect();
      tmx = (e.clientX - r.left - r.width / 2) * DPR;
      tmy = (r.height / 2 - (e.clientY - r.top)) * DPR;
      tforce = 1;
    };
    const onPointerLeave = () => {
      tforce = 0;
    };
    parent.addEventListener("pointermove", onPointerMove, { passive: true });
    parent.addEventListener("pointerleave", onPointerLeave, { passive: true });

    // the copy reflows on font load and on any wrap change, and neither fires
    // a resize on the canvas
    let copyRo: ResizeObserver | null = null;
    if ("ResizeObserver" in window) {
      copyRo = new ResizeObserver(() => {
        needsMeasure = true;
      });
      const body = cv.parentElement?.querySelector(".hero-body");
      if (body) copyRo.observe(body);
      const head = cv.parentElement?.querySelector(".hero-body h1");
      if (head) copyRo.observe(head);
    }

    let visible = true;
    let visIo: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      visIo = new IntersectionObserver((es) => (visible = es[0].isIntersecting), { threshold: 0 });
      visIo.observe(cv);
    }

    let t0 = performance.now();
    let conv = 0;
    let lit = false;
    let raf = 0;
    let stopped = false;

    function frame(now: number) {
      if (stopped) return;
      if (!visible) {
        raf = requestAnimationFrame(frame);
        return;
      }
      resize();

      const t = (now - t0) / 1000;
      conv = Math.min(1, t / 2.5);
      conv = conv * conv * (3 - 2 * conv);

      mx += (tmx - mx) * 0.09;
      my += (tmy - my) * 0.09;
      force += (tforce - force) * 0.06;

      if (needsMeasure) {
        measureBand();
        needsMeasure = false;
      }
      const room = Math.max(0, bandBottom - bandTop);
      // half the mark: the size the viewport asks for, but never more than the
      // band holds. The air is for the bloom, which carries well past the
      // geometry — clearing the modules is not the same as clearing the glow.
      const wanted = Math.min(Math.max(Math.min(W, H) * 0.15, 52 * DPR), 136 * DPR);
      const scale = Math.max(34 * DPR, Math.min(wanted, room * 0.5 - 30 * DPR));
      const centerY = H * 0.5 - (bandTop + room * 0.5);

      gl!.bindFramebuffer(gl!.FRAMEBUFFER, acc!.f);
      gl!.viewport(0, 0, W, H);
      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.enable(gl!.BLEND);
      gl!.blendFunc(gl!.ONE, gl!.ONE);
      gl!.useProgram(pPoints);
      gl!.bindVertexArray(vaoP);
      gl!.uniform2f(uP.u_res, W, H);
      gl!.uniform2f(uP.u_center, 0, centerY);
      gl!.uniform2f(uP.u_mouse, mx, my);
      gl!.uniform1f(uP.u_scale, scale);
      gl!.uniform1f(uP.u_time, t);
      gl!.uniform1f(uP.u_conv, conv);
      gl!.uniform1f(uP.u_mforce, force);
      gl!.uniform1f(uP.u_dpr, DPR);
      const dens = Math.min(2.4, Math.max(1.0, Math.pow(scale / (100 * DPR), 1.3)));
      gl!.uniform1f(uP.u_gain, (hdr ? 0.42 : 0.16) * dens);
      gl!.drawArrays(gl!.POINTS, 0, COUNT);

      gl!.disable(gl!.BLEND);
      gl!.useProgram(pBlur);
      gl!.bindVertexArray(vaoQ);
      gl!.uniform1i(uB.u_src, 0);
      gl!.activeTexture(gl!.TEXTURE0);

      gl!.bindFramebuffer(gl!.FRAMEBUFFER, b1!.f);
      gl!.viewport(0, 0, b1!.w, b1!.h);
      gl!.bindTexture(gl!.TEXTURE_2D, acc!.t);
      gl!.uniform2f(uB.u_dir, 1.4 / b1!.w, 0);
      gl!.uniform1f(uB.u_thresh, hdr ? 0.22 : 0.08);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

      gl!.bindFramebuffer(gl!.FRAMEBUFFER, b2!.f);
      gl!.viewport(0, 0, b2!.w, b2!.h);
      gl!.bindTexture(gl!.TEXTURE_2D, b1!.t);
      gl!.uniform2f(uB.u_dir, 0, 1.4 / b1!.h);
      gl!.uniform1f(uB.u_thresh, 0);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      gl!.viewport(0, 0, W, H);
      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.useProgram(pComp);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, acc!.t);
      gl!.uniform1i(uC.u_acc, 0);
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, b2!.t);
      gl!.uniform1i(uC.u_bloom, 1);
      gl!.uniform1f(uC.u_amt, 1.12);
      gl!.uniform1f(uC.u_fade, 1.0);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

      if (!lit) {
        lit = true;
        cv!.classList.add("lit");
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    }

    if (reduce) {
      // One still frame, with the clock wound past the assembly so the mark is
      // already formed. It has to be t0 that moves: frame() recomputes `conv`
      // from it every time, so setting `conv` here was overwritten before the
      // first draw and the mark stayed the dust cloud it starts as.
      t0 = performance.now() - 4000;
    }
    raf = requestAnimationFrame(frame);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      parent.removeEventListener("pointermove", onPointerMove);
      parent.removeEventListener("pointerleave", onPointerLeave);
      visIo?.disconnect();
      copyRo?.disconnect();
    };
  }, []);

  return <canvas id="hero-canvas" ref={canvasRef} aria-hidden="true" />;
}
