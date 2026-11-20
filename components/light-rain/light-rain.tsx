"use client";

import { ShaderSurface, type ShaderBackgroundProps } from "../_shader-background/ShaderSurface";

// Falling light: thin vertical lines of blue light, densest down the middle, with bright glints
// sliding along them and a soft haze drifting between. Three layers of lines at different
// densities (fine threads behind, a few strong lines in front). Each line has its own position,
// width and brightness, brightens and fades along its length, and carries a couple of glints, each
// a short bright core with a long soft tail. The brightness is mapped through the colour list, so
// the light runs from deep navy through blue to a near-white core.
const SHADER = /* glsl */ `
uniform float u_density;   // how many lines
uniform float u_spread;    // how wide the band of lines is
uniform float u_glints;    // how many bright glints
uniform float u_glintLength;
uniform float u_haze;      // soft glow drifting between the lines
uniform float u_intensity;
uniform float u_direction; // 1 falls, -1 rises
uniform float u_radius;    // reach of the pointer light, css px

float lineLayer(vec2 frag, float t, float n, float layer, float band) {
  float x = frag.x / u_res.y * n;
  float id = floor(x);
  float f = fract(x) - 0.5;
  float h1 = hash12(vec2(id, layer));
  float h2 = hash12(vec2(id, layer + 13.0));
  float h3 = hash12(vec2(id, layer + 29.0));
  float h4 = hash12(vec2(id, layer + 47.0));

  // fewer lines toward the sides
  float cx = (id + 0.5) / n * u_res.y / u_res.x - 0.5;
  float odds = exp(-cx * cx / (2.0 * band * band));
  if (h1 > odds * 0.8) return 0.0;

  float w = mix(0.025, 0.09, h2 * h2);
  float dx = f - (h3 - 0.5) * 0.6;
  float line = exp(-pow(dx / w, 2.0));
  // a soft halo either side, only seen where the line is bright
  float halo = exp(-pow(dx / (w * 10.0), 2.0));
  float y = frag.y / u_res.y;
  // each line fades in and out along its length, drifting with the flow
  float flow = y + t * u_direction * (0.25 + 0.5 * h4);
  float along = smoothstep(0.15, 0.9, snoise(vec3(id * 0.37 + layer, flow * 2.2, layer)) * 0.5 + 0.5);
  along = mix(0.2, 1.0, along);
  // glints: a short bright core inside a longer soft glow
  float g = fract(flow * 0.8 / u_glintLength + h2 * 7.0) - 0.5;
  float has = step(1.0 - 0.5 * u_glints, h4);
  float core = exp(-pow(g * 30.0, 2.0));
  float glow = exp(-pow(g * 10.0, 2.0));
  float glint = has * (core * 5.0 * line + glow * (0.9 * line + 0.6 * halo));
  return line * along * (0.12 + 0.7 * h3 * h3) + along * halo * 0.05 + glint;
}

vec3 shade(vec2 frag) {
  float t = u_time * 0.25;
  float band = 0.2 * u_spread;
  float v = 0.0;
  v += lineLayer(frag, t, 110.0 * u_density, 3.0, band * 1.2) * 0.55;
  v += lineLayer(frag, t * 1.1, 55.0 * u_density, 2.0, band) * 0.75;
  v += lineLayer(frag, t * 1.25, 26.0 * u_density, 1.0, band * 0.85) * 1.0;

  // haze: soft blue clouds drifting down the middle
  vec2 q = frag / u_res.y;
  float cx = frag.x / u_res.x - 0.5;
  float haze = exp(-cx * cx / (2.0 * band * band * 0.5))
    * smoothstep(0.0, 1.0, snoise(vec3(q * vec2(3.0, 1.6) + vec2(0.0, t * u_direction * 0.4), t * 0.2)) * 0.5 + 0.3);
  v += haze * haze * 0.55 * u_haze;

  // the pointer brightens the lines near it
  float pd = length(frag - u_pointer) / (u_radius * u_dpr);
  v *= 1.0 + 1.2 * exp(-pd * pd) * u_pointerAmt;

  v = 1.0 - exp(-v * u_intensity * 1.7);
  return oklabToLinear(paletteRampLch(v));
}
`;

const COLORS = ["#000000", "#071a46", "#1c4fb8", "#6ea6ff", "#eef5ff"];

export type LightRainProps = Omit<ShaderBackgroundProps, "seed"> & {
  /** How many lines. */
  density?: number;
  /** How wide the band of lines is. */
  spread?: number;
  /** How many bright glints slide along the lines. */
  glints?: number;
  /** Spacing of the glints along a line; larger is fewer, longer gaps. */
  glintLength?: number;
  /** Soft glow drifting between the lines. */
  haze?: number;
  /** Brightness. */
  intensity?: number;
  /** Which way the light moves. */
  direction?: "down" | "up";
  /** How far the pointer light reaches, in px. */
  radius?: number;
  /** How lazily the light follows the pointer, 0 (locked) to 1 (drifts after it). */
  follow?: number;
};

export function LightRain({
  colors = COLORS,
  speed = 1,
  animate = true,
  interactive = true,
  grain = 0.02,
  density = 1,
  spread = 1,
  glints = 1,
  glintLength = 1,
  haze = 1,
  intensity = 1,
  direction = "down",
  radius = 160,
  follow = 0.7,
  ...rest
}: LightRainProps) {
  return (
    <ShaderSurface
      shader={SHADER}
      uniforms={{
        u_density: density,
        u_spread: spread,
        u_glints: glints,
        u_glintLength: glintLength,
        u_haze: haze,
        u_intensity: intensity,
        u_direction: direction === "up" ? -1 : 1,
        u_radius: radius,
      }}
      colors={colors}
      speed={speed}
      animate={animate}
      interactive={interactive}
      grain={grain}
      follow={follow}
      fallback={() =>
        `repeating-linear-gradient(90deg, transparent 0, transparent 9px, ${colors[2] ?? colors[0]}66 10px, transparent 11px), radial-gradient(ellipse 30% 70% at 50% 50%, ${colors[2] ?? colors[0]}55, transparent), ${colors[0]}`
      }
      {...rest}
    />
  );
}
