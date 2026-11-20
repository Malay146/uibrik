"use client";

import { cn } from "@/lib/utils";
import { animate, motion } from "motion/react";
import { useEffect, useId, useRef } from "react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

/** 0.9 × the effect size (text-lg at the default). */
const SIZE_SM = "text-[length:calc(var(--text-effect-size,1.25rem)*0.9)] leading-[1.556]";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// The entry for the nth press, wrapping around the list.
const pick = <T,>(list: T[], play: number) => list[((play % list.length) + list.length) % list.length];

// 25 — A rubber stamp comes down from above, lands with a small shake, and
// its ink soaks in: a noise mask starts patchy and fills to solid. Each stamp
// carries its status colour, so the outcome reads before the word does.
const STAMPS = [
  { word: "APPROVED", tone: "text-emerald-600 bg-emerald-500/5 dark:text-emerald-400", tilt: "-rotate-3" },
  { word: "IN REVIEW", tone: "text-amber-600 bg-amber-500/5 dark:text-amber-400", tilt: "rotate-2" },
  { word: "REJECTED", tone: "text-rose-600 bg-rose-500/5 dark:text-rose-400", tilt: "-rotate-2" },
];

const inkMatrix = (bias: number) => `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3 0 0 0 ${bias}`;

export function StatusStamp({
  play,
  slamDuration = 0.2,
  inkDuration = 0.6,
}: EffectProps & {
  /** Seconds for the stamp to come down. */
  slamDuration?: number;
  /** Seconds for the ink to soak in. */
  inkDuration?: number;
}) {
  const id = `stamp-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const matrixRef = useRef<SVGFEColorMatrixElement>(null);
  const stamp = pick(STAMPS, play);

  useEffect(() => {
    if (!play) return;
    matrixRef.current?.setAttribute("values", inkMatrix(-1.2));
    const controls = animate(-1.2, 1.2, {
      duration: inkDuration,
      delay: slamDuration,
      ease: EASE_OUT,
      onUpdate: (b) => matrixRef.current?.setAttribute("values", inkMatrix(b)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  return (
    <>
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <filter id={id}>
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix ref={matrixRef} in="noise" type="matrix" values={inkMatrix(1.2)} result="ink" />
          <feComposite in="SourceGraphic" in2="ink" operator="in" />
        </filter>
      </svg>
      <motion.div
        key={play}
        initial={false}
        animate={play ? { x: [0, -3, 3, -2, 0] } : undefined}
        transition={{ duration: 0.25, delay: slamDuration }}
      >
        <motion.p
          className={cn(
            SIZE_SM,
            "inline-block rounded-md border-2 border-current px-[0.667em] py-[0.222em] font-semibold tracking-widest",
            stamp.tone,
            stamp.tilt,
          )}
          style={{ filter: `url(#${id})` }}
          initial={play ? { scale: 1.6, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: slamDuration, ease: "easeIn" }}
        >
          {stamp.word}
        </motion.p>
      </motion.div>
    </>
  );
}
