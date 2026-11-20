"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

const TEXT = `${SIZE} text-zinc-700 font-medium dark:text-zinc-200`;

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// The entry for the nth press, wrapping around the list.
const pick = <T,>(list: T[], play: number) => list[((play % list.length) + list.length) % list.length];

// 23 — The current word rushes past the viewer and fades, while the next one
// travels forward from far behind. Both share one grid cell, so they overlap
// without absolute positioning.
const ZOOM_WORDS = ["Come closer", "Even closer", "Right here"];

export function ZoomPast({
  play,
  words = ZOOM_WORDS,
  duration = 0.5,
  exitScale = 2.6,
}: EffectProps & {
  words?: string[];
  /** Seconds for one word to pass and the next to arrive. */
  duration?: number;
  /** How large the old word grows as it rushes past. */
  exitScale?: number;
}) {
  return (
    <div className="grid place-items-center">
      <AnimatePresence initial={false}>
        <motion.p
          key={play}
          className={cn(TEXT, "col-start-1 row-start-1 whitespace-nowrap")}
          initial={{ scale: 0.4, opacity: 0, filter: "blur(2px)" }}
          animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
          exit={{ scale: exitScale, opacity: 0, filter: "blur(4px)" }}
          transition={{ duration, ease: EASE_OUT }}
        >
          {pick(words, play)}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
