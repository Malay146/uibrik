"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

// Rust text. Brushed steel type that oxidises while you watch: orange blooms
// open from the edges of each stroke and spread across it, darken as they
// age, and finally flake off in small pieces that fall away. Moving the
// pointer over it polishes the metal back, with a brief shine where it
// passed, and the rust starts again from there.
//
// Every pixel inside the glyphs has its own age. A noise field decides when
// each one starts to turn, biased so thin edges go first, so the rust grows
// as patches rather than a fade. Polishing just takes age away.

const FALL = 1.4; // room under the text for falling flakes, in em
const ONSET_SCALE = 38; // px per rust patch
const TINT_SCALE = 12;
const FLAKE_SCALE = 5;
const MAX_FLAKES = 500;

type Flake = { x: number; y: number; vx: number; vy: number; life: number; c: string };

function hash(x: number, y: number, seed: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = (x - xi) * (x - xi) * (3 - 2 * (x - xi));
  const v = (y - yi) * (y - yi) * (3 - 2 * (y - yi));
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, seed: number) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * noise(x * f, y * f, seed + o * 17);
    f *= 2;
    amp *= 0.5;
  }
  return sum / 0.9375;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// Separable box blur of a coverage mask, for telling stroke edges from centres.
function blur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

// Rust from deep brown through orange to a pale bloom.
const RUST = [
  [74, 31, 14],
  [150, 62, 22],
  [201, 108, 44],
] as const;

export type RustTextProps = {
  /** The words, on one line. */
  text?: string;
  /** Seconds for clean metal to rust right through. */
  duration?: number;
  /** How much is already rusted when it appears, 0–1. */
  start?: number;
  /** Polishing brush radius, px. */
  brush?: number;
  /** Let fully rusted metal flake off. */
  flakes?: boolean;
  className?: string;
};

export function RustText({ text = "Rust never sleeps", duration = 14, start = 0.15, brush = 30, flakes = true, className }: RustTextProps) {
  const reduce = useReducedMotion();
  const textRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ duration, brush, flakes, reduce });
  useEffect(() => {
    live.current = { duration, brush, flakes, reduce };
  });

  useEffect(() => {
    const el = textRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!el || !canvas || !ctx) return;

    let frame = 0;
    let visible = true;
    let cleanup = () => {};
    let cancelled = false;
    let resumeRef = () => {};

    const build = () => {
      cleanup();
      const style = getComputedStyle(el);
      const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const em = parseFloat(style.fontSize);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Canvas text ignores CSS letter-spacing unless told, so pass it on,
      // and size to whichever of the two is wider.
      const probe = document.createElement("canvas").getContext("2d");
      if (!probe) return;
      probe.font = font;
      if ("letterSpacing" in probe) probe.letterSpacing = style.letterSpacing;
      const cssW = Math.ceil(Math.max(el.offsetWidth, probe.measureText(text).width)) + 4;
      const cssH = Math.ceil(el.offsetHeight + em * FALL);
      const w = Math.round(cssW * dpr);
      const h = Math.round(cssH * dpr);
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      // The glyphs, drawn where the browser puts the live text.
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = w;
      maskCanvas.height = h;
      const m = maskCanvas.getContext("2d", { willReadFrequently: true });
      if (!m) return;
      m.scale(dpr, dpr);
      m.font = font;
      if ("letterSpacing" in m) m.letterSpacing = style.letterSpacing;
      m.textBaseline = "alphabetic";
      const metrics = m.measureText(text);
      const ascent = metrics.fontBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent;
      const baseline = (el.offsetHeight - (ascent + descent)) / 2 + ascent;
      m.fillText(text, 2, baseline);
      const pixels = m.getImageData(0, 0, w, h).data;
      const glyphTop = (baseline - metrics.actualBoundingBoxAscent) * dpr;
      const glyphH = (metrics.actualBoundingBoxAscent + Math.max(1, metrics.actualBoundingBoxDescent)) * dpr;

      const cover = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) cover[i] = pixels[i * 4 + 3] / 255;
      const soft = blur(cover, w, h, Math.round(3 * dpr));

      const lookup = new Int32Array(w * h).fill(-1);
      const idx: number[] = [];
      for (let i = 0; i < w * h; i++) if (cover[i] > 0.01) idx.push(i);
      const count = idx.length;
      const index = Uint32Array.from(idx);
      const alpha = new Uint8Array(count);
      const onset = new Float32Array(count);
      const flakeN = new Float32Array(count);
      const metal = new Uint8Array(count * 3);
      const rust = new Uint8Array(count * 3);
      const age = new Float32Array(count);
      const shine = new Float32Array(count);
      const holed = new Uint8Array(count);
      const seed = 7;

      for (let k = 0; k < count; k++) {
        const i = index[k];
        lookup[i] = k;
        const x = (i % w) / dpr;
        const y = Math.floor(i / w) / dpr;
        alpha[k] = Math.round(cover[i] * 255);
        // Edges of a stroke start to turn first; its middle holds out longest.
        const n = clamp01((fbm(x / ONSET_SCALE, y / ONSET_SCALE, seed) - 0.22) / 0.56);
        onset[k] = clamp01(n * 0.85 + (soft[i] - 0.5) * 0.55 + 0.05);
        flakeN[k] = fbm(x / FLAKE_SCALE, y / FLAKE_SCALE, seed + 101);

        // Brushed steel: a bright top, a dark horizon, a lighter bottom, with
        // fine horizontal grain.
        const py = clamp01((Math.floor(i / w) - glyphTop) / glyphH);
        let lum = py < 0.48 ? mix(236, 150, py / 0.48) : py < 0.56 ? mix(118, 128, (py - 0.48) / 0.08) : mix(168, 222, (py - 0.56) / 0.44);
        lum += (noise(x / 70, y * 1.6, seed + 3) - 0.5) * 26 + (hash(i, 0, seed) - 0.5) * 6;
        metal[k * 3] = clamp01(lum / 255) * 255;
        metal[k * 3 + 1] = clamp01((lum + 1) / 255) * 255;
        metal[k * 3 + 2] = clamp01((lum + 7) / 255) * 255;

        const t = clamp01((fbm(x / TINT_SCALE, y / TINT_SCALE, seed + 51) - 0.25) / 0.5);
        const grain = 0.85 + hash(i, 1, seed) * 0.3;
        const lo = t < 0.5 ? RUST[0] : RUST[1];
        const hi = t < 0.5 ? RUST[1] : RUST[2];
        const f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
        for (let c = 0; c < 3; c++) rust[k * 3 + c] = Math.min(255, mix(lo[c], hi[c], f) * grain);

        age[k] = start;
      }

      const image = ctx.createImageData(w, h);
      const data = image.data;
      const bits: Flake[] = [];
      const pointer = { x: -1e4, y: -1e4, on: false };
      let last = performance.now();

      const polish = (cx: number, cy: number) => {
        const R = live.current.brush * dpr;
        const x0 = Math.max(0, Math.floor(cx - R));
        const x1 = Math.min(w - 1, Math.ceil(cx + R));
        const y0 = Math.max(0, Math.floor(cy - R));
        const y1 = Math.min(h - 1, Math.ceil(cy + R));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const k = lookup[y * w + x];
            if (k < 0) continue;
            const d = ((x - cx) ** 2 + (y - cy) ** 2) / (R * R);
            if (d >= 1) continue;
            const fall = 1 - d;
            age[k] = Math.max(0, age[k] - 0.16 * fall);
            if (fall > shine[k]) shine[k] = fall;
          }
        }
      };

      const onMove = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * dpr;
        const y = (e.clientY - rect.top) * dpr;
        // Stamp along the path so a fast swipe polishes a continuous streak.
        if (pointer.on) {
          const step = live.current.brush * dpr * 0.3;
          const dist = Math.hypot(x - pointer.x, y - pointer.y);
          const n = Math.min(40, Math.ceil(dist / step));
          for (let s = 1; s <= n; s++) polish(pointer.x + ((x - pointer.x) * s) / n, pointer.y + ((y - pointer.y) * s) / n);
        } else polish(x, y);
        pointer.x = x;
        pointer.y = y;
        pointer.on = true;
      };
      const onLeave = () => {
        pointer.on = false;
      };
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerleave", onLeave);

      const tick = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const { duration: life, flakes: flaking, reduce: still } = live.current;
        const grow = dt / Math.max(1, life);
        const spec = 2 * (90 * dpr) ** 2;

        for (let k = 0; k < count; k++) {
          const i = index[k];
          const ag = (age[k] = Math.min(3, age[k] + grow));
          const o = i * 4;

          // Old enough and on a flaky spot: this bit has come away.
          if (flaking && flakeN[k] > 0.56 && ag > 1.15 + (1 - flakeN[k]) * 1.4) {
            if (!holed[k]) {
              holed[k] = 1;
              if (!still && bits.length < MAX_FLAKES && Math.random() < 0.012) {
                bits.push({
                  x: i % w,
                  y: Math.floor(i / w),
                  vx: (Math.random() - 0.5) * 30 * dpr,
                  vy: -Math.random() * 30 * dpr,
                  life: 1,
                  c: `rgb(${rust[k * 3]} ${rust[k * 3 + 1]} ${rust[k * 3 + 2]})`,
                });
              }
            }
            data[o + 3] = 0;
            continue;
          }
          holed[k] = 0;

          const r = clamp01((ag - onset[k] * 0.8) / 0.2);
          // Older rust darkens, and the front where it meets the metal is pitted.
          const deep = 1 - clamp01((ag - 1) / 1.6) * 0.38;
          const pit = 1 - 4 * r * (1 - r) * 0.22;
          let light = shine[k] * 0.5;
          if (pointer.on) light += Math.exp(-(((i % w) - pointer.x) ** 2) / spec) * 0.22 * (1 - r);
          for (let c = 0; c < 3; c++) {
            const v = mix(metal[k * 3 + c], rust[k * 3 + c] * deep, r) * pit;
            data[o + c] = v + (255 - v) * light;
          }
          data[o + 3] = alpha[k];
          if (shine[k] > 0) shine[k] = Math.max(0, shine[k] - dt * 1.6);
        }
        ctx.putImageData(image, 0, 0);

        const g = 1100 * dpr;
        const size = 1.5 * dpr;
        for (let b = bits.length - 1; b >= 0; b--) {
          const p = bits[b];
          p.vy += g * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt * 0.9;
          if (p.life <= 0 || p.y > h) {
            bits.splice(b, 1);
            continue;
          }
          ctx.globalAlpha = Math.min(1, p.life * 1.5);
          ctx.fillStyle = p.c;
          ctx.fillRect(p.x, p.y, size, size);
        }
        ctx.globalAlpha = 1;

        frame = visible ? requestAnimationFrame(tick) : 0;
      };

      const resume = () => {
        if (frame || !visible) return;
        last = performance.now();
        frame = requestAnimationFrame(tick);
      };
      resumeRef = resume;
      resume();

      cleanup = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerleave", onLeave);
      };
    };

    // Off screen, the metal waits.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) resumeRef();
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => {
      if (!cancelled) build();
    });

    // Observing fires once straight away, which does the first build.
    document.fonts.ready.then(() => {
      if (!cancelled) ro.observe(el);
    });

    return () => {
      cancelled = true;
      io.disconnect();
      ro.disconnect();
      cleanup();
    };
  }, [text, start]);

  return (
    <span className={cn(SIZE, "relative inline-block whitespace-nowrap font-semibold tracking-tight", className)}>
      {/* Holds the layout and the words for screen readers; the canvas draws them. */}
      <span ref={textRef} className="text-transparent">
        {text}
      </span>
      <canvas ref={canvasRef} aria-hidden className="absolute left-[-2px] top-0 touch-none" />
    </span>
  );
}
