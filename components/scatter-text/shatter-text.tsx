"use client";

import { useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";

// ─── Default Phrases ──────────────────────────────────────────────────────────
export const DEFAULT_PHRASES = [
  "Thinking...",
  "Processing...",
  "Reasoning...",
  "Analyzing...",
  "Computing...",
  "Understanding...",
];

// ─── Component Props ──────────────────────────────────────────────────────────
export interface ShatterTextProps {
  /**
   * Phrases to cycle through.
   * Default: DEFAULT_PHRASES
   */
  phrases?: string[];

  /**
   * Tailwind classes to style the container (sizing, font-size, font-weight, text-color, background, borders, etc.).
   * Automatically inherits `color`, `fontSize`, `fontWeight`, and `fontFamily` from Tailwind classes!
   */
  className?: string;

  /**
   * Additional style for the container element.
   */
  style?: React.CSSProperties;

  /**
   * Additional class name for the internal canvas element.
   */
  canvasClassName?: string;

  /**
   * Explicit base text color override (e.g. "#27272a", "rgb(59, 130, 246)").
   * If omitted, inherits from Tailwind `className` (e.g. `text-zinc-600`, `text-indigo-500`).
   */
  color?: string;

  /**
   * In-flight particle color override while scattered.
   * If omitted, auto-generated based on lightness of base color.
   */
  flightColor?: string;

  /**
   * Peak scatter wave glow color override.
   * If omitted, defaults to an electric cyan/blue or harmonic accent.
   */
  glowColor?: string;

  /**
   * Shimmer sweep highlight color override.
   * If omitted, auto-generated as a bright highlight.
   */
  shimmerColor?: string;

  /**
   * Explicit font size in pixels. If omitted, inherits from Tailwind (e.g. `text-2xl`, `text-4xl`) or defaults to 42px.
   */
  fontSize?: number;

  /**
   * Explicit font family. If omitted, inherits from Tailwind (e.g. `font-mono`) or defaults to "Inter, system-ui, sans-serif".
   */
  fontFamily?: string;

  /**
   * Explicit font weight. If omitted, inherits from Tailwind (e.g. `font-medium`, `font-semibold`) or defaults to "500".
   */
  fontWeight?: string | number;

  /**
   * Duration in seconds to hold each phrase before initiating the shatter transition.
   * Default: 2.1
   */
  displayDuration?: number;

  /**
   * Speed of the shatter & construct wave (progress units per second).
   * Default: 0.7
   */
  waveSpeed?: number;

  /**
   * Seconds each character pauses in its scattered state before constructing into the next character.
   * Default: 0 (smooth continuous ripple)
   */
  scatterHold?: number;

  /**
   * Shimmer sweep speed across the text during display mode.
   * Default: 0.65
   */
  shimmerSpeed?: number;

  /**
   * Width of the shimmer light beam in CSS pixels.
   * - Smaller values (e.g. 40–80) give a sharp, focused laser gleam.
   * - Larger values (e.g. 150–300) give a broad, soft sheen.
   * Default: 120
   */
  shimmerWidth?: number;

  /**
   * Total particles sampled across the text.
   * Default: 12000
   */
  particleCount?: number;

  /**
   * Scatter radius range [min, max] in CSS pixels for particles in chaos state.
   * Default: [20, 50]
   */
  scatterRadius?: [number, number];

  /**
   * Text alignment within the canvas ("center" | "left" | "right").
   * Default: "center"
   */
  textAlign?: "center" | "left" | "right";

  /**
   * Drives transitions from outside. When set, the phrase no longer advances
   * on a timer; each change to this value shatters into the next phrase.
   * Default: undefined (advance every `displayDuration` seconds)
   */
  trigger?: number;

  /**
   * Whether the shimmer sweep runs while a phrase is displayed.
   * Default: true
   */
  shimmer?: boolean;
}

// ─── Shaders ──────────────────────────────────────────────────────────────────
const GLSL_DELAY     = 0.56;
const GLSL_RAMP_SHAT = 0.20;
const GLSL_RAMP_CONS = 0.28;

const VERT = /* glsl */ `
precision mediump float;

attribute vec2  a_cur;     // pixel pos in current text
attribute vec2  a_nxt;     // pixel pos in next text
attribute vec2  a_chaos;   // midpoint local scatter pos
attribute float a_ccx;     // current char progress [0, 1]
attribute float a_ncx;     // next char progress [0, 1]
attribute float a_seed;

uniform vec2  u_res;
uniform float u_wave;      // < 0 = display;  0→MAX_WAVE = transition
uniform float u_hold;      // wave-units each char waits between shatter-end and construct-start
uniform float u_pt_scale;  // particle size multiplier based on font size

varying float v_chaos;
varying float v_glow;
varying float v_alpha;

const float DELAY     = 0.56;
const float RAMP_SHAT = 0.20;
const float RAMP_CONS = 0.28;

void main() {
  float w = max(u_wave, 0.0);

  // Left-to-right character shatter
  float rs = clamp((w - a_ccx * DELAY) / RAMP_SHAT, 0.0, 1.0);
  float char_shatter_end = a_ccx * DELAY + RAMP_SHAT;

  // Matching left-to-right character construction
  float rc = clamp((w - char_shatter_end - u_hold) / RAMP_CONS, 0.0, 1.0);

  // Smooth Hermite curves
  float s = rs * rs * (3.0 - 2.0 * rs);   // shatter   0→1
  float c = rc * rc * (3.0 - 2.0 * rc);   // construct 0→1

  // Chaos intensity: 0 = assembled, 1 = peak scatter
  float ct = s * (1.0 - c);
  ct = ct * ct * (3.0 - 2.0 * ct);
  v_chaos = ct;

  // Transition positions
  vec2 shat_pos = mix(a_cur,   a_chaos, s);
  vec2 cons_pos = mix(a_chaos, a_nxt,   c);
  vec2 pos = mix(shat_pos, cons_pos, step(0.0001, c));

  vec2 clip = (pos / u_res) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);

  // Particle size scaled with font scale
  float sz = (3.4 + a_seed * 0.4 + ct * (3.2 + a_seed * 3.0)) * u_pt_scale;
  gl_PointSize = clamp(sz, 2.0, 24.0);

  // Glow: chars glow during active scatter wave
  v_glow = ct * 0.9;

  // Active particle alpha: particles emerge as solid character dissolves,
  // and disappear as solid character reconstructs, eliminating all assembled blur/gaps.
  float p_in  = smoothstep(0.02, 0.22, s);
  float p_out = 1.0 - smoothstep(0.75, 0.98, c);
  v_alpha = p_in * p_out;
}
`;

const FRAG = /* glsl */ `
precision mediump float;

uniform vec3 u_color_base;
uniform vec3 u_color_flight;
uniform vec3 u_color_glow;

varying float v_chaos;
varying float v_glow;
varying float v_alpha;

void main() {
  if (v_alpha < 0.01) discard;

  vec2  uv = gl_PointCoord - 0.5;
  float d  = length(uv);

  float crisp = smoothstep(0.5, 0.42, d);
  float soft  = exp(-d * d * 6.0);
  float shape = mix(crisp, soft, v_chaos);

  if (shape < 0.01) discard;

  vec3 col = mix(u_color_base,   u_color_flight, v_chaos * 0.6);
  col      = mix(col,            u_color_glow,   v_glow * 0.55);

  float a = shape * v_alpha;
  // Premultiplied alpha output for clean compositing
  gl_FragColor = vec4(col * a, a);
}
`;

// ─── Color Helpers ────────────────────────────────────────────────────────────
let _colorCtx: CanvasRenderingContext2D | null = null;

function parseCssColor(colorStr: string, fallback: [number, number, number]): [number, number, number] {
  if (typeof document === "undefined" || !colorStr) return fallback;
  try {
    if (!_colorCtx) {
      const cvs = document.createElement("canvas");
      cvs.width = 1;
      cvs.height = 1;
      _colorCtx = cvs.getContext("2d", { willReadFrequently: true });
    }
    if (!_colorCtx) return fallback;
    _colorCtx.clearRect(0, 0, 1, 1);
    _colorCtx.fillStyle = colorStr;
    _colorCtx.fillRect(0, 0, 1, 1);
    const data = _colorCtx.getImageData(0, 0, 1, 1).data;
    if (data[3] === 0 && colorStr !== "transparent") return fallback;
    return [data[0] / 255, data[1] / 255, data[2] / 255];
  } catch {
    return fallback;
  }
}

// ─── WebGL Helpers ────────────────────────────────────────────────────────────
function mkShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("[glsl]", gl.getShaderInfoLog(s));
  }
  return s;
}

function mkProg(gl: WebGLRenderingContext) {
  const p = gl.createProgram()!;
  gl.attachShader(p, mkShader(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, mkShader(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error("[prog]", gl.getProgramInfoLog(p));
  }
  return p;
}

function mkBuf(
  gl: WebGLRenderingContext,
  prog: WebGLProgram,
  name: string,
  size: number,
  data: Float32Array,
  dyn = false,
): WebGLBuffer {
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, name);
  if (loc >= 0) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  return buf;
}

function upBuf(gl: WebGLRenderingContext, buf: WebGLBuffer, data: Float32Array) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
}

// ─── Text Data Types ──────────────────────────────────────────────────────────
interface CharBound {
  char: string;
  cx_s: number;
  screenCx: number;
  frac: number;
}

interface SampleResult {
  text: string;
  pos: Float32Array;
  cx: Float32Array;
  bounds: CharBound[];
  totalW: number;
  targetCenterX: number;
}

// ─── Text Pixel Sampling ──────────────────────────────────────────────────────
function sampleText(
  text: string,
  W: number,
  H: number,
  dpr: number,
  fontSize: number,
  fontWeight: string | number,
  fontFamily: string,
  textAlign: "center" | "left" | "right",
  particleCount: number,
): SampleResult {
  const fontPx = Math.max(12, Math.round(fontSize * dpr));
  const fontStr = `${fontWeight} ${fontPx}px ${fontFamily}`;

  const oc = document.createElement("canvas");
  const ctx = oc.getContext("2d")!;
  ctx.font = fontStr;

  const chars = [...(text || " ")];
  const totalW = Math.max(1, ctx.measureText(text || " ").width);
  const SW = Math.max(100, Math.ceil(totalW + 60));
  const SH = Math.max(40, Math.ceil(fontPx * 2.4));

  oc.width = SW;
  oc.height = SH;
  ctx.clearRect(0, 0, SW, SH);
  ctx.font = fontStr;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let targetCenterX = W / 2;
  if (textAlign === "left") {
    targetCenterX = totalW / 2 + 24 * dpr;
  } else if (textAlign === "right") {
    targetCenterX = W - totalW / 2 - 24 * dpr;
  }
  const targetCenterY = H / 2;

  const startX = SW / 2 - totalW / 2;

  // Character bounds and horizontal progress
  const bounds: CharBound[] = chars.map((_, i) => {
    const w0 = i === 0 ? 0 : ctx.measureText(chars.slice(0, i).join("")).width;
    const w1 = ctx.measureText(chars.slice(0, i + 1).join("")).width;
    const cw = Math.max(1, w1 - w0);
    const cx_s = startX + w0 + cw / 2;
    return {
      char: chars[i],
      cx_s,
      screenCx: targetCenterX + (cx_s - SW / 2),
      frac: totalW > 0 ? (cx_s - startX) / totalW : 0.5,
    };
  });

  ctx.fillStyle = "#ffffff";
  ctx.fillText(text || " ", SW / 2, SH / 2);

  const img = ctx.getImageData(0, 0, SW, SH);

  // Group pixels strictly by character
  const charBuckets: { x: number; y: number }[][] = Array.from(
    { length: chars.length },
    () => [],
  );

  for (let py = 0; py < SH; py++) {
    for (let px = 0; px < SW; px++) {
      // Solid threshold: avoid collecting low-alpha blurred outskirts
      if (img.data[(py * SW + px) * 4 + 3] > 110) {
        let ci = 0;
        for (let i = 0; i < bounds.length; i++) {
          const w0 = i === 0 ? 0 : ctx.measureText(chars.slice(0, i).join("")).width;
          const w1 = ctx.measureText(chars.slice(0, i + 1).join("")).width;
          const x0 = startX + w0 - 1;
          const x1 = startX + w1 + 1;
          if (px >= x0 && px <= x1) {
            ci = i;
            break;
          }
        }
        charBuckets[ci].push({ x: px, y: py });
      }
    }
  }

  let totalSampledPixels = charBuckets.reduce((sum, b) => sum + b.length, 0);
  if (totalSampledPixels === 0) {
    charBuckets[0].push({ x: SW / 2, y: SH / 2 });
    totalSampledPixels = 1;
  }

  // Shuffle pixels locally within each character for organic distribution
  for (let ci = 0; ci < chars.length; ci++) {
    const b = charBuckets[ci];
    for (let i = b.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [b[i], b[j]] = [b[j], b[i]];
    }
  }

  // Allocate particle count per character
  const charPartCounts = charBuckets.map((b) =>
    Math.round((b.length / totalSampledPixels) * particleCount),
  );

  const allocated = charPartCounts.reduce((a, b) => a + b, 0);
  const diff = particleCount - allocated;
  if (diff !== 0) {
    let maxIdx = 0;
    for (let i = 1; i < charPartCounts.length; i++) {
      if (charPartCounts[i] > charPartCounts[maxIdx]) maxIdx = i;
    }
    charPartCounts[maxIdx] += diff;
  }

  const pos = new Float32Array(particleCount * 2);
  const cx  = new Float32Array(particleCount);

  let outIdx = 0;
  for (let ci = 0; ci < chars.length; ci++) {
    const count = charPartCounts[ci];
    const b = charBuckets[ci];
    if (count <= 0 || b.length === 0) continue;

    for (let k = 0; k < count; k++) {
      if (outIdx >= particleCount) break;
      const p = b[k % b.length];
      const jx = k >= b.length ? (Math.random() - 0.5) * 0.8 : 0;
      const jy = k >= b.length ? (Math.random() - 0.5) * 0.8 : 0;

      pos[outIdx * 2]     = targetCenterX + (p.x - SW / 2) + jx;
      pos[outIdx * 2 + 1] = targetCenterY + (p.y - SH / 2) + jy;
      cx[outIdx]          = bounds[ci].frac;
      outIdx++;
    }
  }

  while (outIdx < particleCount) {
    pos[outIdx * 2]     = pos[(outIdx - 1) * 2];
    pos[outIdx * 2 + 1] = pos[(outIdx - 1) * 2 + 1];
    cx[outIdx]          = cx[outIdx - 1];
    outIdx++;
  }

  return { text, pos, cx, bounds, totalW, targetCenterX };
}

// ─── Chaos Scatter ────────────────────────────────────────────────────────────
function genChaos(
  cur: Float32Array,
  nxt: Float32Array,
  dpr: number,
  scaleFactor: number,
  range: [number, number],
  particleCount: number,
): Float32Array {
  const lo = range[0] * dpr * scaleFactor;
  const hi = range[1] * dpr * scaleFactor;
  const out = new Float32Array(particleCount * 2);
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = lo + Math.random() * (hi - lo);
    const midX  = (cur[i * 2]     + nxt[i * 2])     * 0.5;
    const midY  = (cur[i * 2 + 1] + nxt[i * 2 + 1]) * 0.5;
    out[i * 2]     = midX + Math.cos(angle) * dist;
    out[i * 2 + 1] = midY + Math.sin(angle) * dist;
  }
  return out;
}

// ─── Crisp Text Rendering ─────────────────────────────────────────────────────
// Renders the solid, crisp text onto a 2D canvas with ZERO gaps, ZERO blur, and ZERO patches.
// When wave arrives at each character, the crisp character dissolves as WebGL particles emerge.
// When wave finishes constructing the new character, the new crisp character seamlessly solidifies.
function renderCrispText(
  ctx: CanvasRenderingContext2D,
  currentSample: SampleResult,
  nextSample: SampleResult | null,
  wave: number,
  shim: number,
  baseColorStr: string,
  shimmerColorStr: string,
  targetCenterY: number,
  fontStr: string,
  uHold: number,
  shimmerWidth: number = 120,
  shimmer: boolean = true,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.font = fontStr;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (wave < 0 || !nextSample) {
    // ── Display Mode: 100% solid, crisp text with continuous shimmer gleam ──
    ctx.fillStyle = baseColorStr;
    for (const b of currentSample.bounds) {
      ctx.fillText(b.char, b.screenCx, targetCenterY);
    }
    if (!shimmer) return;

    const sw = currentSample.totalW;
    const startX = currentSample.targetCenterX - sw / 2;
    const shimX = startX + shim * sw;
    const halfW = Math.max(8, shimmerWidth / 2);
    const shimGrad = ctx.createLinearGradient(
      shimX - halfW,
      targetCenterY,
      shimX + halfW,
      targetCenterY,
    );
    shimGrad.addColorStop(0.0, "rgba(255,255,255,0)");
    shimGrad.addColorStop(0.5, shimmerColorStr);
    shimGrad.addColorStop(1.0, "rgba(255,255,255,0)");

    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = shimGrad;
    ctx.fillRect(startX - 20, targetCenterY - 80, sw + 40, 160);
    ctx.restore();
    return;
  }

  // ── Transition Mode ──
  // Current phrase characters dissolve as shatter hits
  for (const b of currentSample.bounds) {
    const charStart = b.frac * GLSL_DELAY;
    const alpha = Math.max(0, Math.min(1, 1.0 - (wave - charStart) / 0.08));
    if (alpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = baseColorStr;
      ctx.fillText(b.char, b.screenCx, targetCenterY);
      ctx.restore();
    }
  }

  // Next phrase characters solidify as construct finishes
  for (const b of nextSample.bounds) {
    const charShatEnd = b.frac * GLSL_DELAY + GLSL_RAMP_SHAT;
    const charConsEnd = charShatEnd + uHold + GLSL_RAMP_CONS;
    const alpha = Math.max(0, Math.min(1, (wave - (charConsEnd - 0.08)) / 0.08));
    if (alpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = baseColorStr;
      ctx.fillText(b.char, b.screenCx, targetCenterY);
      ctx.restore();
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ShatterText({
  phrases = DEFAULT_PHRASES,
  className,
  style,
  canvasClassName,
  color,
  flightColor,
  glowColor,
  shimmerColor,
  fontSize,
  fontFamily,
  fontWeight,
  displayDuration = 2.1,
  waveSpeed = 0.7,
  scatterHold = 0,
  shimmerSpeed = 0.65,
  shimmerWidth = 120,
  particleCount = 12000,
  scatterRadius = [20, 50],
  textAlign = "center",
  trigger,
  shimmer = true,
}: ShatterTextProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const textCanvasRef  = useRef<HTMLCanvasElement>(null);
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  // Read inside the render loop, so a new trigger value starts a transition
  // without tearing down the WebGL context.
  const triggerRef     = useRef(trigger);

  useEffect(() => {
    triggerRef.current = trigger;
  }, [trigger]);

  // Depend on the two numbers, not the array, so an inline `[min, max]` prop
  // doesn't rebuild the whole scene on every parent render.
  const [scatterMin, scatterMax] = scatterRadius;

  const phraseList = useMemo(
    () => (phrases.length > 0 ? phrases : DEFAULT_PHRASES),
    [phrases],
  );

  useEffect(() => {
    const container  = containerRef.current;
    const textCanvas = textCanvasRef.current;
    const canvas     = canvasRef.current;
    if (!container || !textCanvas || !canvas) return;

    const tCtx = textCanvas.getContext("2d");
    const gl   = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
    });
    if (!tCtx || !gl) return;

    const prog = mkProg(gl);
    gl.useProgram(prog);

    // Uniform locations
    const uRes         = gl.getUniformLocation(prog, "u_res")!;
    const uWave        = gl.getUniformLocation(prog, "u_wave")!;
    const uHold        = gl.getUniformLocation(prog, "u_hold")!;
    const uPtScale     = gl.getUniformLocation(prog, "u_pt_scale")!;
    const uColorBase   = gl.getUniformLocation(prog, "u_color_base")!;
    const uColorFlight = gl.getUniformLocation(prog, "u_color_flight")!;
    const uColorGlow   = gl.getUniformLocation(prog, "u_color_glow")!;

    // Extract computed styling from container to inherit Tailwind classes
    const computed = window.getComputedStyle(container);
    const computedColor = computed.color || "#27272a";
    const computedFontSize = parseFloat(computed.fontSize) || 42;
    const computedFontWeight = computed.fontWeight || "500";
    const computedFontFamily =
      computed.fontFamily || "Inter, system-ui, sans-serif";

    const effFontSize   = fontSize ?? (computedFontSize > 0 ? computedFontSize : 42);
    const effFontWeight = fontWeight ?? computedFontWeight;
    const effFontFamily = fontFamily ?? computedFontFamily;

    // Color resolution
    const baseColorStr = color || computedColor;
    const baseRgb = parseCssColor(baseColorStr, [0.153, 0.153, 0.165]);
    const [r, g, b] = baseRgb;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    const flightRgb = flightColor
      ? parseCssColor(flightColor, [0.42, 0.42, 0.46])
      : lum < 0.4
        ? ([r + (1 - r) * 0.35, g + (1 - g) * 0.35, b + (1 - b) * 0.35] as [number, number, number])
        : ([r * 0.75, g * 0.75, b * 0.75] as [number, number, number]);

    const glowRgb = glowColor
      ? parseCssColor(glowColor, [0.6, 0.8, 1.0])
      : lum < 0.25
        ? ([0.6, 0.8, 1.0] as [number, number, number])
        : ([
            Math.min(1, r * 1.35 + 0.15),
            Math.min(1, g * 1.35 + 0.15),
            Math.min(1, b * 1.35 + 0.15),
          ] as [number, number, number]);

    const shimmerColorStr = shimmerColor || (lum < 0.4 ? "rgba(240, 240, 255, 0.85)" : "rgba(255, 255, 255, 0.95)");

    gl.uniform3f(uColorBase,   baseRgb[0],   baseRgb[1],   baseRgb[2]);
    gl.uniform3f(uColorFlight, flightRgb[0], flightRgb[1], flightRgb[2]);
    gl.uniform3f(uColorGlow,   glowRgb[0],   glowRgb[1],   glowRgb[2]);

    gl.uniform1f(uHold, scatterHold * waveSpeed);

    // Dynamic point scale
    const ptScale = Math.min(Math.max((effFontSize * 1.0) / 42, 0.5), 2.2);
    gl.uniform1f(uPtScale, ptScale);

    // Stable per-particle seed
    const seedArr = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) seedArr[i] = Math.random();

    const z2 = new Float32Array(particleCount * 2);
    const z1 = new Float32Array(particleCount);

    const bCur   = mkBuf(gl, prog, "a_cur",   2, z2, true);
    const bNxt   = mkBuf(gl, prog, "a_nxt",   2, z2, true);
    const bChaos = mkBuf(gl, prog, "a_chaos", 2, z2, true);
    const bCCx   = mkBuf(gl, prog, "a_ccx",   1, z1, true);
    const bNCx   = mkBuf(gl, prog, "a_ncx",   1, z1, true);
    mkBuf(gl, prog, "a_seed", 1, seedArr);

    // Premultiplied alpha blending for clean WebGL compositing
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    let W = 0, H = 0, dpr = 1;
    let samples: SampleResult[] = [];
    let idx   = 0;
    let wave  = -0.1;
    let shim  = -0.2;
    let phase: "display" | "transition" = "display";
    let timer = 0;
    let curPos: Float32Array, curCx: Float32Array;
    let nxtPos: Float32Array, nxtCx: Float32Array;
    let raf   = 0;
    let isReady = false;
    let seenTrigger = triggerRef.current;

    const maxWave = GLSL_DELAY + GLSL_RAMP_SHAT + scatterHold * waveSpeed + GLSL_RAMP_CONS;

    function applySize(wPx: number, hPx: number) {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(wPx * dpr));
      H = Math.max(1, Math.round(hPx * dpr));

      textCanvas!.width  = W;
      textCanvas!.height = H;
      textCanvas!.style.width  = `${wPx}px`;
      textCanvas!.style.height = `${hPx}px`;

      canvas!.width  = W;
      canvas!.height = H;
      canvas!.style.width  = `${wPx}px`;
      canvas!.style.height = `${hPx}px`;

      gl!.viewport(0, 0, W, H);
      gl!.uniform2f(uRes, W, H);
    }

    function load(i: number) {
      if (!samples[i]) return;
      const r = samples[i];
      curPos = r.pos;
      curCx  = r.cx;
      nxtPos = r.pos;
      nxtCx  = r.cx;
      upBuf(gl!, bCur,   curPos);
      upBuf(gl!, bNxt,   nxtPos);
      upBuf(gl!, bCCx,   curCx);
      upBuf(gl!, bNCx,   nxtCx);
      upBuf(gl!, bChaos, curPos);
    }

    function startTrans() {
      if (phraseList.length <= 1) return;
      const ni = (idx + 1) % phraseList.length;
      nxtPos = samples[ni].pos;
      nxtCx  = samples[ni].cx;
      const chaos = genChaos(
        curPos,
        nxtPos,
        dpr,
        effFontSize / 42,
        [scatterMin, scatterMax],
        particleCount,
      );
      upBuf(gl!, bNxt,   nxtPos);
      upBuf(gl!, bNCx,   nxtCx);
      upBuf(gl!, bChaos, chaos);
      idx   = ni;
      wave  = 0;
      phase = "transition";
    }

    function endTrans() {
      curPos = nxtPos;
      curCx  = nxtCx;
      upBuf(gl!, bCur, curPos);
      upBuf(gl!, bCCx, curCx);
      upBuf(gl!, bNxt, nxtPos);
      wave  = -0.1;
      phase = "display";
      timer = 0;
    }

    let last = performance.now();

    function loop() {
      const now = performance.now();
      const dt = Math.min((now - last) * 0.001, 0.05);
      last = now;

      if (phase === "display") {
        timer += dt;
        shim  += dt * shimmerSpeed;
        if (shim > 1.25) shim = -0.25;
        if (triggerRef.current === undefined) {
          if (timer >= displayDuration && phraseList.length > 1) startTrans();
        } else if (triggerRef.current !== seenTrigger) {
          seenTrigger = triggerRef.current;
          startTrans();
        }
      } else {
        wave = Math.min(wave + dt * waveSpeed, maxWave);
        if (wave >= maxWave) endTrans();
      }

      // Render crisp solid text
      if (isReady && samples.length > 0) {
        const fontPx = Math.max(12, Math.round(effFontSize * dpr));
        const fontStr = `${effFontWeight} ${fontPx}px ${effFontFamily}`;
        const nextSample = phase === "transition" ? samples[idx] : null;
        const currentSample = phase === "transition"
          ? samples[(idx - 1 + phraseList.length) % phraseList.length]
          : samples[idx];

        renderCrispText(
          tCtx!,
          currentSample,
          nextSample,
          wave,
          shim,
          baseColorStr,
          shimmerColorStr,
          H / 2,
          fontStr,
          scatterHold * waveSpeed,
          shimmerWidth * dpr,
          shimmer,
        );
      }

      // Render WebGL particles during transition
      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.uniform1f(uWave, wave);

      if (phase === "transition") {
        gl!.drawArrays(gl!.POINTS, 0, particleCount);
      }

      raf = requestAnimationFrame(loop);
    }

    function sampleAllPhrases() {
      samples = phraseList.map((p) =>
        sampleText(
          p,
          W,
          H,
          dpr,
          effFontSize,
          effFontWeight,
          effFontFamily,
          textAlign,
          particleCount,
        ),
      );
    }

    const initialRect = container.getBoundingClientRect();
    const initW = initialRect.width  || window.innerWidth;
    const initH = initialRect.height || window.innerHeight;
    applySize(initW, initH);

    document.fonts.ready.then(() => {
      sampleAllPhrases();
      load(0);
      isReady = true;
      last = performance.now();
      raf  = requestAnimationFrame(loop);
    });

    let resizeTimer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            applySize(width, height);
            if (isReady) {
              sampleAllPhrases();
              load(idx);
              wave = -0.1;
              shim = -0.2;
              phase = "display";
              timer = 0;
            }
          }, 80);
        }
      }
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      ro.disconnect();
    };
  }, [
    phraseList,
    className,
    color,
    flightColor,
    glowColor,
    shimmerColor,
    fontSize,
    fontFamily,
    fontWeight,
    displayDuration,
    waveSpeed,
    scatterHold,
    shimmerSpeed,
    shimmerWidth,
    particleCount,
    scatterMin,
    scatterMax,
    textAlign,
    shimmer,
  ]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-full min-h-[120px] flex items-center justify-center overflow-hidden",
        className,
      )}
      style={style}
    >
      {/* Layer 1: Razor-sharp crisp text layer (zero gaps, zero patches, zero blur) */}
      <canvas
        ref={textCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none block"
      />
      {/* Layer 2: WebGL particle burst & transition layer */}
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute inset-0 w-full h-full pointer-events-none block",
          canvasClassName,
        )}
      />
    </div>
  );
}
export { ShatterText };
