import { hexToOklab } from "./ShaderSurface";

/** One shade: OKLCH lightness, chroma as a share of the base colour's, and a hue lean in radians. */
export type ShadeStep = readonly [l: number, chroma: number, hue: number];

const encode = (c: number) => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, "0");
};

// OKLCH -> hex, cutting chroma until the colour fits in sRGB so no shade clips to a harsher hue
export function lchToHex(l: number, c: number, h: number) {
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

/** Shades of one colour, one per step, in the order the steps are given. */
export function shadesOf(hex: string, steps: readonly ShadeStep[]) {
  const [, a, b] = hexToOklab(hex);
  const c = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  return steps.map(([l, k, dh]) => lchToHex(l, c * k, h + dh));
}

/** `colors` when it holds 2 or more, else shades of `color`. */
export function paletteOf(color: string, colors: string[] | undefined, steps: readonly ShadeStep[]) {
  const list = colors?.filter(Boolean).slice(0, 6);
  return list && list.length >= 2 ? list : shadesOf(color, steps);
}
