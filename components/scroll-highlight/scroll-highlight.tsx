"use client";

import { cn } from "@/lib/utils";
import { animate, motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef } from "react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

const TEXT = `${SIZE} text-zinc-700 font-medium dark:text-zinc-200`;

// Two mask layers: the vertical fade covers the text column only, and a
// solid strip the width of .scrollbar-soft's gutter keeps the scrollbar
// fully visible along the right edge.
const SCROLLBAR_GUTTER = 12;
const SCROLL_MASK = [
  `linear-gradient(transparent, black 25%, black 75%, transparent) left / calc(100% - ${SCROLLBAR_GUTTER}px) 100% no-repeat`,
  `linear-gradient(black, black) right / ${SCROLLBAR_GUTTER}px 100% no-repeat`,
].join(", ");

// 13 — Reading, scrubbed by scroll: each word lights up as the paragraph
// scrolls past it. Pressing Change scrolls through once.
export function ScrollHighlight({
  play,
  text = "Scroll slowly. Each word waits in the dark until you reach it, then steps into the light.",
  scrollDuration = 1.6,
  dim = 0.2,
}: EffectProps & {
  text?: string;
  /** Seconds the replay takes to scroll through. */
  scrollDuration?: number;
  /** Opacity of words not yet reached. */
  dim?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: containerRef });
  const words = text.split(" ");

  useEffect(() => {
    const el = containerRef.current;
    if (!play || !el) return;
    const controls = animate(0, el.scrollHeight - el.clientHeight, {
      duration: scrollDuration,
      ease: "easeInOut",
      onUpdate: (v) => {
        el.scrollTop = v;
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  return (
    // 112 × 288 at 20px type; the box scales with it
    <div
      ref={containerRef}
      className={cn(SIZE, "scrollbar-soft h-[5.6em] w-[14.4em] overflow-y-auto")}
      style={{ mask: SCROLL_MASK, WebkitMask: SCROLL_MASK }}
    >
      <p className={cn(TEXT, "flex flex-wrap gap-x-[0.28em] py-[2.4em] leading-[1.6em]")}>
        {words.map((word, i) => (
          <ScrollWord
            key={i}
            word={word}
            progress={scrollYProgress}
            range={[i / words.length, (i + 1) / words.length]}
            dim={dim}
          />
        ))}
      </p>
    </div>
  );
}

function ScrollWord({
  word,
  progress,
  range,
  dim,
}: {
  word: string;
  progress: MotionValue<number>;
  range: [number, number];
  dim: number;
}) {
  const opacity = useTransform(progress, range, [dim, 1]);
  return <motion.span style={{ opacity }}>{word}</motion.span>;
}
