"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const SIZES = {
  sm: { height: 32, icon: 18, font: 13 },
  md: { height: 40, icon: 20, font: 14 },
  lg: { height: 48, icon: 22, font: 15 },
} as const;

const VARIANTS = {
  soft: "bg-neutral-100 hover:bg-neutral-200/70 dark:bg-neutral-900 dark:hover:bg-neutral-800",
  ghost: "bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-900",
} as const;

export type MuteToggleProps = {
  /** Controlled state. */
  muted?: boolean;
  /** State on mount when uncontrolled. */
  defaultMuted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  /** Icon alone, or icon and a label that rolls between the two states. */
  display?: "icon" | "label";
  label?: string;
  mutedLabel?: string;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Tint the icon while muted. */
  mutedColor?: string;
  className?: string;
};

export function MuteToggle({
  muted: mutedProp,
  defaultMuted = false,
  onMutedChange,
  display = "icon",
  label = "Sound on",
  mutedLabel = "Muted",
  variant = "soft",
  size = "md",
  mutedColor,
  className,
}: MuteToggleProps) {
  const reduce = useReducedMotion();
  const [inner, setInner] = useState(defaultMuted);
  const muted = mutedProp ?? inner;
  const [ref, { width }] = useMeasure();
  const s = SIZES[size];
  const withLabel = display === "label";
  const text = muted ? mutedLabel : label;

  const toggle = () => {
    if (mutedProp === undefined) setInner(!muted);
    onMutedChange?.(!muted);
  };

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={!muted}
      aria-label={withLabel ? undefined : muted ? "Unmute" : "Mute"}
      onClick={toggle}
      whileTap={{ scale: 0.94 }}
      initial={false}
      animate={{ width: withLabel ? width || "auto" : s.height }}
      transition={{ duration: reduce ? 0 : 0.3, ease: EASE_OUT }}
      style={{ height: s.height, fontSize: s.font }}
      className={cn(
        "relative cursor-pointer overflow-hidden rounded-full font-medium tracking-tight text-neutral-900 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:text-neutral-100",
        VARIANTS[variant],
        className,
      )}
    >
      <span
        ref={ref}
        className="flex h-full w-max items-center gap-1.5"
        style={withLabel ? { paddingLeft: (s.height - s.icon) / 2 - 1, paddingRight: s.height / 2.6 } : { width: s.height, justifyContent: "center" }}
      >
        <span className="flex transition-colors duration-200" style={{ color: muted && mutedColor ? mutedColor : undefined }}>
          <Speaker muted={muted} size={s.icon} />
        </span>
        {withLabel && (
          <span className="relative overflow-hidden">
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
        )}
      </span>
    </motion.button>
  );
}

function Speaker({ muted, size }: { muted: boolean; size: number }) {
  const reduce = useReducedMotion();
  const d = (n: number) => (reduce ? 0 : n);
  // Muting pulls the waves back into the cone, outer first, and a cross draws
  // in where they were; unmuting lets the waves back out from the cone.
  const wave = (i: number) => ({
    style: { originX: "13px", originY: "12px", transformBox: "view-box" as const },
    initial: false as const,
    animate: muted ? { opacity: 0, scale: 0.4, x: -3 } : { opacity: 1, scale: 1, x: 0 },
    transition: { duration: d(0.22), ease: EASE_OUT, delay: d(muted ? i * 0.05 : 0.08 + (1 - i) * 0.07) },
  });
  const cross = (i: number) => ({
    initial: false as const,
    animate: { pathLength: muted ? 1 : 0, opacity: muted ? 1 : 0 },
    transition: {
      pathLength: { duration: d(0.18), ease: EASE_OUT, delay: d(muted ? 0.12 + i * 0.08 : 0) },
      opacity: { duration: d(0.05), delay: d(muted ? 0.12 + i * 0.08 : 0.15) },
    },
  });

  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="overflow-visible">
      {/* The cone gives a small kick on every toggle. */}
      <motion.path
        key={String(muted)}
        d="M11.5 5.2 L7 8.8 H4.6 a1.1 1.1 0 0 0 -1.1 1.1 v4.2 a1.1 1.1 0 0 0 1.1 1.1 H7 L11.5 18.8 Z"
        style={{ originX: "7px", originY: "12px", transformBox: "view-box" }}
        initial={reduce ? false : { scale: 0.9 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", duration: 0.35, bounce: 0.3 }}
      />
      <motion.path d="M18.2 6.6 a7.6 7.6 0 0 1 0 10.8" {...wave(0)} />
      <motion.path d="M15.2 9.4 a3.7 3.7 0 0 1 0 5.2" {...wave(1)} />
      <motion.path d="M16 9.5 L21 14.5" {...cross(0)} />
      <motion.path d="M21 9.5 L16 14.5" {...cross(1)} />
    </svg>
  );
}
