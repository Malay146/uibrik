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

// 08 — The same six letters rearrange into a new word. Each letter keeps its
// identity and glides to its new slot.
const ANAGRAMS = ["LISTEN", "SILENT", "ENLIST", "TINSEL"];

export function AnagramShuffle({
  play,
  words = ANAGRAMS,
  duration = 0.45,
}: EffectProps & {
  /** Anagrams of each other, so every letter has a place to go. */
  words?: string[];
  /** Seconds for letters to glide to their new slots. */
  duration?: number;
}) {
  return (
    <p className={cn(TEXT, "flex tracking-wide")}>
      {Array.from(pick(words, play)).map((ch) => (
        <motion.span key={ch} layout transition={{ duration, ease: EASE_OUT }} className="inline-block">
          {ch}
        </motion.span>
      ))}
    </p>
  );
}
