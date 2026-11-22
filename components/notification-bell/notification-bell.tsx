"use client";

import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const SIZES = {
  sm: { box: 32, icon: 18 },
  md: { box: 40, icon: 20 },
  lg: { box: 48, icon: 22 },
} as const;

const VARIANTS = {
  soft: "bg-neutral-100 hover:bg-neutral-200/70 dark:bg-neutral-900 dark:hover:bg-neutral-800",
  ghost: "bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-900",
} as const;

const RING = {
  rest: { pathLength: 0, opacity: 0, x: 0 },
  ring: (side: number) => ({
    pathLength: [0, 1, 1],
    opacity: [0, 1, 0],
    x: [side * -1, 0, side * 1.6],
    transition: { duration: 0.6, times: [0, 0.4, 1], ease: "easeOut" as const },
  }),
};

export type NotificationBellProps = {
  /** Controlled unread count. */
  count?: number;
  /** Unread count on mount when uncontrolled. */
  defaultCount?: number;
  onCountChange?: (count: number) => void;
  /** Mark everything read when pressed. Turn off to open your own panel from onClick. */
  clearOnClick?: boolean;
  onClick?: () => void;
  /** Counts above this show as "max+". */
  max?: number;
  /** Badge colour. */
  color?: string;
  /** A dot instead of a number. */
  dot?: boolean;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  className?: string;
};

export function NotificationBell({
  count: countProp,
  defaultCount = 3,
  onCountChange,
  clearOnClick = true,
  onClick,
  max = 99,
  color = "#dc2626",
  dot = false,
  variant = "soft",
  size = "md",
  className,
}: NotificationBellProps) {
  const reduce = useReducedMotion();
  const [inner, setInner] = useState(defaultCount);
  const count = countProp ?? inner;
  const bell = useAnimationControls();
  const clapper = useAnimationControls();
  const body = useAnimationControls();
  const waves = useAnimationControls();
  const badge = useAnimationControls();
  const prev = useRef(count);
  const s = SIZES[size];

  useEffect(() => {
    const was = prev.current;
    prev.current = count;
    if (reduce || count === was) return;
    if (count > was) {
      // Rings: a damped swing from the hanger, the clapper a beat behind, sound
      // arcs on both sides, and the badge hops as its number rolls.
      bell.start({ rotate: [0, 14, -10, 6, -3, 0], y: 0, transition: { duration: 0.65, ease: "easeInOut" } });
      clapper.start({ x: [0, -2, 1.6, -1, 0.4, 0], transition: { duration: 0.65, ease: "easeInOut", delay: 0.04 } });
      waves.start("ring");
      if (was > 0) badge.start({ y: [0, -3, 0], transition: { duration: 0.35, ease: EASE_OUT } });
    } else if (count === 0) {
      // Cleared: the badge drops into the bell, which nods and glows as it takes it in.
      bell.start({ rotate: 0, y: [0, 1.4, 0], transition: { duration: 0.32, ease: EASE_OUT, delay: 0.16 } });
      body.start({ fillOpacity: [0.16, 0.5, 0.16], transition: { duration: 0.55, times: [0, 0.35, 1], ease: "easeOut", delay: 0.14 } });
    }
  }, [count, reduce, bell, clapper, body, waves, badge]);

  const press = () => {
    onClick?.();
    if (!clearOnClick || count === 0) return;
    if (countProp === undefined) setInner(0);
    onCountChange?.(0);
  };

  const unread = count > 0;
  const shown = Math.min(count, max);

  return (
    <motion.button
      type="button"
      onClick={press}
      aria-label={unread ? `Notifications, ${count} unread` : "Notifications"}
      whileTap={{ scale: 0.94 }}
      style={{ width: s.box, height: s.box }}
      className={cn(
        "relative flex cursor-pointer items-center justify-center rounded-full text-neutral-900 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:text-neutral-100",
        VARIANTS[variant],
        className,
      )}
    >
      <svg viewBox="0 0 24 24" width={s.icon} height={s.icon} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="overflow-visible">
        {/* Sound arcs that draw out and drift away from the bell on each side. */}
        <motion.path d="M4.6 3.6 a9 9 0 0 0 -2 4.6" custom={-1} variants={RING} initial="rest" animate={waves} />
        <motion.path d="M19.4 3.6 a9 9 0 0 1 2 4.6" custom={1} variants={RING} initial="rest" animate={waves} />
        <motion.g animate={bell} style={{ originX: "12px", originY: "3px", transformBox: "view-box" }}>
          <motion.path
            d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6z"
            fill="currentColor"
            initial={{ fillOpacity: 0.16 }}
            animate={body}
          />
          <motion.path animate={clapper} d="M9 17v1a3 3 0 0 0 6 0v-1" />
        </motion.g>
      </svg>
      <AnimatePresence initial={false}>
        {unread && (
          <motion.span
            key="badge"
            aria-hidden
            className="absolute"
            style={{ top: dot ? s.box * 0.2 : -2, right: dot ? s.box * 0.22 : -4 }}
            initial={{ opacity: 0, scale: 0.4, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.3, y: s.box * 0.3, x: -s.box * 0.26 }}
            transition={{ duration: reduce ? 0 : 0.3, ease: EASE_OUT }}
          >
          <motion.span
            animate={badge}
            className={cn(
              "flex items-center justify-center rounded-full font-medium leading-none text-white tabular-nums",
              dot ? "size-2.5" : "h-[18px] min-w-[18px] px-[5px] text-[11px]",
            )}
            style={{ backgroundColor: color }}
          >
            {!dot && <NumberFlow value={shown} suffix={count > max ? "+" : ""} animated={!reduce} />}
          </motion.span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
