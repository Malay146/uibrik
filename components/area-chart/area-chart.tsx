"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import {
  Announce,
  ChartCard,
  DataTable,
  Delta,
  Headline,
  Legend,
  Tooltip,
  TooltipRow,
  TooltipTitle,
  useChartCursor,
  useWidth,
  areaPath,
  extent,
  linear,
  linePath,
  nearest,
  niceTicks,
  type Point,
  accentVars,
  AREA,
  DOT,
  DRAW_IN,
  EASE_OUT,
  FOLLOW,
  GRID,
  LINE,
  SETTLE,
  seriesColor,
  formatCompact,
  formatValue,
  type ValueFormat,
  dayLabels,
  walk,
} from "../_charts/chart-kit";

/** One period: its label plus a number per series key. */
export type AreaRow = { label: string; [key: string]: string | number };
export type AreaSeries = { key: string; label: string; color?: string };

const SAMPLE_VALUES = walk(30, { seed: 12, start: 2840, trend: 0.006, noise: 0.08 });
const SAMPLE: AreaRow[] = dayLabels(30).map((label, i) => ({ label, visitors: SAMPLE_VALUES[i] }));
const SAMPLE_SERIES: AreaSeries[] = [{ key: "visitors", label: "Visitors" }];

// Room above the top grid line for its label, and below the plot for the dates.
const TOP = 8;
const X_AXIS = 24;
// Keeps the last dot and its ring inside the plot.
const RIGHT = DOT + 2;
// Rough width of one 11px tabular character, for laying out labels without measuring the DOM.
const CHAR = 6.4;
const LABEL_GAP = 16;
// Opaque, so the comparison dot reads as solid over the washes.
const MUTED = "color-mix(in srgb, var(--foreground) 32%, var(--background))";

/**
 * Which rows get an x label: as many as fit (6 at most, 2 at least), evenly
 * spread, with the first and last pinned to the plot's edges.
 */
function xLabelIndices(labels: readonly string[], left: number, right: number) {
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

export type AreaChartProps = {
  /** Names what is plotted. */
  title?: string;
  /** One row per period, oldest first: a label and a value for each series key. */
  data?: AreaRow[];
  /** The series to draw, 1 to 5. They keep their colour slot when others are hidden. */
  series?: AreaSeries[];
  /** The first series over the previous period, drawn as a dashed line to compare against. */
  previous?: number[];
  /** Intl.NumberFormat options for every number, e.g. { style: "currency", currency: "USD" }. */
  format?: ValueFormat;
  /** Headline is the first series' sum over the period, or its latest value. */
  headline?: "total" | "latest";
  /** First series colour. Empty uses the chart palette. */
  accent?: string;
  /** Horizontal grid lines with value labels. */
  showGrid?: boolean;
  /** Plot height in px. */
  height?: number;
  /** Called with the row under the cursor, or null when it leaves. */
  onActiveChange?: (index: number | null) => void;
  className?: string;
};

export function AreaChart({
  title = "Visitors",
  data = SAMPLE,
  series = SAMPLE_SERIES,
  previous,
  format = {},
  headline = "total",
  accent = "",
  showGrid = true,
  height = 220,
  onActiveChange,
  className,
}: AreaChartProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const [ref, width] = useWidth();
  const cursor = useChartCursor(data.length);
  const { active } = cursor;
  const [hidden, setHidden] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | null>(null);

  // Colours come from the series' slot in `series`, so hiding one never repaints the rest.
  const all = useMemo(() => series.map((s, i) => ({ ...s, color: s.color ?? seriesColor(i) })), [series]);
  const visible = all.filter((s) => !hidden.includes(s.key));
  // Pointing at a legend item spotlights its series, unless that series is switched off.
  const lit = focus !== null && !hidden.includes(focus) ? focus : null;
  const value = (row: AreaRow | undefined, key: string) => Number(row?.[key] ?? 0);
  const fmt = (v: number) => formatValue(v, format);

  const head = all[0];
  const firstValues = head ? data.map((d) => value(d, head.key)) : [];
  const aggregate = (vs: readonly number[]) => (headline === "latest" ? (vs[vs.length - 1] ?? 0) : vs.reduce((a, b) => a + b, 0));
  const current = aggregate(firstValues);
  const before = previous?.length ? aggregate(previous) : null;
  const showPrevious = !!previous?.length && !!head && !hidden.includes(head.key);

  // The y scale fits what's on screen, so hiding a series lets the rest fill the plot.
  const [min, max] = extent([
    ...visible.flatMap((s) => data.map((d) => value(d, s.key))),
    ...(showPrevious && previous ? previous : []),
  ]);
  const ticks = niceTicks(Math.min(0, min), max, 4);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];

  // Where the ticks sat before a rescale, so new ones slide in from there.
  const [domain, setDomain] = useState<[number, number]>([lo, hi]);
  const [prevDomain, setPrevDomain] = useState<[number, number]>([lo, hi]);
  if (domain[0] !== lo || domain[1] !== hi) {
    setPrevDomain(domain);
    setDomain([lo, hi]);
  }

  const gutter = showGrid ? Math.max(...ticks.map((t) => formatCompact(t, format).length)) * CHAR + 10 : 0;
  const left = gutter + (showGrid ? 0 : DOT + 2);
  const right = Math.max(left + 1, width - RIGHT);
  const bottom = height - X_AXIS;
  const x = linear([0, Math.max(1, data.length - 1)], [left, right]);
  const y = linear([lo, hi], [bottom, TOP]);
  const yPrev = linear(prevDomain, [bottom, TOP]);

  const paths = all.map((s) => data.map((d, i) => [x(i), y(value(d, s.key))] as Point));
  const prevPoints = previous?.slice(0, data.length).map((v, i) => [x(i), y(v)] as Point) ?? [];
  const xs = data.map((_, i) => x(i));
  const xLabels = width ? xLabelIndices(data.map((d) => d.label), left, right) : [];

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!xs.length) return;
    cursor.point(nearest(xs, e.clientX - e.currentTarget.getBoundingClientRect().left));
  };

  const toggle = (key: string) =>
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : visible.length > 1 ? [...h, key] : h));

  // Tell the parent which row is active, without re-firing when it passes a new callback.
  const callback = useRef(onActiveChange);
  useEffect(() => {
    callback.current = onActiveChange;
  });
  useEffect(() => callback.current?.(active), [active]);

  const at = active !== null ? xs[active] : undefined;
  const dots =
    active !== null
      ? [
          ...visible.map((s) => ({ key: s.key, color: s.color, cy: paths[all.indexOf(s)][active][1] })),
          ...(showPrevious && prevPoints[active] ? [{ key: "previous", color: MUTED, cy: prevPoints[active][1] }] : []),
        ]
      : [];
  const tipY = dots.length ? Math.min(...dots.map((d) => d.cy)) : 0;
  const rows =
    active !== null
      ? [
          ...visible.map((s) => ({ key: s.key, color: s.color, label: s.label, v: value(data[active], s.key) })),
          ...(showPrevious && previous?.[active] !== undefined
            ? [{ key: "previous", color: "color-mix(in srgb, var(--background) 55%, transparent)", label: "Previous period", v: previous[active] }]
            : []),
        ]
      : [];

  const ease = reduce ? { duration: 0 } : SETTLE;
  // Redraw from scratch when the data itself changes, not when it rescales.
  const drawKey = `${data.length}-${all.map((s) => s.key).join()}-${firstValues[0]}-${firstValues[firstValues.length - 1]}`;

  return (
    <ChartCard
      title={title}
      value={<Headline value={current} format={format} />}
      meta={before !== null ? <Delta value={before ? (current - before) / before : 0} label="vs previous period" /> : undefined}
      footer={
        all.length > 1 ? (
          <Legend items={all} hidden={hidden} onToggle={toggle} active={lit} onActiveChange={setFocus} />
        ) : undefined
      }
      className={cn("max-w-160", className)}
      style={accentVars(accent)}
    >
      <div
        ref={ref}
        role="group"
        aria-label={`${title} over ${data.length} periods. Arrow keys move between them.`}
        className="relative cursor-crosshair touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
        style={{ height }}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        {...cursor.bind}
      >
        {width > 0 && data.length > 1 && (
          <svg width={width} height={height} className="block overflow-visible" aria-hidden>
            <defs>
              {all.map((s, i) => (
                <linearGradient key={s.key} id={`${id}-g${i}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={s.color} stopOpacity={AREA / 100} />
                  <stop offset="1" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
              {/* Keeps a fading series inside the plot while the scale shrinks under it. */}
              <clipPath id={`${id}-clip`}>
                <rect x={0} y={0} width={width} height={bottom + 1} />
              </clipPath>
            </defs>

            {/* Grid lines and value labels, sliding to their new place on a rescale. */}
            {showGrid && (
              <AnimatePresence initial={false} custom={y}>
                {ticks.map((t) => (
                  <motion.g
                    key={t}
                    custom={y}
                    initial={{ opacity: 0, y: yPrev(t) }}
                    animate={{ opacity: 1, y: y(t) }}
                    exit="exit"
                    variants={{ exit: (to: (v: number) => number) => ({ opacity: 0, y: to(t) }) }}
                    transition={{ ...ease, opacity: { duration: reduce ? 0 : 0.2 } }}
                  >
                    <line x1={left} x2={right} y1={0} y2={0} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
                    <text x={gutter - 10} y={0} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] font-medium tabular-nums">
                      {formatCompact(t, format)}
                    </text>
                  </motion.g>
                ))}
              </AnimatePresence>
            )}
            {!showGrid && <line x1={left} x2={right} y1={bottom} y2={bottom} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />}

            <g clipPath={`url(#${id}-clip)`}>
              {/* Washes first, so every line sits on top of every area. */}
              {all.map((s, i) => {
                const off = hidden.includes(s.key);
                const dim = lit !== null && lit !== s.key;
                return (
                  <motion.path
                    key={`a-${s.key}-${drawKey}`}
                    fill={`url(#${id}-g${i})`}
                    initial={{ opacity: 0, d: areaPath(paths[i], bottom) }}
                    animate={{ opacity: off ? 0 : dim ? 0.35 : 1, d: areaPath(paths[i], bottom) }}
                    transition={{ d: ease, opacity: { duration: reduce ? 0 : 0.4, delay: reduce ? 0 : DRAW_IN * 0.5 } }}
                  />
                );
              })}

              {showPrevious && prevPoints.length > 1 && (
                <motion.path
                  key={`p-${drawKey}`}
                  fill="none"
                  stroke={MUTED}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                  initial={{ opacity: 0, d: linePath(prevPoints) }}
                  animate={{ opacity: 1, d: linePath(prevPoints) }}
                  transition={{ d: ease, opacity: { duration: reduce ? 0 : 0.3, delay: reduce ? 0 : DRAW_IN * 0.5 } }}
                />
              )}

              {all.map((s, i) => {
                const off = hidden.includes(s.key);
                const dim = lit !== null && lit !== s.key;
                return (
                  <motion.path
                    key={`l-${s.key}-${drawKey}`}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={LINE}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: reduce ? 1 : 0, d: linePath(paths[i]) }}
                    animate={{ pathLength: 1, opacity: off ? 0 : dim ? 0.35 : 1, d: linePath(paths[i]) }}
                    transition={{
                      pathLength: { duration: reduce ? 0 : DRAW_IN, ease: EASE_OUT },
                      d: ease,
                      opacity: { duration: reduce ? 0 : 0.2 },
                    }}
                  />
                );
              })}
            </g>

            {/* Dates, the first and last flush with the plot's edges. */}
            {xLabels.map((i, j) => (
              <text
                key={i}
                x={xs[i]}
                y={height - 4}
                textAnchor={j === 0 ? "start" : j === xLabels.length - 1 ? "end" : "middle"}
                className="fill-muted-foreground text-[11px] font-medium tabular-nums"
              >
                {data[i].label}
              </text>
            ))}

            {/* Crosshair, with a dot on every visible series. */}
            {at !== undefined && (
              <motion.g initial={false} animate={{ x: at }} transition={reduce ? { duration: 0 } : FOLLOW}>
                <line x1={0} x2={0} y1={TOP} y2={bottom} className="stroke-foreground/15" strokeWidth={1} />
                {dots.map((d, j) => (
                  <motion.g key={d.key} initial={false} animate={{ y: d.cy }} transition={reduce ? { duration: 0 } : FOLLOW}>
                    <circle r={DOT} fill={d.color} className="stroke-background" strokeWidth={2} />
                    {cursor.keyboard && j === 0 && <circle r={DOT + 4} fill="none" className="stroke-foreground/40" strokeWidth={2} />}
                  </motion.g>
                ))}
              </motion.g>
            )}
          </svg>
        )}

        <Tooltip x={at ?? 0} y={tipY - 4} bounds={width} visible={active !== null}>
          {active !== null &&
            (rows.length === 1 ? (
              <>
                <span className="opacity-60">{data[active].label}</span> · {fmt(rows[0].v)}
              </>
            ) : (
              <>
                <TooltipTitle>{data[active].label}</TooltipTitle>
                {rows.map((r) => (
                  <TooltipRow key={r.key} color={r.color} value={fmt(r.v)} label={r.label} />
                ))}
              </>
            ))}
        </Tooltip>
      </div>

      <Announce>{active !== null ? `${data[active].label}: ${rows.map((r) => `${r.label} ${fmt(r.v)}`).join(", ")}` : ""}</Announce>
      <DataTable
        caption={title}
        columns={["Period", ...all.map((s) => s.label), ...(previous?.length ? ["Previous period"] : [])]}
        rows={data.map((d, i) => [
          d.label,
          ...all.map((s) => fmt(value(d, s.key))),
          ...(previous?.length ? [previous[i] !== undefined ? fmt(previous[i]) : "—"] : []),
        ])}
      />
    </ChartCard>
  );
}
