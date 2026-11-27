"use client";

// Weekly retention as the classic triangle: a row per signup cohort, a column
// per week since signup, each cell shaded by the share still active. Cells
// fill in a diagonal wave as the weeks unlock. Above, the selected cohort's
// curve against the average; hovering a cell crosses its row and week and
// reads it in full, hovering or tapping a cohort draws its curve, and the
// cells can show shares or user counts.

import { motion, useReducedMotion } from "motion/react";
import { useId, useMemo, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type RetentionCohort = {
  /** Label for the row, e.g. "Sep 8". */
  label: string;
  /** Users who signed up in the cohort. */
  users: number;
  /** Share still active in week 1, 2, 3…, in percent. Shorter for younger cohorts. */
  retention: number[];
};

export type CohortRetentionProps = {
  cohorts?: RetentionCohort[];
  title?: string;
  /** Name of one period, used in the column heads and readout. */
  period?: string;
  /** Hue the cells are shaded from. */
  color?: string;
  /** Show shares or user counts in the cells. */
  display?: "percent" | "users";
  /** Cohort drawn in the chart on mount, as an index. */
  defaultCohort?: number;
  onCohortChange?: (index: number) => void;
  /** Width of the card in px; never wider than its container. */
  width?: number;
  className?: string;
};

type Cell = { row: number; col: number };

export function CohortRetention({
  cohorts = DEFAULT_COHORTS,
  title = "Retention",
  period = "Week",
  color = "#12a594",
  display: displayProp = "percent",
  defaultCohort = 0,
  onCohortChange,
  width = 620,
  className,
}: CohortRetentionProps) {
  const uid = useId();
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(displayProp);
  const [seenDisplay, setSeenDisplay] = useState(displayProp);
  if (seenDisplay !== displayProp) {
    setSeenDisplay(displayProp);
    setDisplay(displayProp);
  }
  const [pinned, setPinned] = useState(() => Math.min(defaultCohort, cohorts.length - 1));
  const [hover, setHover] = useState<Cell | null>(null);
  const [hoverRow, setHoverRow] = useState<number | null>(null);

  const weeks = useMemo(() => cohorts.reduce((m, c) => Math.max(m, c.retention.length), 0), [cohorts]);
  // Weighted by cohort size, over the cohorts that reached each week.
  const avg = useMemo(
    () =>
      Array.from({ length: weeks }, (_, w) => {
        let u = 0;
        let r = 0;
        for (const c of cohorts) if (c.retention[w] != null) {
          u += c.users;
          r += (c.users * c.retention[w]) / 100;
        }
        return u ? (r / u) * 100 : 0;
      }),
    [cohorts, weeks],
  );
  const maxV = useMemo(() => Math.max(1, ...cohorts.flatMap((c) => c.retention)), [cohorts]);

  const shown = hover?.row ?? hoverRow ?? pinned;
  const cohort = cohorts[shown] ?? cohorts[0];

  const pick = (i: number) => {
    setPinned(i);
    onCohortChange?.(i);
  };

  const shade = (v: number) => Math.round(10 + (v / maxV) * 78);
  const cellText = (c: RetentionCohort, v: number) => (display === "users" ? compact(Math.round((c.users * v) / 100)) : `${Math.round(v)}`);

  const readout = hover
    ? (() => {
        const c = cohorts[hover.row];
        const v = c.retention[hover.col];
        const diff = v - avg[hover.col];
        return {
          head: `${c.label} · ${period} ${hover.col + 1}`,
          value: `${v.toFixed(1)}%`,
          sub: `${Math.round((c.users * v) / 100).toLocaleString("en-US")} of ${c.users.toLocaleString("en-US")} users · ${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pts vs average`,
          up: diff >= 0,
        };
      })()
    : {
        head: `${cohort.label} cohort`,
        value: `${(cohort.retention[cohort.retention.length - 1] ?? 0).toFixed(1)}%`,
        sub: `${cohort.users.toLocaleString("en-US")} users · ${period.toLowerCase()} ${cohort.retention.length} retention`,
        up: undefined,
      };

  return (
    <div className={cn("flex w-full justify-center", className)} style={{ maxWidth: width }}>
      <div
        className="@container w-full rounded-[24px] bg-(--cr-tint) p-1.5 text-sm text-foreground [--cr-panel:#ffffff] [--cr-tint:#f0f0f0] [--cr-well:#f4f4f4] dark:[--cr-panel:#0c0c0c] dark:[--cr-tint:#161616] dark:[--cr-well:#1c1c1c]"
        style={{ "--cr-color": color } as CSSProperties}
      >
        <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-1.5">
          <h3 id={`${uid}-title`} className="truncate font-medium">
            {title}
          </h3>
          <div className="flex shrink-0 gap-0.5 rounded-full bg-(--cr-panel) p-0.5" role="radiogroup" aria-label="Show">
            {(["percent", "users"] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={display === d}
                onClick={() => setDisplay(d)}
                className={cn("relative h-7 cursor-pointer rounded-full px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/50", display === d ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {display === d && <motion.span layoutId={`${uid}-display`} className="absolute inset-0 rounded-full bg-(--cr-well)" transition={{ type: "spring", duration: 0.3, bounce: 0 }} />}
                <span className="relative">{d === "percent" ? "%" : "Users"}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[18px] bg-(--cr-panel) p-4">
          {/* Readout and curve */}
          <div className="flex flex-col gap-3 @[520px]:flex-row @[520px]:items-end">
            <div className="min-w-0 @[520px]:w-[42%]" aria-live="polite">
              <div className="truncate text-xs text-muted-foreground">{readout.head}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-medium tabular-nums tracking-tight">{readout.value}</span>
                {readout.up !== undefined && <span className={cn("text-xs tabular-nums", readout.up ? "text-(--cr-color)" : "text-[#e5484d]")}>{readout.up ? "▲" : "▼"}</span>}
              </div>
              <div className="truncate text-xs tabular-nums text-muted-foreground">{readout.sub}</div>
            </div>
            <Curve values={cohort.retention} avg={avg} weeks={weeks} max={Math.max(maxV, ...avg)} col={hover?.col ?? null} reduce={!!reduce} />
          </div>

          {/* Triangle */}
          <div
            className="mt-5 grid gap-[3px] text-[11px] tabular-nums [--cr-users:0px] @[460px]:[--cr-users:52px]"
            style={{ gridTemplateColumns: `minmax(44px,auto) var(--cr-users) repeat(${weeks}, minmax(0, 1fr))` }}
            role="grid"
            aria-labelledby={`${uid}-title`}
            onPointerLeave={() => {
              setHover(null);
              setHoverRow(null);
            }}
          >
            <span className="flex h-6 items-end pb-1 text-muted-foreground" role="columnheader">
              Cohort
            </span>
            <span className="invisible flex h-6 items-end justify-end overflow-hidden pb-1 pr-1 text-muted-foreground @[460px]:visible" role="columnheader">
              Users
            </span>
            {Array.from({ length: weeks }, (_, w) => (
              <span key={w} role="columnheader" className={cn("flex h-6 items-end justify-center pb-1 transition-colors duration-150", hover?.col === w ? "text-foreground" : "text-muted-foreground")}>
                <span className="hidden @[400px]:inline">{period[0]}</span>
                {w + 1}
              </span>
            ))}

            {cohorts.map((c, r) => {
              const rowOn = shown === r;
              return (
                <div key={c.label + r} role="row" className="contents">
                  <button
                    type="button"
                    role="rowheader"
                    onPointerEnter={(e) => e.pointerType === "mouse" && setHoverRow(r)}
                    onClick={() => pick(r)}
                    aria-current={pinned === r ? "true" : undefined}
                    className={cn(
                      "flex h-8 cursor-pointer items-center gap-1.5 truncate rounded-[6px] px-1.5 text-left text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-neutral-400/50",
                      rowOn ? "bg-(--cr-well) text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {pinned === r && <span className="size-1.5 shrink-0 rounded-full bg-(--cr-color)" />}
                    <span className="truncate">{c.label}</span>
                  </button>
                  <span className="invisible flex h-8 items-center justify-end overflow-hidden pr-1 text-muted-foreground @[460px]:visible">{c.users.toLocaleString("en-US")}</span>
                        {Array.from({ length: weeks }, (_, w) => {
                    const v = c.retention[w];
                    if (v == null) return <span key={w} role="gridcell" aria-hidden className="h-8" />;
                    const m = shade(v);
                    const dim = hover && hover.row !== r && hover.col !== w;
                    return (
                      <motion.span
                        key={w}
                        role="gridcell"
                        aria-label={`${c.label}, ${period} ${w + 1}: ${v.toFixed(1)}%`}
                        onPointerEnter={(e) => e.pointerType === "mouse" && setHover({ row: r, col: w })}
                        onClick={() => pick(r)}
                        className={cn("flex h-8 cursor-pointer items-center justify-center rounded-[6px] transition-opacity duration-150", m > 52 ? "text-white" : "text-foreground")}
                        style={{ background: `color-mix(in oklab, var(--cr-color) ${m}%, var(--cr-panel))` }}
                        initial={reduce ? false : { opacity: 0, scale: 0.8 }}
                        animate={{ opacity: dim ? 0.4 : 1, scale: 1 }}
                        transition={{ duration: 0.35, ease: EASE_OUT, delay: reduce ? 0 : (r + w) * 0.035, opacity: { duration: 0.15 } }}
                      >
                        <span className="hidden @[380px]:inline">{cellText(c, v)}</span>
                      </motion.span>
                    );
                  })}
                </div>
              );
            })}

            {/* Weighted average */}
            <span className="mt-1 flex h-8 items-center px-1.5 text-xs text-muted-foreground">Average</span>
            <span className="mt-1" aria-hidden />
            {avg.map((v, w) => (
              <span key={w} className={cn("mt-1 flex h-8 items-center justify-center rounded-[6px] bg-(--cr-well) transition-colors duration-150", hover?.col === w ? "text-foreground" : "text-muted-foreground")}>
                <span className="hidden @[380px]:inline">{Math.round(v)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The cohort's curve over the average. Always the same number of points, so a new cohort morphs into place. */
function Curve({ values, avg, weeks, max, col, reduce }: { values: number[]; avg: number[]; weeks: number; max: number; col: number | null; reduce: boolean }) {
  const W = 300;
  const H = 72;
  const x = (w: number) => (weeks > 1 ? (w / (weeks - 1)) * W : 0);
  const y = (v: number) => H - 4 - (v / max) * (H - 10);
  const pts = Array.from({ length: weeks }, (_, w) => [x(Math.min(w, values.length - 1)), y(values[Math.min(w, values.length - 1)] ?? 0)] as const);
  const d = `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")}`;
  const area = `${d}L${pts[pts.length - 1][0].toFixed(1)},${H}L0,${H}Z`;
  const avgD = `M${avg.map((v, w) => `${x(w).toFixed(1)},${y(v).toFixed(1)}`).join("L")}`;
  const t = reduce ? { duration: 0 } : { duration: 0.45, ease: EASE_OUT };
  return (
    <svg viewBox={`0 -4 ${W} ${H + 4}`} className="h-[76px] w-full min-w-0 flex-1 overflow-visible" preserveAspectRatio="none" aria-hidden>
      <path d={avgD} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeDasharray="3 3" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
      <motion.path initial={{ d: area }} animate={{ d: area }} transition={t} fill="var(--cr-color)" fillOpacity={0.1} />
      <motion.path
        initial={{ d, pathLength: reduce ? 1 : 0 }}
        animate={{ d, pathLength: 1 }}
        transition={{ d: t, pathLength: { duration: 0.9, ease: EASE_OUT, delay: 0.2 } }}
        fill="none"
        stroke="var(--cr-color)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {col !== null && <line x1={x(col)} x2={x(col)} y1={-4} y2={H} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`);

// ─── Sample ───────────────────────────────────────────────────────────────────
// Ten weekly cohorts. Retention decays like a power curve and improves a
// little with each cohort, as onboarding gets better.

function curve(i: number, weeks: number, size: number) {
  const lift = i * 0.9;
  return Array.from({ length: weeks }, (_, w) => {
    const base = 46 * Math.pow(w + 1, -0.42) + lift * Math.pow(w + 1, -0.2);
    const wobble = Math.sin((i + 1) * 3.1 + w * 1.7) * 1.4 + (size % 7) * 0.12;
    return Math.round(Math.max(4, base + wobble) * 10) / 10;
  });
}

const START = ["Sep 1", "Sep 8", "Sep 15", "Sep 22", "Sep 29", "Oct 6", "Oct 13", "Oct 20", "Oct 27", "Nov 3"];
const SIZES = [1204, 986, 1132, 1378, 1251, 1420, 1309, 1587, 1466, 1702];

export const DEFAULT_COHORTS: RetentionCohort[] = START.map((label, i) => ({ label, users: SIZES[i], retention: curve(i, START.length - i, SIZES[i]) }));
