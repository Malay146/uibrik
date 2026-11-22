"use client";

import NumberFlow from "@number-flow/react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const SIZES = {
  sm: { height: 32, padX: 12, font: 13, icon: 15 },
  md: { height: 40, padX: 15, font: 14, icon: 17 },
  lg: { height: 48, padX: 18, font: 15, icon: 19 },
} as const;

type Phase = "idle" | "loading" | "done";

export type DownloadButtonProps = {
  label?: string;
  /** Shown once the download finishes; clicking it calls onOpen. */
  doneLabel?: string;
  /** Drive the bar yourself, from 0 to 1. Leave out to simulate a download of `duration` seconds. */
  progress?: number;
  /** Seconds a simulated download takes. */
  duration?: number;
  /** Seconds the finished state shows before it goes back to the start. 0 keeps it. */
  resetAfter?: number;
  /** Colour of the check once done. */
  successColor?: string;
  size?: keyof typeof SIZES;
  /** Called when the button is pressed at rest. */
  onDownload?: () => void;
  /** Called when a download in flight is pressed again. */
  onCancel?: () => void;
  /** Called when the finished button is pressed. */
  onOpen?: () => void;
  className?: string;
};

// A simulated download doesn't move at one speed: it starts fast, stalls a
// moment, then runs to the end.
const SIM = { values: [0, 0.22, 0.46, 0.5, 0.84, 1], times: [0, 0.18, 0.42, 0.58, 0.84, 1] };

export function DownloadButton({
  label = "Download",
  doneLabel = "Open",
  progress,
  duration = 2.8,
  resetAfter = 3,
  successColor = "#16a34a",
  size = "md",
  onDownload,
  onCancel,
  onOpen,
  className,
}: DownloadButtonProps) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const value = useMotionValue(0);
  const run = useRef<AnimationPlaybackControls>(undefined);
  const [ref, { width }] = useMeasure();
  const s = SIZES[size];

  useEffect(() => value.on("change", (v) => setPct(Math.round(v * 100))), [value]);
  useEffect(() => () => run.current?.stop(), []);

  // Controlled: follow the given progress and finish at 1.
  useEffect(() => {
    if (progress === undefined || phase !== "loading") return;
    run.current = animate(value, Math.min(1, Math.max(0, progress)), { duration: 0.3, ease: EASE_OUT });
    if (progress >= 1) {
      const t = setTimeout(() => setPhase("done"), 320);
      return () => clearTimeout(t);
    }
  }, [progress, phase, value]);

  useEffect(() => {
    if (phase !== "done" || !resetAfter) return;
    const t = setTimeout(() => {
      setPhase("idle");
      value.jump(0);
    }, resetAfter * 1000);
    return () => clearTimeout(t);
  }, [phase, resetAfter, value]);

  const press = () => {
    if (phase === "idle") {
      value.jump(0);
      setPhase("loading");
      onDownload?.();
      if (progress === undefined) {
        run.current = animate(value, SIM.values, {
          duration: reduce ? 0.6 : duration,
          times: SIM.times,
          ease: "easeInOut",
          onComplete: () => setPhase("done"),
        });
      }
    } else if (phase === "loading") {
      run.current?.stop();
      value.jump(0);
      setPhase("idle");
      onCancel?.();
    } else {
      onOpen?.();
    }
  };

  const key = phase === "loading" ? "pct" : phase;

  return (
    <motion.button
      type="button"
      onClick={press}
      aria-label={phase === "loading" ? `Downloading, ${pct}%. Press to cancel.` : undefined}
      whileTap={{ scale: 0.96 }}
      initial={false}
      animate={{ width: width || "auto" }}
      transition={{ duration: reduce ? 0 : 0.3, ease: EASE_OUT }}
      style={{
        height: s.height,
        fontSize: s.font,
        // Done: a soft wash of the success colour with the label in it.
        color: phase === "done" ? successColor : undefined,
        backgroundColor: phase === "done" ? `color-mix(in srgb, ${successColor} 12%, transparent)` : undefined,
      }}
      className={cn(
        "relative cursor-pointer overflow-hidden rounded-full font-medium tracking-tight outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        phase === "idle"
          ? "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          : "bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100",
        className,
      )}
    >
      {/* The fill: a darker tone sweeping across the pill from the left. */}
      <motion.span
        aria-hidden
        className="absolute inset-0 origin-left bg-neutral-200 dark:bg-neutral-800"
        style={{ scaleX: value }}
        initial={false}
        animate={{ opacity: phase === "loading" ? 1 : 0 }}
        transition={{ duration: phase === "loading" ? 0 : 0.35 }}
      />
      <span ref={ref} className="relative flex h-full w-max items-center gap-1.5" style={{ paddingLeft: s.padX - 2, paddingRight: s.padX }}>
        <Glyph phase={phase} size={s.icon} successColor={successColor} />
        <span className="relative overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={key}
              className="block whitespace-nowrap tabular-nums"
              initial={{ y: "100%", opacity: 0, filter: "blur(2px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={{ y: "-100%", opacity: 0, filter: "blur(2px)" }}
              transition={{ duration: reduce ? 0 : 0.28, ease: EASE_OUT }}
            >
              {phase === "loading" ? (
                // Fixed width, so the pill doesn't twitch as digits change.
                <span className="inline-block min-w-[3.2ch] text-left">
                  <NumberFlow value={pct} suffix="%" animated={!reduce} />
                </span>
              ) : phase === "done" ? (
                doneLabel
              ) : (
                label
              )}
            </motion.span>
          </AnimatePresence>
        </span>
      </span>
    </motion.button>
  );
}

function Glyph({ phase, size, successColor }: { phase: Phase; size: number; successColor: string }) {
  const reduce = useReducedMotion();
  const d = (n: number) => (reduce ? 0 : n);
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="overflow-visible">
      <path d="M2.8 10.2 v1.6 a1.6 1.6 0 0 0 1.6 1.6 h7.2 a1.6 1.6 0 0 0 1.6 -1.6 v-1.6" />
      {/* The arrow drops into the tray on press, and keeps dropping in while it loads. */}
      <motion.g
        initial={false}
        animate={
          phase === "idle"
            ? { y: 0, opacity: 1 }
            : phase === "loading" && !reduce
              ? { y: [-5, 1.5], opacity: [0, 1, 1, 0] }
              : { y: 3, opacity: 0 }
        }
        transition={
          phase === "loading" && !reduce
            ? { duration: 0.9, ease: "easeIn", repeat: Infinity, opacity: { duration: 0.9, times: [0, 0.25, 0.7, 1], repeat: Infinity } }
            : { duration: d(0.2), ease: EASE_OUT }
        }
      >
        <path d="M8 2.4 v6.4" />
        <path d="M5.2 6.2 L8 9 L10.8 6.2" />
      </motion.g>
      <motion.path
        d="M5.2 6.4 L7.2 8.4 L11 4.4"
        stroke={successColor}
        initial={false}
        animate={{ pathLength: phase === "done" ? 1 : 0, opacity: phase === "done" ? 1 : 0 }}
        transition={{ pathLength: { duration: d(0.3), ease: EASE_OUT, delay: d(0.08) }, opacity: { duration: d(0.05), delay: d(0.08) } }}
      />
    </svg>
  );
}
