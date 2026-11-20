"use client";

import { useId, useMemo, type PointerEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import {
  Announce,
  ChartCard,
  DataTable,
  Delta,
  Headline,
  useChartCursor,
  useWidth,
  areaPath,
  extent,
  linear,
  linePath,
  nearest,
  type Point,
  accentVars,
  AREA,
  DOT,
  DRAW_IN,
  EASE_OUT,
  FOLLOW,
  LINE,
  seriesColor,
  formatValue,
  type ValueFormat,
  dayLabels,
  walk,
} from "../_charts/chart-kit";

export type KpiPoint = { label: string; value: number };

const SAMPLE_VALUES = walk(30, { seed: 4, start: 1180, trend: 0.012, noise: 0.07 });
const SAMPLE: KpiPoint[] = dayLabels(30).map((label, i) => ({ label, value: SAMPLE_VALUES[i] * 36 }));

const HEIGHT = 72;
// Room for the end dot and its ring, so neither is clipped at the edges.
const INSET = DOT + 6;

export type KpiTileProps = {
  /** Names the metric. */
  title?: string;
  /** One point per period, oldest first. The last point is the current value. */
  data?: KpiPoint[];
  /** Headline value. Defaults to the last point. */
  value?: number;
  /** Change as a fraction (0.124 is +12.4%). Defaults to the last point against the first. */
  delta?: number;
  /** What the change is measured against. Defaults to "since" the first point's label. */
  deltaLabel?: string;
  /** Set when lower is better (churn, latency, cost), so a fall reads as good. */
  invert?: boolean;
  /** Intl.NumberFormat options for every number, e.g. { style: "currency", currency: "USD" }. */
  format?: ValueFormat;
  /** Line colour. Empty uses the chart palette's first colour. */
  accent?: string;
  /** Wash under the line. */
  area?: boolean;
  className?: string;
};

export function KpiTile({
  title = "Revenue",
  data = SAMPLE,
  value,
  delta,
  deltaLabel,
  invert = false,
  format = { style: "currency", currency: "USD", maximumFractionDigits: 0 },
  accent = "",
  area = true,
  className,
}: KpiTileProps) {
  const reduce = useReducedMotion();
  const gradient = useId();
  const [ref, width] = useWidth();
  const cursor = useChartCursor(data.length);
  const { active } = cursor;

  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;
  const shown = active !== null ? data[active].value : (value ?? last);
  const change = delta ?? (first ? (last - first) / first : 0);

  const points = useMemo<Point[]>(() => {
    if (!width || !data.length) return [];
    const [lo, hi] = extent(data.map((d) => d.value));
    // A little headroom so peaks and the hover dot never touch the edges.
    const pad = (hi - lo) * 0.12 || 1;
    // Edge to edge: the panel's rounded corners frame the line, so it needs no side margins.
    const x = linear([0, Math.max(1, data.length - 1)], [0, width]);
    const y = linear([lo - pad, hi + pad], [HEIGHT - INSET, INSET + 6]);
    return data.map((d, i) => [x(i), y(d.value)] as const);
  }, [data, width]);
  const xs = useMemo(() => points.map((p) => p[0]), [points]);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!xs.length) return;
    cursor.point(nearest(xs, e.clientX - e.currentTarget.getBoundingClientRect().left));
  };

  const color = seriesColor(0);
  const at = active !== null ? points[active] : undefined;
  // The line runs to the panel's edges; the dot stays far enough in to show whole.
  const dotX = at ? Math.min(Math.max(at[0], INSET), width - INSET) : 0;
  const fmt = (v: number) => formatValue(v, format);
  // Redraw from scratch when the series itself changes, not when it rescales.
  const drawKey = `${data.length}-${first}-${last}`;

  return (
    <ChartCard
      title={title}
      value={
        // Number and change on their own rows, so every tile in a row has the
        // same height whatever the width of its number.
        <div className="basis-full">
          <Headline value={shown} format={format} />
          {/* The change and the scrubbed date swap in place, in a row of fixed height. */}
          <div className="mt-1 grid h-6 items-center">
            <AnimatePresence initial={false}>
              <motion.div
                key={active !== null ? "date" : "delta"}
                className="col-start-1 row-start-1 flex items-center"
                initial={{ opacity: 0, y: reduce ? 0 : 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduce ? 0 : -3 }}
                transition={{ duration: reduce ? 0 : 0.15, ease: EASE_OUT }}
              >
                {active !== null ? (
                  <span className="text-xs font-medium text-muted-foreground">{data[active].label}</span>
                ) : (
                  <Delta value={change} invert={invert} label={deltaLabel ?? (data[0] ? `since ${data[0].label}` : undefined)} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      }
      padded={false}
      className={cn("max-w-80", className)}
      style={accentVars(accent)}
    >
      <div
        ref={ref}
        role="group"
        aria-label={`${title} trend, ${data.length} points. Arrow keys move between them.`}
        className="relative cursor-crosshair touch-none overflow-hidden rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
        style={{ height: HEIGHT }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        {...cursor.bind}
      >
        {points.length > 1 && (
          <svg width={width} height={HEIGHT} className="block" aria-hidden>
            <defs>
              <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity={AREA / 100} />
                <stop offset="1" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {area && (
              <motion.path
                key={`a-${drawKey}`}
                d={areaPath(points, HEIGHT)}
                fill={`url(#${gradient})`}
                initial={{ opacity: reduce ? 1 : 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: reduce ? 0 : DRAW_IN * 0.5 }}
              />
            )}
            <motion.path
              key={`l-${drawKey}`}
              d={linePath(points)}
              fill="none"
              stroke={color}
              strokeWidth={LINE}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: DRAW_IN, ease: EASE_OUT }}
            />

            {/* Crosshair and the point it lands on. */}
            {at && (
              <motion.g initial={false} animate={{ x: dotX }} transition={reduce ? { duration: 0 } : FOLLOW}>
                <line x1={0} x2={0} y1={0} y2={HEIGHT} className="stroke-foreground/15" strokeWidth={1} />
                <motion.g initial={false} animate={{ y: at[1] }} transition={reduce ? { duration: 0 } : FOLLOW}>
                  <circle r={DOT} fill={color} className="stroke-background" strokeWidth={2} />
                  {cursor.keyboard && <circle r={DOT + 4} fill="none" className="stroke-foreground/40" strokeWidth={2} />}
                </motion.g>
              </motion.g>
            )}

          </svg>
        )}
      </div>

      <Announce>{active !== null ? `${data[active].label}: ${fmt(data[active].value)}` : ""}</Announce>
      <DataTable caption={title} columns={["Period", title]} rows={data.map((d) => [d.label, fmt(d.value)])} />
    </ChartCard>
  );
}
