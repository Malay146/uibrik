"use client";

import { ShaderSurface, type ShaderBackgroundProps } from "../_shader-background/ShaderSurface";

// A soft, slowly folding gradient drawn with nothing but the colours you give it: each pixel picks
// one of them through an 8x8 ordered (Bayer) dither, so in-between tones become fine patterns. Big
// pixels make it retro, small ones make it read as texture. The pointer lifts the tone toward the
// last colour, trailing a little behind.
const SHADER = /* glsl */ `
uniform float u_pixel;  // dither pixel size, css px
uniform float u_scale;  // size of the shapes
uniform float u_warp;   // how much the gradient bends
uniform float u_angle;  // direction the colours run, degrees
uniform float u_sweep;  // how far apart the first and last colours sit
uniform float u_radius; // reach of the pointer light, css px

// threshold for an 8x8 Bayer matrix, 0..1; the lowest coordinate bits weigh the most
float bayer8(vec2 p) {
  ivec2 i = ivec2(mod(p, 8.0));
  int v = 0;
  for (int b = 0; b < 3; b++) {
    int x = (i.x >> b) & 1;
    int y = (i.y >> b) & 1;
    v = v * 4 + (((x ^ y) << 1) | y);
  }
  return (float(v) + 0.5) / 64.0;
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 3; i++) {
    sum += amp * snoise(p);
    p = p * 2.03 + vec3(3.1, 7.7, 0.0);
    amp *= 0.42;
  }
  return sum;
}

vec3 shade(vec2 frag) {
  float px = max(1.0, u_pixel * u_dpr);
  vec2 cell = floor(frag / px);
  vec2 c = (cell + 0.5) * px;
  vec2 uv = c / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * (1.1 / u_scale);
  float t = u_time * 0.05;

  // noise bent by noise, twice: broad bands that fold into each other as they drift
  vec2 q = vec2(snoise(vec3(p * 0.8, t)), snoise(vec3(p * 0.8 + 5.2, t)));
  vec2 r = vec2(
    snoise(vec3(p + q * u_warp * 0.7 + vec2(1.7, 9.2), t * 1.2)),
    snoise(vec3(p + q * u_warp * 0.7 + vec2(8.3, 2.8), t * 1.2))
  );
  float f = fbm(vec3(p + r * u_warp * 0.5, t * 0.8));

  float a = radians(u_angle);
  float v = 0.5 + f * 0.75 + dot(uv - 0.5, vec2(cos(a), sin(a))) * u_sweep;
  // ease the ends in so the first and last colours hold soft shapes rather than flat plateaus
  v = smoothstep(-0.15, 1.15, v);

  float pd = pointerDist(c, 0.5) / (u_radius * u_dpr);
  v = clamp(v + exp(-pd * pd * 2.0) * u_pointerAmt * 0.3, 0.0, 1.0);

  float scaled = v * float(u_count - 1);
  float lo = floor(scaled);
  int idx = int(lo) + (scaled - lo > bayer8(cell) ? 1 : 0);
  return oklabToLinear(u_colors[min(idx, u_count - 1)]);
}
`;

const COLORS = ["#0f1535", "#2747c9", "#21b5a8", "#c8ec6e", "#f8f6e3"];

export type DitherGradientProps = Omit<ShaderBackgroundProps, "grain"> & {
  /** Size of a dither pixel, in px; larger is more retro. */
  pixelSize?: number;
  /** Size of the shapes; larger is calmer. */
  scale?: number;
  /** How much the gradient bends. */
  warp?: number;
  /** Direction the colours run, in degrees; 90 runs bottom to top. */
  angle?: number;
  /** How far apart the first and last colours sit. */
  sweep?: number;
  /** How far the pointer light reaches, in px. */
  radius?: number;
  /** How lazily the light follows the pointer, 0 (locked) to 1 (drifts after it). */
  follow?: number;
};

export function DitherGradient({
  colors = COLORS,
  speed = 1,
  animate = true,
  interactive = true,
  seed = 0,
  pixelSize = 3,
  scale = 1,
  warp = 1,
  angle = 90,
  sweep = 0.6,
  radius = 180,
  follow = 0.6,
  ...rest
}: DitherGradientProps) {
  return (
    <ShaderSurface
      shader={SHADER}
      uniforms={{ u_pixel: pixelSize, u_scale: scale, u_warp: warp, u_angle: angle, u_sweep: sweep, u_radius: radius }}
      colors={colors}
      speed={speed}
      animate={animate}
      interactive={interactive}
      grain={0}
      seed={seed}
      follow={follow}
      maxDpr={2}
      // CSS angles run clockwise from the top; the shader's run counter-clockwise from the right
      fallback={() => `linear-gradient(${90 - angle}deg, ${colors.join(", ")})`}
      {...rest}
    />
  );
}
