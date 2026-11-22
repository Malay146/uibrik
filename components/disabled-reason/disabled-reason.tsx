"use client";

import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const SIZES = {
  sm: { height: 32, padX: 12, font: 13 },
  md: { height: 40, padX: 16, font: 14 },
  lg: { height: 48, padX: 20, font: 15 },
} as const;

export type DisabledReasonProps = {
  children?: ReactNode;
  /** Blocks the action; pressing explains why instead of doing nothing. */
  disabled?: boolean;
  /** Why the button is blocked, shown above it on press. */
  reason?: string;
  /** Id of the field to fix: it takes focus and flashes a ring when the blocked button is pressed. */
  targetId?: string;
  /** Seconds the reason stays up. */
  showFor?: number;
  /** Where the reason appears. */
  side?: "top" | "bottom";
  size?: keyof typeof SIZES;
  /** Corner radius in px. */
  radius?: number;
  onClick?: () => void;
  /** Called when the blocked button is pressed. */
  onBlocked?: () => void;
  type?: "button" | "submit";
  className?: string;
};

export function DisabledReason({
  children = "Continue",
  disabled = true,
  reason = "Add your email first",
  targetId,
  showFor = 2.4,
  side = "top",
  size = "md",
  radius = 12,
  onClick,
  onBlocked,
  type = "button",
  className,
}: DisabledReasonProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState(0);
  const shake = useAnimationControls();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tipId = useId();
  const s = SIZES[size];

  useEffect(() => () => clearTimeout(timer.current), []);
  // Once it's allowed, there's nothing left to explain.
  const showing = open && disabled;

  const press = () => {
    if (!disabled) return onClick?.();
    onBlocked?.();
    setOpen(true);
    setRun((r) => r + 1);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), showFor * 1000);
    if (!reduce) shake.start({ x: [0, -6, 5, -3, 1.5, 0], transition: { duration: 0.38, ease: "easeOut" } });
    const field = targetId ? document.getElementById(targetId) : null;
    if (field) {
      field.focus({ preventScroll: true });
      // A ring that pulses out once, pointing at what needs fixing.
      field.animate(
        [{ boxShadow: "0 0 0 0px rgb(220 38 38 / 0.45)" }, { boxShadow: "0 0 0 4px rgb(220 38 38 / 0.25)" }, { boxShadow: "0 0 0 6px rgb(220 38 38 / 0)" }],
        { duration: reduce ? 0 : 700, easing: "ease-out" },
      );
    }
  };

  return (
    <span className={cn("relative inline-flex", className)}>
      <AnimatePresence>
        {showing && (
          <motion.span
            key={run}
            id={tipId}
            role="status"
            initial={{ opacity: 0, y: side === "top" ? 4 : -4, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: side === "top" ? 2 : -2, filter: "blur(2px)", transition: { duration: 0.15 } }}
            transition={{ duration: reduce ? 0 : 0.22, ease: EASE_OUT }}
            className={cn(
              "pointer-events-none absolute right-0 z-10 w-max max-w-[240px] rounded-[10px] bg-neutral-900 px-2.5 py-1.5 text-[13px] font-medium leading-snug tracking-tight text-white dark:bg-white dark:text-neutral-900",
              side === "top" ? "bottom-full mb-2" : "top-full mt-2",
            )}
          >
            {reason}
          </motion.span>
        )}
      </AnimatePresence>
      <motion.button
        type={disabled ? "button" : type}
        aria-disabled={disabled}
        aria-describedby={showing ? tipId : undefined}
        onClick={press}
        animate={shake}
        whileTap={disabled ? undefined : { scale: 0.97 }}
        style={{ height: s.height, paddingInline: s.padX, fontSize: s.font, borderRadius: radius }}
        className={cn(
          "cursor-pointer whitespace-nowrap font-medium tracking-tight outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          disabled
            ? "cursor-not-allowed bg-neutral-100 text-neutral-400 dark:bg-neutral-900 dark:text-neutral-600"
            : "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200",
        )}
      >
        {children}
      </motion.button>
    </span>
  );
}
