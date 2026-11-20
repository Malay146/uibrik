"use client";

import { cn } from "@/lib/utils";
import { animate, motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef } from "react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

const TEXT = `${SIZE} text-zinc-700 font-medium dark:text-zinc-200`;

const glyph = (ch: string) => (ch === " " ? " " : ch);

// 01 — Letters near the pointer grow bolder and settle back once it moves
// on. Pressing Change sweeps a virtual pointer across the line.
const AWAY = -9999;

export function HoverWeight({
  play,
  text = "Move closer",
  minWeight = 400,
  maxWeight = 700,
  radius = 60,
  sweepDuration = 0.9,
}: EffectProps & {
  text?: string;
  /** Weight away from the pointer. */
  minWeight?: number;
  /** Weight right under the pointer. */
  maxWeight?: number;
  /** Reach of the pointer in px. */
  radius?: number;
  /** Seconds for the replay sweep across the line. */
  sweepDuration?: number;
}) {
  const pointer = useMotionValue(AWAY);
  const rootRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const width = rootRef.current?.offsetWidth ?? 0;
    if (!play || !width) return;
    const controls = animate(pointer, [0, width], {
      duration: sweepDuration,
      ease: "easeInOut",
      onComplete: () => pointer.set(AWAY),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, pointer]);

  return (
    <p
      ref={rootRef}
      aria-label={text}
      className={cn(TEXT, "relative cursor-default")}
      onPointerMove={(e) => pointer.set(e.clientX - e.currentTarget.getBoundingClientRect().left)}
      onPointerLeave={() => pointer.set(AWAY)}
    >
      {Array.from(text).map((ch, i) => (
        <GravityLetter key={i} ch={ch} pointer={pointer} minWeight={minWeight} maxWeight={maxWeight} radius={radius} />
      ))}
    </p>
  );
}

// offsetLeft ignores the weight change of neighbours mid-frame closely
// enough, and it is read from layout so no transform feeds back into it.
function GravityLetter({
  ch,
  pointer,
  minWeight,
  maxWeight,
  radius,
}: {
  ch: string;
  pointer: MotionValue<number>;
  minWeight: number;
  maxWeight: number;
  radius: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const target = useTransform(pointer, (p) => {
    const el = ref.current;
    if (!el) return minWeight;
    const d = Math.abs(p - (el.offsetLeft + el.offsetWidth / 2));
    return minWeight + (maxWeight - minWeight) * Math.max(0, 1 - d / radius);
  });
  const weight = useSpring(target, { stiffness: 300, damping: 30 });

  return (
    <motion.span ref={ref} aria-hidden style={{ fontWeight: weight }}>
      {glyph(ch)}
    </motion.span>
  );
}
