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

// 18 — A thinking indicator: a soft highlight passes across muted text, the
// familiar signal that work is happening. Pressing Change runs two passes.
export function LoadingShimmer({
  play,
  text = "Thinking…",
  duration = 1.2,
  passes = 2,
}: EffectProps & {
  text?: string;
  /** Seconds for one pass of the highlight. */
  duration?: number;
  /** Passes per play. */
  passes?: number;
}) {
  return (
    <motion.p
      key={play}
      className={cn(
        TEXT,
        "font-mono bg-clip-text text-transparent dark:text-transparent",
        "bg-[linear-gradient(90deg,#a1a1aa_40%,#18181b_50%,#a1a1aa_60%)] bg-[length:300%_100%]",
        "dark:bg-[linear-gradient(90deg,#52525b_40%,#fafafa_50%,#52525b_60%)]",
      )}
      initial={{ backgroundPositionX: "100%" }}
      animate={play ? { backgroundPositionX: "0%" } : undefined}
      transition={{ duration, ease: "linear", repeat: Math.max(0, passes - 1) }}
    >
      {text}
    </motion.p>
  );
}
