"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const SIZES = {
  sm: { height: 32, padX: 10, font: 13, icon: 16 },
  md: { height: 40, padX: 13, font: 14, icon: 18 },
  lg: { height: 48, padX: 16, font: 15, icon: 20 },
} as const;

const VARIANTS = {
  soft: "bg-muted hover:bg-neutral-200/70 dark:hover:bg-neutral-800",
  ghost: "bg-transparent hover:bg-muted",
  solid: "bg-foreground text-background hover:bg-foreground/90",
} as const;

// How long the chain hangs apart before it links back up.
const BREAK_MS = 260;

type Phase = "idle" | "broken" | "linked";

export type ChainCopyProps = {
  /** Text written to the clipboard. Defaults to the current page's URL. */
  text?: string;
  label?: string;
  /** Shown once the link is copied. */
  copiedLabel?: string;
  /** Icon and label, or the icon alone (the label stays as its accessible name). */
  display?: "label" | "icon";
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Colour of the relinked chain and label. Empty keeps them neutral. */
  successColor?: string;
  /** Seconds before the button returns to its resting state. */
  resetAfter?: number;
  /** Corner radius in px. */
  radius?: number;
  /** Called after a successful copy. */
  onCopy?: (text: string) => void;
  className?: string;
};

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

export function ChainCopy({
  text,
  label = "Copy link",
  copiedLabel = "Copied",
  display = "label",
  variant = "soft",
  size = "md",
  successColor = "#16a34a",
  resetAfter = 1.6,
  radius = 12,
  onCopy,
  className,
}: ChainCopyProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [ref, { width }] = useMeasure();
  const reduce = useReducedMotion();

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const copy = async () => {
    const value = text ?? window.location.href;
    if (!(await writeClipboard(value))) return;
    onCopy?.(value);
    clear();
    setRun((n) => n + 1);
    if (reduce) {
      setPhase("linked");
    } else {
      // Snap apart, hang for a beat, then link back up.
      setPhase("broken");
      timers.current.push(setTimeout(() => setPhase("linked"), BREAK_MS));
    }
    timers.current.push(setTimeout(() => setPhase("idle"), BREAK_MS + resetAfter * 1000));
  };

  const done = phase !== "idle";
  const current = done ? copiedLabel : label;
  const s = SIZES[size];
  const iconOnly = display === "icon";
  const tint = phase === "linked" && successColor ? successColor : undefined;

  return (
    <motion.button
      type="button"
      onClick={copy}
      aria-label={iconOnly ? current : undefined}
      whileTap={{ scale: 0.96 }}
      animate={{ width: width || "auto" }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      style={{ height: s.height, fontSize: s.font, borderRadius: radius, color: tint }}
      className={cn(
        "relative cursor-pointer overflow-hidden font-medium tracking-tight text-foreground outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        VARIANTS[variant],
        variant === "solid" && "text-background",
        className,
      )}
    >
      <span
        ref={ref}
        className="flex h-full w-max items-center gap-1.5"
        style={iconOnly ? { width: s.height, justifyContent: "center" } : { paddingLeft: s.padX - 1, paddingRight: s.padX }}
      >
        <ChainIcon phase={phase} run={run} size={s.icon} />
        {!iconOnly && (
          <span className="relative overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={current}
                initial={{ y: "100%", opacity: 0, filter: "blur(2px)" }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={{ y: "-100%", opacity: 0, filter: "blur(2px)" }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="block whitespace-nowrap"
              >
                {current}
              </motion.span>
            </AnimatePresence>
          </span>
        )}
      </span>
      <span aria-live="polite" className="sr-only">
        {done ? copiedLabel : ""}
      </span>
    </motion.button>
  );
}

// Two chain halves and the bar between them. On copy the halves snap apart
// along the diagonal with a twist, the bar breaks and two chips fly off; then
// the halves swing back with a little overshoot and the bar redraws.
function ChainIcon({ phase, run, size }: { phase: Phase; run: number; size: number }) {
  const broken = phase === "broken";
  const snap = { type: "spring", stiffness: 900, damping: 20, mass: 0.4 } as const;
  const relink = { type: "spring", stiffness: 520, damping: 13, mass: 0.5 } as const;
  const t = broken ? snap : relink;
  const origin = { transformBox: "fill-box", transformOrigin: "center" } as const;

  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 overflow-visible"
    >
      <motion.path
        d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"
        initial={false}
        animate={broken ? { x: 3, y: -3, rotate: 14 } : { x: 0, y: 0, rotate: 0 }}
        transition={t}
        style={origin}
      />
      <motion.path
        d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"
        initial={false}
        animate={broken ? { x: -3, y: 3, rotate: 14 } : { x: 0, y: 0, rotate: 0 }}
        transition={t}
        style={origin}
      />
      <motion.path
        d="M9 15l6 -6"
        initial={false}
        animate={broken ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
        transition={broken ? { duration: 0.08 } : { duration: 0.22, ease: EASE_OUT, delay: 0.1 }}
      />
      {/* Chips from the broken bar, flung off either side of the break. */}
      {run > 0 && broken && (
        <g key={run}>
          {[
            [-1, -1],
            [1, 1],
          ].map(([dx, dy]) => (
            <motion.circle
              key={dx}
              cx={12}
              cy={12}
              r={1}
              fill="currentColor"
              stroke="none"
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: dx * 6, y: dy * 6, opacity: 0, scale: 0.4 }}
              transition={{ duration: 0.32, ease: EASE_OUT }}
            />
          ))}
        </g>
      )}
    </svg>
  );
}
