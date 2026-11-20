"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import NumberFlow from "@number-flow/react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";
import {
  ChartCard,
  DataTable,
  Headline,
  Segmented,
  accentVars,
  DRAW_IN,
  EASE_OUT,
  SETTLE,
  seriesColor,
  tint,
  formatShare,
  formatValue,
  type ValueFormat,
} from "../_charts/chart-kit";

export type BarListItem = { label: string; value: number; href?: string };
export type BarListGroup = { value: string; label: string; items: BarListItem[] };

const SAMPLE: BarListGroup[] = [
  {
    value: "pages",
    label: "Pages",
    items: [
      { label: "/", value: 8420 },
      { label: "/pricing", value: 3910 },
      { label: "/docs/install", value: 2675 },
      { label: "/blog/launch-week", value: 1840 },
      { label: "/docs/theming", value: 1215 },
      { label: "/changelog", value: 960 },
      { label: "/components/button", value: 712 },
      { label: "/about", value: 405 },
      { label: "/careers", value: 268 },
    ],
  },
  {
    value: "referrers",
    label: "Referrers",
    items: [
      { label: "Google", value: 7630 },
      { label: "Direct", value: 4120 },
      { label: "github.com", value: 3285 },
      { label: "x.com", value: 1950 },
      { label: "news.ycombinator.com", value: 1410 },
      { label: "reddit.com", value: 782 },
      { label: "linkedin.com", value: 516 },
      { label: "DuckDuckGo", value: 304 },
    ],
  },
  {
    value: "countries",
    label: "Countries",
    items: [
      { label: "United States", value: 6890 },
      { label: "India", value: 3240 },
      { label: "Germany", value: 2105 },
      { label: "United Kingdom", value: 1880 },
      { label: "Canada", value: 1120 },
      { label: "France", value: 964 },
      { label: "Brazil", value: 830 },
      { label: "Japan", value: 712 },
      { label: "Netherlands", value: 498 },
      { label: "Australia", value: 451 },
    ],
  },
];

// Key for the folded row, chosen so it can't collide with a real label.
const OTHER = "\u0000other";
// Most delay between rows as they grow in, in seconds.
const STAGGER = 0.03;

type Row = { key: string; label: string; value: number; href?: string; item?: BarListItem; folded?: number };

export type BarListProps = {
  /** Names the list. */
  title?: string;
  /** Lists to switch between, each with its own tab. */
  groups?: BarListGroup[];
  /** A single list. Replaces `groups` and hides the tabs. */
  items?: BarListItem[];
  /** Rows shown before the rest fold into "Other". */
  limit?: number;
  /** What the headline counts, e.g. "visitors". */
  unit?: string;
  /** Intl.NumberFormat options for every number. */
  format?: ValueFormat;
  /** Show each row's share of the total. Hovering a row always shows it. */
  showShare?: boolean;
  /** Bar colour. Empty uses the chart palette's first colour. */
  accent?: string;
  /** Makes rows buttons. Called with the row's item; "Other" isn't selectable. */
  onSelect?: (item: BarListItem) => void;
  className?: string;
};

export function BarList({
  title = "Top sources",
  groups = SAMPLE,
  items,
  limit = 6,
  unit = "visitors",
  format = {},
  showShare = false,
  accent = "",
  onSelect,
  className,
}: BarListProps) {
  const reduce = useReducedMotion();
  const lists = useMemo(() => (items ? [{ value: "all", label: title, items }] : groups), [items, groups, title]);
  const [picked, setPicked] = useState(lists[0]?.value ?? "");
  // Rows grow in one after another on mount; after a switch they just settle.
  const [switched, setSwitched] = useState(false);
  const group = lists.find((g) => g.value === picked) ?? lists[0];
  const [measure, { height }] = useMeasure();

  const { rows, total, max } = useMemo(() => {
    const sorted = [...(group?.items ?? [])].sort((a, b) => b.value - a.value);
    const shown = Math.max(1, Math.round(limit));
    const rows: Row[] = sorted.slice(0, shown).map((d) => ({ key: d.label, label: d.label, value: d.value, href: d.href, item: d }));
    const rest = sorted.slice(shown);
    if (rest.length) rows.push({ key: OTHER, label: "Other", value: rest.reduce((s, d) => s + d.value, 0), folded: rest.length });
    const total = sorted.reduce((s, d) => s + d.value, 0);
    // Scaled to the biggest row shown, Other included, so no bar overflows.
    const max = Math.max(1, ...rows.map((r) => r.value));
    return { rows, total, max };
  }, [group, limit]);

  const fmt = (v: number) => formatValue(v, format);
  const share = (v: number) => (total ? formatShare(v / total) : "");
  const color = seriesColor(0);
  const bars = { "--bar": tint(color, 14), "--bar-on": tint(color, 22) } as CSSProperties;

  const switchTo = (value: string) => {
    setSwitched(true);
    setPicked(value);
  };

  return (
    <ChartCard
      title={title}
      value={<Headline value={total} format={format} />}
      meta={unit ? <span className="text-xs text-muted-foreground">{unit}</span> : undefined}
      aside={
        lists.length > 1 ? (
          <Segmented options={lists.map((g) => ({ value: g.value, label: g.label }))} value={group?.value ?? ""} onChange={switchTo} label={`${title} by`} />
        ) : undefined
      }
      padded={false}
      className={cn("max-w-120", className)}
      style={{ ...accentVars(accent), ...bars }}
    >
      {/* The panel follows its rows' height instead of jumping when a list is longer. */}
      <motion.div
        initial={false}
        animate={height ? { height } : undefined}
        transition={reduce ? { duration: 0 } : SETTLE}
        className="overflow-hidden"
      >
        <ul ref={measure} className="relative flex flex-col gap-0.5 p-2" aria-label={`${group?.label ?? title}, ${rows.length} rows`}>
          <AnimatePresence mode="popLayout" initial={false}>
            {rows.map((row, i) => {
              const pct = (row.value / max) * 100;
              const body: ReactNode = (
                <>
                  {/* Bar behind the label, scaled to the biggest row. */}
                  <motion.span
                    aria-hidden
                    className="absolute inset-y-0 left-0 rounded-lg bg-(--bar) transition-colors duration-150 group-hover:bg-(--bar-on) group-focus-visible:bg-(--bar-on)"
                    initial={{ width: reduce ? `${pct}%` : "0%" }}
                    animate={{ width: `${pct}%` }}
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { duration: DRAW_IN, ease: EASE_OUT, delay: switched ? 0 : Math.min(i, 10) * STAGGER }
                    }
                    style={{ minWidth: row.value > 0 ? 4 : 0 }}
                  />
                  <span className={cn("relative min-w-0 flex-1 truncate text-left", row.folded ? "text-muted-foreground" : "text-foreground")}>
                    {row.label}
                    {row.folded ? <span className="text-muted-foreground/70"> · {row.folded}</span> : null}
                  </span>
                  <span
                    className={cn(
                      "relative w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground transition-opacity duration-150",
                      !showShare && "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                    )}
                  >
                    {share(row.value)}
                  </span>
                  <NumberFlow
                    value={row.value}
                    locales="en-US"
                    format={format}
                    className="relative shrink-0 text-right font-medium tabular-nums text-foreground"
                  />
                </>
              );
              const base = "group relative flex h-9 w-full items-center gap-2 rounded-lg px-3 text-[13px] outline-none";
              const interactive = "cursor-pointer focus-visible:ring-2 focus-visible:ring-foreground/20";
              const name = `${row.label}: ${fmt(row.value)}, ${share(row.value)}`;
              return (
                <motion.li
                  key={row.key}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }}
                  transition={reduce ? { duration: 0 } : { ...SETTLE, opacity: { duration: 0.25, delay: 0.08 } }}
                >
                  {onSelect && row.item ? (
                    <button type="button" aria-label={name} onClick={() => onSelect(row.item!)} className={cn(base, interactive)}>
                      {body}
                    </button>
                  ) : row.href ? (
                    <a href={row.href} aria-label={name} className={cn(base, interactive)}>
                      {body}
                    </a>
                  ) : (
                    <div className={base}>{body}</div>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </motion.div>

      <DataTable
        caption={`${title}: ${group?.label ?? ""}`}
        columns={[group?.label ?? "Name", unit || "Value", "Share"]}
        rows={rows.map((r) => [r.label, fmt(r.value), share(r.value)])}
      />
    </ChartCard>
  );
}
