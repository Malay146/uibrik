"use client";

// One family of loading indicators. Every variant is drawn on the same 24-unit
// grid with the same stroke, inherits the text colour and runs at the same
// tempo, so a ring in a button and dots in a chat bubble look like they belong
// together. With reduced motion they run at half speed: still moving, so the
// wait stays visible, but calmer.

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type SpinnerVariant = "ring" | "radial" | "dots" | "bars" | "orbit";

export type SpinnerProps = {
  variant?: SpinnerVariant;
  /** Width and height in px. */
  size?: number;
  /** Stroke width on the 24-unit grid; scales with size. */
  thickness?: number;
  /** Multiplies the tempo; 2 is twice as fast. */
  speed?: number;
  /** Read out to screen readers. */
  label?: string;
  className?: string;
};

const BEAT = 0.9; // seconds per cycle at speed 1

export function Spinner({ variant = "ring", size = 20, thickness = 2, speed = 1, label = "Loading", className }: SpinnerProps) {
  const reduce = useReducedMotion();
  const d = (BEAT / Math.max(0.1, speed)) * (reduce ? 2 : 1);
  const loop = { repeat: Infinity, ease: "linear" as const };
  // Rotations turn about the centre of the 24-unit box.
  const spin = { transformOrigin: "12px 12px", transformBox: "view-box" as const };

  return (
    <span role="status" aria-label={label} className={cn("inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={thickness} strokeLinecap="round" aria-hidden>
        {variant === "ring" && (
          <>
            <circle cx={12} cy={12} r={9} opacity={0.18} />
            <motion.path d="M12 3a9 9 0 0 1 9 9" style={spin} animate={{ rotate: 360 }} transition={{ ...loop, duration: d }} />
          </>
        )}

        {variant === "radial" &&
          // Eight spokes; each fades a beat after the one before, so the bright one walks round.
          Array.from({ length: 8 }, (_, i) => (
            <motion.line
              key={i}
              x1={12}
              y1={3.5}
              x2={12}
              y2={7.5}
              style={{ ...spin, rotate: i * 45 }}
              initial={{ opacity: 0.15 }}
              animate={{ opacity: [1, 0.15] }}
              transition={{ ...loop, duration: d, delay: (i / 8) * d, ease: "easeOut" }}
            />
          ))}

        {variant === "dots" &&
          [5, 12, 19].map((cx, i) => (
            <motion.circle
              key={cx}
              cx={cx}
              cy={12}
              r={thickness * 1.1}
              fill="currentColor"
              stroke="none"
              style={{ transformOrigin: `${cx}px 12px`, transformBox: "view-box" }}
              animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1, 0.8] }}
              transition={{ ...loop, duration: d * 1.2, delay: i * d * 0.18, ease: "easeInOut" }}
            />
          ))}

        {variant === "bars" &&
          [7, 12, 17].map((x, i) => (
            <motion.line
              key={x}
              x1={x}
              y1={6}
              x2={x}
              y2={18}
              style={{ transformOrigin: `${x}px 12px`, transformBox: "view-box" }}
              animate={{ scaleY: [0.35, 1, 0.35] }}
              transition={{ ...loop, duration: d * 1.1, delay: i * d * 0.16, ease: "easeInOut" }}
            />
          ))}

        {variant === "orbit" && (
          <>
            <circle cx={12} cy={12} r={8} opacity={0.18} />
            <motion.g style={spin} animate={{ rotate: 360 }} transition={{ ...loop, duration: d * 1.2 }}>
              <circle cx={12} cy={4} r={thickness * 1.25} fill="currentColor" stroke="none" />
            </motion.g>
          </>
        )}
      </svg>
    </span>
  );
}
