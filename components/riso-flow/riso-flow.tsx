"use client";

import type { CSSProperties, ReactNode } from "react";
import { ShaderSurface } from "../_shader-background/ShaderSurface";
import { shadesOf, type ShadeStep } from "../_shader-background/shades";

// A flowing gradient printed on a risograph. The first colour is the paper; up to three more are
// spot inks, each laid down as its own layer of loose grain whose density follows a slow,
// self-warping noise field. The layers sit slightly out of register, drifting a few px apart and
// back, and overprint by multiplying, so where two inks meet a third colour appears.
//
// Moving the pointer leaves a short wake where the layers slip apart and settle back. A press sends a ring out
// through the sheet that shoves the layers apart and prints a little heavier as it passes.
const SHADER = /* glsl */ `
uniform float u_scale;  // size of the shapes
uniform float u_offset; // misregistration, css px
uniform float u_dot;    // grain size, css px
uniform float u_grit;   // 0 crisp grain .. 1 soft
uniform float u_paper;  // paper texture strength
uniform float u_shake;  // how far the wake and presses push the layers apart

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * snoise(p);
    p = p * 1.95 + vec3(3.1, 7.7, 0.4);
    amp *= 0.45;
  }
  return sum;
}

// one ink: density at the misregistered spot (fields are smooth, so a first-order step is plenty),
// read through its own grain
float ink(vec4 field, vec2 grad1, vec2 grad2, vec2 off, vec2 at, float idx, float press) {
  float f = field.x + dot(grad1, off);
  float g = field.y + dot(grad2, off);
  float d;
  // a broad soft wash, a mid layer, and a few firmer shapes on top. Wide, overlapping ramps, so
  // each ink fades through the others instead of stopping at an edge.
  if (idx < 0.5) d = smoothstep(-0.55, 0.45, f) * 0.9;
  else if (idx < 1.5) d = smoothstep(-0.3, 0.5, g - f * 0.5) * 0.88;
  else d = smoothstep(-0.05, 0.4, -f * 0.6 - g * 0.6) * 0.9;
  d = min(d + press * smoothstep(0.0, 0.3, d), 1.0);
  float cell = max(u_dot * u_dpr, 1.0);
  // one threshold per speck, stepped by the golden ratio for each ink: where inks are light their
  // specks fall side by side and mix optically, and only stack (and darken) where they're dense
  float n = fract(hash12(floor(at / cell)) + idx * 0.618034);
  float soft = 0.03 + u_grit * 0.4;
  return smoothstep(n - soft, n + soft, d);
}

vec3 shade(vec2 frag) {
  vec2 at = frag;
  vec2 p = at / u_res.y * (0.9 / u_scale);
  float t = u_time * 0.05;

  vec2 q = vec2(fbm(vec3(p, t)), fbm(vec3(p + vec2(5.2, 1.3), t)));
  float f = fbm(vec3(p + 0.9 * q, t * 0.8));
  float g = q.x * 1.2 - q.y * 0.6;
  vec4 field = vec4(f, g, 0.0, 0.0);
  vec2 gf = vec2(dFdx(f), dFdy(f));
  vec2 gg = vec2(dFdx(g), dFdy(g));

  float off = u_offset * u_dpr;

  // the wake the pointer leaves while moving
  // outward from the pointer, easing to nothing right under it so the split has no pinhole
  vec2 away = at - u_pointer;
  away *= smoothstep(0.0, 40.0 * u_dpr, length(away)) / max(length(away), 1e-3);
  float wake = trailField(frag, 60.0 * u_dpr);
  // presses: rings travelling out from where they landed, pushing outward as they pass
  vec2 ringPush = vec2(0.0);
  float ring = 0.0;
  for (int i = 0; i < RIPPLE_COUNT; i++) {
    vec3 r = u_ripples[i];
    if (r.z < 0.0 || r.z > 3.0) continue;
    vec2 d = frag - r.xy;
    float len = max(length(d), 1e-3);
    float dd = (len - r.z * 300.0 * u_dpr) / (26.0 * u_dpr);
    float life = 1.0 - r.z / 3.0;
    float w = exp(-dd * dd) * smoothstep(0.0, 0.35, life);
    ring += w;
    ringPush += d / len * w;
  }
  vec2 push = (away * wake * 22.0 + ringPush * 18.0) * u_shake * u_dpr;
  // ink lands heavier where a ring passes
  float press = ring * 0.15 * u_shake;

  vec3 col = oklabToLinear(u_colors[0]);
  int inks = min(u_count - 1, 3);
  for (int i = 0; i < 3; i++) {
    if (i >= inks) break;
    float fi = float(i);
    // each layer drifts on its own slow orbit
    float a = fi * 2.1 + t * (1.4 + fi * 0.3);
    vec2 o = vec2(cos(a), sin(a)) * off * (0.6 + 0.4 * sin(t * 2.0 + fi * 1.7));
    // the push splits the layers: the first moves in, the others out by different amounts
    o += push * (fi * 0.9 - 0.8);
    float c = ink(field, gf, gg, o, at, fi, press);
    // overprint: inks multiply the paper and each other. Riso ink is translucent and the paper
    // glows through it, so an ink multiplies as a slightly lighter version of itself, which keeps
    // overlaps vivid instead of muddy.
    vec3 inkCol = pow(max(oklabToLinear(u_colors[i + 1]), 0.0), vec3(0.82));
    col *= mix(vec3(1.0), inkCol, c * 0.9);
  }

  // paper: soft fibres and a faint mottle
  vec2 css = at / u_dpr;
  float fibre = snoise(vec3(css * vec2(0.012, 0.11), 3.0)) * 0.6 + snoise(vec3(css * 0.04, 7.0)) * 0.4;
  col *= 1.0 - u_paper * 0.05 * (fibre * 0.5 + 0.5);

  return col;
}
`;

const COLOR = "#1f7a8c";


// the paper first, then the inks from lightest to deepest
const STEPS: ShadeStep[] = [
  [0.975, 0.06, 0.25],
  [0.8, 0.75, 0.08],
  [0.6, 1, 0],
  [0.4, 0.85, -0.1],
];

export type RisoFlowProps = {
  /** Colour of the ink; the paper and other inks are shades of it. */
  color?: string;
  /** Size of the shapes; larger is calmer. */
  scale?: number;
  /** How far the ink layers drift out of register, in px. */
  offset?: number;
  /** Size of a grain speck, in px. */
  dot?: number;
  /** Softness of the grain; 0 is crisp. */
  grit?: number;
  /** Strength of the paper texture. */
  paper?: number;
  /** Animation speed; 1 is the designed pace. */
  speed?: number;
  /** Move on its own. Off draws one still frame. */
  animate?: boolean;
  /** Moving the pointer leaves a misregistered wake; a press sends a ring through the sheet. */
  interactive?: boolean;
  /** How hard the wake and presses push the layers apart. */
  shake?: number;
  /** Shifts the composition, so two backgrounds with the same settings still differ. */
  seed?: number;
  /** Most frames drawn per second; 60 by default. */
  maxFps?: number;
  className?: string;
  style?: CSSProperties;
  /** Content shown on top of the background. */
  children?: ReactNode;
};

export function RisoFlow({
  color = COLOR,
  scale = 1,
  offset = 4,
  dot = 2,
  grit = 0.55,
  paper = 1,
  speed = 1,
  animate = true,
  interactive = true,
  shake = 1,
  seed = 0,
  ...rest
}: RisoFlowProps) {
  const palette = shadesOf(color || COLOR, STEPS);

  return (
    <ShaderSurface
      shader={SHADER}
      uniforms={{ u_scale: scale, u_offset: offset, u_dot: dot, u_grit: grit, u_paper: paper, u_shake: shake }}
      colors={palette}
      speed={speed}
      animate={animate}
      interactive={interactive}
      follow={0.6}
      ripples
      trailLife={1.4}
      grain={0}
      seed={seed}
      fallback={() =>
        [
          `radial-gradient(ellipse 60% 50% at 25% 30%, ${palette[1]}, transparent 70%)`,
          `radial-gradient(ellipse 55% 50% at 75% 70%, ${palette[palette.length - 1]}, transparent 70%)`,
          palette[0],
        ].join(", ")
      }
      {...rest}
    />
  );
}
