"use client";

import NumberFlow from "@number-flow/react";
import { IconMinus, IconPlus, IconTrash } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const SIZES = {
  sm: { height: 32, padX: 12, font: 13, icon: 14, count: 20 },
  md: { height: 40, padX: 15, font: 14, icon: 16, count: 24 },
  lg: { height: 48, padX: 18, font: 15, icon: 18, count: 28 },
} as const;

// `pill` is the shape's own look; `press` is the hover wash on the buttons
// inside it, which has to read against that look.
const VARIANTS = {
  solid: {
    pill: "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900",
    press: "hover:bg-white/10 focus-visible:bg-white/15 dark:hover:bg-black/5 dark:focus-visible:bg-black/10",
  },
  soft: {
    pill: "bg-muted text-foreground",
    press: "hover:bg-black/5 focus-visible:bg-black/8 dark:hover:bg-white/8 dark:focus-visible:bg-white/10",
  },
  outline: {
    pill: "bg-background text-foreground shadow-[inset_0_0_0_1px_var(--border)]",
    press: "hover:bg-black/4 focus-visible:bg-black/6 dark:hover:bg-white/6 dark:focus-visible:bg-white/8",
  },
} as const;

export type StepperButtonProps = {
  label?: string;
  /** Starting quantity. 0 shows the add button. */
  defaultValue?: number;
  /** Highest quantity allowed. */
  max?: number;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** At a quantity of one, show a trash icon in place of minus, since the next tap removes it. */
  trashAtOne?: boolean;
  /** Corner radius in px. */
  radius?: number;
  /** Called with the new quantity after each change. */
  onChange?: (quantity: number) => void;
  className?: string;
};

export function StepperButton({
  label = "Add to cart",
  defaultValue = 0,
  max = 9,
  variant = "solid",
  size = "md",
  trashAtOne = true,
  radius = 12,
  onChange,
  className,
}: StepperButtonProps) {
  const [qty, setQty] = useState(defaultValue);
  // The pill eases between the add label and the stepper instead of snapping.
  const [ref, { width }] = useMeasure();
  const addRef = useRef<HTMLButtonElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const changed = useRef(false);
  const adding = qty === 0;

  // The button under the cursor disappears when the pill changes shape, so
  // focus follows to its counterpart instead of dropping to the page.
  useEffect(() => {
    if (!changed.current) return;
    (adding ? addRef : plusRef).current?.focus();
  }, [adding]);

  const set = (next: number) => {
    changed.current = true;
    const clamped = Math.max(0, Math.min(max, next));
    setQty(clamped);
    onChange?.(clamped);
  };

  const v = VARIANTS[variant];
  const sz = SIZES[size];
  const trash = trashAtOne && qty === 1;
  const icon = cn(
    "flex shrink-0 cursor-pointer items-center justify-center outline-none transition-colors duration-150 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent",
    v.press,
  );

  return (
    <motion.div
      animate={{ width: width || "auto" }}
      transition={{ duration: 0.35, ease: EASE_OUT }}
      style={{ height: sz.height, fontSize: sz.font, borderRadius: radius }}
      className={cn(
        "relative overflow-hidden font-medium tracking-tight has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-neutral-400 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
        v.pill,
        className,
      )}
    >
      <div ref={ref} className="w-max">
        <AnimatePresence mode="popLayout" initial={false}>
          {adding ? (
            <motion.button
              key="add"
              ref={addRef}
              type="button"
              onClick={() => set(1)}
              initial={{ opacity: 0, filter: "blur(3px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(3px)" }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              style={{ height: sz.height, paddingLeft: sz.padX - 2, paddingRight: sz.padX }}
              className={cn("flex cursor-pointer items-center gap-1.5 whitespace-nowrap outline-none transition-colors duration-150", v.press)}
            >
              <IconPlus size={sz.icon} stroke={2.25} />
              {label}
            </motion.button>
          ) : (
            <motion.div
              key="stepper"
              role="group"
              aria-label="Quantity"
              initial={{ opacity: 0, filter: "blur(3px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(3px)" }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="flex h-full items-center"
            >
              <button
                type="button"
                aria-label={qty === 1 ? "Remove" : "Decrease"}
                onClick={() => set(qty - 1)}
                style={{ width: sz.height, height: sz.height }}
                className={icon}
              >
                {/* At one, the next tap removes it, so the icon says so. */}
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={trash ? "trash" : "minus"}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                    className="flex"
                  >
                    {trash ? <IconTrash size={sz.icon} stroke={2} /> : <IconMinus size={sz.icon} stroke={2.25} />}
                  </motion.span>
                </AnimatePresence>
              </button>
              <NumberFlow value={qty} aria-live="polite" className="text-center tabular-nums" style={{ width: sz.count }} />
              <button
                ref={plusRef}
                type="button"
                aria-label="Increase"
                onClick={() => set(qty + 1)}
                disabled={qty >= max}
                style={{ width: sz.height, height: sz.height }}
                className={icon}
              >
                <IconPlus size={sz.icon} stroke={2.25} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
