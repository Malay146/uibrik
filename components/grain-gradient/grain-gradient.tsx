"use client";

import type { CSSProperties, ReactNode } from "react";
import { ShaderSurface } from "../_shader-background/ShaderSurface";

// Colour that folds like silk, finished with film grain. Noise feeds noise twice over (domain
// warping, after Inigo Quilez), so the bands curl into each other instead of just drifting. The
// result runs along the colour list, with a soft sheen on the folds and a gentle vignette. The
// pointer twists the silk around itself, trailing a little behind like fabric being drawn.
const SHADER = /* glsl */ `
uniform float u_scale; // size of the shapes
uniform float u_warp;  // how much the flow folds into itself
uniform float u_sheen; // light on the folds
uniform float u_angle; // direction the colours run, degrees
uniform float u_sweep; // how far apart the first and last colours sit
uniform float u_vignette; // darkening toward the corners
uniform float u_twist;  // how strongly the pointer twists the silk

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * snoise(p);
    p = p * 1.9 + vec3(1.7, 9.2, 0.3);
    amp *= 0.4;
  }
  return sum;
}

vec3 shade(vec2 frag) {
  float aspect = u_res.x / u_res.y;
  vec2 uv = frag / u_res;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * (0.75 / u_scale);
  float t = u_time * 0.06;

  // the pointer twists the flow around itself, strongest at its centre and fading out softly
  vec2 dp = (frag - u_pointer) / u_res.y;
  float pull = exp(-dot(dp, dp) / 0.05) * u_pointerAmt * u_twist;
  vec2 pc = (u_pointer / u_res - 0.5) * vec2(aspect, 1.0) * (0.75 / u_scale);
  float ra = pull * 1.4;
  p = pc + mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * (p - pc);

  vec2 q = vec2(fbm(vec3(p, t)), fbm(vec3(p + vec2(5.2, 1.3), t)));
  vec2 r = vec2(
    fbm(vec3(p + 0.8 * u_warp * q + vec2(1.7, 9.2), t * 1.3)),
    fbm(vec3(p + 0.8 * u_warp * q + vec2(8.3, 2.8), t * 1.3))
  );
  float f = fbm(vec3(p + 0.8 * u_warp * r, t * 0.8));

  // a slow sweep underneath, so both ends of the colour list always show
  float a = radians(u_angle);
  float sweep = dot(uv - 0.5, vec2(cos(a), sin(a)));
  vec3 lab = paletteRamp(0.5 + f * 0.85 + sweep * u_sweep);

  lab.x += u_sheen * 0.08 * (smoothstep(0.05, 0.5, length(r)) - 0.4 + pull * 0.6);
  lab.x *= 1.0 - 0.36 * u_vignette * dot(uv - 0.5, uv - 0.5);
  return oklabToLinear(lab);
}
`;

const COLORS = ["#07142e", "#123a7c", "#2b6bd6", "#7db4f2", "#dcebfc"];

export type GrainGradientProps = {
  /** Hex colours, 2 to 6, laid out from first to last across the flow. */
  colors?: string[];
  /** Animation speed; 1 is the designed pace. */
  speed?: number;
  /** Move on its own. Off draws one still frame. */
  animate?: boolean;
  /** Film grain strength. */
  grain?: number;
  /** Size of a grain speck, in px. */
  grainSize?: number;
  /** Direction the colours run, in degrees; 0 is left to right. */
  angle?: number;
  /** How far apart the first and last colours sit; 0 mixes them all evenly. */
  sweep?: number;
  /** Darkening toward the corners. */
  vignette?: number;
  /** Twist the silk with the pointer. */
  interactive?: boolean;
  /** How strongly the pointer twists the silk. */
  twist?: number;
  /** Shifts the composition, so two gradients with the same settings still differ. */
  seed?: number;
  /** Size of the shapes; larger is calmer. */
  scale?: number;
  /** How much the flow folds into itself. */
  warp?: number;
  /** Soft light on the folds. */
  sheen?: number;
  /** Most frames drawn per second; 60 by default. */
  maxFps?: number;
  className?: string;
  style?: CSSProperties;
  /** Content shown on top of the background. */
  children?: ReactNode;
};

export function GrainGradient({
  colors = COLORS,
  speed = 1,
  animate = true,
  grain = 0.08,
  scale = 1,
  warp = 1,
  sheen = 0.6,
  grainSize = 1,
  angle = 30,
  sweep = 0.7,
  vignette = 0.5,
  seed = 0,
  interactive = true,
  twist = 1,
  ...rest
}: GrainGradientProps) {
  return (
    <ShaderSurface
      shader={SHADER}
      uniforms={{ u_scale: scale, u_warp: warp, u_sheen: sheen, u_angle: angle, u_sweep: sweep, u_vignette: vignette, u_twist: twist }}
      colors={colors}
      speed={speed}
      animate={animate}
      interactive={interactive}
      follow={0.85}
      grain={grain}
      grainSize={grainSize}
      seed={seed}
      // CSS angles run clockwise from the top; the shader's run counter-clockwise from the right
      fallback={() => `linear-gradient(${90 - angle}deg, ${colors.join(", ")})`}
      {...rest}
    />
  );
}
