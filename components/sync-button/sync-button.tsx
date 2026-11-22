"use client";

import { AnimatePresence, animate, motion, useAnimationControls, useMotionValue, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const SIZES = {
  sm: { height: 32, padX: 12, font: 13, icon: 15 },
  md: { height: 40, padX: 14, font: 14, icon: 17 },
  lg: { height: 48, padX: 17, font: 15, icon: 19 },
} as const;

// Degrees per second while spinning; the stop eases out from this speed.
const SPEED = 420;

type Phase = "idle" | "syncing" | "done" | "error";

export type SyncButtonProps = {
  /** Runs the sync. Return a promise to spin until it settles; a rejection shows the error state. Without it, a sync of `duration` seconds is simulated. */
  onSync?: () => Promise<unknown> | void;
  /** Seconds a simulated sync takes. */
  duration?: number;
  /** When the last sync happened, on mount. Leave out to show the idle label. */
  defaultLastSynced?: Date | number;
  /** Label before the first sync. */
  label?: string;
  syncingLabel?: string;
  /** Prefix for the time since the last sync. */
  syncedLabel?: string;
  errorLabel?: string;
  /** Colour of the check after a sync. */
  successColor?: string;
  /** Colour of the error state. */
  errorColor?: string;
  size?: keyof typeof SIZES;
  className?: string;
};

function ago(at: number, now: number) {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SyncButton({
  onSync,
  duration = 1.6,
  defaultLastSynced,
  label = "Sync now",
  syncingLabel = "Syncing",
  syncedLabel = "Synced",
  errorLabel = "Couldn't sync",
  successColor = "#16a34a",
  errorColor = "#dc2626",
  size = "md",
  className,
}: SyncButtonProps) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [last, setLast] = useState<number | undefined>(defaultLastSynced === undefined ? undefined : +defaultLastSynced);
  const [now, setNow] = useState(() => Date.now());
  const rotate = useMotionValue(0);
  const spin = useRef<AnimationPlaybackControls>(undefined);
  const shake = useAnimationControls();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [ref, { width }] = useMeasure();
  const s = SIZES[size];

  // Keeps "3 min ago" honest without re-rendering every second.
  useEffect(() => {
    if (last === undefined) return;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [last]);

  useEffect(() => () => {
    spin.current?.stop();
    clearTimeout(timer.current);
  }, []);

  // Coast to the next upright position from full speed instead of stopping dead.
  const land = () => {
    spin.current?.stop();
    const r = rotate.get();
    let target = Math.ceil(r / 360) * 360;
    if (target - r < 90) target += 360;
    const remaining = target - r;
    spin.current = animate(rotate, target, { duration: reduce ? 0 : (3 * remaining) / SPEED, ease: [0.33, 1, 0.68, 1] });
    return spin.current;
  };

  const run = async () => {
    if (phase === "syncing") return;
    clearTimeout(timer.current);
    setPhase("syncing");
    if (!reduce) {
      const from = rotate.get() % 360;
      rotate.jump(from);
      spin.current = animate(rotate, from + 360, { duration: 360 / SPEED, ease: "linear", repeat: Infinity });
    }
    let ok = true;
    try {
      const result = onSync?.();
      await (result instanceof Promise ? result : new Promise((r) => setTimeout(r, duration * 1000)));
    } catch {
      ok = false;
    }
    await land();
    if (ok) {
      const t = Date.now();
      setLast(t);
      setNow(t);
      setPhase("done");
      timer.current = setTimeout(() => setPhase("idle"), 1600);
    } else {
      setPhase("error");
      if (!reduce) shake.start({ x: [0, -5, 4, -2.5, 1.5, 0], transition: { duration: 0.4, ease: "easeOut" } });
      timer.current = setTimeout(() => setPhase("idle"), 2400);
    }
  };

  const text =
    phase === "syncing"
      ? syncingLabel
      : phase === "error"
        ? errorLabel
        : phase === "done"
          ? syncedLabel
          : last === undefined
            ? label
            : `${syncedLabel} ${ago(last, now)}`;

  return (
    <motion.div animate={shake} className={cn("inline-flex", className)}>
      <motion.button
        type="button"
        onClick={run}
        aria-busy={phase === "syncing"}
        whileTap={{ scale: 0.96 }}
        initial={false}
        animate={{ width: width || "auto" }}
        transition={{ duration: reduce ? 0 : 0.3, ease: EASE_OUT }}
        style={{
          height: s.height,
          fontSize: s.font,
          // Success and failure each get a soft wash of their colour.
          color: phase === "error" ? errorColor : phase === "done" ? successColor : undefined,
          backgroundColor:
            phase === "error"
              ? `color-mix(in srgb, ${errorColor} 10%, transparent)`
              : phase === "done"
                ? `color-mix(in srgb, ${successColor} 12%, transparent)`
                : undefined,
        }}
        className="relative cursor-pointer overflow-hidden rounded-full bg-neutral-100 font-medium tracking-tight text-neutral-900 outline-none transition-colors duration-200 hover:bg-neutral-200/70 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
      >
        <span ref={ref} className="flex h-full w-max items-center gap-2" style={{ paddingLeft: s.padX - 2, paddingRight: s.padX }}>
          <span className="relative flex shrink-0 items-center justify-center" style={{ width: s.icon, height: s.icon }}>
            <motion.svg
              viewBox="0 0 24 24"
              width={s.icon}
              height={s.icon}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              style={{ rotate }}
              initial={false}
              animate={{ opacity: phase === "done" ? 0 : 1, scale: phase === "done" ? 0.6 : 1 }}
              transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
            >
              <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
              <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
            </motion.svg>
            <svg viewBox="0 0 24 24" width={s.icon} height={s.icon} fill="none" stroke={successColor} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="absolute">
              <motion.path
                d="M5.5 12.5 L10 17 L18.5 7.5"
                initial={false}
                animate={{ pathLength: phase === "done" ? 1 : 0, opacity: phase === "done" ? 1 : 0 }}
                transition={{ pathLength: { duration: reduce ? 0 : 0.3, ease: EASE_OUT, delay: reduce ? 0 : 0.08 }, opacity: { duration: 0.05, delay: reduce ? 0 : 0.08 } }}
              />
            </svg>
          </span>
          <span className="relative overflow-hidden" aria-live="polite">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={text}
                className="block whitespace-nowrap"
                initial={{ y: "100%", opacity: 0, filter: "blur(2px)" }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={{ y: "-100%", opacity: 0, filter: "blur(2px)" }}
                transition={{ duration: reduce ? 0 : 0.28, ease: EASE_OUT }}
              >
                {text}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>
      </motion.button>
    </motion.div>
  );
}
