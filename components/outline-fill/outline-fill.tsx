"use client";

import { cn } from "@/lib/utils";
import { motion } from "motion/react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// 06 — The outline of each letter is traced first, then the ink fills in,
// like lettering sketched before it is painted.
export function OutlineFill({
  play,
  text = "Sketched, then filled",
  traceDuration = 1,
  fillDuration = 0.4,
  fillDelay = 0.8,
  strokeWidth = 0.75,
}: EffectProps & {
  text?: string;
  /** Seconds to trace the outlines. */
  traceDuration?: number;
  /** Seconds for the ink to fill in. */
  fillDuration?: number;
  /** Seconds before the fill starts. */
  fillDelay?: number;
  /** Outline width. */
  strokeWidth?: number;
}) {
  return (
    // 280 × 36 at 20px text; the drawing scales with the type
    <svg
      role="img"
      aria-label={text}
      viewBox="0 0 280 36"
      style={{ width: "14em", height: "1.8em" }}
      className={cn(SIZE, "overflow-visible text-zinc-700 dark:text-zinc-200")}
    >
      <motion.text
        key={play}
        x="50%"
        y="26"
        textAnchor="middle"
        fontSize="24"
        fontWeight="500"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray="120"
        initial={play ? { strokeDashoffset: 120, fillOpacity: 0 } : false}
        animate={{ strokeDashoffset: 0, fillOpacity: 1 }}
        transition={{
          strokeDashoffset: { duration: traceDuration, ease: "easeInOut" },
          fillOpacity: { duration: fillDuration, delay: fillDelay, ease: EASE_OUT },
        }}
        className="fill-current font-sans"
      >
        {text}
      </motion.text>
    </svg>
  );
}
