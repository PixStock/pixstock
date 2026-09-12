"use client";

import { useEffect, useRef } from "react";

type Gate = [number, number, string, "below" | "above-left"];

const GATE_POSITIONS: Array<[number, number, "below" | "above-left"]> = [
  [100, 0.75, "below"],
  [400, 1.5, "below"],
  [800, 2.5, "above-left"],
];

/** Ports chart.js verbatim: the reputation multiplier curve on the mechanic page. */
export function ReputationChart({ gateLabels, ariaLabel }: { gateLabels: [string, string, string]; ariaLabel: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const GATES: Gate[] = GATE_POSITIONS.map(([score, mult, pos], i) => [score, mult, gateLabels[i], pos]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext("2d")!;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function tok(name: string, fallback: string) {
      const v = getComputedStyle(cv!).getPropertyValue(name).trim();
      return v || fallback;
    }
    function mult(r: number) {
      return Math.min(3, 0.5 + (2.5 * r) / 1000);
    }

    function draw(p: number) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv!.clientWidth,
        h = cv!.clientHeight;
      if (!w || !h) return;
      cv!.width = Math.round(w * dpr);
      cv!.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const ink = tok("--ink", "#181818");
      const ink3 = tok("--ink-3", "#6f6a63");
      const rule = tok("--rule-2", "#e5e3df");
      const plate = tok("--surface", "#fff");

      const padL = 46,
        padR = 16,
        padT = 18,
        padB = 32;
      const pw = w - padL - padR,
        ph = h - padT - padB;
      const X = (r: number) => padL + (r / 1000) * pw;
      const Y = (m: number) => padT + ph - ((m - 0.5) / 2.5) * ph;

      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textBaseline = "middle";

      [0.5, 1, 1.5, 2, 2.5, 3].forEach((m) => {
        ctx.strokeStyle = rule;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, Math.round(Y(m)) + 0.5);
        ctx.lineTo(w - padR, Math.round(Y(m)) + 0.5);
        ctx.stroke();
        ctx.fillStyle = ink3;
        ctx.textAlign = "right";
        ctx.fillText(m.toFixed(1) + "×", padL - 8, Y(m));
      });

      ctx.fillStyle = rule;
      ctx.fillRect(padL, padT, X(100) - padL, ph);
      ctx.save();
      ctx.strokeStyle = ink3;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(Math.round(X(100)) + 0.5, padT);
      ctx.lineTo(Math.round(X(100)) + 0.5, padT + ph);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = tok("--rule", "#d8d5d0");
      ctx.beginPath();
      ctx.moveTo(padL, Math.round(padT + ph) + 0.5);
      ctx.lineTo(w - padR, Math.round(padT + ph) + 0.5);
      ctx.stroke();
      ctx.fillStyle = ink3;
      [0, 250, 500, 750, 1000].forEach((r) => {
        ctx.textAlign = r === 0 ? "left" : r === 1000 ? "right" : "center";
        ctx.fillText(String(r), X(r), padT + ph + 16);
      });

      const end = 1000 * p;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.9;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let r = 0; r <= end; r += 10) {
        if (r === 0) ctx.moveTo(X(r), Y(mult(r)));
        else ctx.lineTo(X(r), Y(mult(r)));
      }
      ctx.lineTo(X(end), Y(mult(end)));
      ctx.stroke();

      function label(text: string, x: number, y: number, align: CanvasTextAlign) {
        const m = ctx.measureText(text);
        const padx = 5,
          pady = 4,
          tw = m.width,
          th = 11;
        const bx = align === "right" ? x - tw - padx : x - padx;
        ctx.fillStyle = plate;
        ctx.beginPath();
        ctx.rect(bx, y - th / 2 - pady, tw + padx * 2, th + pady * 2);
        ctx.fill();
        ctx.fillStyle = ink3;
        ctx.textAlign = align;
        ctx.fillText(text, x, y);
      }

      GATES.forEach((g) => {
        if (end < g[0] - 4) return;
        const t = Math.min(1, (end - g[0]) / 90);
        const x = X(g[0]),
          y = Y(g[1]);

        if (g[3] === "below") label(g[2], x + 12, y + 19, "left");
        else label(g[2], x - 12, y - 19, "right");

        const rad = 4.6 * (0.6 + 0.4 * t);
        ctx.fillStyle = plate;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, 6.2832);
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, 6.2832);
        ctx.stroke();
      });
    }

    let played = false;
    function animate() {
      if (played) return;
      played = true;
      const t0 = performance.now();
      (function step(now: number) {
        const p = Math.min(1, (now - t0) / 1250);
        draw(p * p * (3 - 2 * p));
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }

    draw(reduce ? 1 : 0);
    const onResize = () => draw(played || reduce ? 1 : 0);
    const onTheme = () => draw(played || reduce ? 1 : 0);
    window.addEventListener("resize", onResize);
    window.addEventListener("df:theme", onTheme);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => draw(played || reduce ? 1 : 0));
    }

    let io: IntersectionObserver | null = null;
    if (!reduce) {
      if ("IntersectionObserver" in window) {
        io = new IntersectionObserver(
          (es) => {
            if (!es[0].isIntersecting) return;
            animate();
            io!.disconnect();
          },
          { threshold: 0.4 },
        );
        io.observe(cv);
      } else {
        animate();
      }
    }

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("df:theme", onTheme);
      io?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- GATES is derived from gateLabels each render, listing it here would just re-add the same identity check
  }, [gateLabels]);

  return <canvas id="rep-canvas" ref={canvasRef} role="img" aria-label={ariaLabel} />;
}
