"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

const TEXT = `${SIZE} text-zinc-700 font-medium dark:text-zinc-200`;

// The entry for the nth press, wrapping around the list.
const pick = <T,>(list: T[], play: number) => list[((play % list.length) + list.length) % list.length];

// 24 — Bars sweep across each word like a classified file. Once every word
// is fully covered the text is hidden, and only then do the bars move onto
// the next sentence with layout animations: bars that stay resize to their
// new word, bars no longer needed shrink to zero width, and bars for new
// words grow from zero width. The new text appears beneath full cover, then
// the bars peel away. Hiding the text before the swap matters because an
// exiting word is kept as a snapshot of its last render, so that snapshot
// must already be blank.
const REDACTED = ["The plan is still on", "Meet me after the rain tonight", "Burn this note"];
const REDACT_EASE = [0.65, 0, 0.35, 1] as const;

type Phase = "idle" | "cover" | "hidden" | "swap" | "hold";

export function RedactReveal({
  play,
  lines = REDACTED,
  sweep: REDACT_SWEEP = 300,
  stagger: REDACT_STAGGER = 40,
  move: REDACT_MOVE = 420,
}: EffectProps & {
  lines?: string[];
  /** Ms for one bar to cover or peel. */
  sweep?: number;
  /** Ms between neighbouring bars. */
  stagger?: number;
  /** Ms for bars to travel onto the next sentence. */
  move?: number;
}) {
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (!play) return;
    const outgoing = pick(lines, play - 1).split(" ").length;
    const covered = (outgoing - 1) * REDACT_STAGGER + REDACT_SWEEP;
    const swap = covered + 40;
    const hold = swap + REDACT_MOVE;
    const timers = [
      setTimeout(() => setPhase("cover"), 0),
      setTimeout(() => setPhase("hidden"), covered),
      setTimeout(() => {
        setPhase("swap");
        setShown(play);
      }, swap),
      setTimeout(() => setPhase("hold"), hold),
      setTimeout(() => setPhase("idle"), hold + 80),
    ];
    return () => timers.forEach(clearTimeout);
    // copy changes remount the effect (TextEffect keys on it), so only `play` drives this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  const words = pick(lines, shown).split(" ");
  const covered = phase !== "idle";
  const textHidden = phase === "hidden" || phase === "swap";
  const moving = phase === "swap";
  const move = { duration: REDACT_MOVE / 1000, ease: REDACT_EASE };

  return (
    <p
      aria-label={words.join(" ")}
      className={cn(TEXT, "relative flex min-h-[2.8em] max-w-[14.4em] flex-wrap content-center justify-center gap-x-[0.3em] gap-y-1")}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {words.map((word, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="relative inline-block origin-left"
            // A bar that is no longer needed collapses to zero width; its
            // snapshot is already blank, so only the bar is seen shrinking.
            exit={{ scaleX: 0 }}
            transition={move}
          >
            <span className={cn(textHidden && "opacity-0")}>{word}</span>
            {/* Geometry and cover are split across two elements: the outer bar
                owns the layout animation, the inner one the scaleX sweep. */}
            <motion.span layout className="absolute -inset-x-0.5 inset-y-0.75" transition={{ layout: move }}>
              <motion.span
                className="absolute inset-0 rounded-sm bg-zinc-700 dark:bg-zinc-300"
                style={{ originX: covered ? 0 : 1 }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: covered ? 1 : 0 }}
                transition={
                  moving
                    ? move
                    : { duration: REDACT_SWEEP / 1000, delay: (i * REDACT_STAGGER) / 1000, ease: REDACT_EASE }
                }
              />
            </motion.span>
          </motion.span>
        ))}
      </AnimatePresence>
    </p>
  );
}
