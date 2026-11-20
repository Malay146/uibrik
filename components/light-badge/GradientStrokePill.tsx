"use client";

import { forwardRef, type ReactNode, useEffect, useRef, useState, type RefObject } from "react";
import { getRenderer, type BadgeHandle, type BadgeOptions } from "./renderer";

/**
 * Wrap content that should catch a badge's light (pass the ref to the badge as `castOn`).
 *
 * A canvas sits over the content and the badge draws its light into it, cut to the exact shape of
 * the text, so the light lands on the letters and never on the background around them.
 */
const LightCatcher = forwardRef<
  HTMLCanvasElement,
  { children: ReactNode; className?: string }
>(function LightCatcher({ children, className = "" }, ref) {
  return (
    <div className={`relative ${className}`}>
      {children}
      <canvas
        ref={ref}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
      />
    </div>
  );
});

export { LightCatcher };

/**
 * A badge lit from its bottom edge, drawn by a WebGL2 shader (see shader.ts).
 *
 * All badges on a page share one WebGL context (see renderer.ts), are only drawn while on screen,
 * and drop to a lighter quality on slow devices. Without WebGL2 the badge falls back to CSS: a
 * gradient border with a soft coloured light underneath.
 */

type Props = Partial<Omit<BadgeOptions, "colors">> & {
  colors?: string[];
  children: ReactNode;
  className?: string;
  /** a canvas laid over content below (see LightCatcher) that this badge's light falls onto */
  castOn?: RefObject<HTMLCanvasElement | null>;
};

const DEFAULTS: BadgeOptions = {
  stroke: 1.5,
  radius: 16,
  ray: 0.55, // strength of the light rays under the badge
  inner: 0.5, // strength of the inner waves
  rayLength: 11, // how far the rays fall, css px
  pad: 36, // room around the badge for the rays to fade out (about 3x rayLength)
  period: 3.6, // seconds per 360° turn of the stroke gradient
  fill: "#fafafa", // badge background, light theme
  darkFill: "#18181b", // badge background, dark theme (follows the `dark` class on <html>)
  border: "#e7e7e7", // plain hairline on the rest of the outline, light theme
  darkBorder: "#2c2c31", // the same, dark theme
  // cool, calm family: sea-teal through cyan and azure to a muted cobalt and back
  colors: ["#34c1b0", "#2fb4d2", "#3a9ef2", "#5a82ea", "#4a93ef", "#2fbac7"],
  hover: true,
  hoverIntensity: 0.4, // 40% brighter while hovered
  hoverSpeed: 0.45, // waves run 45% faster while hovered
  follow: true,
  followStrength: 0.3, // leans at most 30% of the way toward the pointer: a hint, not a chase
  followRange: 220, // css px: how near the pointer must be for the light to notice it
  cast: 0.75, // strength of the light falling onto content below (needs castOn)
  castLength: 46, // how far that light reaches, css px
};

export default function GradientStrokePill({
  children,
  className = "",
  castOn,
  ...rest
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<BadgeHandle | null>(null);
  const [fallback, setFallback] = useState(false);
  const opts: BadgeOptions = { ...DEFAULTS, ...rest } as BadgeOptions;
  const key = JSON.stringify(opts); // options are plain values, so this tracks real changes

  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const r = getRenderer();
    if (!r) {
      // no WebGL2 at all: show the CSS version instead
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFallback(true);
      return;
    }
    const h = r.add(el, cv, JSON.parse(key));
    handle.current = h;
    if (h && castOn?.current) r.setCast(h, castOn.current);
    return () => {
      if (h) r.remove(h);
      handle.current = null;
    };
    // registered once; option changes are pushed below without rebuilding
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const r = getRenderer();
    if (r && handle.current) r.update(handle.current, JSON.parse(key));
  }, [key]);

  const css = fallback
    ? {
        // padding-box fill over a border-box gradient: a gradient hairline, then a soft light below
        border: `${opts.stroke}px solid transparent`,
        borderRadius: opts.radius,
        background: `linear-gradient(var(--badge-fill), var(--badge-fill)) padding-box, linear-gradient(90deg, ${opts.colors.join(", ")}) border-box`,
        boxShadow: `0 10px 22px -12px ${opts.colors[2]}`,
        ["--badge-fill" as string]: opts.fill,
      }
    : undefined;

  return (
    <div
      ref={box}
      className={`relative inline-flex items-center justify-center ${fallback ? "dark:[--badge-fill:#18181b]" : ""} ${className}`}
      style={css}
    >
      {!fallback && (
        <canvas
          ref={canvas}
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{ left: -opts.pad, top: -opts.pad }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
export { GradientStrokePill };
