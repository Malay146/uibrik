"use client";

import { IconCheck, IconTrash } from "@tabler/icons-react";
import { animate, motion, useTransform, useMotionValue, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

// Letting go early drains the fill quickly, so an aborted hold reads as
// "nothing happened" rather than a second animation to watch.
const RELEASE_DURATION = 0.35;

const SIZES = {
  sm: { height: 32, padX: 12, font: 13, icon: 15 },
  md: { height: 40, padX: 16, font: 14, icon: 17 },
  lg: { height: 48, padX: 20, font: 15, icon: 19 },
} as const;

/**
 * How the fill grows while held.
 * - sweep: left to right, like a progress bar
 * - rise: bottom to top, like filling a glass
 * - center: out from the middle to both edges
 */
export type HoldFill = "sweep" | "rise" | "center";

// The filled copy of the content is clipped to the fill's shape, so the label
// changes colour exactly where the fill's edge passes over it.
const CLIPS: Record<HoldFill, (p: number) => string> = {
  sweep: (p) => `inset(0 ${(1 - p) * 100}% 0 0)`,
  rise: (p) => `inset(${(1 - p) * 100}% 0 0 0)`,
  center: (p) => `inset(0 ${(1 - p) * 50}% 0 ${(1 - p) * 50}%)`,
};

type State = "idle" | "holding" | "done";

export type HoldToConfirmProps = {
  /** Shown while waiting for a hold. */
  label?: string;
  /** Shown once the hold completes. */
  doneLabel?: string;
  /** How the fill grows while held. */
  fill?: HoldFill;
  /** Seconds the button must be held. */
  duration?: number;
  /** Colour of the fill. */
  color?: string;
  size?: keyof typeof SIZES;
  /** Show the trash and check icons beside the labels. */
  icon?: boolean;
  /** Corner radius in px. */
  radius?: number;
  /** Seconds the done state shows before the button re-arms. */
  resetAfter?: number;
  /** Called once the hold completes. */
  onConfirm?: () => void;
  className?: string;
};

export function HoldToConfirm({
  label = "Hold to delete",
  doneLabel = "Deleted",
  fill = "sweep",
  duration = 1.2,
  color = "#dc2626",
  size = "md",
  icon = true,
  radius = 14,
  resetAfter = 1.6,
  onConfirm,
  className,
}: HoldToConfirmProps) {
  const [state, setState] = useState<State>("idle");
  const progress = useMotionValue(0);
  const run = useRef<AnimationPlaybackControls | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clipPath = useTransform(progress, (p) => CLIPS[fill](p));
  const s = SIZES[size];

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const start = () => {
    if (state === "done") return;
    setState("holding");
    run.current?.stop();
    // Linear, and only for what's left, so a second press after a partial
    // release picks up where the fill is instead of starting over.
    run.current = animate(progress, 1, {
      duration: duration * (1 - progress.get()),
      ease: "linear",
      onComplete: () => {
        if (progress.get() < 1) return;
        setState("done");
        onConfirm?.();
        resetTimer.current = setTimeout(() => {
          setState("idle");
          run.current = animate(progress, 0, { duration: 0.4, ease: EASE_OUT });
        }, resetAfter * 1000);
      },
    });
  };

  const cancel = () => {
    if (state !== "holding") return;
    setState("idle");
    run.current?.stop();
    run.current = animate(progress, 0, { duration: RELEASE_DURATION, ease: EASE_OUT });
  };

  const done = state === "done";
  const content = <Content label={label} doneLabel={doneLabel} done={done} icon={icon ? s.icon : 0} />;

  return (
    <motion.button
      type="button"
      aria-label={done ? doneLabel : `${label}. Press and hold to confirm.`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        start();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") cancel();
      }}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
      animate={{ scale: state === "holding" ? 0.97 : 1 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
      style={{ height: s.height, paddingInline: s.padX, fontSize: s.font, borderRadius: radius }}
      className={cn(
        "relative cursor-pointer touch-none select-none overflow-hidden bg-muted font-medium tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      {content}
      <motion.span
        aria-hidden
        style={{ clipPath, backgroundColor: color, paddingInline: s.padX }}
        className="absolute inset-0 flex items-center justify-center text-white"
      >
        {content}
      </motion.span>
      <span aria-live="polite" className="sr-only">
        {done ? doneLabel : ""}
      </span>
    </motion.button>
  );
}

// Both labels share one grid cell, so the button is always as wide as the
// longer one and never resizes when they swap.
function Content({ label, doneLabel, done, icon }: { label: string; doneLabel: string; done: boolean; icon: number }) {
  return (
    <span aria-hidden className="grid place-items-center">
      <Swap shown={!done} exitY={-6}>
        {icon > 0 && <IconTrash size={icon} stroke={2} />}
        {label}
      </Swap>
      <Swap shown={done} exitY={6}>
        {icon > 0 && <IconCheck size={icon} stroke={2.25} />}
        {doneLabel}
      </Swap>
    </span>
  );
}

function Swap({ shown, exitY, children }: { shown: boolean; exitY: number; children: ReactNode }) {
  return (
    <motion.span
      initial={false}
      animate={shown ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: exitY, filter: "blur(2px)" }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      className="col-start-1 row-start-1 flex items-center gap-1.5 whitespace-nowrap"
    >
      {children}
    </motion.span>
  );
}
