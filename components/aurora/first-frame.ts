import { hexToOklab, type Lab } from "../_shader-background/ShaderSurface";

// Aurora's first frame worked out on the CPU, as a tiny image for its CSS fallback: what shows
// before the GPU draws (the server's HTML, a page still starting) and in browsers without WebGL.
// It follows the shader line for line (the same noise, curtains, palette and colour maths) with the
// pointer away and no grain, at the moment the animation starts from, so the shader fades in over
// a picture of itself. The light is soft, so a small image stretched over the box reads the same.

const W = 48;
const H = 24; // the box's shape isn't known in CSS; a hero's is about 2:1
const START = 12; // ShaderSurface's clock starts here
const MAX_LAYERS = 5;

export type FrameOptions = {
  colors: string[];
  /** The base colour, and whether the light adds up on it as a glow (a dark base) or as ink. */
  base: string;
  dark: boolean;
  intensity: number;
  height: number;
  spread: number;
  layers: number;
  waviness: number;
  stretch: number;
  seed: number;
};

const cache = new Map<string, string>();

/** A CSS background: the first frame stretched over the box, on the base colour. */
export function firstFrame(o: FrameOptions) {
  const key = JSON.stringify(o);
  let css = cache.get(key);
  if (!css) {
    css = `url("data:image/bmp;base64,${bmp(render(o))}") center / 100% 100% no-repeat, ${o.base}`;
    if (cache.size > 32) cache.clear();
    cache.set(key, css);
  }
  return css;
}

function render(o: FrameOptions) {
  const palette = (o.colors.length > 1 ? o.colors : [o.colors[0] ?? "#808080", o.colors[0] ?? "#808080"]).map(hexToOklab);
  const bg = oklabToLinear(hexToOklab(o.base));
  const t = (START + o.seed * 37.1) * 0.09;
  const aspect = W / H;
  const layers = Math.min(o.layers, MAX_LAYERS);
  const px = new Uint8Array(W * H * 3);

  // everything but the curtain's falloff depends on x alone, so it's worked out once per column
  for (let cx = 0; cx < W; cx++) {
    const x = ((cx + 0.5) / W) * aspect;
    const xs = x / o.stretch;
    const curtains: { y0: number; strength: number; light: Lab; reach: number }[] = [];
    for (let i = 0; i < MAX_LAYERS; i++) {
      if (i >= layers) break;
      const y0 =
        o.height - 0.07 * i + o.waviness * 0.11 * snoise(xs * 0.8 + i * 3.1, t, i) + o.waviness * 0.04 * snoise(xs * 2.2, t * 1.6, i + 4);
      const fold = 0.55 + 0.45 * snoise(xs * 1.1 + i * 5, t * 0.8, i + 2);
      const hue = xs * 0.16 + t * 0.35 + i * 0.33 + 0.08 * snoise(xs * 0.7, t, i + 9);
      curtains.push({ y0, strength: fold * Math.max(1 - 0.18 * i, 0.25), light: oklabToLinear(paletteLoop(palette, hue)), reach: o.spread * (0.75 + 0.3 * i) });
    }

    for (let cy = 0; cy < H; cy++) {
      const y = (cy + 0.5) / H;
      const glow = [0, 0, 0];
      const ink = [...bg];
      for (const c of curtains) {
        const d = y - c.y0;
        const a = (d > 0 ? Math.exp(-d / c.reach) : Math.exp(-d * d * 90)) * c.strength;
        const mixAmt = clamp(a * o.intensity * 0.9, 0, 1);
        for (let k = 0; k < 3; k++) {
          glow[k] += c.light[k] * a;
          ink[k] += (c.light[k] - ink[k]) * mixAmt;
        }
      }
      const out = o.dark ? bg.map((v, k) => v + glow[k] * o.intensity * 0.7) : ink;
      // BMP rows run bottom-up, like the shader's y
      const at = (cy * W + cx) * 3;
      for (let k = 0; k < 3; k++) px[at + k] = Math.round(linearToSrgb(out[k]) * 255);
    }
  }
  return px;
}

/** A 24-bit BMP of `px` (RGB, bottom row first), base64. */
function bmp(px: Uint8Array) {
  const row = Math.ceil((W * 3) / 4) * 4;
  const size = 54 + row * H;
  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);
  buf.set([0x42, 0x4d]);
  view.setUint32(2, size, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, W, true);
  view.setInt32(22, H, true); // positive: bottom-up
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, row * H, true);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const from = (y * W + x) * 3;
      const to = 54 + y * row + x * 3;
      buf[to] = px[from + 2]; // BMP stores BGR
      buf[to + 1] = px[from + 1];
      buf[to + 2] = px[from];
    }
  }
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// The shader's paletteLoop: 0..1 runs through every colour and back to the first.
function paletteLoop(palette: Lab[], x: number): Lab {
  const n = palette.length;
  const f = (x - Math.floor(x)) * n;
  const i = Math.floor(f);
  const j = i + 1 >= n ? 0 : i + 1;
  const u = f - i;
  const s = u * u * (3 - 2 * u);
  return palette[i].map((v, k) => v + (palette[j][k] - v) * s) as Lab;
}

function oklabToLinear([L, A, B]: readonly number[]): Lab {
  let l = L + 0.3963377774 * A + 0.2158037573 * B;
  let m = L - 0.1055613458 * A - 0.0638541728 * B;
  let s = L - 0.0894841775 * A - 1.291485548 * B;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function linearToSrgb(c: number) {
  c = clamp(c, 0, 1);
  return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// 3D simplex noise, the same as the shader's (Ian McEwan, Ashima Arts, and Stefan Gustavson; MIT
// License: https://github.com/stegu/webgl-noise), so the picture has the same shapes.
// The GPU works in 32-bit floats, and where floor() lands on a whole number that decides which
// gradient a corner gets, so those steps round the way it does (Math.fround).
const f32 = Math.fround;
const INV289 = f32(1 / 289);
const mod289 = (x: number) => x - Math.floor(f32(x * INV289)) * 289;
const permute = (x: number) => mod289((x * 34 + 1) * x);

function snoise(vx: number, vy: number, vz: number) {
  const C1 = 1 / 6;
  const C2 = 1 / 3;
  const s = (vx + vy + vz) * C2;
  let ix = Math.floor(vx + s);
  let iy = Math.floor(vy + s);
  let iz = Math.floor(vz + s);
  const t = (ix + iy + iz) * C1;
  const x0 = [vx - ix + t, vy - iy + t, vz - iz + t];
  // g = step(x0.yzx, x0.xyz); l = 1 - g
  const g = [x0[0] >= x0[1] ? 1 : 0, x0[1] >= x0[2] ? 1 : 0, x0[2] >= x0[0] ? 1 : 0];
  const l = [1 - g[0], 1 - g[1], 1 - g[2]];
  // i1 = min(g.xyz, l.zxy); i2 = max(g.xyz, l.zxy)
  const i1 = [Math.min(g[0], l[2]), Math.min(g[1], l[0]), Math.min(g[2], l[1])];
  const i2 = [Math.max(g[0], l[2]), Math.max(g[1], l[0]), Math.max(g[2], l[1])];
  const x1 = [x0[0] - i1[0] + C1, x0[1] - i1[1] + C1, x0[2] - i1[2] + C1];
  const x2 = [x0[0] - i2[0] + C2, x0[1] - i2[1] + C2, x0[2] - i2[2] + C2];
  const x3 = [x0[0] - 0.5, x0[1] - 0.5, x0[2] - 0.5];
  ix = mod289(ix);
  iy = mod289(iy);
  iz = mod289(iz);
  const corner = [
    [0, 0, 0],
    [i1[0], i1[1], i1[2]],
    [i2[0], i2[1], i2[2]],
    [1, 1, 1],
  ];
  const p = corner.map(([cx, cy, cz]) => permute(permute(permute(iz + cz) + iy + cy) + ix + cx));

  const n = f32(0.142857142857);
  const ns = [f32(n * 2), f32(n * 0.5 - 1), n]; // n_ * D.wyz - D.xzx
  const xs = [x0, x1, x2, x3];
  let sum = 0;
  for (let k = 0; k < 4; k++) {
    const j = p[k] - 49 * Math.floor(f32(f32(p[k] * ns[2]) * ns[2]));
    const xq = Math.floor(f32(j * ns[2]));
    const yq = Math.floor(j - 7 * xq);
    const gx = xq * ns[0] + ns[1];
    const gy = yq * ns[0] + ns[1];
    const h = 1 - Math.abs(gx) - Math.abs(gy);
    // the gradient's x and y fold back where h < 0: a = b + (floor(b) * 2 + 1) * -step(h, 0)
    const sh = h <= 0 ? -1 : 0;
    let ax = gx + (Math.floor(gx) * 2 + 1) * sh;
    let ay = gy + (Math.floor(gy) * 2 + 1) * sh;
    let az = h;
    const norm = 1.79284291400159 - 0.85373472095314 * (ax * ax + ay * ay + az * az);
    ax *= norm;
    ay *= norm;
    az *= norm;
    const x = xs[k];
    const m = Math.max(0.6 - (x[0] * x[0] + x[1] * x[1] + x[2] * x[2]), 0);
    sum += m * m * m * m * (ax * x[0] + ay * x[1] + az * x[2]);
  }
  return 42 * sum;
}
