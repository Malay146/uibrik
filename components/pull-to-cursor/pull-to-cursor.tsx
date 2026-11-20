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

// 12 — Letters lean toward the pointer, so spacing tightens where it hovers
// and opens again as it moves on. Pressing Change sweeps it across.
const AWAY = -9999;

export function PullToCursor({
  play,
  text = "Drawn together",
  strength = 0.18,
  radius = 110,
  sweepDuration = 0.9,
}: EffectProps & {
  text?: string;
  /** How far letters lean toward the pointer, as a share of the distance. */
  strength?: number;
  /** Reach of the pull in px. */
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
      className={cn(TEXT, "relative flex cursor-default")}
      onPointerMove={(e) => pointer.set(e.clientX - e.currentTarget.getBoundingClientRect().left)}
      onPointerLeave={() => pointer.set(AWAY)}
    >
      {Array.from(text).map((ch, i) => (
        <MagnetLetter key={i} ch={ch} pointer={pointer} strength={strength} radius={radius} />
      ))}
    </p>
  );
}

// offsetLeft ignores transforms, so the rest position is read straight from
// layout while the letter itself is displaced.
function MagnetLetter({
  ch,
  pointer,
  strength,
  radius,
}: {
  ch: string;
  pointer: MotionValue<number>;
  strength: number;
  radius: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const target = useTransform(pointer, (p) => {
    const el = ref.current;
    if (!el) return 0;
    const d = p - (el.offsetLeft + el.offsetWidth / 2);
    return d * strength * Math.max(0, 1 - Math.abs(d) / radius);
  });
  const x = useSpring(target, { stiffness: 300, damping: 30 });

  return (
    <motion.span ref={ref} aria-hidden className="inline-block" style={{ x }}>
      {glyph(ch)}
    </motion.span>
  );
}
