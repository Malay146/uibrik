"use client";

import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const SIZES = {
  sm: { height: 32, padX: 12, font: 13, chevron: 15, toggle: 30 },
  md: { height: 40, padX: 16, font: 14, chevron: 17, toggle: 38 },
  lg: { height: 48, padX: 20, font: 15, chevron: 19, toggle: 46 },
} as const;

// One neutral ramp per theme. Solid inverts against the page (near-black on
// light, near-white on dark) and steps one shade toward the page on hover;
// soft and outline stay quiet for secondary actions. `divider` is the seam
// between the two segments, `open` holds the chevron in its hover shade while
// its menu is open.
const VARIANTS = {
  solid: {
    segment:
      "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white dark:focus-visible:ring-neutral-500",
    main: "",
    toggle: "border-l border-white/15 dark:border-neutral-900/15",
    open: "bg-neutral-800 dark:bg-white",
  },
  soft: {
    segment: "bg-muted text-foreground hover:bg-neutral-200/70 dark:hover:bg-neutral-800",
    main: "",
    toggle: "border-l border-black/8 dark:border-white/8",
    open: "bg-neutral-200/70 dark:bg-neutral-800",
  },
  outline: {
    // Drawn as an inset shadow, not a border, so it never eats into the
    // measured label width.
    segment: "bg-background text-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-muted",
    main: "",
    // Tucked 1px under the main segment so the two outlines share one seam line.
    toggle: "-ml-px",
    open: "bg-muted",
  },
} as const;

export type SplitButtonProps = {
  /** The actions the main button can run. The chosen one becomes its label. */
  options?: string[];
  /** Index of the option chosen at first. */
  defaultIndex?: number;
  /** Corner radius in px. */
  radius?: number;
  /** Delay between menu items as they unfold, in seconds. */
  stagger?: number;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Which edge of the button the menu lines up with. */
  align?: "start" | "end";
  /** Open the menu below the button, or above it (e.g. in a footer). */
  side?: "bottom" | "top";
  /** Called with the chosen option when the main button is pressed. */
  onAction?: (option: string, index: number) => void;
  /** Called when a different option is chosen from the menu. */
  onSelect?: (option: string, index: number) => void;
  className?: string;
};

export function SplitButton({
  options = ["Merge pull request", "Squash and merge", "Rebase and merge"],
  defaultIndex = 0,
  radius = 12,
  stagger = 0.03,
  variant = "solid",
  size = "md",
  align = "end",
  side = "bottom",
  onAction,
  onSelect,
  className,
}: SplitButtonProps) {
  const [index, setIndex] = useState(defaultIndex);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  // The main segment eases to each new label's width instead of snapping.
  const [labelRef, { width }] = useMeasure();

  const safeIndex = Math.min(index, Math.max(options.length - 1, 0));
  const current = options[safeIndex] ?? "";

  useEffect(() => {
    if (!open) return;
    // Focus lands on the chosen item, so Enter right away keeps the choice.
    itemRefs.current[safeIndex]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, safeIndex]);

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  const choose = (i: number) => {
    if (i !== safeIndex) onSelect?.(options[i], i);
    setIndex(i);
    close();
  };

  const onMenuKeyDown = (e: KeyboardEvent) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") focus(at + 1);
    else if (e.key === "ArrowUp") focus(at - 1);
    else if (e.key === "Home") focus(0);
    else if (e.key === "End") focus(items.length - 1);
    else if (e.key === "Escape" || e.key === "Tab") close();
    else return;
    e.preventDefault();
  };

  const v = VARIANTS[variant];
  const sz = SIZES[size];
  const segment = cn(
    "relative flex cursor-pointer items-center outline-none transition-colors duration-150 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    v.segment,
  );
  // The menu grows from the corner it hangs off, and items drift in from the button.
  const up = side === "top";
  const from = up ? 4 : -4;

  return (
    <div ref={rootRef} className={cn("relative inline-flex font-medium tracking-tight", className)} style={{ fontSize: sz.font }}>
      <motion.button
        type="button"
        onClick={() => onAction?.(current, safeIndex)}
        whileTap={{ scale: 0.98 }}
        animate={{ width: width || "auto" }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        style={{ height: sz.height, borderRadius: `${radius}px 0 0 ${radius}px` }}
        className={cn(segment, v.main, "overflow-hidden")}
      >
        <span
          ref={labelRef}
          className="relative block w-max overflow-hidden whitespace-nowrap"
          style={{ paddingLeft: sz.padX, paddingRight: sz.padX - 2 }}
        >
          {/* The new choice rolls up into place as the old one leaves. */}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={current}
              initial={{ y: "100%", opacity: 0, filter: "blur(2px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={{ y: "-100%", opacity: 0, filter: "blur(2px)" }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="block"
            >
              {current}
            </motion.span>
          </AnimatePresence>
        </span>
      </motion.button>

      <motion.button
        ref={toggleRef}
        type="button"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        whileTap={{ scale: 0.94 }}
        style={{ height: sz.height, width: sz.toggle, borderRadius: `0 ${radius}px ${radius}px 0` }}
        className={cn(
          segment,
          "justify-center",
          v.toggle,
          // Held in its hover shade while the menu it controls is open.
          open && v.open,
        )}
      >
        {/* Points toward where the menu opens, and flips once it's open. */}
        <motion.span
          animate={{ rotate: (open ? 180 : 0) + (up ? 180 : 0) }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
          className="flex"
        >
          <IconChevronDown size={sz.chevron} stroke={2} />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label="Choose action"
            onKeyDown={onMenuKeyDown}
            initial={{ opacity: 0, y: from, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: from, scale: 0.97, transition: { duration: 0.15 } }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            style={{ borderRadius: radius + 4, transformOrigin: `${up ? "bottom" : "top"} ${align === "end" ? "right" : "left"}` }}
            className={cn(
              "absolute z-20 flex min-w-full w-max flex-col",
              up ? "bottom-full mb-2" : "top-full mt-2",
              align === "end" ? "right-0" : "left-0",
              "border border-neutral-200 bg-white p-1 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.18),0_2px_6px_-2px_rgb(0_0_0/0.06)] dark:border-white/10 dark:bg-neutral-900 dark:shadow-[0_12px_32px_-12px_rgb(0_0_0/0.8)]",
            )}
          >
            {options.map((option, i) => (
              <motion.button
                key={option}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={i === safeIndex}
                tabIndex={-1}
                onClick={() => choose(i)}
                initial={{ opacity: 0, y: from }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: EASE_OUT, delay: 0.04 + i * stagger }}
                style={{ borderRadius: radius }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-6 px-3 py-2 text-left outline-none transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:bg-neutral-100 focus-visible:text-neutral-900 dark:hover:bg-white/[0.06] dark:hover:text-white dark:focus-visible:bg-white/[0.06] dark:focus-visible:text-white",
                  // The current choice is full strength; the rest step back.
                  i === safeIndex ? "text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400",
                )}
              >
                {option}
                <IconCheck
                  size={15}
                  stroke={2.25}
                  className={cn("transition-opacity duration-150", i === safeIndex ? "opacity-100" : "opacity-0")}
                />
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
