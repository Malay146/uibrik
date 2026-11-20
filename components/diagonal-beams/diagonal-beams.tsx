"use client";

import { ShaderSurface, hexToOklab, type ShaderBackgroundProps } from "../_shader-background/ShaderSurface";

// One soft light falling across a pleated surface: a row of slanted strips, side by side, like
// the folds of a fan.
//
// Each strip is a fold: its lit face starts at a crisp edge and turns away from the light toward
// the next strip, falling softly into shadow, so every fold meets the next with a sharp line. The
// light is one pool in the middle; each strip catches it a little further along or back, so the lit
// faces end at staggered points, and its brightness picks the colour: deepest shade where it is
// faint, lightest where it is strongest. Each strip twists slowly along its length, and where it
// turns edge-on less light gets through. The light's falloff and the turn into shadow are dithered,
// read from a slightly random spot for each pixel, so they dissolve into fine grain while the fold
// edges stay sharp. Just past the light only a thin highlight along each crisp edge is left, and
// it fades to nothing further out. The pointer nudges the light a little toward itself.
//
// On first showing the light opens in place, growing from a point in the middle to its full size
// and brightening as it grows.
const SHADER = /* glsl */ `
uniform float u_beams;     // strips per box height
uniform float u_size;      // size of the light
uniform float u_angle;     // direction the strips run, degrees
uniform float u_blur;      // how far the light's edge dissolves into grain
uniform float u_intensity; // exposure
uniform float u_rim;       // the highlight along each strip's bright edge
uniform float u_lean;      // how far the light leans toward the pointer
uniform float u_tilt;      // how much the strips twist along their length

// distance from the centre of the light, 1 at its edge: along a strip, and across to the strip's
// middle line, so every strip is lit evenly across its width and the lit parts end strip by strip
float reach(float along, float across, float size) {
  return length(vec2(along / (0.5 * size), across / (0.55 * size)));
}

float outCubic(float x) {
  x = 1.0 - clamp(x, 0.0, 1.0);
  return 1.0 - x * x * x;
}

vec3 shade(vec2 frag) {
  float t = u_time * 0.4;
  // units of height, or of width on a tall, narrow box, so the light still fits a phone
  float unit = min(u_res.y, u_res.x * 1.2);
  vec2 p = (frag - 0.5 * u_res) / unit - vec2(0.03, 0.02);
  float a = radians(u_angle);
  vec2 dir = vec2(cos(a), sin(a));
  vec2 nrm = vec2(-dir.y, dir.x);

  // per-pixel random offsets (a rough Gaussian): about a pixel for the fold edges, so they are
  // antialiased, and much wider for the light and the shadow, so those turn to grain
  vec2 g = floor(frag / u_dpr);
  vec2 j = vec2(hash12(g) + hash12(g + 7.1), hash12(g + 3.3) + hash12(g + 9.9)) - 1.0;

  // which strip, and where across it: 0 at its crisp lit edge, 1 deepest in its shadow
  float gap = 1.0 / max(u_beams, 1.0);
  float f = dot(p + j * (0.6 * u_dpr / unit), nrm) / gap;
  float k = floor(f);
  float x = f - k;
  float h1 = hash12(vec2(k, 5.3));
  float h2 = hash12(vec2(k, 17.9));

  // the intro: the light grows from a point
  float size = max(u_size * outCubic(u_age / 1.6), 1e-3);

  // the light drifts slowly and leans a little toward the pointer
  vec2 c = vec2(0.04 * sin(t * 0.21), 0.03 * cos(t * 0.27));
  vec2 m = (u_pointer - 0.5 * u_res) / unit - vec2(0.03, 0.02);
  c += (m - c) * 0.12 * u_lean * u_pointerAmt;

  // each strip catches the light a little further along or back, and drifts slowly
  float shift = (h1 - 0.5) * 0.26 + 0.035 * sin(t * (0.4 + 0.3 * h2) + h2 * 6.28);
  vec2 d = p - c + dir * shift + j * 0.03 * u_blur * size;
  float mid = (k + 0.5) * gap - dot(c, nrm);
  float r = reach(dot(d, dir), mid + dot(j, nrm) * 0.01, size) * (1.0 + 0.03 * snoise(vec3(p * 1.2, t * 0.2)));
  // a broad, even plateau of light that ends quickly, and a far fainter glow reaching past it
  float core = 1.0 - smoothstep(0.55, 1.0, r);
  float wide = 1.0 - smoothstep(0.3, 1.45, r);

  // each strip twists slowly along its length; where it turns edge-on less light gets through, so
  // its face dims and its shadow widens. Read from the grainy spot too, so the dips dissolve.
  float u = dot(p, dir);
  float uj = u + dot(j, dir) * 0.05 * u_blur;
  float twist = snoise(vec3(uj * 2.6 - t * 0.12 + h1 * 7.0, k * 0.83, t * 0.08 + h2 * 3.0));
  float turn = clamp(smoothstep(0.12, 0.55, twist) * u_tilt, 0.0, 1.0);
  // edge-on, a strip still glows faintly, in the deep shades
  float pass = mix(1.0, 0.22, turn);
  // light flowing gently along each strip, so neighbours are lit a little differently
  float flow = 0.9 + 0.14 * snoise(vec3(u * 1.6 - t * 0.5, k * 0.7, t * 0.12 + h1 * 9.0));
  // the face turns away from the light: full from the crisp edge, then a grainy fall into shadow
  float xs = x + dot(j, nrm) * 0.12 * u_blur;
  float edge = mix(0.64, 0.3, turn);
  float face = mix(0.08, 1.0, 1.0 - smoothstep(edge, 1.02, xs));
  float body = core * face * flow * pass;
  // the crisp edge keeps a thin highlight out into the dark, and the face a faint glow
  // the highlight fades with distance from the light and is gone well before the frame's edge
  float fade = 1.0 - smoothstep(0.7, 1.35, r);
  float rim = (1.0 - smoothstep(0.0, 0.07, x)) * fade * fade * 0.5 * u_rim;
  float ambient = wide * wide * 0.06 * face;

  // brightening as it grows, with a quick fade in from the dark at the very start
  float b = (max(body, rim) + ambient) * u_intensity * smoothstep(0.1, 2.0, u_age);
  vec3 col = oklabToLinear(paletteRamp(clamp(pow(b, 0.7) * 0.7, 0.0, 1.0)));
  return mix(oklabToLinear(u_bg), col, smoothstep(0.0, 0.1, b) * smoothstep(0.0, 0.6, u_age));
}
`;

const COLOR = "#e5373f";
const BACKGROUND = "#060608";

// Shades of the colour, darkest first: a deep, slightly cool shadow where the light fades out,
// the colour itself, then a soft pastel for the hottest light. Chroma eases off at both ends and
// the hue leans cool in the shadows and warm in the highlights, as light on one colour does.
const STEPS: [l: number, chroma: number, hue: number][] = [
  [0.2, 0.45, -0.12],
  [0.38, 0.8, -0.06],
  [0.58, 1, 0],
  [0.73, 0.7, 0.04],
  [0.87, 0.32, 0.07],
];

const encode = (c: number) => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, "0");
};

// OKLCH -> hex, cutting chroma until the colour fits in sRGB so no shade clips to a harsher hue
function lchToHex(l: number, c: number, h: number) {
  for (let i = 0; i < 24; i++, c *= 0.9) {
    const a = c * Math.cos(h);
    const b = c * Math.sin(h);
    const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [
      4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
      -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
      -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
    ];
    if (rgb.every((v) => v >= -0.001 && v <= 1.001) || i === 23) return `#${rgb.map(encode).join("")}`;
  }
  return "#000000";
}

/** Five shades of one colour, darkest first. */
export function beamShades(hex: string) {
  const [, a, b] = hexToOklab(hex);
  const c = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  return STEPS.map(([l, k, dh]) => lchToHex(l, c * k, h + dh));
}

export type DiagonalBeamsProps = Omit<ShaderBackgroundProps, "seed"> & {
  /** Colour of the light; drawn in shades of it. */
  color?: string;
  /** How many strips fit the height of the box. */
  count?: number;
  /** Size of the light; 1 is the designed size. */
  size?: number;
  /** Direction the strips run, in degrees; negative slants down to the right. */
  angle?: number;
  /** How far the light's edge dissolves into grain; 0 is a smooth falloff. */
  blur?: number;
  /** The thin highlight along each fold's crisp edge, reaching out into the dark. */
  rim?: number;
  /** Exposure: how bright the light is. */
  intensity?: number;
  /** How far the light leans toward the pointer. */
  lean?: number;
  /** How much the strips twist along their length, letting less light through where they turn. */
  tilt?: number;
  /** Colour behind the strips. */
  background?: string;
};

export function DiagonalBeams({
  color = COLOR,
  colors,
  count = 7,
  size = 1,
  angle = -50,
  blur = 1,
  rim = 0.7,
  intensity = 1,
  lean = 1,
  tilt = 1,
  background = BACKGROUND,
  speed = 1,
  animate = true,
  interactive = true,
  grain = 0.03,
  ...rest
}: DiagonalBeamsProps) {
  const list = colors?.filter(Boolean).slice(0, 6);
  const palette = list && list.length >= 2 ? list : beamShades(color || COLOR);
  const mid = palette[Math.floor(palette.length / 2)];

  return (
    <ShaderSurface
      shader={SHADER}
      uniforms={{
        u_beams: Math.max(1, Math.round(count)),
        u_size: size,
        u_angle: angle,
        u_blur: blur,
        u_rim: rim,
        u_intensity: intensity,
        u_lean: lean,
        u_tilt: tilt,
      }}
      colors={palette}
      speed={speed}
      animate={animate}
      interactive={interactive}
      grain={grain}
      background={background}
      follow={0.85}
      fallback={(_, base) =>
        // the strips as CSS stripes, lit by a soft pool in the middle
        `radial-gradient(ellipse 34% 42% at 52% 47%, transparent 20%, ${base} 100%), repeating-linear-gradient(${90 - angle}deg, ${mid}99 0 6.9%, ${mid}55 6.9% 13.8%), ${base}`
      }
      {...rest}
    />
  );
}
