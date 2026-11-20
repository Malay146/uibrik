"use client";

import { cn } from "@/lib/utils";
import { animate } from "motion/react";
import { useEffect, useId, useRef } from "react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

// 14 — The curve is plucked like a string: it snaps to a deep arc, swings
// through flat to the other side, and rings down to its resting bend (a
// damped cosine). Letters fade in along it from left to right as it moves.

const curve = (bend: number) => `M 0 40 Q 140 ${40 - bend * 2} 280 40`;

export function PluckedCurve({
  play,
  text = "carried along a gentle curve",
  rest: PATH_REST = 10,
  pluck: PATH_PLUCK = 26,
  duration: PATH_DURATION = 1.4,
}: EffectProps & {
  text?: string;
  /** Bend of the curve at rest. */
  rest?: number;
  /** Extra bend when plucked. */
  pluck?: number;
  /** Seconds for the string to ring down. */
  duration?: number;
}) {
  const id = `curve-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const pathRef = useRef<SVGPathElement>(null);
  const lettersRef = useRef<(SVGTSpanElement | null)[]>([]);
  const letters = Array.from(text);

  useEffect(() => {
    if (!play) return;
    const controls = animate(0, PATH_DURATION, {
      duration: PATH_DURATION,
      ease: "linear",
      onUpdate: (t) => {
        const ring = Math.exp(-3.5 * t) * Math.cos(11 * t);
        pathRef.current?.setAttribute("d", curve(PATH_REST + PATH_PLUCK * ring));
        lettersRef.current.forEach((el, i) => {
          const shown = Math.min(1, Math.max(0, (t - i * 0.02) / 0.25));
          el?.setAttribute("fill-opacity", String(shown));
        });
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  return (
    // 280 × 56 at 20px type; the drawing scales with it
    <svg
      role="img"
      aria-label={text}
      viewBox="0 0 280 56"
      style={{ width: "14em", height: "2.8em" }}
      className={cn(SIZE, "overflow-visible text-zinc-700 dark:text-zinc-200")}
    >
      <path ref={pathRef} id={id} d={curve(PATH_REST)} fill="none" />
      <text fontSize="20" fontWeight="500" fill="currentColor" textAnchor="middle" className="font-sans">
        <textPath href={`#${id}`} startOffset="50%">
          {letters.map((ch, i) => (
            <tspan
              key={i}
              ref={(el) => {
                lettersRef.current[i] = el;
              }}
            >
              {ch}
            </tspan>
          ))}
        </textPath>
      </text>
    </svg>
  );
}
