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

const TEXT = `${SIZE} text-zinc-700 font-medium dark:text-zinc-200`;

// 16 — A marker sweeps behind the phrase that matters, left to right, with a
// slightly uneven edge so it reads as a hand, not a text selection.
export function Highlighter({
  play,
  text = "Read the",
  highlight = "part that matters",
  duration = 0.5,
  color = "",
}: EffectProps & {
  /** Text before the highlighted phrase. */
  text?: string;
  /** The phrase the marker sweeps behind. */
  highlight?: string;
  /** Seconds for the marker to sweep across. */
  duration?: number;
  /** Marker colour. Empty follows the theme. */
  color?: string;
}) {
  return (
    <p className={TEXT}>
      {text}{" "}
      <span className="relative inline-block">
        <motion.span
          key={play}
          aria-hidden
          className={cn(
            "absolute inset-x-[-0.15em] bottom-[0.08em] top-[0.4em] origin-left -rotate-1",
            !color && "bg-zinc-200 dark:bg-zinc-700",
          )}
          style={{ borderRadius: "0.3em 0.15em 0.35em 0.1em", backgroundColor: color || undefined }}
          initial={play ? { scaleX: 0 } : false}
          animate={{ scaleX: 1 }}
          transition={{ duration, ease: [0.65, 0, 0.35, 1] }}
        />
        <span className="relative">{highlight}</span>
      </span>
      .
    </p>
  );
}
