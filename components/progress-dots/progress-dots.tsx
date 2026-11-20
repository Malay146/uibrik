"use client";

import { IconCheck, IconPlayerPauseFilled, IconPlayerPlayFilled, IconRotateClockwise } from "@tabler/icons-react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, type MotionValue } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", duration: 0.45, bounce: 0 } as const;
const PILL_HEIGHT = 26;
const LABEL_PAD = 10;
// Room a done step's check takes in front of its label.
const CHECK = 16;
const CONTROL = 26;
// The pause button's size beside resting dots.
const CONTROL_REST = 18;
// Vertical padding around a segment's bar, which is also its touch target.
const SEGMENT_PAD = 12;

export type ProgressStep = string | { label: string; /** Seconds this step plays for, instead of `duration`. */ duration?: number };

export type ProgressDotsProps = {
  /** One entry per step: a label, or a label with its own duration. */
  steps: ProgressStep[];
  /**
   * - dots: pagination dots, the active one a filling pill
   * - segments: equal bars across the full width, filled one after another
   */
  variant?: "dots" | "segments";
  /** Lay the steps out in a row, or stacked in a column with labels opening to the right. */
  orientation?: "horizontal" | "vertical";
  /** Controlled active step. */
  index?: number;
  /** Starting step when uncontrolled. */
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  /**
   * The active step's fill, 0 to 1. Pass your own `useMotionValue(0)` to tie
   * content to it, e.g. a slide's crossfade or zoom.
   */
  progress?: MotionValue<number>;
  /** Seconds each step plays for, unless the step sets its own. */
  duration?: number;
  /** Fill the active step and move on by itself. */
  autoplay?: boolean;
  /** Start over after the last step. Otherwise it stops there and calls onComplete. */
  loop?: boolean;
  /** Controlled pause, as set by the play/pause button. */
  paused?: boolean;
  defaultPaused?: boolean;
  onPausedChange?: (paused: boolean) => void;
  /** Show a play/pause button after the steps, so anyone can stop the motion. */
  showControl?: boolean;
  /**
   * When the steps show their labels.
   * - hover: on hover or keyboard focus, and on tap for touch
   * - always: always labelled
   * - never: never labelled
   */
  expand?: "hover" | "always" | "never";
  /** Hold the fill while the pointer or focus is on the steps. */
  pauseOnHover?: boolean;
  /** Diameter of a resting dot in px. */
  dotSize?: number;
  /** Width of the active dot in px. */
  activeWidth?: number;
  /** Height of each bar in px, for segments. */
  barHeight?: number;
  /** Space between steps in px. */
  gap?: number;
  /** Called when the last step finishes and loop is off. */
  onComplete?: () => void;
  /** Accessible name for the group. */
  label?: string;
  className?: string;
};

const labelOf = (step: ProgressStep) => (typeof step === "string" ? step : step.label);

export function ProgressDots({
  steps,
  variant = "dots",
  orientation = "horizontal",
  index: indexProp,
  defaultIndex = 0,
  onIndexChange,
  progress: progressProp,
  duration = 4,
  autoplay = true,
  loop = true,
  paused: pausedProp,
  defaultPaused = false,
  onPausedChange,
  showControl = true,
  expand = "hover",
  pauseOnHover = true,
  dotSize = 6,
  activeWidth = 24,
  barHeight = 3,
  gap = 6,
  onComplete,
  label = "Steps",
  className,
}: ProgressDotsProps) {
  const reduce = useReducedMotion();
  const [inner, setInner] = useState(defaultIndex);
  const index = Math.min(Math.max(indexProp ?? inner, 0), Math.max(steps.length - 1, 0));
  const ownProgress = useMotionValue(0);
  const progress = progressProp ?? ownProgress;
  const [innerPaused, setInnerPaused] = useState(defaultPaused);
  const paused = pausedProp ?? innerPaused;

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [finished, setFinished] = useState(false);
  const [room, setRoom] = useState(Infinity);
  const [labelWidths, setLabelWidths] = useState<number[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const touchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pointerType = useRef("mouse");

  const segments = variant === "segments";
  const vertical = orientation === "vertical";
  const expanded = expand === "always" || (expand === "hover" && (hovered || focused || touched));
  const engaged = hovered || focused || touched;
  const playing =
    autoplay && !paused && !finished && onScreen && pageVisible && !(pauseOnHover && engaged) && steps.length > 0;
  const stepDuration = (i: number) => {
    const step = steps[i];
    return (typeof step === "object" && step.duration) || duration;
  };

  const go = (next: number) => {
    setFinished(false);
    if (indexProp === undefined) setInner(next);
    onIndexChange?.(next);
  };

  const setPaused = (next: boolean) => {
    if (pausedProp === undefined) setInnerPaused(next);
    onPausedChange?.(next);
  };

  // A new step always starts empty, whoever moved it.
  useLayoutEffect(() => {
    progress.jump(0);
  }, [index, progress]);

  // Resumes from wherever the fill was held, so a pause never restarts a step.
  useEffect(() => {
    if (!playing) return;
    const ctl = animate(progress, 1, {
      duration: (1 - progress.get()) * stepDuration(index),
      ease: "linear",
      onComplete: () => {
        if (index < steps.length - 1) go(index + 1);
        else if (loop) go(0);
        else {
          setFinished(true);
          onComplete?.();
        }
      },
    });
    return () => ctl.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, duration, loop, steps]);

  // No fill runs while nobody can see it. The parent's width decides how many
  // labels fit at once.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    io.observe(el);
    const parent = el.parentElement;
    const ro = new ResizeObserver(([entry]) => setRoom(entry.contentRect.width));
    if (parent) ro.observe(parent);
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => () => clearTimeout(touchTimer.current), []);

  // Labels open around the active step: all of them when the row fits, else
  // the active step and its neighbours, else the active step alone.
  const controlRoom = showControl ? CONTROL + gap : 0;
  const rowWidth = (reach: number) =>
    steps.reduce<number>((sum, _, i) => {
      const labelled = Math.abs(i - index) <= reach;
      const w = labelled ? Math.max(labelWidths[i] ?? 0, dotSize) + (i < index ? CHECK : 0) : dotSize;
      return sum + w + gap;
    }, controlRoom);
  // A column grows down, not across, so every label always fits.
  const reach = expanded ? (vertical ? Infinity : ([Infinity, 1].find((r) => rowWidth(r) <= room) ?? 0)) : -1;

  const measureLabel = (i: number, w: number) =>
    setLabelWidths((prev) => {
      if (prev[i] === w) return prev;
      const next = [...prev];
      next[i] = w;
      return next;
    });

  // Touch has no hover: a tap opens the labels and they fold away again after a while.
  const holdTouch = () => {
    setTouched(true);
    clearTimeout(touchTimer.current);
    touchTimer.current = setTimeout(() => setTouched(false), 3000);
  };

  const select = (i: number) => {
    if (pointerType.current !== "mouse" && expand === "hover" && !expanded) return holdTouch();
    if (pointerType.current !== "mouse") holdTouch();
    if (i === index) {
      if (finished) go(i);
      return;
    }
    go(i);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).matches("[data-step]")) return;
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next: number | undefined;
    if (e.key in keys) next = (index + keys[e.key] + steps.length) % steps.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = steps.length - 1;
    if (next === undefined) return;
    e.preventDefault();
    go(next);
    root.current?.querySelectorAll<HTMLButtonElement>("[data-step]")[next]?.focus();
  };

  const control = showControl && autoplay && (
    <Control
      state={finished ? "replay" : paused ? "paused" : "playing"}
      expanded={expanded && !segments}
      vertical={vertical}
      // Lines the button up with the bars or dots across the row: segments
      // carry labels beside them, and a column of dots is narrower than the button.
      cross={segments ? SEGMENT_PAD + barHeight / 2 - CONTROL_REST / 2 : vertical && !expanded ? (dotSize - CONTROL_REST) / 2 : 0}
      gap={gap}
      instant={!!reduce}
      onPress={() => {
        if (pointerType.current !== "mouse") holdTouch();
        if (finished) go(0);
        else setPaused(!paused);
      }}
    />
  );

  const stateOf = (i: number) => (i < index ? "done" : i === index ? "active" : "next") as StepState;

  return (
    <div
      ref={root}
      role="group"
      aria-label={label}
      // Only the steps open the labels. Reaching for the pause button must not
      // widen the row, or the button slides out from under the pointer.
      onPointerOver={(e) => e.pointerType === "mouse" && (e.target as HTMLElement).closest("[data-step]") && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
      onPointerDown={(e) => (pointerType.current = e.pointerType)}
      onFocus={(e) => setFocused(e.target.matches(":focus-visible"))}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setFocused(false)}
      onKeyDown={onKeyDown}
      style={segments || vertical ? undefined : { height: PILL_HEIGHT }}
      className={cn(
        "flex",
        vertical ? "flex-col items-start" : segments ? "items-start" : "items-center",
        segments && (vertical ? "h-full" : "w-full"),
        className,
      )}
    >
      {steps.map((step, i) =>
        segments ? (
          <Segment
            key={i}
            label={labelOf(step)}
            position={`${i + 1} of ${steps.length}`}
            state={stateOf(i)}
            expanded={expanded}
            reserveLabel={expand !== "never"}
            progress={progress}
            barHeight={barHeight}
            vertical={vertical}
            gap={gap}
            instant={!!reduce}
            tabIndex={i === index ? 0 : -1}
            onSelect={() => select(i)}
          />
        ) : (
          <Dot
            key={i}
            label={labelOf(step)}
            position={`${i + 1} of ${steps.length}`}
            state={stateOf(i)}
            expanded={expanded}
            labelled={Math.abs(i - index) <= reach}
            progress={progress}
            dotSize={dotSize}
            activeWidth={activeWidth}
            vertical={vertical}
            gap={gap}
            instant={!!reduce}
            tabIndex={i === index ? 0 : -1}
            onMeasure={(w) => measureLabel(i, w)}
            onSelect={() => select(i)}
          />
        ),
      )}
      {control}
    </div>
  );
}

type StepState = "done" | "active" | "next";

/** Steps behind keep a full fill and steps ahead an empty one; only the active step reads the shared progress. */
function useFill(state: StepState, progress: MotionValue<number>, instant: boolean) {
  const active = state === "active";
  const rest = useMotionValue(state === "done" ? 1 : 0);
  const wasActive = useRef(active);
  // Child layout effects run before the parent resets the progress, so a step
  // leaving the spotlight can still pick up exactly where its fill was.
  useLayoutEffect(() => {
    if (wasActive.current && !active) rest.jump(progress.get());
    wasActive.current = active;
  }, [active, progress, rest]);
  useEffect(() => {
    if (active) return;
    const ctl = animate(rest, state === "done" ? 1 : 0, instant ? { duration: 0 } : SPRING);
    return () => ctl.stop();
  }, [state, active, rest, instant]);
  return active ? progress : rest;
}

type DotProps = {
  label: string;
  position: string;
  state: StepState;
  expanded: boolean;
  /** Open into a labelled pill. False keeps the step a dot while the others open, when the row would overflow. */
  labelled: boolean;
  progress: MotionValue<number>;
  dotSize: number;
  activeWidth: number;
  vertical: boolean;
  gap: number;
  instant: boolean;
  tabIndex: number;
  onMeasure: (width: number) => void;
  onSelect: () => void;
};

function Dot({ label, position, state, expanded, labelled, progress, dotSize, activeWidth, vertical, gap, instant, tabIndex, onMeasure, onSelect }: DotProps) {
  // Measured even while clipped, so the dot can open straight to its label.
  const [labelRef, { width: labelWidth }] = useMeasure();
  const active = state === "active";
  const done = state === "done";
  const transition = instant ? { duration: 0 } : SPRING;
  const fill = useFill(state, progress, instant);
  const open = expanded && labelled;

  useEffect(() => {
    if (labelWidth) onMeasure(labelWidth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelWidth]);

  const long = active && !expanded ? activeWidth : dotSize;
  const width = open ? Math.max(labelWidth, dotSize) + (done ? CHECK : 0) : vertical ? dotSize : long;
  const height = open ? PILL_HEIGHT : vertical ? long : dotSize;
  // A resting dot in a column fills downward; an open pill always fills across.
  const down = vertical && !open;

  return (
    <button
      type="button"
      data-step
      tabIndex={tabIndex}
      aria-label={`${label}, step ${position}${done ? ", done" : ""}`}
      aria-current={active ? "step" : undefined}
      onClick={onSelect}
      style={vertical ? { paddingBlock: gap / 2 } : { paddingInline: gap / 2 }}
      // The hit area reaches well past the dot, across the row, for touch.
      className={cn(
        "group/dot relative flex cursor-pointer items-center outline-none before:absolute before:content-['']",
        vertical ? "before:inset-y-0 before:-inset-x-3" : "before:inset-x-0 before:-inset-y-3",
      )}
    >
      <motion.span
        initial={false}
        animate={{
          width,
          height,
          backgroundColor: open
            ? "color-mix(in oklab, var(--foreground) 7%, transparent)"
            : "color-mix(in oklab, var(--foreground) 18%, transparent)",
        }}
        transition={transition}
        className="relative block overflow-hidden rounded-full group-focus-visible/dot:ring-2 group-focus-visible/dot:ring-neutral-400 group-focus-visible/dot:ring-offset-2 group-focus-visible/dot:ring-offset-background"
      >
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: open ? (active ? 0.1 : 0) : done ? 0.3 : active ? 1 : 0 }}
          transition={transition}
          style={down ? { scaleX: 1, scaleY: fill } : { scaleX: fill, scaleY: 1 }}
          className="absolute inset-0 origin-top-left rounded-[inherit] bg-foreground"
        />
        <motion.span
          aria-hidden
          initial={false}
          animate={open ? { opacity: 1, filter: "blur(0px)" } : { opacity: 0, filter: "blur(2px)" }}
          transition={instant ? { duration: 0 } : { duration: open ? 0.3 : 0.12, delay: open ? 0.06 : 0 }}
          style={{ lineHeight: `${PILL_HEIGHT}px` }}
          className={cn(
            "absolute left-0 top-1/2 flex -translate-y-1/2 items-center whitespace-nowrap text-xs font-medium transition-colors duration-150",
            active ? "text-foreground" : done ? "text-foreground/75" : "text-muted-foreground group-hover/dot:text-foreground",
          )}
        >
          <motion.span
            initial={false}
            animate={{ opacity: done ? 1 : 0, scale: done ? 1 : 0.5 }}
            transition={transition}
            className="absolute grid place-items-center"
            style={{ left: LABEL_PAD - 2, width: CHECK - 2 }}
          >
            <IconCheck size={12} stroke={2.5} />
          </motion.span>
          {/* Moves aside for the check instead of resizing, so the text never stretches. */}
          <motion.span
            ref={labelRef}
            initial={false}
            animate={{ x: done ? CHECK : 0 }}
            transition={transition}
            style={{ paddingInline: LABEL_PAD }}
          >
            {label}
          </motion.span>
        </motion.span>
      </motion.span>
    </button>
  );
}

type SegmentProps = {
  label: string;
  position: string;
  state: StepState;
  expanded: boolean;
  /** Hold a line for the labels under the bars so opening them never shifts the page. */
  reserveLabel: boolean;
  progress: MotionValue<number>;
  barHeight: number;
  vertical: boolean;
  gap: number;
  instant: boolean;
  tabIndex: number;
  onSelect: () => void;
};

function Segment({ label, position, state, expanded, reserveLabel, progress, barHeight, vertical, gap, instant, tabIndex, onSelect }: SegmentProps) {
  const active = state === "active";
  const fill = useFill(state, progress, instant);

  return (
    <button
      type="button"
      data-step
      tabIndex={tabIndex}
      aria-label={`${label}, step ${position}${state === "done" ? ", done" : ""}`}
      aria-current={active ? "step" : undefined}
      onClick={onSelect}
      style={vertical ? { paddingBlock: gap / 2, paddingInline: SEGMENT_PAD } : { paddingInline: gap / 2, paddingBlock: SEGMENT_PAD }}
      className={cn(
        "group/seg relative flex flex-1 cursor-pointer gap-2 outline-none",
        vertical ? "min-h-0 flex-row items-start" : "min-w-0 flex-col",
      )}
    >
      <span
        style={vertical ? { width: barHeight } : { height: barHeight }}
        className="relative block shrink-0 self-stretch overflow-hidden rounded-full bg-foreground/15 group-focus-visible/seg:ring-2 group-focus-visible/seg:ring-neutral-400 group-focus-visible/seg:ring-offset-2 group-focus-visible/seg:ring-offset-background"
      >
        <motion.span
          aria-hidden
          style={vertical ? { scaleY: fill } : { scaleX: fill }}
          className="absolute inset-0 origin-top-left bg-foreground"
        />
      </span>
      {reserveLabel && (
        <motion.span
          aria-hidden
          initial={false}
          animate={expanded ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: vertical ? -3 : 0, y: vertical ? 0 : -3 }}
          transition={instant ? { duration: 0 } : { duration: expanded ? 0.25 : 0.12, delay: expanded ? 0.04 : 0 }}
          className={cn(
            "block truncate text-left text-xs font-medium leading-4 transition-colors duration-150",
            active ? "text-foreground" : "text-muted-foreground group-hover/seg:text-foreground",
          )}
        >
          {label}
        </motion.span>
      )}
    </button>
  );
}

type ControlProps = {
  state: "playing" | "paused" | "replay";
  expanded: boolean;
  vertical: boolean;
  /** Shift across the row, to line up with the steps. */
  cross: number;
  gap: number;
  instant: boolean;
  onPress: () => void;
};

const CONTROL_ICONS = {
  playing: { Icon: IconPlayerPauseFilled, label: "Pause" },
  paused: { Icon: IconPlayerPlayFilled, label: "Play" },
  replay: { Icon: IconRotateClockwise, label: "Replay" },
};

function Control({ state, expanded, vertical, cross, gap, instant, onPress }: ControlProps) {
  const { Icon, label } = CONTROL_ICONS[state];
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onPress}
      initial={false}
      animate={vertical ? { x: cross, y: 0 } : { x: 0, y: cross }}
      transition={instant ? { duration: 0 } : SPRING}
      style={vertical ? { marginTop: gap / 2 } : { marginLeft: gap / 2 }}
      className="group/ctl relative grid shrink-0 cursor-pointer place-items-center outline-none before:absolute before:-inset-2 before:content-['']"
    >
      {/* Quiet beside resting dots, a full button once the labels are out. */}
      <motion.span
        initial={false}
        animate={{
          width: expanded ? CONTROL : CONTROL_REST,
          height: expanded ? CONTROL : CONTROL_REST,
          backgroundColor: expanded
            ? "color-mix(in oklab, var(--foreground) 7%, transparent)"
            : "color-mix(in oklab, var(--foreground) 0%, transparent)",
        }}
        transition={instant ? { duration: 0 } : SPRING}
        className="relative grid place-items-center rounded-full text-muted-foreground transition-[color] duration-150 group-hover/ctl:text-foreground group-focus-visible/ctl:ring-2 group-focus-visible/ctl:ring-neutral-400"
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={state}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={instant ? { duration: 0 } : { type: "spring", duration: 0.25, bounce: 0 }}
            className="grid"
          >
            <Icon size={11} />
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </motion.button>
  );
}
