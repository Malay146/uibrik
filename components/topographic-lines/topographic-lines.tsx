"use client";

import type { CSSProperties, ReactNode } from "react";
import { ShaderSurface, sourcePass, type Prepass } from "../_shader-background/ShaderSurface";
import { paletteOf, type ShadeStep } from "../_shader-background/shades";

const TERRAIN = /* glsl */ `
float terrain(vec2 p, float t) {
  // a slow warp bends the landforms into ridges and valleys instead of round blobs
  p += 0.28 * vec2(snoise(vec3(p * 0.45, t * 0.7)), snoise(vec3(p * 0.45 + 7.3, t * 0.7)));
  float h = snoise(vec3(p * 0.9, t)) * 0.62;
  h += snoise(vec3(p * 2.1 + 3.7, t * 1.3)) * 0.26;
  h += snoise(vec3(p * 4.6 - 1.9, t * 1.7)) * 0.1;
  return h * 0.5 + 0.5;
}
`;

// Flat view: contour lines of a slowly shifting landscape, like a survey map. The terrain is three octaves of
// gently warped noise drifting through time; a line is drawn wherever its height crosses a whole
// step, sized in screen px with fwidth so every line keeps one crisp width however steep the
// ground. Every few lines an index line is drawn heavier, with a soft glow on dark pages. Under the
// lines the ground is hill-shaded from the upper left and tinted by height, so the map reads as
// relief rather than flat rings. Where the ground is so steep the lines would crowd into mush they
// fade to their average tone. The pointer raises a hill under it and lights the lines around it,
// and the lines fade out toward the edges so content on top stays clear.
const FLAT = /* glsl */ `
uniform float u_density;   // contour steps across the full height range
uniform float u_thickness; // line width, css px
uniform float u_scale;     // size of the landforms
uniform float u_major;     // every Nth line is an index line; 0 for none
uniform float u_fill;      // tint between the lines by height
uniform float u_relief;    // strength of the hill shading
uniform float u_fade;      // how far the lines fade toward the edges
uniform float u_hill;      // height of the hill the pointer raises
${TERRAIN}

vec3 shade(vec2 frag) {
  float t = u_time * 0.03;
  vec2 css = frag / u_dpr;
  float unit = 560.0 * u_scale; // css px per terrain unit
  vec2 p = css / unit + vec2(t * 0.6, t * 0.25);
  float h = terrain(p, t);

  vec2 dp = (frag - u_pointer) / u_dpr;
  float near = exp(-dot(dp, dp) / (260.0 * 260.0)) * u_pointerAmt;
  float hill = exp(-dot(dp, dp) / (150.0 * 150.0)) * u_pointerAmt * u_hill;
  h += hill * 0.18;

  // hill shading: slope per css px, lit from the upper left
  vec2 slope = vec2(dFdx(h), dFdy(h)) / u_dpr * unit;
  vec3 n = normalize(vec3(-slope * 0.9, 1.0));
  float lambert = dot(n, normalize(vec3(-0.55, 0.6, 0.6))) - 0.6;

  float v = h * u_density;
  float fw = max(fwidth(v), 1e-5);
  float idx = floor(v + 0.5);
  float major = u_major > 0.5 && mod(idx, u_major) < 0.5 ? 1.0 : 0.0;
  // device px to the nearest line, and the line's half width
  float d = abs(fract(v + 0.5) - 0.5) / fw;
  float w = u_thickness * u_dpr * (1.0 + major * 0.7) * (1.0 + hill * 0.5) * 0.5;
  float line = 1.0 - smoothstep(w - 0.65, w + 0.65, d);
  float crowd = smoothstep(0.1, 0.32, w * fw);
  // lines closer together than a few widths blur into their average coverage
  line = mix(line, min(2.0 * w * fw, 1.0) * 0.7, crowd);
  // index lines carry a soft halo on dark pages
  float halo = exp(-d / (6.0 * u_dpr)) * major * (1.0 - crowd) * 0.35 * u_dark;

  // fade toward the edges, softer along the long side
  vec2 e = abs(frag / u_res - 0.5) * 2.0;
  float edge = 1.0 - u_fade * smoothstep(0.35, 1.05, length(e * vec2(0.85, 1.0)));

  // ground: page colour, tinted by height and lit by the slope
  float lift = u_fill * (0.04 + 0.14 * h * h) + u_relief * lambert * mix(0.06, 0.09, u_dark);
  vec3 ground = mix(u_bg, paletteRampLch(mix(0.62, 0.42, u_dark) + (h - 0.5) * 0.4), clamp(lift, 0.0, 1.0));
  ground.x += u_relief * lambert * mix(0.035, 0.03, u_dark);

  // lines: deeper shades on light pages, brighter ones on dark; higher ground and index lines stand out
  float tone = mix(0.12 + 0.4 * h, 0.45 + 0.5 * h, u_dark) + major * mix(-0.08, 0.1, u_dark) + near * mix(-0.05, 0.12, u_dark);
  vec3 ink = paletteRampLch(clamp(tone, 0.0, 1.0));
  float alpha = line * (mix(0.32, 0.3, u_dark) + 0.25 * h + major * 0.38 + near * 0.35);
  vec3 col = mix(ground, ink, clamp(alpha * edge, 0.0, 1.0));
  col = mix(col, ink, clamp(halo * edge, 0.0, 1.0));
  return oklabToLinear(col);
}
`;

// 3D view: the same terrain, raised into real relief and seen from a tilted camera, the contour
// lines drawn on its surface and fading into haze toward the horizon as the land flows slowly
// toward the viewer.
//
// The height field is drawn once a frame into a float texture (a pre-pass), then every pixel casts
// a ray from the camera and steps along it until it dips below the ground, reading heights from
// that texture instead of working out noise at every step. The texture is laid out in inverse
// depth, as the screen is, so near ground gets as many texels as it has pixels and far ground
// isn't wasted on. The hit point's height gives the contour lines, still sized in screen px with
// fwidth, and its slope lights the ground from the far left so ridges stand out from the valleys.
const CAMERA = /* glsl */ `
uniform float u_angle;  // camera tilt down from level, degrees
uniform float u_height; // relief height

const float FOCAL = 1.6;
const float CAM_Y = 2.2;
const float ZMIN = 0.35;
const float ZFAR = 16.0;

vec3 rayDir(vec2 frag) {
  vec2 s = (frag - 0.5 * u_res) / u_res.y;
  float p = radians(u_angle);
  vec3 fwd = vec3(0.0, -sin(p), cos(p));
  vec3 up = vec3(0.0, cos(p), sin(p));
  return normalize(fwd * FOCAL + vec3(s.x, 0.0, 0.0) + up * s.y);
}

// how wide the texture reaches, as x / depth: the frame's half width at its bottom edge, with margin
float spread() {
  float p = radians(u_angle);
  return 2.8 * (0.5 * u_res.x / u_res.y) / max(FOCAL * cos(p) - 0.5 * sin(p), 0.2);
}

// ground position (x, depth) <-> texture uv, in inverse depth
vec2 toUv(vec2 xz) {
  float z = max(xz.y, ZMIN);
  return vec2(0.5 + xz.x / (z * spread()), (1.0 / ZMIN - 1.0 / z) / (1.0 / ZMIN - 1.0 / ZFAR));
}
vec2 fromUv(vec2 uv) {
  float z = 1.0 / (1.0 / ZMIN - uv.y * (1.0 / ZMIN - 1.0 / ZFAR));
  return vec2((uv.x - 0.5) * z * spread(), z);
}

// where the pointer's ray meets the ground, halfway up the relief
vec2 pointerGround() {
  vec3 d = rayDir(u_pointer);
  float t = (CAM_Y - 0.45 * u_height) / max(-d.y, 0.02);
  return (vec3(0.0, CAM_Y, 0.0) + d * t).xz;
}
`;

const HEIGHTS = /* glsl */ `
uniform float u_scale;
uniform float u_hill;
${CAMERA}
${TERRAIN}
float source(vec2 frag) {
  vec2 xz = fromUv(frag / u_res);
  float t = u_time * 0.03;
  vec2 p = (xz + vec2(0.0, u_time * 0.08)) / (1.5 * u_scale);
  float h = (terrain(p, t) - 0.5) * 1.35 + 0.5;
  vec2 dp = xz - pointerGround();
  h += exp(-dot(dp, dp) / 0.5) * u_pointerAmt * u_hill * 0.3;
  // eased into 0.03..0.97 rather than clipped: a clipped peak is a flat plateau, which reads as one
  // solid contour
  float top = 0.8 + 0.17 * (1.0 - exp(-max(h - 0.8, 0.0) / 0.17));
  float bottom = 0.2 - 0.17 * (1.0 - exp(-max(0.2 - h, 0.0) / 0.17));
  return h > 0.8 ? top : h < 0.2 ? bottom : h;
}
`;

const heights = sourcePass(HEIGHTS, 0.75);
// an 8-bit height field would step the contours, so without float targets the flat view is drawn
const heightPass = (gl: WebGL2RenderingContext): Prepass | null =>
  gl.getExtension("EXT_color_buffer_float") ? heights(gl) : null;

const SHADER = /* glsl */ `
uniform sampler2D u_tex;
uniform float u_density;
uniform float u_thickness;
uniform float u_major;
uniform float u_fill;
uniform float u_relief;
uniform float u_fade;   // haze toward the horizon
${CAMERA}

float heightAt(vec2 xz) {
  return textureLod(u_tex, toUv(xz), 0.0).r * 4.0; // stored at a quarter
}

vec3 shade(vec2 frag) {
  vec3 ro = vec3(0.0, CAM_Y, 0.0);
  vec3 rd = rayDir(frag);
  float H = 0.9 * u_height;

  // the haze and the sky: page colour, with a faint glow of the palette along the horizon
  vec3 glowCol = paletteRampLch(mix(0.55, 0.5, u_dark));
  float horizon = exp(-abs(rd.y) * 9.0);
  vec3 sky = mix(u_bg, glowCol, horizon * mix(0.06, 0.14, u_dark) * u_fade);

  if (rd.y > -0.002) return oklabToLinear(sky);
  float t0 = (CAM_Y - H) / -rd.y;
  float t1 = min(CAM_Y / -rd.y, ZFAR * 0.97 / max(rd.z, 0.01));
  if (t0 >= t1) return oklabToLinear(sky);

  // march out in growing steps (even in inverse depth), then close in on the crossing
  float lo = t0;
  float hi = -1.0;
  for (int i = 1; i <= 56; i++) {
    float t = t0 * pow(t1 / t0, float(i) / 56.0);
    vec3 pos = ro + rd * t;
    if (pos.y <= heightAt(pos.xz) * H) {
      hi = t;
      break;
    }
    lo = t;
  }
  if (hi < 0.0) return oklabToLinear(sky);
  for (int i = 0; i < 6; i++) {
    float mid = 0.5 * (lo + hi);
    vec3 pos = ro + rd * mid;
    if (pos.y <= heightAt(pos.xz) * H) hi = mid;
    else lo = mid;
  }
  vec3 pos = ro + rd * hi;
  float z = pos.z;
  float h = heightAt(pos.xz);

  // slope, for the lighting
  float e = 0.012 * z;
  vec2 g = vec2(heightAt(pos.xz + vec2(e, 0.0)) - heightAt(pos.xz - vec2(e, 0.0)), heightAt(pos.xz + vec2(0.0, e)) - heightAt(pos.xz - vec2(0.0, e))) * H / (2.0 * e);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  float lambert = dot(n, normalize(vec3(-0.6, 0.55, 0.55)));
  float facing = clamp(lambert, 0.0, 1.0);

  vec2 dp = pos.xz - pointerGround();
  float near = exp(-dot(dp, dp) / 0.9) * u_pointerAmt;

  float v = h * u_density;
  float fw = max(fwidth(v), 1e-5);
  float idx = floor(v + 0.5);
  float major = u_major > 0.5 && mod(idx, u_major) < 0.5 ? 1.0 : 0.0;
  float d = abs(fract(v + 0.5) - 0.5) / fw;
  // nearer lines draw a little heavier, as they would in perspective
  float w = u_thickness * u_dpr * (1.0 + major * 0.7) * clamp(2.6 / z, 0.7, 1.7) * 0.5;
  float line = 1.0 - smoothstep(w - 0.65, w + 0.65, d);
  float crowd = smoothstep(0.1, 0.32, w * fw);
  line = mix(line, min(2.0 * w * fw, 1.0) * 0.6, crowd);
  // a jump far bigger than any slope is a ridge's silhouette, not crowded lines: draw nothing there
  line *= 1.0 - smoothstep(0.45, 0.9, w * fw);
  float halo = exp(-d / (6.0 * u_dpr)) * major * (1.0 - crowd) * 0.4 * u_dark;

  // ground: page colour tinted by height, lit by its slope; the far side of each ridge falls dark
  vec3 ground = mix(u_bg, paletteRampLch(mix(0.62, 0.4, u_dark) + (h - 0.5) * 0.4), clamp(u_fill * (0.05 + 0.16 * h), 0.0, 1.0));
  ground.x += u_relief * (facing - 0.45) * mix(0.09, 0.07, u_dark);

  float tone = mix(0.12 + 0.4 * h, 0.42 + 0.52 * h, u_dark) + major * mix(-0.08, 0.1, u_dark) + near * mix(-0.05, 0.12, u_dark);
  vec3 ink = paletteRampLch(clamp(tone, 0.0, 1.0));
  // lines on slopes turned from the light dim a little, so the relief reads through them too
  float lit = mix(1.0, 0.55 + 0.45 * facing, u_relief * 0.6);
  float alpha = line * (0.34 + 0.25 * h + major * 0.36 + near * 0.35) * lit;
  vec3 col = mix(ground, ink, clamp(alpha, 0.0, 1.0));
  col = mix(col, ink, clamp(halo * lit, 0.0, 1.0));

  float haze = smoothstep(ZFAR * 0.12, ZFAR * 0.85, z) * u_fade;
  return oklabToLinear(mix(col, sky, clamp(haze, 0.0, 1.0)));
}
`;

const COLOR = "#178a6a";

// darkest first; hue leans cooler in the shadows and warmer in the light
const STEPS: ShadeStep[] = [
  [0.24, 0.55, 0.06],
  [0.4, 0.85, 0.03],
  [0.56, 1, 0],
  [0.72, 0.75, -0.03],
  [0.88, 0.4, -0.06],
];

export type TopographicLinesProps = {
  /** Colour of the lines; drawn in shades of it. */
  color?: string;
  /** Hex colours, 2 to 6, from the lowest ground to the highest. Overrides `color`. */
  colors?: string[];
  /** Draw the terrain in 3D, seen from a tilted camera; off draws a flat map. */
  perspective?: boolean;
  /** Camera tilt down from level in 3D, degrees. */
  angle?: number;
  /** Height of the relief in 3D. */
  height?: number;
  /** How many contour lines span the terrain's full height. */
  density?: number;
  /** Line width, css px. */
  thickness?: number;
  /** Size of the landforms; larger is broader and calmer. */
  scale?: number;
  /** Every Nth line is drawn heavier as an index line; 0 turns them off. */
  major?: number;
  /** Tint between the lines by height, 0 to 1. */
  fill?: number;
  /** Strength of the hill shading under the lines; 0 is flat. */
  relief?: number;
  /** Flat: how far the lines fade toward the edges. 3D: how thick the haze toward the horizon is. */
  fade?: number;
  /** Animation speed; 1 is the designed pace. */
  speed?: number;
  /** Move on its own. Off draws one still frame. */
  animate?: boolean;
  /** Raise a hill under the pointer. */
  interactive?: boolean;
  /** Height of the pointer's hill. */
  hill?: number;
  /** Film grain strength. */
  grain?: number;
  /** Base colour behind the lines; empty follows the page. */
  background?: string;
  className?: string;
  style?: CSSProperties;
  /** Content shown on top of the background. */
  children?: ReactNode;
};

export function TopographicLines({
  color = COLOR,
  colors,
  perspective = true,
  angle = 28,
  height = 1,
  density = 18,
  thickness = 1,
  scale = 1,
  major = 5,
  fill = 0.6,
  relief = 1,
  fade = 0.7,
  speed = 1,
  animate = true,
  interactive = true,
  hill = 1,
  grain = 0.02,
  background,
  ...rest
}: TopographicLinesProps) {
  const palette = paletteOf(color || COLOR, colors, STEPS);

  return (
    <ShaderSurface
      shader={perspective ? SHADER : FLAT}
      plainShader={perspective ? FLAT : undefined}
      prepass={perspective ? heightPass : undefined}
      uniforms={{
        u_angle: angle,
        u_height: height,
        u_density: density,
        u_thickness: thickness,
        u_scale: scale,
        u_major: major,
        u_fill: fill,
        u_relief: relief,
        u_fade: fade,
        u_hill: hill,
      }}
      colors={palette}
      speed={speed}
      animate={animate}
      interactive={interactive}
      follow={0.7}
      grain={grain}
      background={background}
      maxDpr={perspective ? 1.5 : 1.75}
      fallback={(dark, base) =>
        `radial-gradient(ellipse at 30% 40%, ${palette[dark ? palette.length - 1 : 0]}14, transparent 60%), ${base}`
      }
      {...rest}
    />
  );
}
