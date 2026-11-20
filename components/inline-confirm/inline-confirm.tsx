"use client";

import { IconTrash } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

// Widths ride a critically damped spring: it keeps its velocity when the prompt
// is reversed mid-way, so backing out never stutters, and it settles without
// overshoot.
const MORPH = { type: "spring", duration: 0.45, bounce: 0 } as const;
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const SIZES = {
  sm: { height: 32, padX: 11, font: 13, icon: 14 },
  md: { height: 40, padX: 14, font: 14, icon: 16 },
  lg: { height: 48, padX: 17, font: 15, icon: 18 },
} as const;

// A second click inside this window is the tail of a double-click, not a
// decision, so it can't confirm.
const ARM_DELAY = 350;

export type InlineConfirmProps = {
  label?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Colour of the destructive action. */
  color?: string;
  /** Corner radius in px. */
  radius?: number;
  /** Seconds before an unanswered prompt backs out on its own. 0 to wait forever. */
  timeout?: number;
  size?: keyof typeof SIZES;
  /** Show the trash icon beside the label. */
  icon?: boolean;
  /** Which side Cancel grows out on. */
  cancelSide?: "start" | "end";
  /** Called when the action is confirmed. */
  onConfirm?: () => void;
  className?: string;
};

export function InlineConfirm({
  label = "Delete",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  color = "#dc2626",
  radius = 12,
  timeout = 4,
  size = "md",
  icon = true,
  cancelSide = "start",
  onConfirm,
  className,
}: InlineConfirmProps) {
  const [asking, setAsking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openedAt = useRef(0);
  const [mainMeasure, { width: mainWidth }] = useMeasure();
  const [cancelMeasure, { width: cancelWidth }] = useMeasure();

  const close = () => {
    // Focus inside Cancel would be stranded once it collapses.
    if (rootRef.current?.contains(document.activeElement)) mainRef.current?.focus();
    setAsking(false);
  };

  useEffect(() => {
    if (!asking) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setAsking(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    const timer = timeout > 0 ? setTimeout(() => setAsking(false), timeout * 1000) : undefined;
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      clearTimeout(timer);
    };
  }, [asking, timeout]);

  const press = (e: MouseEvent) => {
    if (!asking) {
      openedAt.current = performance.now();
      setAsking(true);
      // From the keyboard (no pointer, so detail is 0), Cancel takes focus, so
      // a second Enter backs out rather than destroys.
      if (e.detail === 0) requestAnimationFrame(() => cancelRef.current?.focus());
      return;
    }
    if (performance.now() - openedAt.current < ARM_DELAY) return;
    close();
    onConfirm?.();
  };

  const current = asking ? confirmLabel : label;
  const sz = SIZES[size];
  const atEnd = cancelSide === "end";

  return (
    <div
      ref={rootRef}
      style={{ "--c": color } as CSSProperties}
      className={cn("inline-flex items-center", atEnd && "flex-row-reverse", className)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && asking) close();
      }}
    >
      {/* Cancel grows out from behind the button, so the pair reads as the
          button making room rather than a new control replacing it. */}
      <motion.div
        aria-hidden={!asking}
        inert={!asking}
        initial={false}
        animate={{ width: asking ? cancelWidth : 0 }}
        transition={MORPH}
        className="overflow-hidden"
      >
        <div ref={cancelMeasure} className={cn("w-max", atEnd ? "pl-1.5" : "pr-1.5")}>
          <motion.button
            ref={cancelRef}
            type="button"
            onClick={close}
            initial={false}
            // Slides out from behind the button, whichever side it's on.
            animate={asking ? { opacity: 1, x: 0, filter: "blur(0px)" } : { opacity: 0, x: atEnd ? -12 : 12, filter: "blur(2px)" }}
            transition={{ duration: asking ? 0.3 : 0.15, ease: EASE_OUT, delay: asking ? 0.05 : 0 }}
            whileTap={{ scale: 0.97 }}
            style={{ height: sz.height, paddingInline: sz.padX, fontSize: sz.font, borderRadius: radius }}
            className="flex cursor-pointer items-center whitespace-nowrap bg-muted font-medium tracking-tight text-foreground outline-none transition-colors duration-150 hover:bg-neutral-200/70 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:hover:bg-neutral-800"
          >
            {cancelLabel}
          </motion.button>
        </div>
      </motion.div>

      {/* One button throughout: its tint fills to solid, its label rolls over,
          and its width eases to the new label. */}
      <motion.button
        ref={mainRef}
        type="button"
        onClick={press}
        initial={false}
        animate={{ width: mainWidth || "auto" }}
        transition={MORPH}
        whileTap={{ scale: 0.97 }}
        style={{ height: sz.height, fontSize: sz.font, borderRadius: radius }}
        className={cn(
          "relative shrink-0 cursor-pointer overflow-hidden font-medium tracking-tight outline-none transition-[background-color,color] duration-300 ease-out focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          asking
            ? "bg-(--c) text-white hover:bg-[color-mix(in_srgb,var(--c)_88%,white)]"
            : // On dark the text is lifted toward white and the tint thickened,
              // or a saturated red goes muddy.
              "bg-[color-mix(in_srgb,var(--c)_10%,transparent)] text-(--c) hover:bg-[color-mix(in_srgb,var(--c)_15%,transparent)] dark:bg-[color-mix(in_srgb,var(--c)_18%,transparent)] dark:text-[color-mix(in_srgb,var(--c)_60%,white)] dark:hover:bg-[color-mix(in_srgb,var(--c)_24%,transparent)]",
        )}
      >
        <span
          ref={mainMeasure}
          className="flex h-full w-max items-center gap-1.5"
          style={{ paddingLeft: icon ? sz.padX - 2 : sz.padX, paddingRight: sz.padX }}
        >
          {icon && <IconTrash size={sz.icon} stroke={2} className="shrink-0" />}
          <span className="relative overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={current}
                initial={{ y: "100%", opacity: 0, filter: "blur(2px)" }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={{ y: "-100%", opacity: 0, filter: "blur(2px)" }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="block whitespace-nowrap"
              >
                {current}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>
      </motion.button>
      <span aria-live="polite" className="sr-only">
        {asking ? `${confirmLabel} or ${cancelLabel}?` : ""}
      </span>
    </div>
  );
}
