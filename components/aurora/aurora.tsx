"use client";

import {
  NOISE,
  VERT,
  createProgram,
  type FrameInfo,
  type Prepass,
  ShaderSurface,
  type ShaderBackgroundProps,
} from "../_shader-background/ShaderSurface";
import { firstFrame } from "./first-frame";

// Three soft curtains of light, each a slow wavy band that fades upward and brightens and dims in
// broad folds along its length. On dark pages the light adds up like a glow; on light pages it's laid
// on like thin ink, so it stays visible against white. The curtains lean toward the pointer.

const LAYERS = 5; // most curtains; the pre-pass texture has a row for each

const UNIFORMS = /* glsl */ `
uniform float u_intensity; // brightness of the light
uniform float u_intensityDark; // the same on dark pages
uniform float u_height;    // where the curtains sit, 0 bottom .. 1 top
uniform float u_spread;    // how far the light reaches upward
uniform float u_layers;    // number of curtains, 1..5
uniform float u_wave;      // how much the curtains undulate
uniform float u_stretch;   // horizontal size of the waves
uniform float u_lean;      // how strongly the curtains lean toward the pointer
`;

// One curtain at one column: the height of its edge, its strength, its hue, and how near the pointer
// is. None of it depends on y, so the pre-pass works it out once per column instead of per pixel.
const CURTAIN = /* glsl */ `
vec4 curtain(float fx, float fi) {
  float aspect = u_res.x / u_res.y;
  float x = fx / u_res.x * aspect;
  float t = u_time * 0.09;

  vec2 m = u_pointer / u_res;
  float near = exp(-pow((x - m.x * aspect) * 2.4, 2.0)) * u_pointerAmt * u_lean;
  float xs = x / u_stretch;

  float y0 = u_height - 0.07 * fi
    + u_wave * 0.11 * snoise(vec3(xs * 0.8 + fi * 3.1, t, fi))
    + u_wave * 0.04 * snoise(vec3(xs * 2.2, t * 1.6, fi + 4.0));
  y0 = mix(y0, m.y - 0.06, near * 0.3);

  // broad folds along the curtain, wide enough to read as one blended sheet
  float fold = 0.55 + 0.45 * snoise(vec3(xs * 1.1 + fi * 5.0, t * 0.8, fi + 2.0));
  float hue = xs * 0.16 + t * 0.35 + fi * 0.33 + 0.08 * snoise(vec3(xs * 0.7, t, fi + 9.0));
  return vec4(y0, fold * max(1.0 - 0.18 * fi, 0.25), hue, near);
}
`;

// The light itself, given `vec4 curtainAt(vec2 frag, int i)`: read from the pre-pass, or worked out
// in place where it isn't available.
const SHADE = /* glsl */ `
vec3 shade(vec2 frag) {
  vec2 uv = frag / u_res;
  float intensity = mix(u_intensity, u_intensityDark, u_dark);
  vec3 bg = oklabToLinear(u_bg);
  vec3 glow = vec3(0.0);
  vec3 ink = bg;
  float near = 0.0;

  for (int i = 0; i < ${LAYERS}; i++) {
    float fi = float(i);
    if (fi >= u_layers) break;
    vec4 c = curtainAt(frag, i);
    near = c.w;
    float d = uv.y - c.x;
    float reach = u_spread * (0.75 + 0.3 * fi);
    float a = (d > 0.0 ? exp(-d / reach) : exp(-d * d * 90.0)) * c.y;

    vec3 light = oklabToLinear(paletteLoop(c.z));
    glow += light * a;
    ink = mix(ink, light, clamp(a * intensity * 0.9, 0.0, 1.0));
  }
  glow *= intensity * 0.7 * (1.0 + 0.6 * near);
  return mix(ink, bg + glow, u_dark);
}
`;

const SHADER = /* glsl */ `
${UNIFORMS}
uniform highp sampler2D u_tex; // the pre-pass: one row per curtain, one texel per column
vec4 curtainAt(vec2 frag, int i) { return texelFetch(u_tex, ivec2(int(frag.x), i), 0); }
${SHADE}
`;

const PLAIN = /* glsl */ `
${UNIFORMS}
${CURTAIN}
vec4 curtainAt(vec2 frag, int i) { return curtain(frag.x, float(i)); }
${SHADE}
`;

const PRE = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_pointerAmt;
${UNIFORMS}
out vec4 outColor;
${NOISE}
${CURTAIN}
void main() {
  float fi = floor(gl_FragCoord.y);
  outColor = fi < u_layers ? curtain(gl_FragCoord.x, fi) : vec4(0.0);
}
`;

// Draws every curtain's columns into a canvas-wide float texture, LAYERS rows tall, read back with
// texelFetch so each pixel gets exactly the values it would have worked out itself. Needs float
// render targets; without them it returns null and the surface draws PLAIN, which does it per pixel.
function curtains(gl: WebGL2RenderingContext): Prepass | null {
  if (!gl.getExtension("EXT_color_buffer_float")) return null;
  const program = createProgram(gl, VERT, PRE);
  if (!program) return null;
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  let tw = 0;
  const alloc = (w: number) => {
    tw = w;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, LAYERS, 0, gl.RGBA, gl.FLOAT, null);
    // float textures can't be filtered; texelFetch doesn't, but the texture must still be complete
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  };
  alloc(1);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) {
    gl.deleteProgram(program);
    gl.deleteTexture(tex);
    gl.deleteFramebuffer(fbo);
    return null;
  }
  const locs = new Map<string, WebGLUniformLocation | null>();
  const loc = (name: string) => {
    if (!locs.has(name)) locs.set(name, gl.getUniformLocation(program, name));
    return locs.get(name)!;
  };

  return {
    render(gl, f: FrameInfo) {
      if (f.width !== tw) alloc(f.width);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, tw, LAYERS);
      gl.useProgram(program);
      gl.uniform2f(loc("u_res"), f.width, f.height);
      gl.uniform1f(loc("u_time"), f.time);
      gl.uniform2f(loc("u_pointer"), f.pointer[0], f.pointer[1]);
      gl.uniform1f(loc("u_pointerAmt"), f.pointerAmt);
      for (const [name, value] of Object.entries(f.uniforms)) gl.uniform1f(loc(name), value);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return tex;
    },
    dispose(gl) {
      gl.deleteProgram(program);
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fbo);
    },
  };
}

const COLORS = ["#2dd4a7", "#36c3b4", "#6d74f0", "#41cf9b"];

export type AuroraProps = ShaderBackgroundProps & {
  /** Brightness of the light. */
  intensity?: number;
  /** Brightness on dark pages, where light adds up as a glow; defaults to `intensity`. */
  intensityDark?: number;
  /** Where the curtains sit, 0 at the bottom to 1 at the top. */
  height?: number;
  /** How far the light reaches upward. */
  spread?: number;
  /** Number of curtains, 1 to 5. */
  layers?: number;
  /** How much the curtains undulate; 0 is flat. */
  waviness?: number;
  /** Horizontal size of the waves; larger is broader and calmer. */
  stretch?: number;
  /** How strongly the curtains lean toward the pointer. */
  lean?: number;
  /** Base colour behind the light; empty follows the page. */
  background?: string;
  /** Base colour on dark pages, with `background` as the light one. */
  backgroundDark?: string;
};

export function Aurora({
  colors = COLORS,
  speed = 1,
  animate = true,
  interactive = true,
  grain = 0.02,
  intensity = 1,
  intensityDark,
  height = 0.45,
  spread = 0.2,
  layers = 3,
  waviness = 1,
  stretch = 1,
  lean = 1,
  background = "",
  backgroundDark = "",
  seed = 0,
  ...rest
}: AuroraProps) {
  return (
    <ShaderSurface
      shader={SHADER}
      uniforms={{
        u_intensity: intensity,
        u_intensityDark: intensityDark ?? intensity,
        u_height: height,
        u_spread: spread,
        u_layers: layers,
        u_wave: waviness,
        u_stretch: stretch,
        u_lean: lean,
      }}
      colors={colors}
      speed={speed}
      animate={animate}
      interactive={interactive}
      grain={grain}
      seed={seed}
      background={background}
      backgroundDark={backgroundDark}
      prepass={curtains}
      plainShader={PLAIN}
      // a picture of the first frame, so the shader fades in over itself
      fallback={(dark, base) =>
        firstFrame({ colors, base, dark, intensity: dark ? (intensityDark ?? intensity) : intensity, height, spread, layers, waviness, stretch, seed })
      }
      {...rest}
    />
  );
}
