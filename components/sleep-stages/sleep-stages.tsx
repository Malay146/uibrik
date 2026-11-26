"use client";

// A night of sleep as a hypnogram: four rows (awake, REM, light, deep) with a
// block for every stretch in each stage and a thin step joining them. The
// score and time asleep sit above; below, each stage's share of the night
// against its typical range. Hovering a stage, in the legend or by scrubbing
// the chart, lifts its blocks and dims the rest; the scrub cursor reads the
// clock time and stage under it.

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type SleepStage = "awake" | "rem" | "light" | "deep";

export type SleepSegment = { stage: SleepStage; minutes: number };

export type SleepNight = {
  /** Short label for the week strip, e.g. "Mon". */
  label: string;
  bedtime: string;
  score?: number;
  segments: SleepSegment[];
};

export type SleepStagesProps = {
  /** Several nights, oldest first; a strip above the chart switches between them. Overrides segments, bedtime and score. */
  nights?: SleepNight[];
  /** Night shown on mount, as an index into nights. Defaults to the last. */
  defaultNight?: number;
  onNightChange?: (index: number) => void;
  /** A single night in order, one entry per stretch in a stage. */
  segments?: SleepSegment[];
  /** When the first segment starts, "HH:MM" in 24-hour time. */
  bedtime?: string;
  /** 0–100, shown in the ring. Leave out to hide the ring. */
  score?: number;
  /** Hue the stages are shaded from. Awake stays neutral. */
  color?: string;
  title?: string;
  /** Use a 24-hour clock for times. */
  hour24?: boolean;
  /** Width of the card in px; never wider than its container. */
  width?: number;
  className?: string;
};

const STAGES: { id: SleepStage; label: string; tone: number; range: [number, number] }[] = [
  { id: "awake", label: "Awake", tone: 0, range: [0, 10] },
  { id: "rem", label: "REM", tone: 0.7, range: [20, 25] },
  { id: "light", label: "Light", tone: 0.5, range: [50, 60] },
  { id: "deep", label: "Deep", tone: 1, range: [13, 23] },
];

const ROW = 24;
// Mixed with the panel, not transparency, so the shades hold up in dark mode.
const fill = (tone: number) => (tone === 0 ? "color-mix(in oklab, var(--foreground) 30%, var(--ss-panel))" : `color-mix(in oklab, var(--ss-color) ${Math.round(tone * 100)}%, var(--ss-panel))`);
const dur = (m: number) => {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h ? `${h}h ${r}m` : `${r}m`;
};

export function SleepStages({
  nights: nightsProp,
  defaultNight,
  onNightChange,
  segments: segmentsProp,
  bedtime: bedtimeProp = "23:04",
  score: scoreProp = 84,
  color = "#6e56cf",
  title = "Sleep",
  hour24 = false,
  width = 460,
  className,
}: SleepStagesProps) {
  const id = useId();
  const reduce = useReducedMotion();
  // A single night passed as segments shows on its own; otherwise a week.
  const nights = useMemo(() => nightsProp ?? (segmentsProp ? [{ label: "", bedtime: bedtimeProp, score: scoreProp, segments: segmentsProp }] : DEFAULT_WEEK), [nightsProp, segmentsProp, bedtimeProp, scoreProp]);
  const [nightIdx, setNightIdx] = useState(() => Math.min(defaultNight ?? nights.length - 1, nights.length - 1));
  const night = nights[Math.min(nightIdx, nights.length - 1)] ?? nights[0];
  const { segments, bedtime } = night;
  const score = nightsProp || !segmentsProp ? night.score : scoreProp;
  const pickNight = (i: number) => {
    setNightIdx(i);
    setCursor(null);
    onNightChange?.(i);
  };
  const [focus, setFocus] = useState<SleepStage | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);

  const start = useMemo(() => {
    const [h, m] = bedtime.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }, [bedtime]);

  const { blocks, total, byStage, asleep } = useMemo(() => {
    const blocks: (SleepSegment & { from: number; to: number })[] = [];
    for (const s of segments) {
      const from = blocks.length ? blocks[blocks.length - 1].to : 0;
      blocks.push({ ...s, from, to: from + s.minutes });
    }
    const t = blocks.length ? blocks[blocks.length - 1].to : 0;
    const byStage = Object.fromEntries(STAGES.map((st) => [st.id, 0])) as Record<SleepStage, number>;
    for (const s of segments) byStage[s.stage] += s.minutes;
    return { blocks, total: Math.max(t, 1), byStage, asleep: t - byStage.awake };
  }, [segments]);

  const clock = (m: number, short = false) => {
    const t = (((start + m) % 1440) + 1440) % 1440;
    const h = Math.floor(t / 60);
    const mm = String(Math.floor(t % 60)).padStart(2, "0");
    if (hour24) return `${String(h).padStart(2, "0")}:${mm}`;
    const h12 = h % 12 || 12;
    return short ? `${h12} ${h < 12 ? "AM" : "PM"}` : `${h12}:${mm} ${h < 12 ? "AM" : "PM"}`;
  };

  // Whole hours inside the night, thinned so labels never crowd.
  const ticks = useMemo(() => {
    const first = 60 - (start % 60);
    const out: number[] = [];
    for (let m = first; m < total - 20; m += 60) out.push(m);
    return out.filter((_, i) => i % (out.length > 6 ? 2 : 1) === 0);
  }, [start, total]);

  const rowOf = (s: SleepStage) => STAGES.findIndex((st) => st.id === s);
  const under = cursor !== null ? blocks.find((b) => cursor >= b.from && cursor < b.to) : undefined;
  // Scrubbing lights the stretch under the cursor; the legend lights a whole stage.
  const active = focus ?? under?.stage ?? null;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    setCursor(Math.min(total - 0.01, Math.max(0, ((e.clientX - r.left) / r.width) * total)));
  };

  const pct = (m: number) => `${(m / total) * 100}%`;
  const efficiency = Math.round((asleep / total) * 100);

  return (
    <div className={cn("flex w-full justify-center", className)} style={{ maxWidth: width }}>
      <div
        className="@container w-full rounded-[24px] bg-(--ss-tint) p-1.5 text-sm text-foreground [--ss-panel:#ffffff] [--ss-tint:#f0f0f0] [--ss-well:#f4f4f4] dark:[--ss-panel:#0c0c0c] dark:[--ss-tint:#161616] dark:[--ss-well:#1c1c1c]"
        style={{ "--ss-color": color } as CSSProperties}
      >
        <div className="flex items-baseline justify-between gap-3 px-3 pb-2.5 pt-2">
          <h3 id={`${id}-title`} className="truncate font-medium">
            {title}
          </h3>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {clock(0)} – {clock(total)}
          </span>
        </div>

        <div className="rounded-[18px] bg-(--ss-panel) p-4">
          {nights.length > 1 && <WeekStrip nights={nights} index={nightIdx} onPick={pickNight} id={id} />}
          <div className="flex items-center gap-3.5">
            {score != null && <ScoreRing score={score} reduce={!!reduce} />}
            <div className="min-w-0">
              <Duration minutes={asleep} />
              <div className="text-xs text-muted-foreground">
                asleep · {efficiency}% efficiency · {blocks.filter((b) => b.stage === "awake" && b.from > 0 && b.to < total).length} wake-ups
              </div>
            </div>
          </div>

          {/* Hypnogram */}
          <div className="mt-8 grid grid-cols-[44px_1fr] gap-x-2">
            <div className="flex flex-col" aria-hidden>
              {STAGES.map((s) => (
                <span key={s.id} className={cn("flex items-center text-[11px] transition-colors duration-150", active === s.id ? "text-foreground" : "text-muted-foreground")} style={{ height: ROW }}>
                  {s.label}
                </span>
              ))}
            </div>
            <div
              ref={track}
              className="relative touch-pan-y select-none"
              style={{ height: ROW * STAGES.length }}
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setCursor(null)}
              role="img"
              aria-label={STAGES.map((s) => `${s.label} ${dur(byStage[s.id])}`).join(", ")}
            >
              {/* Faint row guides. */}
              {STAGES.map((s, i) => (
                <span key={s.id} className="absolute inset-x-0 h-px bg-foreground/[0.05]" style={{ top: i * ROW + ROW / 2 }} aria-hidden />
              ))}
              <motion.div
                key={nightIdx}
                className="absolute inset-0"
                initial={reduce ? false : { clipPath: "inset(0 100% 0 0)" }}
                animate={{ clipPath: "inset(0 0% 0 0)" }}
                transition={{ duration: 1.1, ease: EASE_OUT, delay: 0.1 }}
              >
                {/* Steps joining one stage to the next. */}
                {blocks.slice(1).map((b, i) => {
                  const a = rowOf(blocks[i].stage);
                  const c = rowOf(b.stage);
                  return (
                    <span
                      key={`j${i}`}
                      className={cn("absolute w-px bg-foreground/15 transition-opacity duration-200", active && "opacity-30")}
                      style={{ left: pct(b.from), top: Math.min(a, c) * ROW + ROW / 2, height: Math.abs(a - c) * ROW }}
                      aria-hidden
                    />
                  );
                })}
                {blocks.map((b, i) => {
                  const st = STAGES[rowOf(b.stage)];
                  // The stretch under the cursor lifts further than the rest of its stage.
                  const on = under ? under === b : active === b.stage;
                  const kin = !!under && under !== b && under.stage === b.stage;
                  return (
                    <span
                      key={i}
                      className="absolute h-3.5 rounded-[4px] transition-[transform,opacity] duration-200 ease-out"
                      style={{
                        left: pct(b.from),
                        width: `max(2px, calc(${pct(b.minutes)} - 1px))`,
                        top: rowOf(b.stage) * ROW + (ROW - 14) / 2,
                        background: fill(st.tone),
                        opacity: active && !on && !kin ? 0.28 : 1,
                        transform: on ? "translateY(-3px)" : kin ? "translateY(-1px)" : "none",
                      }}
                      aria-hidden
                    />
                  );
                })}
              </motion.div>

              {cursor !== null && (
                <div className="pointer-events-none absolute inset-y-0" style={{ left: pct(cursor) }} aria-hidden>
                  <span className="absolute -top-1.5 bottom-0 w-px bg-foreground/50" />
                  <span
                    className="absolute -top-7 whitespace-nowrap rounded-full bg-foreground px-2 py-0.5 text-[11px] tabular-nums text-background"
                    style={{ transform: `translateX(${cursor / total > 0.7 ? "calc(-100% + 1px)" : cursor / total < 0.3 ? "0" : "-50%"})` }}
                  >
                    {clock(cursor)}
                    {under && ` · ${STAGES[rowOf(under.stage)].label} ${dur(under.minutes)}`}
                  </span>
                </div>
              )}
            </div>

            {/* Hour axis. */}
            <span />
            <div className="relative mt-1.5 h-4 text-[11px] tabular-nums text-muted-foreground" aria-hidden>
              {ticks.map((m) => (
                <span key={m} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(m) }}>
                  {clock(m, true)}
                </span>
              ))}
            </div>
          </div>

          {/* Each stage against its typical range. */}
          <ul className="mt-4 flex flex-col gap-px" onPointerLeave={() => setFocus(null)}>
            {STAGES.map((s, i) => {
              const share = s.id === "awake" ? (byStage[s.id] / total) * 100 : (byStage[s.id] / Math.max(asleep, 1)) * 100;
              const scaleMax = s.id === "light" ? 80 : 40;
              const inRange = share >= s.range[0] && share <= s.range[1];
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onPointerEnter={(e) => e.pointerType === "mouse" && setFocus(s.id)}
                    onClick={() => setFocus((f) => (f === s.id ? null : s.id))}
                    onFocus={() => setFocus(s.id)}
                    onBlur={() => setFocus(null)}
                    aria-pressed={focus === s.id}
                    className={cn(
                      "grid h-10 w-full cursor-pointer grid-cols-[12px_1fr_auto] items-center gap-2.5 rounded-[10px] px-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-neutral-400/50 @[400px]:grid-cols-[12px_72px_1fr_auto]",
                      focus === s.id ? "bg-(--ss-well)" : "hover:bg-(--ss-well)/60",
                    )}
                  >
                    <span className="size-2.5 rounded-[3px]" style={{ background: fill(s.tone) }} />
                    <span className="text-[13px]">{s.label}</span>
                    {/* Typical range as a band, this night as a tick. */}
                    <span className="relative hidden h-1.5 rounded-full bg-foreground/[0.06] @[400px]:block" aria-hidden>
                      <span className="absolute inset-y-0 rounded-full bg-foreground/[0.1]" style={{ left: `${(s.range[0] / scaleMax) * 100}%`, width: `${((s.range[1] - s.range[0]) / scaleMax) * 100}%` }} />
                      <motion.span
                        className="absolute -top-[3px] h-3 w-[3px] -translate-x-1/2 rounded-full"
                        style={{ background: s.tone ? fill(s.tone) : "var(--foreground)", left: `${Math.min(100, (share / scaleMax) * 100)}%` }}
                        initial={reduce ? false : { opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.6 + i * 0.06 }}
                      />
                    </span>
                    <span className="flex items-baseline gap-2 text-[13px] tabular-nums">
                      <span className="font-medium">{dur(byStage[s.id])}</span>
                      <span className={cn("w-9 text-right text-xs", inRange ? "text-muted-foreground" : "text-foreground")}>{Math.round(share)}%</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Hours and minutes asleep, counting to each new night. */
function Duration({ minutes }: { minutes: number }) {
  const mv = useMotionValue(minutes);
  const text = useTransform(mv, dur);
  useEffect(() => {
    const c = animate(mv, minutes, { duration: 0.6, ease: EASE_OUT });
    return () => c.stop();
  }, [mv, minutes]);
  return <motion.div className="text-2xl font-medium tabular-nums tracking-tight">{text}</motion.div>;
}

// One column per night: its label and a bar for its score. The picked night
// gets a pill that slides across.
function WeekStrip({ nights, index, onPick, id }: { nights: SleepNight[]; index: number; onPick: (i: number) => void; id: string }) {
  return (
    <div className="-mx-1 mb-4 flex gap-1" role="tablist" aria-label="Night">
      {nights.map((n, i) => {
        const on = i === index;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={`${n.label}${n.score != null ? `, score ${n.score}` : ""}`}
            onClick={() => onPick(i)}
            className={cn("relative flex h-14 flex-1 cursor-pointer flex-col items-center justify-end gap-1.5 rounded-[10px] pb-1.5 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-neutral-400/50", !on && "hover:bg-(--ss-well)/60")}
          >
            {on && <motion.span layoutId={`${id}-night`} className="absolute inset-0 rounded-[10px] bg-(--ss-well)" transition={{ type: "spring", duration: 0.35, bounce: 0 }} />}
            <span className="relative flex h-7 w-1.5 items-end overflow-hidden rounded-full bg-foreground/[0.06]">
              <span className="w-full rounded-full transition-[background] duration-200" style={{ height: `${n.score ?? 0}%`, background: on ? "var(--ss-color)" : "color-mix(in oklab, var(--ss-color) 55%, var(--ss-panel))" }} />
            </span>
            <span className={cn("relative text-[11px]", on ? "text-foreground" : "text-muted-foreground")}>{n.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ScoreRing({ score, reduce }: { score: number; reduce: boolean }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-14 shrink-0 place-items-center">
      <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={4} />
        <motion.circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke="var(--ss-color)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.min(100, Math.max(0, score)) / 100) }}
          transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.15 }}
        />
      </svg>
      <span className="text-base font-medium tabular-nums" aria-label={`Sleep score ${score}`}>
        {score}
      </span>
    </div>
  );
}

// ─── Sample ───────────────────────────────────────────────────────────────────
// Five cycles: deep sleep early in the night, REM growing toward morning.

const S = (stage: SleepStage, minutes: number): SleepSegment => ({ stage, minutes });

// Six more nights built from the sample by stretching some stages and trimming
// others, so each night looks different but plausible.
function vary(base: SleepSegment[], seed: number): SleepSegment[] {
  return base.map((s, i) => {
    const r = Math.abs(Math.sin((i + 1) * 9.1 + seed * 3.7));
    const f = s.stage === "awake" ? 0.4 + r * 1.6 : 0.7 + r * 0.6;
    return { stage: s.stage, minutes: Math.max(2, Math.round(s.minutes * f)) };
  });
}

export const DEFAULT_SEGMENTS: SleepSegment[] = [
  S("awake", 8), S("light", 22), S("deep", 38), S("light", 16), S("rem", 14),
  S("light", 24), S("deep", 30), S("light", 18), S("awake", 3), S("rem", 22),
  S("light", 30), S("deep", 16), S("light", 22), S("rem", 30), S("awake", 4),
  S("light", 28), S("rem", 34), S("light", 20), S("awake", 2), S("light", 16),
  S("rem", 26), S("awake", 8),
];

export const DEFAULT_WEEK: SleepNight[] = [
  { label: "Thu", bedtime: "23:42", score: 72, segments: vary(DEFAULT_SEGMENTS, 1) },
  { label: "Fri", bedtime: "00:31", score: 61, segments: vary(DEFAULT_SEGMENTS, 2).slice(0, 18) },
  { label: "Sat", bedtime: "00:12", score: 78, segments: vary(DEFAULT_SEGMENTS, 3) },
  { label: "Sun", bedtime: "22:48", score: 90, segments: vary(DEFAULT_SEGMENTS, 4) },
  { label: "Mon", bedtime: "23:20", score: 81, segments: vary(DEFAULT_SEGMENTS, 5) },
  { label: "Tue", bedtime: "23:55", score: 68, segments: vary(DEFAULT_SEGMENTS, 6).slice(0, 19) },
  { label: "Wed", bedtime: "23:04", score: 84, segments: DEFAULT_SEGMENTS },
];
