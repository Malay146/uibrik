"use client";

import { useEffect, useId, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";

// ─── Small helpers, kept here so this file stands alone ─────────────────────────
// The arc reads --series-1; the same palette step the other charts use.
const ACCENT = "[--series-1:#2a78d6] dark:[--series-1:#3987e5]";
const STATUS = { good: "#22c55e", warning: "#f5a524", critical: "#ef4444" } as const;
type Status = keyof typeof STATUS;
/** The empty part of the track: the foreground at low strength. */
const TRACK = "color-mix(in srgb, var(--foreground) 7%, transparent)";
type ValueFormat = Intl.NumberFormatOptions & { notation?: "standard" | "compact" };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const formatValue = (value: number, format: ValueFormat = {}) => new Intl.NumberFormat("en-US", format).format(value);
/** Short form for tight labels: 12,900 becomes "12.9K". */
const formatCompact = (value: number, format: ValueFormat = {}) =>
  new Intl.NumberFormat("en-US", { ...format, notation: "compact", maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(value);

/** Lets an `accent` colour replace the arc's colour. */
const accentVars = (accent?: string): CSSProperties | undefined =>
  accent ? ({ "--series-1": accent } as CSSProperties) : undefined;

/** The card: a raised shell with the title and corner badge, and an inset panel for the dial. */
function ChartCard({
  title,
  aside,
  className,
  style,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <figure className={cn("m-0 w-full rounded-[22px] bg-muted p-1.5 edge-outer", ACCENT, className)} style={style}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-3.5 pb-3 pt-2">
        <figcaption className="min-w-40 flex-1 truncate text-[13px] font-medium text-muted-foreground">{title}</figcaption>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      <div className="relative rounded-2xl bg-background p-4 edge-inner">{children}</div>
    </figure>
  );
}

// The dial sweeps 240 degrees, open at the bottom, in a 200 x 160 box.
const VIEW_W = 200;
const VIEW_H = 160;
const CX = 100;
const CY = 98;
const R = 76;
const SWEEP = 120;
const TICK_STEP = 6;
const KNOB = 7;
const BAND = 7;
/** Slices the gradient is drawn in; enough that no seam shows. */
const SLICES = 60;
/** Degrees of arc a round cap of the band covers. */
const CAP = 4;

// Rounded, so the server and the browser agree on every digit (their sin and cos can differ in the last ones).
const r2 = (v: number) => Math.round(v * 100) / 100;
const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [r2(CX + r * Math.sin(a)), r2(CY - r * Math.cos(a))] as const;
};
const arc = (from: number, to: number, r: number) => {
  const [x0, y0] = polar(from, r);
  const [x1, y1] = polar(to, r);
  return `M${x0},${y0}A${r},${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1},${y1}`;
};
/**
 * The arc's colour at `t` (0 at the start of the sweep, 1 at the end): the accent
 * with its lightness lowered and its chroma raised, so it deepens toward the top
 * while staying vivid. Mixing with black would only grey it.
 */
const shade = (t: number) => `oklch(from var(--series-1) calc(l - ${(0.2 * t ** 0.9).toFixed(3)}) calc(c + ${(0.05 * t).toFixed(3)}) h)`;

export type GaugeZone = {
  /** Upper bound of the zone, inclusive. */
  to: number;
  label: string;
  status: Status;
};

export type GaugeDialProps = {
  /** Names what is measured. */
  title?: string;
  /** Current value. The dial follows it with a spring. */
  value?: number;
  min?: number;
  max?: number;
  /** Snap size when dragging or using the keyboard. */
  step?: number;
  /** Small caption under the number, e.g. "% used". */
  unit?: string;
  /** A level to aim for, marked outside the arc. */
  target?: number;
  /** Named ranges, in order. Empty uses healthy / elevated / critical at 60% and 85% of the range. */
  zones?: GaugeZone[];
  /** Names the zone the value is in, in the card's corner. */
  showZone?: boolean;
  /** Intl.NumberFormat options for the number. */
  format?: ValueFormat;
  /** Arc colour. Empty uses the chart palette. */
  accent?: string;
  /** Lets people drag the knob or use arrow keys. */
  interactive?: boolean;
  /** Called as the value changes by drag or keyboard. */
  onChange?: (value: number) => void;
  className?: string;
};

export function GaugeDial({
  title = "CPU load",
  value = 68,
  min = 0,
  max = 100,
  step = 1,
  unit = "% used",
  target,
  zones,
  showZone = true,
  format = {},
  accent = "",
  interactive = true,
  onChange,
  className,
}: GaugeDialProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const [v, setV] = useState(value);
  const [dragging, setDragging] = useState(false);
  // Follow the prop when it changes from outside.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setV(value);
  }

  const span = max - min || 1;
  const toAngle = (x: number) => -SWEEP + ((clamp(x, min, max) - min) / span) * SWEEP * 2;
  const angle = useSpring(-SWEEP, { stiffness: 260, damping: 30, mass: 0.9 });
  useEffect(() => {
    if (reduce) angle.jump(toAngle(v));
    else angle.set(toAngle(v));
  });

  const progress = useTransform(angle, (a) => arc(-SWEEP, Math.max(a, -SWEEP + 0.01), R));
  const knobX = useTransform(angle, (a) => polar(a, R)[0]);
  const knobY = useTransform(angle, (a) => polar(a, R)[1]);
  // The knob wears the arc's colour at its own position.
  const knobFill = useTransform(angle, (a) => shade(clamp((a + SWEEP) / (SWEEP * 2), 0, 1)));
  const current = toAngle(v);

  // The whole sweep as thin slices, each its own shade. A mask cuts it to the progress arc.
  const slices = Array.from({ length: SLICES }, (_, i) => {
    const from = -SWEEP + (i * SWEEP * 2) / SLICES;
    // A hair of overlap so antialiasing never leaves a seam. The first and last run past the
    // sweep, so the mask's round caps have colour to show at both ends.
    const lead = i === 0 ? CAP : 0;
    const tail = i === SLICES - 1 ? CAP : 0;
    return { d: arc(from - lead, from + (SWEEP * 2) / SLICES + 0.6 + tail, R), color: shade((i + 0.5) / SLICES) };
  });
  const ticks = Array.from({ length: (SWEEP * 2) / TICK_STEP + 1 }, (_, i) => {
    const deg = -SWEEP + i * TICK_STEP;
    const major = i % 5 === 0;
    const [x0, y0] = polar(deg, R - 14);
    const [x1, y1] = polar(deg, R - (major ? 24 : 19));
    return { deg, major, x0, y0, x1, y1 };
  });

  const ranges: GaugeZone[] =
    zones && zones.length
      ? zones
      : [
          { to: min + span * 0.6, label: "Healthy", status: "good" },
          { to: min + span * 0.85, label: "Elevated", status: "warning" },
          { to: max, label: "Critical", status: "critical" },
        ];
  const zone = ranges.find((z) => v <= z.to) ?? ranges[ranges.length - 1];

  const commit = (next: number) => {
    const snapped = clamp(Math.round((next - min) / step) * step + min, min, max);
    if (snapped === v) return;
    setV(snapped);
    onChange?.(snapped);
  };

  const fromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = rect.width / VIEW_W;
    const dx = (e.clientX - rect.left) / scale - CX;
    const dy = (e.clientY - rect.top) / scale - CY;
    // Off the sweep (the open bottom) snaps to the nearer end.
    const deg = clamp((Math.atan2(dx, -dy) * 180) / Math.PI, -SWEEP, SWEEP);
    commit(min + ((deg + SWEEP) / (SWEEP * 2)) * span);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const big = e.shiftKey ? 10 : 1;
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowUp" ? step * big : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step * big : 0;
    if (e.key === "Home") commit(min);
    else if (e.key === "End") commit(max);
    else if (delta) commit(v + delta);
    else return;
    e.preventDefault();
  };

  const [tx, ty] = target !== undefined ? polar(toAngle(target), R + 10) : [0, 0];
  const [tx2, ty2] = target !== undefined ? polar(toAngle(target), R + 18) : [0, 0];
  const [kx, ky] = polar(-SWEEP, R);
  const [kx2, ky2] = polar(SWEEP, R);

  return (
    <ChartCard
      title={title}
      aside={
        showZone ? (
          <span
            className="flex h-6 items-center gap-1.5 rounded-full bg-foreground/5 pl-2 pr-2.5 text-xs font-medium text-foreground"
            aria-live="polite"
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full transition-colors duration-300"
              style={{ background: STATUS[zone.status] }}
            />
            {zone.label}
          </span>
        ) : undefined
      }
      className={cn("max-w-sm", className)}
      style={accentVars(accent)}
    >
      <div
        role={interactive ? "slider" : "img"}
        aria-label={title}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={v}
        aria-valuetext={`${formatValue(v, format)} ${unit}${showZone ? `, ${zone.label}` : ""}`.trim()}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={interactive ? onKeyDown : undefined}
        className="relative rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className={cn("block w-full touch-none select-none overflow-visible", interactive && (dragging ? "cursor-grabbing" : "cursor-grab"))}
          onPointerDown={
            interactive
              ? (e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragging(true);
                  fromPointer(e);
                }
              : undefined
          }
          onPointerMove={interactive && dragging ? fromPointer : undefined}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          aria-hidden
        >
          <defs>
            <mask id={`${id}-fill`} maskUnits="userSpaceOnUse" x={0} y={0} width={VIEW_W} height={VIEW_H}>
              <motion.path d={progress} fill="none" stroke="white" strokeWidth={BAND} strokeLinecap="round" />
            </mask>
            <radialGradient id={`${id}-face`} cx="50%" cy="38%" r="70%">
              <stop offset="0" stopColor="var(--foreground)" stopOpacity={0.045} />
              <stop offset="1" stopColor="var(--foreground)" stopOpacity={0.01} />
            </radialGradient>
          </defs>

          {/* A soft recessed face for the reading to sit on. */}
          <circle cx={CX} cy={CY} r={R - 30} fill={`url(#${id}-face)`} className="stroke-foreground/6" strokeWidth={1} />

          <path d={arc(-SWEEP, SWEEP, R)} fill="none" stroke={TRACK} strokeWidth={BAND} strokeLinecap="round" />

          {/* The gradient arc, revealed up to the knob; a wider, fainter pass underneath gives it a glow. */}
          <g mask={`url(#${id}-fill)`}>
            <g opacity={0.18}>
              {slices.map((s, i) => (
                <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={BAND + 6} />
              ))}
            </g>
            {slices.map((s, i) => (
              <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={BAND} />
            ))}
          </g>

          {/* Hairline ticks inside the arc; they go solid as the value passes them. */}
          {ticks.map((t) => {
            const lit = t.deg <= current + 0.01;
            return (
              <line
                key={t.deg}
                x1={t.x0}
                y1={t.y0}
                x2={t.x1}
                y2={t.y1}
                strokeWidth={t.major ? 1.75 : 1.25}
                strokeLinecap="round"
                className={cn("transition-[stroke] duration-200", lit ? "stroke-foreground" : "stroke-foreground/15")}
              />
            );
          })}

          {target !== undefined && target >= min && target <= max && (
            <line x1={tx} y1={ty} x2={tx2} y2={ty2} strokeWidth={2} strokeLinecap="round" className="stroke-foreground" />
          )}

          {/* The knob: a solid dot in the arc's colour where it sits, with a fine edge and a soft shadow. */}
          <motion.circle
            cx={knobX}
            cy={knobY}
            className="stroke-white/70 dark:stroke-black/50"
            strokeWidth={1}
            style={{ fill: knobFill, filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.2))" }}
            initial={false}
            animate={{ r: dragging ? KNOB + 1 : KNOB }}
            transition={reduce ? { duration: 0 } : { duration: 0.15 }}
          />

          <text x={kx} y={ky + 18} textAnchor="middle" className="fill-muted-foreground text-[10px] font-medium tabular-nums">
            {formatCompact(min, format)}
          </text>
          <text x={kx2} y={ky2 + 18} textAnchor="middle" className="fill-muted-foreground text-[10px] font-medium tabular-nums">
            {formatCompact(max, format)}
          </text>
        </svg>

        {/* The reading sits in the dial's open centre. */}
        <div
          className="pointer-events-none absolute inset-x-0 flex -translate-y-1/2 flex-col items-center"
          style={{ top: `${(CY / VIEW_H) * 100}%` }}
        >
          <NumberFlow
            value={v}
            locales="en-US"
            format={format}
            className="text-[40px] font-semibold leading-none tabular-nums tracking-tight text-foreground"
          />
          {unit && <span className="mt-1.5 text-xs font-medium text-muted-foreground">{unit}</span>}
        </div>
      </div>
    </ChartCard>
  );
}
