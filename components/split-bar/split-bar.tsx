"use client";

import { useEffect, useMemo, useState, type PointerEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";
import {
  Announce,
  ChartCard,
  DataTable,
  Headline,
  Tooltip,
  useChartCursor,
  useWidth,
  EASE_OUT,
  GAP,
  SETTLE,
  SERIES_COUNT,
  seriesColor,
  tint,
  TRACK,
  formatShare,
  formatValue,
  type ValueFormat,
} from "../_charts/chart-kit";

export type SplitItem = { label: string; value: number; color?: string };

const SAMPLE: SplitItem[] = [
  { label: "Photos", value: 38.4 },
  { label: "Documents", value: 21.7 },
  { label: "Apps", value: 16.2 },
  { label: "System", value: 12.6 },
  { label: "Mail", value: 3.2 },
];

const SAMPLE_TOTAL = 128;
const SAMPLE_FORMAT: ValueFormat = { style: "unit", unit: "gigabyte", maximumFractionDigits: 1 };

const HEIGHT = 12;
// Air above and below the bar that still counts as hovering it.
const HIT = 12;
// Past the palette, the tail folds into one neutral "Other" so colours never repeat.
const MAX_SEGMENTS = SERIES_COUNT;
const OTHER = tint("var(--foreground)", 32);
// Mount: each segment grows in a little after the one before it.
const GROW = 0.3;
const STAGGER_TOTAL = 0.18;

export type SplitBarProps = {
  /** Names the whole. */
  title?: string;
  /** The parts, in the order they sit on the bar. */
  items?: SplitItem[];
  /** Full capacity. The rest of the bar shows what's left. Empty makes the parts the whole. */
  total?: number;
  /** Intl.NumberFormat options for every number, e.g. { style: "currency", currency: "USD" }. */
  format?: ValueFormat;
  /** List every part under the bar. */
  showList?: boolean;
  /** Called with the part picked from the bar or the list. */
  onSelect?: (item: SplitItem) => void;
  className?: string;
};

export function SplitBar({
  title = "Storage",
  items = SAMPLE,
  total: totalProp,
  format: formatProp,
  showList = true,
  onSelect,
  className,
}: SplitBarProps) {
  const reduce = useReducedMotion();
  const [ref, width] = useWidth();
  // The sample's capacity and units only apply to the sample, so `total={undefined}`
  // with your own items really means "no capacity".
  const sample = items === SAMPLE;
  const total = totalProp ?? (sample ? SAMPLE_TOTAL : undefined);
  const format = formatProp ?? (sample ? SAMPLE_FORMAT : {});

  // Fold the tail into "Other" so there are never more segments than colours.
  const parts = useMemo(() => {
    const colored = items.map((d, i) => ({ ...d, color: d.color ?? seriesColor(i) }));
    if (colored.length <= MAX_SEGMENTS) return colored;
    const keep = colored.slice(0, MAX_SEGMENTS - 1);
    const rest = colored.slice(MAX_SEGMENTS - 1).reduce((n, d) => n + Math.max(0, d.value), 0);
    return [...keep, { label: "Other", value: rest, color: OTHER }];
  }, [items]);

  const cursor = useChartCursor(parts.length);
  const [row, setRow] = useState<number | null>(null);
  const active = row ?? cursor.active;

  const used = parts.reduce((n, d) => n + Math.max(0, d.value), 0);
  const whole = total !== undefined ? Math.max(total, used) : used;
  const share = (v: number) => (whole ? v / whole : 0);
  const fmt = (v: number) => formatValue(v, format);
  // With percent values and no capacity, the share would repeat the value.
  const showShare = !(format.style === "percent" && total === undefined);

  // Every segment's place in px, plus the track for what's left.
  const layout = useMemo(() => {
    if (!width) return { segs: [], track: { x: 0, w: 0 } };
    const left = total !== undefined ? Math.max(0, whole - used) : 0;
    const count = parts.length + (left > 0 ? 1 : 0);
    const room = Math.max(0, width - GAP * (count - 1));
    const unit = whole ? room / whole : 0;
    let x = 0;
    const segs = parts.map((d) => {
      const w = Math.max(0, d.value) * unit;
      const seg = { x, w };
      x += w + GAP;
      return seg;
    });
    return { segs, track: left > 0 ? { x, w: Math.max(0, width - x) } : { x: width, w: 0 } };
  }, [parts, width, whole, used, total]);

  // The staggered grow plays once; after that, segments settle into new values.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (!width || grown) return;
    const t = setTimeout(() => setGrown(true), (GROW + STAGGER_TOTAL) * 1000 + 50);
    return () => clearTimeout(t);
  }, [width, grown]);
  const stagger = parts.length > 1 ? STAGGER_TOTAL / (parts.length - 1) : 0;
  const move = (i: number) =>
    reduce ? { duration: 0 } : grown ? SETTLE : { duration: GROW, ease: EASE_OUT, delay: i * stagger };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = layout.segs.findIndex((s) => x >= s.x - GAP / 2 && x < s.x + s.w + GAP / 2);
    setRow(null);
    cursor.point(i >= 0 ? i : null);
  };

  const at = active !== null ? layout.segs[active] : undefined;
  const pick = active !== null ? parts[active] : undefined;

  return (
    <ChartCard
      title={title}
      value={<Headline value={used} format={format} />}
      meta={total !== undefined ? <span className="text-[13px] font-medium text-muted-foreground">of {fmt(total)}</span> : undefined}
      aside={
        total !== undefined ? (
          <span className="flex h-5 items-center text-xs font-medium tabular-nums text-muted-foreground">
            <NumberFlow value={share(used)} locales="en-US" format={{ style: "percent", maximumFractionDigits: 0 }} />
            &nbsp;used
          </span>
        ) : undefined
      }
      className={cn("max-w-120", className)}
    >
      {/* A little air above the bar so the tooltip clears the headline. */}
      <div className="relative pt-2">
        <div
          ref={ref}
          role="group"
          aria-label={`${title}, ${parts.length} parts. Arrow keys move between them.`}
          className={cn(
            "relative -my-3 touch-none outline-none",
            onSelect && "cursor-pointer",
          )}
          style={{ paddingBlock: HIT }}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          onClick={() => pick && onSelect?.(pick)}
          {...cursor.bind}
          onKeyDown={(e) => {
            if (e.key === "Enter" && pick) onSelect?.(pick);
            cursor.bind.onKeyDown(e);
          }}
        >
          <div className="relative overflow-hidden rounded-full" style={{ height: HEIGHT }}>
            {width > 0 && (
              <>
                {/* What's left. Sits under the segments while they grow in, then slides to its place. */}
                <motion.div
                  aria-hidden
                  className="absolute inset-y-0 left-0"
                  style={{ background: TRACK }}
                  initial={reduce ? false : { x: 0, width }}
                  animate={{ x: layout.track.x, width: layout.track.w }}
                  transition={reduce ? { duration: 0 } : grown ? SETTLE : { duration: GROW, ease: EASE_OUT, delay: STAGGER_TOTAL }}
                />
                {layout.segs.map((s, i) => (
                  <motion.div
                    key={i}
                    aria-hidden
                    className="absolute inset-y-0 left-0"
                    style={{ background: parts[i].color }}
                    initial={reduce ? false : { x: s.x, width: 0 }}
                    animate={{ x: s.x, width: s.w, opacity: active !== null && active !== i ? 0.35 : 1 }}
                    transition={{ ...move(i), opacity: { duration: reduce ? 0 : 0.15 } }}
                  />
                ))}
              </>
            )}
          </div>

          {/* Keyboard ring, outside the clip so it isn't cut off. */}
          {at && cursor.keyboard && row === null && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute left-0 rounded-[9px] ring-2 ring-foreground/40"
              style={{ top: HIT - 3, height: HEIGHT + 6 }}
              initial={false}
              animate={{ x: at.x - 3, width: at.w + 6 }}
              transition={reduce ? { duration: 0 } : SETTLE}
            />
          )}
        </div>

        <Tooltip x={at ? at.x + at.w / 2 : 0} y={8} bounds={width} visible={!!pick}>
          {pick && (
            <>
              <span className="opacity-60">{pick.label}</span> · <span className="tabular-nums">{fmt(pick.value)}</span>
              {showShare && <span className="tabular-nums opacity-60"> · {formatShare(share(pick.value))}</span>}
            </>
          )}
        </Tooltip>
      </div>

      {showList && (
        <ul className="-mx-2 -mb-2 mt-4" onPointerLeave={() => setRow(null)}>
          {parts.map((d, i) => (
            <li key={i}>
              <button
                type="button"
                onPointerEnter={() => {
                  cursor.point(null);
                  setRow(i);
                }}
                onFocus={() => setRow(i)}
                onBlur={() => setRow(null)}
                onClick={() => onSelect?.(d)}
                className={cn(
                  "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-foreground/20",
                  active === i && "bg-foreground/4",
                  !onSelect && "cursor-default",
                )}
              >
                <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{d.label}</span>
                <span className="tabular-nums text-foreground">{fmt(d.value)}</span>
                {showShare && <span className="w-11 text-right tabular-nums text-muted-foreground">{formatShare(share(d.value))}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Announce>{pick ? `${pick.label}: ${fmt(pick.value)}, ${formatShare(share(pick.value))}` : ""}</Announce>
      <DataTable
        caption={total !== undefined ? `${title}: ${fmt(used)} of ${fmt(total)}` : title}
        columns={["Part", "Value", "Share"]}
        rows={parts.map((d) => [d.label, fmt(d.value), formatShare(share(d.value))])}
      />
    </ChartCard>
  );
}
