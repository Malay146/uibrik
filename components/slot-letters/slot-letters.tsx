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

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// The entry for the nth press, wrapping around the list.
const pick = <T,>(list: T[], play: number) => list[((play % list.length) + list.length) % list.length];

// 10 — Letters roll on vertical reels like an odometer and stop on the next
// word, each reel a beat after the one before it.
const REEL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ODOMETER_WORDS = ["ROUND", "ABOUT", "TURNS", "AGAIN"];

export function SlotLetters({
  play,
  words = ODOMETER_WORDS,
  duration = 0.5,
  stagger = 0.05,
}: EffectProps & {
  /** Uppercase A–Z words; each letter rolls on its own reel. */
  words?: string[];
  /** Seconds for a reel to stop. */
  duration?: number;
  /** Seconds between reels. */
  stagger?: number;
}) {
  const word = pick(words, play);

  return (
    <p aria-label={word} className={cn(TEXT, "flex leading-none")}>
      {Array.from(word).map((ch, i) => (
        <span key={i} aria-hidden className="relative h-[1.2em] overflow-hidden">
          <motion.span
            className="flex flex-col"
            initial={false}
            animate={{ y: `${-REEL.indexOf(ch) * 1.2}em` }}
            transition={{ duration, delay: i * stagger, ease: EASE_OUT }}
          >
            {Array.from(REEL).map((r) => (
              <span key={r} className="flex h-[1.2em] items-center justify-center">
                {r}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </p>
  );
}
