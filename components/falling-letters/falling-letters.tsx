"use client";

import { cn } from "@/lib/utils";
import { motion, type Easing } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

const TEXT = `${SIZE} text-zinc-700 font-medium dark:text-zinc-200`;

const glyph = (ch: string) => (ch === " " ? " " : ch);

// 15 — Letters fall and land with weight. Each one accelerates down while
// stretched and slightly tilted, squashes against the baseline on impact
// (scaled from its foot), gives a small rebound and straightens. Start times
// follow each letter's position on the line, so wide glyphs hold the wave
// back, plus a small fixed jitter so the wave never feels mechanical.
const FALL_TIMES = [0, 0.55, 0.75, 1];
const FALL_EASE: Easing[] = ["easeIn", "easeOut", "easeInOut"];

// Deterministic per-letter variation in [0, 1): the same letter always
// falls the same way, and rendering stays pure.
const jitter = (i: number) => ((i * 37 + 11) % 17) / 17;

export function FallingLetters({
  play,
  text = "Falling into place",
  duration = 0.6,
  spread = 0.35,
  drop = 36,
}: EffectProps & {
  text?: string;
  /** Seconds for one letter to fall, land and settle. */
  duration?: number;
  /** Seconds the wave takes to cross the line. */
  spread?: number;
  /** Px each letter falls from. */
  drop?: number;
}) {
  const lettersRef = useRef<(HTMLSpanElement | null)[]>([]);
  const [delays, setDelays] = useState<number[]>([]);

  useLayoutEffect(() => {
    const letters = lettersRef.current;
    const last = letters[letters.length - 1];
    const total = last ? last.offsetLeft + last.offsetWidth : 1;
    setDelays(letters.map((el, i) => ((el?.offsetLeft ?? 0) / total) * spread + jitter(i) * 0.08));
  }, [text, spread]);

  return (
    <p aria-label={text} className={cn(TEXT, "flex")}>
      {Array.from(text).map((ch, i) => {
        const tilt = (jitter(i + 5) - 0.5) * 16;
        return (
          <motion.span
            key={`${play}-${i}`}
            aria-hidden
            ref={(el) => {
              lettersRef.current[i] = el;
            }}
            className="inline-block origin-bottom"
            initial={play ? { y: -drop, opacity: 0, rotate: tilt, scaleX: 0.92, scaleY: 1.12 } : false}
            animate={
              play
                ? {
                    y: [-drop, 0, -3, 0],
                    opacity: [0, 1, 1, 1],
                    rotate: [tilt, 0, 0, 0],
                    scaleX: [0.92, 1.14, 0.98, 1],
                    scaleY: [1.12, 0.82, 1.03, 1],
                  }
                : undefined
            }
            transition={{ duration, delay: delays[i] ?? 0, times: FALL_TIMES, ease: FALL_EASE }}
          >
            {glyph(ch)}
          </motion.span>
        );
      })}
    </p>
  );
}
