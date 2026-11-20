"use client";

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

const glyph = (ch: string) => (ch === " " ? " " : ch);

// 03 — A blur travels left to right across the line: each character
// fades in from soft to sharp a beat after the one before it.
export function BlurReveal({
  play,
  text = "Coming into focus",
  duration = 0.4,
  stagger = 0.03,
  blur = 8,
}: EffectProps & {
  text?: string;
  /** Seconds each character takes to sharpen. */
  duration?: number;
  /** Seconds between characters. */
  stagger?: number;
  /** Starting blur in px. */
  blur?: number;
}) {
  return (
    <p className={TEXT} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <motion.span
          key={`${play}-${i}`}
          aria-hidden
          className="inline-block"
          initial={play ? { opacity: 0, filter: `blur(${blur}px)` } : false}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration, delay: i * stagger, ease: EASE_OUT }}
        >
          {glyph(ch)}
        </motion.span>
      ))}
    </p>
  );
}
