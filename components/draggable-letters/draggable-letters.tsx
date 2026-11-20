"use client";

import { cn } from "@/lib/utils";
import { animate, motion, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { useEffect } from "react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

const TEXT = `${SIZE} text-zinc-700 font-medium dark:text-zinc-200`;

const glyph = (ch: string) => (ch === " " ? " " : ch);

// 11 — Any letter can be pulled. Its neighbours follow at half the distance
// per step away, and everything settles home on release. Pressing Change
// gives the middle letter a small tug.
export function DraggableLetters({
  play,
  text = "Pull me apart",
  falloff = 0.5,
  settleDuration = 0.45,
  bounce = 0.15,
}: EffectProps & {
  text?: string;
  /** Share of the pull each neighbour follows, per step away. */
  falloff?: number;
  /** Seconds for letters to spring home. */
  settleDuration?: number;
  /** Spring bounce on release. */
  bounce?: number;
}) {
  const SETTLE = { type: "spring", duration: settleDuration, bounce } as const;
  const dx = useMotionValue(0);
  const dy = useMotionValue(0);
  const active = useMotionValue(0);
  const letters = Array.from(text);

  const release = () => {
    animate(dx, 0, SETTLE);
    animate(dy, 0, SETTLE);
  };

  useEffect(() => {
    if (!play) return;
    active.set(Math.floor(letters.length / 2));
    const x = animate(dx, [0, 18, 0], { duration: 0.5, ease: "easeInOut" });
    const y = animate(dy, [0, -14, 0], { duration: 0.5, ease: "easeInOut" });
    return () => {
      x.stop();
      y.stop();
    };
  }, [play, active, dx, dy, letters.length]);

  return (
    <p aria-label={text} className={cn(TEXT, "flex touch-none select-none")}>
      {letters.map((ch, i) => (
        <DragLetter
          key={i}
          ch={ch}
          index={i}
          dx={dx}
          dy={dy}
          active={active}
          falloff={falloff}
          onGrab={() => {
            dx.stop();
            dy.stop();
            active.set(i);
          }}
          onRelease={release}
        />
      ))}
    </p>
  );
}

function DragLetter({
  ch,
  index,
  dx,
  dy,
  active,
  falloff,
  onGrab,
  onRelease,
}: {
  ch: string;
  index: number;
  dx: MotionValue<number>;
  dy: MotionValue<number>;
  active: MotionValue<number>;
  falloff: number;
  onGrab: () => void;
  onRelease: () => void;
}) {
  const pull = (d: number, a: number) => d * falloff ** Math.abs(index - a);
  const x = useTransform([dx, active], ([d, a]: number[]) => pull(d, a));
  const y = useTransform([dy, active], ([d, a]: number[]) => pull(d, a));

  return (
    <motion.span
      aria-hidden
      className="inline-block cursor-grab active:cursor-grabbing"
      style={{ x, y }}
      onPanStart={onGrab}
      onPan={(_, info) => {
        dx.set(info.offset.x);
        dy.set(info.offset.y);
      }}
      onPanEnd={onRelease}
    >
      {glyph(ch)}
    </motion.span>
  );
}
