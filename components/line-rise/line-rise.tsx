"use client";

import { layoutWithLines, prepareWithSegments } from "@chenglou/pretext";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

const TEXT = `${SIZE} text-zinc-700 font-medium dark:text-zinc-200`;

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// 04 — A paragraph rises line by line from behind a clip. Pretext breaks the
// lines exactly as the browser would, so each line gets its own mask.
// Width and line height scale with the type: 260px and 28px at 20px text.
const MASK_WIDTH_EM = 13;
const MASK_LINE_EM = 1.4;

export function LineRise({
  play,
  text = "Good interfaces reveal themselves one line at a time.",
  duration = 0.45,
  stagger = 0.08,
}: EffectProps & {
  text?: string;
  /** Seconds each line takes to rise. */
  duration?: number;
  /** Seconds between lines. */
  stagger?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<string[]>([text]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    const style = getComputedStyle(root);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    document.fonts.load(font).then(() => {
      if (cancelled) return;
      const size = parseFloat(style.fontSize) || 20;
      const prepared = prepareWithSegments(text, font);
      setLines(layoutWithLines(prepared, MASK_WIDTH_EM * size, MASK_LINE_EM * size).lines.map((l) => l.text));
    });
    return () => {
      cancelled = true;
    };
  }, [text]);

  return (
    <div ref={rootRef} aria-label={text} className={TEXT} style={{ width: `${MASK_WIDTH_EM}em`, lineHeight: `${MASK_LINE_EM}em` }}>
      {lines.map((line, i) => (
        <span key={`${play}-${i}`} aria-hidden className="block overflow-hidden">
          <motion.span
            className="block whitespace-pre"
            initial={play ? { y: "100%" } : false}
            animate={{ y: 0 }}
            transition={{ duration, delay: i * stagger, ease: EASE_OUT }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </div>
  );
}
