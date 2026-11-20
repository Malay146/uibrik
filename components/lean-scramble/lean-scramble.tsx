"use client";

import { cn } from "@/lib/utils";
import { motion, stagger, useAnimate } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

const TEXT = `${SIZE} text-zinc-700 font-medium dark:text-zinc-200`;

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// 02 — A word leans forward and scrambles as it goes: its letters cycle
// through random characters and lock back in from left to right, finishing
// as the word straightens. Pressing Change runs it word by word; hovering
// runs it on one word. Every letter keeps its own width while scrambling,
// so the line never jumps.
const LEAN_LEAD = 2; // ticks of pure noise before the first letter locks
const LEAN_STEP = 2; // ticks between one letter locking and the next
const LEAN_POOL = "abcdefghijklmnopqrstuvwxyz";

export function LeanScramble({
  play,
  text = "Lean into every word",
  lean = 10,
  duration = 0.45,
  wordStagger = 0.08,
  tick = 40,
}: EffectProps & {
  text?: string;
  /** Degrees a word leans forward. */
  lean?: number;
  /** Seconds for a word to lean and straighten. */
  duration?: number;
  /** Seconds between words. */
  wordStagger?: number;
  /** Milliseconds between scramble frames. */
  tick?: number;
}) {
  const [scope, run] = useAnimate();

  useEffect(() => {
    if (!play) return;
    const controls = run(
      "[data-word]",
      { skewX: [0, -lean, 0] },
      { duration, delay: stagger(wordStagger), ease: "easeInOut" },
    );
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, run]);

  return (
    <p ref={scope} aria-label={text} className={cn(TEXT, "flex gap-[0.3em]")}>
      {text.split(" ").map((word, i) => (
        <LeanWord key={i} word={word} play={play} delay={i * wordStagger * 1000} lean={lean} tick={tick} />
      ))}
    </p>
  );
}

function LeanWord({
  word,
  play,
  delay,
  lean,
  tick: LEAN_TICK,
}: {
  word: string;
  play: number;
  delay: number;
  lean: number;
  tick: number;
}) {
  const letters = Array.from(word);
  const [shown, setShown] = useState(letters);
  const [locked, setLocked] = useState(letters.length);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const scramble = useCallback(() => {
    clearInterval(timerRef.current);
    const chars = Array.from(word);
    let tick = 0;
    timerRef.current = setInterval(() => {
      const settled = Math.max(0, Math.floor((tick - LEAN_LEAD) / LEAN_STEP) + 1);
      setLocked(settled);
      setShown(chars.map((ch, i) => (i < settled ? ch : LEAN_POOL[Math.floor(Math.random() * LEAN_POOL.length)])));
      if (settled >= chars.length) clearInterval(timerRef.current);
      tick++;
    }, LEAN_TICK);
  }, [word, LEAN_TICK]);

  useEffect(() => {
    if (!play) return;
    const start = setTimeout(scramble, delay);
    return () => clearTimeout(start);
  }, [play, delay, scramble]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  return (
    <motion.span
      data-word
      aria-hidden
      className="inline-block cursor-default"
      whileHover={{ skewX: -lean }}
      onHoverStart={scramble}
      transition={{ duration: 0.3, ease: EASE_OUT }}
    >
      {letters.map((ch, i) => (
        <span key={i} className="relative inline-block">
          <span className="invisible">{ch}</span>
          <span
            className={cn(
              "absolute inset-0 text-center transition-colors duration-100",
              i >= locked && "text-zinc-400 dark:text-zinc-500",
            )}
          >
            {shown[i] ?? ch}
          </span>
        </span>
      ))}
    </motion.span>
  );
}
