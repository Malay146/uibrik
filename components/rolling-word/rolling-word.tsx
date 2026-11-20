"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import useMeasure from "react-use-measure";

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

// 07 — Each press rolls in the next word on a drum. Letters sit on a
// cylinder (their transform origin is pushed back behind the glyph), so the
// old word turns up and away while the new one turns in from below, letter by
// letter. A vertical mask softens both edges instead of blurring, and the box
// resizes to the incoming word so the words before it never jump.
const ROTATOR_WORDS = ["calm", "honest", "lasting", "yours"];
const DRUM_EASE = [0.65, 0, 0.35, 1] as const;

const drumWordFor = (stagger: number) => ({
  enter: {},
  center: { transition: { staggerChildren: stagger } },
  exit: { transition: { staggerChildren: stagger } },
});

const drumLetterFor = (duration: number, exitDuration: number) => ({
  enter: { rotateX: -90, opacity: 0 },
  center: { rotateX: 0, opacity: 1, transition: { duration, ease: DRUM_EASE } },
  exit: { rotateX: 90, opacity: 0, transition: { duration: exitDuration, ease: DRUM_EASE } },
});

export function RollingWord({
  play,
  words = ROTATOR_WORDS,
  prefix = "Build something",
  duration = 0.45,
  exitDuration = 0.35,
  stagger = 0.03,
  className,
  wordClassName,
}: EffectProps & {
  className?: string;
  /** Classes for the rolling word, e.g. a colour. Defaults to a muted zinc. */
  wordClassName?: string;
  words?: string[];
  /** Fixed text before the rolling word. */
  prefix?: string;
  /** Seconds for a letter to roll in. */
  duration?: number;
  /** Seconds for a letter to roll out. */
  exitDuration?: number;
  /** Seconds between letters. */
  stagger?: number;
}) {
  const word = pick(words, play);
  const drumWord = useMemo(() => drumWordFor(stagger), [stagger]);
  const drumLetter = useMemo(() => drumLetterFor(duration, exitDuration), [duration, exitDuration]);
  const [ref, { width }] = useMeasure();
  const boxRef = useRef<HTMLSpanElement>(null);
  // Space between the word and the right edge of the screen.
  const [room, setRoom] = useState<number | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setRoom(Math.max(0, Math.round(document.documentElement.clientWidth - el.getBoundingClientRect().right)));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <p className={cn(TEXT, "flex items-baseline", className)} aria-label={`${prefix} ${word}`}>
      <span aria-hidden>{prefix}&nbsp;</span>
      <motion.span
        ref={boxRef}
        aria-hidden
        className="relative inline-flex"
        animate={{ width: width || "auto" }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      >
        <span ref={ref} className="invisible whitespace-nowrap">
          {word}
        </span>
        {/* A mask clips everything outside its own box, so it lives on a layer
            that reaches past the right edge: an outgoing word wider than the
            shrinking box keeps its last letters until it has rolled away. It
            reaches no further than the screen edge, so it never widens the page. */}
        <span
          className="pointer-events-none absolute -inset-y-[0.6em] left-0 perspective-[400px] [mask-image:linear-gradient(transparent,black_30%,black_70%,transparent)]"
          style={{ right: room === null ? "-3.2em" : `calc(-1 * min(3.2em, ${room}px))` }}
        >
          <AnimatePresence initial={false}>
            <motion.span
              key={play}
              className={cn(
                "absolute left-0 top-[0.6em] flex whitespace-nowrap text-zinc-400 transform-3d dark:text-zinc-500",
                wordClassName,
              )}
              variants={drumWord}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {Array.from(word).map((ch, i) => (
                <motion.span
                  key={i}
                  className="inline-block backface-hidden"
                  style={{ transformOrigin: "50% 50% -0.6em" }}
                  variants={drumLetter}
                >
                  {ch}
                </motion.span>
              ))}
            </motion.span>
          </AnimatePresence>
        </span>
      </motion.span>
    </p>
  );
}
