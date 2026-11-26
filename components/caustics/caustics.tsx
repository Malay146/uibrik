"use client";

import { NOISE, createProgram, type FrameInfo, type Prepass, ShaderSurface, type ShaderBackgroundProps } from "../_shader-background/ShaderSurface";

/**
 * The light pass for Caustics, done the way real caustics form (after Evan Wallace's WebGL Water).
 *
 * A grid of light rays falls on a moving water surface. Each ray is bent by the slope of the
 * surface where it enters (Snell's law, small-angle) and lands on the floor a little to the side.
 * The grid is drawn as a mesh at those landing points, and each triangle's brightness is how much it
 * shrank on the way: area before / area after. Where the surface focuses rays, triangles shrink and
 * pile up, and the familiar bright web appears, with its real shapes: soft cells, sharp cusps, lines
 * that split and merge as the waves move.
 *
 * Red, green and blue are drawn separately, each bent a touch differently, which gives the faint
 * colour fringing real caustics have. The result goes into a two-thirds-size texture, a little
 * soft, the way light from a sun disk is, with mipmaps the main pass reads its bloom from.
 */

const GRID = 240; // cells per side (241² vertices still fits 16-bit indices)

const VERT = /* glsl */ `#version 300 es
precision highp float;
in vec2 a_pos;            // 0..1 across the light grid

uniform vec2 u_size;      // canvas size, device px
uniform float u_dpr;
uniform float u_time;
uniform float u_scale;    // size of the waves
uniform float u_waves;    // wave height
uniform float u_depth;    // how far below the surface the floor is: how strongly light focuses
uniform float u_channel;  // per-colour change in refraction
uniform float u_chop;     // irregular chop on top of the wave trains
uniform float u_direction; // the direction the main waves travel, degrees
uniform float u_rippleStrength;
uniform float u_rippleSize;  // wavelength of a click ripple
uniform float u_rippleSpeed;
uniform float u_touch;    // depth of the dip under the pointer
uniform vec2 u_pointer;   // device px, y up
uniform float u_pointerAmt;
uniform vec3 u_ripples[8]; // matches RIPPLE_COUNT in ShaderSurface

out vec2 v_old;
out vec2 v_new;

${NOISE}

// water height at p (in wave units); px is the same point in device px
float height(vec2 p, vec2 px, float unit) {
  float t = u_time * 0.6;
  float h = 0.0;
  // a handful of wave trains from scattered directions; longer waves move faster, as on deep water
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ang = radians(u_direction) + fi * 2.39996;
    vec2 d = vec2(cos(ang), sin(ang));
    float k = 1.0 + fi * 0.55;
    h += sin(dot(d, p) * k * 2.0 + t * sqrt(k) * 1.4 + fi * 1.7) / k;
  }
  // and some irregular chop, so it never looks like a pattern
  h += u_chop * snoise(vec3(p * 1.4, t * 0.45));
  h *= u_waves;

  // rings from clicks
  for (int i = 0; i < 8; i++) {
    vec3 r = u_ripples[i];
    if (r.z < 0.0 || r.z > 3.0) continue;
    float d = (length(px - r.xy) / unit - r.z * 1.8 * u_rippleSpeed) / u_rippleSize;
    float life = 1.0 - r.z / 3.0;
    h += 0.3 * u_rippleStrength * sin(d * 9.0) * exp(-d * d * 3.0) * life * life;
  }
  // a gentle dip under the pointer, like a fingertip resting on the water
  vec2 dp = (px - u_pointer) / unit;
  h -= u_touch * exp(-dot(dp, dp) * 6.0) * u_pointerAmt;
  return h;
}

void main() {
  vec2 px = mix(vec2(-0.1), vec2(1.1), a_pos) * u_size;
  float unit = 240.0 * u_scale * u_dpr;
  vec2 p = px / unit;
  float e = 0.02;
  vec2 slope = vec2(
    height(p + vec2(e, 0.0), px + vec2(e * unit, 0.0), unit) - height(p - vec2(e, 0.0), px - vec2(e * unit, 0.0), unit),
    height(p + vec2(0.0, e), px + vec2(0.0, e * unit), unit) - height(p - vec2(0.0, e), px - vec2(0.0, e * unit), unit)
  ) / (2.0 * e);
  vec2 landed = px - slope * u_depth * (1.0 + u_channel) * unit * 0.05;
  v_old = px;
  v_new = landed;
  gl_Position = vec4(landed / u_size * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_old;
in vec2 v_new;
out vec4 outColor;
void main() {
  // brightness = how much this bit of the grid shrank on its way to the floor
  float before = length(dFdx(v_old)) * length(dFdy(v_old));
  float after = length(dFdx(v_new)) * length(dFdy(v_new));
  // stored at a quarter, so an 8-bit target still holds up to 4x the plain light
  // capped, so a triangle squashed almost flat can't turn into a spike of light
  outColor = vec4(vec3(min(before / max(after, 1e-6), 12.0) * 0.25), 1.0);
}
`;

export function causticsLight(gl: WebGL2RenderingContext): Prepass | null {
  const program = createProgram(gl, VERT, FRAG);
  if (!program) return null;

  // the grid, as triangles over 0..1
  const n = GRID + 1;
  const verts = new Float32Array(n * n * 2);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) verts.set([x / GRID, y / GRID], (y * n + x) * 2);
  const idx = new Uint16Array(GRID * GRID * 6);
  let k = 0;
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      const i = y * n + x;
      idx.set([i, i + 1, i + n, i + 1, i + n + 1, i + n], k);
      k += 6;
    }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  // half-float target where the GPU can render to it, 8-bit otherwise
  const half = !!gl.getExtension("EXT_color_buffer_float");
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  let tw = 0;
  let th = 0;

  const locs = new Map<string, WebGLUniformLocation | null>();
  const loc = (name: string) => {
    if (!locs.has(name)) locs.set(name, gl.getUniformLocation(program, name));
    return locs.get(name)!;
  };

  return {
    render(gl, f: FrameInfo) {
      // two-thirds resolution: fine enough for thin lines, still a little soft like real sunlight
      const w = Math.max(1, Math.round(f.width / 1.5));
      const h = Math.max(1, Math.round(f.height / 1.5));
      if (w !== tw || h !== th) {
        tw = w;
        th = h;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        if (half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        // mipmapped: the blurred levels give the main pass its bloom for free
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
      gl.colorMask(true, true, true, true);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(loc("u_size"), f.width, f.height);
      gl.uniform1f(loc("u_dpr"), f.dpr);
      gl.uniform1f(loc("u_time"), f.time);
      gl.uniform1f(loc("u_scale"), f.uniforms.u_scale ?? 1);
      gl.uniform1f(loc("u_waves"), f.uniforms.u_waves ?? 1);
      gl.uniform1f(loc("u_depth"), f.uniforms.u_depth ?? 1);
      gl.uniform1f(loc("u_chop"), f.uniforms.u_chop ?? 0.55);
      gl.uniform1f(loc("u_direction"), f.uniforms.u_direction ?? 23);
      gl.uniform1f(loc("u_rippleStrength"), f.uniforms.u_rippleStrength ?? 0.35);
      gl.uniform1f(loc("u_rippleSize"), f.uniforms.u_rippleSize ?? 1);
      gl.uniform1f(loc("u_rippleSpeed"), f.uniforms.u_rippleSpeed ?? 1);
      gl.uniform1f(loc("u_touch"), f.uniforms.u_touch ?? 0.5);
      gl.uniform2f(loc("u_pointer"), f.pointer[0], f.pointer[1]);
      gl.uniform1f(loc("u_pointerAmt"), f.pointerAmt);
      gl.uniform3fv(loc("u_ripples"), f.ripples);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      const split = (f.uniforms.u_dispersion ?? 0.5) * 0.04;
      const channels: [boolean, boolean, boolean, number][] = [
        [true, false, false, -split],
        [false, true, false, 0],
        [false, false, true, split],
      ];
      for (const [r, g, b, c] of channels) {
        gl.colorMask(r, g, b, false);
        gl.uniform1f(loc("u_channel"), c);
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      }
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.generateMipmap(gl.TEXTURE_2D);
      return tex;
    },
    dispose(gl) {
      gl.deleteProgram(program);
      gl.deleteBuffer(vbo);
      gl.deleteBuffer(ibo);
      gl.deleteVertexArray(vao);
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fbo);
    },
  };
}

// Sunlight on a pool floor. The light itself is worked out in light.ts by bending real rays through
// a moving water surface; this pass lays it over the floor. The floor takes the colour list from
// deep to shallow (all but the last colour), the light is tinted by the last colour, and the light
// multiplies the floor colour the way light does, so bright cores lift toward the sun's tint
// instead of being painted on top.
const SHADER = /* glsl */ `
uniform sampler2D u_tex;   // caustic light, a quarter of its real value per channel
uniform float u_strength;  // how strong the light is against the plain floor
uniform float u_scale;
uniform float u_shade;     // how much the floor colour varies
uniform float u_softness;  // blur on the light, like a larger sun
uniform float u_vignette;  // darkening toward the corners
uniform float u_bloom;     // glow spilling around the brightest light
uniform float u_sparkle;   // star glints where the light peaks
uniform float u_sparkleSize; // length of the glint rays
uniform float u_rayAngle;  // direction of the long glint rays, degrees

vec3 lightAt(vec2 uv) {
  return textureLod(u_tex, uv, 0.0).rgb * 4.0;
}

vec3 shade(vec2 frag) {
  vec2 uv = frag / u_res;
  vec3 light = texture(u_tex, uv).rgb * 4.0;
  if (u_softness > 0.0) {
    vec2 o = u_softness * 6.0 * u_dpr / u_res;
    light = light * 0.4 + (
      texture(u_tex, uv + vec2(o.x, 0.0)).rgb + texture(u_tex, uv - vec2(o.x, 0.0)).rgb +
      texture(u_tex, uv + vec2(0.0, o.y)).rgb + texture(u_tex, uv - vec2(0.0, o.y)).rgb
    ) * 0.6;
  }

  // the floor: slow, broad variation between the deeper and shallower colours
  float t = u_time * 0.03;
  vec2 p = frag / u_res.y / u_scale;
  float n = snoise(vec3(p * 0.8, t)) * 0.6 + snoise(vec3(p * 2.1 + 4.0, t * 1.4)) * 0.25;
  float top = float(u_count - 2) / float(u_count - 1); // the last colour is the light
  vec3 floorLab = paletteRamp(clamp(0.5 + 0.5 * n * u_shade, 0.0, 1.0) * top);
  vec3 floorCol = oklabToLinear(floorLab);
  vec3 sun = oklabToLinear(u_colors[u_count - 1]);

  // plain light is 1; focused light is more, the gaps between less
  vec3 lit = mix(vec3(1.0), light, u_strength);
  vec3 c = floorCol * (0.62 + 0.38 * lit) + sun * max(lit - 1.0, 0.0) * 0.16 * u_strength;
  // bloom: the light above plain daylight spills softly around itself, read from two blurred
  // (mipmap) levels of the light texture: smooth, and no extra samples
  if (u_bloom > 0.0) {
    vec3 wide = (textureLod(u_tex, uv, 1.5).rgb * 0.55 + textureLod(u_tex, uv, 3.0).rgb * 0.45) * 4.0;
    vec3 excess = max(wide - 1.0, 0.0) * 0.8;
    c += mix(sun, vec3(1.0), 0.5) * excess * u_bloom * 0.45 * u_strength;
  }

  // sun glints: a soft star wherever the light peaks. One candidate spot per cell, lit only when
  // the caustic light there is at its brightest; it twinkles, and its rays taper off softly.
  if (u_sparkle > 0.0) {
    float cs = 70.0 * max(u_sparkleSize, 1.0) * u_dpr;
    vec2 home = floor(frag / cs);
    float ra = radians(u_rayAngle);
    vec2 d1 = vec2(cos(ra), sin(ra));
    vec2 d2 = vec2(-d1.y, d1.x);
    float star = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 cell = home + vec2(float(i), float(j));
        vec2 spot = (cell + 0.2 + 0.6 * vec2(hash12(cell + 1.3), hash12(cell + 5.1))) * cs;
        float peak = smoothstep(1.1, 1.8, dot(lightAt(spot / u_res), vec3(0.3333)));
        if (peak <= 0.0) continue;
        float tw = 0.55 + 0.45 * sin(u_time * (2.0 + 2.0 * hash12(cell + 2.2)) + hash12(cell) * 40.0);
        vec2 d = frag - spot;
        float L = 34.0 * u_sparkleSize * u_dpr * (0.6 + 0.8 * hash12(cell + 9.0));
        float w = 1.1 * u_dpr;
        float along1 = dot(d, d1);
        float along2 = dot(d, d2);
        float core = exp(-dot(d, d) / pow(3.5 * u_dpr * u_sparkleSize, 2.0));
        float halo = exp(-dot(d, d) / pow(L * 0.55, 2.0)) * 0.45;
        float ray1 = exp(-pow(along2 / w, 2.0)) * exp(-pow(along1 / L, 2.0));
        float ray2 = exp(-pow(along1 / w, 2.0)) * exp(-pow(along2 / (L * 0.55), 2.0));
        star += (core + halo + 0.7 * ray1 + 0.4 * ray2) * peak * tw;
      }
    }
    c += mix(sun, vec3(1.0), 0.6) * star * u_sparkle * 0.55;
  }

  // depth haze: the far corners sink a little
  c *= 1.0 - 0.5 * u_vignette * dot(uv - 0.5, uv - 0.5);
  return c;
}
`;

const COLORS = ["#0b3a53", "#0f6f8f", "#3fb6c9", "#e6fbff"];

export type CausticsProps = ShaderBackgroundProps & {
  /** Size of the waves; larger is calmer. */
  scale?: number;
  /** Wave height. */
  waves?: number;
  /** Floor depth: deeper water focuses the light into thinner, brighter lines. */
  depth?: number;
  /** How strong the light is against the plain floor. */
  strength?: number;
  /** Colour fringing at the edges of the light. */
  dispersion?: number;
  /** How much the floor colour varies. */
  shade?: number;
  /** Irregular chop on top of the wave trains; 0 leaves only smooth swells. */
  chop?: number;
  /** Direction the main waves travel, in degrees. */
  direction?: number;
  /** Blur on the light, like a larger sun. */
  softness?: number;
  /** Darkening toward the corners. */
  vignette?: number;
  /** Glow spilling around the brightest light. */
  bloom?: number;
  /** Star-shaped sun glints where the light peaks. */
  sparkle?: number;
  /** Length of the glint rays. */
  sparkleSize?: number;
  /** Direction of the long glint rays, in degrees. */
  rayAngle?: number;
  /** A click drops a ripple on the water. */
  ripples?: boolean;
  /** Height of a click ripple. */
  rippleStrength?: number;
  /** Wavelength of a click ripple; larger is broader. */
  rippleSize?: number;
  /** How fast a ripple spreads. */
  rippleSpeed?: number;
  /** How deep the pointer dips into the water. */
  touch?: number;
  /** How lazily the fingertip dip follows the pointer, 0 (locked) to 1 (drifts after it). */
  follow?: number;
};

export function Caustics({
  colors = COLORS,
  speed = 1,
  animate = true,
  interactive = true,
  grain = 0.015,
  seed = 0,
  scale = 1,
  waves = 0.35,
  depth = 1.4,
  strength = 0.6,
  dispersion = 0.5,
  shade = 0.8,
  chop = 0.55,
  direction = 23,
  softness = 0.05,
  vignette = 0.25,
  bloom = 1.1,
  sparkle = 1.25,
  sparkleSize = 1,
  rayAngle = 70,
  ripples = true,
  rippleStrength = 0.35,
  rippleSize = 1,
  rippleSpeed = 1,
  touch = 0.5,
  follow = 0.75,
  ...rest
}: CausticsProps) {
  return (
    <ShaderSurface
      shader={SHADER}
      prepass={causticsLight}
      uniforms={{
        u_scale: scale,
        u_waves: waves,
        u_depth: depth,
        u_strength: strength,
        u_dispersion: dispersion,
        u_shade: shade,
        u_chop: chop,
        u_direction: direction,
        u_softness: softness,
        u_vignette: vignette,
        u_bloom: bloom,
        u_sparkle: sparkle,
        u_sparkleSize: sparkleSize,
        u_rayAngle: rayAngle,
        u_rippleStrength: rippleStrength,
        u_rippleSize: rippleSize,
        u_rippleSpeed: rippleSpeed,
        u_touch: touch,
      }}
      colors={colors}
      speed={speed}
      animate={animate}
      interactive={interactive}
      grain={grain}
      seed={seed}
      ripples={ripples}
      follow={follow}
      fallback={() =>
        `radial-gradient(at 30% 20%, ${colors[colors.length - 1]}40, transparent 55%), linear-gradient(160deg, ${colors.slice(0, -1).join(", ")})`
      }
      {...rest}
    />
  );
}
