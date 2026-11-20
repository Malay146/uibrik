"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

// The entry for the nth press, wrapping around the list.
const pick = <T,>(list: T[], play: number) => list[((play % list.length) + list.length) % list.length];

// 09 — A departures board without the flip: every cell scrambles through
// random characters, then the cells lock in order, left to right, so the
// new word sorts itself out of the noise.
const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const FLAP_WORDS = ["BOARDING", "GATE 21", "ON TIME", "DEPARTED"];

const randomChar = () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];

export function ScrambleToWord({
  play,
  words = FLAP_WORDS,
  cells: FLAP_LENGTH = 8,
  tick: SCRAMBLE_TICK = 40,
  lead: SCRAMBLE_LEAD = 6,
  step: SCRAMBLE_STEP = 2,
}: EffectProps & {
  words?: string[];
  /** Number of cells on the board. */
  cells?: number;
  /** Milliseconds between scramble frames. */
  tick?: number;
  /** Frames of pure noise before the first cell locks. */
  lead?: number;
  /** Frames between one cell locking and the next. */
  step?: number;
}) {
  const target = pick(words, play).padEnd(FLAP_LENGTH, " ");
  const [shown, setShown] = useState(target);
  const [locked, setLocked] = useState(FLAP_LENGTH);

  useEffect(() => {
    if (!play) return;
    let tick = 0;
    const id = setInterval(() => {
      const settled = Math.max(0, Math.floor((tick - SCRAMBLE_LEAD) / SCRAMBLE_STEP) + 1);
      setLocked(settled);
      setShown(
        Array.from(target, (ch, i) => (i < settled || ch === " " ? ch : randomChar())).join(""),
      );
      if (settled >= FLAP_LENGTH) clearInterval(id);
      tick++;
    }, SCRAMBLE_TICK);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, target]);

  return (
    // cells are 28 × 36 at 20px type (16px glyphs) and scale with it
    <div className={cn(SIZE, "flex gap-[0.2em] font-mono")} aria-label={target.trim()}>
      {Array.from(shown).map((ch, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "flex h-[2.25em] w-[1.75em] items-center justify-center rounded-md bg-neutral-100 text-[0.8em] font-medium transition-colors duration-150 dark:bg-neutral-800",
            i < locked ? "text-zinc-700 dark:text-zinc-200" : "text-zinc-400 dark:text-zinc-500",
          )}
        >
          {ch}
        </span>
      ))}
    </div>
  );
}
