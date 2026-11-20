"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

// A quiet card of work in flight: uploads, imports, backups, cross-posts.
// Each row is the app's mark, what's happening, a quieter detail line, the
// value and a thin bar. A row with more to say opens like a dropdown: a small
// table of facts, the list of steps with the running one filling its ring, or
// one bar per destination for work that goes to several places at once.
//
// Values ease on a spring, so updates that arrive faster than the animation
// never stutter, and every percentage counts with its fill instead of flicking.
// A null value shows an indeterminate sweep. Finishing turns the bar green and
// swaps the value for a drawn check. Opening animates height only, and what's
// inside fades up in a short stagger; text never scales.
//
// Everything else moves with transforms and opacity only.

export type ProgressDetail = {
  label: string;
  value: ReactNode;
  /** A small filled icon, about 14px, drawn in a tile beside the fact. */
  icon?: ReactNode;
};

export type ProgressStep = {
  label: string;
  /** Shown on the right of the step, e.g. a count or a duration. */
  detail?: ReactNode;
  /** A small filled icon shown in the step's dot until it's done. */
  icon?: ReactNode;
};

export type ProgressTask = {
  id: string;
  /** What's happening, e.g. "Uploading launch-film.mp4". */
  label: string;
  /** A quieter second line, e.g. "145 MB of 480 MB · 8s left". */
  detail?: ReactNode;
  /** 0 to max. Null is indeterminate. */
  value: number | null;
  max?: number;
  /** The app's mark, about 20px. Pass several to show them as a small folder. */
  icon?: ReactNode | ReactNode[];
  /** Shown instead of the percentage, e.g. "Step 3 of 5". */
  valueLabel?: ReactNode;
  /** An accent for the bar and the running step's ring, e.g. the brand's colour. Neutral if unset. */
  color?: string;
  /** Shown with the check once value reaches max. */
  doneLabel?: string;
  /** Facts shown when the row is open, two to a line. */
  details?: readonly ProgressDetail[];
  /** Steps shown when the row is open. The running one is `step`. */
  steps?: readonly ProgressStep[];
  /** Index of the running step; steps.length when all are done. */
  step?: number;
  /** How far the running step is, 0 to 1. */
  stepProgress?: number;
  /** One small bar per destination, shown when the row is open. */
  subtasks?: readonly Omit<ProgressTask, "details" | "steps" | "subtasks" | "step" | "stepProgress">[];
};

export type ProgressProps = {
  tasks: readonly ProgressTask[];
  /** Shown at the top with a live count of what's running and what's done. */
  title?: string;
  /** Show the percentage (or valueLabel) on each row. */
  showValue?: boolean;
  /** Bar height in px. */
  thickness?: number;
  /** Ids of the open rows (controlled). */
  expanded?: readonly string[];
  /** Ids open at first (uncontrolled). */
  defaultExpanded?: readonly string[];
  onExpandedChange?: (ids: string[]) => void;
  /** "single" opens one row at a time and closes the last; "multiple" lets any number stay open. */
  openMode?: "single" | "multiple";
  className?: string;
};

const QUICK = { type: "spring", duration: 0.35, bounce: 0 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const DONE = "text-emerald-600 dark:text-emerald-400";
const RAISED = "bg-white dark:bg-white/[0.06]";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const isDone = (t: { value: number | null; max?: number }) => t.value !== null && t.value >= (t.max ?? 100);
const hasMore = (t: ProgressTask) => !!(t.details?.length || t.steps?.length || t.subtasks?.length);

const fadeUp = (i: number, base = 0) => ({
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, delay: base + 0.04 * i, ease: EASE_OUT },
});

export function Progress({ tasks, title, showValue = true, thickness = 4, expanded, defaultExpanded = [], onExpandedChange, openMode = "multiple", className }: ProgressProps) {
  const [inner, setInner] = useState<string[]>(() => [...defaultExpanded]);
  const single = openMode === "single";
  // In single mode only the latest open row counts, so switching modes never leaves two open.
  const all = expanded ?? inner;
  const open = single ? all.slice(-1) : all;
  const toggle = (id: string) => {
    const next = open.includes(id) ? open.filter((x) => x !== id) : single ? [id] : [...open, id];
    if (expanded === undefined) setInner(next);
    onExpandedChange?.(next);
  };
  const done = tasks.filter(isDone).length;
  const active = tasks.length - done;

  return (
    <MotionConfig reducedMotion="user">
      <section aria-label={title ?? "Progress"} className={cn("w-full rounded-[28px] bg-(--x-card) p-2 [--x-card:#f2f2f4] dark:[--x-card:#141416]", className)}>
        {title && (
          <header className="flex items-baseline justify-between gap-3 px-3 pt-2.5 pb-1">
            <h3 className="text-sm font-medium">{title}</h3>
            <span className="text-[13px] tabular-nums text-muted-foreground">
              <Roll value={active} /> active <span aria-hidden>·</span>{" "}
              <span className={cn("transition-colors duration-300", done > 0 && DONE)}>
                <Roll value={done} /> done
              </span>
            </span>
          </header>
        )}
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {tasks.map((t, i) => (
              <motion.li
                key={t.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                <Row task={t} index={i} open={open.includes(t.id)} onToggle={() => toggle(t.id)} showValue={showValue} thickness={thickness} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <style>{`@keyframes pg-slide{from{transform:translateX(-100%)}to{transform:translateX(250%)}}`}</style>
      </section>
    </MotionConfig>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function Row({ task, index, open, onToggle, showValue, thickness }: { task: ProgressTask; index: number; open: boolean; onToggle: () => void; showValue: boolean; thickness: number }) {
  const { id, label, detail, value, max = 100, icon, valueLabel, doneLabel = "Done", color } = task;
  const more = hasMore(task);
  const panelId = `pg-${id}`;
  const p = value === null ? null : clamp01(value / max);
  const done = p === 1;
  const { pct, x } = useEased(p ?? 0);

  return (
    <motion.div {...fadeUp(index)}>
      <div
        onClick={more ? onToggle : undefined}
        className={cn("flex gap-3.5 rounded-[20px] px-3 py-3.5 transition-colors duration-150", more && "cursor-pointer", more && !open && "hover:bg-foreground/[0.03]")}
      >
        {icon && <Mark icon={icon} done={done} />}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-0.5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{label}</div>
              {detail && <div className="truncate text-[13px] tabular-nums text-muted-foreground">{detail}</div>}
            </div>
            {showValue && <Value pct={pct} p={p} done={done} valueLabel={valueLabel} doneLabel={doneLabel} />}
            {more && (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={open ? `Hide details for ${label}` : `Show details for ${label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                className="-my-1.5 -mr-1.5 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-neutral-400"
              >
                <motion.svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" animate={{ rotate: open ? 180 : 0 }} transition={QUICK} aria-hidden>
                  <path d="M3.5 5.5 7 9l3.5-3.5" />
                </motion.svg>
              </button>
            )}
          </div>
          <Track label={label} value={value} max={max} p={p} done={done} x={x} thickness={thickness} color={color} />
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && more && (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 pr-3 pb-3.5 pl-3 sm:pl-[66px]">
              {task.subtasks?.length ? <Subtasks items={task.subtasks} thickness={Math.max(2, thickness - 1)} /> : null}
              {task.steps?.length ? <Steps steps={task.steps} current={task.step ?? 0} run={task.stepProgress ?? 0} color={color} /> : null}
              {task.details?.length ? <Details items={task.details} base={(task.steps?.length ?? 0) + (task.subtasks?.length ?? 0)} /> : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** The app's mark in a tile; several marks sit in it two by two, like a folder. */
function Mark({ icon, done, small }: { icon: ReactNode | ReactNode[]; done?: boolean; small?: boolean }) {
  const many = Array.isArray(icon);
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center text-foreground",
        RAISED,
        small ? "size-7 rounded-lg [&_svg]:size-4" : "size-10 rounded-xl",
        !small && (many ? "grid-cols-2 gap-[3px] p-[7px] [&_svg]:size-[11px]" : "[&_svg]:size-5"),
      )}
    >
      {many ? (icon as ReactNode[]).slice(0, 4).map((x, i) => <span key={i} className="grid place-items-center">{x}</span>) : icon}
      <AnimatePresence>
        {done && (
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={QUICK}
            className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-emerald-500 text-white ring-2 ring-(--x-card) [&_svg]:size-2.5!"
          >
            <Check size={10} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function Value({ pct, p, done, valueLabel, doneLabel }: { pct: ReturnType<typeof useEased>["pct"]; p: number | null; done: boolean; valueLabel?: ReactNode; doneLabel: string }) {
  // Out, then in, so the old value never sits over the new one.
  const swap = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.16, ease: EASE_OUT } };
  return (
    <span className={cn("relative flex h-5 shrink-0 items-center text-[13px] tabular-nums transition-colors duration-300", done ? DONE : "text-muted-foreground")}>
      <AnimatePresence initial={false} mode="wait">
        {done ? (
          <motion.span key="done" {...swap} className="flex items-center gap-1">
            <Check size={12} />
            {doneLabel}
          </motion.span>
        ) : p !== null ? (
          <motion.span key="value" {...swap}>
            {valueLabel ?? <motion.span>{pct}</motion.span>}
          </motion.span>
        ) : (
          <motion.span key="wait" {...swap}>
            Waiting
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function Track({ label, value, max, p, done, x, thickness, color }: { label: string; value: number | null; max: number; p: number | null; done: boolean; x: ReturnType<typeof useEased>["x"]; thickness: number; color?: string }) {
  const fill = color && !done ? { backgroundColor: color } : undefined;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      className="relative w-full overflow-hidden rounded-full bg-foreground/[0.08]"
      style={{ height: thickness }}
    >
      {p === null ? (
        <div style={fill} className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-foreground motion-safe:animate-[pg-slide_1.3s_cubic-bezier(0.65,0,0.35,1)_infinite] motion-reduce:w-full motion-reduce:opacity-40" />
      ) : (
        <motion.div className={cn("absolute inset-0 rounded-full transition-colors duration-300", done ? "bg-emerald-500" : "bg-foreground")} style={{ x, ...fill }} />
      )}
    </div>
  );
}

// ─── Inside an open row ──────────────────────────────────────────────────────

function Subtasks({ items, thickness }: { items: NonNullable<ProgressTask["subtasks"]>; thickness: number }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((s, i) => (
        <motion.li key={s.id} {...fadeUp(i, 0.05)}>
          <Sub task={s} thickness={thickness} />
        </motion.li>
      ))}
    </ul>
  );
}

function Sub({ task, thickness }: { task: NonNullable<ProgressTask["subtasks"]>[number]; thickness: number }) {
  const { label, detail, value, max = 100, icon, valueLabel, doneLabel = "Done", color } = task;
  const p = value === null ? null : clamp01(value / max);
  const done = p === 1;
  const { pct, x } = useEased(p ?? 0);
  return (
    <div className="flex items-center gap-3">
      {icon && !Array.isArray(icon) && <Mark icon={icon} small />}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline gap-2 text-[13px]">
          <span className="truncate font-medium">{label}</span>
          {detail && <span className="min-w-0 flex-1 truncate tabular-nums text-muted-foreground">{detail}</span>}
          {!detail && <span className="flex-1" />}
          <Value pct={pct} p={p} done={done} valueLabel={valueLabel} doneLabel={doneLabel} />
        </div>
        <Track label={label} value={value} max={max} p={p} done={done} x={x} thickness={thickness} color={color} />
      </div>
    </div>
  );
}

function Steps({ steps, current, run, color }: { steps: readonly ProgressStep[]; current: number; run: number; color?: string }) {
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <motion.li key={s.label} {...fadeUp(i, 0.05)} aria-current={state === "active" ? "step" : undefined} className="relative flex min-h-10 items-center gap-3 text-[13px]">
            {i < steps.length - 1 && (
              <span aria-hidden className="absolute top-[35px] left-[11.5px] h-[calc(100%-30px)] w-px overflow-hidden bg-foreground/10">
                <motion.span className="absolute inset-0 origin-top bg-foreground" initial={false} animate={{ scaleY: i < current ? 1 : i === current ? clamp01(run) : 0 }} transition={{ type: "spring", duration: 0.7, bounce: 0 }} />
              </span>
            )}
            <span
              className={cn(
                "relative grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-300 [&_svg]:size-3",
                state === "done" ? "bg-foreground text-background" : state === "active" ? "bg-foreground/[0.08] text-foreground" : "bg-foreground/[0.06] text-muted-foreground",
              )}
            >
              {state === "active" && (
                <svg className="absolute inset-0 size-6! -rotate-90" viewBox="0 0 24 24" aria-hidden>
                  <motion.circle cx={12} cy={12} r={11} fill="none" strokeWidth={2} strokeLinecap="round" className="stroke-foreground" style={color ? { stroke: color } : undefined} initial={{ pathLength: 0 }} animate={{ pathLength: Math.max(0.04, clamp01(run)) }} transition={{ type: "spring", duration: 0.7, bounce: 0 }} />
                </svg>
              )}
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={state === "done" ? "done" : "mark"}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={QUICK}
                  className="grid place-items-center text-[11px] font-medium tabular-nums"
                >
                  {state === "done" ? <Check size={11} /> : (s.icon ?? i + 1)}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className={cn("min-w-0 flex-1 truncate transition-colors duration-300", state === "todo" ? "text-muted-foreground" : "text-foreground", state === "active" && "font-medium")}>{s.label}</span>
            {s.detail && <span className="shrink-0 tabular-nums text-muted-foreground">{s.detail}</span>}
          </motion.li>
        );
      })}
    </ol>
  );
}

function Details({ items, base }: { items: readonly ProgressDetail[]; base: number }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-foreground/[0.035] p-3 text-[13px]">
      {items.map((d, i) => (
        <motion.div key={d.label} {...fadeUp(base + i, 0.05)} className="flex min-w-0 items-center gap-2.5">
          {d.icon && (
            <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-[10px] text-muted-foreground [&_svg]:size-3.5", RAISED)}>
              {d.icon}
            </span>
          )}
          <div className="min-w-0">
            <dt className="truncate text-[12px] text-muted-foreground">{d.label}</dt>
            <dd className="truncate tabular-nums">{d.value}</dd>
          </div>
        </motion.div>
      ))}
    </dl>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────

/** One spring per value: it drives the fill and the number together, so they never drift apart. */
// A critically damped spring keeps its speed when a new value lands mid-flight, so a stream of
// small updates reads as one continuous glide. A big drop is a new run, not a reversal: it jumps.
function useEased(p: number) {
  const spring = useSpring(p, { stiffness: 90, damping: 19, restDelta: 0.0005 });
  useEffect(() => {
    if (p < spring.get() - 0.15) spring.jump(p);
    else spring.set(p);
  }, [spring, p]);
  const pct = useTransform(spring, (v) => `${Math.floor(v * 100 + 0.0001)}%`);
  // The fill slides in from the left instead of stretching, so its rounded end stays round.
  const x = useTransform(spring, (v) => `${(Math.min(1, Math.max(0, v)) - 1) * 100}%`);
  return { spring, pct, x };
}

function Check({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <motion.path d="M2.6 6.3 4.9 8.6 9.4 3.6" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.1, ease: EASE_OUT }} />
    </svg>
  );
}

/** A small count whose digits roll up when it grows and down when it shrinks. */
function Roll({ value }: { value: number }) {
  const [last, setLast] = useState(value);
  const [dir, setDir] = useState(1);
  if (last !== value) {
    setDir(value > last ? 1 : -1);
    setLast(value);
  }
  return (
    <span className="relative inline-flex overflow-hidden align-bottom">
      <AnimatePresence initial={false} mode="popLayout" custom={dir}>
        <motion.span
          key={value}
          custom={dir}
          variants={{ in: (d: number) => ({ y: d * 10, opacity: 0 }), on: { y: 0, opacity: 1 }, out: (d: number) => ({ y: d * -10, opacity: 0 }) }}
          initial="in"
          animate="on"
          exit="out"
          transition={{ duration: 0.2, ease: EASE_OUT }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
