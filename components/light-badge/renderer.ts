

/**
 * Shaders for the light badge.
 *
 * The shape is a rounded-rectangle signed distance field (SDF), so the fill and the stroke band
 * come from one distance value and stay aligned and antialiased at any size. Along the bottom:
 *  - the stroke carries a moving gradient that runs white-hot where the light is brightest and fades
 *    out round the curved ends (the rest of the outline is a plain hairline),
 *  - inside, a row of soft light waves rises from the edge and travels side to side,
 *  - below, short rays fall from the edge, white at their start and coloured as they fall.
 * Palette colours are blended in OKLab, so neighbouring hues never pass through a muddy grey.
 */

export const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform vec2 uSize;      // pill size, css px
uniform float uPad;      // canvas margin around the pill (room for the rays), css px
uniform float uRadius;   // corner radius, css px
uniform float uStroke;   // stroke width, css px
uniform float uRay;      // light-ray strength under the pill, 0 = off
uniform float uRayLen;   // how far the rays fall, css px
uniform float uAngle;    // gradient rotation, radians
uniform float uTime;     // animation time, seconds (runs faster while hovered)
uniform float uSweep;    // where the light sits along the bottom, -1 (left) .. 1 (right)
uniform float uHover;    // 0..1, eased: brightens the light while the pointer is over the badge
uniform float uIntro;    // 0..1, eased: the entrance, everything rising together like a sunrise
uniform int uWaves;      // how many inner waves (fewer on slow devices), up to 7
uniform vec3 uFill;      // pill fill colour (sRGB)
uniform vec3 uBorder;    // plain hairline round the rest of the pill (sRGB)
uniform vec3 uLab[6];    // gradient stops in OKLab, cyclic
uniform float uInner;    // strength of the inner waves, 0 = off
uniform float uOnLight;  // 1 on a light page: light shows as colour, not white glow
uniform int uMode;       // 0 = the badge, 1 = the light it casts onto content below
uniform vec4 uRegion;    // mode 1: area drawn, pill-centred css px (y up): x min, y min, width, height
uniform float uCast;     // mode 1: strength of the cast light
uniform float uCastLen;  // mode 1: how far the cast light reaches, css px

const float TAU = 6.28318530718;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 oklabToSrgb(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  float l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  vec3 lin = clamp(vec3(
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s), 0.0, 1.0);
  return mix(12.92 * lin, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
}

// cyclic palette, blended in OKLab: t in [0,1) walks the six stops and wraps back to the first
vec3 palette(float t) {
  float x = fract(t) * 6.0;
  int i = int(floor(x));
  float f = smoothstep(0.0, 1.0, fract(x));
  return oklabToSrgb(mix(uLab[i], uLab[(i + 1) % 6], f));
}

// the stroke's colour at a point on (or near) the outline
vec3 strokeColor(vec2 p) {
  vec2 q = p / (uSize * 0.5); // normalised to a circle so colour spreads evenly round the pill
  return palette((atan(q.y, q.x) - uAngle) / TAU);
}

// where the light is brightest along the bottom, clear of the rounded ends
float lightX() { return uSweep * (uSize.x * 0.5 - uRadius * 1.4); }

// how far the hottest light turns white. White light can't show on a white page, so on a light page
// the hot spot stays mostly colour (the light reads as tinted, like coloured light on paper)
float glowWhite() { return 1.0 - 0.8 * uOnLight; }

// the light the badge casts onto whatever sits below it (mode 1): the same rays, continued further,
// white where the light is hot and coloured as it travels, fading with distance
vec4 castLight(vec2 p, float sun, float boost) {
  float flat_ = uSize.x * 0.5 - uRadius;
  float belowLine = max(-p.y - uSize.y * 0.5, 0.0);
  if (belowLine <= 0.0) return vec4(0.0);
  float x0 = p.x / (1.0 + belowLine * 0.03);
  float ends = 1.0 - smoothstep(flat_ * 0.55, flat_ + uRadius * 0.7071, abs(x0));
  float hot0 = exp(-pow((x0 - lightX()) / (uSize.x * 0.24), 2.0));
  vec3 c = mix(strokeColor(vec2(x0, -uSize.y * 0.5)), vec3(1.0), 0.35 * hot0 * glowWhite());
  float fall = exp(-belowLine / uCastLen);
  float streaks = 0.62 + 0.38 * sin(x0 * 0.24 + 1.4 * sin(x0 * 0.05 + uTime * 0.5));
  float a = clamp(uCast * boost * sun * fall * ends * streaks * (0.55 + 0.45 * hot0), 0.0, 1.0);
  return vec4(c * a, a); // premultiplied
}

void main() {
  // entrance: like a sunrise, the whole light (stroke, waves, rays, cast light) rises from nothing
  // to full intensity at once; the waves also grow up from the edge as it brightens
  float sun = uIntro;
  float boost = 1.0 + 0.4 * uHover;
  if (uMode == 1) {
    vec2 q = uRegion.xy + vUv * uRegion.zw;
    vec4 l = castLight(q, sun, boost);
    outColor = l;
    return;
  }
  vec2 full = uSize + 2.0 * uPad;
  vec2 p = (vUv - 0.5) * full;               // css px, centred on the pill (y up)
  float d = sdRoundBox(p, uSize * 0.5, uRadius);
  float aa = fwidth(d);                      // one device pixel, in css px

  vec3 col = strokeColor(p);
  float inside = 1.0 - smoothstep(-aa, aa, d);                       // the pill
  float band = inside * smoothstep(-uStroke - aa, -uStroke + aa, d); // stroke: the outer uStroke px
  vec3 rgb = uFill;

  float fromBottom = p.y + uSize.y * 0.5;    // 0 at the bottom edge
  float spread = exp(-pow((p.x - lightX()) / (uSize.x * 0.24), 2.0)); // bell round the hot spot
  float n1 = noise(vec2(p.x * 0.03 + uTime * 0.35, uTime * 0.25));
  float n2 = noise(vec2(p.x * 0.07 - uTime * 0.5, 4.0 + uTime * 0.3));
  float breathe = 0.6 + 0.4 * (0.6 * n1 + 0.4 * n2);

  // inner waves: soft domes rising from the edge, each with its own colour, width and rhythm. The
  // row travels side to side with the light; waves sit on a loop a little wider than the pill, so
  // one leaving an end is already re-entering from the other, out of sight
  vec3 waveSum = vec3(0.0);
  float waveW = 0.0;
  float nW = float(uWaves);
  float loopW = uSize.x * 1.2;
  for (int i = 0; i < 7; i++) {
    if (i >= uWaves) break;
    float fi = float(i);
    float xi = (fi / nW - 0.5) * loopW + uSweep * uSize.x * 0.45
             + sin(uTime * (0.32 + 0.07 * fi) + fi * 1.7) * uSize.x * 0.03;
    xi = mod(xi + loopW * 0.5, loopW) - loopW * 0.5;
    // fewer waves (slow devices) are wider, so the row still covers the bottom
    float wi = uSize.x * (0.085 + 0.04 * hash(vec2(fi, 3.1))) * (7.0 / nW);
    float hi = uSize.y * (0.28 + 0.3 * (0.5 + 0.5 * sin(uTime * (0.55 + 0.11 * fi) + fi * 2.3)));
    hi *= 0.35 + 0.65 * sun;                // waves rise as the light comes up
    vec2 dv = vec2((p.x - xi) / wi, fromBottom / hi);
    float e = exp(-dot(dv, dv) * 1.3);
    waveSum += palette(fi / nW + uTime * 0.03) * e;
    waveW += e;
  }
  vec3 waveCol = waveSum / max(waveW, 1e-4);
  float core = exp(-fromBottom / 1.6);      // thin white core hugging the edge
  vec3 glowCol = mix(waveCol, vec3(1.0), clamp(core / (core + waveW * 0.6 + 1e-4), 0.0, 1.0) * 0.6 * glowWhite());
  float base = 0.18 * exp(-fromBottom / (uSize.y * 0.22));
  float amount = uInner * (1.0 + 0.35 * uOnLight) * boost * sun *
    ((min(waveW, 1.2) + base) * (0.55 + 0.6 * spread) * breathe + core * 0.9 * spread);
  amount = clamp(amount, 0.0, 1.0) * inside;
  rgb = mix(rgb, glowCol, amount);

  // stroke: gradient on the bottom only, fading out round the curved ends; plain hairline elsewhere.
  // Where the light is brightest it runs white-hot
  float rise = fromBottom / uRadius;
  float bottomOnly = (1.0 - smoothstep(0.08, 0.95, rise)) * sun;
  vec3 hot = mix(col, vec3(1.0), clamp(0.4 * spread * boost, 0.0, 1.0) * glowWhite());
  rgb = mix(rgb, mix(uBorder, hot, bottomOnly), band);

  // rays: each starts on the bottom outline and fans outward as it falls (measured from its origin,
  // so there is no seam where the curve turns steep); white at the start, coloured as it falls
  float ray = 0.0;
  vec3 rayCol = vec3(0.0);
  float flat_ = uSize.x * 0.5 - uRadius;
  float belowLine = max(-p.y - uSize.y * 0.5, 0.0);
  float x0 = p.x / (1.0 + belowLine * 0.03);
  float ax0 = min(max(abs(x0) - flat_, 0.0), uRadius * 0.75);
  float edgeY0 = -(uSize.y * 0.5 - uRadius) - sqrt(uRadius * uRadius - ax0 * ax0);
  float below = edgeY0 - p.y;
  if (below > 0.0) {
    float hot0 = exp(-pow((x0 - lightX()) / (uSize.x * 0.24), 2.0));
    rayCol = mix(strokeColor(vec2(x0, edgeY0)), vec3(1.0), 0.45 * hot0 * exp(-below / 4.0) * glowWhite());
    float fall = exp(-below / uRayLen) * smoothstep(0.0, 1.5, below);
    float ends = 1.0 - smoothstep(flat_ * 0.55, flat_ + uRadius * 0.7071, abs(x0));
    float streaks = 0.74 + 0.26 * sin(x0 * 0.24 + 1.4 * sin(x0 * 0.05 + uTime * 0.5));
    vec2 halfFull = full * 0.5;
    float edgeFade = (1.0 - smoothstep(halfFull.x - uPad * 0.9, halfFull.x - 1.0, abs(p.x)))
                   * (1.0 - smoothstep(halfFull.y - uPad * 0.7, halfFull.y - 1.0, -p.y));
    ray = uRay * (1.0 + 0.5 * uOnLight) * boost * fall * ends * streaks * edgeFade * sun * (1.0 - inside);
    ray = clamp(ray, 0.0, 1.0);
  }

  // premultiplied: the pill, then the rays beneath it
  outColor = vec4(rgb * inside + rayCol * ray, inside + ray);
}`;

/**
 * One shared WebGL2 renderer for every light badge on the page.
 *
 * Browsers cap live WebGL contexts (about 16), so badges don't each get one. Instead a single
 * offscreen context draws each badge in turn and copies the result into that badge's own 2D canvas,
 * which keeps every badge in its normal place in the page (text on top, no overlay).
 *
 * Robustness and cost:
 *  - only badges on screen are drawn, and nothing runs while the tab is hidden,
 *  - if frames run slow, quality drops once (fewer waves, lower resolution),
 *  - a lost GPU context is rebuilt automatically when the browser restores it,
 *  - with reduced motion each badge is drawn once, as a calm still frame.
 */

export type BadgeOptions = {
  stroke: number;
  radius: number;
  ray: number;
  rayLength: number;
  inner: number;
  pad: number;
  period: number;
  fill: string;
  darkFill: string;
  border: string;
  darkBorder: string;
  colors: string[];
  hover: boolean; // brighten and speed up while the pointer is over the badge
  hoverIntensity: number; // how much brighter the light gets while hovered (0.4 = 40%)
  hoverSpeed: number; // how much faster the waves run while hovered (0.45 = 45%)
  follow: boolean; // the light leans toward a nearby pointer
  followStrength: number; // how far the light leans toward the pointer, 0..1 of the way
  followRange: number; // css px: how near the pointer must be for the light to notice it
  cast: number; // strength of the light cast onto content below (0 = off)
  castLength: number; // how far that light reaches, css px
};

type Item = {
  el: HTMLElement;
  out: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  opts: BadgeOptions;
  // palette in OKLab, for dark pages and (deeper, richer) light pages. On a preset change the
  // colours cross-fade from the `from` set to the `to` set over PALETTE_FADE seconds
  lab: { from: Float32Array; to: Float32Array };
  labLight: { from: Float32Array; to: Float32Array };
  paletteStart: number; // when the current cross-fade began, seconds
  w: number;
  h: number;
  bw: number; // backing size, device px
  bh: number;
  visible: boolean;
  cast: {
    out: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    bw: number;
    bh: number;
    mask: HTMLCanvasElement | null; // the content's text, so the light lands on the letters only
    maskKey: string;
  } | null; // a canvas over content below that catches the light
  // animation state
  start: number; // for the entrance
  time: number; // animation clock (runs faster while hovered)
  hover: number; // eased 0..1
  follow: number; // eased 0..1: how much the light follows the pointer
  sweep: number; // eased -1..1
};

/* ---------------- colour: sRGB hex -> OKLab (blended in the shader) ---------------- */

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const hexRgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const toOklab = (h: string) => {
  const [r, g, b] = hexRgb(h).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

/** The same hues, darker and more saturated: pale colours wash out on a white page. */
const deepen = (colors: string[]) =>
  new Float32Array(
    colors.slice(0, 6).flatMap((h) => {
      const [L, a, b] = toOklab(h);
      return [L - 0.1, a * 1.35, b * 1.35];
    }),
  );

const plain = (colors: string[]) =>
  new Float32Array(colors.slice(0, 6).flatMap(toOklab));

/* ---------------------------------- timing ---------------------------------- */

const easeInOutSine = (u: number) => -(Math.cos(Math.PI * u) - 1) / 2;
// sunrise: starts imperceptibly, swells through the middle, settles gently at full
const easeSunrise = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * x * (x * (x * 6 - 15) + 10);
};
const approach = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

const INTRO = 2.4; // seconds for the entrance
const FRAME_MS = 1000 / 60; // frame cap, see frame()
const PALETTE_FADE = 0.8; // seconds for a colour preset to cross-fade into the next

/** The palette at time `now`: an eased OKLab blend from the old colours to the new. */
const paletteAt = (
  p: { from: Float32Array; to: Float32Array },
  start: number,
  now: number,
) => {
  const t = easeSunrise((now - start) / PALETTE_FADE);
  if (t >= 1) return p.to;
  const out = new Float32Array(p.to.length);
  for (let i = 0; i < out.length; i++)
    out[i] = p.from[i] + (p.to[i] - p.from[i]) * t;
  return out;
};

/* --------------------------------- renderer --------------------------------- */

class Renderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private items = new Set<Item>();
  private raf = 0;
  private last = 0;
  private due = 0; // earliest time of the next drawn frame, under FRAME_MS
  private lost = false;
  private pointer: { x: number; y: number } | null = null;
  private reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  // quality: drops once if the first frames run slow
  private fontsVersion = 0;
  private lowQuality = false;
  private sampleSum = 0;
  private samples = 0;
  private io: IntersectionObserver;
  private ro: ResizeObserver;
  private mo: MutationObserver;

  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.init();

    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault(); // tell the browser we want it back
      this.lost = true;
      this.stop();
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.lost = false;
      this.init();
      this.redrawAll();
      this.kick();
    });

    this.io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const it = this.find(e.target);
          if (it) it.visible = e.isIntersecting;
        }
        this.kick();
      },
      { rootMargin: "64px" },
    );
    this.ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const it = this.find(e.target);
        if (it) this.measure(it);
      }
      this.redrawAll();
    });
    // theme follows the `dark` class on <html>
    this.mo = new MutationObserver(() => this.redrawAll());
    this.mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    window.addEventListener(
      "pointermove",
      (e) => (this.pointer = { x: e.clientX, y: e.clientY }),
      {
        passive: true,
      },
    );
    document.documentElement.addEventListener(
      "pointerleave",
      () => (this.pointer = null),
    );
    document.fonts?.addEventListener("loadingdone", () => {
      this.fontsVersion++;
      this.redrawAll();
    });
    document.addEventListener("visibilitychange", () =>
      document.hidden ? this.stop() : this.kick(),
    );
  }

  static create() {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", {
      premultipliedAlpha: true,
      antialias: false,
      alpha: true,
    });
    if (!gl) return null;
    return new Renderer(canvas, gl);
  }

  private init() {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog) ?? "link error");
    gl.useProgram(prog);
    this.prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const a = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

    const names = [
      "uSize",
      "uPad",
      "uRadius",
      "uStroke",
      "uRay",
      "uRayLen",
      "uAngle",
      "uTime",
      "uSweep",
      "uHover",
      "uIntro",
      "uWaves",
      "uFill",
      "uBorder",
      "uLab[0]",
      "uInner",
      "uOnLight",
      "uMode",
      "uRegion",
      "uCast",
      "uCastLen",
    ];
    this.loc = Object.fromEntries(
      names.map((n) => [n, gl.getUniformLocation(prog, n)]),
    );
    gl.clearColor(0, 0, 0, 0);
  }

  /* ---------- items ---------- */

  add(el: HTMLElement, out: HTMLCanvasElement, opts: BadgeOptions) {
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    const it: Item = {
      el,
      out,
      ctx,
      opts,
      lab: { from: plain(opts.colors), to: plain(opts.colors) },
      labLight: { from: deepen(opts.colors), to: deepen(opts.colors) },
      paletteStart: 0,
      w: 0,
      h: 0,
      bw: 0,
      bh: 0,
      visible: true,
      cast: null,
      start: performance.now() / 1000,
      time: 0,
      hover: 0,
      follow: 0,
      sweep: 0,
    };
    this.items.add(it);
    this.measure(it);
    this.io.observe(el);
    this.ro.observe(el);
    this.draw(it, performance.now() / 1000);
    this.kick();
    return it;
  }

  update(it: Item, opts: BadgeOptions) {
    const now = performance.now() / 1000;
    if (opts.colors.join() !== it.opts.colors.join()) {
      // start from wherever the colours are right now, so switching mid-fade never jumps
      it.lab = {
        from: paletteAt(it.lab, it.paletteStart, now),
        to: plain(opts.colors),
      };
      it.labLight = {
        from: paletteAt(it.labLight, it.paletteStart, now),
        to: deepen(opts.colors),
      };
      it.paletteStart = this.reduceMotion ? -Infinity : now;
    }
    it.opts = opts;
    this.measure(it);
    this.draw(it, now);
    this.kick();
  }

  /** Point the light this badge casts at a canvas laid over content below it (or null to stop). */
  setCast(it: Item, out: HTMLCanvasElement | null) {
    const ctx = out?.getContext("2d") ?? null;
    it.cast =
      out && ctx ? { out, ctx, bw: 0, bh: 0, mask: null, maskKey: "" } : null;
    this.draw(it, performance.now() / 1000);
  }

  remove(it: Item) {
    this.items.delete(it);
    this.io.unobserve(it.el);
    this.ro.unobserve(it.el);
    if (!this.items.size) this.stop();
  }

  private find(el: Element) {
    for (const it of this.items) if (it.el === el) return it;
    return null;
  }

  private dpr() {
    return Math.min(window.devicePixelRatio || 1, this.lowQuality ? 1.5 : 2);
  }

  private measure(it: Item) {
    const r = it.el.getBoundingClientRect();
    const { pad } = it.opts;
    it.w = r.width;
    it.h = r.height;
    const dpr = this.dpr();
    it.bw = Math.max(1, Math.round((r.width + 2 * pad) * dpr));
    it.bh = Math.max(1, Math.round((r.height + 2 * pad) * dpr));
    it.out.style.width = `${r.width + 2 * pad}px`;
    it.out.style.height = `${r.height + 2 * pad}px`;
    if (it.out.width !== it.bw || it.out.height !== it.bh) {
      it.out.width = it.bw;
      it.out.height = it.bh;
    }
  }

  /* ---------- loop ---------- */

  private kick() {
    if (
      this.raf ||
      this.lost ||
      this.reduceMotion ||
      document.hidden ||
      !this.items.size
    )
      return;
    this.last = performance.now();
    this.due = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame = (now: number) => {
    this.raf = 0;
    // At most 60 frames a second: the light drifts slowly, and on a 120 Hz display each extra frame
    // is another WebGL draw plus a copy into every badge's canvas. Paced by deadline, so 75 or
    // 90 Hz displays still average 60 rather than dropping to every other frame.
    if (this.due && now < this.due - 2) {
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    this.due = this.due && now - this.due < FRAME_MS ? this.due + FRAME_MS : now + FRAME_MS;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    // the first couple of seconds decide quality, once
    if (!this.lowQuality && this.samples < 120) {
      this.sampleSum += dt;
      if (++this.samples === 120 && this.sampleSum / 120 > 0.024) {
        this.lowQuality = true;
        for (const it of this.items) this.measure(it);
      }
    }

    let any = false;
    for (const it of this.items) {
      if (!it.visible) continue;
      any = true;
      this.step(it, dt);
      this.draw(it, now / 1000);
    }
    if (any) this.raf = requestAnimationFrame(this.frame);
  };

  /** Advances one badge's hover, follow and sweep, all eased so nothing ever jumps. */
  private step(it: Item, dt: number) {
    const r = it.el.getBoundingClientRect();
    const pt = this.pointer;
    let hoverTarget = 0;
    let followTarget = 0;
    let target = 0;
    if (pt) {
      const inside =
        pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom;
      if (it.opts.hover && inside) hoverTarget = 1;
      if (it.opts.follow) {
        const dx = Math.max(r.left - pt.x, 0, pt.x - r.right);
        const dy = Math.max(r.top - pt.y, 0, pt.y - r.bottom);
        const dist = Math.hypot(dx, dy);
        // full pull when close, easing off smoothly toward the edge of the range
        const u = Math.min(1, Math.max(0, (dist - 40) / Math.max(1, it.opts.followRange - 40)));
        followTarget = it.opts.followStrength * (1 - u * u * (3 - 2 * u));
        const range = Math.max(1, r.width / 2 - it.opts.radius * 1.4);
        target = Math.max(
          -1,
          Math.min(1, (pt.x - (r.left + r.width / 2)) / range),
        );
      }
    }
    it.hover = approach(it.hover, hoverTarget, 6, dt);
    it.follow = approach(it.follow, followTarget, 1.2, dt); // slow to lean in, slow to let go
    it.time += dt * (1 + it.opts.hoverSpeed * it.hover); // hovering quickens the waves
    const natural = Math.sin(it.time * 0.55);
    it.sweep = approach(
      it.sweep,
      natural + (target - natural) * it.follow,
      2.5,
      dt,
    ); // glides, never snaps
  }

  private redrawAll() {
    if (this.lost) return;
    for (const it of this.items) {
      this.measure(it);
      this.draw(it, performance.now() / 1000);
    }
  }

  private draw(it: Item, now: number) {
    if (this.lost || !this.prog || !it.w) return;
    const gl = this.gl;
    const L = this.loc;
    const o = it.opts;
    const dark = document.documentElement.classList.contains("dark");
    const still = this.reduceMotion;

    // grow the shared buffer to fit; draw into its bottom-left corner
    if (this.canvas.width < it.bw || this.canvas.height < it.bh) {
      this.canvas.width = Math.max(this.canvas.width, it.bw);
      this.canvas.height = Math.max(this.canvas.height, it.bh);
    }
    gl.viewport(0, 0, it.bw, it.bh);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // a calm still frame for reduced motion: entrance done, light centred, waves at rest
    const time = still ? 2.2 : it.time;
    const turn = still ? 0.12 : easeInOutSine((time / o.period) % 1);
    const intro = still ? 1 : easeSunrise((now - it.start) / INTRO);

    gl.uniform2f(L.uSize, it.w, it.h);
    gl.uniform1f(L.uPad, o.pad);
    gl.uniform1f(L.uRadius, Math.min(o.radius, it.h / 2, it.w / 2));
    gl.uniform1f(L.uStroke, o.stroke);
    gl.uniform1f(L.uRay, o.ray);
    gl.uniform1f(L.uRayLen, o.rayLength);
    gl.uniform1f(L.uAngle, turn * Math.PI * 2);
    gl.uniform1f(L.uTime, time);
    gl.uniform1f(L.uSweep, still ? 0 : it.sweep);
    // the shader brightens by 0.4 × uHover, so scale it to the chosen intensity
    gl.uniform1f(L.uHover, it.hover * (it.opts.hoverIntensity / 0.4));
    gl.uniform1f(L.uIntro, intro);
    gl.uniform1i(L.uWaves, this.lowQuality ? 4 : 7);
    gl.uniform3fv(L.uFill, hexRgb(dark ? o.darkFill : o.fill));
    gl.uniform3fv(L.uBorder, hexRgb(dark ? o.darkBorder : o.border));
    gl.uniform3fv(
      L["uLab[0]"],
      paletteAt(dark ? it.lab : it.labLight, it.paletteStart, now),
    );
    gl.uniform1f(L.uOnLight, dark ? 0 : 1);
    gl.uniform1f(L.uInner, dark ? o.inner * 1.25 : o.inner); // a touch stronger on dark
    gl.uniform1i(L.uMode, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // copy the bottom-left corner of the shared buffer into this badge's canvas
    it.ctx.clearRect(0, 0, it.bw, it.bh);
    it.ctx.drawImage(
      this.canvas,
      0,
      this.canvas.height - it.bh,
      it.bw,
      it.bh,
      0,
      0,
      it.bw,
      it.bh,
    );

    if (it.cast) this.drawCast(it, o, dark);
  }

  /** Second pass: the same light, continued onto the canvas laid over the content below. */
  private drawCast(it: Item, o: BadgeOptions, dark: boolean) {
    const gl = this.gl;
    const L = this.loc;
    const c = it.cast!;
    const badge = it.el.getBoundingClientRect();
    const area = c.out.getBoundingClientRect();
    if (!area.width || !area.height) return;
    const dpr = this.dpr();
    const bw = Math.max(1, Math.round(area.width * dpr));
    const bh = Math.max(1, Math.round(area.height * dpr));
    if (c.out.width !== bw || c.out.height !== bh) {
      c.out.width = bw;
      c.out.height = bh;
    }
    c.bw = bw;
    c.bh = bh;
    if (o.cast <= 0) {
      c.ctx.clearRect(0, 0, bw, bh);
      return;
    }
    if (this.canvas.width < bw || this.canvas.height < bh) {
      this.canvas.width = Math.max(this.canvas.width, bw);
      this.canvas.height = Math.max(this.canvas.height, bh);
    }
    // the area, in the badge's own coordinates: centred on the badge, y up
    const cx = badge.left + badge.width / 2;
    const cy = badge.top + badge.height / 2;
    gl.viewport(0, 0, bw, bh);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1i(L.uMode, 1);
    gl.uniform4f(
      L.uRegion,
      area.left - cx,
      cy - area.bottom,
      area.width,
      area.height,
    );
    gl.uniform1f(L.uCast, dark ? o.cast : o.cast * 1.15); // on a light page the tint needs a little more
    gl.uniform1f(L.uCastLen, o.castLength);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    c.ctx.clearRect(0, 0, bw, bh);
    c.ctx.drawImage(
      this.canvas,
      0,
      this.canvas.height - bh,
      bw,
      bh,
      0,
      0,
      bw,
      bh,
    );

    // keep the light on the letters only: cut it to the exact shape of the text
    const key = `${bw}x${bh}@${dpr}:${c.out.parentElement?.textContent ?? ""}:${this.fontsVersion}`;
    if (c.maskKey !== key) {
      c.mask = textMask(c.out, area, dpr, bw, bh);
      c.maskKey = key;
    }
    if (c.mask) {
      c.ctx.globalCompositeOperation = "destination-in";
      c.ctx.drawImage(c.mask, 0, 0);
      c.ctx.globalCompositeOperation = "source-over";
    }
  }
}

/**
 * Renders the text inside the catcher (everything but its canvas) into a mask canvas, word by
 * word, at the exact positions the browser laid the words out. Used to keep the cast light on the
 * glyphs, so it never touches the background around them.
 */
function textMask(
  out: HTMLCanvasElement,
  area: DOMRect,
  dpr: number,
  bw: number,
  bh: number,
) {
  const root = out.parentElement;
  if (!root) return null;
  const mask = document.createElement("canvas");
  mask.width = bw;
  mask.height = bh;
  const g = mask.getContext("2d");
  if (!g) return null;
  g.scale(dpr, dpr);
  g.fillStyle = "#000";
  g.textBaseline = "alphabetic";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? "";
    const host = n.parentElement;
    if (!host || !text.trim()) continue;
    const cs = getComputedStyle(host);
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
      cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
    for (const m of text.matchAll(/\S+/g)) {
      range.setStart(n, m.index!);
      range.setEnd(n, m.index! + m[0].length);
      const rect = range.getClientRects()[0];
      if (!rect) continue;
      const ascent = g.measureText(m[0]).fontBoundingBoxAscent;
      g.fillText(m[0], rect.left - area.left, rect.top - area.top + ascent);
    }
  }
  return mask;
}

let shared: Renderer | null | undefined;

/** The page-wide renderer, or null when WebGL2 is unavailable. */
export function getRenderer() {
  if (shared === undefined) {
    try {
      shared = Renderer.create();
    } catch {
      shared = null;
    }
  }
  return shared;
}

export type BadgeHandle = NonNullable<ReturnType<Renderer["add"]>>;
