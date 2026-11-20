"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { useState, type ReactNode } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

// Each look has a resting shade and an open one a step stronger, so the open
// button stands out from its neighbours.
const VARIANTS = {
  soft: { rest: "bg-neutral-100 dark:bg-neutral-900", open: "bg-neutral-200/70 dark:bg-neutral-800" },
  ghost: { rest: "bg-transparent", open: "bg-muted" },
  outline: {
    rest: "bg-background shadow-[inset_0_0_0_1px_var(--border)]",
    open: "bg-muted shadow-[inset_0_0_0_1px_var(--border)]",
  },
} as const;

/**
 * How the label appears as the button opens.
 * - blur: comes into focus as it slides in
 * - slide: slides in from behind the icon
 * - fade: fades in place
 */
export type LabelReveal = "blur" | "slide" | "fade";

const REVEALS: Record<LabelReveal, { hidden: Record<string, number | string>; shown: Record<string, number | string> }> = {
  blur: { hidden: { opacity: 0, x: -4, filter: "blur(3px)" }, shown: { opacity: 1, x: 0, filter: "blur(0px)" } },
  slide: { hidden: { opacity: 0, x: -10 }, shown: { opacity: 1, x: 0 } },
  fade: { hidden: { opacity: 0 }, shown: { opacity: 1 } },
};

export type ExpandButtonProps = Omit<HTMLMotionProps<"button">, "children" | "style"> & {
  icon: ReactNode;
  /** Revealed on hover or keyboard focus. Also the button's accessible name. */
  label: string;
  /** Height, and resting width, in px. */
  size?: number;
  /** Corner radius in px. */
  radius?: number;
  /** Keep the label showing, e.g. for the active item in a toolbar. */
  expanded?: boolean;
  variant?: keyof typeof VARIANTS;
  /** How the label appears as the button opens. */
  reveal?: LabelReveal;
};

export function ExpandButton({
  icon,
  label,
  size = 40,
  radius = 12,
  expanded = false,
  variant = "soft",
  reveal = "blur",
  className,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ...rest
}: ExpandButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [labelRef, { width: labelWidth }] = useMeasure();
  const open = expanded || hovered || focused;
  // The label tucks in under the icon's padding so the pair reads as one unit.
  const tuck = Math.round(size * 0.15);

  return (
    <motion.button
      type="button"
      aria-label={label}
      {...rest}
      onMouseEnter={(e) => {
        setHovered(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        onMouseLeave?.(e);
      }}
      // Keyboard focus opens it; a mouse click focusing it shouldn't keep it
      // open after the pointer has left.
      onFocus={(e) => {
        setFocused(e.currentTarget.matches(":focus-visible"));
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      initial={false}
      animate={{ width: open ? size - tuck + labelWidth : size }}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      style={{ height: size, borderRadius: radius }}
      className={cn(
        // A faint tint at rest so it never reads as a bare icon on the page; the
        // open state steps one shade further so the active button stands out.
        "relative flex shrink-0 cursor-pointer items-center overflow-hidden font-medium tracking-tight outline-none transition-[background-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-neutral-400",
        open ? cn(VARIANTS[variant].open, "text-neutral-900 dark:text-white") : cn(VARIANTS[variant].rest, "text-neutral-600 dark:text-neutral-400"),
        className,
      )}
    >
      <span className="flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
        {icon}
      </span>
      {/* Measured even while clipped, so the width can open straight to it. */}
      <motion.span
        ref={labelRef}
        aria-hidden
        initial={false}
        animate={open ? REVEALS[reveal].shown : REVEALS[reveal].hidden}
        transition={{ duration: open ? 0.3 : 0.15, ease: EASE_OUT, delay: open ? 0.05 : 0 }}
        className="shrink-0 whitespace-nowrap pr-3.5 text-sm"
        style={{ marginLeft: -tuck }}
      >
        {label}
      </motion.span>
    </motion.button>
  );
}
