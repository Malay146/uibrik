"use client";

// Everything the charts share, in one file: colours and motion, scales and
// paths, number formats, sample data, axis labels, and the card, tooltip and
// legend every chart is built from. Copy this one file next to a chart.

import { useId, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import NumberFlow from "@number-flow/react";
import useMeasure from "react-use-measure";
import { IconArrowDownRight, IconArrowUpRight } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// ═══ Theme ═══════════════════════════════════════════════════════════════════

// Shared look for every chart: colours, motion and sizes. Charts read colours
// through CSS variables, so light and dark each get their own validated steps
// and a single `accent` prop can still take over the first series.


// ─── Colour ───────────────────────────────────────────────────────────────────
// Categorical series, in a fixed order that keeps neighbours apart for
// colour-blind readers. Series take slots in order and keep them when others
// are hidden, so a colour always means the same thing.

/**
 * Put on a chart's outer element. Defines `--series-1` … `--series-6`, with
 * steps of their own for dark mode. Written out in full so Tailwind can see
 * every class.
 */
export const SERIES_VARS =
  "[--series-1:#2a78d6] [--series-2:#eb6834] [--series-3:#1baf7a] [--series-4:#eda100] [--series-5:#e87ba4] [--series-6:#6250d6] " +
  "dark:[--series-1:#3987e5] dark:[--series-2:#d95926] dark:[--series-3:#199e70] dark:[--series-4:#c98500] dark:[--series-5:#d55181] dark:[--series-6:#9085e9]";

export const SERIES_COUNT = 6;

/** Colour for the series in slot `i` (0-based); past the palette it repeats. */
export const seriesColor = (i: number) => `var(--series-${(i % SERIES_COUNT) + 1})`;

/** Lets an `accent` prop replace the first series colour. Empty keeps the palette. */
export const accentVars = (accent?: string): CSSProperties | undefined =>
  accent ? ({ "--series-1": accent } as CSSProperties) : undefined;

/**
 * Status colours, kept apart from the series colours so a state never looks
 * like a series. Always pair one with a label or icon, never colour alone.
 */
export const STATUS = {
  good: "#22c55e",
  warning: "#f5a524",
  critical: "#ef4444",
  /** No data. */
  empty: "color-mix(in srgb, var(--foreground) 10%, transparent)",
} as const;

export type Status = keyof typeof STATUS;

/** `color` at `percent`% strength over transparent, for washes and tracks. */
export const tint = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

/** Hairline grid and empty track: the foreground at low strength. */
export const GRID = tint("var(--foreground)", 8);
export const TRACK = tint("var(--foreground)", 7);

// ─── Motion ───────────────────────────────────────────────────────────────────
/** Strong ease-out for entrances and value changes. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** Ease-in-out for shapes that are on screen the whole time they move. */
export const EASE_IN_OUT = [0.45, 0, 0.2, 1] as const;
/** Tooltips and crosshairs: quick, with no overshoot. */
export const FOLLOW = { type: "spring", stiffness: 700, damping: 45 } as const;
/** Marks settling into a new value or position. */
export const SETTLE = { type: "spring", bounce: 0, duration: 0.5 } as const;
/** How long a line or bar takes to draw in on mount, in seconds. */
export const DRAW_IN = 0.6;

// ─── Marks ────────────────────────────────────────────────────────────────────
/** Line stroke width in px. */
export const LINE = 2;
/** Radius of an end or hover dot in px; it also gets a 2px ring of the background. */
export const DOT = 4;
/** Most a bar can be across, in px. The rest of its slot is air. */
export const BAR_MAX = 24;
/** Corner radius on a bar's value end, in px. */
export const BAR_RADIUS = 4;
/** Gap between touching marks, in px. */
export const GAP = 2;
/** Area fill strength under a line, in percent. */
export const AREA = 14;

// ═══ Scale ═══════════════════════════════════════════════════════════════════

// Scales, ticks and paths: the small amount of maths every chart needs.

/** Maps `domain` onto `range` in a straight line. */
export function linear([d0, d1]: readonly [number, number], [r0, r1]: readonly [number, number]) {
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Smallest and largest of `values`; [0, 0] when empty. */
export function extent(values: readonly number[]): [number, number] {
  if (!values.length) return [0, 0];
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/** A round step near `span / count`: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(span: number, count: number) {
  const raw = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return nice * power;
}

/**
 * Round tick values covering [min, max], about `count` of them. The first and
 * last ticks become the scale's domain, so the grid always ends on a label.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    if (min === 0) return [0, 1];
    [min, max] = min > 0 ? [0, max] : [min, 0];
  }
  const step = niceStep(max - min, count);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  // Rounded so float drift never shows up as 0.30000000000000004.
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/** Index of the point in `xs` (sorted ascending) closest to `x`. */
export function nearest(xs: readonly number[], x: number) {
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[hi] - x) < Math.abs(xs[lo] - x) ? hi : lo;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ─── Paths ────────────────────────────────────────────────────────────────────

export type Point = readonly [x: number, y: number];

/**
 * A smooth line through every point that never overshoots them (monotone cubic,
 * like d3's curveMonotoneX), so peaks and dips stay where the data puts them.
 */
export function linePath(points: readonly Point[]) {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0][0]},${points[0][1]}`;
  if (n === 2) return `M${points[0][0]},${points[0][1]}L${points[1][0]},${points[1][1]}`;

  // Secant slopes, then tangents limited so each segment stays monotone.
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1][0] - points[i][0];
    slope[i] = dx[i] ? (points[i + 1][1] - points[i][1]) / dx[i] : 0;
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1];
    const b = slope[i];
    tangent[i] = a * b <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / a + (dx[i] + 2 * dx[i - 1]) / b);
  }
  tangent[n - 1] = slope[n - 2];

  const f = (v: number) => Math.round(v * 100) / 100;
  let d = `M${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const h = dx[i] / 3;
    d += `C${f(x0 + h)},${f(y0 + h * tangent[i])},${f(x1 - h)},${f(y1 - h * tangent[i + 1])},${f(x1)},${f(y1)}`;
  }
  return d;
}

/** The line closed down to `baseY`, for an area fill under it. */
export function areaPath(points: readonly Point[], baseY: number) {
  if (points.length < 2) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)}L${last[0]},${baseY}L${first[0]},${baseY}Z`;
}

/**
 * A bar with rounded corners on its value end and square corners on its
 * baseline. `x`, `y`, `w`, `h` describe the box; `from` is the baseline side.
 */
export function barPath(x: number, y: number, w: number, h: number, r: number, from: "bottom" | "left" = "bottom") {
  if (w <= 0 || h <= 0) return "";
  if (from === "bottom") {
    const rr = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
  }
  const rr = Math.min(r, h / 2, w);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}

// ═══ Format ══════════════════════════════════════════════════════════════════

// Number formatting shared by every chart. A chart takes one `format` prop
// (plain Intl.NumberFormat options), so the headline, tooltip, axis and table
// all agree, and NumberFlow can animate with the same options.

export type ValueFormat = Intl.NumberFormatOptions & {
  notation?: "standard" | "compact";
};

const LOCALE = "en-US";
const cache = new Map<string, Intl.NumberFormat>();

const formatter = (format: ValueFormat) => {
  const key = JSON.stringify(format);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, format);
    cache.set(key, f);
  }
  return f;
};

/** 1284 -> "1,284"; with { style: "currency", currency: "USD" } -> "$1,284". */
export const formatValue = (value: number, format: ValueFormat = {}) => formatter(format).format(value);

/** Short form for axis ticks and tight labels: 12,900 -> "12.9K", $4,200,000 -> "$4.2M". */
export const formatCompact = (value: number, format: ValueFormat = {}) =>
  formatter({ ...format, notation: "compact", maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(value);

/** Signed share: 0.124 -> "+12.4%", -0.03 -> "−3%". */
export const formatDelta = (fraction: number) => {
  const text = formatter({ style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(fraction);
  // A true minus sign lines up with the plus.
  return text.replace("-", "−");
};

/** Share of a whole: 0.4213 -> "42.1%". */
export const formatShare = (fraction: number) =>
  formatter({ style: "percent", maximumFractionDigits: fraction < 0.1 && fraction > 0 ? 1 : 0 }).format(fraction);

/** Ready-made formats for a meta.ts `select` control. */
export const FORMATS = {
  number: {},
  currency: { style: "currency", currency: "USD", maximumFractionDigits: 0 },
  percent: { style: "percent", maximumFractionDigits: 1 },
  compact: { notation: "compact", maximumFractionDigits: 1 },
} satisfies Record<string, ValueFormat>;

export type FormatName = keyof typeof FORMATS;

// ═══ Sample data ═════════════════════════════════════════════════════════════

// Seeded sample data, so every demo shows the same believable numbers on the
// server and the client (no hydration mismatch) and changes only with its seed.

/** Repeatable random numbers in [0, 1) from a seed (mulberry32). */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `count` values that wander from `start` with a gentle `trend` per step and
 * `noise` as a share of the current value. Never drops below zero.
 */
export function walk(count: number, { seed = 1, start = 100, trend = 0.01, noise = 0.06 } = {}) {
  const rand = seeded(seed);
  const out: number[] = [];
  let v = start;
  for (let i = 0; i < count; i++) {
    out.push(Math.max(0, Math.round(v)));
    v *= 1 + trend + (rand() * 2 - 1) * noise;
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Labels for `count` consecutive days ending on `end`: "Oct 12". A fixed end
 * date keeps the server and client in agreement.
 */
export function dayLabels(count: number, end = new Date(2026, 9, 12)) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(end);
    d.setDate(end.getDate() - (count - 1 - i));
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  });
}

/** Labels for `count` months ending on `end`: "Oct", or "Oct 2026" with `year`. */
export function monthLabels(count: number, { end = new Date(2026, 9, 1), year = false } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(end.getFullYear(), end.getMonth() - (count - 1 - i), 1);
    return year ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : MONTHS[d.getMonth()];
  });
}

/**
 * `count` values that swell and ebb like a slow wave around `base`: `amp` is
 * the swing as a share of `base`, `period` the steps per cycle.
 */
export function wave(count: number, { seed = 1, base = 100, amp = 0.4, period = 10, phase = 0, noise = 0.08 } = {}) {
  const rand = seeded(seed);
  return Array.from({ length: count }, (_, i) =>
    Math.max(0, Math.round(base * (1 + amp * Math.sin((i / period) * Math.PI * 2 + phase)) * (1 + (rand() * 2 - 1) * noise))),
  );
}

// ═══ Axis ════════════════════════════════════════════════════════════════════

// Axis label placement shared by charts that draw their own x axis.

// Rough width of one 11px tabular character, for laying out labels without measuring the DOM.
export const CHAR = 6.4;
const LABEL_GAP = 16;

/**
 * Which rows get an x label: as many as fit (6 at most, 2 at least), evenly
 * spread, with the first and last pinned to the plot's edges.
 */
export function xLabelIndices(labels: readonly string[], left: number, right: number) {
  const n = labels.length;
  if (n < 2) return n ? [0] : [];
  const w = (i: number) => labels[i].length * CHAR;
  for (let k = Math.min(6, n); k >= 2; k--) {
    const idx = Array.from({ length: k }, (_, j) => Math.round((j * (n - 1)) / (k - 1)));
    const at = (i: number) => left + ((right - left) * i) / (n - 1);
    // Each label's box: first grows right, last grows left, the rest are centred.
    const boxes = idx.map((i, j) => {
      const x = at(i);
      if (j === 0) return [x, x + w(i)];
      if (j === k - 1) return [x - w(i), x];
      return [x - w(i) / 2, x + w(i) / 2];
    });
    if (boxes.every((b, j) => j === 0 || b[0] - boxes[j - 1][1] >= LABEL_GAP)) return idx;
  }
  return [0, n - 1];
}

// ═══ Parts ═══════════════════════════════════════════════════════════════════

// The pieces every chart is built from, so they all share one shell, one
// tooltip, one legend and one way to read a change.


// ─── Shell ────────────────────────────────────────────────────────────────────

export type ChartCardProps = {
  /** Names what is plotted. */
  title: ReactNode;
  /** The headline, usually a <Headline />. */
  value?: ReactNode;
  /** Sits on the headline's baseline, usually a <Delta />. */
  meta?: ReactNode;
  /** Top-right corner: range tabs, a live badge. */
  aside?: ReactNode;
  /** Under the plot panel: a legend or a note. */
  footer?: ReactNode;
  /** Padding inside the plot panel. Default true. */
  padded?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/** Outer surface with the heading, and an inset panel holding the plot. */
export function ChartCard({ title, value, meta, aside, footer, padded = true, className, style, children }: ChartCardProps) {
  return (
    <figure className={cn("m-0 w-full rounded-[22px] bg-muted p-1.5", SERIES_VARS, className)} style={style}>
      {/* On narrow cards the corner controls drop under the heading rather than squeeze it. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-3.5 pb-3 pt-2">
        <figcaption className="min-w-40 flex-1">
          <div className="truncate text-[13px] font-medium text-muted-foreground">{title}</div>
          {(value !== undefined || meta) && (
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              {value}
              {meta}
            </div>
          )}
        </figcaption>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      <div className={cn("relative rounded-2xl bg-background", padded && "p-4")}>{children}</div>
      {footer && <div className="px-3.5 pb-1.5 pt-2.5">{footer}</div>}
    </figure>
  );
}

/** The big number in a card's heading. Rolls between values. */
export function Headline({ value, format, className }: { value: number; format?: ValueFormat; className?: string }) {
  return (
    <NumberFlow
      value={value}
      locales="en-US"
      format={format}
      className={cn("text-3xl font-semibold tabular-nums tracking-tight text-foreground", className)}
    />
  );
}

// ─── Change ───────────────────────────────────────────────────────────────────

export type DeltaProps = {
  /** Change as a fraction: 0.124 is +12.4%. */
  value: number;
  /** Set when lower is better (churn, latency, cost): a fall reads as good. */
  invert?: boolean;
  /** Period the change is measured against, e.g. "vs last month". */
  label?: ReactNode;
  className?: string;
};

/** A signed change in a tinted pill, green when it's good news and red when it's not. */
export function Delta({ value, invert = false, label, className }: DeltaProps) {
  const flat = Math.abs(value) < 0.0005;
  const good = flat ? null : value > 0 !== invert;
  const Arrow = value >= 0 ? IconArrowUpRight : IconArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full py-0.5 pl-1 pr-1.5 text-xs font-medium tabular-nums transition-colors duration-200",
          good === null && "bg-foreground/6 text-muted-foreground",
          good === true && "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
          good === false && "bg-red-500/12 text-red-600 dark:text-red-400",
        )}
      >
        <Arrow size={12} stroke={2.25} aria-hidden className={cn(flat && "opacity-0")} />
        <NumberFlow value={value} locales="en-US" format={{ style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }} />
      </span>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

export type TooltipProps = {
  /** Anchor point in px, relative to the positioned parent. The tip sits above it. */
  x: number;
  y: number;
  /** Width of the area the tip must stay inside, in px. */
  bounds: number;
  visible: boolean;
  children: ReactNode;
};

/**
 * One tooltip for every chart: inverted, above its anchor, gliding from point
 * to point and leaning inward near the edges instead of hanging off the card.
 * When there's no room above (a peak near the top of the plot) it drops below
 * the anchor, so it never covers the card's heading.
 */
export function Tooltip({ x, y, bounds, visible, children }: TooltipProps) {
  const reduce = useReducedMotion();
  const [ref, { width, height }] = useMeasure();
  const left = clamp(x - width / 2, 0, Math.max(0, bounds - width));
  const top = y - 8 - height >= 0 ? y - 8 - height : y + 14;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-10"
          initial={{ opacity: 0, x: left, y: top }}
          animate={{ opacity: 1, x: left, y: top }}
          exit={{ opacity: 0 }}
          transition={reduce ? { duration: 0 } : { ...FOLLOW, opacity: { duration: 0.12 } }}
        >
          <div
            ref={ref}
            className="whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background"
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Heading line of a tooltip, usually the date or category. */
export function TooltipTitle({ children }: { children: ReactNode }) {
  return <div className="opacity-60">{children}</div>;
}

/** One series in a tooltip: a short stroke of its colour, the value, then its name. */
export function TooltipRow({ color, value, label }: { color: string; value: ReactNode; label: ReactNode }) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="h-0.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="tabular-nums">{value}</span>
      <span className="opacity-60">{label}</span>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

export type LegendItem = { key: string; label: string; color: string };

export type LegendProps = {
  items: readonly LegendItem[];
  /** "line" for line charts, "square" for bars and areas, "dot" for points. */
  mark?: "line" | "square" | "dot";
  /** Keys switched off. With `onToggle`, each item becomes a button. */
  hidden?: readonly string[];
  onToggle?: (key: string) => void;
  /** Key under the pointer, to dim the rest. */
  active?: string | null;
  onActiveChange?: (key: string | null) => void;
  className?: string;
};

/** Names every series. Optionally switches them on and off. */
export function Legend({ items, mark = "square", hidden = [], onToggle, active, onActiveChange, className }: LegendProps) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-1 gap-y-0.5", className)} onPointerLeave={() => onActiveChange?.(null)}>
      {items.map((item) => {
        const off = hidden.includes(item.key);
        const dim = off || (active != null && active !== item.key);
        const body = (
          <>
            <span
              aria-hidden
              className={cn(
                "shrink-0 transition-opacity duration-150",
                mark === "line" && "h-0.5 w-3 rounded-full",
                mark === "square" && "size-2.5 rounded-[3px]",
                mark === "dot" && "size-2 rounded-full",
                off && "opacity-30",
              )}
              style={{ background: item.color }}
            />
            <span className={cn("transition-opacity duration-150", dim && "opacity-50", off && "line-through decoration-foreground/30")}>
              {item.label}
            </span>
          </>
        );
        const base = "flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground";
        return (
          <li key={item.key}>
            {onToggle ? (
              <button
                type="button"
                aria-pressed={!off}
                onClick={() => onToggle(item.key)}
                onPointerEnter={() => onActiveChange?.(item.key)}
                onFocus={() => onActiveChange?.(item.key)}
                onBlur={() => onActiveChange?.(null)}
                className={cn(
                  base,
                  "cursor-pointer outline-none transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/20",
                )}
              >
                {body}
              </button>
            ) : (
              <span className={base} onPointerEnter={() => onActiveChange?.(item.key)}>
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Segmented control ────────────────────────────────────────────────────────

/** Small pill tabs for a card's corner: time ranges, views. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  fill = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers. */
  label: string;
  /** Span the container with equal-width options, for form fields. Otherwise it hugs its options. */
  fill?: boolean;
}) {
  const reduce = useReducedMotion();
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex bg-foreground/5", fill ? "h-10 w-full rounded-xl p-1" : "w-fit rounded-[10px] p-0.5")}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative cursor-pointer rounded-lg px-2 font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-foreground/20",
              fill ? "h-8 flex-1 text-[13px]" : "h-6 text-xs",
              on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {on && (
              <motion.span
                layoutId={id}
                className="absolute inset-0 rounded-lg bg-background dark:bg-foreground/12"
                transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.3 }}
              />
            )}
            {/* z-10: the sliding pill belongs to the newly picked option, which can come later in the DOM. */}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Accessibility ────────────────────────────────────────────────────────────

/**
 * The chart's numbers as a table only screen readers see. The table sits in a
 * clipped wrapper: `sr-only` on the table itself is ignored by its rows, which
 * would stretch the page and put a scrollbar on previews.
 */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Reads `children` aloud when it changes, e.g. the point under the keyboard cursor. */
export function Announce({ children }: { children: ReactNode }) {
  return (
    <span className="sr-only" aria-live="polite" aria-atomic>
      {children}
    </span>
  );
}

// ─── Cursor ───────────────────────────────────────────────────────────────────

/**
 * Which point is active, from the pointer or the keyboard. Spread `bind` on
 * the focusable plot: arrows step, Home and End jump, Escape clears. `keyboard`
 * says whether to draw a focus ring on the active point.
 */
export function useChartCursor(count: number) {
  const [active, setActive] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!count) return;
    const at = active ?? count - 1;
    const next =
      e.key === "ArrowLeft" || e.key === "ArrowDown"
        ? at - 1
        : e.key === "ArrowRight" || e.key === "ArrowUp"
          ? at + 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? count - 1
              : undefined;
    if (e.key === "Escape") {
      setActive(null);
      return;
    }
    if (next === undefined) return;
    e.preventDefault();
    setKeyboard(true);
    setActive(clamp(next, 0, count - 1));
  };

  return {
    active: active !== null && active < count ? active : null,
    keyboard,
    /** For pointer moves: activates `index` and hides the keyboard ring. */
    point: (index: number | null) => {
      setKeyboard(false);
      setActive(index);
    },
    bind: {
      tabIndex: 0,
      onKeyDown,
      onFocus: (e: FocusEvent<HTMLElement | SVGElement>) => {
        if (!e.currentTarget.matches(":focus-visible")) return;
        setKeyboard(true);
        setActive((a) => a ?? count - 1);
      },
      onBlur: () => {
        setKeyboard(false);
        setActive(null);
      },
      onPointerLeave: () => {
        if (!keyboard) setActive(null);
      },
    },
  };
}

/** Width of an element, for charts that fill their container. 0 until measured. */
export function useWidth() {
  const [ref, { width }] = useMeasure();
  return [ref, width] as const;
}

