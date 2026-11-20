"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useSpring, useTransform } from "motion/react";
import NumberFlow from "@number-flow/react";
import { IconCircleCheckFilled } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// A plain progress bar with a liquid feel. The fill is a run of tones of one
// colour pinned to the track, so it brightens as it reaches further; a soft
// shine along its top reads as a rounded surface, and the front eases in on a
// spring that only just overshoots, so it settles with a small wobble when
// progress pauses. Only clip-path moves, so nothing lays out while it runs.
// When the fill reaches the end, the label turns into a completed status with
// a check, and one pass of light runs along the bar to mark the moment.

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export type LiquidProgressProps = {
  /** Progress from 0 to 100. */
  value: number;
  /** Names what's loading. Also the progress bar's accessible name. */
  label?: string;
  /** Status shown with a check once the fill reaches the end. */
  doneLabel?: string;
  /**
   * Colour of the fill, drawn as a run of its tones: deeper and cooler where
   * the track starts, brighter and warmer toward its end.
   */
  color?: string;
  /** Height of the track in px. */
  height?: number;
  /** Show the percentage beside the label. */
  showValue?: boolean;
  /** Called once when the fill reaches the end. */
  onComplete?: () => void;
  className?: string;
};

export function LiquidProgress({
  value,
  label = "Uploading",
  doneLabel = "Completed",
  color = "#16a34a",
  height = 12,
  showValue = true,
  onComplete,
  className,
}: LiquidProgressProps) {
  const pct = Math.min(100, Math.max(0, value));
  const reduce = useReducedMotion();
  const fill = useSpring(pct, { stiffness: 120, damping: 15, mass: 1 });
  const tones = useMemo(() => tonesOf(color), [color]);
  const radius = height / 2;
  // The front never pokes past the end, even while it overshoots.
  const clipPath = useTransform(fill, (v) => `inset(0 ${100 - Math.min(100, Math.max(0, v))}% 0 0 round ${radius}px)`);

  useEffect(() => {
    if (reduce) fill.jump(pct);
    else fill.set(pct);
  }, [pct, reduce, fill]);

  // Complete once the fill has actually arrived, not when the value jumps to
  // 100, so the status never shows ahead of the bar.
  const [complete, setComplete] = useState(pct >= 100);
  if (complete && pct < 100) setComplete(false);
  useMotionValueEvent(fill, "change", (v) => {
    if (v >= 99.5 && pct >= 100 && !complete) {
      setComplete(true);
      onComplete?.();
    }
  });

  return (
    <div className={cn("w-full max-w-md", className)}>
      <div className="flex items-center justify-between gap-4 px-0.5 text-[13px] font-medium">
        {/* Both states share one grid cell, so the row never changes height as they swap. */}
        <span className="grid min-w-0">
          <Swap shown={!complete} exitY={-6}>
            <span className="truncate text-foreground">{label}</span>
          </Swap>
          <Swap shown={complete} exitY={6}>
            <IconCircleCheckFilled size={16} className="shrink-0" style={{ color: tones[1] }} />
            <span className="truncate text-foreground">{doneLabel}</span>
          </Swap>
        </span>
        {showValue && (
          <motion.span
            initial={false}
            animate={{ opacity: complete ? 0 : 1 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            aria-hidden={complete}
          >
            <NumberFlow
              value={pct / 100}
              locales="en-US"
              format={{ style: "percent", maximumFractionDigits: 0 }}
              className="tabular-nums text-muted-foreground"
            />
          </motion.span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="relative mt-2 overflow-hidden bg-foreground/[0.07] shadow-[inset_0_1px_2px_rgb(0_0_0/0.08)] dark:bg-foreground/[0.09]"
        style={{ height, borderRadius: radius }}
      >
        <motion.div
          aria-hidden
          className="absolute inset-0"
          style={{
            clipPath,
            borderRadius: radius,
            backgroundImage: `linear-gradient(90deg, ${tones.join(", ")})`,
          }}
        >
          {/* Shine on the top half and a little shade underneath read as a rounded surface. */}
          <span className="absolute inset-0 bg-[linear-gradient(180deg,rgb(255_255_255/0.4)_0%,rgb(255_255_255/0.08)_45%,transparent_55%,rgb(0_0_0/0.1)_100%)]" />
          <span
            className="absolute inset-x-[3px] bg-white/45 blur-[0.5px] dark:bg-white/30"
            style={{ top: Math.max(1.5, height * 0.16), height: Math.max(1, height * 0.1), borderRadius: 999 }}
          />
          {/* One pass of light along the full bar when it completes. */}
          {complete && !reduce && (
            <motion.span
              className="absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.55),transparent)]"
              initial={{ x: "-100%" }}
              animate={{ x: "300%" }}
              transition={{ duration: 0.7, ease: EASE_OUT }}
            />
          )}
        </motion.div>
      </div>
      <span className="sr-only" aria-live="polite">
        {complete ? doneLabel : ""}
      </span>
    </div>
  );
}

function Swap({ shown, exitY, children }: { shown: boolean; exitY: number; children: ReactNode }) {
  return (
    <motion.span
      initial={false}
      animate={shown ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: exitY, filter: "blur(2px)" }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      aria-hidden={!shown}
      className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5"
    >
      {children}
    </motion.span>
  );
}

// ─── Colour ───────────────────────────────────────────────────────────────────
// Tones built in OKLCH from the one colour: the start is deeper and leans cool
// (green toward teal), the end is brighter and leans warm (green toward lime),
// so the bar reads as one liquid catching more light rather than a rainbow.

const TONES: [l: number, chroma: number, hue: number][] = [
  [0.52, 0.95, 0.3],
  [0.64, 1, 0],
  [0.8, 0.95, -0.36],
];

function tonesOf(color: string) {
  const rgb = parseHex(color);
  if (!rgb) return [color, color];
  const [, c, h] = toLch(rgb);
  return TONES.map(([l, k, dh]) => {
    const [r, g, b] = fromLch(l, c * k, h + dh);
    return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
  });
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function toLch(rgb: number[]): [number, number, number] {
  const [r, g, b] = rgb.map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

// OKLCH to sRGB in 0–1, cutting chroma until it fits so no tone clips to a harsher hue.
function fromLch(l: number, c: number, h: number) {
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
    if (rgb.every((v) => v >= -0.001 && v <= 1.001) || i === 23) return rgb.map((v) => toSrgb(Math.min(1, Math.max(0, v))));
  }
  return [0, 0, 0];
}

function parseHex(s: string) {
  const m = s.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
