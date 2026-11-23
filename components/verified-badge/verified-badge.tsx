"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type VerifiedVariant = "blue" | "gold" | "grey";

const VARIANTS: Record<VerifiedVariant, { color: string; label: string }> = {
  blue: { color: "#1d9bf0", label: "Verified account" },
  gold: { color: "#d9a20b", label: "Verified organisation" },
  grey: { color: "#7d8d9a", label: "Official account" },
};

export type VerifiedBadgeProps = {
  /** Blue for people, gold for organisations, grey for officials. */
  variant?: VerifiedVariant;
  /** Overrides the variant's colour. */
  color?: string;
  /** Diameter in px. */
  size?: number;
  /** Scallops around the seal. */
  lobes?: number;
  /** Tooltip and accessible name. Defaults to the variant's label. */
  label?: string;
  /** Second line in the tooltip, e.g. since when. */
  detail?: string;
  /** Draw the seal in when it first scrolls into view. */
  animate?: boolean;
  className?: string;
};

// A scalloped seal on a 24 × 24 grid: a circle whose radius ripples once per lobe.
const sealPath = (lobes: number) => {
  const pts: string[] = [];
  const steps = lobes * 12;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const r = 10.4 + 1.25 * Math.cos(lobes * (a + Math.PI / 2));
    pts.push(`${(12 + r * Math.cos(a)).toFixed(3)} ${(12 + r * Math.sin(a)).toFixed(3)}`);
  }
  return `M${pts.join("L")}Z`;
};

/**
 * A verified seal for names and handles. It stamps in with a turn when it first
 * comes into view, the check draws itself, and a shine passes over once.
 * Hovering turns it by one scallop and names what the badge means.
 */
export function VerifiedBadge({
  variant = "blue",
  color,
  size = 20,
  lobes = 10,
  label,
  detail,
  animate = true,
  className,
}: VerifiedBadgeProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [tip, setTip] = useState(false);
  const [turns, setTurns] = useState(0);
  const clip = useId();
  const fill = color ?? VARIANTS[variant].color;
  const text = label ?? VARIANTS[variant].label;
  const play = animate && !reduce;
  const on = !play || inView;
  const seal = sealPath(lobes);

  return (
    <span
      ref={ref}
      tabIndex={0}
      role="img"
      aria-label={detail ? `${text}. ${detail}` : text}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        setTip(true);
        setTurns((t) => t + 1);
      }}
      onPointerLeave={() => setTip(false)}
      onClick={() => {
        // Touch has no hover: a tap shows the tooltip.
        setTip((v) => !v);
        setTurns((t) => t + 1);
      }}
      onFocus={() => setTip(true)}
      onBlur={() => setTip(false)}
      onKeyDown={(e) => e.key === "Escape" && setTip(false)}
      className={cn(
        "relative inline-flex shrink-0 cursor-default align-[-0.2em] rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <motion.svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        aria-hidden
        initial={play ? { scale: 0.3, rotate: -80, opacity: 0 } : false}
        animate={on ? { scale: 1, rotate: turns * (360 / lobes), opacity: 1 } : undefined}
        transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.6, bounce: 0.35, opacity: { duration: 0.15 } }}
      >
        <defs>
          <clipPath id={clip}>
            <path d={seal} />
          </clipPath>
        </defs>
        <path d={seal} fill={fill} />
        {/* One pass of light across the seal. */}
        {play && (
          <g clipPath={`url(#${clip})`}>
            <motion.rect
              y={-6}
              width={7}
              height={36}
              fill="white"
              fillOpacity={0.45}
              transform="rotate(25 12 12)"
              initial={{ x: -14 }}
              animate={on ? { x: 32 } : undefined}
              transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.45 }}
            />
          </g>
        )}
      </motion.svg>
      {/* The check stays upright while the seal turns. */}
      <svg viewBox="0 0 24 24" width={size} height={size} className="absolute inset-0" aria-hidden>
        <motion.path
          d="M7.6 12.4l3 3 5.8-6.2"
          fill="none"
          stroke="white"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={play ? { pathLength: 0, opacity: 0 } : false}
          animate={on ? { pathLength: 1, opacity: 1 } : undefined}
          transition={{ pathLength: { duration: 0.35, ease: EASE_OUT, delay: 0.25 }, opacity: { duration: 0.01, delay: 0.25 } }}
        />
      </svg>
      <AnimatePresence>
        {tip && (
          <motion.span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 flex flex-col items-center whitespace-nowrap rounded-xl bg-neutral-900 px-3 py-1.5 text-center text-xs tracking-tight text-white dark:bg-white dark:text-neutral-900"
            // Centred with Motion's x, not a translate class, and no blur: Safari
            // left a sliver of the tooltip painted after it faded out.
            initial={{ opacity: 0, x: "-50%", y: 4 }}
            animate={{ opacity: 1, x: "-50%", y: 0 }}
            exit={{ opacity: 0, x: "-50%", y: 2, transition: { duration: 0.1 } }}
            transition={{ duration: reduce ? 0 : 0.18, ease: EASE_OUT }}
          >
            <span className="flex items-center gap-1.5 font-medium">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: fill }} />
              {text}
            </span>
            {detail && <span className="text-white/60 dark:text-neutral-500">{detail}</span>}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
