"use client";

import { animate, motion, useMotionTemplate, useMotionValue } from "motion/react";
import { useEffect } from "react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

const TEXT = `${SIZE} text-zinc-700 font-medium dark:text-zinc-200`;

// 17 — The line is revealed by a soft edge that travels left to right,
// fading the letters in rather than cutting them.
export function FadeLeftToRight({
  play,
  text = "Revealed with a soft edge",
  duration = 0.9,
  softness = 30,
}: EffectProps & {
  text?: string;
  /** Seconds for the edge to cross the line. */
  duration?: number;
  /** Width of the soft edge, % of the line. */
  softness?: number;
}) {
  const edge = useMotionValue(100);
  const mask = useMotionTemplate`linear-gradient(90deg, black ${edge}%, transparent calc(${edge}% + ${softness}%))`;

  useEffect(() => {
    if (!play) return;
    const controls = animate(edge, [-softness, 100], { duration, ease: "easeInOut" });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, edge]);

  return (
    <motion.p className={TEXT} style={{ maskImage: mask, WebkitMaskImage: mask }}>
      {text}
    </motion.p>
  );
}
